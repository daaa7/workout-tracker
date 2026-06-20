// ───────────────────────────────────────────────────────────────
// Supabase connection (safe to expose — protected by Row Level Security)
//
// HOW TO REPOINT AT YOUR NEW `workout-tracker` PROJECT:
//   1. Supabase dashboard → your new project → Project Settings → API
//   2. Copy "Project URL"  → paste into `url` below
//   3. Copy "anon public" key → paste into `anonKey` below
//   (then run the schema from schema.sql in that project's SQL editor)
//
// Currently pointing at KatchT-HQ (the wo_* tables already live there) so the
// app works for testing right now. Swap these two values to migrate.
// ───────────────────────────────────────────────────────────────
window.WO_CONFIG = {
  url: "https://ebxyickzytkywkxlcrlf.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVieHlpY2t6eXRreXdreGxjcmxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTkyMzksImV4cCI6MjA5NzQ3NTIzOX0.zB1olmM_SKdenkj0IbT8MdhnhwGL0OHqXxHMbQG06DQ",
};
