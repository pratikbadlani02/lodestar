"""
ATR Volatility Breakout Strategy.

Buys when price breaks above recent high by N x ATR (volatility expansion).
Classic Turtle Trading / Keltner Channel inspired.

Reference: https://www.investopedia.com/terms/a/atr.asp
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average True Range."""
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


class ATRBreakoutStrategy(BaseStrategy):
    name = "atr_breakout"
    description = "Volatility breakout using ATR-based channels"
    required_bars = 40
    default_params = {
        "atr_period": 14,
        "lookback": 20,  # Channel lookback
        "atr_multiplier": 1.5,  # Breakout threshold in ATRs
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        df = df.copy()
        df["atr"] = compute_atr(df, self.params["atr_period"])
        df["rolling_high"] = df["high"].rolling(self.params["lookback"]).max().shift(1)
        df["rolling_low"] = df["low"].rolling(self.params["lookback"]).min().shift(1)

        if df["atr"].isna().iloc[-1] or df["rolling_high"].isna().iloc[-1]:
            return None

        curr = df.iloc[-1]

        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        current_price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        atr = float(curr["atr"])
        roll_high = float(curr["rolling_high"])
        roll_low = float(curr["rolling_low"])
        close = float(curr["close"])
        mult = self.params["atr_multiplier"]

        upper_band = roll_high + mult * atr
        lower_band = roll_low - mult * atr

        indicators = {
            "atr": round(atr, 4),
            "upper_band": round(upper_band, 4),
            "lower_band": round(lower_band, 4),
            "close": close,
            "rolling_high": roll_high,
            "rolling_low": roll_low,
        }

        # Upside breakout → BUY
        if close > upper_band:
            return Signal(
                timestamp=ts,
                symbol=symbol,
                signal=SignalType.BUY,
                strength=0.8,
                price=current_price,
                reason=f"Breakout above {mult}×ATR channel (close={close:.2f}, upper={upper_band:.2f})",
                indicators=indicators,
            )

        # Downside breakdown → SELL
        if close < lower_band:
            return Signal(
                timestamp=ts,
                symbol=symbol,
                signal=SignalType.SELL,
                strength=0.8,
                price=current_price,
                reason=f"Breakdown below {mult}×ATR channel (close={close:.2f}, lower={lower_band:.2f})",
                indicators=indicators,
            )

        return None
