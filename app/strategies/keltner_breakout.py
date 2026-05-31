"""
Keltner Channel Breakout Strategy.

EMA midline with ATR-scaled bands. Going long on a close above the upper band
captures volatility expansion / momentum thrusts; exit on a close back below
the lower band. Common in momentum-breakout bots and often paired with a
Bollinger "squeeze" filter.

Reference: Chester Keltner / Linda Raschke Keltner channel.
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class KeltnerBreakoutStrategy(BaseStrategy):
    name = "keltner_breakout"
    description = "Keltner channel breakout (EMA ± ATR bands)"
    required_bars = 60
    default_params = {
        "ema_period": 20,
        "atr_period": 10,
        "multiplier": 2.0,
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        ema_n = int(self.params["ema_period"])
        atr_n = int(self.params["atr_period"])
        mult = float(self.params["multiplier"])

        df = df.copy()
        high, low, close = df["high"], df["low"], df["close"]
        mid = close.ewm(span=ema_n, adjust=False).mean()
        prev_close = close.shift(1)
        tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1 / atr_n, adjust=False).mean()
        upper = mid + mult * atr
        lower = mid - mult * atr

        if pd.isna(upper.iloc[-1]) or pd.isna(lower.iloc[-2]):
            return None

        curr, prev = df.iloc[-1], df.iloc[-2]
        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        indicators = {
            "kc_upper": round(float(upper.iloc[-1]), 4),
            "kc_mid": round(float(mid.iloc[-1]), 4),
            "kc_lower": round(float(lower.iloc[-1]), 4),
            "close": float(curr["close"]),
        }

        # Close crosses above the upper band → BUY.
        if curr["close"] > upper.iloc[-1] and prev["close"] <= upper.iloc[-2]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=0.75,
                price=price, reason=f"Keltner breakout > upper band (EMA{ema_n}+{mult}·ATR)",
                indicators=indicators,
            )
        # Close crosses below the lower band → SELL/exit.
        if curr["close"] < lower.iloc[-1] and prev["close"] >= lower.iloc[-2]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.75,
                price=price, reason=f"Keltner breakdown < lower band (EMA{ema_n}−{mult}·ATR)",
                indicators=indicators,
            )
        return None
