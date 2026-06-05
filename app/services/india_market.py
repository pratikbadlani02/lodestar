"""
India market data via Yahoo Finance (yfinance).

Alpaca's snapshot/screener/news feeds are US-only, so the equivalents for the
Indian market are computed here from yfinance and cached in Redis (yfinance is
rate-limited from datacenter IPs — same caveat as ``fundamentals.py``).

Everything returns the **same shape** the frontend already consumes from Alpaca:
  • snapshots → {symbol: {latestTrade:{p}, dailyBar:{o,h,l,c,v}, prevDailyBar:{c}}}
  • movers    → {gainers:[{symbol, price, percent_change}], losers:[...]}
  • actives   → {most_actives:[{symbol, volume}]}
  • news      → [{headline, summary, url, source, symbols, created_at}]
so the existing pages render unchanged once routed here.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any

from app.core.logging import get_logger
from app.core.markets import NSE_UNIVERSE
from app.services.control import get_redis

logger = get_logger(__name__)

TTL_QUOTES = 90       # batch daily quotes — short, for a live-ish feel
TTL_NEWS = 60 * 15    # yfinance news changes slowly


# ── Batch daily quotes ────────────────────────────────────────────
def _quotes_sync(symbols: list[str]) -> dict[str, dict]:
    """Blocking yfinance batch download → {symbol: {price, prev, o,h,l,v}}."""
    import yfinance as yf

    if not symbols:
        return {}
    data = yf.download(
        tickers=symbols, period="7d", interval="1d", group_by="ticker",
        auto_adjust=False, threads=True, progress=False,
    )
    out: dict[str, dict] = {}
    multi = len(symbols) > 1

    def _last_two(frame):
        frame = frame.dropna(subset=["Close"])
        if frame.empty:
            return None
        last = frame.iloc[-1]
        prev = frame.iloc[-2] if len(frame) >= 2 else last
        return last, prev

    for sym in symbols:
        try:
            frame = data[sym] if multi else data
            lt = _last_two(frame)
            if lt is None:
                continue
            last, prev = lt
            out[sym] = {
                "price": float(last["Close"]),
                "prev": float(prev["Close"]),
                "open": float(last["Open"]),
                "high": float(last["High"]),
                "low": float(last["Low"]),
                "volume": float(last.get("Volume", 0) or 0),
            }
        except Exception:  # noqa: BLE001 — one bad ticker shouldn't sink the batch
            continue
    return out


async def _get_quotes(symbols: list[str]) -> dict[str, dict]:
    """Redis-cached batch quotes keyed by the (sorted) symbol set."""
    syms = sorted({s.upper().strip() for s in symbols if s.strip()})
    if not syms:
        return {}
    digest = hashlib.sha1(",".join(syms).encode()).hexdigest()[:16]
    key = f"india:quotes:{digest}"
    r = await get_redis()
    cached = await r.get(key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass
    quotes = await asyncio.to_thread(_quotes_sync, syms)
    if quotes:
        await r.set(key, json.dumps(quotes), ex=TTL_QUOTES)
    return quotes


def _snapshot_shape(q: dict) -> dict:
    """Map an internal quote to the Alpaca snapshot shape the frontend reads."""
    return {
        "latestTrade": {"p": q["price"]},
        "minuteBar": {"c": q["price"]},
        "dailyBar": {
            "o": q["open"], "h": q["high"], "l": q["low"],
            "c": q["price"], "v": q["volume"],
        },
        "prevDailyBar": {"c": q["prev"]},
    }


async def get_snapshots(symbols: list[str]) -> dict[str, Any]:
    quotes = await _get_quotes(symbols)
    return {sym: _snapshot_shape(q) for sym, q in quotes.items()}


def _pct(q: dict) -> float:
    return ((q["price"] - q["prev"]) / q["prev"] * 100) if q.get("prev") else 0.0


async def get_movers(top: int = 25) -> dict[str, Any]:
    quotes = await _get_quotes(NSE_UNIVERSE)
    rows = [
        {"symbol": s, "price": q["price"], "percent_change": round(_pct(q), 2),
         "change": round(q["price"] - q["prev"], 2)}
        for s, q in quotes.items() if q.get("prev")
    ]
    rows.sort(key=lambda x: x["percent_change"], reverse=True)
    return {"gainers": rows[:top], "losers": list(reversed(rows[-top:]))}


async def get_most_actives(top: int = 25, by: str = "volume") -> dict[str, Any]:
    quotes = await _get_quotes(NSE_UNIVERSE)
    rows = [
        {"symbol": s, "volume": q["volume"], "trade_count": None,
         "price": q["price"], "percent_change": round(_pct(q), 2)}
        for s, q in quotes.items()
    ]
    rows.sort(key=lambda x: x["volume"], reverse=True)
    return {"most_actives": rows[:top]}


async def screen(
    *, min_volume: float = 0, min_price: float = 0, max_price: float = 1e12,
    min_change_pct: float = -100, max_change_pct: float = 100,
) -> dict[str, Any]:
    """Screen the NSE universe from batch quotes (no DB dependency)."""
    quotes = await _get_quotes(NSE_UNIVERSE)
    matches = []
    for sym, q in quotes.items():
        price, vol = q["price"], q["volume"]
        change_pct = _pct(q)
        if (min_price <= price <= max_price and vol >= min_volume
                and min_change_pct <= change_pct <= max_change_pct):
            matches.append({
                "symbol": sym, "price": price, "open": q["open"],
                "high": q["high"], "low": q["low"], "volume": vol,
                "change_pct": round(change_pct, 2), "as_of": None,
            })
    matches.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
    return {"count": len(matches), "results": matches}


# ── News (yfinance per-ticker) ────────────────────────────────────
def _news_sync(symbols: list[str], limit: int) -> list[dict]:
    import yfinance as yf

    seen: set[str] = set()
    out: list[dict] = []
    for sym in symbols[:10]:
        try:
            items = yf.Ticker(sym).news or []
        except Exception:  # noqa: BLE001
            continue
        for it in items:
            # yfinance has two schemas: legacy flat, and newer {'content': {...}}.
            c = it.get("content") or it
            title = c.get("title") or it.get("title")
            if not title:
                continue
            url = (
                (c.get("canonicalUrl") or {}).get("url")
                or (c.get("clickThroughUrl") or {}).get("url")
                or it.get("link")
            )
            uid = it.get("id") or it.get("uuid") or url or title
            if uid in seen:
                continue
            seen.add(uid)
            provider = c.get("provider") or {}
            out.append({
                "id": uid,
                "headline": title,
                "summary": c.get("summary") or c.get("description") or "",
                "author": None,
                "source": provider.get("displayName") or it.get("publisher") or "Yahoo Finance",
                "url": url,
                "symbols": it.get("relatedTickers") or [sym],
                "created_at": c.get("pubDate") or c.get("displayTime")
                or it.get("providerPublishTime"),
            })
    return out[:limit]


async def get_news(symbols: list[str] | None, limit: int = 20) -> list[dict]:
    """yfinance news for the given Indian symbols (cached). Falls back to a
    slice of the NSE universe when no symbols are supplied."""
    syms = [s.upper() for s in (symbols or NSE_UNIVERSE[:8])]
    digest = hashlib.sha1((",".join(sorted(syms)) + f"|{limit}").encode()).hexdigest()[:16]
    key = f"india:news:{digest}"
    r = await get_redis()
    cached = await r.get(key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass
    articles = await asyncio.to_thread(_news_sync, syms, limit)
    if articles:
        await r.set(key, json.dumps(articles, default=str), ex=TTL_NEWS)
    return articles
