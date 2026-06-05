"""
Market data service.

Fetches OHLCV bars and caches them in the ``ohlcv`` table. The data source is
chosen by the symbol's market (see ``app/core/markets.py``):
  • US symbols  → Alpaca REST (free IEX tier)
  • IN symbols  → Yahoo Finance via yfinance (``.NS``/``.BO`` suffixed tickers)

Used by both live strategies and backtests. Indian and US bars coexist in the
same table — Indian symbols are stored under their suffixed ticker
(``RELIANCE.NS``), which naturally namespaces them away from US tickers.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.markets import Market, detect_market, to_yf_symbol
from app.core.models import OHLCV
from app.services.broker import AlpacaError, get_broker

logger = get_logger(__name__)

# Alpaca timeframe → yfinance interval
_YF_INTERVAL = {
    "1Min": "1m", "1m": "1m", "5Min": "5m", "5m": "5m",
    "15Min": "15m", "15m": "15m", "1Hour": "1h", "1h": "1h",
    "1Day": "1d", "1d": "1d",
}


def _fetch_yf_bars_sync(
    symbol: str, timeframe: str, start: datetime, end: datetime
) -> list[dict]:
    """Blocking yfinance fetch → Alpaca-shaped bar dicts {t,o,h,l,c,v}."""
    import yfinance as yf

    interval = _YF_INTERVAL.get(timeframe, "1d")
    yf_symbol = to_yf_symbol(symbol, Market.IN)
    hist = yf.Ticker(yf_symbol).history(
        start=start, end=end, interval=interval, auto_adjust=False
    )
    out: list[dict] = []
    if hist is None or hist.empty:
        return out
    for ts, row in hist.iterrows():
        t = pd.Timestamp(ts)
        t = t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")
        try:
            o, h, lo, c, v = (
                float(row["Open"]), float(row["High"]), float(row["Low"]),
                float(row["Close"]), float(row.get("Volume", 0) or 0),
            )
        except (KeyError, TypeError, ValueError):
            continue
        if any(x != x for x in (o, h, lo, c)):  # skip NaN rows
            continue
        out.append({"t": t.isoformat(), "o": o, "h": h, "l": lo, "c": c, "v": v})
    return out


async def fetch_and_store_bars(
    db: AsyncSession,
    symbol: str,
    timeframe: str = "1Day",
    lookback_days: int = 365,
    start: datetime | None = None,
) -> int:
    """
    Fetch bars from the symbol's data source and upsert into the OHLCV table.
    Returns number of bars stored. If `start` is given it overrides lookback_days.
    """
    end = datetime.now(timezone.utc)
    if start is None:
        start = end - timedelta(days=lookback_days)

    if detect_market(symbol) == Market.IN:
        try:
            bars = await asyncio.to_thread(
                _fetch_yf_bars_sync, symbol, timeframe, start, end
            )
        except Exception as e:  # yfinance/network errors
            logger.error("yf_bars_fetch_failed", symbol=symbol, error=str(e))
            return 0
    else:
        broker = get_broker()
        try:
            bars = await broker.get_bars(symbol=symbol, timeframe=timeframe, start=start, end=end)
        except AlpacaError as e:
            logger.error("bars_fetch_failed", symbol=symbol, error=str(e))
            return 0

    if not bars:
        return 0

    tf_db = {"1Min": "1m", "5Min": "5m", "15Min": "15m", "1Hour": "1h", "1Day": "1d"}.get(timeframe, "1d")

    rows = [
        {
            "time": datetime.fromisoformat(b["t"].replace("Z", "+00:00")),
            "symbol": symbol.upper(),
            "timeframe": tf_db,
            "open": Decimal(str(b["o"])),
            "high": Decimal(str(b["h"])),
            "low": Decimal(str(b["l"])),
            "close": Decimal(str(b["c"])),
            "volume": Decimal(str(b["v"])),
        }
        for b in bars
    ]

    stmt = insert(OHLCV).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["time", "symbol", "timeframe"],
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
        },
    )
    await db.execute(stmt)
    await db.flush()
    logger.info("bars_stored", symbol=symbol, count=len(rows), timeframe=tf_db)
    return len(rows)


async def get_bars_df(
    db: AsyncSession,
    symbol: str,
    timeframe: str = "1d",
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int | None = None,
) -> pd.DataFrame:
    """Load bars from DB as pandas DataFrame (sorted ascending by time)."""
    q = select(OHLCV).where(
        OHLCV.symbol == symbol.upper(),
        OHLCV.timeframe == timeframe,
    )
    if start:
        q = q.where(OHLCV.time >= start)
    if end:
        q = q.where(OHLCV.time <= end)
    q = q.order_by(OHLCV.time.asc())
    if limit:
        q = q.order_by(OHLCV.time.desc()).limit(limit)

    result = await db.execute(q)
    rows = result.scalars().all()

    if limit:
        rows = list(reversed(rows))

    if not rows:
        return pd.DataFrame(columns=["time", "open", "high", "low", "close", "volume"])

    df = pd.DataFrame(
        [
            {
                "time": r.time,
                "open": float(r.open),
                "high": float(r.high),
                "low": float(r.low),
                "close": float(r.close),
                "volume": float(r.volume),
            }
            for r in rows
        ]
    )
    return df


async def get_price_bars(
    symbol: str, days: int = 365, timeframe: str = "1Day", market: "Market | str | None" = None,
) -> list[dict]:
    """
    Market-aware live fetch of recent bars as Alpaca-shaped dicts {t,o,h,l,c,v}.

    Routes US → Alpaca, IN → yfinance. ``market`` overrides symbol detection
    (used for index benchmarks like ``^NSEI`` that have no exchange suffix). Does
    NOT touch the DB cache — used by the analysis layer and the simulated broker.
    Returns [] on error.
    """
    from app.core.markets import get_market
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    mkt = get_market(market) if market is not None else detect_market(symbol)
    if mkt == Market.IN:
        try:
            return await asyncio.to_thread(_fetch_yf_bars_sync, symbol, timeframe, start, end)
        except Exception as e:
            logger.warning("yf_price_bars_failed", symbol=symbol, error=str(e))
            return []
    broker = get_broker()
    try:
        return await broker.get_bars(symbol=symbol.upper(), timeframe=timeframe, start=start)
    except AlpacaError as e:
        logger.warning("price_bars_failed", symbol=symbol, error=str(e))
        return []


async def get_last_price(symbol: str) -> Decimal | None:
    """Latest close for a symbol (market-aware). Used by the simulated broker."""
    bars = await get_price_bars(symbol, days=10, timeframe="1Day")
    if not bars:
        return None
    try:
        return Decimal(str(bars[-1]["c"]))
    except (KeyError, ValueError, TypeError):
        return None
