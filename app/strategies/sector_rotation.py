"""
Sector Rotation Strategy.

Rotates capital into the strongest-performing sector ETFs based on
relative momentum (3-month return). Holds top N sectors.

Symbols typically: XLF (financial), XLK (tech), XLE (energy),
XLV (healthcare), XLI (industrial), XLP (staples), XLY (consumer),
XLU (utilities), XLRE (real estate), XLB (materials), XLC (comm).
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class SectorRotationStrategy(BaseStrategy):
    name = "sector_rotation"
    description = "Rotate into top sector ETFs by relative momentum"
    required_bars = 70
    default_params = {
        "lookback_days": 63,  # ~3 months
        "min_volume": 500_000,
        "momentum_threshold": 0.05,  # 5% over lookback
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        lookback = self.params["lookback_days"]
        df = df.copy()

        if len(df) < lookback + 1:
            return None

        curr = df.iloc[-1]

        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        past_close = float(df.iloc[-lookback]["close"])
        curr_close = float(curr["close"])
        momentum = (curr_close / past_close) - 1.0

        current_price = Decimal(str(curr_close))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]

        indicators = {
            "momentum_pct": round(momentum * 100, 4),
            "lookback_days": lookback,
            "close": curr_close,
        }

        # Strong positive momentum → BUY
        if momentum > self.params["momentum_threshold"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=min(1.0, momentum * 5),
                price=current_price,
                reason=f"{lookback}-day momentum {momentum*100:+.2f}% (above threshold)",
                indicators=indicators,
            )

        # Strong negative momentum → SELL
        if momentum < -self.params["momentum_threshold"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=min(1.0, abs(momentum) * 5),
                price=current_price,
                reason=f"{lookback}-day momentum {momentum*100:+.2f}% (below threshold)",
                indicators=indicators,
            )

        return None
