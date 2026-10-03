"""SEC EDGAR fundamentals (free, official, point-in-time via each fact's "filed" date).

SEC asks every automated client to identify itself: set the SEC_USER_AGENT secret to
something like "UnicornHunter scanner your-email@example.com".
Fair-use limit is 10 requests/second; we stay under it.
"""
from __future__ import annotations

import datetime as dt
import os

from .base import FundamentalsSource, RateLimitedSession

# logical metric -> (taxonomy, [concepts in priority order], kind)
# kind: "dur" = flow over a period (revenue, cash flow), "inst" = balance at a date
CONCEPTS = {
    "rev":   ("us-gaap", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet",
                          "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet",
                          "SalesRevenueServicesNet", "RevenuesNetOfInterestExpense", "OperatingLeasesIncomeStatementLeaseRevenue"], "dur"),
    "ni":    ("us-gaap", ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"], "dur"),
    "gp":    ("us-gaap", ["GrossProfit"], "dur"),
    "ocf":   ("us-gaap", ["NetCashProvidedByUsedInOperatingActivities",
                          "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], "dur"),
    "capex": ("us-gaap", ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], "dur"),
    "cash":  ("us-gaap", ["CashAndCashEquivalentsAtCarryingValue",
                          "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"], "inst"),
    "sti":   ("us-gaap", ["ShortTermInvestments", "MarketableSecuritiesCurrent",
                          "AvailableForSaleSecuritiesDebtSecuritiesCurrent"], "inst"),
    "dil":   ("us-gaap", ["WeightedAverageNumberOfDilutedSharesOutstanding"], "dur"),
    "shares": ("dei", ["EntityCommonStockSharesOutstanding"], "inst"),
}
# Foreign private issuers reporting under IFRS (usually annual only, via 20-F)
IFRS = {
    "rev":   ["Revenue", "RevenueFromContractsWithCustomers"],
    "ni":    ["ProfitLoss", "ProfitLossAttributableToOwnersOfParent"],
    "gp":    ["GrossProfit"],
    "ocf":   ["CashFlowsFromUsedInOperatingActivities"],
    "capex": ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    "cash":  ["CashAndCashEquivalents"],
}
REPORT_FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT"}
LATE_FORMS = {"NT 10-K", "NT 10-Q", "NT 20-F", "NT 10-K/A", "NT 10-Q/A"}
KEEP_YEARS = 5


class EdgarFundamentals(FundamentalsSource):
    name = "edgar"

    def __init__(self, per_sec: float = 8):
        ua = os.environ.get("SEC_USER_AGENT", "").strip()
        if not ua or "@" not in ua:
            raise SystemExit("Set SEC_USER_AGENT (e.g. 'UnicornHunter scanner you@example.com') — SEC requires a contact.")
        self.http = RateLimitedSession(per_sec=per_sec, headers={"User-Agent": ua, "Accept-Encoding": "gzip, deflate"})

    # ---------------- symbol -> CIK ----------------
    def ticker_map(self) -> dict[str, dict]:
        r = self.http.get("https://www.sec.gov/files/company_tickers_exchange.json")
        r.raise_for_status()
        d = r.json()
        f = d["fields"]
        ic, iname, it, iex = f.index("cik"), f.index("name"), f.index("ticker"), f.index("exchange")
        out = {}
        for row in d["data"]:
            t = str(row[it] or "").upper()
            if not t:
                continue
            out[t] = {"cik": str(row[ic]).zfill(10), "name": row[iname], "exchange": row[iex]}
        return out

    # ---------------- who filed what since the last run ----------------
    def changed_since(self, since_date: dt.date, until: dt.date | None = None) -> dict[str, set] | None:
        until = until or dt.date.today()
        if (until - since_date).days > 20:
            return None  # too far back: let the staleness rule handle it
        out: dict[str, set] = {}
        d = since_date + dt.timedelta(days=1)
        while d <= until:
            if d.weekday() < 5:
                q = (d.month - 1) // 3 + 1
                url = f"https://www.sec.gov/Archives/edgar/daily-index/{d.year}/QTR{q}/master.{d:%Y%m%d}.idx"
                r = self.http.get(url)
                if r.status_code == 200:
                    for cik, form in parse_master_index(r.text):
                        if form in REPORT_FORMS or form in LATE_FORMS:
                            out.setdefault(cik, set()).add(form)
            d += dt.timedelta(days=1)
        return out

    # ---------------- one company ----------------
    def fetch(self, cik: str) -> dict | None:
        sub = self.http.get(f"https://data.sec.gov/submissions/CIK{cik}.json")
        if sub.status_code != 200:
            return None
        sub = sub.json()
        recent = (sub.get("filings") or {}).get("recent") or {}
        forms, dates = recent.get("form") or [], recent.get("filingDate") or []
        late = sorted({dates[i] for i, f in enumerate(forms) if f in LATE_FORMS and i < len(dates)}, reverse=True)[:6]
        reports = [dates[i] for i, f in enumerate(forms) if f in REPORT_FORMS and i < len(dates)]
        cf = self.http.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", timeout=60)
        facts = compact_facts(cf.json()) if cf.status_code == 200 else {}
        return {"cik": cik, "name": sub.get("name"), "sic": str(sub.get("sic") or ""),
                "facts": facts, "late_filings": late, "last_filed": max(reports) if reports else None}


def parse_master_index(text: str):
    """master.YYYYMMDD.idx: CIK|Company Name|Form Type|Date Filed|Filename"""
    started = False
    for line in text.splitlines():
        if not started:
            if line.startswith("-----"):
                started = True
            continue
        parts = line.split("|")
        if len(parts) >= 5 and parts[0].strip().isdigit():
            yield parts[0].strip().zfill(10), parts[2].strip()


def compact_facts(cf: dict) -> dict:
    """Shrink a companyfacts JSON (often several MB) to what the scanner needs.

    Shape: {"ccy": "USD", "m": {metric: {concept: [[start|None, end, val, filed], ...]}}}
    Facts older than KEEP_YEARS are dropped. Duplicate (start, end) pairs keep every filed
    date, so point-in-time lookups can use the value as it was known at the time."""
    allf = cf.get("facts") or {}
    cutoff = (dt.date.today() - dt.timedelta(days=365 * KEEP_YEARS)).isoformat()
    out: dict = {}
    ccy = None
    for metric, (tax, concepts, kind) in CONCEPTS.items():
        taxes = [(tax, concepts)]
        if metric in IFRS:
            taxes.append(("ifrs-full", IFRS[metric]))
        for tx, names in taxes:
            src = allf.get(tx) or {}
            for c in names:
                node = src.get(c)
                if not node:
                    continue
                units = node.get("units") or {}
                if metric in ("shares", "dil"):
                    unit = "shares" if "shares" in units else None
                else:
                    unit = "USD" if "USD" in units else next(iter(units), None)
                    if unit and "/" in unit:
                        unit = None
                if not unit:
                    continue
                if metric == "rev" and ccy is None:
                    ccy = unit
                rows = []
                seen = set()
                for f in units[unit]:
                    end = f.get("end")
                    if not end or end < cutoff or f.get("val") is None:
                        continue
                    start = f.get("start") if kind == "dur" else None
                    if kind == "dur" and not start:
                        continue
                    key = (start, end, f["val"], f.get("filed"))
                    if key in seen:
                        continue
                    seen.add(key)
                    rows.append([start, end, f["val"], f.get("filed") or end])
                if rows:
                    out.setdefault(metric, {})[c if tx == "us-gaap" or tx == "dei" else "ifrs:" + c] = rows
    return {"ccy": ccy or "USD", "m": out}
