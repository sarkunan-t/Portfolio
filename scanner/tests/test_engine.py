"""Offline tests with synthetic data: python scanner/tests/test_engine.py"""
import datetime as dt
import json
import math
import os
import random
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import fundamentals as FM  # noqa: E402
import scoring as S  # noqa: E402
import technicals as T  # noqa: E402
from sources.base import PriceHistory  # noqa: E402
from sources.edgar import compact_facts, parse_master_index  # noqa: E402
from universe import parse_nasdaqlisted  # noqa: E402

TODAY = dt.date.today()


def qdates(n):
    """n calendar quarters ending before today, oldest first: [(start, end)]"""
    out = []
    y, q = TODAY.year, (TODAY.month - 1) // 3   # last completed quarter index
    for _ in range(n):
        if q == 0:
            y, q = y - 1, 4
        start = dt.date(y, 3 * (q - 1) + 1, 1)
        end = (dt.date(y + (q == 4), (3 * q) % 12 + 1, 1) - dt.timedelta(days=1))
        out.append((start, end))
        q -= 1
    return out[::-1]


def fake_companyfacts(rev_q, ni_q, ocf_q, fiscal_ytd=True, filed_lag=35):
    """Builds companyfacts JSON the way companies file: Q1 3M; Q2/Q3 3M + YTD; FY annual only (no Q4)."""
    qs = qdates(len(rev_q))
    facts = {"us-gaap": {}, "dei": {}}

    def add(concept, unit, rows):
        facts["us-gaap"].setdefault(concept, {"units": {unit: []}})["units"][unit] += rows

    for name, series, ytd_only in (("RevenueFromContractWithCustomerExcludingAssessedTax", rev_q, False),
                                    ("NetIncomeLoss", ni_q, False),
                                    ("NetCashProvidedByUsedInOperatingActivities", ocf_q, True)):
        rows = []
        for i, (s, e) in enumerate(qs):
            fq = (e.month - 1) // 3 + 1                    # calendar = fiscal quarter here
            fy_start = dt.date(e.year, 1, 1)
            filed = (e + dt.timedelta(days=filed_lag)).isoformat()
            ytd = sum(series[j] for j in range(i - fq + 1, i + 1)) if i - fq + 1 >= 0 else None
            if fq == 4:
                if ytd is not None:
                    rows.append({"start": fy_start.isoformat(), "end": e.isoformat(), "val": ytd, "form": "10-K",
                                 "filed": (e + dt.timedelta(days=60)).isoformat()})
                continue
            if not ytd_only or fq == 1:
                rows.append({"start": s.isoformat(), "end": e.isoformat(), "val": series[i], "form": "10-Q", "filed": filed})
            if fq > 1 and ytd is not None:
                rows.append({"start": fy_start.isoformat(), "end": e.isoformat(), "val": ytd, "form": "10-Q", "filed": filed})
        add(name, "USD", rows)
    add("CashAndCashEquivalentsAtCarryingValue", "USD",
        [{"end": qs[-1][1].isoformat(), "val": 500e6, "filed": (qs[-1][1] + dt.timedelta(days=35)).isoformat()}])
    facts["dei"]["EntityCommonStockSharesOutstanding"] = {"units": {"shares": [
        {"end": (qs[-1][1] + dt.timedelta(days=30)).isoformat(), "val": 80e6, "filed": (qs[-1][1] + dt.timedelta(days=35)).isoformat()},
        {"end": (qs[-1][1] + dt.timedelta(days=30)).isoformat(), "val": 20e6, "filed": (qs[-1][1] + dt.timedelta(days=35)).isoformat()}]}}
    return {"cik": 1, "entityName": "Test", "facts": facts}


def test_quarters_and_ttm():
    rev = [80, 86, 93, 100, 110, 120, 130, 150, 170, 195, 225, 260]          # accelerating
    ni = [-50, -46, -43, -40, -35, -30, -25, -20, -12, -5, 2, 10]
    ocf = [-40, -37, -33, -30, -25, -20, -15, -10, -5, 0, 8, 15]
    cf = compact_facts(fake_companyfacts([x * 1e6 for x in rev], [x * 1e6 for x in ni], [x * 1e6 for x in ocf]))
    m = FM.metrics(cf, TODAY + dt.timedelta(days=60))
    assert m["has_data"] and m["quarterly"], m
    assert math.isclose(m["rev_ttm"], sum(rev[-4:]) * 1e6), (m["rev_ttm"], sum(rev[-4:]))
    assert math.isclose(m["rev_ttm_prev"], sum(rev[-8:-4]) * 1e6)
    assert math.isclose(m["rev_q_yoy"], rev[-1] / rev[-5] - 1)
    assert math.isclose(m["ni_ttm"], sum(ni[-4:]) * 1e6)
    assert math.isclose(m["ocf_ttm"], sum(ocf[-4:]) * 1e6), (m["ocf_ttm"], sum(ocf[-4:]) * 1e6)
    assert m["shares"] == 100e6, m["shares"]          # two share classes summed
    assert m["cash"] == 500e6
    # point in time: as of before the last filing, the last quarter is unknown
    last_end = dt.date.fromisoformat(m["period_end"])
    m_old = FM.metrics(cf, last_end + dt.timedelta(days=10))
    assert m_old["period_end"] < m["period_end"], (m_old["period_end"], m["period_end"])
    print("quarters/TTM ok:", {k: m[k] for k in ("rev_growth", "rev_q_yoy", "rev_q_yoy_prev", "ni_ttm", "fcf_ttm")})


def make_prices(sym, n=420, drift=0.002, vol=0.02, seed=1, base=20.0, volume=2e6, surge=False):
    rnd = random.Random(seed)
    t0 = int(dt.datetime.combine(TODAY - dt.timedelta(days=int(n * 1.45)), dt.time(13, 30), dt.timezone.utc).timestamp())
    h = PriceHistory(sym)
    p, day = base, 0
    for i in range(n * 2):
        ts = t0 + i * 86400
        if dt.datetime.fromtimestamp(ts, dt.timezone.utc).weekday() >= 5:
            continue
        p *= math.exp(drift + rnd.gauss(0, vol))
        v = volume * (1 + rnd.random() * 0.4)
        if surge and len(h.t) > n - 5 and rnd.random() > 0.3:
            v *= 2.2
            p *= 1.01
        h.t.append(ts); h.close.append(p); h.volume.append(v); h.high.append(p * 1.01); h.low.append(p * 0.99)
        if len(h.t) >= n:
            break
    return h


def test_technicals_and_score():
    bench = make_prices("^IXIC", drift=0.0005, vol=0.01, seed=7, base=15000)
    strong = make_prices("UP", drift=0.003, seed=3, surge=True)
    weak = make_prices("DN", drift=-0.002, seed=4)
    ts, tw = T.indicators(strong, bench), T.indicators(weak, bench)
    assert ts["price"] > ts["ma50"] > ts["ma200"], ts
    assert ts["rs_3m"] > 0 > tw["rs_3m"], (ts["rs_3m"], tw["rs_3m"])
    assert 0 <= ts["rsi14"] <= 100
    rev = [80, 86, 93, 100, 110, 120, 130, 150, 170, 195, 225, 260]
    cf = compact_facts(fake_companyfacts([x * 1e6 for x in rev], [x * 1e6 for x in [-50, -46, -43, -40, -35, -30, -25, -20, -12, -5, 2, 10]],
                                         [x * 1e6 for x in [-40, -37, -33, -30, -25, -20, -15, -10, -5, 0, 8, 15]]))
    f = FM.metrics(cf, TODAY + dt.timedelta(days=60))
    mcap = f["shares"] * ts["price"]
    ctx = {"market_cap": mcap, "ps": S._ps(f, mcap), "sector_ps": 4.0}
    s_good = S.score(f, ts, ctx)
    s_bad = S.score({}, tw, {"market_cap": None, "ps": None, "sector_ps": 4.0})
    total = sum(b["pts"] for b in s_good["breakdown"].values() if isinstance(b, dict) and b["pts"] is not None)
    assert abs(total * s_good["scale"] - s_good["score"]) <= 1, (total, s_good["scale"], s_good["score"])
    assert s_good["score"] > 60 > s_bad["score"], (s_good["score"], s_bad["score"])
    assert s_good["breakdown"]["analyst_revisions"]["pts"] is None
    cls, why = S.classify(f, ts, s_good, ctx)
    cls_b, why_b = S.classify({"rev_growth": -0.1}, tw, s_bad, {"score_chg_1m": None})
    assert cls_b == "Deteriorating", (cls_b, why_b)
    print(f"score good={s_good['score']} ({cls}: {why[:2]}) bad={s_bad['score']} ({cls_b})")
    for k, b in s_good["breakdown"].items():
        if isinstance(b, dict):
            print(f"   {k:20s} {b['pts']!s:>5}/{b['max']:<3} {b['note']}")


def test_exclusions():
    t = {"price": 10, "dollar_vol_20d": 5e6, "bars": 300}
    asof = TODAY.isoformat()
    assert S.exclusion({"financial_status": "N"}, {}, t, asof) is None
    assert S.exclusion({}, {}, {**t, "price": 0.5}, asof) == "illiquid"
    assert S.exclusion({"financial_status": "D"}, {}, t, asof) == "listing_status"
    assert S.exclusion({"sic": "6770"}, {}, t, asof) == "spac"
    assert S.exclusion({"late_filings": [(TODAY - dt.timedelta(days=30)).isoformat()]}, {}, t, asof) == "late_filing"
    assert S.exclusion({}, {"dilution": 0.4}, t, asof) == "dilution"
    assert S.exclusion({}, {"fcf_ttm": -120e6, "cash": 30e6}, t, asof) == "cash_runway"
    print("exclusions ok")


def test_parsers():
    txt = ("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\n"
           "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N\n"
           "QQQ|Invesco QQQ Trust|G|N|N|100|Y|N\n"
           "ABCDW|ABC Corp - Warrant|S|N|N|100|N|N\n"
           "ZZZT|Test Co|S|Y|N|100|N|N\n"
           "XYZ|XYZ Inc - Class A Common Stock|S|N|D|100|N|N\n"
           "File Creation Time: 1003202600:00|||||||\n")
    rows = parse_nasdaqlisted(txt)
    assert [r["symbol"] for r in rows] == ["AAPL", "XYZ"], rows
    assert rows[0]["name"] == "Apple Inc." and rows[1]["financial_status"] == "D"
    idx = ("Description: Daily Index\n\nCIK|Company Name|Form Type|Date Filed|Filename\n"
           "--------------------------------------------------------------------------------\n"
           "320193|Apple Inc.|10-Q|20261002|edgar/data/320193/x.txt\n12345|Foo|NT 10-K|20261002|y\n")
    assert list(parse_master_index(idx)) == [("0000320193", "10-Q"), ("0000012345", "NT 10-K")]
    print("parsers ok")


def test_dry_run():
    """End-to-end with fake sources: runs main() in --dry-run and checks the output tables."""
    import run_scan
    import universe
    from sources.base import FundamentalsSource, PriceSource

    syms = [f"S{i:02d}" for i in range(40)]
    rnd = random.Random(11)
    prof = {}
    for i, s in enumerate(syms):
        g = rnd.uniform(-0.1, 0.6)
        base = rnd.uniform(20, 200)
        rev = [base * (1 + g) ** (k / 4) for k in range(12)]
        ni = [r * rnd.uniform(-0.3, 0.2) + k * rnd.uniform(0, 3) for k, r in enumerate(rev)]
        ocf = [x * 1.1 for x in ni]
        prof[s] = (rev, ni, ocf, g)

    class FakeF(FundamentalsSource):
        name = "fake"
        def ticker_map(self):
            return {s: {"cik": str(i + 1).zfill(10), "name": f"{s} Corp", "exchange": "Nasdaq"} for i, s in enumerate(syms)}
        def changed_since(self, since, until=None):
            return {}
        def fetch(self, cik):
            s = syms[int(cik) - 1]
            rev, ni, ocf, _ = prof[s]
            cf = compact_facts(fake_companyfacts([x * 1e6 for x in rev], [x * 1e6 for x in ni], [x * 1e6 for x in ocf]))
            return {"name": f"{s} Corp", "sic": rnd.choice(["3674", "7372", "2834", "7370"]), "facts": cf,
                    "late_filings": [], "last_filed": TODAY.isoformat()}

    class FakeP(PriceSource):
        name = "fake"
        def history(self, symbol, days):
            if symbol == "^IXIC":
                return make_prices(symbol, n=560, drift=0.0005, vol=0.01, seed=99, base=15000)
            i = syms.index(symbol)
            return make_prices(symbol, n=560, drift=prof[symbol][3] / 150, seed=i, surge=i % 3 == 0)

    run_scan.fundamentals_source = lambda: FakeF()
    run_scan.price_source = lambda: FakeP()
    universe.requests = None   # force the SEC-list fallback (no network)
    out = os.path.join(os.path.dirname(HERE), "out")
    shutil.rmtree(out, ignore_errors=True)
    sys.argv = ["run_scan.py", "--dry-run", "--backfill-weeks", "13"]
    run_scan.main()
    scores = json.load(open(os.path.join(out, "scan_scores.json")))
    hist = json.load(open(os.path.join(out, "scan_history.json")))
    runs = json.load(open(os.path.join(out, "scan_runs.json")))
    assert runs[-1]["status"] == "ok", runs[-1]
    assert scores and all(0 <= r["score"] <= 100 for r in scores)
    assert any(r["score_chg_3m"] is not None for r in scores), "3-month change should exist after backfill"
    assert any(h["backfilled"] for h in hist)
    print(f"dry run ok: {len(scores)} detail rows, {len(hist)} history rows, run={ {k: runs[-1][k] for k in ('screened','scored','qualified','excluded')} }")
    print("classes:", sorted({r['classification'] or '-' for r in scores}), "discovery:", sum(r["discovery"] for r in scores))
    json.dump({"run": runs[-1], "scores": scores, "history": hist},
              open(os.path.join(out, "sample.json"), "w"), default=str)


def test_watchlist_extras():
    """Watchlist stocks outside NASDAQ (NYSE + Bursa) are scored; Bursa price-only; tiles stay NASDAQ-only."""
    import run_scan
    import universe
    from sources.base import FundamentalsSource, PriceSource
    from store import DryStore

    syms = [f"N{i:02d}" for i in range(12)]

    class FakeF(FundamentalsSource):
        name = "fake"
        def ticker_map(self):
            m = {s: {"cik": str(i + 1).zfill(10), "name": f"{s} Corp", "exchange": "Nasdaq"} for i, s in enumerate(syms)}
            m["NYSEX"] = {"cik": "0000000099", "name": "Nyse Example", "exchange": "NYSE"}
            return m
        def changed_since(self, since, until=None):
            return {}
        def fetch(self, cik):
            rev = [100 * 1.08 ** k for k in range(12)]
            cf = compact_facts(fake_companyfacts([x * 1e6 for x in rev], [x * 1e5 for x in rev], [x * 1.2e5 for x in rev]))
            return {"name": "X", "sic": "7372", "facts": cf, "late_filings": [], "last_filed": TODAY.isoformat()}

    class FakeP(PriceSource):
        name = "fake"
        def history(self, symbol, days):
            seed = sum(map(ord, symbol))
            base = 15000 if symbol.startswith("^") else 30
            return make_prices(symbol, n=420, drift=0.001, vol=0.012, seed=seed, base=base, volume=3e6)

    class WatchStore(DryStore):
        def select(self, table, params=None, page=1000):
            if table == "scan_watch":
                return [{"symbol": "NYSEX", "name": "Nyse Example"}, {"symbol": "1155.KL", "name": "MALAYAN BANKING"},
                        {"symbol": "N03", "name": "N03 Corp"}]
            return super().select(table, params, page)

    run_scan.fundamentals_source = lambda: FakeF()
    run_scan.price_source = lambda: FakeP()
    run_scan.DryStore = WatchStore
    universe.requests = None
    out = os.path.join(os.path.dirname(HERE), "out")
    shutil.rmtree(out, ignore_errors=True)
    sys.argv = ["run_scan.py", "--dry-run"]
    run_scan.main()
    scores = {r["symbol"]: r for r in json.load(open(os.path.join(out, "scan_scores.json")))}
    run = json.load(open(os.path.join(out, "scan_runs.json")))[-1]
    assert "NYSEX" in scores and "1155.KL" in scores, sorted(scores)
    kl = scores["1155.KL"]
    assert kl["fund_score"] is None and kl["sector"] == "Bursa", kl
    assert all(v["pts"] is None for k, v in kl["breakdown"].items() if k in ("revenue_growth", "valuation"))
    assert any("Bursa" in f for f in kl["flags"]), kl["flags"]
    assert scores["NYSEX"]["fund_score"] is not None
    assert run["screened"] == len(syms), run["screened"]
    print(f"watchlist extras ok: 1155.KL score {kl['score']} (price-only), NYSEX score {scores['NYSEX']['score']}, screened {run['screened']}")


def test_watch_change_alerts():
    """Signal change and 10+ point score moves on watched stocks become unpushed alert rows."""
    import run_scan
    mk = lambda sym, score, cls: {"u": {"symbol": sym}, "s": {"score": score}, "cls": cls, "t": {"price": 10.0}}
    res = [mk("NVDA", 74, "Confirmed"), mk("1155.KL", 50, "Emerging"), mk("AAPL", 40, None), mk("MSFT", 80, "Extended")]
    prev = {"NVDA": {"score": 70, "classification": "Emerging"}, "1155.KL": {"score": 62, "classification": "Emerging"},
            "AAPL": {"score": 41, "classification": None}, "MSFT": {"score": 20, "classification": None}}
    rows = run_scan.watch_change_alerts(res, prev, [{"symbol": "NVDA", "stage": "triage"},
                                                    {"symbol": "1155.KL", "stage": "observation"},
                                                    {"symbol": "AAPL", "stage": "confirmation"}], "2026-10-05")
    by = {(r["symbol"], r["direction"]): r for r in rows}
    assert set(by) == {("NVDA", "signal"), ("1155.KL", "score")}, by.keys()   # MSFT not watched, AAPL unchanged
    assert by[("NVDA", "signal")]["message"].startswith("NVDA: Emerging → Confirmed (score 74)")
    assert by[("NVDA", "signal")]["route"] == "#more/triage" and by[("NVDA", "signal")]["pushed"] is False
    sc = by[("1155.KL", "score")]
    assert sc["ticker"] == "1155" and sc["market"] == "Bursa" and sc["pct"] == -12 and sc["route"] == "#more/observe"
    assert len({tuple(sorted(r)) for r in rows}) == 1   # same keys on every row (PostgREST bulk insert)
    print("watch change alerts ok:", [r["message"] for r in rows])


if __name__ == "__main__":
    test_parsers()
    test_quarters_and_ttm()
    test_exclusions()
    test_technicals_and_score()
    test_dry_run()
    test_watchlist_extras()
    test_watch_change_alerts()
    print("ALL OK")
