-- ===== UnicornHunter — ASNB table =====
-- Run once in Supabase → SQL Editor → New query → Run.
-- One row per Invest / Withdraw / Dividend / Bonus / Price (latest price per unit of a variable-price fund).

create table if not exists public.asnb (
  id          uuid primary key default gen_random_uuid(),
  tx_type     text not null check (tx_type in ('Invest','Withdraw','Dividend','Bonus','Price')),
  txn_date    date not null,
  fund        text not null,                                  -- e.g. ASB, ASB 2, ASM, ASN Equity 3
  units       numeric(16,4) not null default 0 check (units >= 0),
  amount_myr  numeric(14,2) not null default 0 check (amount_myr >= 0),
  nav         numeric(12,4) check (nav is null or nav > 0),  -- price per unit (1.0000 for fixed-price funds)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists asnb_txn_date_idx on public.asnb (txn_date desc);

-- Same owner-only security as every other table (copies the rule from "transactions")
alter table public.asnb enable row level security;
do $$
declare q text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'transactions' and policyname = 'owner_only';
  if q is null then raise exception 'owner_only policy on transactions not found'; end if;
  drop policy if exists owner_only on public.asnb;
  execute format('create policy owner_only on public.asnb for all to authenticated using (%s) with check (%s)', q, q);
end $$;
grant select, insert, update, delete on public.asnb to authenticated;
notify pgrst, 'reload schema';

-- Check: should return one row, owner_only, cmd ALL
select policyname, cmd, qual from pg_policies where tablename = 'asnb';
