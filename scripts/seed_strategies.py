"""Seed default strategies — creates 3 paused strategies on first run."""
import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.core.models import Strategy, StrategyStatus


DEFAULTS = [
    {
        "name": "SMA 20/50 — Large Cap Tech",
        "strategy_type": "sma_crossover",
        "symbols": ["AAPL", "MSFT", "GOOGL", "NVDA"],
        "params": {"short_window": 20, "long_window": 50, "min_volume": 100000},
        "position_size_pct": Decimal("5.00"),
    },
    {
        "name": "RSI Mean Reversion — ETFs",
        "strategy_type": "rsi_mean_reversion",
        "symbols": ["SPY", "QQQ", "IWM"],
        "params": {"rsi_period": 14, "oversold": 30, "overbought": 70, "min_volume": 1000000},
        "position_size_pct": Decimal("3.00"),
    },
    {
        "name": "ATR Breakout — Momentum",
        "strategy_type": "atr_breakout",
        "symbols": ["TSLA", "AMD", "META"],
        "params": {"atr_period": 14, "lookback": 20, "atr_multiplier": 1.5, "min_volume": 500000},
        "position_size_pct": Decimal("4.00"),
    },
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        for cfg in DEFAULTS:
            existing = await db.execute(select(Strategy).where(Strategy.name == cfg["name"]))
            if existing.scalar_one_or_none():
                print(f"  skip (exists): {cfg['name']}")
                continue
            s = Strategy(**cfg, status="paused")
            db.add(s)
            print(f"  created (paused): {cfg['name']}")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
