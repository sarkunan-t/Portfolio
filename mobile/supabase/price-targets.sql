-- ===== Add analyst price-target columns to the Triage & confirmation list =====
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
alter table public.scan_watch
  add column if not exists target_mean    numeric(14,4),
  add column if not exists target_median  numeric(14,4),
  add column if not exists target_high    numeric(14,4),
  add column if not exists target_low     numeric(14,4),
  add column if not exists analysts       smallint,
  add column if not exists rating         text,           -- strong_buy / buy / hold / underperform / sell
  add column if not exists rating_mean    numeric(4,2),   -- 1 = strong buy … 5 = sell
  add column if not exists target_ccy     text,
  add column if not exists target_at      timestamptz;
notify pgrst, 'reload schema';

-- Check: should list the 9 new columns
select column_name, data_type from information_schema.columns
 where table_name = 'scan_watch' and column_name like any (array['target%','analysts','rating%'])
 order by column_name;

-- ===== Upside in the Growth scanner (filled by the nightly scan) =====
alter table public.scan_scores
  add column if not exists target_mean  numeric(14,4),
  add column if not exists target_high  numeric(14,4),
  add column if not exists target_low   numeric(14,4),
  add column if not exists analysts     smallint,
  add column if not exists rating       text,
  add column if not exists upside       numeric(8,1);    -- % from the scan close to the average target
notify pgrst, 'reload schema';

-- Check: should list 6 columns
select column_name from information_schema.columns
 where table_name = 'scan_scores' and column_name in ('target_mean','target_high','target_low','analysts','rating','upside');
