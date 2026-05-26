"""
RSI Mean Reversion Strategy.

Classic mean reversion: buys oversold (RSI < 30), sells overbought (RSI > 70).
Best on range-bound, liquid stocks. Dangerous in strong trends.

Reference: https://www.investopedia.com/terms/r/rsi.asp
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


def compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Standard Wilder's RSI calculation."""
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

    rs = avg_gain / avg_loss.replace(0, float("nan"))
    rsi = 100 - (100 / (1 + rs))
    return rsi


class RSIMeanReversionStrategy(BaseStrategy):
    name = "rsi_mean_reversion"
    description = "RSI oversold/overbought mean reversion"
    required_bars = 30
    default_params = {
        "rsi_period": 14,
        "oversold": 30,
        "overbought": 70,
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        df = df.copy()
        df["rsi"] = compute_rsi(df["close"], self.params["rsi_period"])

        if df["rsi"].isna().iloc[-1]:
            return None

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        current_price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        rsi_val = float(curr["rsi"])
        prev_rsi = float(prev["rsi"])

        indicators = {
            "rsi": round(rsi_val, 2),
            "prev_rsi": round(prev_rsi, 2),
            "close": float(curr["close"]),
        }

        # BUY: RSI crossed back up from oversold
        if prev_rsi <= self.params["oversold"] and rsi_val > self.params["oversold"]:
            return Signal(
                timestamp=ts,
                symbol=symbol,
                signal=SignalType.BUY,
                strength=0.6,
                price=current_price,
                reason=f"RSI exited oversold zone ({prev_rsi:.1f} → {rsi_val:.1f})",
                indicators=indicators,
            )

        # SELL: RSI crossed back down from overbought
        if prev_rsi >= self.params["overbought"] and rsi_val < self.params["overbought"]:
            return Signal(
                timestamp=ts,
                symbol=symbol,
                signal=SignalType.SELL,
                strength=0.6,
                price=current_price,
                reason=f"RSI exited overbought zone ({prev_rsi:.1f} → {rsi_val:.1f})",
                indicators=indicators,
            )

        return None
