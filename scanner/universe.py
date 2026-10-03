"""NASDAQ universe: every listed common stock (no ETFs, test issues, warrants, units, preferreds)."""
from __future__ import annotations

import requests

import config as C

NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"


def parse_nasdaqlisted(text: str) -> list[dict]:
    lines = [l for l in text.splitlines() if l.strip()]
    head = lines[0].split("|")
    ix = {h: i for i, h in enumerate(head)}
    out = []
    for l in lines[1:]:
        if l.startswith("File Creation Time"):
            continue
        p = l.split("|")
        if len(p) < len(head):
            continue
        sym, name = p[ix["Symbol"]].strip(), p[ix["Security Name"]].strip()
        if p[ix["Test Issue"]] == "Y" or ("ETF" in ix and p[ix["ETF"]] == "Y"):
            continue
        low = " " + name.lower()
        if any(k in low for k in C.SECURITY_NAME_SKIP):
            continue
        out.append({"symbol": sym, "name": name.split(" - ")[0].strip(),
                    "market_category": p[ix["Market Category"]],
                    "financial_status": p[ix["Financial Status"]].strip()})
    return out


def load(ticker_map: dict) -> list[dict]:
    """Nasdaq's own symbol directory (has listing-status flags); SEC's ticker file as a fallback."""
    try:
        r = requests.get(NASDAQ_LISTED, timeout=30, headers={"User-Agent": "Mozilla/5.0 UnicornHunter-scanner"})
        r.raise_for_status()
        rows = parse_nasdaqlisted(r.text)
        if len(rows) < 1000:
            raise ValueError(f"only {len(rows)} rows")
    except Exception as e:  # noqa: BLE001
        print(f"Nasdaq symbol directory unavailable ({e}); using SEC ticker list")
        rows = [{"symbol": s, "name": v["name"], "market_category": "", "financial_status": ""}
                for s, v in ticker_map.items() if (v.get("exchange") or "").lower() == "nasdaq"]
    for r in rows:
        m = ticker_map.get(r["symbol"]) or ticker_map.get(r["symbol"].replace(".", "-"))
        r["cik"] = m["cik"] if m else None
    return rows
