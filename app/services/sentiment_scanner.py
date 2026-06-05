"""Market-sentiment scanner.

Fuses five per-symbol signals — momentum, news sentiment, earnings/events,
analyst targets, and insider flow — into a 0–100 composite and ranks a universe
into "top picks". Most signals are reused from `stock_analysis.get_full_analysis`
(which is Redis/DB-cached); news sentiment uses one bulk Alpaca call scored with
the existing `_score_headline` heuristic.

Because a cold scan touches yfinance/Alpaca for the whole universe, it runs as a
background job (via `app.tasks.dispatch`) and the ranked result is cached in
Redis. The API returns the cached result instantly, or `{status: "scanning"}`
while a job is in flight (the frontend polls).
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog

from app.services import stock_analysis as analysis
from app.services.broker import get_broker
from app.services.control import get_redis

logger = structlog.get_logger()

SCAN_TTL = 900          # ranked result cached 15 min
LOCK_TTL = 180          # guards against duplicate concurrent scans
MAX_CONCURRENCY = 3     # gentle on yfinance/Alpaca + the bounded Redis pool

# Curated universes. No hardcoded universe existed in the codebase, so the
# scanner ships a few liquid, well-covered baskets; callers may also pass a
# custom comma-separated symbol list.
UNIVERSES: dict[str, dict[str, Any]] = {
    "megacap": {
        "label": "Megacap leaders",
        "symbols": ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
                    "AVGO", "JPM", "V", "UNH", "XOM", "WMT", "MA", "COST"],
    },
    "ai_semis": {
        "label": "AI & semiconductors",
        "symbols": ["NVDA", "AMD", "AVGO", "TSM", "MU", "SMCI", "ASML", "ARM",
                    "QCOM", "INTC", "MRVL", "PLTR", "SNOW", "CRM", "ORCL"],
    },
    "growth": {
        "label": "High-growth / secular",
        "symbols": ["NVDA", "TSLA", "PLTR", "SHOP", "NET", "CRWD", "DDOG", "SNOW",
                    "MELI", "ABNB", "UBER", "COIN", "RBLX", "SOFI", "DASH"],
    },
    "dividend": {
        "label": "Dividend & value blue chips",
        "symbols": ["JNJ", "PG", "KO", "PEP", "CVX", "ABBV", "MRK", "HD", "MCD",
                    "VZ", "T", "PFE", "CSCO", "IBM", "MMM"],
    },
    "financials": {
        "label": "Banks & financials",
        "symbols": ["JPM", "BAC", "WFC", "GS", "MS", "C", "SCHW", "BLK", "AXP",
                    "V", "MA", "SPGI", "CB", "PNC", "USB"],
    },
    "energy": {
        "label": "Energy",
        "symbols": ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO",
                    "OXY", "WMB", "KMI", "HAL", "DVN", "HES", "FANG"],
    },
    "healthcare": {
        "label": "Healthcare",
        "symbols": ["UNH", "JNJ", "LLY", "MRK", "ABBV", "PFE", "TMO", "ABT",
                    "DHR", "BMY", "AMGN", "CVS", "MDT", "ISRG", "GILD"],
    },
    "broad": {
        "label": "Broad market & sectors",
        "symbols": ["SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLE", "XLV",
                    "XLY", "XLI", "XLP", "XLU", "XLB", "XLRE", "XLC"],
    },
    # ── India (NSE) ──
    "in_nifty": {
        "market": "in",
        "label": "Nifty large-caps",
        "symbols": ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
                    "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "LT.NS",
                    "KOTAKBANK.NS", "AXISBANK.NS", "BAJFINANCE.NS", "MARUTI.NS", "SUNPHARMA.NS"],
    },
    "in_bank": {
        "market": "in",
        "label": "India banks & financials",
        "symbols": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS",
                    "INDUSINDBK.NS", "BAJFINANCE.NS", "BAJAJFINSV.NS", "SBILIFE.NS", "HDFCLIFE.NS"],
    },
    "in_it": {
        "market": "in",
        "label": "India IT services",
        "symbols": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS", "LTIM.NS"],
    },
    "in_auto": {
        "market": "in",
        "label": "India auto",
        "symbols": ["MARUTI.NS", "TATAMOTORS.NS", "M&M.NS", "EICHERMOT.NS",
                    "HEROMOTOCO.NS", "BAJAJ-AUTO.NS"],
    },
    "in_pharma": {
        "market": "in",
        "label": "India pharma & healthcare",
        "symbols": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "APOLLOHOSP.NS"],
    },
}
DEFAULT_UNIVERSE = "megacap"

# Weights for the composite — renormalised over whichever signals are available.
# Momentum & analyst are the most robust signals; news is a crude keyword lexicon
# so it's weighted a touch lower.
WEIGHTS = {"momentum": 0.30, "news": 0.16, "earnings": 0.16, "analyst": 0.22, "insider": 0.16}

_INSIDER_SCORE = {"net_buying": 78.0, "net_selling": 22.0, "neutral": 50.0}


def _scale(x: float | None, lo: float, hi: float) -> float | None:
    if x is None or hi == lo:
        return None
    return max(0.0, min(100.0, (x - lo) / (hi - lo) * 100.0))


def universe_symbols(key: str) -> list[str]:
    return UNIVERSES.get(key, UNIVERSES[DEFAULT_UNIVERSE])["symbols"]


def _label(key: str) -> str:
    if key.startswith("custom"):
        return "Custom list"
    return UNIVERSES.get(key, {}).get("label", key)


def _build_pick(symbol: str, a: dict[str, Any], news_net: int | None) -> dict[str, Any] | None:
    """Turn a full-analysis payload + news net-score into a ranked pick."""
    if not a or a.get("error"):
        return None
    rets = a.get("returns") or {}
    tech = a.get("technicals") or {}
    score = a.get("score") or {}
    at = a.get("analyst_targets") or {}
    drift = a.get("post_earnings_drift") or {}
    insider = a.get("insider_flow") or {}

    sub: dict[str, float | None] = {}
    tags: list[tuple[str, str]] = []

    # ── Momentum ──
    # Momentum: blend the composite-score momentum with raw 3-month return so
    # strong movers separate from the pack instead of all pinning near the top.
    mom = score.get("momentum")
    r3 = rets.get("3m")
    r3_score = _scale(r3, -25, 45) if r3 is not None else None
    if mom is not None and r3_score is not None:
        mom = mom * 0.6 + r3_score * 0.4
    elif mom is None:
        mom = r3_score
    sub["momentum"] = mom
    if tech.get("trend") == "bullish":
        tags.append(("Uptrend", "up"))
    elif tech.get("trend") == "bearish":
        tags.append(("Downtrend", "down"))
    if r3 is not None and r3 >= 12:
        tags.append((f"+{r3:.0f}% in 3 months", "up"))
    elif r3 is not None and r3 <= -10:
        tags.append((f"{r3:.0f}% in 3 months", "down"))

    # ── News sentiment ──
    if news_net is not None:
        sub["news"] = _scale(news_net, -8, 8)
        if news_net >= 2:
            tags.append(("Positive news flow", "up"))
        elif news_net <= -2:
            tags.append(("Negative headlines", "down"))
    else:
        sub["news"] = None

    # ── Earnings / events (beat track record) ──
    beat = (drift.get("beat") or {}).get("samples") or 0
    miss = (drift.get("miss") or {}).get("samples") or 0
    if beat + miss > 0:
        beat_rate = beat / (beat + miss)
        sub["earnings"] = beat_rate * 100
        if beat_rate >= 0.6 and (beat + miss) >= 3:
            tags.append(("Strong earnings track record", "up"))
    else:
        sub["earnings"] = None

    # ── Analyst (mean upside blended with buy ratio) ──
    up = at.get("target_mean_upside_pct")
    analyst_score = _scale(up, -25, 50) if up is not None else None
    nb = at.get("number_of_buy_ratings")
    nh = at.get("number_of_hold_ratings")
    ns = at.get("number_of_sell_ratings")
    if nb is not None:
        total = (nb or 0) + (nh or 0) + (ns or 0)
        if total > 0:
            br = (nb / total) * 100
            analyst_score = br if analyst_score is None else analyst_score * 0.6 + br * 0.4
    sub["analyst"] = analyst_score
    if up is not None and up >= 10:
        tags.append((f"Analysts see +{up:.0f}%", "up"))

    # ── Insider flow ──
    verdict = insider.get("verdict")
    sub["insider"] = _INSIDER_SCORE.get(verdict)
    if verdict == "net_buying":
        tags.append(("Insider buying", "up"))
    elif verdict == "net_selling":
        tags.append(("Insider selling", "down"))

    # ── Composite (renormalised over available signals) ──
    num = den = 0.0
    for k, w in WEIGHTS.items():
        s = sub.get(k)
        if s is not None:
            num += s * w
            den += w
    if den == 0:
        return None
    overall = round(num / den, 1)

    return {
        "symbol": symbol,
        "last_price": a.get("last_price"),
        "change_1d": rets.get("1d"),
        "overall": overall,
        "signals": {k: (round(v) if v is not None else None) for k, v in sub.items()},
        "tags": [{"label": l, "tone": t} for l, t in tags[:4]],
        "news_net": news_net,
        "upside_pct": up,
        "trend": tech.get("trend"),
        "verdict": score.get("verdict"),
        "rationale": _rationale(sub, tags, overall),
    }


def _rationale(sub: dict[str, float | None], tags: list[tuple[str, str]], overall: float) -> str:
    ups = [l for l, t in tags if t == "up"]
    downs = [l for l, t in tags if t == "down"]
    if overall >= 66 and ups:
        return "Bullish setup — " + ", ".join(ups[:3]).lower() + "."
    if overall <= 40 and downs:
        return "Caution — " + ", ".join(downs[:3]).lower() + "."
    if ups and downs:
        return f"Mixed — {ups[0].lower()} but {downs[0].lower()}."
    if ups:
        return "Leaning positive — " + ", ".join(ups[:2]).lower() + "."
    if downs:
        return "Leaning weak — " + ", ".join(downs[:2]).lower() + "."
    return "Balanced signals, no strong tilt either way."


async def _news_net_by_symbol(symbols: list[str]) -> dict[str, int]:
    """News net-sentiment per symbol (Alpaca for US, yfinance for India)."""
    from app.api.market import _score_headline  # lazy: avoid circular import
    from app.core.markets import Market, detect_market
    out: dict[str, int] = {}
    try:
        if symbols and detect_market(symbols[0]) == Market.IN:
            from app.services import india_market as india
            articles = await india.get_news(symbols, limit=50)
        else:
            broker = get_broker()
            articles = await broker.get_news(symbols=symbols, limit=50)
    except Exception as e:  # noqa: BLE001 — news is best-effort
        logger.warning("scan_news_failed", error=str(e))
        return out
    wanted = {s.upper() for s in symbols}
    for art in articles:
        s = _score_headline(f"{art.get('headline', '')} {art.get('summary', '')}")
        bump = 1 if s > 0 else -1 if s < 0 else 0
        for sym in (art.get("symbols") or []):
            su = str(sym).upper()
            if su in wanted:
                out[su] = out.get(su, 0) + bump
    return out


async def run_scan(universe_key: str, symbols: list[str]) -> None:
    """Background job: compute + rank picks, cache the result in Redis."""
    r = await get_redis()
    key = f"sentiment:scan:{universe_key}"
    try:
        news_net = await _news_net_by_symbol(symbols)
        sem = asyncio.Semaphore(MAX_CONCURRENCY)

        async def one(sym: str) -> dict[str, Any] | None:
            async with sem:
                try:
                    a = await analysis.get_full_analysis(sym)
                except Exception as e:  # noqa: BLE001 — one bad symbol shouldn't sink the scan
                    logger.warning("scan_symbol_failed", symbol=sym, error=str(e))
                    return None
            return _build_pick(sym, a, news_net.get(sym.upper()))

        results = await asyncio.gather(*[one(s) for s in symbols])
        picks = [p for p in results if p and p.get("overall") is not None]
        picks.sort(key=lambda p: p["overall"], reverse=True)
        for i, p in enumerate(picks):
            p["rank"] = i + 1

        payload = {
            "status": "ready",
            "universe": universe_key,
            "label": _label(universe_key),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": len(picks),
            "picks": picks,
        }
        await r.set(key, json.dumps(payload, default=str), ex=SCAN_TTL)
        logger.info("sentiment_scan_done", universe=universe_key, count=len(picks))
    except Exception as e:  # noqa: BLE001
        logger.error("sentiment_scan_failed", universe=universe_key, error=str(e))
        await r.set(key, json.dumps({"status": "error", "universe": universe_key, "error": str(e)}), ex=60)
    finally:
        try:
            await r.delete(f"{key}:lock")
        except Exception:  # noqa: BLE001
            pass


async def get_or_trigger(universe_key: str, symbols: list[str] | None = None, refresh: bool = False) -> dict[str, Any]:
    """Return the cached ranked scan, or kick off a background scan and report progress."""
    syms = symbols or universe_symbols(universe_key)
    r = await get_redis()
    key = f"sentiment:scan:{universe_key}"

    if not refresh:
        cached = await r.get(key)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                pass

    # Acquire a short-lived lock so we don't fan out duplicate scans.
    locked = await r.set(f"{key}:lock", "1", ex=LOCK_TTL, nx=True)
    if locked:
        from app.tasks import dispatch  # lazy import
        dispatch(run_scan(universe_key, syms))

    return {
        "status": "scanning",
        "universe": universe_key,
        "label": _label(universe_key),
        "count": len(syms),
    }
