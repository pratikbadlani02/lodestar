"""
Market registry — multi-market support (US + India).

Lodestar is built around Alpaca (US-only). India is added as a second market
whose data comes from Yahoo Finance (yfinance) and whose trading is *simulated*
(no live Indian broker is wired in). To keep the change non-invasive, **the
market is derived from the symbol itself**: Indian tickers carry their exchange
suffix (``.NS`` for NSE, ``.BO`` for BSE), e.g. ``RELIANCE.NS``. US tickers are
bare, e.g. ``AAPL``.

Anything that needs to know "which market is this?" calls :func:`detect_market`.
The frontend's market selector is purely a UX scope (which symbols/currency to
show) — the backend stays stateless about it beyond the symbol suffix.
"""
from __future__ import annotations

import enum


class Market(str, enum.Enum):
    US = "us"
    IN = "in"


_NSE_SUFFIX = ".NS"
_BSE_SUFFIX = ".BO"

_META: dict[Market, dict] = {
    Market.US: {
        "code": "us",
        "label": "United States",
        "short": "US",
        "flag": "🇺🇸",
        "currency": "USD",
        "currency_symbol": "$",
        "timezone": "America/New_York",
        "data_source": "alpaca",
        "trading": "live",          # paper/live via Alpaca
        "benchmark": "SPY",
        "suffix": "",
    },
    Market.IN: {
        "code": "in",
        "label": "India · NSE",
        "short": "IN",
        "flag": "🇮🇳",
        "currency": "INR",
        "currency_symbol": "₹",
        "timezone": "Asia/Kolkata",
        "data_source": "yfinance",
        "trading": "simulated",     # no live Indian broker — internal sim
        "benchmark": "^NSEI",       # Nifty 50
        "suffix": _NSE_SUFFIX,
    },
}


def get_market(code: "Market | str | None") -> Market:
    """Coerce a code/string to a Market (defaults to US)."""
    if isinstance(code, Market):
        return code
    c = str(code or "us").lower().strip()
    return Market.IN if c in ("in", "india", "nse", "bse") else Market.US


def detect_market(symbol: str) -> Market:
    """Infer the market from a symbol's exchange suffix."""
    s = (symbol or "").upper().strip()
    if s.endswith(_NSE_SUFFIX) or s.endswith(_BSE_SUFFIX):
        return Market.IN
    return Market.US


def meta(market: "Market | str") -> dict:
    """Metadata dict for a market (currency, timezone, benchmark, …)."""
    return _META[get_market(market)]


def is_indian(symbol: str) -> bool:
    return detect_market(symbol) == Market.IN


def to_yf_symbol(symbol: str, market: "Market | str | None" = None) -> str:
    """
    Normalize a symbol to the form yfinance expects.

    Indian symbols already carry ``.NS``/``.BO`` and pass through unchanged. If a
    bare symbol is given but the market is explicitly India, append ``.NS``.
    US symbols are returned bare (yfinance uses the plain ticker).
    """
    s = (symbol or "").upper().strip()
    # Index symbols (^NSEI, ^GSPC, …) and already-suffixed tickers pass through.
    if s.startswith("^") or s.endswith(_NSE_SUFFIX) or s.endswith(_BSE_SUFFIX):
        return s
    m = get_market(market) if market is not None else detect_market(s)
    if m == Market.IN:
        return f"{s}{_NSE_SUFFIX}"
    return s


def benchmark_for(symbol: str) -> str:
    """Benchmark index symbol appropriate for the symbol's market."""
    return meta(detect_market(symbol))["benchmark"]


def currency_for(symbol: str) -> str:
    return meta(detect_market(symbol))["currency"]


def list_markets() -> list[dict]:
    """Public list of markets for the API / frontend selector."""
    return [dict(_META[m]) for m in Market]


# ── NSE universe (for India movers / most-actives / screener) ─────────────────
# Mirrors the frontend symbol directory. Used to compute market-wide rankings
# from yfinance daily quotes (Alpaca's screener has no Indian coverage).
NSE_UNIVERSE: list[str] = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
    "LT.NS", "AXISBANK.NS", "BAJFINANCE.NS", "ASIANPAINT.NS", "MARUTI.NS",
    "HCLTECH.NS", "SUNPHARMA.NS", "TITAN.NS", "ULTRACEMCO.NS", "WIPRO.NS",
    "NESTLEIND.NS", "ONGC.NS", "NTPC.NS", "POWERGRID.NS", "TATAMOTORS.NS",
    "TATASTEEL.NS", "ADANIENT.NS", "ADANIPORTS.NS", "JSWSTEEL.NS", "COALINDIA.NS",
    "BAJAJFINSV.NS", "M&M.NS", "TECHM.NS", "GRASIM.NS", "HINDALCO.NS",
    "DRREDDY.NS", "CIPLA.NS", "BRITANNIA.NS", "EICHERMOT.NS", "BPCL.NS",
    "DIVISLAB.NS", "HEROMOTOCO.NS", "INDUSINDBK.NS", "APOLLOHOSP.NS",
    "TATACONSUM.NS", "BAJAJ-AUTO.NS", "SBILIFE.NS", "HDFCLIFE.NS", "LTIM.NS",
    "DMART.NS",
]

# Indian market indices (yfinance symbols) for the market-overview strip.
INDIA_INDICES: list[dict] = [
    {"symbol": "^NSEI", "label": "NIFTY 50"},
    {"symbol": "^BSESN", "label": "SENSEX"},
    {"symbol": "^NSEBANK", "label": "BANK NIFTY"},
    {"symbol": "^INDIAVIX", "label": "India VIX"},
]


def universe_for(market: "Market | str") -> list[str]:
    """The screenable symbol universe for a market."""
    return NSE_UNIVERSE if get_market(market) == Market.IN else []

