// ───────────────────────────────────────────────────────────────
// Supabase connection (safe to expose — protected by Row Level Security)
//
// HOW TO REPOINT AT YOUR NEW `workout-tracker` PROJECT:
//   1. Supabase dashboard → your new project → Project Settings → API
//   2. Copy "Project URL"  → paste into `url` below
//   3. Copy "anon public" key → paste into `anonKey` below
//   (then run the schema from schema.sql in that project's SQL editor)
//
// Points at the dedicated `workout-tracker` project (ref ebxyickzytkywkxlcrlf)
// in a SEPARATE personal org — deliberately off the KatchT org so it stays free
// even after KatchT goes paid. (KatchT-HQ once held copies of the wo_* tables;
// those were empty leftovers and have been dropped — this app never used them.)
// ───────────────────────────────────────────────────────────────
window.WO_CONFIG = {
  url: "https://ebxyickzytkywkxlcrlf.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVieHlpY2t6eXRreXdreGxjcmxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTkyMzksImV4cCI6MjA5NzQ3NTIzOX0.zB1olmM_SKdenkj0IbT8MdhnhwGL0OHqXxHMbQG06DQ",
};
