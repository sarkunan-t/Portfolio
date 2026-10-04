"""100-point score, exclusions, classification and the Discovery flag.

Every criterion returns a fraction 0..1 plus a plain-English note. Criteria without a
data source (config: available=False) are left out and the rest are scaled to 100.
"""
from __future__ import annotations

import config as C


def lerp(x, x0, x1):
    """0 at x0, 1 at x1, clamped. Works for either direction."""
    if x is None:
        return 0.0
    if x1 == x0:
        return 1.0 if x >= x1 else 0.0
    return max(0.0, min(1.0, (x - x0) / (x1 - x0)))


def pct(x, d=0):
    return "—" if x is None else f"{x * 100:+.{d}f}%"


def growth_curve(g, half, full):
    """0 → 0, half → 0.5, full → 1 (piecewise linear)."""
    if g is None or g <= 0:
        return 0.0
    if g < half:
        return 0.5 * g / half
    return 0.5 + 0.5 * lerp(g, half, full)


def _ps(fund, mcap):
    rev = fund.get("rev_ttm")
    if not mcap or not rev or rev <= 0 or fund.get("ccy", "USD") != "USD":
        return None
    return mcap / rev


# ---------------------------------------------------------------- criteria
def s_revenue(f, t, ctx):
    g, gq = f.get("rev_growth"), f.get("rev_q_yoy")
    vals = [x for x in (g, gq) if x is not None]
    if not vals:
        return 0.0, "No comparable revenue history"
    eff = sum(vals) / len(vals)
    note = f"Revenue {pct(g)} TTM" if g is not None else "Revenue"
    if gq is not None:
        note += f", {pct(gq)} latest quarter YoY"
    return growth_curve(eff, C.REV_GROWTH_HALF, C.REV_GROWTH_FULL), note


def s_earnings(f, t, ctx):
    now, prev = f.get("ni_ttm"), f.get("ni_ttm_prev")
    if now is None or prev is None:
        return 0.0, "No comparable earnings history"
    if now > 0 and prev > 0:
        g = now / prev - 1
        return growth_curve(g, C.EPS_GROWTH_HALF, C.EPS_GROWTH_FULL), f"Net income {pct(g)} TTM"
    if now > 0 >= prev:
        return 1.0, "Turned profitable in the last 12 months"
    if now <= 0 < prev:
        return 0.0, "Swung from profit to loss"
    narrowing = (now - prev) / abs(prev) if prev else 0      # prev, now both losses
    if narrowing <= 0:
        return 0.0, f"Losses widened {pct(-narrowing)}"
    return 0.6 * lerp(narrowing, 0, C.LOSS_NARROWING_FULL), f"Losses narrowed {pct(narrowing)} YoY"


def s_strength(f, t, ctx):
    fcf, prev, cash, rev = f.get("fcf_ttm"), f.get("fcf_ttm_prev"), f.get("cash"), f.get("rev_ttm")
    if fcf is None:
        return 0.0, "No cash-flow data"
    improving = prev is not None and fcf > prev
    if fcf > 0:
        margin = fcf / rev if rev else 0
        x = 0.6 + (0.2 if improving else 0) + 0.2 * lerp(margin, 0, 0.15)
        return x, f"Free cash flow positive ({pct(margin)} of revenue){', improving' if improving else ''}"
    runway = (cash or 0) / (abs(fcf) / 12) if fcf else None
    x = 0.5 * lerp(runway, 12, 36) + (0.2 if improving else 0)
    rw = f"{runway:.0f} months" if runway is not None else "unknown"
    return min(x, 0.7), f"Burning cash; runway about {rw}{', burn improving' if improving else ''}"


def s_rs(f, t, ctx):
    r3, r6 = t.get("rs_3m"), t.get("rs_6m")
    if r3 is None:
        return 0.0, "Not enough history"
    x = 0.7 * lerp(r3, 0, C.RS_FULL_OUTPERFORMANCE) + 0.3 * lerp(r6, 0, C.RS_FULL_OUTPERFORMANCE * 1.5)
    note = f"{r3:+.0f} pts vs NASDAQ over 3 months"
    if r6 is not None:
        note += f", {r6:+.0f} over 6"
    return x, note


def s_trend(f, t, ctx):
    p, m50, m200 = t.get("price"), t.get("ma50"), t.get("ma200")
    if p is None or m50 is None:
        return 0.0, "Not enough history"
    if m200 is None:   # recent listing
        rising = t.get("ma50_20d_ago") is not None and m50 > t["ma50_20d_ago"]
        x = (0.5 if p > m50 else 0) + (0.3 if rising else 0)
        return x, f"{'Above' if p > m50 else 'Below'} 50-day average (under 200 days of history)"
    x = (0.4 if p > m50 else 0) + (0.4 if p > m200 else 0) + (0.2 if m50 > m200 else 0)
    parts = [f"{'above' if p > m50 else 'below'} 50-day", f"{'above' if p > m200 else 'below'} 200-day"]
    return x, "Price " + " and ".join(parts) + (" · 50 > 200" if m50 > m200 else "")


def s_volume(f, t, ctx):
    vr, ud = t.get("vol_ratio_best10"), t.get("updown_vol")
    near = t.get("vol_breakout_near_high")
    x = 0.6 * lerp(vr, 1.0, C.BREAKOUT_VOLUME_RATIO) * (1.0 if near else 0.6) + 0.4 * lerp(ud, 1.0, 1.5)
    note = f"Best up-day volume {vr or 0:.1f}× average{' near a 52-week high' if near else ''}"
    if ud is not None:
        note += f"; up/down volume {ud:.2f}"
    return x, note


def s_valuation(f, t, ctx):
    ps = ctx.get("ps")
    if ps is None:
        return 0.0, "No USD revenue to value against"
    g = f.get("rev_growth") if f.get("rev_growth") is not None else f.get("rev_q_yoy")
    a = 0.0
    if g is not None and g > 0.02:
        psg = ps / (g * 100)
        a = 1 - lerp(psg, C.PSG_FULL, C.PSG_ZERO)
    med = ctx.get("sector_ps")
    b = max(0.0, min(1.0, (2 * med - ps) / med)) if med else 0.5
    x = 0.6 * a + 0.4 * b
    ni = f.get("ni_ttm")
    mcap = ctx.get("market_cap")
    pe = mcap / ni if mcap and ni and ni > 0 and f.get("ccy", "USD") == "USD" else None
    if pe is not None and pe < 20:
        x = max(x, 0.5)
    note = f"P/S {ps:.1f}" + (f" vs sector {med:.1f}" if med else "") + (f", P/E {pe:.0f}" if pe else "")
    return x, note


def s_catalyst(f, t, ctx):
    q, qp = f.get("rev_q_yoy"), f.get("rev_q_yoy_prev")
    gm, gmp = f.get("gm"), f.get("gm_prev")
    x, parts = 0.0, []
    if q is not None and qp is not None:
        accel = (q - qp) * 100
        x += 0.7 * lerp(accel, 0, C.ACCEL_FULL_PP)
        parts.append("growth steady" if abs(accel) < 1 else f"growth {'accelerating' if accel > 0 else 'slowing'} {accel:+.0f} pts")
    if gm is not None and gmp is not None:
        exp = (gm - gmp) * 100
        x += 0.3 * lerp(exp, 0, 3)
        parts.append(f"gross margin {exp:+.1f} pts")
    return x, ("Quarterly " + ", ".join(parts)) if parts else "Needs quarterly history"


FUNCS = {"revenue_growth": s_revenue, "earnings_growth": s_earnings, "financial_strength": s_strength,
         "relative_strength": s_rs, "price_trend": s_trend, "volume": s_volume,
         "valuation": s_valuation, "growth_catalyst": s_catalyst}


def score(f: dict, t: dict, ctx: dict) -> dict:
    bd, tot, avail = {}, 0.0, 0
    grp = {"fund": [0.0, 0], "mom": [0.0, 0]}
    for key, spec in C.CRITERIA.items():
        w = spec["weight"]
        if not spec["available"] or key not in FUNCS:
            bd[key] = {"pts": None, "max": w, "note": "No data source yet"}
            continue
        if ctx.get("price_only") and spec["group"] == "fund":   # Bursa: no SEC filings → price-based score
            bd[key] = {"pts": None, "max": w, "note": "No SEC filings for Bursa stocks"}
            continue
        frac, note = FUNCS[key](f, t, ctx)
        frac = max(0.0, min(1.0, frac))
        pts = round(frac * w, 1)
        bd[key] = {"pts": pts, "max": w, "note": note}
        tot += frac * w
        avail += w
        grp[spec["group"]][0] += frac * w
        grp[spec["group"]][1] += w
    return {"score": round(tot / avail * 100) if avail else 0, "breakdown": bd,
            "fund_score": round(grp["fund"][0] / grp["fund"][1] * 100) if grp["fund"][1] else None,
            "mom_score": round(grp["mom"][0] / grp["mom"][1] * 100) if grp["mom"][1] else 0,
            "scale": round(100 / avail, 3) if avail else 1}


# ---------------------------------------------------------------- filters
def exclusion(u: dict, f: dict, t: dict, asof_iso: str) -> str | None:
    if (t.get("price") or 0) < C.MIN_PRICE or (t.get("dollar_vol_20d") or 0) < C.MIN_DOLLAR_VOLUME \
            or (t.get("bars") or 0) < C.MIN_HISTORY_DAYS:
        return "illiquid"
    if (u.get("financial_status") or "") not in C.OK_FINANCIAL_STATUS:
        return "listing_status"
    if str(u.get("sic") or "") in C.EXCLUDED_SIC:
        return "spac"
    import datetime as dt
    cutoff = (dt.date.fromisoformat(asof_iso) - dt.timedelta(days=C.LATE_FILING_DAYS)).isoformat()
    if any(cutoff <= d <= asof_iso for d in (u.get("late_filings") or [])):
        return "late_filing"
    if (f.get("dilution") or 0) > C.MAX_DILUTION:
        return "dilution"
    fcf, cash = f.get("fcf_ttm"), f.get("cash")
    if fcf is not None and fcf < 0 and cash is not None:
        if cash / (abs(fcf) / 12) < C.MIN_RUNWAY_MONTHS:
            return "cash_runway"
    return None


def soft_flags(f: dict, t: dict) -> list[str]:
    out = []
    if not f.get("has_data"):
        out.append("No SEC financial data (foreign filer or recent listing) — fundamentals scored as zero")
    else:
        if (f.get("data_age_days") or 0) > 200:
            out.append(f"Latest financials are {f['data_age_days']} days old")
        if not f.get("quarterly"):
            out.append("Annual figures only (no quarterly filings)")
        if f.get("ccy") not in (None, "USD"):
            out.append(f"Reports in {f['ccy']} — valuation not scored")
    d = f.get("dilution")
    if d is not None and 0.10 < d <= C.MAX_DILUTION:
        out.append(f"Share count up {d * 100:.0f}% in a year")
    fcf, cash = f.get("fcf_ttm"), f.get("cash")
    if fcf is not None and fcf < 0 and cash:
        rw = cash / (abs(fcf) / 12)
        if rw < 12:
            out.append(f"Cash runway about {rw:.0f} months — may need to raise money")
    if (t.get("bars") or 0) < 200:
        out.append("Listed for under a year of trading")
    return out


# ---------------------------------------------------------------- classification
def classify(f: dict, t: dict, s: dict, ctx: dict) -> tuple[str | None, list[str]]:
    p, m50, m200 = t.get("price"), t.get("ma50"), t.get("ma200")
    g, gq, gqp = f.get("rev_growth"), f.get("rev_q_yoy"), f.get("rev_q_yoy_prev")
    det = []
    if g is not None and g < 0:
        det.append("Revenue shrinking year on year")
    if g is not None and gq is not None and gq < g - 0.15:
        det.append("Quarterly revenue growth slowing sharply")
    if p and m50 and m200 and p < m200 and m50 < m200:
        det.append("Below a falling 200-day trend")
    if (t.get("rs_3m") or 0) < -10:
        det.append("Lagging the NASDAQ by more than 10 pts over 3 months")
    if ctx.get("score_chg_1m") is not None and ctx["score_chg_1m"] <= -15:
        det.append(f"Score down {abs(ctx['score_chg_1m'])} pts in a month")
    ni, nip = f.get("ni_ttm"), f.get("ni_ttm_prev")
    if ni is not None and nip is not None and ni < 0 and ni < nip * 1.2 and nip < 0:
        det.append("Losses widening")
    if len(det) >= 2:
        return "Deteriorating", det

    if s["mom_score"] >= 50 and p and m50:
        ext = []
        if p / m50 - 1 >= 0.25:
            ext.append(f"{(p / m50 - 1) * 100:.0f}% above its 50-day average")
        if m200 and p / m200 - 1 >= 0.60:
            ext.append(f"{(p / m200 - 1) * 100:.0f}% above its 200-day average")
        if (t.get("rsi14") or 0) >= 80:
            ext.append(f"RSI {t['rsi14']:.0f} (overbought)")
        ps, med = ctx.get("ps"), ctx.get("sector_ps")
        if ps and med and ps >= 2 * med and ps >= 15:
            ext.append(f"Valuation stretched: P/S {ps:.0f} vs sector {med:.1f}")
        if ext:
            return "Extended", ext

    growth_ok = (g is not None and g >= 0.20) or (gq is not None and gq >= 0.20)
    if p and m50 and m200 and p > m50 > m200 and (t.get("rs_3m") or 0) > 0 and growth_ok \
            and s["score"] >= C.QUALIFY_SCORE + 10:
        return "Confirmed", ["Above rising 50- and 200-day averages", "Outperforming the NASDAQ",
                             "Revenue growing 20%+", f"Score {s['score']}"]

    improving = []
    if g is not None and g >= 0.15:
        improving.append(f"Revenue {pct(g)} TTM")
    if gq is not None and gqp is not None and gq > gqp:
        improving.append("Revenue growth accelerating")
    if ni is not None and nip is not None and ((ni > 0 >= nip) or (nip < ni < 0)):
        improving.append("Turned profitable" if ni > 0 else "Losses narrowing")
    early = []
    if p and m50 and p > m50:
        early.append("Above its 50-day average")
    if t.get("crossed_ma50_20d"):
        early.append("Crossed above the 50-day average recently")
    if m50 and t.get("ma50_20d_ago") and m50 > t["ma50_20d_ago"]:
        early.append("50-day average turning up")
    if improving and early and (s["fund_score"] or 0) >= 50:
        return "Emerging", improving + early
    return None, []


def is_discovery(mcap, s, cls) -> bool:
    return bool(mcap and C.DISCOVERY_MIN_CAP <= mcap <= C.DISCOVERY_MAX_CAP
                and (s["fund_score"] or 0) >= C.DISCOVERY_MIN_FUND and s["mom_score"] < C.DISCOVERY_MAX_MOM
                and cls != "Deteriorating")
