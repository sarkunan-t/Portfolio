-- ===== UnicornHunter — Crypto table =====
-- Run once in Supabase → SQL Editor → New query → Run.
-- One row per Buy, Sell or Reward (staking / airdrop). Holdings and average cost are worked out in the app.

create table if not exists public.crypto (
  id          uuid primary key default gen_random_uuid(),
  tx_type     text not null default 'Buy' check (tx_type in ('Buy','Sell','Reward')),
  txn_date    date not null,
  coin        text not null check (coin ~ '^[A-Z0-9]{1,12}$'),   -- e.g. BTC, ETH (price looked up as BTC-USD)
  coin_name   text,
  quantity    numeric(30,12) not null check (quantity > 0),
  amount_myr  numeric(14,2)  not null default 0 check (amount_myr >= 0),   -- total paid (Buy, incl. fee) / received (Sell) / value (Reward)
  exchange    text,                                                        -- e.g. Luno, Tokenize, hardware wallet
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crypto_txn_date_idx on public.crypto (txn_date desc);

-- Same owner-only security as every other table (copies the rule from "transactions")
alter table public.crypto enable row level security;
do $$
declare q text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'transactions' and policyname = 'owner_only';
  if q is null then raise exception 'owner_only policy on transactions not found'; end if;
  drop policy if exists owner_only on public.crypto;
  execute format('create policy owner_only on public.crypto for all to authenticated using (%s) with check (%s)', q, q);
end $$;
grant select, insert, update, delete on public.crypto to authenticated;
notify pgrst, 'reload schema';

-- Check: should return one row, owner_only, cmd ALL
select policyname, cmd, qual from pg_policies where tablename = 'crypto';
