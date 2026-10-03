# NASDAQ Growth Scanner (Stage 1)

A daily scan of every NASDAQ-listed common stock. It scores each one out of 100, then writes the results to Supabase. The app shows them under **More → Growth scanner**.

| Step | What happens |
|---|---|
| Universe | Nasdaq symbol directory: no ETFs, warrants, units or preferreds. The listing-status flag is used to drop delinquent or bankrupt companies. |
| Prices | Yahoo daily bars, which give moving averages, RSI, volume, and relative strength vs the NASDAQ Composite. |
| Fundamentals | SEC EDGAR XBRL. Cached in `scan_fundamentals` and refreshed only when a company files a 10-Q or 10-K, or when the cache is more than 45 days old. |
| Score | A 100-point model, set in `config.py`. Analyst revisions and institutional activity have no free source yet, so they are switched off and the other criteria are scaled up to 100. |
| Filters | Removes stocks under $1, with under $1M traded per day, with more than 25% dilution, with under 6 months of cash runway, with a late filing (NT 10-K/Q) in the last 180 days, or that are SPACs. |
| Output | `scan_runs` (the summary tiles), `scan_scores` (full detail, last 5 scans) and `scan_history` (every score, used for the history chart and the "score rising" list). |

## Setup (once)
1. Supabase → SQL Editor: run `mobile/supabase/scanner.sql`.
2. GitHub → repo Settings → Secrets and variables → Actions. Add these secrets:
   - `SUPABASE_URL`: e.g. `https://yppafsdnzcfkmopqlsgm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: from Supabase → Project Settings → API → `service_role`. Never put this key in the app.
   - `SEC_USER_AGENT`: e.g. `UnicornHunter scanner your-email@example.com`. The SEC requires a contact in every request.
3. GitHub → Actions → **NASDAQ growth scanner** → Run workflow, with `backfill_weeks` = `26`. The first run takes about 30–60 minutes because it downloads every company's financials once. Later daily runs take about 10–15 minutes.

## Run locally
```
pip install -r scanner/requirements.txt
python scanner/tests/test_engine.py                       # offline tests, no network needed
python scanner/run_scan.py --dry-run --symbols NVDA,PLTR  # writes scanner/out/*.json, not Supabase
```

## Swapping data providers
Add a module in `sources/` that implements `PriceSource` or `FundamentalsSource`, then set `SCANNER_PRICES` / `SCANNER_FUNDAMENTALS`. When a provider covers analyst estimates, set `"available": True` for `analyst_revisions` in `config.py` and add its scoring function in `scoring.py`.
