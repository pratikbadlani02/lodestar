"""
Multi-Factor Composite Strategy.

Blends the price-based factors institutions lean on into one conviction score:
  • Momentum  — rate of change over a medium horizon
  • Trend     — distance above/below a long moving average
  • Low-vol   — realized volatility below its own median (calmer = better)
Goes long when the weighted composite turns bullish, exits when it turns
bearish. The composite also sets `strength`, so it composes with `vol_target`
sizing in the backtester.

NOTE: this is a single-name *technical* composite (long-only, the engine
backtests each symbol independently). It is NOT a market-neutral cross-sectional
long/short book, and it does not include fundamental value/quality factors —
those require point-in-time fundamentals and a portfolio-level engine.
"""
import math
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class MultiFactorStrategy(BaseStrategy):
    name = "multi_factor"
    description = "Composite of momentum + trend + low-volatility factors (price-based)"
    required_bars = 130
    default_params = {
        "mom_period": 60,
        "trend_ma": 100,
        "vol_window": 20,
        "vol_lookback": 100,
        "w_momentum": 0.4,
        "w_trend": 0.3,
        "w_lowvol": 0.3,
        "buy_threshold": 0.25,
        "sell_threshold": -0.05,
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        p = self.params
        mom_n, ma_n, vw, vl = int(p["mom_period"]), int(p["trend_ma"]), int(p["vol_window"]), int(p["vol_lookback"])

        df = df.copy()
        close = df["close"]
        roc = close / close.shift(mom_n) - 1.0
        ma = close.rolling(ma_n).mean()
        rv = close.pct_change().rolling(vw).std() * math.sqrt(252)
        rv_med = rv.rolling(vl).median()

        if any(pd.isna(s.iloc[-1]) or pd.isna(s.iloc[-2]) for s in (roc, ma, rv, rv_med)):
            return None

        def composite(i):
            mom_s = math.tanh(float(roc.iloc[i]) * 4)
            trend_s = math.tanh(((float(close.iloc[i]) - float(ma.iloc[i])) / float(ma.iloc[i])) * 10)
            rvm = float(rv_med.iloc[i])
            vol_s = math.tanh((rvm - float(rv.iloc[i])) / rvm) if rvm else 0.0
            return p["w_momentum"] * mom_s + p["w_trend"] * trend_s + p["w_lowvol"] * vol_s

        now, was = composite(-1), composite(-2)
        curr = df.iloc[-1]
        if float(curr["volume"]) < p["min_volume"]:
            return None

        price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        strength = max(0.1, min(1.0, (now + 1) / 2))
        indicators = {
            "composite": round(now, 4),
            "roc": round(float(roc.iloc[-1]), 4),
            "trend_pct": round((float(close.iloc[-1]) - float(ma.iloc[-1])) / float(ma.iloc[-1]) * 100, 2),
            "realized_vol": round(float(rv.iloc[-1]), 4),
        }

        if now > p["buy_threshold"] and was <= p["buy_threshold"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=strength,
                price=price, reason=f"Composite factor score {now:+.2f} turned bullish",
                indicators=indicators,
            )
        if now < p["sell_threshold"] and was >= p["sell_threshold"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.7,
                price=price, reason=f"Composite factor score {now:+.2f} turned bearish",
                indicators=indicators,
            )
        return None
