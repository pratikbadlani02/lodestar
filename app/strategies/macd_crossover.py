"""
MACD (Moving Average Convergence Divergence) Strategy.

Buys when MACD line crosses above signal line (momentum building).
Sells when MACD crosses below signal line.

Reference: https://www.investopedia.com/terms/m/macd.asp
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class MACDStrategy(BaseStrategy):
    name = "macd_crossover"
    description = "MACD signal-line crossover (momentum)"
    required_bars = 60
    default_params = {
        "fast_period": 12,
        "slow_period": 26,
        "signal_period": 9,
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        fast = self.params["fast_period"]
        slow = self.params["slow_period"]
        sig  = self.params["signal_period"]

        df = df.copy()
        df["ema_fast"] = df["close"].ewm(span=fast, adjust=False).mean()
        df["ema_slow"] = df["close"].ewm(span=slow, adjust=False).mean()
        df["macd"] = df["ema_fast"] - df["ema_slow"]
        df["signal"] = df["macd"].ewm(span=sig, adjust=False).mean()
        df["hist"] = df["macd"] - df["signal"]

        if df["signal"].isna().iloc[-1]:
            return None

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        current_price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]

        indicators = {
            "macd":   round(float(curr["macd"]), 4),
            "signal": round(float(curr["signal"]), 4),
            "hist":   round(float(curr["hist"]), 4),
        }

        # Bullish crossover: MACD crosses above signal
        if prev["macd"] <= prev["signal"] and curr["macd"] > curr["signal"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=0.7,
                price=current_price,
                reason=f"MACD crossed above signal (hist={curr['hist']:.3f})",
                indicators=indicators,
            )

        # Bearish crossover: MACD crosses below signal
        if prev["macd"] >= prev["signal"] and curr["macd"] < curr["signal"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.7,
                price=current_price,
                reason=f"MACD crossed below signal (hist={curr['hist']:.3f})",
                indicators=indicators,
            )

        return None
