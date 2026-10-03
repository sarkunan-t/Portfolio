"""Yahoo Finance daily price history (free, no key). Same endpoint the app's Edge Functions use."""
from __future__ import annotations

import itertools

from .base import PriceHistory, PriceSource, RateLimitedSession

HOSTS = itertools.cycle(["query1.finance.yahoo.com", "query2.finance.yahoo.com"])


class YahooPrices(PriceSource):
    name = "yahoo"

    def __init__(self):
        self.http = RateLimitedSession(per_sec=12, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) UnicornHunter-scanner",
            "Accept": "application/json"})

    @staticmethod
    def yahoo_symbol(symbol: str) -> str:
        # Nasdaq uses "." for share classes in some feeds; Yahoo wants "-" (e.g. BRK.B -> BRK-B)
        return symbol.replace(".", "-").replace("$", "-P")

    def history(self, symbol: str, days: int) -> PriceHistory | None:
        rng = "2y" if days > 370 else "1y"
        if days > 740:
            rng = "5y"
        url = (f"https://{next(HOSTS)}/v8/finance/chart/{self.yahoo_symbol(symbol)}"
               f"?range={rng}&interval=1d&includePrePost=false&events=split")
        r = self.http.get(url, timeout=20)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        res = (r.json().get("chart") or {}).get("result") or []
        if not res:
            return None
        res = res[0]
        q = ((res.get("indicators") or {}).get("quote") or [{}])[0]
        h = PriceHistory(symbol)
        for i, t in enumerate(res.get("timestamp") or []):
            c = (q.get("close") or [None])[i] if i < len(q.get("close") or []) else None
            if c is None:
                continue
            v = (q.get("volume") or [])[i] if i < len(q.get("volume") or []) else None
            hi = (q.get("high") or [])[i] if i < len(q.get("high") or []) else None
            lo = (q.get("low") or [])[i] if i < len(q.get("low") or []) else None
            h.t.append(int(t))
            h.close.append(float(c))
            h.volume.append(float(v or 0))
            h.high.append(float(hi if hi is not None else c))
            h.low.append(float(lo if lo is not None else c))
        return h


# ---------------------------------------------------------------- analyst price targets
# Wall Street consensus from Yahoo's quoteSummary "financialData" module (needs a cookie + crumb).
# Mirrors mobile/supabase/price-target/index.ts so the app and the nightly job store the same fields.
def analyst_targets(symbols: list[str], workers: int = 1) -> dict[str, dict]:
    import threading
    from concurrent.futures import ThreadPoolExecutor

    import requests
    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    s = requests.Session()
    s.headers.update({"User-Agent": ua})
    try:
        s.get("https://fc.yahoo.com/", timeout=15, allow_redirects=False)
    except requests.RequestException:
        pass
    crumb = s.get("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=15).text.strip()
    if not crumb or len(crumb) > 40 or "<" in crumb:
        raise RuntimeError("Yahoo crumb unavailable")
    raw = lambda v: v.get("raw") if isinstance(v, dict) else v
    out, lock = {}, threading.Lock()

    def one(sym):
        import time
        for attempt in range(3):
            try:
                r = s.get(f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}",
                          params={"modules": "financialData", "crumb": crumb}, timeout=20)
                if r.status_code == 429:
                    time.sleep(2 * (attempt + 1))
                    continue
                if r.status_code != 200:
                    return
                f = (((r.json().get("quoteSummary") or {}).get("result") or [{}])[0] or {}).get("financialData") or {}
                row = {"target_mean": raw(f.get("targetMeanPrice")), "target_median": raw(f.get("targetMedianPrice")),
                       "target_high": raw(f.get("targetHighPrice")), "target_low": raw(f.get("targetLowPrice")),
                       "analysts": raw(f.get("numberOfAnalystOpinions")), "rating": f.get("recommendationKey"),
                       "rating_mean": raw(f.get("recommendationMean")), "target_ccy": f.get("financialCurrency")}
                with lock:
                    out[sym] = row
                return
            except Exception as e:  # noqa: BLE001
                print(f"  target {sym}: {e}")
                return

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        list(ex.map(one, symbols))
    return out
