/* ════════════════════════════════════════
   PHRASING SYNC CONFIG
   Single source of truth for this editor's Supabase project. Imported by
   index.html's module bridge so there is exactly one place to update if
   the project ever changes.

   Google sign-in only — no email/password auth pages in this build, so
   there's no confirmation/reset URL to derive here.

   SUPABASE_PUBLISHABLE_KEY is a "publishable" key (Supabase's modern,
   client-safe equivalent of the old "anon" key) — safe to ship in
   browser code. NEVER put a service-role key, Google client secret, or
   SMTP credential here or anywhere else in this repo.

   This editor shares its Supabase project with the separate "Personal
   Dashboard" app so both apps' users have one Auth identity — do not
   point this at a different project.
════════════════════════════════════════ */
export const SUPABASE_URL = 'https://txowrviwvulkuopmugfb.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_r8EhucgXv5nSDisLvtwW5Q_LnqS454a';

// import.meta.url always resolves to THIS file's own location regardless
// of which page imports it — so EDITOR_URL (used as Google OAuth's
// redirectTo) is always correct without needing per-deployment edits, on
// both localhost and GitHub Pages.
export const EDITOR_URL = new URL('../', import.meta.url).href;
