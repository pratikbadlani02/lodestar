"""Market data routes — OHLCV, news, screener, options, fundamentals, earnings."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.markets import Market, detect_market, get_market, list_markets
from app.core.models import OHLCV
from app.services import fundamentals as fund
from app.services import india_market as india
from app.services import stock_analysis as analysis
from app.services.broker import AlpacaError, get_broker
from app.services.market_data import fetch_and_store_bars, get_bars_df

router = APIRouter(prefix="/market", tags=["Market Data"])

# Alpaca "1d" ↔ fetch "1Day" mapping for the on-demand backfill below.
_FETCH_TF = {"1d": "1Day", "1h": "1Hour", "15m": "15Min", "5m": "5Min", "1m": "1Min"}


@router.get("/markets")
async def get_markets() -> dict:
    """Available trading markets for the UI selector (US, India)."""
    return {"markets": list_markets()}


@router.get("/ohlcv/{symbol}")
async def get_ohlcv(
    symbol: str,
    timeframe: str = "1d",
    days: int = Query(default=365, ge=1, le=3650),
    db: AsyncSession = Depends(get_db),
) -> dict:
    start = datetime.now(timezone.utc) - timedelta(days=days)
    df = await get_bars_df(db, symbol=symbol, timeframe=timeframe, start=start)
    # On a cold cache (common for Indian symbols on first view), backfill once
    # from the symbol's data source, then re-read.
    if df.empty:
        await fetch_and_store_bars(
            db, symbol=symbol, timeframe=_FETCH_TF.get(timeframe, "1Day"),
            lookback_days=days,
        )
        df = await get_bars_df(db, symbol=symbol, timeframe=timeframe, start=start)
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "bars_count": len(df),
        "bars": [
            {
                "t": row["time"].isoformat() if hasattr(row["time"], "isoformat") else str(row["time"]),
                "o": row["open"], "h": row["high"], "l": row["low"],
                "c": row["close"], "v": row["volume"],
            }
            for _, row in df.iterrows()
        ],
    }


@router.post("/fetch/{symbol}")
async def trigger_fetch(
    symbol: str,
    timeframe: str = "1Day",
    lookback_days: int = 365,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force-refresh OHLCV from broker."""
    count = await fetch_and_store_bars(db, symbol=symbol, timeframe=timeframe, lookback_days=lookback_days)
    return {"symbol": symbol.upper(), "bars_stored": count}


@router.get("/news")
async def get_news(
    symbols: str | None = Query(default=None, description="Comma-separated symbols, e.g. AAPL,TSLA"),
    limit: int = Query(default=20, ge=1, le=50),
    market: str = Query(default="us", description="us | in"),
) -> dict:
    """Latest news — Alpaca for US, yfinance for India (Webull-style feed).
    With explicit symbols, routes per-symbol by suffix; the general feed (no
    symbols) follows the ``market`` selector."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] if symbols else None
    if sym_list:
        in_syms = [s for s in sym_list if detect_market(s) == Market.IN]
        us_syms = [s for s in sym_list if detect_market(s) == Market.US]
        articles = []
        if in_syms:
            articles += await india.get_news(in_syms, limit=limit)
        if us_syms:
            try:
                articles += await get_broker().get_news(symbols=us_syms, limit=limit)
            except AlpacaError as e:
                raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    elif get_market(market) == Market.IN:
        articles = await india.get_news(None, limit=limit)
    else:
        broker = get_broker()
        try:
            articles = await broker.get_news(symbols=None, limit=limit)
        except AlpacaError as e:
            raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    return {
        "count": len(articles),
        "articles": [
            {
                "id": a.get("id"),
                "headline": a.get("headline"),
                "summary": a.get("summary"),
                "author": a.get("author"),
                "source": a.get("source"),
                "url": a.get("url"),
                "symbols": a.get("symbols", []),
                "published_at": a.get("created_at"),
            }
            for a in articles
        ],
    }


@router.get("/screener")
async def screener(
    min_volume: float = Query(default=0, ge=0, description="Min daily volume"),
    min_price: float = Query(default=0, ge=0),
    max_price: float = Query(default=1_000_000, ge=0),
    min_change_pct: float = Query(default=-100, description="Min % change from open"),
    max_change_pct: float = Query(default=100),
    market: str = Query(default="us", description="us | in"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Screen stocks by volume and price-change filters. US uses locally-cached
    OHLCV bars; India screens the NSE universe from live yfinance quotes.
    """
    if get_market(market) == Market.IN:
        return await india.screen(
            min_volume=min_volume, min_price=min_price, max_price=max_price,
            min_change_pct=min_change_pct, max_change_pct=max_change_pct,
        )
    cutoff = datetime.now(timezone.utc) - timedelta(days=3)
    result = await db.execute(
        select(OHLCV)
        .where(OHLCV.timeframe == "1d", OHLCV.time >= cutoff)
        .order_by(OHLCV.symbol, OHLCV.time.desc())
    )
    rows = result.scalars().all()

    # Keep only the most recent bar per symbol
    seen: set[str] = set()
    latest: list[OHLCV] = []
    for row in rows:
        if row.symbol not in seen:
            seen.add(row.symbol)
            latest.append(row)

    matches = []
    for bar in latest:
        price = float(bar.close)
        volume = float(bar.volume)
        open_price = float(bar.open)
        change_pct = (price - open_price) / open_price * 100 if open_price else 0

        if (
            min_price <= price <= max_price
            and volume >= min_volume
            and min_change_pct <= change_pct <= max_change_pct
        ):
            matches.append({
                "symbol": bar.symbol,
                "price": price,
                "open": open_price,
                "high": float(bar.high),
                "low": float(bar.low),
                "volume": volume,
                "change_pct": round(change_pct, 2),
                "as_of": bar.time.isoformat(),
            })

    matches.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
    return {"count": len(matches), "results": matches}


@router.get("/snapshots")
async def get_snapshots(
    symbols: str = Query(..., description="Comma-separated symbols, e.g. AAPL,TSLA"),
    market: str = Query(default="us", description="Hint for ambiguous index symbols (^NSEI): us | in"),
) -> dict:
    """Quote snapshots, routed per-symbol by exchange suffix: Alpaca for US
    tickers, yfinance for Indian (.NS/.BO) tickers. A mixed batch (e.g. a
    cross-market watchlist) is split and merged so each symbol gets the right
    source. Index symbols (``^NSEI``, ``^GSPC``) carry no suffix, so the
    ``market`` hint decides their source."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    hint = get_market(market)

    def route(sym: str) -> Market:
        # Index symbols are ambiguous (^NSEI is Indian, ^GSPC is US) — defer to
        # the caller's market hint. Suffix and bare tickers self-identify.
        if sym.startswith("^"):
            return hint
        return detect_market(sym)

    in_syms = [s for s in sym_list if route(s) == Market.IN]
    us_syms = [s for s in sym_list if route(s) == Market.US]
    data: dict = {}
    if in_syms:
        data.update(await india.get_snapshots(in_syms))
    if us_syms:
        try:
            data.update(await get_broker().get_snapshots(us_syms))
        except AlpacaError as e:
            raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    return {"snapshots": data}


# ── Profile / fundamentals (yfinance) ─────────────────────────────
@router.get("/profile/{symbol}")
async def get_profile(symbol: str) -> dict:
    return await fund.get_profile(symbol)


@router.get("/fundamentals/{symbol}")
async def get_fundamentals(
    symbol: str,
    period: str = Query(default="annual", pattern="^(annual|quarterly)$"),
) -> dict:
    return await fund.get_fundamentals(symbol, period=period)


# ── Options chain ─────────────────────────────────────────────────
@router.get("/options/{symbol}/expirations")
async def get_option_expirations(
    symbol: str,
) -> dict:
    expiries = await fund.get_option_expirations(symbol)
    return {"symbol": symbol.upper(), "expirations": expiries}


@router.get("/options/{symbol}")
async def get_option_chain(
    symbol: str,
    expiry: str | None = Query(default=None, description="YYYY-MM-DD; defaults to nearest"),
) -> dict:
    if expiry is None:
        expiries = await fund.get_option_expirations(symbol)
        if not expiries:
            raise HTTPException(status_code=404, detail=f"No options listed for {symbol.upper()}")
        expiry = expiries[0]
    return await fund.get_option_chain(symbol, expiry)


# ── Earnings ──────────────────────────────────────────────────────
# NOTE: /earnings/calendar must precede /earnings/{symbol} so the literal route wins.
@router.get("/earnings/calendar")
async def get_earnings_calendar(
    symbols: str = Query(..., description="Comma-separated symbols"),
) -> dict:
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    rows = await fund.get_earnings_calendar(sym_list)
    return {"count": len(rows), "results": rows}


@router.get("/earnings/{symbol}")
async def get_earnings(symbol: str) -> dict:
    return await fund.get_earnings_history(symbol)


# ── Analyst data + holders ────────────────────────────────────────
@router.get("/analysts/{symbol}")
async def get_analysts(symbol: str) -> dict:
    return await fund.get_analyst_data(symbol)


@router.get("/holders/{symbol}")
async def get_holders(symbol: str) -> dict:
    return await fund.get_holders(symbol)


@router.get("/dividends/{symbol}")
async def get_dividends(symbol: str) -> dict:
    return await fund.get_dividends(symbol)


@router.get("/splits/{symbol}")
async def get_splits(symbol: str) -> dict:
    return await fund.get_splits(symbol)


@router.get("/sustainability/{symbol}")
async def get_sustainability(symbol: str) -> dict:
    return await fund.get_sustainability(symbol)


@router.get("/recommendation-trend/{symbol}")
async def get_recommendation_trend(symbol: str) -> dict:
    return await fund.get_recommendation_trend(symbol)


# ── Tape / quotes (intraday) ──────────────────────────────────────
@router.get("/trades/{symbol}")
async def get_trades(
    symbol: str,
    limit: int = Query(default=200, ge=1, le=10_000),
) -> dict:
    broker = get_broker()
    try:
        trades = await broker.get_trades(symbol, limit=limit)
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    return {"symbol": symbol.upper(), "count": len(trades), "trades": trades}


@router.get("/quotes/{symbol}")
async def get_quotes(
    symbol: str,
    limit: int = Query(default=200, ge=1, le=10_000),
) -> dict:
    broker = get_broker()
    try:
        quotes = await broker.get_quotes(symbol, limit=limit)
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    return {"symbol": symbol.upper(), "count": len(quotes), "quotes": quotes}


# ── Movers / most-actives ─────────────────────────────────────────
@router.get("/movers")
async def get_movers(
    top: int = Query(default=25, ge=1, le=100),
    market: str = Query(default="us", description="us | in"),
) -> dict:
    if get_market(market) == Market.IN:
        return await india.get_movers(top=top)
    broker = get_broker()
    try:
        return await broker.get_movers(top=top)
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")


@router.get("/most-actives")
async def get_most_actives(
    top: int = Query(default=25, ge=1, le=100),
    by: str = Query(default="volume", pattern="^(volume|trades)$"),
    market: str = Query(default="us", description="us | in"),
) -> dict:
    if get_market(market) == Market.IN:
        return await india.get_most_actives(top=top, by=by)
    broker = get_broker()
    try:
        return await broker.get_most_actives(top=top, by=by)
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")


# ── Crypto ────────────────────────────────────────────────────────
@router.get("/crypto/snapshots")
async def get_crypto_snapshots(
    symbols: str = Query(..., description="Comma-separated, e.g. BTC/USD,ETH/USD"),
) -> dict:
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    broker = get_broker()
    try:
        return {"snapshots": await broker.get_crypto_snapshots(sym_list)}
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")


@router.get("/crypto/bars/{symbol:path}")
async def get_crypto_bars(
    symbol: str,
    timeframe: str = "1Day",
    days: int = Query(default=180, ge=1, le=3650),
) -> dict:
    broker = get_broker()
    start = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        bars = await broker.get_crypto_bars(symbol, timeframe=timeframe, start=start)
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    return {"symbol": symbol, "count": len(bars), "bars": bars}


# ── News sentiment (heuristic on Alpaca headlines) ────────────────
_POS_WORDS = {
    "beat", "beats", "exceed", "exceeds", "surge", "surges", "soar", "soars",
    "jump", "jumps", "rally", "rallies", "gain", "gains", "rise", "rises",
    "upgrade", "upgrades", "outperform", "buy", "bullish", "record", "strong",
    "profit", "profits", "growth", "boost", "boosts", "raise", "raises",
    "approve", "approves", "win", "wins", "positive",
}
_NEG_WORDS = {
    "miss", "misses", "drop", "drops", "fall", "falls", "plunge", "plunges",
    "slump", "slumps", "downgrade", "downgrades", "underperform", "sell",
    "bearish", "weak", "loss", "losses", "decline", "declines", "cut", "cuts",
    "warn", "warns", "warning", "lawsuit", "investigation", "probe", "fraud",
    "fire", "fires", "layoff", "layoffs", "delay", "negative", "concern",
}


def _score_headline(text: str) -> int:
    if not text:
        return 0
    words = {w.strip(".,!?:;()[]").lower() for w in text.split()}
    pos = len(words & _POS_WORDS)
    neg = len(words & _NEG_WORDS)
    return pos - neg


@router.get("/analysis/{symbol}")
async def get_analysis(
    symbol: str,
    include_news: bool = Query(default=True),
) -> dict:
    """Aggregate stock analysis: returns, technicals, risk, factor score, seasonality."""
    payload = await analysis.get_full_analysis(symbol)
    # Layer on yfinance signals that don't require bars
    try:
        payload["earnings_surprise"] = await fund.get_earnings_surprise(symbol)
    except Exception:
        payload["earnings_surprise"] = None
    try:
        payload["short_interest"] = await fund.get_short_interest(symbol)
    except Exception:
        payload["short_interest"] = None
    if include_news:
        try:
            payload["news"] = await _news_for_symbol(symbol, limit=10)
        except Exception:
            payload["news"] = []
    return payload


async def _news_for_symbol(symbol: str, limit: int) -> list[dict]:
    """Market-aware single-symbol news (Alpaca US / yfinance IN)."""
    if detect_market(symbol) == Market.IN:
        return await india.get_news([symbol.upper()], limit=limit)
    broker = get_broker()
    return await broker.get_news(symbols=[symbol.upper()], limit=limit)


@router.get("/earnings-surprise/{symbol}")
async def get_earnings_surprise(symbol: str) -> dict:
    return await fund.get_earnings_surprise(symbol)


@router.get("/short-interest/{symbol}")
async def get_short_interest(symbol: str) -> dict:
    return await fund.get_short_interest(symbol)


@router.get("/sentiment-scan/universes")
async def sentiment_scan_universes(
    market: str = Query(default="us", description="us | in"),
) -> dict:
    """List the curated universes the scanner can run, scoped to the market."""
    from app.services import sentiment_scanner as scanner
    mkt = get_market(market).value
    return {
        "universes": [
            {"key": k, "label": v["label"], "count": len(v["symbols"])}
            for k, v in scanner.UNIVERSES.items()
            if v.get("market", "us") == mkt
        ]
    }


@router.get("/sentiment-scan")
async def sentiment_scan(
    universe: str = Query(default="megacap"),
    symbols: str | None = Query(default=None, description="Optional comma-separated override"),
    refresh: bool = Query(default=False),
) -> dict:
    """Ranked market-sentiment top picks for a universe.

    Fuses momentum, news sentiment, earnings track record, analyst targets and
    insider flow into a 0–100 score. Returns the cached ranked result, or
    `{status: "scanning"}` while a background scan runs (poll to get results).
    """
    import hashlib
    from app.services import sentiment_scanner as scanner
    syms = None
    if symbols:
        syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:30]
        # Distinct cache key per custom list so different lists don't collide.
        universe = "custom:" + hashlib.md5(",".join(sorted(syms)).encode()).hexdigest()[:8]
    return await scanner.get_or_trigger(universe, symbols=syms, refresh=refresh)


@router.get("/news-sentiment/{symbol}")
async def get_news_sentiment(
    symbol: str,
    limit: int = Query(default=30, ge=1, le=50),
) -> dict:
    try:
        articles = await _news_for_symbol(symbol, limit=limit)
    except AlpacaError as e:
        raise HTTPException(status_code=502, detail=f"Broker error: {e}")
    pos = neg = neu = 0
    enriched = []
    for a in articles:
        s = _score_headline(f"{a.get('headline','')} {a.get('summary','')}")
        label = "positive" if s > 0 else "negative" if s < 0 else "neutral"
        if s > 0:
            pos += 1
        elif s < 0:
            neg += 1
        else:
            neu += 1
        enriched.append({
            "id": a.get("id"),
            "headline": a.get("headline"),
            "summary": a.get("summary"),
            "url": a.get("url"),
            "source": a.get("source"),
            "symbols": a.get("symbols", []),
            "published_at": a.get("created_at"),
            "sentiment_score": s,
            "sentiment": label,
        })
    total = max(1, pos + neg + neu)
    return {
        "symbol": symbol.upper(),
        "summary": {
            "positive": pos,
            "negative": neg,
            "neutral": neu,
            "positive_pct": round(pos / total * 100, 1),
            "negative_pct": round(neg / total * 100, 1),
            "net_score": pos - neg,
        },
        "articles": enriched,
    }
