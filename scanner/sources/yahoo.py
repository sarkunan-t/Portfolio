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
