// ═══════════════════════════════════════════════════════════════════
// AUTH PATCH for assets/common.js  (Markets Suite → Supabase Auth)
// ═══════════════════════════════════════════════════════════════════
//
// WHAT TO DO:
//   1. DELETE the old login check (the sessionStorage/localStorage
//      flag redirect) and the old password-hash constant if it lives
//      in common.js.
//   2. Make sure your Supabase client is created near the top of
//      common.js as before, e.g.:
//        const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
//      (If your client variable has a different name, rename `sb`
//      below to match.)
//   3. Paste SECTION A immediately AFTER the client is created.
//   4. Paste SECTION B anywhere in common.js, and point your
//      sidebar's Logout button/link at signOut().
//   5. Bump the cache-busting version on every page:
//        assets/common.js?v=N+1
//
// ═══════════════════════════════════════════════════════════════════

// ── SECTION A: page guard ──────────────────────────────────────────
// Redirects to the login page if there is no valid session.
// Runs on every page that includes common.js (i.e. all pages except
// index.html, which has its own client + login logic).

(async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.replace('index.html');
  }
})();

// Also react if the session expires or the user signs out in
// another tab while this page is open.
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
    window.location.replace('index.html');
  }
});

// ── SECTION B: sign out ────────────────────────────────────────────
// Wire this to your sidebar Logout control, e.g.:
//   <a href="#" onclick="signOut(); return false;">Logout</a>

async function signOut() {
  await sb.auth.signOut();
  window.location.replace('index.html');
}

// ═══════════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════════
//
// • No changes needed in shares.js — the supabase-js client
//   automatically attaches the session JWT to every query once the
//   user is signed in, so all existing .from(...).select(...) calls
//   keep working, now as an authenticated user.
//
// • There is a brief moment before the async guard resolves where
//   the page shell is visible. If you want to hide content until
//   auth is confirmed, add `<body style="visibility:hidden">` and
//   set document.body.style.visibility = 'visible' inside
//   requireAuth() after the session check passes.
//
// • The old Reset Data password gate can stay as-is (it's just a UI
//   confirmation now), or you can remove the hash and rely on auth.
