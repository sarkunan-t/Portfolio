-- ===== UnicornHunter / Markets Suite — Triage & confirmation watchlist =====
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Stocks you tag from the Growth scanner. Stage 'triage' = researching, 'confirmation' = waiting for the setup to confirm.
-- added_* columns are a snapshot taken when you tagged it, so the app can show what changed since.

create table if not exists public.scan_watch (
  id            uuid primary key default gen_random_uuid(),
  symbol        text not null unique check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  name          text,
  sector        text,
  stage         text not null default 'triage' check (stage in ('triage','confirmation')),
  added_at      date not null default current_date,
  added_price   numeric(14,4),
  added_score   smallint,
  added_class   text,
  confirmed_at  date,                 -- when it moved to confirmation
  notes         text,                 -- your thesis / what you're waiting for
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists scan_watch_stage_idx on public.scan_watch (stage, added_at desc);

-- Same owner-only security as every other table (copies the rule from "transactions")
alter table public.scan_watch enable row level security;
do $$
declare q text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'transactions' and policyname = 'owner_only';
  if q is null then raise exception 'owner_only policy on transactions not found'; end if;
  drop policy if exists owner_only on public.scan_watch;
  execute format('create policy owner_only on public.scan_watch for all to authenticated using (%s) with check (%s)', q, q);
end $$;
grant select, insert, update, delete on public.scan_watch to authenticated;
notify pgrst, 'reload schema';

-- Check: should return one row, owner_only, cmd ALL
select policyname, cmd from pg_policies where tablename = 'scan_watch';
