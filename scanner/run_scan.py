"""NASDAQ Growth Scanner — daily run.

  python scanner/run_scan.py                    # normal daily scan → Supabase
  python scanner/run_scan.py --backfill-weeks 26  # also rebuild 26 weeks of weekly score history
  python scanner/run_scan.py --dry-run --limit 50 # test: 50 symbols, writes scanner/out/*.json

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEC_USER_AGENT
     optional SCANNER_PRICES (yahoo), SCANNER_FUNDAMENTALS (edgar)
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config as C  # noqa: E402
import fundamentals as FM  # noqa: E402
import scoring as S  # noqa: E402
import technicals as T  # noqa: E402
import universe as U  # noqa: E402
from sectors import sector  # noqa: E402
from sources import fundamentals_source, price_source  # noqa: E402
from store import DryStore, Store  # noqa: E402

BENCH = "^IXIC"   # NASDAQ Composite


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def bar_date(ts: int) -> dt.date:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).date()


def liquid(t: dict) -> bool:
    return (t.get("price") or 0) >= C.MIN_PRICE and (t.get("dollar_vol_20d") or 0) >= C.MIN_DOLLAR_VOLUME \
        and (t.get("bars") or 0) >= C.MIN_HISTORY_DAYS


def r2(x, d=4):
    return None if x is None else round(x, d)


def ri(x):
    return None if x is None else round(x)


# ------------------------------------------------------------------ fundamentals cache
def refresh_fundamentals(store, fsrc, wanted: dict, last_run: dt.date | None, today: dt.date, no_refresh=False):
    """wanted: cik -> universe row. Returns cik -> cache row (with facts)."""
    log("Loading fundamentals cache…")
    cache = {r["cik"]: r for r in store.select("scan_fundamentals",
                                                {"select": "cik,symbol,name,sic,facts,late_filings,last_filed,fetched_at"})}
    log(f"  {len(cache)} companies cached")
    if no_refresh:
        return cache
    todo = [c for c in wanted if c not in cache]
    changed = fsrc.changed_since(last_run, today) if last_run else None
    if changed:
        todo += [c for c in wanted if c in changed and c in cache]
        log(f"  {sum(1 for c in wanted if c in changed)} have new SEC filings since {last_run}")
    stale_cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=C.FUNDAMENTALS_MAX_AGE_DAYS)).isoformat()
    stale = sorted((c for c in wanted if c in cache and c not in set(todo)
                    and str(cache[c].get("fetched_at") or "") < stale_cut),
                   key=lambda c: str(cache[c].get("fetched_at") or ""))
    todo += stale[:C.FUNDAMENTALS_REFRESH_CAP]
    todo = list(dict.fromkeys(todo))
    log(f"  fetching {len(todo)} from EDGAR (~{len(todo) * 2 / C.EDGAR_REQS_PER_SEC / 60:.0f} min)")
    buf = []
    for i, cik in enumerate(todo, 1):
        try:
            d = fsrc.fetch(cik)
        except Exception as e:  # noqa: BLE001
            print(f"  edgar {cik}: {e}")
            continue
        if not d:
            continue
        row = {"cik": cik, "symbol": wanted[cik]["symbol"], "name": d.get("name") or wanted[cik]["name"],
               "sic": d.get("sic"), "facts": d.get("facts") or {}, "late_filings": d.get("late_filings") or [],
               "last_filed": d.get("last_filed"), "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        cache[cik] = row
        buf.append(row)
        if len(buf) >= 50:
            store.upsert("scan_fundamentals", buf, "cik")
            buf = []
        if i % 250 == 0:
            log(f"  EDGAR {i}/{len(todo)}")
    if buf:
        store.upsert("scan_fundamentals", buf, "cik")
    return cache


# ------------------------------------------------------------------ one evaluation date
def evaluate(asof: dt.date, ts: int, uni: list, prices: dict, bench, cache: dict, hist: dict, point_in_time: bool):
    """Score every stock as of one date. hist: symbol -> {date_iso: score} for score-change maths."""
    a_iso = asof.isoformat()
    b = bench.upto(ts) if point_in_time else bench
    stage = []
    excluded: dict = {}
    for u in uni:
        h = prices.get(u["symbol"])
        if not h:
            excluded["no_price"] = excluded.get("no_price", 0) + 1
            continue
        if point_in_time:
            h = h.upto(ts)
            if not h.close or bar_date(h.t[-1]) < asof - dt.timedelta(days=7):
                continue
        t = T.indicators(h, b)
        fc = cache.get(u.get("cik") or "") or {}
        f = FM.metrics(fc.get("facts"), a_iso)
        uu = {**u, "sic": fc.get("sic"), "late_filings": fc.get("late_filings") or []}
        if point_in_time:
            uu["financial_status"] = ""   # today's listing status says nothing about the past
        reason = S.exclusion(uu, f, t, a_iso)
        if reason:
            excluded[reason] = excluded.get(reason, 0) + 1
            continue
        mcap = f["shares"] * t["price"] if f.get("shares") and t.get("price") else None
        stage.append({"u": uu, "f": f, "t": t, "sector": sector(fc.get("sic")), "mcap": mcap,
                      "ps": S._ps(f, mcap), "name": fc.get("name") or u["name"]})
    # sector medians for relative valuation
    by_sec: dict = {}
    for x in stage:
        if x["ps"] and x["ps"] > 0:
            by_sec.setdefault(x["sector"], []).append(x["ps"])
    allps = [p for v in by_sec.values() for p in v]
    overall = statistics.median(allps) if allps else None
    med = {k: (statistics.median(v) if len(v) >= 5 else overall) for k, v in by_sec.items()}

    def back(sym, days, window):
        hs = hist.get(sym) or {}
        target = asof - dt.timedelta(days=days)
        best = None
        for d_iso, sc in hs.items():
            d = dt.date.fromisoformat(d_iso)
            if d <= target and (target - d).days <= window and (best is None or d > best[0]):
                best = (d, sc)
        return best[1] if best else None

    out = []
    for x in stage:
        sym = x["u"]["symbol"]
        ctx = {"market_cap": x["mcap"], "ps": x["ps"], "sector_ps": med.get(x["sector"], overall)}
        s = S.score(x["f"], x["t"], ctx)
        s1, s3 = back(sym, 28, 12), back(sym, 88, 16)
        ctx["score_chg_1m"] = s["score"] - s1 if s1 is not None else None
        cls, reasons = S.classify(x["f"], x["t"], s, ctx)
        out.append({**x, "s": s, "cls": cls, "reasons": reasons, "ctx": ctx,
                    "chg_1m": ctx["score_chg_1m"], "chg_3m": s["score"] - s3 if s3 is not None else None,
                    "discovery": S.is_discovery(x["mcap"], s, cls)})
    return out, excluded


def metrics_payload(x) -> dict:
    f, t, ctx = x["f"], x["t"], x["ctx"]
    p, m50, m200 = t.get("price"), t.get("ma50"), t.get("ma200")
    ni = f.get("ni_ttm")
    fcf, cash = f.get("fcf_ttm"), f.get("cash")
    return {
        "ps": r2(ctx.get("ps"), 2), "sector_ps": r2(ctx.get("sector_ps"), 2),
        "pe": r2(x["mcap"] / ni, 1) if x["mcap"] and ni and ni > 0 and f.get("ccy") == "USD" else None,
        "rev_ttm": ri(f.get("rev_ttm")), "rev_growth": r2(f.get("rev_growth")), "rev_q_yoy": r2(f.get("rev_q_yoy")),
        "rev_q_yoy_prev": r2(f.get("rev_q_yoy_prev")),
        "rev_quarters": [[e, ri(v)] for e, v in (f.get("rev_quarters") or [])],
        "ni_ttm": ri(ni), "ni_ttm_prev": ri(f.get("ni_ttm_prev")), "fcf_ttm": ri(fcf), "fcf_ttm_prev": ri(f.get("fcf_ttm_prev")),
        "cash": ri(cash), "runway_m": r2(cash / (abs(fcf) / 12), 1) if fcf and fcf < 0 and cash is not None else None,
        "gm": r2(f.get("gm")), "gm_prev": r2(f.get("gm_prev")), "dilution": r2(f.get("dilution")),
        "period_end": f.get("period_end"), "quarterly": f.get("quarterly"), "ccy": f.get("ccy"),
        "ret_1m": r2(t.get("ret_1m")), "ret_3m": r2(t.get("ret_3m")), "ret_6m": r2(t.get("ret_6m")),
        "ret_12m": r2(t.get("ret_12m")), "rs_3m": r2(t.get("rs_3m"), 1), "rs_6m": r2(t.get("rs_6m"), 1),
        "ma50": r2(m50), "ma200": r2(m200),
        "vs_ma50": r2(p / m50 - 1) if p and m50 else None, "vs_ma200": r2(p / m200 - 1) if p and m200 else None,
        "rsi14": r2(t.get("rsi14"), 1), "high_52w": r2(t.get("high_52w")), "low_52w": r2(t.get("low_52w")),
        "off_high": r2(t.get("off_high")), "vol_ratio": r2(t.get("vol_ratio_best10"), 2),
        "updown_vol": r2(t.get("updown_vol"), 2), "dollar_vol_20d": round(t.get("dollar_vol_20d") or 0),
        "market_category": x["u"].get("market_category"),
    }


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--symbols", default="")
    ap.add_argument("--backfill-weeks", type=int, default=0)
    ap.add_argument("--no-edgar-refresh", action="store_true")
    a = ap.parse_args()

    store = DryStore(os.path.join(os.path.dirname(__file__), "out")) if a.dry_run else Store()
    fsrc = fundamentals_source()
    psrc = price_source()

    log("Universe…")
    tmap = fsrc.ticker_map()
    uni = U.load(tmap)
    if a.symbols:
        want = {s.strip().upper() for s in a.symbols.split(",") if s.strip()}
        uni = [u for u in uni if u["symbol"] in want]
    if a.limit:
        uni = uni[:a.limit]
    log(f"  {len(uni)} NASDAQ common stocks")

    days = 400 + a.backfill_weeks * 7
    bench = psrc.history(BENCH, days)
    if not bench or not bench.close:
        raise SystemExit("Could not load the NASDAQ Composite — aborting")
    scan_date = bar_date(bench.t[-1])
    log(f"Scan date {scan_date} · prices…")
    prices = psrc.many([u["symbol"] for u in uni], days, workers=C.PRICE_WORKERS,
                       progress=lambda d, n: log(f"  prices {d}/{n}"))
    log(f"  {len(prices)} with prices")

    prev_runs = store.select("scan_runs", {"select": "scan_date,status", "order": "scan_date.desc", "limit": "10"})
    prev_ok = [r for r in prev_runs if r["status"] == "ok" and r["scan_date"] != scan_date.isoformat()]
    last_run = dt.date.fromisoformat(prev_ok[0]["scan_date"]) if prev_ok else None

    store.upsert("scan_runs", [{"scan_date": scan_date.isoformat(), "status": "running",
                                "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                "model": C.model_snapshot()}], "scan_date")
    try:
        # only spend SEC requests on stocks that are liquid enough to score
        wanted = {}
        for u in uni:
            h = prices.get(u["symbol"])
            if u.get("cik") and h and liquid(T.indicators(h, None)):
                wanted[u["cik"]] = u
        cache = refresh_fundamentals(store, fsrc, wanted, last_run, dt.date.today(), a.no_edgar_refresh)

        # score history around the 1- and 3-month look-back points
        lo = (scan_date - dt.timedelta(days=110 + a.backfill_weeks * 7)).isoformat()
        hist: dict = {}
        for r in store.select("scan_history", {"select": "symbol,scan_date,score", "scan_date": f"gte.{lo}"}):
            hist.setdefault(r["symbol"], {})[r["scan_date"]] = r["score"]

        # ---- optional backfill: weekly point-in-time scores, oldest first ----
        if a.backfill_weeks:
            for k in range(a.backfill_weeks, 0, -1):
                asof = scan_date - dt.timedelta(days=7 * k)
                ts = int(dt.datetime.combine(asof, dt.time(23, 59), dt.timezone.utc).timestamp())
                res, _ = evaluate(asof, ts, uni, prices, bench, cache, hist, point_in_time=True)
                rows = [{"scan_date": asof.isoformat(), "symbol": x["u"]["symbol"], "score": x["s"]["score"],
                         "classification": x["cls"], "backfilled": True} for x in res]
                for r in rows:
                    hist.setdefault(r["symbol"], {})[r["scan_date"]] = r["score"]
                store.upsert("scan_history", rows, "symbol,scan_date")
                log(f"  backfill {asof}: {len(rows)} scored")

        # ---- today ----
        res, excluded = evaluate(scan_date, bench.t[-1] + 86400, uni, prices, bench, cache, hist, point_in_time=False)
        res.sort(key=lambda x: x["s"]["score"], reverse=True)
        d_iso = scan_date.isoformat()

        prev_cls = {}
        if prev_ok:
            for r in store.select("scan_scores", {"select": "symbol,score,classification",
                                                  "scan_date": f"eq.{prev_ok[0]['scan_date']}"}):
                prev_cls[r["symbol"]] = r
        qualified = [x for x in res if x["s"]["score"] >= C.QUALIFY_SCORE]
        new_signals = 0
        if prev_ok:
            for x in res:
                p = prev_cls.get(x["u"]["symbol"])
                newly_q = x["s"]["score"] >= C.QUALIFY_SCORE and (not p or p["score"] < C.QUALIFY_SCORE)
                moved = x["cls"] in ("Emerging", "Confirmed") and (not p or p.get("classification") != x["cls"])
                if newly_q or moved:
                    new_signals += 1

        # stocks on the Triage & confirmation list always keep their full detail row
        try:
            watched = {r["symbol"] for r in store.select("scan_watch", {"select": "symbol"})}
        except Exception as e:  # noqa: BLE001 — table may not exist yet
            print(f"  watchlist not read ({e})")
            watched = set()
        detail, history = [], []
        for x in res:
            sym, s = x["u"]["symbol"], x["s"]
            history.append({"scan_date": d_iso, "symbol": sym, "score": s["score"],
                            "classification": x["cls"], "backfilled": False})
            if s["score"] < C.STORE_DETAIL_MIN_SCORE and not x["discovery"] and sym not in watched:
                continue
            t = x["t"]
            detail.append({
                "scan_date": d_iso, "symbol": sym, "name": x["name"], "sector": x["sector"],
                "cik": x["u"].get("cik"), "price": r2(t.get("price")), "chg_pct": r2(t.get("chg_pct"), 2),
                "market_cap": round(x["mcap"]) if x["mcap"] else None, "score": s["score"],
                "score_chg_1m": x["chg_1m"], "score_chg_3m": x["chg_3m"], "classification": x["cls"],
                "discovery": x["discovery"], "fund_score": s["fund_score"], "mom_score": s["mom_score"],
                "breakdown": {**s["breakdown"], "_scale": s["scale"]}, "metrics": metrics_payload(x),
                "reasons": x["reasons"], "flags": S.soft_flags(x["f"], t)})
        log(f"Writing {len(detail)} detail rows, {len(history)} history rows…")
        store.upsert("scan_scores", detail, "scan_date,symbol")
        store.upsert("scan_history", history, "symbol,scan_date")

        # prune
        runs = store.select("scan_runs", {"select": "scan_date", "order": "scan_date.desc", "limit": str(C.KEEP_DETAIL_RUNS)})
        if len(runs) >= C.KEEP_DETAIL_RUNS:
            store.delete("scan_scores", {"scan_date": f"lt.{runs[-1]['scan_date']}"})
        store.delete("scan_history", {"scan_date": f"lt.{(scan_date - dt.timedelta(days=C.KEEP_HISTORY_DAYS)).isoformat()}"})

        store.upsert("scan_runs", [{"scan_date": d_iso, "status": "ok", "screened": len(uni), "scored": len(res),
                                    "qualified": len(qualified), "new_signals": new_signals, "excluded": excluded,
                                    "model": C.model_snapshot(),
                                    "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                    "notes": f"prices {psrc.name}, fundamentals {fsrc.name}"}], "scan_date")
        log(f"Done: {len(uni)} screened, {len(res)} scored, {len(qualified)} qualified, {new_signals} new signals")
        for x in res[:C.TOP_N]:
            log(f"  {x['s']['score']:3d}  {x['u']['symbol']:6s} {x['cls'] or '':13s} {x['sector']}")
    except Exception as e:
        store.upsert("scan_runs", [{"scan_date": scan_date.isoformat(), "status": "failed", "notes": str(e)[:500],
                                    "finished_at": dt.datetime.now(dt.timezone.utc).isoformat()}], "scan_date")
        raise


if __name__ == "__main__":
    main()
