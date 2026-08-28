-- ═══════════════════════════════════════════════════════════════════
--  Markets Suite — Row Level Security migration
--  Run this ONCE in the Supabase SQL Editor.
--
--  What it does:
--    • Enables RLS on every table in the public schema.
--    • Grants full access to authenticated users (anyone signed in via
--      Supabase Auth), and NO access to the anonymous (anon) role.
--
--  After this runs, the public anon key can no longer read your tables —
--  only a logged-in session can. This is what closes the security hole.
--  Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    -- Enable RLS
    execute format('alter table public.%I enable row level security;', t.tablename);

    -- Drop existing policy (so this script is re-runnable)
    execute format('drop policy if exists "authenticated_all" on public.%I;', t.tablename);

    -- Allow all actions for any authenticated user
    execute format($f$
      create policy "authenticated_all" on public.%I
        for all
        to authenticated
        using (true)
        with check (true);
    $f$, t.tablename);
  end loop;
end $$;

-- ── Verification: every row should show rowsecurity = true ──
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
