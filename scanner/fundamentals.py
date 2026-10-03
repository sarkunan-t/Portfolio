"""Turn compact EDGAR facts into point-in-time fundamentals.

Companies report quarters in different ways: a 10-Q gives Q2 as 3-month AND 6-month
year-to-date figures, cash flow is usually YTD only, and Q4 is never filed separately
(it is the 10-K annual minus the 9-month YTD). derive_quarters() rebuilds clean
3-month quarters from whatever was filed, using only facts filed on or before `asof`.
"""
from __future__ import annotations

import datetime as dt

D = dt.date.fromisoformat


def _days(a: str, b: str) -> int:
    return (D(b) - D(a)).days


def _periods(metric_facts: dict, asof: str, kind: str = "dur") -> dict:
    """Merge concepts into {(start, end): value}, latest filing on/before asof wins.
    The concept with the most recent data is primary; others only fill gaps
    (companies switch concepts, e.g. SalesRevenueNet -> RevenueFromContract... in 2018)."""
    per_concept = []
    for concept, rows in (metric_facts or {}).items():
        best: dict = {}
        for start, end, val, filed in rows:
            if filed > asof or end > asof:
                continue
            k = (start, end)
            if k not in best or filed >= best[k][1]:
                best[k] = (val, filed)
        if best:
            per_concept.append((max(e for _, e in best), concept, best))
    per_concept.sort(key=lambda x: x[0], reverse=True)
    merged: dict = {}
    for _, _, best in per_concept:
        for k, (v, f) in best.items():
            merged.setdefault(k, (v, f))
    return merged


def derive_quarters(periods: dict) -> dict:
    """{end: (start, end, value)} for 3-month quarters, direct or derived from YTD differences."""
    q = {}
    for (s, e), (v, _) in periods.items():
        if s and 70 <= _days(s, e) <= 110:
            q[e] = (s, e, v)
    by_start: dict = {}
    for (s, e), (v, _) in periods.items():
        if s:
            by_start.setdefault(s, []).append((e, v))
    for s, lst in by_start.items():
        lst.sort()
        for i in range(1, len(lst)):
            e1, v1 = lst[i - 1]
            e2, v2 = lst[i]
            qs = (D(e1) + dt.timedelta(days=1)).isoformat()
            if e2 not in q and 70 <= _days(qs, e2) <= 110:
                q[e2] = (qs, e2, v2 - v1)
    return q


def _annuals(periods: dict) -> dict:
    return {e: (s, e, v) for (s, e), (v, _) in periods.items() if s and 350 <= _days(s, e) <= 380}


def _find_near(d: dict, target: str, tol: int = 20):
    best = None
    for e in d:
        diff = abs(_days(e, target))
        if diff <= tol and (best is None or diff < best[0]):
            best = (diff, e)
    return d[best[1]] if best else None


def _ttm_at(quarters: dict, end: str):
    """Sum of 4 contiguous quarters ending at `end`."""
    out, cur = [], end
    for _ in range(4):
        q = quarters.get(cur) or _find_near(quarters, cur, 12)
        if not q:
            return None
        out.append(q)
        cur = (D(q[0]) - dt.timedelta(days=1)).isoformat()
    return sum(x[2] for x in out)


def _flow(metric_facts, asof):
    """-> dict with quarters, latest quarter end, ttm, ttm a year earlier (quarterly or annual)."""
    p = _periods(metric_facts, asof)
    if not p:
        return None
    q = derive_quarters(p)
    a = _annuals(p)
    res = {"q": q, "a": a, "end": None, "ttm": None, "ttm_prev": None, "quarterly": False}
    if q:
        end = max(q)
        res["end"] = end
        ttm = _ttm_at(q, end)
        prev_end = (D(end) - dt.timedelta(days=364)).isoformat()
        ttm_prev = _ttm_at(q, prev_end)
        if ttm is None:          # quarters not contiguous: use the annual that ends here
            an = a.get(end) or _find_near(a, end, 12)
            ttm = an[2] if an else None
        if ttm_prev is None:
            an = _find_near(a, prev_end, 20)
            ttm_prev = an[2] if an else None
        res.update(ttm=ttm, ttm_prev=ttm_prev, quarterly=ttm is not None)
    if res["ttm"] is None and a:   # annual-only reporters (20-F)
        end = max(a)
        prev = _find_near(a, (D(end) - dt.timedelta(days=365)).isoformat(), 20)
        res.update(end=end, ttm=a[end][2], ttm_prev=prev[2] if prev else None, quarterly=False)
    return res


def _yoy_quarter(q: dict, end: str):
    cur = q.get(end)
    prev = _find_near(q, (D(end) - dt.timedelta(days=364)).isoformat(), 14)
    if not cur or not prev or prev[2] <= 0:
        return None
    return cur[2] / prev[2] - 1


def _instant(metric_facts, asof, sum_classes=False):
    best_end, rows = None, []
    for concept, lst in (metric_facts or {}).items():
        for _, end, val, filed in lst:
            if filed > asof or end > asof:
                continue
            if best_end is None or end > best_end:
                best_end, rows = end, [(val, filed)]
            elif end == best_end:
                rows.append((val, filed))
        if rows and not sum_classes:
            break   # first concept (priority order) that has data wins
    if not rows:
        return None, None
    if sum_classes:
        last_filed = max(f for _, f in rows)
        return sum({v for v, f in rows if f == last_filed}), best_end
    return max(rows, key=lambda x: x[1])[0], best_end


def growth(now, prev):
    if now is None or prev is None or prev <= 0:
        return None
    return now / prev - 1


def metrics(bundle: dict | None, asof: dt.date | str) -> dict:
    """Point-in-time fundamentals. Every value can be None when not reported."""
    asof = asof if isinstance(asof, str) else asof.isoformat()
    m = (bundle or {}).get("m") or {}
    out: dict = {"ccy": (bundle or {}).get("ccy", "USD"), "has_data": False}
    rev = _flow(m.get("rev"), asof)
    if rev and rev["ttm"] is not None:
        out["has_data"] = True
        out["period_end"] = rev["end"]
        out["quarterly"] = rev["quarterly"]
        out["rev_ttm"] = rev["ttm"]
        out["rev_ttm_prev"] = rev["ttm_prev"]
        out["rev_growth"] = growth(rev["ttm"], rev["ttm_prev"])
        q = rev["q"]
        if q:
            ends = sorted(q)
            last = ends[-1]
            out["rev_q"] = q[last][2]
            out["rev_q_yoy"] = _yoy_quarter(q, last)
            if len(ends) >= 2:
                out["rev_q_yoy_prev"] = _yoy_quarter(q, ends[-2])
            # last 8 quarters for the research page
            out["rev_quarters"] = [[e, q[e][2]] for e in ends[-8:]]
        out["data_age_days"] = _days(rev["end"], asof)
    for key in ("ni", "gp", "ocf", "capex", "dil"):
        f = _flow(m.get(key), asof)
        if f:
            out[key + "_ttm"] = f["ttm"]
            out[key + "_ttm_prev"] = f["ttm_prev"]
            if key == "dil" and f["q"]:
                last = max(f["q"])
                out["dil_now"] = f["q"][last][2]
                ya = _find_near(f["q"], (D(last) - dt.timedelta(days=364)).isoformat(), 14)
                out["dil_yago"] = ya[2] if ya else None
    if out.get("ocf_ttm") is not None:
        cap = out.get("capex_ttm") or 0
        out["fcf_ttm"] = out["ocf_ttm"] - cap
        if out.get("ocf_ttm_prev") is not None:
            out["fcf_ttm_prev"] = out["ocf_ttm_prev"] - (out.get("capex_ttm_prev") or 0)
    if out.get("gp_ttm") is not None and out.get("rev_ttm"):
        out["gm"] = out["gp_ttm"] / out["rev_ttm"]
        if out.get("gp_ttm_prev") is not None and out.get("rev_ttm_prev"):
            out["gm_prev"] = out["gp_ttm_prev"] / out["rev_ttm_prev"]
    cash, _ = _instant(m.get("cash"), asof)
    sti, _ = _instant(m.get("sti"), asof)
    if cash is not None or sti is not None:
        out["cash"] = (cash or 0) + (sti or 0)
    shares, sh_end = _instant(m.get("shares"), asof, sum_classes=True)
    if not shares and out.get("dil_now"):
        shares = out["dil_now"]
    out["shares"] = shares
    # dilution: diluted weighted shares, latest quarter vs same quarter a year ago
    if out.get("dil_now") and out.get("dil_yago"):
        out["dilution"] = out["dil_now"] / out["dil_yago"] - 1
    return out
