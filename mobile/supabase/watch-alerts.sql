-- ===== Watchlist alerts (Observation · Triage · Confirmation) =====
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Extends the existing price_alerts log so it can also hold:
--   target  — a watched stock reached its average analyst price target
--   signal  — the nightly scan changed a watched stock's signal (e.g. Emerging → Confirmed)
--   score   — the nightly scan moved a watched stock's score by 10+ points
-- The nightly scan writes signal/score alerts with pushed = false; the price-alerts Edge Function
-- (every 15 min in market hours) sends them as push notifications and marks them pushed.

alter table public.price_alerts drop constraint if exists price_alerts_direction_check;
alter table public.price_alerts add constraint price_alerts_direction_check
  check (direction in ('down','up','target','signal','score'));

alter table public.price_alerts
  add column if not exists list     text,                  -- null = holding; observation / triage / confirmation
  add column if not exists message  text,                  -- headline shown in the app and in the push
  add column if not exists route    text,                  -- where tapping the alert goes, e.g. #more/triage
  add column if not exists pushed   boolean not null default true;

create index if not exists price_alerts_unpushed_idx on public.price_alerts (pushed) where pushed = false;
notify pgrst, 'reload schema';

-- Check: should show the new rule and 4 new columns
select pg_get_constraintdef(oid) from pg_constraint where conname = 'price_alerts_direction_check';
select column_name from information_schema.columns
 where table_name = 'price_alerts' and column_name in ('list','message','route','pushed');
