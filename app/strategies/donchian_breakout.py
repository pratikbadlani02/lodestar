"""
Donchian Channel Breakout (Turtle) Strategy.

The original Turtle Traders system: go long on a breakout above the highest
high of the last N bars, exit on a break below the lowest low of the last M
bars. Still the backbone of many CTA / managed-futures trend-following bots.

Reference: Richard Dennis / William Eckhardt "Turtle Trading" rules.
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class DonchianBreakoutStrategy(BaseStrategy):
    name = "donchian_breakout"
    description = "Donchian channel breakout (Turtle trend system)"
    required_bars = 60
    default_params = {
        "entry_period": 20,   # breakout lookback (N-bar high)
        "exit_period": 10,    # exit lookback (M-bar low)
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        entry = int(self.params["entry_period"])
        exit_p = int(self.params["exit_period"])

        df = df.copy()
        # Prior-window extremes (shift(1) so the current bar isn't included).
        upper = df["high"].rolling(entry).max().shift(1)
        lower = df["low"].rolling(exit_p).min().shift(1)

        if pd.isna(upper.iloc[-1]) or pd.isna(lower.iloc[-1]):
            return None

        curr, prev = df.iloc[-1], df.iloc[-2]
        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        indicators = {
            "donchian_upper": round(float(upper.iloc[-1]), 4),
            "donchian_lower": round(float(lower.iloc[-1]), 4),
            "close": float(curr["close"]),
        }

        # Breakout above prior N-bar high → BUY (new break only).
        if curr["close"] > upper.iloc[-1] and prev["close"] <= upper.iloc[-2]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=0.8,
                price=price, reason=f"{entry}-bar Donchian breakout",
                indicators=indicators,
            )
        # Break below prior M-bar low → SELL/exit.
        if curr["close"] < lower.iloc[-1] and prev["close"] >= lower.iloc[-2]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.8,
                price=price, reason=f"{exit_p}-bar Donchian breakdown",
                indicators=indicators,
            )
        return None
