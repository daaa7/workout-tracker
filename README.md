# GROOVE — Workout Log

A phone-first workout tracker. Log workouts in shorthand the way you wrote them on paper
(`BPx20x4, Cx15, SQTx30x|||`), see a calendar grid, streaks, totals, and a daily quote.
Free to host on GitHub Pages, syncs across phone + computer via Supabase.

## Log shorthand
- `BPx20x4` → Bench Press, 20 reps, 4 sets
- `Cx15` → Crunches, 15 reps, 1 set
- `SQTx30x|||` → Squats, 30 reps, 3 sets (tally marks work too)
- `100Cx||||` → 100 Crunches, 4 sets (reps-first also parses)
- `10 min run`, `REST`, `OFF` → logged as a note for the day
- Separate moves with **commas**. Unknown abbreviation? It asks you to name it once, then remembers.

## Files
| File | What |
|---|---|
| `index.html` / `styles.css` / `app.js` | the app |
| `config.js` | Supabase URL + anon key (swap to repoint at a project) |
| `schema.sql` | run once in a fresh Supabase project to create the tables |
| `manifest.json` / `sw.js` / `icon.svg` | PWA (installs to home screen, opens offline) |

## Point it at your own Supabase project
1. Supabase → your project → **Project Settings → API**: copy **Project URL** + **anon public** key.
2. Paste both into `config.js`.
3. Supabase → **SQL Editor** → paste `schema.sql` → **Run**.

## Deploy free on GitHub Pages
```bash
git init
git add .
git commit -m "GROOVE workout tracker"
git branch -M main
git remote add origin https://github.com/<you>/workout-tracker.git
git push -u origin main
```
Then on GitHub: **Settings → Pages → Source: `main` / root → Save.**
Your app: `https://<you>.github.io/workout-tracker/` — open it on your phone and
**Add to Home Screen** to use it like a native app.

## Auth
Email + password. Create the account once; log in with the same credentials on every device —
same data everywhere, survives clearing your browser.
```
