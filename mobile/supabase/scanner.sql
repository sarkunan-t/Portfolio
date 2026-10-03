-- ===== UnicornHunter — NASDAQ Growth Scanner tables =====
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Written by the daily GitHub Actions job (scanner/, uses the service-role key, which bypasses RLS).
-- Read by the app (More → Growth scanner) with the same owner-only rule as every other table.

-- One row per scan (the summary tiles in the app)
create table if not exists public.scan_runs (
  scan_date    date primary key,                 -- US trading date the prices are from
  screened     int  not null default 0,          -- stocks in the NASDAQ universe that were evaluated
  scored       int  not null default 0,          -- passed the liquidity / exclusion filters
  qualified    int  not null default 0,          -- score >= qualify_score
  new_signals  int  not null default 0,          -- newly qualified, or moved into Emerging / Confirmed
  excluded     jsonb not null default '{}'::jsonb,  -- {"illiquid": 812, "dilution": 40, ...}
  model        jsonb not null default '{}'::jsonb,  -- weights + thresholds used (so old scores stay explainable)
  status       text not null default 'running' check (status in ('running','ok','failed')),
  notes        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- Full detail for each stock, kept for the last few scans (older detail is pruned by the job)
create table if not exists public.scan_scores (
  scan_date       date not null references public.scan_runs(scan_date) on delete cascade,
  symbol          text not null,
  name            text,
  sector          text,
  cik             text,
  price           numeric(14,4),
  chg_pct         numeric(8,2),                  -- 1-day change %
  market_cap      numeric(20,0),                 -- USD
  score           smallint not null,             -- 0–100
  score_chg_1m    smallint,                      -- vs the scan ~1 month ago (null until history exists)
  score_chg_3m    smallint,                      -- vs the scan ~3 months ago
  classification  text check (classification in ('Emerging','Confirmed','Extended','Deteriorating')),
  discovery       boolean not null default false, -- small cap, improving fundamentals, no momentum yet
  fund_score      smallint,                      -- fundamentals sub-score 0–100
  mom_score       smallint,                      -- momentum sub-score 0–100
  breakdown       jsonb not null default '{}'::jsonb,  -- {"revenue_growth": {"pts": 12.1, "max": 15, "note": "..."}, ...}
  metrics         jsonb not null default '{}'::jsonb,  -- key numbers for the research page
  reasons         jsonb not null default '[]'::jsonb,  -- why it got its classification
  flags           jsonb not null default '[]'::jsonb,  -- soft warnings (not exclusions)
  primary key (scan_date, symbol)
);
create index if not exists scan_scores_rank_idx on public.scan_scores (scan_date, score desc);

-- Compact score history for every scored stock (powers the score chart and "score rising")
create table if not exists public.scan_history (
  scan_date       date not null,
  symbol          text not null,
  score           smallint not null,
  classification  text,
  backfilled      boolean not null default false,  -- reconstructed from point-in-time data, not a live scan
  primary key (symbol, scan_date)
);
create index if not exists scan_history_date_idx on public.scan_history (scan_date);

-- Fundamentals cache from SEC EDGAR (job-only; refreshed when a company files a 10-Q / 10-K)
create table if not exists public.scan_fundamentals (
  cik          text primary key,
  symbol       text,
  name         text,
  sic          text,
  facts        jsonb not null default '{}'::jsonb,  -- compact point-in-time XBRL facts
  late_filings jsonb not null default '[]'::jsonb,  -- NT 10-K / NT 10-Q dates
  last_filed   date,                                -- latest 10-Q / 10-K seen
  fetched_at   timestamptz not null default now()
);

-- ---------- security ----------
-- App tables: owner-only, read-only for the signed-in user (copies the rule from "transactions")
do $$
declare q text; t text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'transactions' and policyname = 'owner_only';
  if q is null then raise exception 'owner_only policy on transactions not found'; end if;
  foreach t in array array['scan_runs','scan_scores','scan_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format('create policy owner_only on public.%I for select to authenticated using (%s)', t, q);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Fundamentals cache: RLS on with no policies → only the service-role key (the scanner job) can touch it
alter table public.scan_fundamentals enable row level security;
revoke all on public.scan_fundamentals from authenticated, anon;

notify pgrst, 'reload schema';

-- Check: should return three rows, owner_only, cmd SELECT
select tablename, policyname, cmd from pg_policies where tablename like 'scan_%' order by tablename;
