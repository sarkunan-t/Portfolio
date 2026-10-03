"""Price/volume indicators from daily bars."""
from __future__ import annotations

from sources.base import PriceHistory


def sma(xs, n):
    if len(xs) < n:
        return None
    return sum(xs[-n:]) / n


def ret(xs, n):
    if len(xs) <= n or xs[-n - 1] <= 0:
        return None
    return xs[-1] / xs[-n - 1] - 1


def rsi(xs, n=14):
    if len(xs) <= n + 1:
        return None
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = xs[i] - xs[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    ag, al = gains / n, losses / n
    for i in range(n + 1, len(xs)):
        d = xs[i] - xs[i - 1]
        ag = (ag * (n - 1) + max(d, 0)) / n
        al = (al * (n - 1) + max(-d, 0)) / n
    if al == 0:
        return 100.0
    return 100 - 100 / (1 + ag / al)


def indicators(h: PriceHistory, bench: PriceHistory | None) -> dict:
    c, v = h.close, h.volume
    n = len(c)
    out = {"bars": n, "price": c[-1] if c else None}
    if n < 2:
        return out
    out["chg_pct"] = (c[-1] / c[-2] - 1) * 100
    out["ma50"] = sma(c, 50)
    out["ma200"] = sma(c, 200)
    out["ma50_20d_ago"] = sma(c[:-20], 50) if n >= 70 else None
    out["ret_1m"] = ret(c, 21)
    out["ret_3m"] = ret(c, 63)
    out["ret_6m"] = ret(c, 126)
    out["ret_12m"] = ret(c, 250)
    out["rsi14"] = rsi(c[-120:])
    yr = c[-250:]
    out["high_52w"] = max(yr)
    out["low_52w"] = min(yr)
    out["off_high"] = c[-1] / out["high_52w"] - 1
    # liquidity
    dv = [c[i] * v[i] for i in range(max(0, n - 20), n)]
    out["dollar_vol_20d"] = sum(dv) / len(dv) if dv else 0
    av50 = sma(v[:-1], 50) if n > 51 else (sum(v[:-1]) / max(1, n - 1))
    out["avg_vol_50d"] = av50
    # breakout volume: best up-day volume ratio in the last 10 sessions
    best = 0.0
    best_i = None
    if av50:
        for i in range(max(1, n - 10), n):
            if c[i] > c[i - 1] and v[i] > 0:
                r = v[i] / av50
                if r > best:
                    best, best_i = r, i
    out["vol_ratio_best10"] = best
    out["vol_breakout_near_high"] = bool(best_i is not None and c[best_i] >= 0.95 * max(c[max(0, best_i - 250):best_i + 1]))
    # accumulation: up-day volume vs down-day volume over 50 sessions
    up = dn = 0.0
    for i in range(max(1, n - 50), n):
        if c[i] > c[i - 1]:
            up += v[i]
        elif c[i] < c[i - 1]:
            dn += v[i]
    out["updown_vol"] = up / dn if dn else None
    # crossed above the 50-day average within the last 20 sessions
    crossed = False
    if n >= 70:
        for i in range(n - 20, n):
            m_prev, m_now = sma(c[:i], 50), sma(c[:i + 1], 50)
            if m_prev and m_now and c[i - 1] < m_prev and c[i] >= m_now:
                crossed = True
    out["crossed_ma50_20d"] = crossed
    # relative strength vs NASDAQ Composite
    if bench and bench.close:
        bc = _align(bench, h)
        for k, d in (("rs_3m", 63), ("rs_6m", 126), ("rs_1m", 21)):
            a, b = ret(c, d), ret(bc, d)
            out[k] = None if a is None or b is None else (a - b) * 100   # percentage points
    return out


def _align(bench: PriceHistory, h: PriceHistory):
    """Benchmark closes on the stock's dates (forward-filled)."""
    m = dict(zip(bench.t, bench.close))
    days = {t // 86400: c for t, c in zip(bench.t, bench.close)}
    out, last = [], None
    for t in h.t:
        val = m.get(t) or days.get(t // 86400)
        if val is None:
            # nearest earlier benchmark close
            val = last
        if val is not None:
            last = val
        out.append(val if val is not None else (bench.close[0] if bench.close else 1))
    return out
