"""
Bollinger Band Squeeze Breakout Strategy.

A squeeze is when bands narrow (low volatility); we buy when price
breaks out above upper band after a squeeze, sell on lower break.

Reference: https://www.investopedia.com/terms/b/bollingerbands.asp
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class BollingerSqueezeStrategy(BaseStrategy):
    name = "bollinger_squeeze"
    description = "Bollinger Band squeeze + breakout"
    required_bars = 50
    default_params = {
        "period": 20,
        "std_dev": 2.0,
        "squeeze_threshold": 0.10,  # Bandwidth < 10% = squeeze
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        period = self.params["period"]
        std    = self.params["std_dev"]

        df = df.copy()
        df["sma"]   = df["close"].rolling(period).mean()
        df["sd"]    = df["close"].rolling(period).std()
        df["upper"] = df["sma"] + std * df["sd"]
        df["lower"] = df["sma"] - std * df["sd"]
        df["bandwidth"] = (df["upper"] - df["lower"]) / df["sma"]

        if df["sma"].isna().iloc[-1]:
            return None

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        current_price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]

        # Was previous bar in a squeeze?
        was_squeezed = float(prev["bandwidth"]) < self.params["squeeze_threshold"]

        indicators = {
            "close":     float(curr["close"]),
            "upper":     round(float(curr["upper"]), 4),
            "lower":     round(float(curr["lower"]), 4),
            "bandwidth": round(float(curr["bandwidth"]), 4),
            "was_squeezed": was_squeezed,
        }

        # Upside breakout from squeeze
        if was_squeezed and curr["close"] > curr["upper"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=0.8,
                price=current_price,
                reason=f"Bollinger squeeze breakout above upper band ({curr['upper']:.2f})",
                indicators=indicators,
            )

        # Downside break from squeeze
        if was_squeezed and curr["close"] < curr["lower"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.8,
                price=current_price,
                reason=f"Bollinger squeeze breakdown below lower band ({curr['lower']:.2f})",
                indicators=indicators,
            )

        return None
