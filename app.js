/* ════════════════════════════════════════════════════════════════
   GROOVE — Workout Log
   Phone-first PWA · Supabase sync · offline-tolerant
   ════════════════════════════════════════════════════════════════ */

const SB = window.supabase.createClient(WO_CONFIG.url, WO_CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "groove-auth" },
});

const $ = (id) => document.getElementById(id);
const el = (sel, root = document) => root.querySelector(sel);

let USER = null;
let STATE = { logs: [], exercises: [] }; // logs: rows, exercises: dict rows
let DICT = {}; // abbr -> {name, category}
let calCursor = null; // Date for the visible calendar month

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
  // abbr x reps [x sets]      e.g. BPx20x4 · BP x 20 x ||||
  let m = raw.match(/^([a-zA-Z][a-zA-Z\-]*)\s*[x×*]\s*(\d+)\s*(?:[x×*]\s*(\d+|[|lI]+))?$/);
  if (m) return { kind: "set", abbr: m[1].toUpperCase(), reps: +m[2], sets: parseSets(m[3]), raw };
  // reps abbr [x sets]        e.g. 100Cx|||| · 100C
  m = raw.match(/^(\d+)\s*([a-zA-Z][a-zA-Z\-]*)\s*(?:[x×*]\s*(\d+|[|lI]+))?$/);
  if (m) return { kind: "set", abbr: m[2].toUpperCase(), reps: +m[1], sets: parseSets(m[3]), raw };
  // otherwise: a note (REST, 10 min run, OFF, etc.)
  return { kind: "note", note: raw, raw };
}
function parseLine(text) {
  return text.split(/[,\n]+/).map(parseToken).filter(Boolean);
}

/* ════════════════════════════════════════════════════════════════
   STARTER DICTIONARY (seeded once, per account)
   ════════════════════════════════════════════════════════════════ */
const SEED = [
  ["BP", "Bench Press", "chest"], ["DB", "Dumbbell Press", "chest"],
  ["BTFLY", "Chest Fly", "chest"], ["PU", "Push-ups", "chest"],
  ["C", "Crunches", "core"], ["CR", "Crunches", "core"], ["PLANK", "Plank", "core"],
  ["SQT", "Squats", "legs"], ["LUNGE", "Lunges", "legs"], ["LEG", "Leg Press", "legs"],
  ["DL", "Deadlift", "back"], ["ROW", "Row", "back"], ["PULL", "Pull-ups", "back"],
  ["SH", "Shoulder Press", "shoulders"], ["SHRUG", "Shrugs", "shoulders"],
  ["CURL", "Bicep Curl", "arms"], ["TRI", "Tricep Extension", "arms"],
  ["RUN", "Run", "cardio"], ["WALK", "Walk", "cardio"], ["BIKE", "Cycling", "cardio"],
];
const CATS = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio", "other"];

/* ════════════════════════════════════════════════════════════════
   LOCAL CACHE + OFFLINE QUEUE
   ════════════════════════════════════════════════════════════════ */
const cacheKey = () => `wo_cache_${USER?.id}`;
const pendKey = () => `wo_pending_${USER?.id}`;
function saveCache() { try { localStorage.setItem(cacheKey(), JSON.stringify(STATE)); } catch (e) {} }
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
      if (op.t === "insLog") { const { error } = await SB.from("wo_logs").insert(op.row); if (error) throw error; }
      else if (op.t === "delLog") { const { error } = await SB.from("wo_logs").delete().eq("id", op.id); if (error) throw error; }
      else if (op.t === "insEx") { const { error } = await SB.from("wo_exercises").insert(op.row); if (error) throw error; }
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
  for (const e of STATE.exercises) DICT[e.abbr] = { name: e.name, category: e.category };
}
async function seedDict() {
  const rows = SEED.map(([abbr, name, category]) => ({
    id: crypto.randomUUID(), user_id: USER.id, abbr, name, category,
  }));
  STATE.exercises = rows; rebuildDict(); saveCache();
  try { const { error } = await SB.from("wo_exercises").insert(rows); if (error) throw error; }
  catch (e) { rows.forEach((row) => queue({ t: "insEx", row })); }
}

/* ════════════════════════════════════════════════════════════════
   WRITES
   ════════════════════════════════════════════════════════════════ */
async function commitLogs(date, items) {
  const rows = items.map((it) => ({
    id: crypto.randomUUID(), user_id: USER.id, date,
    abbr: it.kind === "set" ? it.abbr : null,
    exercise: it.kind === "set" ? (DICT[it.abbr]?.name || it.abbr) : null,
    reps: it.kind === "set" ? it.reps : 0,
    sets: it.kind === "set" ? it.sets : 0,
    note: it.kind === "note" ? it.note : null,
    raw: it.raw,
  }));
  STATE.logs = [...rows, ...STATE.logs];
  saveCache(); renderAll();
  try { const { error } = await SB.from("wo_logs").insert(rows); if (error) throw error; }
  catch (e) { rows.forEach((row) => queue({ t: "insLog", row })); }
}
async function upsertExercise(abbr, name, category) {
  const row = { id: crypto.randomUUID(), user_id: USER.id, abbr, name, category };
  STATE.exercises.push(row); rebuildDict(); saveCache();
  try { const { error } = await SB.from("wo_exercises").insert(row); if (error) throw error; }
  catch (e) { queue({ t: "insEx", row }); }
}
async function deleteLog(id) {
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
  const items = parseLine(text);
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
      const vol = it.reps * it.sets;
      box.innerHTML = `<div class="pv-known"><span class="pv-name">${escapeHtml(DICT[it.abbr].name)}</span>
        <span class="pv-calc">${it.reps} × ${it.sets} = ${vol} reps</span></div>`;
    } else {
      box.className = "pv-item pv-new";
      box.innerHTML = `
        <span class="pv-new-tag">NEW · ${escapeHtml(it.abbr)}</span>
        <div class="pv-calc" style="color:var(--mut);font-size:13px">${it.reps} × ${it.sets} reps — name it so GROOVE remembers:</div>
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
  await commitLogs(date, items);
  closeSheet("preview");
  $("log-input").value = ""; $("day-input").value = "";
  toast(`Logged ${items.length} ${items.length === 1 ? "move" : "moves"} ✓`);
  pendingPreview = null;
}

function guessName(abbr) {
  return abbr.charAt(0) + abbr.slice(1).toLowerCase();
}

/* ════════════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════════════ */
function logsByDate(date) { return STATE.logs.filter((l) => l.date === date); }
function moveLabel(l) {
  if (l.note) return l.note;
  const nm = l.exercise || l.abbr;
  return l.sets > 1 ? `${nm} ${l.reps}×${l.sets}` : `${nm} ${l.reps}`;
}

function renderAll() { renderLog(); renderCalendar(); renderStats(); }

function renderLog() {
  const st = computeStats();
  $("s-streak").textContent = st.streak;
  $("s-week").textContent = st.thisWeekDays;
  $("s-total").textContent = st.totalDays;
  renderQuote(st);

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
    const mini = dayLogs.slice(0, 3).map((l) => l.note
      ? `<div>${escapeHtml(l.note.slice(0, 8))}</div>`
      : `<div><b>${escapeHtml(l.abbr || "")}</b>${l.reps || ""}</div>`).join("");
    cell.innerHTML = `<div class="cal-num">${d}</div><div class="cal-mini">${mini}</div>`;
    cell.onclick = () => openDay(ds);
    grid.appendChild(cell);
  }
}

function renderStats() {
  const s = computeStats();
  $("k-workouts").textContent = s.totalDays;
  $("k-best").textContent = s.bestStreak;
  $("k-reps").textContent = s.totalReps.toLocaleString();
  $("k-sets").textContent = s.totalSets.toLocaleString();
  $("k-mdays").textContent = s.monthDays;
  $("k-mreps").textContent = s.monthReps.toLocaleString();

  // category bars
  const cats = s.byCat, max = Math.max(1, ...Object.values(cats));
  const cb = $("cat-bars");
  const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  cb.innerHTML = catEntries.length
    ? catEntries.map(([c, v]) => `<div class="cat-row"><div class="cat-name">${c}</div>
        <div class="cat-track"><div class="cat-fill" style="width:${(v / max) * 100}%"></div></div>
        <div class="cat-val">${v.toLocaleString()}</div></div>`).join("")
    : `<div class="empty-note">No data yet.</div>`;

  // top exercises
  const te = Object.entries(s.byEx).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("top-ex").innerHTML = te.length
    ? te.map(([n, v]) => `<div class="top-row"><span class="tx-name">${escapeHtml(n)}</span><span class="tx-val">${v.toLocaleString()} reps</span></div>`).join("")
    : `<div class="empty-note">No data yet.</div>`;

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
    ["The hardest lift is the one off the couch. You're here — that's rep one.", "GROOVE"],
    ["You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"],
    ["A year from now you'll wish you started today.", "Karen Lamb"],
  ],
  comeback: [
    ["Missed a few days? The streak isn't the point — showing up again is.", "GROOVE"],
    ["Fall down seven times, stand up eight.", "Japanese Proverb"],
    ["The comeback is always stronger than the setback.", "Unknown"],
    ["It's not about perfect. It's about effort. Bring it today.", "Jillian Michaels"],
  ],
  building: [
    ["Small daily improvements are the key to staggering long-term results.", "Unknown"],
    ["Discipline is choosing between what you want now and what you want most.", "Abraham Lincoln"],
    ["Momentum is built one honest day at a time. Keep stacking.", "GROOVE"],
    ["Motivation gets you started. Habit keeps you going.", "Jim Rohn"],
  ],
  strong: [
    ["A week strong. The body adapts to what you repeat — keep feeding it.", "GROOVE"],
    ["Success isn't always about greatness. It's about consistency.", "Dwayne Johnson"],
    ["The pain you feel today is the strength you feel tomorrow.", "Arnold Schwarzenegger"],
    ["We are what we repeatedly do. Excellence is a habit.", "Aristotle"],
  ],
  beast: [
    ["Three weeks deep. This isn't a phase anymore — it's who you are.", "GROOVE"],
    ["The last three or four reps is what makes the muscle grow.", "Arnold Schwarzenegger"],
    ["Strength does not come from winning. Your struggles develop your strength.", "Arnold Schwarzenegger"],
    ["You're not the same person who started. Keep proving it.", "GROOVE"],
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

  $("log-date").value = todayStr();
  $("btn-preview").onclick = () => openPreview($("log-date").value || todayStr(), $("log-input").value);

  document.querySelectorAll(".nav-btn").forEach((b) => b.onclick = () => switchView(b.dataset.view));
  document.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => closeSheet(b.dataset.close === "day" ? "day-sheet" : b.dataset.close));

  $("cal-prev").onclick = () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); };
  $("cal-next").onclick = () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); };
  $("cal-today").onclick = () => { calCursor = new Date(); renderCalendar(); };

  $("day-add").onclick = () => { if ($("day-input").value.trim()) { closeSheet("day-sheet"); openPreview(openDayStr, $("day-input").value); } };
  $("preview-confirm").onclick = confirmPreview;

  window.addEventListener("online", flushPending);
  window.addEventListener("offline", () => setSync("off"));
}

/* ───────── boot ───────── */
async function boot() {
  bind();
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
