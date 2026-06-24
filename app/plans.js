// ════════════════════════════════════════════════════════════════
// TackT — Guided Plans (Pro feature, with a free Level 1)
//
// A Plan is a multi-week program. Each calendar day maps to a prescribed
// workout (structured items, not shorthand — so activity/cardio durations
// survive). The Log screen shows a "Today's plan" card; "Load into today"
// prefills the real grid so the user adjusts weight/reps, then taps Log it.
//
// Self-contained like templates.js / pro.js: injects its own card + sheet +
// styles, persists to wo_plan_state, and reads app.js globals by bare name
// (STATE, DICT, todayStr, parseYmd, fmtDur, renderGrid, switchView, toast,
// upsertExercise, openPreviewItems, logsByDate, markFilled, renderSetMarks,
// saveRowDraft). The ONLY app.js dependency is those globals — no edits there.
//
// Plan content (the 3 BJJ plans below) is bundled — no DB row per plan.
// Level 1 is free (the funnel). Levels 2 & 3 go through Pro.gate('plans').
// ════════════════════════════════════════════════════════════════
window.Plans = (function () {
  const $ = (id) => document.getElementById(id);
  const sb = () => window.SB;

  // ── Exercise catalog: any abbr a plan uses → [name, category, kind] ──
  const EX = {
    SQT: ["Squats", "legs", "strength"],
    PU: ["Push-ups", "chest", "strength"],
    ROW: ["Inverted / Band Row", "back", "strength"],
    PLANK: ["Plank (sec)", "core", "strength"],
    RDL: ["Hinge / RDL", "legs", "strength"],
    LUNGE: ["Lunges", "legs", "strength"],
    OHP: ["Overhead Press", "shoulders", "strength"],
    PULL: ["Pull-ups / Band Pulls", "back", "strength"],
    CORE: ["Core Circuit", "core", "strength"],
    CARRY: ["Loaded Carry (sec)", "arms", "strength"],
    HANG: ["Dead Hang — grip (sec)", "back", "strength"],
    COND: ["Conditioning (intervals)", "cardio", "activity"],
    RUN: ["Run", "cardio", "cardio"],
    WALK: ["Walk", "cardio", "cardio"],
    STRETCH: ["Stretching", "other", "activity"],
    SHR: ["BJJ Shrimps & Bridges", "core", "activity"],
    HIP: ["Hip Mobility", "other", "activity"],
    NECK: ["Neck Routine", "other", "activity"],
    DRILL: ["BJJ Positional Drilling", "other", "activity"],
    SPAR: ["BJJ Live Rolling", "other", "activity"],
    // ── drilling / technique (used by the Drills plans; great with a dummy) ──
    SOLO: ["BJJ Solo Movement", "other", "activity"],
    DUMMY: ["BJJ Dummy Drilling", "other", "activity"],
    FLOW: ["BJJ Flow Drilling", "other", "activity"],
    SHADOW: ["BJJ Shadow Grappling", "other", "activity"],
    SCRAM: ["BJJ Scramble Drills", "other", "activity"],
  };

  // ── item builders (match the shape app.js commits) ──
  const S = (a, r, s, w) => ({ kind: "set", abbr: a, reps: r, sets: s || 1, weight: w || null, raw: `${a}x${r}x${s || 1}${w ? "@" + w : ""}` });
  const T = (a, m) => ({ kind: "set", abbr: a, reps: 0, sets: 0, duration: m, raw: `${a} ${m}min` });
  const MI = (mi, m) => ({ kind: "set", abbr: "RUN", reps: 0, sets: 0, distance: mi || null, duration: m || null, raw: `RUN ${mi ? mi + "mi " : ""}${m ? m + "min" : ""}`.trim() });
  const N = (t) => ({ kind: "note", note: t, raw: t });
  const d = (label, items, note) => ({ label, items: items || [], note: note || null });
  const REST = (note) => d("Rest", [], note || "Full rest — sleep, hydrate, recover. A 5-min easy stretch is plenty.");
  // The daily anchor that protects a returning grappler — shrimps, bridges, neck.
  const ANCHOR = () => [T("SHR", 5), T("NECK", 3)];

  // ════════════════ PLAN CONTENT ════════════════
  const PLANS = [
    {
      id: "bjj-1", sport: "BJJ", level: 1, free: true, name: "Coming Back",
      who: "Returning after a layoff — arrive conditioned & injury-proof, no rolling yet.",
      blurb: "4 weeks of bodyweight strength, intervals, and the hip/spine mobility that keeps you off the injury list. Built to peak in week 3 and taper so day one back is technique, not survival.",
      weeks: [
        // Week 1 — learn the movements, go light
        [
          d("Strength A", [S("SQT", 10, 3), S("PU", 8, 3), S("ROW", 10, 3), S("PLANK", 30, 3)]),
          d("Conditioning", [T("COND", 20)], "Easy intervals — 30s on / 90s off. Build the engine back."),
          d("Mobility + Movement", [T("SHR", 10), T("HIP", 10), T("NECK", 5)]),
          d("Strength B", [S("RDL", 10, 3), S("PULL", 6, 3), S("HANG", 30, 3), S("PLANK", 30, 3)]),
          d("Conditioning", [T("COND", 18)]),
          d("Active recovery", [MI(0, 30), T("STRETCH", 10)], "Long easy walk + a real stretch."),
          REST(),
        ],
        // Week 2 — build
        [
          d("Strength A", [S("SQT", 12, 3), S("PU", 10, 3), S("ROW", 12, 3), S("PLANK", 40, 3), ...ANCHOR()]),
          d("Conditioning", [T("COND", 25)]),
          d("Mobility + Movement", [T("SHR", 12), T("HIP", 12), T("NECK", 6)]),
          d("Strength B", [S("RDL", 12, 3), S("PULL", 7, 3), S("HANG", 35, 3), S("PLANK", 40, 3), ...ANCHOR()]),
          d("Conditioning", [T("COND", 22)]),
          d("Active recovery", [MI(0, 35), T("STRETCH", 10)]),
          REST(),
        ],
        // Week 3 — peak
        [
          d("Strength A", [S("SQT", 12, 4), S("PU", 12, 4), S("ROW", 12, 4), S("PLANK", 45, 3), ...ANCHOR()]),
          d("Conditioning", [T("COND", 30)], "5 × 5-min rounds, 1-min rest — your roll simulation."),
          d("Mobility + Movement", [T("SHR", 15), T("HIP", 15), T("NECK", 7)]),
          d("Strength B", [S("RDL", 12, 4), S("PULL", 8, 4), S("HANG", 40, 4), S("PLANK", 45, 3), ...ANCHOR()]),
          d("Conditioning", [T("COND", 28)]),
          d("Active recovery", [MI(0, 40), T("STRETCH", 12)]),
          REST(),
        ],
        // Week 4 — taper & sharpen
        [
          d("Strength A (light)", [S("SQT", 10, 3), S("PU", 10, 3), S("ROW", 10, 3), S("PLANK", 40, 2), ...ANCHOR()]),
          d("Conditioning (short)", [T("COND", 18)]),
          d("Mobility + Movement", [T("SHR", 12), T("HIP", 12), T("NECK", 6)]),
          d("Strength B (light)", [S("RDL", 10, 3), S("PULL", 6, 3), S("HANG", 35, 2)]),
          d("Sharpen", [T("COND", 15), T("SHR", 8)], "Crisp & light — arrive fresh, not beat up."),
          d("Active recovery", [MI(0, 30), T("STRETCH", 12)]),
          REST("You're ready. First class back: chase technique, not survival. Tap into a good gym and breathe."),
        ],
      ],
    },
    {
      id: "bjj-2", sport: "BJJ", level: 2, free: false, name: "Training Again",
      who: "Back on the mats 2–3×/week — build strength & gas tank around your classes.",
      blurb: "Pairs live drilling + rolling with heavier strength and grip work, periodized so your lifting supports the mat instead of fighting it. Week 4 backs off.",
      weeks: [
        [
          d("Strength (heavy-ish)", [S("SQT", 8, 4), S("RDL", 8, 3), S("PULL", 6, 4), S("CORE", 12, 3)], "Pick a load that's hard but clean — fill in your lbs."),
          d("Mat night", [T("DRILL", 20), T("SPAR", 30), ...ANCHOR()]),
          d("Conditioning + mobility", [T("COND", 25), T("HIP", 10)]),
          d("Strength", [S("LUNGE", 10, 3), S("ROW", 10, 4), S("OHP", 8, 3), S("HANG", 40, 3)]),
          d("Mat night", [T("DRILL", 20), T("SPAR", 30), ...ANCHOR()]),
          d("Open mat / recovery", [T("SPAR", 40)], "Open mat if your body's good — otherwise a 40-min walk."),
          REST(),
        ],
        [
          d("Strength", [S("SQT", 6, 4), S("RDL", 6, 4), S("PULL", 8, 4), S("CORE", 15, 3)]),
          d("Mat night", [T("DRILL", 20), T("SPAR", 35), ...ANCHOR()]),
          d("Conditioning + mobility", [T("COND", 28), T("HIP", 10)]),
          d("Strength", [S("LUNGE", 12, 3), S("ROW", 12, 4), S("OHP", 8, 4), S("HANG", 45, 3)]),
          d("Mat night", [T("DRILL", 20), T("SPAR", 35), ...ANCHOR()]),
          d("Open mat / recovery", [T("SPAR", 45)]),
          REST(),
        ],
        [
          d("Strength (peak)", [S("SQT", 5, 5), S("RDL", 5, 4), S("PULL", 8, 5), S("CORE", 15, 4)]),
          d("Mat night", [T("DRILL", 15), T("SPAR", 45), ...ANCHOR()]),
          d("Conditioning + mobility", [T("COND", 32), T("HIP", 12)]),
          d("Strength", [S("LUNGE", 12, 4), S("ROW", 12, 4), S("OHP", 6, 5), S("HANG", 50, 4)]),
          d("Mat night", [T("DRILL", 15), T("SPAR", 45), ...ANCHOR()]),
          d("Open mat", [T("SPAR", 50)]),
          REST(),
        ],
        [
          d("Strength (deload)", [S("SQT", 8, 2), S("RDL", 8, 2), S("PULL", 6, 3)]),
          d("Mat night (flow)", [T("DRILL", 20), T("SPAR", 25), ...ANCHOR()]),
          d("Conditioning (short)", [T("COND", 20), T("HIP", 10)]),
          d("Strength (light)", [S("LUNGE", 10, 2), S("ROW", 10, 3), S("HANG", 40, 2)]),
          d("Mat night (flow)", [T("DRILL", 20), T("SPAR", 25), ...ANCHOR()]),
          d("Recovery", [MI(0, 35), T("STRETCH", 12)]),
          REST("Sharp and recovered. Keep this rhythm or roll into Competition Prep when a match is on the calendar."),
        ],
      ],
    },
    {
      id: "bjj-3", sport: "BJJ", level: 3, free: false, name: "Competition Prep",
      who: "A match is coming — peak your output, then taper to be dangerous on the day.",
      blurb: "High-volume hard rounds, advanced drilling, and power-biased strength, periodized to peak in week 3 and taper hard in week 4 so you step on the mat fast and fresh.",
      weeks: [
        [
          d("Power", [S("SQT", 5, 5), S("RDL", 5, 4), S("PULL", 8, 4), T("CARRY", 4), ...ANCHOR()]),
          d("Hard rounds", [T("DRILL", 15), T("SPAR", 50)], "8–10 × 5-min rounds. Match the pace you'll face."),
          d("Conditioning", [T("COND", 35), T("HIP", 10)]),
          d("Strength", [S("OHP", 5, 4), S("ROW", 8, 4), S("LUNGE", 10, 4), S("HANG", 50, 4)]),
          d("Comp simulation", [T("SPAR", 45)], "Full-intensity rounds with comp rules & timing."),
          d("Drill + flow", [T("DRILL", 30), T("SPAR", 20), ...ANCHOR()]),
          REST(),
        ],
        [
          d("Power", [S("SQT", 4, 5), S("RDL", 4, 5), S("PULL", 8, 5), T("CARRY", 5), ...ANCHOR()]),
          d("Hard rounds", [T("DRILL", 15), T("SPAR", 55)]),
          d("Conditioning", [T("COND", 38), T("HIP", 10)]),
          d("Strength", [S("OHP", 5, 5), S("ROW", 8, 5), S("LUNGE", 10, 4), S("HANG", 55, 4)]),
          d("Comp simulation", [T("SPAR", 50)]),
          d("Drill + flow", [T("DRILL", 30), T("SPAR", 25), ...ANCHOR()]),
          REST(),
        ],
        [
          d("Power (peak)", [S("SQT", 3, 5), S("RDL", 3, 5), S("PULL", 10, 5), T("CARRY", 6), ...ANCHOR()]),
          d("Hard rounds (peak)", [T("DRILL", 10), T("SPAR", 60)], "Peak volume. After this week, you only sharpen."),
          d("Conditioning (peak)", [T("COND", 40), T("HIP", 12)]),
          d("Strength", [S("OHP", 4, 5), S("ROW", 6, 5), S("LUNGE", 8, 5), S("HANG", 60, 4)]),
          d("Comp simulation", [T("SPAR", 55)]),
          d("Drill + flow", [T("DRILL", 25), T("SPAR", 25), ...ANCHOR()]),
          REST(),
        ],
        [
          d("Sharpen (light power)", [S("SQT", 3, 2), S("PULL", 5, 3), ...ANCHOR()]),
          d("Sharp rounds", [T("DRILL", 15), T("SPAR", 25)], "Crisp, not exhausting. Stay fast."),
          d("Mobility flush", [T("HIP", 12), T("SHR", 10), T("NECK", 6)]),
          d("Movement only", [T("DRILL", 20)], "Your A-game positions, light. No grinding."),
          d("Pre-comp flow", [T("SPAR", 15)], "A few easy flow rounds. Then rest fully."),
          REST("Day before / comp day — full rest, hydrate, mobility. You did the work. Go compete."),
          REST(),
        ],
      ],
    },

    // ════════════════ DRILLS family (technique / dummy) ════════════════
    {
      id: "drills-1", sport: "BJJ Drills", level: 1, free: true, name: "Learning to Move",
      who: "New-ish to BJJ — build the movements, muscle memory & positions. Great with a dummy.",
      blurb: "A 4-week technique course modeled on the classic arc: learn to move (hips!), then positions, escapes, attacks, and tying it all into flow — with mobility woven through so you stay injury-free. Most days drill solo or on a grappling dummy.",
      weeks: [
        // Week 1 — learning to move (hips)
        [
          d("Hips & movement (solo)", [T("SOLO", 15)], "Shrimp (hip escape), bridge, technical stand-up, granby roll, sit-through. Slow & smooth — quality over speed. Big emphasis on the hips."),
          d("The 4 base positions (dummy)", [T("DUMMY", 15)], "Mount, closed guard, side control, back. Hold each — feel the key control points from the top and bottom."),
          d("Mobility & flexibility", [T("HIP", 10), T("STRETCH", 10)], "Test hips, ankles, hamstrings, shoulders. Never skip stretching."),
          d("Movement under contact (dummy)", [T("DUMMY", 20)], "Shrimp out from under the dummy in mount & side control. Frame → hip → recover space."),
          d("More movement (solo)", [T("SOLO", 15)], "Add forward/back rolls, leg pummel, hip switch, sprawl. String 2–3 together."),
          d("Flow + light cardio", [T("FLOW", 12), T("COND", 12)], "Chain the week's movements slowly, then easy conditioning."),
          REST(),
        ],
        // Week 2 — escapes & guard basics
        [
          d("Mount escapes (dummy)", [T("DUMMY", 20)], "Elbow-knee escape & bridge-and-roll (upa). Neck protected, elbows tight, bridge into the trapped side."),
          d("Side-control escapes (dummy)", [T("DUMMY", 20)], "Get to your side, frame, hip-escape to recover guard; ghost escape. Never roll your back away."),
          d("Mobility & injury prevention", [T("HIP", 12), T("STRETCH", 10)], "Joint mobility — knees, hips, shoulders, neck."),
          d("Closed guard basics (dummy)", [T("DUMMY", 20)], "Break posture, dominate grips, hip-bump sweep, scissor sweep. Open guard on your terms."),
          d("Escapes flow (solo + dummy)", [T("SOLO", 10), T("DUMMY", 12)], "Survive → frame → hip → recover. Both sides."),
          d("Flow", [T("FLOW", 15)], "Escape → recover guard → sweep. One smooth chain."),
          REST(),
        ],
        // Week 3 — attacks
        [
          d("Mount attacks (dummy)", [T("DUMMY", 20)], "Americana, americana → armlock, Ezekiel choke. L-shape, isolate the arm, stay heavy."),
          d("Closed-guard attacks (dummy)", [T("DUMMY", 20)], "Armbar, triangle, kimura, omoplata from closed guard — ~10/side each."),
          d("Mobility", [T("HIP", 12), T("STRETCH", 10)]),
          d("Side-control attacks (dummy)", [T("DUMMY", 20)], "North-south armbar & kimura; knee-on-belly to armbar / choke."),
          d("Back control (dummy)", [T("DUMMY", 18)], "Seatbelt + hooks (never cross feet), isolate the arm, rear chokes. Defense: shrug, chin tuck, peel off."),
          d("Flow", [T("FLOW", 15), T("COND", 10)], "Pass → control → attack. Slow, deliberate chain."),
          REST(),
        ],
        // Week 4 — make it your game
        [
          d("Game-specific drills (solo)", [T("SOLO", 15)], "180° hip drill, hip-shift into triangle, set up for an armlock. More dynamic now."),
          d("Chain drilling (dummy)", [T("DUMMY", 20)], "Closed-guard armbar → triangle → omoplata. Switch when the 'opponent' defends."),
          d("Mobility", [T("HIP", 12), T("STRETCH", 12)]),
          d("Implement under movement (dummy)", [T("DUMMY", 20)], "While moving the dummy: hip escape, shoulder roll, change base → into a sweep or sub."),
          d("Rolling simulation (flow)", [T("FLOW", 18), T("SHADOW", 10)], "Tie the whole course together. Move like it's live."),
          d("Light flow + mobility", [T("FLOW", 12), T("STRETCH", 10)]),
          REST("Course complete — these movements are yours now. Bring them out when you roll."),
        ],
      ],
    },
    {
      id: "drills-2", sport: "BJJ Drills", level: 2, free: false, name: "Chaining the Game",
      who: "Know the positions — now link them: sweeps → passes → submissions, and the back system.",
      blurb: "Stops drilling moves in isolation and starts wiring them into sequences — the way the game actually flows. Sweep-to-pass-to-submit, escape-to-counter, the back system, and takedown entries.",
      weeks: [
        [
          d("Sweep → pass chains (dummy)", [T("DUMMY", 22)], "Hip-bump sweep → land in mount → secure. Scissor sweep → knee-slide pass."),
          d("Pass → control → attack (dummy)", [T("DUMMY", 22)], "Toreando / knee-cut pass → side control → mount → americana."),
          d("Guard retention (dummy)", [T("DUMMY", 18), T("HIP", 10)], "Reguard vs the pass: frames, shrimp, knee-shield recovery."),
          d("Back system (dummy)", [T("DUMMY", 20)], "Take the back from turtle & mount; maintain seatbelt + hooks; RNC chain."),
          d("Takedown entries (shadow/solo)", [T("SHADOW", 15), T("SOLO", 10)], "Penetration step, level change, snap-down to the back."),
          d("Flow", [T("FLOW", 18)], "Sweep → pass → submit in one breath."),
          REST(),
        ],
        [
          d("Escape → counter chains (dummy)", [T("DUMMY", 22)], "Mount escape → recover guard → immediate hip-bump sweep."),
          d("Submission chains (dummy)", [T("DUMMY", 22)], "Armbar ↔ triangle ↔ omoplata. Flow between them as the defense changes."),
          d("Mobility + conditioning", [T("HIP", 12), T("COND", 18)]),
          d("Half-guard system (dummy)", [T("DUMMY", 20)], "Underhook, knee-shield, sweep to top; pass the half from the top."),
          d("Takedowns → pass (shadow)", [T("SHADOW", 15), T("DUMMY", 10)], "Entry → finish → settle → pass."),
          d("Flow", [T("FLOW", 18), T("COND", 8)]),
          REST(),
        ],
        [
          d("Full sequence (dummy)", [T("DUMMY", 25)], "Takedown → pass → mount → back → finish. Peak volume this week."),
          d("Back attacks (dummy)", [T("DUMMY", 22)], "RNC, bow-and-arrow, armbar from the back; recover hooks when they defend."),
          d("Mobility", [T("HIP", 12), T("STRETCH", 10)]),
          d("Guard attacks under pressure (dummy)", [T("DUMMY", 22)], "Attack while they posture & pass — never stop threatening."),
          d("Scramble entries (scramble)", [T("SCRAM", 18), T("SHADOW", 10)], "Sprawl → front headlock → back; guard recovery scrambles."),
          d("Flow", [T("FLOW", 20)]),
          REST(),
        ],
        [
          d("Sharp chains (dummy)", [T("DUMMY", 18)], "Your two best sequences, crisp and fast. Light volume."),
          d("Flow only", [T("FLOW", 18)], "Smooth, continuous, no grinding."),
          d("Mobility flush", [T("HIP", 12), T("STRETCH", 12)]),
          d("Movement + light drilling", [T("SOLO", 12), T("DUMMY", 12)]),
          d("Easy flow", [T("FLOW", 15)]),
          d("Recovery", [MI(0, 30), T("STRETCH", 10)]),
          REST("Chains are wiring in. Move to Flow & Reaction when sequences feel automatic."),
        ],
      ],
    },
    {
      id: "drills-3", sport: "BJJ Drills", level: 3, free: false, name: "Flow & Reaction",
      who: "Sequences are automatic — now train reaction, scrambles, and decision-making at pace.",
      blurb: "The dynamic, game-specific phase: continuous positional flow, scramble drilling, if-this-then-that reaction chains, and points-aware comp simulation so the right move fires without thinking.",
      weeks: [
        [
          d("Scramble drills", [T("SCRAM", 20)], "Sprawl → front headlock → back; guard-recovery scrambles; reset & repeat at pace."),
          d("Reaction chains (dummy)", [T("DUMMY", 22)], "If-this-then-that: they defend armbar → triangle → omoplata → take the back."),
          d("Mobility + conditioning", [T("HIP", 10), T("COND", 20)]),
          d("Positional flow (dummy)", [T("DUMMY", 22)], "Continuous: mount → back → sub → they escape → re-pass. No stopping."),
          d("Comp simulation (shadow/flow)", [T("SHADOW", 15), T("FLOW", 15)], "Match pace, points-aware: 2 for the sweep, 3 for the pass, 4 for mount/back."),
          d("Live-feel flow", [T("FLOW", 20)]),
          REST(),
        ],
        [
          d("Scramble + back exposure", [T("SCRAM", 22)], "Turn every scramble into a back-take or a recovery — no neutral."),
          d("Reaction speed (dummy)", [T("DUMMY", 24)], "Shorten the gap between defense read and your counter."),
          d("Mobility + conditioning", [T("HIP", 12), T("COND", 24)]),
          d("Flow chains (dummy)", [T("DUMMY", 22)], "3-move chains in both directions, fluid."),
          d("Comp simulation", [T("FLOW", 20), T("SHADOW", 12)]),
          d("Live-feel flow", [T("FLOW", 22)]),
          REST(),
        ],
        [
          d("Peak scrambles", [T("SCRAM", 25)], "Highest intensity / volume of the plan. After this, you sharpen."),
          d("Reaction chains (peak)", [T("DUMMY", 25)], "Full sequences at speed, both sides."),
          d("Conditioning (peak)", [T("COND", 30), T("HIP", 10)]),
          d("Continuous flow (dummy)", [T("DUMMY", 24)], "10 unbroken minutes, then reset — twice."),
          d("Comp simulation (peak)", [T("FLOW", 22), T("SHADOW", 15)]),
          d("Live-feel flow", [T("FLOW", 22)]),
          REST(),
        ],
        [
          d("Sharp scrambles", [T("SCRAM", 15)], "Crisp & fast, low volume."),
          d("A-game chains only", [T("DUMMY", 15)], "Your money sequences, nothing else."),
          d("Mobility flush", [T("HIP", 12), T("STRETCH", 12)]),
          d("Light flow", [T("FLOW", 15)]),
          d("Easy movement", [T("SOLO", 12)]),
          d("Recovery", [MI(0, 30), T("STRETCH", 10)]),
          REST("Fast, sharp, reactive. Cycle back to any plan or keep flowing on your own."),
        ],
      ],
    },
  ];

  const byId = (id) => PLANS.find((p) => p.id === id) || null;

  // ── persisted active plan ─────────────────────────────────────
  const CACHE = "wo_plan_state_cache";
  let ACTIVE = null; // { plan_id, start_date }

  async function load() {
    try {
      const { data, error } = await sb().from("wo_plan_state")
        .select("plan_id,start_date").maybeSingle();
      if (error) throw error;
      ACTIVE = data ? { plan_id: data.plan_id, start_date: data.start_date } : null;
      localStorage.setItem(CACHE, JSON.stringify(ACTIVE));
    } catch (e) {
      try { ACTIVE = JSON.parse(localStorage.getItem(CACHE)) || null; } catch (_) { ACTIVE = null; }
    }
    renderToday();
  }

  async function saveState(plan_id, start_date) {
    ACTIVE = { plan_id, start_date };
    localStorage.setItem(CACHE, JSON.stringify(ACTIVE));
    let uid = null;
    try { uid = (await sb().auth.getUser()).data.user?.id || null; } catch (e) {}
    try {
      const { error } = await sb().from("wo_plan_state")
        .upsert({ user_id: uid, plan_id, start_date, updated_at: new Date().toISOString() });
      if (error) throw error;
    } catch (e) { /* offline → cache holds it; syncs next time they start/restart */ }
  }

  async function clearState() {
    ACTIVE = null;
    localStorage.setItem(CACHE, JSON.stringify(null));
    let uid = null;
    try { uid = (await sb().auth.getUser()).data.user?.id || null; } catch (e) {}
    try { if (uid) await sb().from("wo_plan_state").delete().eq("user_id", uid); } catch (e) {}
  }

  // ── day mapping (calendar-anchored to start_date) ─────────────
  function dayDiff(a, b) {
    const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((A - B) / 86400000);
  }
  function dayInfo() {
    if (!ACTIVE) return { status: "none" };
    const plan = byId(ACTIVE.plan_id);
    if (!plan) return { status: "none" };
    const start = (typeof parseYmd === "function") ? parseYmd(ACTIVE.start_date) : new Date(ACTIVE.start_date);
    const today = (typeof parseYmd === "function") ? parseYmd(todayStr()) : new Date();
    const dayNum = dayDiff(today, start);
    const total = plan.weeks.length * 7;
    if (dayNum < 0) return { status: "active", plan, wi: 0, di: 0, dayNum: 0, total, day: plan.weeks[0][0] };
    if (dayNum >= total) return { status: "complete", plan, total };
    const wi = Math.floor(dayNum / 7), di = dayNum % 7;
    const day = plan.weeks[wi][di];
    const loggedToday = (typeof logsByDate === "function") && logsByDate(todayStr()).length > 0;
    return { status: day.items.length ? "active" : "rest", plan, wi, di, dayNum, total, day, loggedToday };
  }

  // ── make sure every move a plan uses is in the dictionary ─────
  async function ensureExercises(plan) {
    const abbrs = new Set();
    plan.weeks.forEach((wk) => wk.forEach((day) => day.items.forEach((it) => { if (it.kind === "set" && it.abbr) abbrs.add(it.abbr); })));
    for (const ab of abbrs) {
      const known = window.DICT && DICT[ab];
      if (!known && EX[ab] && typeof upsertExercise === "function") {
        await upsertExercise(ab, EX[ab][0], EX[ab][1], EX[ab][2]);
      }
    }
    if (typeof renderGrid === "function") renderGrid();
  }

  // ── actions ───────────────────────────────────────────────────
  async function start(planId) {
    const p = byId(planId);
    if (!p) return;
    if (!p.free && window.Pro && !Pro.gate("plans")) return; // paywall for L2/L3
    await ensureExercises(p);
    await saveState(planId, todayStr());
    closeSheet();
    renderToday();
    if (window.toast) toast(`Started “${p.sport} · ${p.name}” 🥋 — today's session is on your Log.`);
  }
  async function restart() {
    if (!ACTIVE) return;
    await saveState(ACTIVE.plan_id, todayStr());
    renderToday();
    if (window.toast) toast("Plan re-anchored to today — fresh Week 1, Day 1.");
  }
  async function quit() {
    if (!confirm("Quit this plan? Your logged workouts stay — only the plan guide goes away.")) return;
    await clearState();
    renderToday();
    if (window.toast) toast("Plan cleared. You can pick another anytime.");
  }

  // ── load today's prescription into the real Log grid ──────────
  function loadToday() {
    const info = dayInfo();
    if (!info.day || !info.day.items.length) { if (window.toast) toast("Nothing prescribed today — enjoy the rest."); return; }
    window.TPL_FILTER = null;
    if (typeof renderGrid === "function") renderGrid();
    const grid = $("ex-grid");
    if (!grid) return;
    const rows = [...grid.querySelectorAll(".ex-row")];
    let filled = 0;
    info.day.items.forEach((it) => {
      if (it.kind !== "set") return;
      const row = rows.find((r) => r.dataset.abbr === it.abbr);
      if (!row) return;
      const kind = row.dataset.kind;
      const set = (sel, v) => { const el = row.querySelector(sel); if (el && v != null && v !== "") el.value = v; };
      if (kind === "cardio" || kind === "activity") {
        const dur = it.duration || 0, hr = Math.floor(dur / 60), mn = dur % 60;
        if (hr) set(".ex-hr", hr);
        if (mn) set(".ex-min", mn);
        if (kind === "cardio" && it.distance) set(".ex-dist", it.distance);
      } else {
        set(".ex-reps", it.reps || "");
        if (it.weight) set(".ex-wt", it.weight);
        const tap = row.querySelector(".set-tap");
        if (tap) { tap.dataset.count = it.sets || 1; if (typeof renderSetMarks === "function") renderSetMarks(tap); }
        else set(".ex-sets", it.sets || 1);
      }
      if (typeof markFilled === "function") markFilled(row);
      if (typeof saveRowDraft === "function") saveRowDraft(row);
      filled++;
    });
    if (typeof switchView === "function") switchView("log");
    document.querySelector(".log-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.toast) toast(filled ? `Loaded ${filled} moves — set your weight, then tap “Log it →”` : "Couldn't match today's moves to your list.");
  }

  function logRest() {
    if (typeof openPreviewItems === "function") openPreviewItems(todayStr(), [N("Rest day · plan")]);
  }

  // ── today card (top of the Log view) ──────────────────────────
  function host() {
    let h = $("plan-today");
    if (h) return h;
    const log = $("view-log");
    if (!log) return null;
    h = document.createElement("div");
    h.id = "plan-today";
    h.className = "pl-card";
    const quote = $("quote-card");
    if (quote && quote.nextSibling) log.insertBefore(h, quote.nextSibling);
    else log.insertBefore(h, log.firstChild);
    return h;
  }

  function moveText(it) {
    if (it.kind === "note") return it.note;
    const nm = (window.DICT && DICT[it.abbr] && DICT[it.abbr].name) || (EX[it.abbr] && EX[it.abbr][0]) || it.abbr;
    if (it.duration || it.distance) {
      const bits = [];
      if (it.distance) bits.push(it.distance + " mi");
      if (it.duration) bits.push(typeof fmtDur === "function" ? fmtDur(it.duration) : it.duration + "m");
      return `${nm} · ${bits.join(" · ")}`;
    }
    return `${nm} · ${it.reps}×${it.sets}${it.weight ? " @" + it.weight : ""}`;
  }

  function renderToday() {
    const h = host();
    if (!h) return;
    const info = dayInfo();

    if (info.status === "none") {
      h.className = "pl-card pl-slim";
      h.innerHTML = `<div class="pl-slim-row"><span class="pl-tag">🥋 Guided Plans</span>
        <span class="pl-slim-txt">Follow a proven program — get back to BJJ shape.</span>
        <button class="pl-link" data-pl="browse">Browse plans →</button></div>`;
      wire(h);
      return;
    }

    if (info.status === "complete") {
      h.className = "pl-card";
      h.innerHTML = `<div class="pl-head"><b>🎉 Plan complete</b><span class="pl-sub">${esc(info.plan.sport)} · ${esc(info.plan.name)}</span></div>
        <p class="pl-note">Nice work — you finished all ${info.total} days. Run it again or step up a level.</p>
        <div class="pl-actions"><button class="btn btn-primary btn-sm" data-pl="restart">Start again →</button>
        <button class="pl-link" data-pl="browse">Browse plans</button>
        <button class="pl-link" data-pl="quit">Clear</button></div>`;
      wire(h);
      return;
    }

    const wk = info.wi + 1, dy = info.di + 1, lvl = info.plan.level;
    const head = `<div class="pl-head">
        <b>${esc(info.plan.sport)} · ${esc(info.plan.name)}</b>
        <span class="pl-lvlbadge">L${lvl}</span>
        ${info.loggedToday ? `<span class="pl-done">✓ logged today</span>` : ""}
      </div>
      <div class="pl-when">Week ${wk} · Day ${dy} — <span class="pl-focus">${esc(info.day.label)}</span></div>`;

    if (info.status === "rest") {
      h.className = "pl-card pl-rest";
      h.innerHTML = head +
        `<p class="pl-note">🛌 ${esc(info.day.note || "Rest day — recover.")}</p>
         <div class="pl-actions"><button class="btn btn-ghost btn-sm" data-pl="rest">Mark rest logged ✓</button>
         ${miniBtns()}</div>`;
      wire(h);
      return;
    }

    h.className = "pl-card";
    const list = info.day.items.map((it) =>
      it.kind === "note" ? `<li class="pl-mv pl-mv-note">${esc(it.note)}</li>` : `<li class="pl-mv">${esc(moveText(it))}</li>`
    ).join("");
    h.innerHTML = head +
      `<ul class="pl-moves">${list}</ul>
       ${info.day.note ? `<p class="pl-note">${esc(info.day.note)}</p>` : ""}
       <button class="btn btn-primary btn-sm pl-load" data-pl="load">Load into today's log →</button>
       <div class="pl-actions">${miniBtns()}</div>`;
    wire(h);
  }

  function miniBtns() {
    return `<button class="pl-link" data-pl="restart">Restart</button>
      <button class="pl-link" data-pl="browse">Change</button>
      <button class="pl-link" data-pl="quit">Quit</button>`;
  }

  function wire(root) {
    root.querySelectorAll("[data-pl]").forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.pl;
        if (a === "browse") openSheet();
        else if (a === "load") loadToday();
        else if (a === "rest") logRest();
        else if (a === "restart") restart();
        else if (a === "quit") quit();
      };
    });
  }

  // ── browser sheet (list + detail) ─────────────────────────────
  function ensureSheet() {
    if ($("pl-sheet")) return;
    const wrap = document.createElement("div");
    wrap.id = "pl-sheet";
    wrap.className = "sheet-wrap hidden";
    wrap.innerHTML = `
      <div class="sheet-backdrop" data-pl-close></div>
      <div class="sheet pl-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><h2 id="pl-sheet-title">Guided Plans</h2>
          <button class="iconbtn" data-pl-close>✕</button></div>
        <div id="pl-body" class="pl-body"></div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-pl-close]").forEach((b) => b.addEventListener("click", closeSheet));
  }
  function openSheet() { ensureSheet(); renderList(); $("pl-sheet").classList.remove("hidden"); }
  function closeSheet() { const s = $("pl-sheet"); if (s) s.classList.add("hidden"); }

  function renderList() {
    $("pl-sheet-title").textContent = "Guided Plans";
    const pro = window.Pro && Pro.isPro && Pro.isPro();
    $("pl-body").innerHTML = `
      <p class="pl-intro">Multi-week programs that tell you exactly what to do each day, then load it onto your Log in one tap.</p>
      ${PLANS.map((p) => {
        const active = ACTIVE && ACTIVE.plan_id === p.id;
        const locked = !p.free && !pro;
        return `<button class="pl-listitem${active ? " on" : ""}" data-open="${p.id}">
          <div class="pl-li-top"><span class="pl-lvlbadge">L${p.level}</span>
            <b>${esc(p.sport)} · ${esc(p.name)}</b>
            ${p.free ? `<span class="pl-free">FREE</span>` : `<span class="pl-pro">${locked ? "◆ PRO" : "◆ PRO ✓"}</span>`}
            ${active ? `<span class="pl-done">active</span>` : ""}</div>
          <div class="pl-li-who">${esc(p.who)}</div>
          <div class="pl-li-meta">${p.weeks.length} weeks · ${p.weeks.length * 7} days</div>
        </button>`;
      }).join("")}`;
    $("pl-body").querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => renderDetail(byId(b.dataset.open))));
  }

  function renderDetail(p) {
    if (!p) return;
    $("pl-sheet-title").textContent = `${p.sport} · ${p.name}`;
    const pro = window.Pro && Pro.isPro && Pro.isPro();
    const locked = !p.free && !pro;
    const active = ACTIVE && ACTIVE.plan_id === p.id;
    const weeks = p.weeks.map((wk, i) => {
      const focus = wk.map((day) => day.items.length ? day.label : "Rest");
      return `<div class="pl-wk"><b>Week ${i + 1}</b><span>${focus.map(esc).join(" · ")}</span></div>`;
    }).join("");
    $("pl-body").innerHTML = `
      <button class="pl-back" data-back>‹ All plans</button>
      <div class="pl-detail-head"><span class="pl-lvlbadge">L${p.level}</span>
        ${p.free ? `<span class="pl-free">FREE</span>` : `<span class="pl-pro">◆ PRO</span>`}</div>
      <p class="pl-blurb">${esc(p.blurb)}</p>
      <div class="pl-weeks">${weeks}</div>
      <p class="pl-fine">Each day loads onto your Log so you can set your own weight before saving. It anchors to today — miss a day and just pick up where the calendar lands, or Restart to re-anchor.</p>
      <button class="btn btn-primary pl-start" data-start="${p.id}">
        ${active ? "Restart this plan" : locked ? "Unlock with Pro & start" : "Start this plan"}
      </button>`;
    $("pl-body").querySelector("[data-back]").addEventListener("click", renderList);
    $("pl-body").querySelector("[data-start]").addEventListener("click", () => start(p.id));
  }

  // ── styles (injected so the module stays self-contained) ──────
  function injectStyles() {
    if ($("pl-styles")) return;
    const s = document.createElement("style");
    s.id = "pl-styles";
    s.textContent = `
      .pl-card{background:var(--card,#171a21);border:1px solid var(--line,#262b36);border-radius:16px;padding:14px 16px;margin:0 0 14px}
      .pl-card.pl-rest{opacity:.95}
      .pl-slim{padding:10px 14px}
      .pl-slim-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .pl-tag{font-weight:700;font-size:13px}
      .pl-slim-txt{color:var(--mut,#8b93a4);font-size:13px;flex:1;min-width:120px}
      .pl-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .pl-head b{font-size:16px}
      .pl-head .pl-sub{color:var(--mut,#8b93a4);font-size:13px}
      .pl-lvlbadge{font-size:11px;font-weight:800;letter-spacing:.04em;background:var(--amber2,#e0a64a);color:#1a1205;border-radius:6px;padding:1px 6px}
      .pl-done{font-size:11px;font-weight:700;color:#5fd08a;background:rgba(95,208,138,.12);border-radius:6px;padding:1px 7px}
      .pl-when{color:var(--mut,#8b93a4);font-size:13px;margin:6px 0 2px}
      .pl-focus{color:var(--fg,#e8ebf0);font-weight:600}
      .pl-moves{list-style:none;margin:8px 0 4px;padding:0;display:flex;flex-direction:column;gap:4px}
      .pl-mv{font-size:14px;padding:5px 10px;background:var(--bg2,#11141a);border-radius:8px}
      .pl-mv-note{color:var(--mut,#8b93a4);font-style:italic;background:none;padding:2px 0}
      .pl-note{color:var(--mut,#8b93a4);font-size:13px;line-height:1.45;margin:8px 0}
      .pl-load{width:100%;margin:8px 0 2px}
      .pl-actions{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px}
      .pl-link{background:none;border:none;color:var(--amber2,#e0a64a);font-size:13px;font-weight:600;cursor:pointer;padding:2px 0}
      .pl-link:hover{text-decoration:underline}
      .pl-body{padding:4px 2px 8px}
      .pl-intro,.pl-blurb,.pl-fine{color:var(--mut,#8b93a4);font-size:13.5px;line-height:1.5}
      .pl-fine{font-size:12px;margin-top:10px}
      .pl-listitem{display:block;width:100%;text-align:left;background:var(--bg2,#11141a);border:1px solid var(--line,#262b36);border-radius:14px;padding:12px 14px;margin-bottom:10px;cursor:pointer;color:inherit}
      .pl-listitem.on{border-color:var(--amber2,#e0a64a)}
      .pl-li-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .pl-li-top b{font-size:15px}
      .pl-li-who{color:var(--mut,#8b93a4);font-size:13px;margin:6px 0 4px}
      .pl-li-meta{color:var(--mut,#8b93a4);font-size:12px}
      .pl-free{font-size:10px;font-weight:800;color:#5fd08a;border:1px solid rgba(95,208,138,.4);border-radius:6px;padding:1px 6px}
      .pl-pro{font-size:10px;font-weight:800;color:var(--amber2,#e0a64a);border:1px solid rgba(224,166,74,.4);border-radius:6px;padding:1px 6px}
      .pl-back{background:none;border:none;color:var(--amber2,#e0a64a);font-size:14px;cursor:pointer;padding:4px 0;margin-bottom:6px}
      .pl-detail-head{display:flex;gap:8px;align-items:center;margin-bottom:8px}
      .pl-weeks{display:flex;flex-direction:column;gap:6px;margin:12px 0}
      .pl-wk{display:flex;gap:10px;font-size:13px;background:var(--bg2,#11141a);border-radius:8px;padding:8px 10px}
      .pl-wk b{min-width:62px}
      .pl-wk span{color:var(--mut,#8b93a4)}
      .pl-start{width:100%;margin-top:6px}`;
    document.head.appendChild(s);
  }

  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ── init ──────────────────────────────────────────────────────
  function init() {
    injectStyles();
    host();
    renderToday();
    // refresh the card whenever the Log view is shown (catches "logged today ✓")
    document.querySelectorAll(".nav-btn[data-view=log]").forEach((b) =>
      b.addEventListener("click", () => setTimeout(renderToday, 0)));
    // load active plan once auth is ready, and on every auth change
    if (sb() && sb().auth && sb().auth.onAuthStateChange) {
      sb().auth.onAuthStateChange((evt, session) => { if (session) load(); else { ACTIVE = null; renderToday(); } });
    }
    load();
    document.addEventListener("tackt:pro-change", renderToday);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { open: openSheet, start, quit, loadToday, refresh: renderToday, PLANS };
})();
