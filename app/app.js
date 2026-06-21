/* ════════════════════════════════════════════════════════════════
   TackT — Workout Log
   Phone-first PWA · Supabase sync · offline-tolerant
   ════════════════════════════════════════════════════════════════ */

const SB = window.supabase.createClient(WO_CONFIG.url, WO_CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "groove-auth" },
});
window.SB = SB; // exposed for pro.js (entitlement / paywall framework)

const $ = (id) => document.getElementById(id);
const el = (sel, root = document) => root.querySelector(sel);

let USER = null;
let STATE = { logs: [], exercises: [] }; // logs: rows, exercises: dict rows
let DICT = {}; // abbr -> {name, category}
let calCursor = null; // Date for the visible calendar month
let calMode = "month";
let yearCursor = new Date().getFullYear();
let DEMO = false, REAL_STATE = null;
function demoToast() { toast("Demo mode is on — turn it off in Settings to make changes.", true); }

/* ───────── preferences (device-level) ───────── */
const PREFS_KEY = "groove_prefs";
let PREFS = { theme: "dark", showQuote: true, setMode: "tap", textReps: false, autoRest: false, restSound: true, restVibrate: true };
function loadPrefs() { try { PREFS = { ...PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY)) || {}) }; } catch (e) {} }
function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS)); }
function applyPrefs() {
  document.body.classList.toggle("light", PREFS.theme === "light");
  const qc = $("quote-card"); if (qc) qc.classList.toggle("hidden", !PREFS.showQuote);
  document.querySelectorAll("#set-theme .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === PREFS.theme));
  const sw = $("set-quote"); if (sw) { sw.classList.toggle("on", PREFS.showQuote); sw.setAttribute("aria-checked", PREFS.showQuote); }
  const ts = $("set-tapsets"); if (ts) { const on = PREFS.setMode === "tap"; ts.classList.toggle("on", on); ts.setAttribute("aria-checked", on); }
  const tr = $("set-textreps"); if (tr) { tr.classList.toggle("on", PREFS.textReps); tr.setAttribute("aria-checked", PREFS.textReps); }
  const ar = $("set-autorest"); if (ar) { ar.classList.toggle("on", PREFS.autoRest); ar.setAttribute("aria-checked", PREFS.autoRest); }
  const rsd = $("rest-sound"); if (rsd) rsd.classList.toggle("off", !PREFS.restSound);
  const rvb = $("rest-vibe"); if (rvb) rvb.classList.toggle("off", !PREFS.restVibrate);
}

/* ───────── date helpers (local, no UTC drift) ───────── */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function prettyDate(s) {
  const d = parseYmd(s), t = todayStr();
  if (s === t) return "Today";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (s === ymd(y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/* ════════════════════════════════════════════════════════════════
   SHORTHAND PARSER
   "BPx20x4, Cx15, SQTx30x|||, 10 min run, REST"
   ════════════════════════════════════════════════════════════════ */
function parseSets(s) {
  if (!s) return 1;
  if (/^[|lI]+$/.test(s)) return s.length; // tally marks
  const n = parseInt(s, 10);
  return isNaN(n) || n < 1 ? 1 : n;
}
function parseToken(tok) {
  const raw = tok.trim();
  if (!raw) return null;
  // abbr x reps [x sets] [@weight]   e.g. BPx20x4 · BP x 20 x |||| · BPx10x3@135
  let m = raw.match(/^([a-zA-Z][a-zA-Z\-]*)\s*[x×*]\s*(\d+)\s*(?:[x×*]\s*(\d+|[|lI]+))?\s*(?:@\s*(\d+(?:\.\d+)?))?$/);
  if (m) return { kind: "set", abbr: m[1].toUpperCase(), reps: +m[2], sets: parseSets(m[3]), weight: m[4] ? +m[4] : null, raw };
  // reps abbr [x sets] [@weight]     e.g. 100Cx|||| · 100C
  m = raw.match(/^(\d+)\s*([a-zA-Z][a-zA-Z\-]*)\s*(?:[x×*]\s*(\d+|[|lI]+))?\s*(?:@\s*(\d+(?:\.\d+)?))?$/);
  if (m) return { kind: "set", abbr: m[2].toUpperCase(), reps: +m[1], sets: parseSets(m[3]), weight: m[4] ? +m[4] : null, raw };
  // otherwise: a note (REST, 10 min run, OFF, etc.)
  return { kind: "note", note: raw, raw };
}
function parseLine(text) {
  return text.split(/[,\n]+/).map(parseToken).filter(Boolean);
}

/* ════════════════════════════════════════════════════════════════
   STARTER DICTIONARY (seeded once, per account)
   ════════════════════════════════════════════════════════════════ */
// [abbr, name, category, kind]  kind: strength | cardio | activity
// Lean, welcoming starter set (panel-tuned): covers push / pull / squat / core /
// cardio + recovery, ordered easiest-first so the first row feels doable. Everything
// else is a 2-tap "+ Add" away. Only seeded for brand-new accounts.
const SEED = [
  ["WALK", "Walk", "cardio", "cardio"],
  ["PU", "Push-ups", "chest", "strength"],
  ["SQT", "Squats", "legs", "strength"],
  ["ROW", "Row", "back", "strength"],
  ["PLANK", "Plank", "core", "strength"],
  ["STRETCH", "Stretching", "other", "activity"],
  ["RUN", "Run", "cardio", "cardio"],
  ["BP", "Bench Press", "chest", "strength"],
];
const CATS = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio", "other"];
const KINDS = [["strength", "Strength (reps×sets×lbs)"], ["cardio", "Cardio (distance + time)"], ["activity", "Activity (time only)"]];

/* ════════════════════════════════════════════════════════════════
   LOCAL CACHE + OFFLINE QUEUE
   ════════════════════════════════════════════════════════════════ */
const cacheKey = () => `wo_cache_${USER?.id}`;
const pendKey = () => `wo_pending_${USER?.id}`;
function saveCache() { if (DEMO) return; try { localStorage.setItem(cacheKey(), JSON.stringify(STATE)); } catch (e) {} }
function loadCache() { try { return JSON.parse(localStorage.getItem(cacheKey())); } catch (e) { return null; } }
function getPending() { try { return JSON.parse(localStorage.getItem(pendKey())) || []; } catch (e) { return []; } }
function setPending(p) { localStorage.setItem(pendKey(), JSON.stringify(p)); }
function queue(op) { const p = getPending(); p.push(op); setPending(p); setSync("pending"); }

function setSync(s) {
  const dot = $("sync-dot");
  dot.className = "sync-dot" + (s === "pending" ? " pending" : s === "off" ? " off" : "");
  dot.title = s === "pending" ? "Changes pending sync" : s === "off" ? "Offline" : "Synced";
}

async function flushPending() {
  let p = getPending();
  if (!p.length) return;
  const still = [];
  for (const op of p) {
    try {
      if (op.t === "insLog") { await insertLogRows([op.row]); }
      else if (op.t === "delLog") { const { error } = await SB.from("wo_logs").delete().eq("id", op.id); if (error) throw error; }
      else if (op.t === "insEx") { const { error } = await SB.from("wo_exercises").insert(op.row); if (error) throw error; }
      else if (op.t === "updEx") { const { error } = await SB.from("wo_exercises").update(op.fields).eq("id", op.id); if (error) throw error; }
      else if (op.t === "delEx") { const { error } = await SB.from("wo_exercises").delete().eq("id", op.id); if (error) throw error; }
    } catch (e) { still.push(op); }
  }
  setPending(still);
  setSync(still.length ? "pending" : "ok");
}

/* ════════════════════════════════════════════════════════════════
   AUTH
   ════════════════════════════════════════════════════════════════ */
function showAuthError(msg) { const e = $("auth-error"); e.textContent = msg; e.classList.remove("hidden"); }

async function signIn() {
  const email = $("email").value.trim(), password = $("password").value;
  if (!email || !password) return showAuthError("Enter email and password.");
  $("btn-signin").textContent = "Signing in…";
  const { error } = await SB.auth.signInWithPassword({ email, password });
  $("btn-signin").textContent = "Sign In";
  if (error) return showAuthError(error.message);
}
async function signUp() {
  const email = $("email").value.trim(), password = $("password").value;
  if (!email || !password) return showAuthError("Enter email and password.");
  if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
  $("btn-signup").textContent = "Creating…";
  const { data, error } = await SB.auth.signUp({ email, password });
  $("btn-signup").textContent = "Create Account";
  if (error) return showAuthError(error.message);
  if (data?.user && !data.session) showAuthError("Account made — check your email to confirm, then Sign In.");
}
async function signOut() { await SB.auth.signOut(); location.reload(); }

/* ════════════════════════════════════════════════════════════════
   DATA LOAD
   ════════════════════════════════════════════════════════════════ */
async function loadData() {
  const cached = loadCache();
  if (cached) { STATE = cached; rebuildDict(); renderAll(); } // instant from cache

  try {
    const [ex, lg] = await Promise.all([
      SB.from("wo_exercises").select("*"),
      SB.from("wo_logs").select("*").order("date", { ascending: false }),
    ]);
    if (ex.error || lg.error) throw ex.error || lg.error;

    STATE.exercises = ex.data;
    STATE.logs = lg.data;
    rebuildDict();

    if (!STATE.exercises.length) await seedDict();

    saveCache();
    renderAll();
    setSync(getPending().length ? "pending" : "ok");
    await flushPending();
  } catch (e) {
    setSync("off"); // offline — run on cache
  }
}
function rebuildDict() {
  DICT = {};
  for (const e of STATE.exercises) DICT[e.abbr] = { name: e.name, category: e.category, kind: e.kind || "strength" };
}
async function seedDict() {
  const rows = SEED.map(([abbr, name, category, kind], i) => ({
    id: crypto.randomUUID(), user_id: USER.id, abbr, name, category, kind, sort_order: i * 10,
  }));
  STATE.exercises = rows; rebuildDict(); saveCache();
  try { const { error } = await SB.from("wo_exercises").insert(rows); if (error) throw error; }
  catch (e) { rows.forEach((row) => queue({ t: "insEx", row })); }
}

/* ════════════════════════════════════════════════════════════════
   WRITES
   ════════════════════════════════════════════════════════════════ */
async function commitLogs(date, items) {
  if (DEMO) return demoToast();
  const rows = items.map((it) => ({
    id: crypto.randomUUID(), user_id: USER.id, date,
    abbr: it.kind === "set" ? it.abbr : null,
    exercise: it.kind === "set" ? (DICT[it.abbr]?.name || it.abbr) : null,
    reps: it.kind === "set" ? (it.reps || 0) : 0,
    sets: it.kind === "set" ? (it.sets || 0) : 0,
    weight: it.weight ?? null,
    distance: it.distance ?? null,
    duration: it.duration ?? null,
    note: it.note || null,
    raw: it.raw,
  }));
  STATE.logs = [...rows, ...STATE.logs];
  saveCache(); renderAll();
  try { await insertLogRows(rows); }
  catch (e) { rows.forEach((row) => queue({ t: "insLog", row })); }
}
// Insert that tolerates a DB where weight/distance/duration columns don't exist yet
async function insertLogRows(rows) {
  let { error } = await SB.from("wo_logs").insert(rows);
  if (error && /weight|distance|duration|schema cache|does not exist/i.test(error.message || "")) {
    const stripped = rows.map(({ weight, distance, duration, ...r }) => r);
    ({ error } = await SB.from("wo_logs").insert(stripped));
  }
  if (error) throw error;
}
async function upsertExercise(abbr, name, category, kind = "strength") {
  if (DEMO) return demoToast();
  const row = { id: crypto.randomUUID(), user_id: USER.id, abbr, name, category, kind };
  STATE.exercises.push(row); rebuildDict(); saveCache();
  try { const { error } = await SB.from("wo_exercises").insert(row); if (error) throw error; }
  catch (e) { queue({ t: "insEx", row }); }
}
async function deleteLog(id) {
  if (DEMO) return demoToast();
  STATE.logs = STATE.logs.filter((l) => l.id !== id);
  saveCache(); renderAll();
  try { const { error } = await SB.from("wo_logs").delete().eq("id", id); if (error) throw error; }
  catch (e) { queue({ t: "delLog", id }); }
}

/* ════════════════════════════════════════════════════════════════
   PREVIEW / CONFIRM FLOW
   ════════════════════════════════════════════════════════════════ */
let pendingPreview = null; // {date, items}

function openPreview(date, text) {
  openPreviewItems(date, parseLine(text));
}
function openPreviewItems(date, items) {
  if (!items.length) return toast("Nothing to log — type something first.", true);
  pendingPreview = { date, items };
  $("preview-date").textContent = prettyDate(date) + " · " + date;

  const list = $("preview-list");
  list.innerHTML = "";
  items.forEach((it, i) => {
    const box = document.createElement("div");
    box.className = "pv-item";
    if (it.kind === "note") {
      box.innerHTML = `<div class="pv-note"><span>note:</span> ${escapeHtml(it.note)}</div>`;
    } else if (DICT[it.abbr]) {
      let detail;
      if (!it.reps && (it.duration || it.distance)) {
        detail = [it.distance ? `${it.distance} mi` : "", it.duration ? fmtDur(it.duration) : ""].filter(Boolean).join(" · ");
      } else if (!it.reps && it.note) {
        detail = `${escapeHtml(it.note)}${it.sets > 1 ? ` × ${it.sets}` : ""}${it.weight ? ` @ ${it.weight} lbs` : ""}`;
      } else {
        detail = `${it.reps} × ${it.sets} = ${it.reps * it.sets} reps${it.weight ? ` @ ${it.weight} lbs` : ""}`;
      }
      box.innerHTML = `<div class="pv-known"><span class="pv-name">${escapeHtml(DICT[it.abbr].name)}</span>
        <span class="pv-calc">${detail}</span></div>`;
    } else {
      box.className = "pv-item pv-new";
      box.innerHTML = `
        <span class="pv-new-tag">NEW · ${escapeHtml(it.abbr)}</span>
        <div class="pv-calc" style="color:var(--mut);font-size:13px">${it.reps} × ${it.sets} reps — name it so TackT remembers:</div>
        <label>Exercise name</label>
        <input class="pv-name-in" data-i="${i}" placeholder="e.g. Bench Press" value="${guessName(it.abbr)}" />
        <label>Muscle group</label>
        <select class="pv-cat-in" data-i="${i}">${CATS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>`;
    }
    list.appendChild(box);
  });
  openSheet("preview");
}

async function confirmPreview() {
  if (!pendingPreview) return;
  const { date, items } = pendingPreview;
  // resolve any new exercises first
  const nameIns = document.querySelectorAll(".pv-name-in");
  for (const inp of nameIns) {
    const i = +inp.dataset.i, it = items[i];
    const name = inp.value.trim() || it.abbr;
    const cat = el(`.pv-cat-in[data-i="${i}"]`).value;
    if (!DICT[it.abbr]) await upsertExercise(it.abbr, name, cat);
  }
  const before = (pointsEngine()[date] || {}).total || 0;
  const prevPR = computePRs();
  await commitLogs(date, items);
  const day = pointsEngine()[date] || { total: 0, parts: [] };
  closeSheet("preview");
  clearGridInputs(); $("day-input").value = "";
  pendingPreview = null;
  showReward(day.total - before, day.parts, date, newPRsFrom(items, prevPR));
}

function guessName(abbr) {
  return abbr.charAt(0) + abbr.slice(1).toLowerCase();
}

/* ════════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════════ */
function logsByDate(date) { return STATE.logs.filter((l) => l.date === date); }
function fmtDur(mins) {
  if (!mins) return "";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
function moveLabel(l) {
  const nm = l.exercise || l.abbr;
  // pure note (no exercise attached)
  if (l.note && !l.abbr) return l.note;
  // cardio / activity (no reps, has time and/or distance)
  if (l.abbr && !l.reps && (l.duration || l.distance)) {
    const bits = [];
    if (l.distance) bits.push(`${l.distance} mi`);
    if (l.duration) bits.push(fmtDur(l.duration));
    return `${nm} ${bits.join(" · ")}`;
  }
  // text reps (e.g. AMRAP / 8-12) stored in note
  if (l.abbr && !l.reps && l.note) {
    let s = `${nm} ${l.note}`;
    if (l.sets > 1) s += ` × ${l.sets}`;
    if (l.weight) s += ` @${l.weight}`;
    return s;
  }
  let s = l.sets > 1 ? `${nm} ${l.reps}×${l.sets}` : `${nm} ${l.reps}`;
  if (l.weight) s += ` @${l.weight}`;
  return s;
}

function renderAll() { renderLog(); renderCalendar(); if (calMode === "year") renderYear(); renderStats(); }

function renderLog() {
  const st = computeStats();
  renderQuote(st);
  renderHero(st);
  renderGrid();

  // recent
  const dates = [...new Set(STATE.logs.map((l) => l.date))].sort().reverse().slice(0, 6);
  const box = $("recent-list");
  if (!dates.length) { box.innerHTML = `<div class="recent-empty">No workouts yet. Log your first one above 💪</div>`; return; }
  box.innerHTML = dates.map((d) => {
    const moves = logsByDate(d).map(moveLabel).join(" · ");
    return `<div class="recent-day" data-day="${d}">
      <div class="recent-date">${prettyDate(d)}</div>
      <div class="recent-moves">${escapeHtml(moves)}</div></div>`;
  }).join("");
  box.querySelectorAll(".recent-day").forEach((n) => n.onclick = () => openDay(n.dataset.day));
}

/* ════════════════════════════════════════════════════════════════
   POINTS ENGINE — auto-derived from real logs (mirrors progress.py:
   lifetime never resets + monthly resettable dopamine layer)
   ════════════════════════════════════════════════════════════════ */
const MONTHLY_GOAL = 400;
const RANKS = [[0, "Warming Up"], [100, "Finding the Groove"], [250, "In the Groove"], [450, "Locked In"], [700, "Relentless"]];
function rankFor(m) { let r = RANKS[0][1]; for (const [t, n] of RANKS) if (m >= t) r = n; return r; }
function monthName() { return new Date().toLocaleDateString(undefined, { month: "short" }); }
function weekKey(ds) { const d = parseYmd(ds); d.setDate(d.getDate() - d.getDay()); return ymd(d); }

function pointsEngine() {
  const dates = [...new Set(STATE.logs.map((l) => l.date))].sort();
  const dateSet = new Set(dates);
  const firstSeen = {};
  for (const l of [...STATE.logs].sort((a, b) => (a.date + (a.created_at || "")) < (b.date + (b.created_at || "")) ? -1 : 1))
    if (l.abbr && !(l.abbr in firstSeen)) firstSeen[l.abbr] = l.date;

  const weekCount = {}, bestScore = {}; let prevDay = null; const res = {};
  for (const date of dates) {
    const dayLogs = logsByDate(date);
    const hasSet = dayLogs.some((l) => l.abbr);
    const notesOnly = !hasSet && dayLogs.some((l) => l.note);
    const vol = dayLogs.reduce((s, l) => s + (l.reps || 0) * (l.sets || 0), 0);
    const exCount = new Set(dayLogs.filter((l) => l.abbr).map((l) => l.abbr)).size;
    const parts = [];
    const base = hasSet ? 20 : (notesOnly ? 5 : 0);
    if (base) parts.push([hasSet ? "Showed up" : "Logged activity", base]);
    const exB = Math.min(exCount * 3, 15); if (exB) parts.push([`${exCount} exercise${exCount > 1 ? "s" : ""}`, exB]);
    const volB = Math.min(Math.floor(vol / 50), 10); if (volB) parts.push([`${vol} reps volume`, volB]);
    const dayDur = dayLogs.reduce((s, l) => s + (l.duration || 0), 0);
    const dayDist = dayLogs.reduce((s, l) => s + (l.distance || 0), 0);
    const cardioB = Math.min(Math.floor(dayDur / 10) + Math.floor(dayDist * 2), 10);
    if (cardioB) parts.push([[dayDist ? `${dayDist} mi` : "", dayDur ? `${dayDur} min` : ""].filter(Boolean).join(" · ") || "cardio", cardioB]);
    const newCount = new Set(dayLogs.filter((l) => l.abbr && firstSeen[l.abbr] === date).map((l) => l.abbr)).size;
    const newB = newCount * 5; if (newB) parts.push([`${newCount} new move${newCount > 1 ? "s" : ""}`, newB]);
    let comeback = 0;
    if (prevDay) { const gap = (parseYmd(date) - parseYmd(prevDay)) / 86400000; if (gap >= 3) { comeback = 15; parts.push(["Comeback", 15]); } }
    // personal-record bonus (beating your prior best on a lift; first-ever doesn't count)
    const dayPR = new Set();
    for (const l of dayLogs) {
      if (!l.abbr || !l.reps || (DICT[l.abbr]?.kind || "strength") !== "strength") continue;
      const sc = l.weight > 0 ? e1rm(l.weight, l.reps) : l.reps;
      const prev = bestScore[l.abbr];
      if (sc > (prev ?? -1)) { if (prev !== undefined) dayPR.add(l.abbr); bestScore[l.abbr] = sc; }
    }
    const prB = dayPR.size * 8; if (prB) parts.push([`${dayPR.size} PR${dayPR.size > 1 ? "s" : ""} 🏆`, prB]);
    const subtotal = base + exB + volB + cardioB + newB + comeback + prB;
    let streak = 0, dd = parseYmd(date); while (dateSet.has(ymd(dd))) { streak++; dd.setDate(dd.getDate() - 1); }
    let mult = 1; if (streak >= 30) mult = 2; else if (streak >= 14) mult = 1.75; else if (streak >= 7) mult = 1.5; else if (streak >= 3) mult = 1.2;
    let total = Math.round(subtotal * mult);
    if (mult > 1) parts.push([`${streak}-day streak`, "×" + mult]);
    if (hasSet) { const wk = weekKey(date); weekCount[wk] = (weekCount[wk] || 0) + 1; if (weekCount[wk] === 3) { total += 30; parts.push(["3× this week", 30]); } }
    res[date] = { total, parts, mult, streak };
    if (hasSet || notesOnly) prevDay = date;
  }
  return res;
}
function pointsAgg() {
  const map = pointsEngine();
  const mPrefix = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
  let lifetime = 0, month = 0; const byMonth = {};
  for (const d in map) { const v = map[d].total; lifetime += v; const mk = d.slice(0, 7); byMonth[mk] = (byMonth[mk] || 0) + v; if (d.startsWith(mPrefix)) month += v; }
  return { lifetime, month, today: (map[todayStr()] || {}).total || 0, bestMonth: Math.max(0, ...Object.values(byMonth)), map };
}

function renderHero(st) {
  const p = pointsAgg();
  $("h-month").textContent = p.month;
  $("h-monthname").textContent = monthName() + " pts";
  $("h-life").textContent = p.lifetime.toLocaleString();
  $("h-today").textContent = p.today;
  $("h-streak").textContent = st.streak;
  $("h-rank").textContent = rankFor(p.month);
  $("h-goal").textContent = `Goal: ${p.month} / ${MONTHLY_GOAL} this month`;
  $("ring-prog").style.strokeDashoffset = 263.9 * (1 - Math.min(p.month / MONTHLY_GOAL, 1));
}

/* ════════════════════════════════════════════════════════════════
   EXERCISE GRID (primary logger) + MANAGE MODE
   ════════════════════════════════════════════════════════════════ */
let manageMode = false;
function exUsage() { const u = {}; for (const l of STATE.logs) if (l.abbr) u[l.abbr] = (u[l.abbr] || 0) + 1; return u; }

/* in-progress entry buffer — survives re-renders (reorder/manage) AND app restarts */
function draftKey() { return `wo_draft_${USER?.id}`; }
function readDraft() { try { return JSON.parse(localStorage.getItem(draftKey())) || {}; } catch (e) { return {}; } }
function writeDraft(d) { try { localStorage.setItem(draftKey(), JSON.stringify(d)); } catch (e) {} }
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }
function saveRowDraft(row) {
  if (DEMO) return;
  const d = readDraft(), g = (s) => row.querySelector(s)?.value || "";
  const tap = row.querySelector(".set-tap");
  const e = { reps: g(".ex-reps"), sets: g(".ex-sets"), wt: g(".ex-wt"), dist: g(".ex-dist"), hr: g(".ex-hr"), min: g(".ex-min"), tap: tap ? +tap.dataset.count : 0 };
  if (!e.reps && !e.sets && !e.wt && !e.dist && !e.hr && !e.min && !e.tap) delete d[row.dataset.abbr];
  else d[row.dataset.abbr] = e;
  writeDraft(d);
}
function restoreDraftToGrid() {
  const d = readDraft();
  document.querySelectorAll("#ex-grid .ex-row").forEach((row) => {
    const v = d[row.dataset.abbr]; if (!v) return;
    const set = (s, val) => { const el = row.querySelector(s); if (el && val) el.value = val; };
    set(".ex-reps", v.reps); set(".ex-sets", v.sets); set(".ex-wt", v.wt);
    set(".ex-dist", v.dist); set(".ex-hr", v.hr); set(".ex-min", v.min);
    const tap = row.querySelector(".set-tap"); if (tap && v.tap) { tap.dataset.count = v.tap; renderSetMarks(tap); }
    markFilled(row);
  });
}
function kindOf(e) { return e.kind || "strength"; }
function numBox(cls, label, mode) {
  // type=text + inputmode + pattern is the canonical recipe that forces the
  // phone number pad (esp. on iOS) instead of the full keyboard.
  const pat = mode === "numeric" ? ` pattern="[0-9]*"` : mode === "decimal" ? ` pattern="[0-9]*[.,]?[0-9]*"` : "";
  return `<label class="numbox"><span class="nb-l">${label}</span><input type="text" class="ex-num ${cls}" inputmode="${mode}"${pat} placeholder="" /></label>`;
}
function setControl() {
  if (PREFS.setMode === "tap")
    return `<div class="numbox"><span class="nb-l">sets</span><button type="button" class="set-tap" data-count="0"><span class="set-marks"></span><span class="set-clear">✕</span></button></div>`;
  return numBox("ex-sets", "sets", "numeric");
}
function rowInputs(kind) {
  if (kind === "cardio") return numBox("ex-dist", "mi", "decimal") + numBox("ex-hr", "hr", "numeric") + numBox("ex-min", "min", "numeric");
  if (kind === "activity") return numBox("ex-hr", "hr", "numeric") + numBox("ex-min", "min", "numeric");
  return numBox("ex-reps", "reps", PREFS.textReps ? "text" : "numeric") + `<span class="ex-x">×</span>` + setControl() + numBox("ex-wt", "lbs", "decimal");
}
function renderSetMarks(btn) {
  const n = +btn.dataset.count;
  btn.querySelector(".set-marks").textContent = n === 0 ? "" : (n <= 3 ? "|".repeat(n) : n + "×");
  btn.classList.toggle("has", n > 0);
}
function markFilled(row) {
  const any = [...row.querySelectorAll(".ex-num")].some((x) => x.value) || (+(row.querySelector(".set-tap")?.dataset.count || 0) > 0);
  row.classList.toggle("filled", any);
}
function sortedExercises() {
  const u = exUsage();
  const hasOrder = STATE.exercises.some((e) => e.sort_order != null);
  return [...STATE.exercises].sort((a, b) => {
    if (hasOrder) { const ao = a.sort_order ?? 1e9, bo = b.sort_order ?? 1e9; if (ao !== bo) return ao - bo; }
    else { const d = (u[b.abbr] || 0) - (u[a.abbr] || 0); if (d) return d; }
    return (a.name || "").localeCompare(b.name || "");
  });
}
function moveExercise(id, dir) {
  if (DEMO) return demoToast();
  const list = sortedExercises();
  const i = list.findIndex((e) => e.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  list.forEach((e, idx) => (e.sort_order = idx));   // normalize to current order
  const t = list[i].sort_order; list[i].sort_order = list[j].sort_order; list[j].sort_order = t;
  saveCache(); renderGrid();
  persistOrder(list);
}
async function persistOrder(list) {
  const rows = list.map((e) => ({ id: e.id, user_id: USER.id, abbr: e.abbr, name: e.name, category: e.category, kind: e.kind || "strength", sort_order: e.sort_order }));
  try { const { error } = await SB.from("wo_exercises").upsert(rows); if (error) throw error; }
  catch (e) { /* sort_order column may not exist yet — order persists locally via cache */ }
}
function renderGrid() {
  const grid = $("ex-grid");
  const list = window.TPL_FILTER ? sortedExercises().filter((e) => window.TPL_FILTER.has(e.abbr)) : sortedExercises();
  if (!list.length) { grid.innerHTML = `<div class="day-empty">No moves yet — tap “Manage moves” to add yours.</div>`; return; }
  const kindOpts = (sel) => KINDS.map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l.split(" ")[0]}</option>`).join("");
  grid.innerHTML = list.map((e) => `
    <div class="ex-row${manageMode ? " managing" : ""}" data-id="${e.id}" data-abbr="${escapeHtml(e.abbr)}" data-kind="${kindOf(e)}">
      <div class="ex-move"><button class="ex-mv ex-up">▲</button><button class="ex-mv ex-dn">▼</button></div>
      <div class="ex-name">${escapeHtml(e.name)}<span class="ex-ab">${escapeHtml(e.abbr)}</span></div>
      <div class="ex-edit">
        <input class="ee-abbr" value="${escapeHtml(e.abbr)}" maxlength="8" />
        <input class="ee-name" value="${escapeHtml(e.name)}" />
        <select class="ee-kind">${kindOpts(kindOf(e))}</select>
        <button class="ex-del" title="Delete">🗑</button>
      </div>
      ${rowInputs(kindOf(e))}
    </div>`).join("");
  grid.querySelectorAll(".ex-row").forEach((row) => {
    row.querySelectorAll(".ex-num").forEach((n) => n.oninput = () => {
      const freeText = n.classList.contains("ex-reps") && PREFS.textReps; // reps may hold AMRAP/8-12 etc.
      if (!freeText) {
        n.value = n.inputMode === "decimal"
          ? n.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")  // weight/distance: digits + one dot
          : n.value.replace(/[^0-9]/g, "");                              // sets/min: whole numbers only
      }
      markFilled(row); saveRowDraft(row);
    });
    const tap = row.querySelector(".set-tap");
    if (tap) {
      renderSetMarks(tap);
      tap.onclick = () => { tap.dataset.count = +tap.dataset.count + 1; renderSetMarks(tap); markFilled(row); saveRowDraft(row); if (PREFS.autoRest) startRest(restDefault); };
      tap.querySelector(".set-clear").onclick = (e) => { e.stopPropagation(); tap.dataset.count = 0; renderSetMarks(tap); markFilled(row); saveRowDraft(row); };
    }
    if (manageMode) {
      const id = row.dataset.id;
      row.querySelector(".ee-name").onchange = (ev) => updateExercise(id, { name: ev.target.value.trim() });
      row.querySelector(".ee-abbr").onchange = (ev) => updateExercise(id, { abbr: ev.target.value.trim().toUpperCase() });
      row.querySelector(".ee-kind").onchange = (ev) => updateExercise(id, { kind: ev.target.value });
      row.querySelector(".ex-up").onclick = () => moveExercise(id, -1);
      row.querySelector(".ex-dn").onclick = () => moveExercise(id, 1);
      row.querySelector(".ex-del").onclick = () => { if (confirm("Delete this move? Your past logs stay.")) deleteExercise(id); };
    }
  });
  restoreDraftToGrid(); // keep in-progress entries across re-renders
}
function toggleManage() {
  manageMode = !manageMode;
  $("btn-manage").textContent = manageMode ? "Done" : "Manage moves";
  $("add-ex").classList.toggle("hidden", !manageMode);
  renderGrid();
}
async function addExerciseManage() {
  const abbr = $("ax-abbr").value.trim().toUpperCase(), name = $("ax-name").value.trim(), cat = $("ax-cat").value, kind = $("ax-kind").value;
  if (!abbr || !name) return toast("Enter an abbreviation and a name.", true);
  if (DICT[abbr]) return toast(`${abbr} already exists.`, true);
  await upsertExercise(abbr, name, cat, kind);
  $("ax-abbr").value = ""; $("ax-name").value = "";
  renderGrid(); toast(`Added ${abbr} · ${name}`);
}

/* ════════════════════════════════════════════════════════════════
   LOG FLOW (grid + extras) + REWARD
   ════════════════════════════════════════════════════════════════ */
function gatherGridItems() {
  const items = [];
  $("ex-grid").querySelectorAll(".ex-row").forEach((row) => {
    const abbr = row.dataset.abbr, kind = row.dataset.kind;
    const val = (sel) => { const el = row.querySelector(sel); const n = el ? parseFloat(el.value) : NaN; return isNaN(n) ? 0 : n; };
    if (kind === "cardio") {
      const dist = val(".ex-dist"), dur = Math.round(val(".ex-hr")) * 60 + Math.round(val(".ex-min"));
      if (dist <= 0 && dur <= 0) return;
      items.push({ kind: "set", abbr, reps: 0, sets: 0, distance: dist > 0 ? dist : null, duration: dur > 0 ? dur : null, raw: `${abbr} ${dist > 0 ? dist + "mi " : ""}${dur > 0 ? dur + "min" : ""}`.trim() });
    } else if (kind === "activity") {
      const dur = Math.round(val(".ex-hr")) * 60 + Math.round(val(".ex-min"));
      if (dur <= 0) return;
      items.push({ kind: "set", abbr, reps: 0, sets: 0, duration: dur, raw: `${abbr} ${dur}min` });
    } else {
      const repsRaw = (row.querySelector(".ex-reps").value || "").trim();
      if (!repsRaw) return;
      const numeric = /^\d+$/.test(repsRaw);          // plain number → save as number
      const reps = numeric ? parseInt(repsRaw, 10) : 0;
      const repsText = numeric ? null : repsRaw;       // anything else (AMRAP, 8-12) → save as text
      let sets;
      if (PREFS.setMode === "tap") { const b = row.querySelector(".set-tap"); sets = b ? +b.dataset.count : 0; }
      else sets = Math.round(val(".ex-sets"));
      if (sets < 1) sets = 1;
      const wt = val(".ex-wt");
      items.push({ kind: "set", abbr, reps, sets, weight: wt > 0 ? wt : null, note: repsText, raw: `${abbr}x${repsText || reps}x${sets}${wt > 0 ? "@" + wt : ""}` });
    }
  });
  return items;
}
function clearGridInputs() {
  $("ex-grid").querySelectorAll(".ex-num").forEach((i) => (i.value = ""));
  $("ex-grid").querySelectorAll(".set-tap").forEach((b) => { b.dataset.count = 0; renderSetMarks(b); });
  $("ex-grid").querySelectorAll(".ex-row").forEach((r) => r.classList.remove("filled"));
  clearDraft();
  const ex = document.querySelector(".log-card .extras"); if (ex) ex.open = false;
}
function logToday() {
  if (DEMO) return demoToast();
  const date = $("log-date").value || todayStr();
  const items = gatherGridItems();
  if (!items.length) return toast("Fill in reps (or time) for at least one move.", true);
  commitFlow(date, items);
}
async function addNewMove() {
  const abbr = $("nm-abbr").value.trim().toUpperCase(), name = $("nm-name").value.trim(), cat = $("nm-cat").value, kind = $("nm-kind").value;
  if (!abbr || !name) return toast("Enter a name and an abbreviation.", true);
  if (DICT[abbr]) return toast(`${abbr} is already in your list above.`, true);
  await upsertExercise(abbr, name, cat, kind);
  $("nm-abbr").value = ""; $("nm-name").value = "";
  renderGrid();
  toast(`Added ${name} — fill in its boxes above ▲`);
}
async function commitFlow(date, items) {
  const unknown = items.some((it) => it.kind === "set" && !DICT[it.abbr]);
  if (unknown) { openPreviewItems(date, items); return; } // route through naming flow
  const before = (pointsEngine()[date] || {}).total || 0;
  const prevPR = computePRs();
  await commitLogs(date, items);
  const day = pointsEngine()[date] || { total: 0, parts: [] };
  clearGridInputs();
  showReward(day.total - before, day.parts, date, newPRsFrom(items, prevPR));
}

let rewardTimer;
function showReward(delta, parts, date, prs) {
  prs = prs || [];
  if (delta <= 0 && !prs.length) { toast("Logged ✓"); return; }
  $("reward-num").textContent = "0";
  $("reward-parts").innerHTML = parts.map(([l, v]) => `<div>${escapeHtml(l)} <b>${typeof v === "number" ? "+" + v : v}</b></div>`).join("");
  const prLine = prs.map((p) => `🏆 New PR · ${escapeHtml(p.name)} ${p.weight > 0 ? p.weight + " × " + p.reps : p.reps + " reps"}`).join("<br>");
  $("reward-msg").innerHTML = (prLine ? `<div class="reward-pr">${prLine}</div>` : "") + escapeHtml(rewardMsg(computeStats().streak));
  $("reward").classList.remove("hidden");
  const dur = 750, t0 = performance.now();
  (function step(t) { const k = Math.min((t - t0) / dur, 1); $("reward-num").textContent = Math.round(delta * k); if (k < 1) requestAnimationFrame(step); })(t0);
  clearTimeout(rewardTimer); rewardTimer = setTimeout(hideReward, 3300);
}
function hideReward() { $("reward").classList.add("hidden"); }
function rewardMsg(streak) {
  if (streak >= 30) return "30+ days. This is who you are now.";
  if (streak >= 14) return "Two weeks straight. Unstoppable.";
  if (streak >= 7) return "A full week — the habit is locking in.";
  if (streak >= 3) return `${streak} days in a row. Momentum is real.`;
  if (streak === 1) return "You showed up. That's rep one.";
  return "Logged. Keep it rolling.";
}

async function updateExercise(id, fields) {
  if (DEMO) return demoToast();
  const e = STATE.exercises.find((x) => x.id === id); if (!e) return;
  Object.assign(e, fields); rebuildDict(); saveCache(); renderGrid();
  try { const { error } = await SB.from("wo_exercises").update(fields).eq("id", id); if (error) throw error; }
  catch (err) { queue({ t: "updEx", id, fields }); }
}
async function deleteExercise(id) {
  if (DEMO) return demoToast();
  STATE.exercises = STATE.exercises.filter((x) => x.id !== id); rebuildDict(); saveCache(); renderGrid();
  try { const { error } = await SB.from("wo_exercises").delete().eq("id", id); if (error) throw error; }
  catch (err) { queue({ t: "delEx", id }); }
}

function renderCalendar() {
  if (!calCursor) calCursor = new Date();
  const year = calCursor.getFullYear(), month = calCursor.getMonth();
  $("cal-title").textContent = calCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const grid = $("cal-grid");
  grid.innerHTML = "";
  for (let i = 0; i < startPad; i++) { const c = document.createElement("div"); c.className = "cal-cell empty"; grid.appendChild(c); }
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dayLogs = logsByDate(ds);
    const cell = document.createElement("div");
    cell.className = "cal-cell" + (dayLogs.length ? " has" : "") + (ds === todayStr() ? " today" : "");
    const mini = dayLogs.slice(0, 3).map((l) => {
      if (l.note) return `<div class="cm-row">${escapeHtml(l.note.slice(0, 9))}</div>`;
      const val = l.reps || (l.duration ? l.duration + "m" : "") || "";
      return `<div class="cm-row"><b>${escapeHtml(l.abbr || "")}</b> ${val}</div>`;
    }).join("") + (dayLogs.length > 3 ? `<div class="cm-more">+${dayLogs.length - 3}</div>` : "");
    cell.innerHTML = `<div class="cal-num">${d}</div><div class="cal-mini">${mini}</div>`;
    cell.onclick = () => openDay(ds);
    grid.appendChild(cell);
  }
}

function switchCalMode(m) {
  calMode = m;
  $("cal-month").classList.toggle("hidden", m !== "month");
  $("cal-year").classList.toggle("hidden", m !== "year");
  document.querySelectorAll("#cal-mode .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.cm === m));
  if (m === "year") renderYear(); else renderCalendar();
}
function renderYear() {
  const year = yearCursor;
  $("yr-title").textContent = year;
  const map = pointsEngine();
  const start = new Date(year, 0, 1); start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31); end.setDate(end.getDate() + (6 - end.getDay()));
  const weeks = []; let cur = new Date(start);
  while (cur <= end) { const wk = []; for (let i = 0; i < 7; i++) { wk.push(new Date(cur)); cur.setDate(cur.getDate() + 1); } weeks.push(wk); }
  const N = weeks.length;
  $("yr-months").style.gridTemplateColumns = `repeat(${N},13px)`;
  $("yr-grid").style.gridTemplateColumns = `repeat(${N},13px)`;
  let lastM = -1;
  $("yr-months").innerHTML = weeks.map((wk) => {
    let lab = "";
    for (const d of wk) if (d.getFullYear() === year && d.getDate() <= 7 && d.getMonth() !== lastM) { lab = d.toLocaleDateString(undefined, { month: "short" }); lastM = d.getMonth(); break; }
    return `<div class="yr-mlab">${lab}</div>`;
  }).join("");
  const t = todayStr();
  $("yr-grid").innerHTML = weeks.map((wk) => wk.map((d) => {
    if (d.getFullYear() !== year) return `<div class="yr-cell blank"></div>`;
    const ds = ymd(d), pts = (map[ds] || {}).total || 0;
    const lvl = pts === 0 ? 0 : pts < 25 ? 1 : pts < 45 ? 2 : pts < 70 ? 3 : 4;
    return `<div class="yr-cell l${lvl}${ds === t ? " today" : ""}" data-day="${ds}" title="${ds} · ${pts} pts"></div>`;
  }).join("")).join("");
  $("yr-grid").querySelectorAll(".yr-cell[data-day]").forEach((c) => c.onclick = () => openDay(c.dataset.day));
  let days = 0, ypts = 0;
  for (const d in map) if (d.startsWith(year + "-")) { days++; ypts += map[d].total; }
  $("yr-summary").innerHTML = `<b>${days}</b> days trained · <b>${ypts.toLocaleString()}</b> pts in ${year}`;
}

/* ───── personal records (Epley est. 1RM for weighted; max reps for bodyweight) ───── */
function e1rm(w, r) { return w * (1 + r / 30); }
function computePRs() {
  const pr = {};
  for (const l of STATE.logs) {
    if (!l.abbr || !l.reps) continue;
    if ((DICT[l.abbr]?.kind || "strength") !== "strength") continue;
    const sc = l.weight > 0 ? e1rm(l.weight, l.reps) : l.reps;
    if (!pr[l.abbr] || sc > pr[l.abbr].score) pr[l.abbr] = { score: sc, weight: l.weight || 0, reps: l.reps, name: l.exercise || l.abbr, date: l.date };
  }
  return pr;
}
// PRs newly beaten by `items` vs best BEFORE the commit (first-ever doesn't count)
function newPRsFrom(items, prevPR) {
  const out = [], seen = {};
  for (const it of items) {
    if (it.kind !== "set" || !it.abbr || !it.reps) continue;
    if ((DICT[it.abbr]?.kind || "strength") !== "strength") continue;
    const prev = prevPR[it.abbr]?.score;
    if (prev === undefined) continue;
    const sc = it.weight > 0 ? e1rm(it.weight, it.reps) : it.reps;
    if (sc > Math.max(prev, seen[it.abbr] || 0)) { out.push({ name: DICT[it.abbr]?.name || it.abbr, weight: it.weight || 0, reps: it.reps }); seen[it.abbr] = sc; }
  }
  return out;
}

/* ───── rest timer ───── */
let restInt = null, restEnd = 0, restTotal = 0, restDefault = 90;
function fmtMS(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function startRest(sec) {
  clearInterval(restInt);
  restDefault = sec; restTotal = sec; restEnd = Date.now() + sec * 1000;
  $("rest-idle").classList.add("hidden"); $("rest-active").classList.remove("hidden");
  tickRest(); restInt = setInterval(tickRest, 250);
}
function tickRest() {
  const left = Math.max(0, Math.round((restEnd - Date.now()) / 1000));
  $("rest-time").textContent = fmtMS(left);
  $("rest-fill").style.width = (restTotal ? (left / restTotal) * 100 : 0) + "%";
  if (left <= 0) { clearInterval(restInt); restDone(); }
}
function stopRest() { clearInterval(restInt); $("rest-active").classList.add("hidden"); $("rest-idle").classList.remove("hidden"); }
function restDone() {
  stopRest();
  if (PREFS.restVibrate) { try { if (navigator.vibrate) navigator.vibrate([220, 90, 220]); } catch (e) {} }
  if (PREFS.restSound) restBeep();
  toast("Rest done — go 💪");
}
function restBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const a = new AC(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.12;
    o.start(); setTimeout(() => { o.stop(); a.close(); }, 360);
  } catch (e) {}
}

const CAT_COLORS = { chest: "#f5a623", back: "#3ddc84", legs: "#5b8cff", shoulders: "#c77dff", arms: "#ff7d7d", core: "#ffd166", cardio: "#36c5d6", other: "#9aa2b3" };
function rankProgress(m) {
  let cur = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) if (m >= RANKS[i][0]) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
  if (!next) return { rank: cur[1], pct: 100, label: "Top rank — keep stacking 🔥" };
  const span = next[0] - cur[0], into = m - cur[0];
  return { rank: cur[1], pct: Math.max(4, Math.round(into / span * 100)), label: `${next[0] - m} pts to ${next[1]}` };
}
function weeklyPoints(n) {
  const map = pointsEngine(), out = [];
  const sow = new Date(); sow.setDate(sow.getDate() - sow.getDay()); sow.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const ws = new Date(sow); ws.setDate(sow.getDate() - i * 7);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    let sum = 0;
    for (const d in map) { const dd = parseYmd(d); if (dd >= ws && dd <= we) sum += map[d].total; }
    out.push({ ws, sum });
  }
  return out;
}
function renderStats() {
  const s = computeStats();
  const p = pointsAgg();

  // momentum hero
  const rp = rankProgress(p.month);
  $("sh-rank").textContent = rp.rank;
  $("sh-month").textContent = p.month.toLocaleString();
  $("sh-streak").textContent = s.streak;
  $("sh-bar-fill").style.width = rp.pct + "%";
  $("sh-next").textContent = rp.label;

  // 8-week trend
  const wk = weeklyPoints(8), maxw = Math.max(1, ...wk.map((w) => w.sum));
  $("trend").innerHTML = wk.map((w, i) => {
    const h = Math.round((w.sum / maxw) * 100);
    const cls = "trend-col" + (i === wk.length - 1 ? " now" : "") + (w.sum === 0 ? " zero" : "");
    const lbl = i === wk.length - 1 ? "now" : (wk.length - 1 - i) + "w";
    return `<div class="${cls}"><div class="trend-v">${w.sum || ""}</div><div class="trend-bar" style="height:${Math.max(h, w.sum ? 6 : 2)}%"></div><div class="trend-l">${lbl}</div></div>`;
  }).join("");
  const tw = wk[wk.length - 1].sum, lw = wk[wk.length - 2]?.sum || 0;
  const dEl = $("trend-delta"), diff = tw - lw;
  dEl.textContent = diff > 0 ? `▲ ${diff} vs last wk` : diff < 0 ? `▼ ${-diff} vs last wk` : "even vs last wk";
  dEl.className = "trend-delta " + (diff > 0 ? "up" : diff < 0 ? "down" : "flat");

  // trophy room
  $("k-life").textContent = p.lifetime.toLocaleString();
  $("k-bestmonth").textContent = p.bestMonth.toLocaleString();
  $("k-best").textContent = s.bestStreak;
  $("k-workouts").textContent = s.totalDays;
  $("k-reps").textContent = s.totalReps.toLocaleString();
  $("k-sets").textContent = s.totalSets.toLocaleString();

  // colorized muscle bars
  const cats = s.byCat, max = Math.max(1, ...Object.values(cats));
  const cb = $("cat-bars");
  const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  cb.innerHTML = catEntries.length
    ? catEntries.map(([c, v]) => `<div class="cat-row"><div class="cat-name">${c}</div>
        <div class="cat-track"><div class="cat-fill" style="width:${(v / max) * 100}%;background:${CAT_COLORS[c] || "var(--amber)"}"></div></div>
        <div class="cat-val">${v.toLocaleString()}</div></div>`).join("")
    : `<div class="empty-note">No data yet.</div>`;

  // top moves
  const te = Object.entries(s.byEx).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("top-ex").innerHTML = te.length
    ? te.map(([n, v]) => `<div class="top-row"><span class="tx-name">${escapeHtml(n)}</span><span class="tx-val">${v.toLocaleString()} reps</span></div>`).join("")
    : `<div class="empty-note">No data yet.</div>`;

  // personal records
  const prs = Object.values(computePRs()).sort((a, b) => b.score - a.score).slice(0, 8);
  $("records").innerHTML = prs.length
    ? prs.map((p) => `<div class="rec-row"><span class="rec-name">${escapeHtml(p.name)}</span><span class="rec-val">${p.weight > 0 ? `${p.weight} × ${p.reps}` : `${p.reps} reps`}<span class="rec-sub">${p.weight > 0 ? `~${Math.round(p.score)} est. 1RM` : "best set"} · ${prettyDate(p.date)}</span></span></div>`).join("")
    : `<div class="empty-note">Log a weighted set to start setting records.</div>`;

  // 12-week heatmap (84 days)
  const set = new Set(STATE.logs.map((l) => l.date));
  const cells = [];
  const start = new Date(); start.setDate(start.getDate() - 83);
  for (let i = 0; i < 84; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const has = set.has(ymd(d)); cells.push(`<div class="hm-cell" style="${has ? "background:var(--grn)" : ""}" title="${ymd(d)}"></div>`); }
  $("heatmap").innerHTML = cells.join("");
}

/* ════════════════════════════════════════════════════════════════
   STATS ENGINE
   ════════════════════════════════════════════════════════════════ */
function computeStats() {
  const dateSet = new Set(STATE.logs.map((l) => l.date));
  const dates = [...dateSet].sort();
  const totalDays = dates.length;

  // current streak (counts up to today, with a 1-day grace if today not logged yet)
  let streak = 0;
  let cur = new Date();
  if (!dateSet.has(ymd(cur))) cur.setDate(cur.getDate() - 1); // grace: yesterday still counts
  while (dateSet.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

  // best streak
  let best = 0, run = 0, prev = null;
  for (const ds of dates) {
    if (prev) { const gap = (parseYmd(ds) - parseYmd(prev)) / 86400000; run = gap === 1 ? run + 1 : 1; }
    else run = 1;
    best = Math.max(best, run); prev = ds;
  }

  // this week (Sun-based)
  const now = new Date(), sow = new Date(now); sow.setDate(now.getDate() - now.getDay()); sow.setHours(0, 0, 0, 0);
  const thisWeekDays = [...dateSet].filter((d) => parseYmd(d) >= sow).length;

  // totals + breakdowns
  let totalReps = 0, totalSets = 0, monthReps = 0;
  const byCat = {}, byEx = {};
  const mPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const monthDaysSet = new Set();
  for (const l of STATE.logs) {
    const vol = (l.reps || 0) * (l.sets || 0);
    totalReps += vol; totalSets += (l.sets || 0);
    if (l.date.startsWith(mPrefix)) { monthReps += vol; monthDaysSet.add(l.date); }
    if (l.abbr) {
      const cat = DICT[l.abbr]?.category || "other";
      byCat[cat] = (byCat[cat] || 0) + vol;
      const nm = l.exercise || l.abbr;
      byEx[nm] = (byEx[nm] || 0) + vol;
    }
  }
  return { totalDays, streak, bestStreak: best, thisWeekDays, totalReps, totalSets, monthReps, monthDays: monthDaysSet.size, byCat, byEx };
}

/* ════════════════════════════════════════════════════════════════
   QUOTES — context-aware (rotates daily within the right bucket)
   ════════════════════════════════════════════════════════════════ */
const QUOTES = {
  start: [
    ["The hardest lift is the one off the couch. You're here — that's rep one.", "TackT"],
    ["You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"],
    ["A year from now you'll wish you started today.", "Karen Lamb"],
  ],
  comeback: [
    ["Missed a few days? The streak isn't the point — showing up again is.", "TackT"],
    ["Fall down seven times, stand up eight.", "Japanese Proverb"],
    ["The comeback is always stronger than the setback.", "Unknown"],
    ["It's not about perfect. It's about effort. Bring it today.", "Jillian Michaels"],
  ],
  building: [
    ["Small daily improvements are the key to staggering long-term results.", "Unknown"],
    ["Discipline is choosing between what you want now and what you want most.", "Abraham Lincoln"],
    ["Momentum is built one honest day at a time. Keep stacking.", "TackT"],
    ["Motivation gets you started. Habit keeps you going.", "Jim Rohn"],
  ],
  strong: [
    ["A week strong. The body adapts to what you repeat — keep feeding it.", "TackT"],
    ["Success isn't always about greatness. It's about consistency.", "Dwayne Johnson"],
    ["The pain you feel today is the strength you feel tomorrow.", "Arnold Schwarzenegger"],
    ["We are what we repeatedly do. Excellence is a habit.", "Aristotle"],
  ],
  beast: [
    ["Three weeks deep. This isn't a phase anymore — it's who you are.", "TackT"],
    ["The last three or four reps is what makes the muscle grow.", "Arnold Schwarzenegger"],
    ["Strength does not come from winning. Your struggles develop your strength.", "Arnold Schwarzenegger"],
    ["You're not the same person who started. Keep proving it.", "TackT"],
  ],
};
function bucket(st) {
  if (st.totalDays === 0) return "start";
  if (st.streak === 0) return "comeback";
  if (st.streak < 7) return "building";
  if (st.streak < 21) return "strong";
  return "beast";
}
function dayOfYear() { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }
function renderQuote(st) {
  const arr = QUOTES[bucket(st)];
  const [text, author] = arr[dayOfYear() % arr.length];
  $("quote-text").textContent = text;
  $("quote-author").textContent = "— " + author;
}

/* ════════════════════════════════════════════════════════════════
   DAY SHEET
   ════════════════════════════════════════════════════════════════ */
let openDayStr = null;
function openDay(ds) {
  openDayStr = ds;
  $("day-title").textContent = prettyDate(ds);
  renderDayEntries();
  $("day-input").value = "";
  openSheet("day-sheet");
}
function renderDayEntries() {
  const entries = logsByDate(openDayStr);
  const box = $("day-entries");
  if (!entries.length) { box.innerHTML = `<div class="day-empty">No entries yet. Add some below.</div>`; return; }
  box.innerHTML = entries.map((l) => `<div class="day-entry">
      <div class="de-text">${l.note ? escapeHtml(l.note) : `<b>${escapeHtml(l.exercise || l.abbr)}</b> ${l.reps}${l.sets > 1 ? " × " + l.sets : ""}`}</div>
      <button class="de-del" data-id="${l.id}">🗑</button></div>`).join("");
  box.querySelectorAll(".de-del").forEach((b) => b.onclick = async () => { await deleteLog(b.dataset.id); renderDayEntries(); });
}

/* ════════════════════════════════════════════════════════════════
   UI PLUMBING
   ════════════════════════════════════════════════════════════════ */
function openSheet(id) { $(id).classList.remove("hidden"); }
function closeSheet(id) { $(id).classList.add("hidden"); }
function switchView(v) {
  ["log", "cal", "stats"].forEach((x) => $("view-" + x).classList.toggle("hidden", x !== v));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
}
let toastTimer;
function toast(msg, err) {
  const t = $("toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : "");
  t.classList.remove("hidden"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ───────── wire up ───────── */
function bind() {
  $("btn-signin").onclick = signIn;
  $("btn-signup").onclick = signUp;
  $("password").addEventListener("keydown", (e) => { if (e.key === "Enter") signIn(); });
  $("btn-signout").onclick = signOut;

  $("btn-settings").onclick = () => { const a = $("set-account"); if (a) a.textContent = USER?.email || "—"; openSheet("settings"); };
  document.querySelectorAll("#set-theme .seg-btn").forEach((b) => b.onclick = () => { PREFS.theme = b.dataset.theme; savePrefs(); applyPrefs(); });
  $("set-quote").onclick = () => { PREFS.showQuote = !PREFS.showQuote; savePrefs(); applyPrefs(); };
  $("set-tapsets").onclick = () => { PREFS.setMode = PREFS.setMode === "tap" ? "number" : "tap"; savePrefs(); applyPrefs(); renderGrid(); };
  $("set-textreps").onclick = () => { PREFS.textReps = !PREFS.textReps; savePrefs(); applyPrefs(); renderGrid(); };
  $("set-demo").onclick = () => toggleDemo(!DEMO);
  $("demo-off").onclick = () => toggleDemo(false);
  document.querySelectorAll(".rest-p").forEach((b) => b.onclick = () => startRest(+b.dataset.sec));
  $("rest-stop").onclick = stopRest;
  $("set-autorest").onclick = () => { PREFS.autoRest = !PREFS.autoRest; savePrefs(); applyPrefs(); };
  $("rest-sound").onclick = () => { PREFS.restSound = !PREFS.restSound; savePrefs(); applyPrefs(); toast(PREFS.restSound ? "Beep on" : "Beep off"); };
  $("rest-vibe").onclick = () => { PREFS.restVibrate = !PREFS.restVibrate; savePrefs(); applyPrefs(); toast(PREFS.restVibrate ? "Buzz on" : "Buzz off"); };
  $("set-version").textContent = APP_VERSION;
  $("fb-send").onclick = async () => {
    const ta = $("fb-text"), msg = (ta.value || "").trim();
    if (!msg) return toast("Type a little something first.", true);
    const btn = $("fb-send"); btn.disabled = true;
    const { error } = await SB.from("wo_feedback").insert({ user_id: USER?.id, email: USER?.email || null, message: msg });
    btn.disabled = false;
    if (error) return toast("Couldn't send — check your connection and try again.", true);
    ta.value = ""; toast("Thanks — we got it! 🙌");
  };
  $("set-update").onclick = checkForUpdate;
  $("update-btn").onclick = () => applyUpdate();

  $("log-date").value = todayStr();
  $("log-date").onchange = () => { const d = $("log-date").value || todayStr(); $("log-day-label").textContent = d === todayStr() ? "Today's workout" : prettyDate(d) + "'s workout"; };
  $("btn-log").onclick = logToday;
  $("btn-manage").onclick = toggleManage;
  $("ax-cat").innerHTML = CATS.map((c) => `<option value="${c}">${c}</option>`).join("");
  $("ax-kind").innerHTML = KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("ax-add").onclick = addExerciseManage;
  $("nm-cat").innerHTML = CATS.map((c) => `<option value="${c}">${c}</option>`).join("");
  $("nm-kind").innerHTML = KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("nm-add").onclick = addNewMove;
  $("reward").onclick = hideReward;

  document.querySelectorAll(".nav-btn").forEach((b) => b.onclick = () => switchView(b.dataset.view));
  document.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => closeSheet(b.dataset.close === "day" ? "day-sheet" : b.dataset.close));

  $("cal-prev").onclick = () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); };
  $("cal-next").onclick = () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); };
  $("cal-today").onclick = () => { calCursor = new Date(); renderCalendar(); };
  document.querySelectorAll("#cal-mode .seg-btn").forEach((b) => b.onclick = () => switchCalMode(b.dataset.cm));
  $("yr-prev").onclick = () => { yearCursor--; renderYear(); };
  $("yr-next").onclick = () => { yearCursor++; renderYear(); };

  $("day-add").onclick = () => { if ($("day-input").value.trim()) { closeSheet("day-sheet"); openPreview(openDayStr, $("day-input").value); } };
  $("preview-confirm").onclick = confirmPreview;

  window.addEventListener("online", flushPending);
  window.addEventListener("offline", () => setSync("off"));
}

/* ───────── boot ───────── */
async function boot() {
  bind();
  loadPrefs(); applyPrefs();
  const { data: { session } } = await SB.auth.getSession();
  SB.auth.onAuthStateChange((_e, sess) => {
    const wasUser = USER;
    USER = sess?.user || null;
    if (USER && !wasUser) { showApp(); loadData(); }
    else if (!USER) showAuth();
  });
  if (session?.user) { USER = session.user; showApp(); loadData(); }
  else showAuth();
}
function showAuth() { $("auth").classList.remove("hidden"); $("app").classList.add("hidden"); }
function showApp() { $("auth").classList.add("hidden"); $("app").classList.remove("hidden"); switchView("log"); }

/* ───────── version + self-update ───────── */
const APP_VERSION = "v28";
let swReg = null, updating = false;
function onUpdateReady() {
  const bar = $("update-bar");
  if (bar) {
    bar.classList.remove("hidden", "updating");
    bar.innerHTML = '<span>New version ready</span><button id="update-btn">Update now</button>';
    $("update-btn").onclick = () => applyUpdate();
  }
  const sub = $("set-update-sub"), btn = $("set-update");
  if (sub) sub.textContent = "Update available";
  if (btn) { btn.disabled = false; btn.textContent = "Update now"; btn.classList.add("ready"); }
}
function applyUpdate(silent) {
  updating = true;
  if (!silent) {
    // visible feedback so the swap-and-reload pause is never silent
    const bar = $("update-bar");
    if (bar) { bar.classList.remove("hidden"); bar.classList.add("updating"); bar.innerHTML = '<span class="upd-spin"></span><span>Updating…</span>'; }
    const sub = $("set-update-sub"), btn = $("set-update");
    if (sub) sub.textContent = "Updating…";
    if (btn) { btn.disabled = true; btn.classList.remove("ready"); btn.textContent = "Updating…"; }
  }
  if (swReg && swReg.waiting) swReg.waiting.postMessage({ type: "SKIP_WAITING" }); // → controllerchange → reload
  else location.reload();
}
async function checkForUpdate() {
  if (!swReg) return location.reload();
  const sub = $("set-update-sub");
  if (sub) sub.textContent = "Checking…";
  try { await swReg.update(); } catch (e) {}
  if (swReg.waiting) return onUpdateReady();              // already downloaded → ready now
  const installing = swReg.installing;
  if (installing) {                                        // downloading → show real progress (no false "latest")
    if (sub) sub.textContent = "Downloading update…";
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) onUpdateReady();
    });
    return;
  }
  if (sub) sub.textContent = "You're on the latest";
  toast(`You're on the latest (${APP_VERSION}) ✓`);
}
function initSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    swReg = reg;
    // A pending update from a previous session: apply it SILENTLY at startup —
    // safe because nothing's been logged yet. (Mid-session updates still show the
    // banner below so we never swap files while you're logging.) This stops the
    // "Update available" banner from reappearing on every login.
    if (reg.waiting && navigator.serviceWorker.controller) applyUpdate(true);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (nw) nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) onUpdateReady();
      });
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (updating) location.reload(); });
}

/* ───────── demo data (in-memory only, never persisted) ───────── */
function demoLog(e, ds, f) {
  return { id: "demo-" + ds + "-" + e.abbr + "-" + Math.random().toString(36).slice(2, 6), user_id: "demo", date: ds, abbr: e.abbr, exercise: e.name, reps: f.reps || 0, sets: f.sets || 0, weight: f.weight || null, distance: f.distance || null, duration: f.duration || null, note: null, raw: "demo", created_at: ds + "T12:00" };
}
function genDemoData() {
  const base = (STATE.exercises && STATE.exercises.length) ? STATE.exercises
    : SEED.map(([abbr, name, category, kind]) => ({ id: "demo-" + abbr, user_id: "demo", abbr, name, category, kind }));
  const strength = base.filter((e) => (e.kind || "strength") === "strength");
  const cardio = base.filter((e) => e.kind === "cardio");
  const activity = base.filter((e) => e.kind === "activity");
  const logs = [], today = new Date();
  for (let i = 0; i < 330; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (Math.random() < (i < 60 ? 0.38 : 0.52)) continue; // rest days (denser recent)
    const ds = ymd(d), roll = Math.random();
    if (roll < 0.15 && cardio.length) { const e = cardio[Math.floor(Math.random() * cardio.length)]; logs.push(demoLog(e, ds, { distance: +(2 + Math.random() * 8).toFixed(1), duration: 20 + Math.floor(Math.random() * 40) })); }
    else if (roll < 0.25 && activity.length) { const e = activity[Math.floor(Math.random() * activity.length)]; logs.push(demoLog(e, ds, { duration: 30 + Math.floor(Math.random() * 60) })); }
    else { const pool = [...strength], n = Math.min(2 + Math.floor(Math.random() * 4), pool.length); for (let k = 0; k < n; k++) { const e = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; const heavy = e.category === "legs" || e.category === "back"; logs.push(demoLog(e, ds, { reps: 8 + Math.floor(Math.random() * 12), sets: 2 + Math.floor(Math.random() * 3), weight: (heavy ? 95 : 25) + Math.floor(Math.random() * 8) * 5 })); } }
  }
  return { exercises: base, logs };
}
function toggleDemo(on) {
  if (on === DEMO) return;
  DEMO = on;
  if (DEMO) { REAL_STATE = STATE; STATE = genDemoData(); }
  else { STATE = REAL_STATE || STATE; REAL_STATE = null; }
  rebuildDict();
  $("demo-bar").classList.toggle("hidden", !DEMO);
  const sw = $("set-demo"); if (sw) { sw.classList.toggle("on", DEMO); sw.setAttribute("aria-checked", DEMO); }
  renderAll();
}

initSW();
boot();
