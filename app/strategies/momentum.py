"""
Time-Series Momentum Strategy.

Absolute (time-series) momentum with a trend filter — long only while the
asset's rate-of-change is positive AND price is above its long moving average.
The core of AQR's time-series momentum and Antonacci's dual-momentum systems,
and a staple of systematic quant bots.

References:
  Moskowitz, Ooi & Pedersen (2012), "Time Series Momentum".
  Gary Antonacci, "Dual Momentum Investing".
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class MomentumStrategy(BaseStrategy):
    name = "momentum"
    description = "Time-series momentum (ROC) with long-MA trend filter"
    required_bars = 120
    default_params = {
        "lookback": 60,     # ROC lookback (~3 months of trading days)
        "trend_ma": 100,    # long moving-average filter
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        lb = int(self.params["lookback"])
        ma_n = int(self.params["trend_ma"])

        df = df.copy()
        close = df["close"]
        roc = close / close.shift(lb) - 1.0
        ma = close.rolling(ma_n).mean()

        if pd.isna(roc.iloc[-1]) or pd.isna(ma.iloc[-1]) or pd.isna(roc.iloc[-2]) or pd.isna(ma.iloc[-2]):
            return None

        curr, prev = df.iloc[-1], df.iloc[-2]
        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        # "In the trade" condition: positive momentum AND above the trend MA.
        now = bool(roc.iloc[-1] > 0 and curr["close"] > ma.iloc[-1])
        was = bool(roc.iloc[-2] > 0 and prev["close"] > ma.iloc[-2])

        price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        indicators = {
            "roc": round(float(roc.iloc[-1]), 4),
            "trend_ma": round(float(ma.iloc[-1]), 4),
            "close": float(curr["close"]),
        }

        if now and not was:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=0.7,
                price=price, reason=f"Momentum on: {lb}-bar ROC>0 & price>MA{ma_n}",
                indicators=indicators,
            )
        if was and not now:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.7,
                price=price, reason=f"Momentum off: ROC<0 or price<MA{ma_n}",
                indicators=indicators,
            )
        return None
