"""
Low-Volatility Factor Strategy.

The low-volatility anomaly: calmer assets earn better risk-adjusted returns.
Here, single-name flavor — hold while the asset is in an uptrend AND its
realized volatility sits below its own recent median (a calm advance); step
aside when the trend breaks or volatility regime spikes.

Pairs naturally with `vol_target` position sizing (see the backtester) for a
risk-parity-style allocation across names.

Reference: low-volatility factor (Baker/Haugen); defensive equity.
"""
import math
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class LowVolatilityStrategy(BaseStrategy):
    name = "low_volatility"
    description = "Low-volatility factor: hold calm uptrends, exit on vol spikes"
    required_bars = 130
    default_params = {
        "trend_ma": 100,       # uptrend filter
        "vol_window": 20,      # realized-vol window
        "vol_lookback": 100,   # window for the vol median
        "spike_mult": 1.5,     # exit if vol > median × this
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        if not self.validate_data(df):
            return None

        ma_n = int(self.params["trend_ma"])
        vw = int(self.params["vol_window"])
        vl = int(self.params["vol_lookback"])
        spike = float(self.params["spike_mult"])

        df = df.copy()
        close = df["close"]
        ma = close.rolling(ma_n).mean()
        rv = close.pct_change().rolling(vw).std() * math.sqrt(252)
        rv_med = rv.rolling(vl).median()

        if pd.isna(ma.iloc[-1]) or pd.isna(rv_med.iloc[-1]) or pd.isna(rv.iloc[-2]) or pd.isna(rv_med.iloc[-2]):
            return None

        curr, prev = df.iloc[-1], df.iloc[-2]
        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        def in_regime(i):
            return bool(close.iloc[i] > ma.iloc[i] and rv.iloc[i] < rv_med.iloc[i] * spike)

        now, was = in_regime(-1), in_regime(-2)
        price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        # Calmer than median → stronger conviction (and bigger size under vol_target).
        strength = max(0.1, min(1.0, float(rv_med.iloc[-1] / rv.iloc[-1]))) if rv.iloc[-1] else 0.5
        indicators = {
            "realized_vol": round(float(rv.iloc[-1]), 4),
            "vol_median": round(float(rv_med.iloc[-1]), 4),
            "trend_ma": round(float(ma.iloc[-1]), 4),
            "close": float(curr["close"]),
        }

        if now and not was:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=strength,
                price=price, reason=f"Calm uptrend: vol {rv.iloc[-1]*100:.0f}% < median, price>MA{ma_n}",
                indicators=indicators,
            )
        if was and not now:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.SELL, strength=0.7,
                price=price, reason="Regime broke: downtrend or volatility spike",
                indicators=indicators,
            )
        return None
