-- ===== UnicornHunter — Metals table =====
-- Run once in Supabase → SQL Editor → New query → Run.
-- One row per purchase or sale of physical/paper metal. Holdings, average cost
-- and gain/loss are worked out in the app from these rows.

create table if not exists public.metals (
  id          uuid primary key default gen_random_uuid(),
  tx_type     text not null default 'Buy' check (tx_type in ('Buy','Sell')),
  txn_date    date not null,
  metal       text not null check (metal in ('Gold','Silver','Platinum','Palladium','Other')),
  form        text check (form in ('Bar','Coin','Jewellery','Account','Other')),
  item        text,                                   -- e.g. "Public Gold 20g bar"
  weight_g    numeric(14,4) not null check (weight_g > 0),       -- gross weight in grams
  purity      numeric(6,5)  not null default 0.9999 check (purity > 0 and purity <= 1),  -- 0.9999 = 999.9, 0.916 = 22K
  amount_myr  numeric(14,2) not null check (amount_myr >= 0),    -- total paid (Buy) or received (Sell), incl. premium/fees
  dealer      text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists metals_txn_date_idx on public.metals (txn_date desc);

-- Same owner-only security as every other table (copies the rule from "transactions")
alter table public.metals enable row level security;
do $$
declare q text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'transactions' and policyname = 'owner_only';
  if q is null then raise exception 'owner_only policy on transactions not found'; end if;
  drop policy if exists owner_only on public.metals;
  execute format('create policy owner_only on public.metals for all to authenticated using (%s) with check (%s)', q, q);
end $$;
grant select, insert, update, delete on public.metals to authenticated;
notify pgrst, 'reload schema';

-- Check: should return one row, owner_only, cmd ALL
select policyname, cmd, qual from pg_policies where tablename = 'metals';
