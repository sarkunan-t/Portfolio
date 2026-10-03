"""Data-source adapters.

The scanner only talks to these two interfaces, so a provider can be swapped
(e.g. Financial Modeling Prep) by adding a module and pointing the env vars at it:
  SCANNER_PRICES=yahoo          (sources/yahoo.py)
  SCANNER_FUNDAMENTALS=edgar    (sources/edgar.py)
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import requests


@dataclass
class PriceHistory:
    """Daily bars, oldest first. t = unix seconds."""
    symbol: str
    t: list[int] = field(default_factory=list)
    close: list[float] = field(default_factory=list)
    volume: list[float] = field(default_factory=list)
    high: list[float] = field(default_factory=list)
    low: list[float] = field(default_factory=list)

    def upto(self, ts: int) -> "PriceHistory":
        """Point-in-time copy: bars on or before ts (used for backfill)."""
        n = 0
        for i, x in enumerate(self.t):
            if x <= ts:
                n = i + 1
            else:
                break
        return PriceHistory(self.symbol, self.t[:n], self.close[:n], self.volume[:n], self.high[:n], self.low[:n])


class PriceSource:
    name = "base"

    def history(self, symbol: str, days: int) -> PriceHistory | None:
        raise NotImplementedError

    def many(self, symbols: list[str], days: int, workers: int = 6, progress=None) -> dict[str, PriceHistory]:
        from concurrent.futures import ThreadPoolExecutor
        out: dict[str, PriceHistory] = {}
        done = [0]
        lock = threading.Lock()

        def one(s):
            try:
                h = self.history(s, days)
            except Exception as e:  # noqa: BLE001 — one bad symbol must not stop the scan
                h = None
                print(f"  price {s}: {e}")
            with lock:
                done[0] += 1
                if progress and done[0] % 250 == 0:
                    progress(done[0], len(symbols))
            return s, h

        with ThreadPoolExecutor(max_workers=workers) as ex:
            for s, h in ex.map(one, symbols):
                if h and h.close:
                    out[s] = h
        return out


class FundamentalsSource:
    """Returns a compact, point-in-time fact bundle per company (see fundamentals.py for the shape)."""
    name = "base"

    def ticker_map(self) -> dict[str, dict]:
        """symbol -> {"cik": str, "name": str}"""
        raise NotImplementedError

    def changed_since(self, since_date) -> dict[str, set]:
        """cik -> set of form types filed since since_date (to know whose cache is stale)."""
        raise NotImplementedError

    def fetch(self, cik: str) -> dict | None:
        """{"facts": {...}, "sic": str, "name": str, "late_filings": [...], "last_filed": "YYYY-MM-DD"}"""
        raise NotImplementedError


class RateLimitedSession:
    """requests.Session with a global requests-per-second cap and retry on 429/5xx."""

    def __init__(self, per_sec: float, headers: dict | None = None):
        self.s = requests.Session()
        if headers:
            self.s.headers.update(headers)
        self.min_gap = 1.0 / per_sec if per_sec else 0
        self.lock = threading.Lock()
        self.last = 0.0

    def get(self, url, tries=4, timeout=30, **kw):
        delay = 1.5
        for attempt in range(tries):
            with self.lock:
                wait = self.last + self.min_gap - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self.last = time.monotonic()
            try:
                r = self.s.get(url, timeout=timeout, **kw)
            except requests.RequestException:
                if attempt == tries - 1:
                    raise
                time.sleep(delay)
                delay *= 2
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            return r
        return r
