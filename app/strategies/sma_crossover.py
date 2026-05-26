"""
SMA Crossover Strategy.

Classic trend-following: buys when short SMA crosses above long SMA,
sells when it crosses below. Best on trending, liquid large-caps.

Reference: https://www.investopedia.com/terms/g/goldencross.asp
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class SMACrossoverStrategy(BaseStrategy):
    name = "sma_crossover"
    description = "Simple moving average crossover (golden/death cross)"
    required_bars = 60
    default_params = {
        "short_window": 20,
        "long_window": 50,
        "min_volume": 100_000,  # Avoid illiquid symbols
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        short = self.params["short_window"]
        long = self.params["long_window"]

        df = df.copy()
        df["sma_short"] = df["close"].rolling(window=short).mean()
        df["sma_long"] = df["close"].rolling(window=long).mean()

        if df["sma_long"].isna().iloc[-1]:
            return None

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        # Liquidity filter
        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        current_price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]

        indicators = {
            "sma_short": round(float(curr["sma_short"]), 4),
            "sma_long": round(float(curr["sma_long"]), 4),
            "close": float(curr["close"]),
            "volume": float(curr["volume"]),
        }

        # Golden cross: short was below, now above → BUY
        if prev["sma_short"] <= prev["sma_long"] and curr["sma_short"] > curr["sma_long"]:
            return Signal(
                timestamp=ts,
                symbol=symbol,
                signal=SignalType.BUY,
                strength=0.7,
                price=current_price,
                reason=f"Golden cross: SMA{short} crossed above SMA{long}",
                indicators=indicators,
            )

        # Death cross: short was above, now below → SELL
        if prev["sma_short"] >= prev["sma_long"] and curr["sma_short"] < curr["sma_long"]:
            return Signal(
                timestamp=ts,
                symbol=symbol,
                signal=SignalType.SELL,
                strength=0.7,
                price=current_price,
                reason=f"Death cross: SMA{short} crossed below SMA{long}",
                indicators=indicators,
            )

        return None
