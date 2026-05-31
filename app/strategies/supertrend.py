"""
Supertrend Strategy.

ATR-based trend filter that flips long/short as price crosses a volatility-
scaled band. One of the most widely deployed signals in retail algo / crypto
trading bots (TradingView, 3Commas, Freqtrade). Catches sustained trends and
stays out of chop relative to fixed MAs.

Reference: Olivier Seban's "Supertrend" indicator.
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class SupertrendStrategy(BaseStrategy):
    name = "supertrend"
    description = "Supertrend (ATR band) trend-following flip"
    required_bars = 60
    default_params = {
        "atr_period": 10,
        "multiplier": 3.0,
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        period = int(self.params["atr_period"])
        mult = float(self.params["multiplier"])

        df = df.copy()
        high, low, close = df["high"], df["low"], df["close"]
        prev_close = close.shift(1)
        tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False).mean()

        hl2 = (high + low) / 2
        ub = (hl2 + mult * atr).values
        lb = (hl2 - mult * atr).values
        cl = close.values
        n = len(df)
        if n < period + 2 or pd.isna(atr.iloc[-1]):
            return None

        # Carry-forward final bands, then derive the trend direction series.
        fu, fl = ub.copy(), lb.copy()
        for i in range(1, n):
            fu[i] = ub[i] if (ub[i] < fu[i - 1] or cl[i - 1] > fu[i - 1]) else fu[i - 1]
            fl[i] = lb[i] if (lb[i] > fl[i - 1] or cl[i - 1] < fl[i - 1]) else fl[i - 1]

        trend = [True] * n
        for i in range(1, n):
            if cl[i] > fu[i - 1]:
                trend[i] = True
            elif cl[i] < fl[i - 1]:
                trend[i] = False
            else:
                trend[i] = trend[i - 1]

        curr = df.iloc[-1]
        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        indicators = {
            "supertrend": round(float(fl[-1] if trend[-1] else fu[-1]), 4),
            "atr": round(float(atr.iloc[-1]), 4),
            "close": float(curr["close"]),
        }

        # Flip up → BUY, flip down → SELL.
        if trend[-1] and not trend[-2]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=0.75,
                price=price, reason=f"Supertrend flipped bullish (ATR{period}×{mult})",
                indicators=indicators,
            )
        if not trend[-1] and trend[-2]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.75,
                price=price, reason=f"Supertrend flipped bearish (ATR{period}×{mult})",
                indicators=indicators,
            )
        return None
