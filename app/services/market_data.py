"""
Market data service.

Fetches OHLCV bars from Alpaca and caches them in TimescaleDB.
Used by both live strategies and backtests.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.models import OHLCV
from app.services.broker import AlpacaError, get_broker

logger = get_logger(__name__)


async def fetch_and_store_bars(
    db: AsyncSession,
    symbol: str,
    timeframe: str = "1Day",
    lookback_days: int = 365,
    start: datetime | None = None,
) -> int:
    """
    Fetch bars from Alpaca and upsert into OHLCV hypertable.
    Returns number of bars stored.
    If `start` is provided it overrides the lookback_days calculation.
    """
    broker = get_broker()
    end = datetime.now(timezone.utc)
    if start is None:
        start = end - timedelta(days=lookback_days)

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
