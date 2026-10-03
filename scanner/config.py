"""Scoring model and filters for the NASDAQ Growth Scanner.

Everything you might want to tune lives here. The weights and thresholds are starting
hypotheses, not proven rules: Stage 3 (backtesting) is where they get validated.
Each run stores a copy of this model in scan_runs.model, so old scores stay explainable.
"""

MODEL_VERSION = "1.0"

# ---------------------------------------------------------------------------
# 100-point model. "available": False = no data source yet; those points are
# redistributed pro-rata across the available criteria so scores still run 0–100.
# Switch them on when a source that provides them is added (e.g. FMP for analyst
# estimates, 13F data for institutions).
# ---------------------------------------------------------------------------
CRITERIA = {
    "revenue_growth":    {"label": "Revenue growth",          "weight": 15, "group": "fund", "available": True},
    "earnings_growth":   {"label": "Earnings growth",         "weight": 10, "group": "fund", "available": True},
    "financial_strength":{"label": "Financial strength",      "weight": 10, "group": "fund", "available": True},
    "relative_strength": {"label": "Relative strength",       "weight": 10, "group": "mom",  "available": True},
    "price_trend":       {"label": "Price trend",             "weight": 10, "group": "mom",  "available": True},
    "volume":            {"label": "Volume / accumulation",   "weight": 10, "group": "mom",  "available": True},
    "analyst_revisions": {"label": "Analyst revisions",       "weight": 10, "group": "fund", "available": False},
    "institutional":     {"label": "Institutional activity",  "weight": 5,  "group": "fund", "available": False},
    "valuation":         {"label": "Valuation vs growth",     "weight": 10, "group": "fund", "available": True},
    # Stage 1 proxy for "growth catalyst": revenue acceleration + gross-margin expansion.
    # Stage 2 (AI research) replaces this with evidence from filings and news.
    "growth_catalyst":   {"label": "Growth acceleration",     "weight": 10, "group": "fund", "available": True},
}

QUALIFY_SCORE = 60          # "Qualified" tile + default minimum in the app
TOP_N = 20                  # shown as the Top 20 list

# ---------------------------------------------------------------------------
# Scoring curves (see scoring.py)
# ---------------------------------------------------------------------------
REV_GROWTH_FULL = 0.50      # >= 50 % YoY revenue growth = full marks
REV_GROWTH_HALF = 0.20      # 20 % = half marks (the "above 20 %" threshold)
EPS_GROWTH_FULL = 0.50
EPS_GROWTH_HALF = 0.20
LOSS_NARROWING_FULL = 0.40  # loss shrank by 40 % year on year = the most a loss-maker can earn (60 %)
RS_FULL_OUTPERFORMANCE = 25.0   # percentage points ahead of the NASDAQ over 3 months = full marks
BREAKOUT_VOLUME_RATIO = 1.5     # up-day volume vs 50-day average
PSG_FULL = 0.10             # price/sales ÷ growth% at or below this = full marks
PSG_ZERO = 0.50             # at or above this = zero
ACCEL_FULL_PP = 10.0        # quarterly YoY growth up by 10 percentage points = full marks

# ---------------------------------------------------------------------------
# Universe + exclusion filters
# ---------------------------------------------------------------------------
MIN_PRICE = 1.00            # USD
MIN_DOLLAR_VOLUME = 1_000_000   # 20-day average daily traded value, USD
MIN_HISTORY_DAYS = 60       # trading days of price history needed to score
MAX_DILUTION = 0.25         # share count up > 25 % YoY = excluded ("substantial dilution")
MIN_RUNWAY_MONTHS = 6       # cash-burning company with < 6 months of cash = excluded
LATE_FILING_DAYS = 180      # NT 10-K / NT 10-Q in this window = excluded (accounting / reporting issues)
EXCLUDED_SIC = {"6770"}     # blank-check companies (SPACs)
# Nasdaq "Financial Status": N = normal. D deficient, E delinquent, Q bankrupt, G/H/J/K combinations.
OK_FINANCIAL_STATUS = {"N", ""}
SECURITY_NAME_SKIP = ("warrant", " right", " rights", " unit", " units", "preferred", "notes due",
                      "debenture", "% ", "depositary share representing", "subordinated")

# ---------------------------------------------------------------------------
# Discovery list: smaller companies with improving fundamentals, no momentum yet
# ---------------------------------------------------------------------------
DISCOVERY_MIN_CAP = 50e6
DISCOVERY_MAX_CAP = 2e9
DISCOVERY_MIN_FUND = 60     # fundamentals sub-score
DISCOVERY_MAX_MOM = 50      # momentum sub-score

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
KEEP_DETAIL_RUNS = 5        # full scan_scores rows kept for the last N scans
KEEP_HISTORY_DAYS = 800     # compact score history
STORE_DETAIL_MIN_SCORE = 35 # detail rows for stocks below this are skipped (unless Discovery)

# EDGAR fundamentals cache
FUNDAMENTALS_MAX_AGE_DAYS = 45   # refresh anyway after this long
FUNDAMENTALS_REFRESH_CAP = 600   # max stale refreshes per run (new filings are always refreshed)
EDGAR_REQS_PER_SEC = 8           # SEC fair-use limit is 10/s
PRICE_WORKERS = 6                # parallel Yahoo requests


def model_snapshot():
    keys = ["QUALIFY_SCORE", "REV_GROWTH_FULL", "REV_GROWTH_HALF", "EPS_GROWTH_FULL", "EPS_GROWTH_HALF",
            "LOSS_NARROWING_FULL", "RS_FULL_OUTPERFORMANCE", "BREAKOUT_VOLUME_RATIO", "PSG_FULL", "PSG_ZERO",
            "ACCEL_FULL_PP", "MIN_PRICE", "MIN_DOLLAR_VOLUME", "MAX_DILUTION", "MIN_RUNWAY_MONTHS"]
    g = globals()
    return {"version": MODEL_VERSION,
            "criteria": {k: {"weight": v["weight"], "available": v["available"]} for k, v in CRITERIA.items()},
            **{k.lower(): g[k] for k in keys}}
