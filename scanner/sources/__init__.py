"""Pick data providers by env var, so a paid feed can be dropped in later without touching the scanner."""
import os


def price_source():
    name = os.environ.get("SCANNER_PRICES", "yahoo").lower()
    if name == "yahoo":
        from .yahoo import YahooPrices
        return YahooPrices()
    raise SystemExit(f"Unknown SCANNER_PRICES={name!r} — add an adapter in scanner/sources/")


def fundamentals_source():
    name = os.environ.get("SCANNER_FUNDAMENTALS", "edgar").lower()
    if name == "edgar":
        from .edgar import EdgarFundamentals
        return EdgarFundamentals()
    raise SystemExit(f"Unknown SCANNER_FUNDAMENTALS={name!r} — add an adapter in scanner/sources/")
