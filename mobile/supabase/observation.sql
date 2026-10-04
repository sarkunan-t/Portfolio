-- ===== Observation list (third stage on the watchlist) =====
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Lets scan_watch hold stage 'observation' (stocks you add by hand, US or Bursa e.g. 1155.KL).
alter table public.scan_watch drop constraint if exists scan_watch_stage_check;
alter table public.scan_watch add constraint scan_watch_stage_check
  check (stage in ('observation','triage','confirmation'));
notify pgrst, 'reload schema';

-- Check: should show the new rule with all three stages
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.scan_watch'::regclass and conname = 'scan_watch_stage_check';
