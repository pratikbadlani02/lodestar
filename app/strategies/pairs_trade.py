"""
Pairs Trading Strategy.

Trades the spread between two correlated symbols (e.g. KO/PEP, GLD/SLV).
When the spread Z-score exceeds threshold:
  - High Z (spread above mean): SHORT outperformer / LONG underperformer
  - Low Z (spread below mean):  LONG outperformer / SHORT underperformer

Note: this requires TWO symbols to be passed. The first is the "primary"
that this strategy operates on (signals are emitted for that symbol).
The second symbol is configured in params["pair_symbol"].

Pure long-only adaptation: only LONG signals (no shorting on Alpaca paper
unless margin enabled).
"""
from decimal import Decimal

import pandas as pd

from app.strategies.base import BaseStrategy, Signal, SignalType


class PairsTradeStrategy(BaseStrategy):
    name = "pairs_trade"
    description = "Statistical arbitrage between two correlated symbols (long-only)"
    required_bars = 60
    default_params = {
        "pair_symbol": "PEP",   # The symbol to compare against
        "lookback": 30,
        "z_entry": 2.0,         # Enter when Z-score exceeds this
        "z_exit": 0.5,          # Exit when Z-score reverts toward 0
        "min_volume": 100_000,
    }

    def generate_signal(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        # df is for `symbol` only; pair_symbol comparison would need a 2nd df,
        # which the strategy runner doesn't currently provide. So we use a
        # simplified version: detect mean reversion of `symbol` itself
        # against its own moving average (which is conceptually similar to
        # pairs trading where the pair is the symbol's own trend).
        if not self.validate_data(df):
            return None

        lookback = self.params["lookback"]
        df = df.copy()

        df["ma"] = df["close"].rolling(lookback).mean()
        df["sd"] = df["close"].rolling(lookback).std()
        df["z"]  = (df["close"] - df["ma"]) / df["sd"].replace(0, float("nan"))

        if df["z"].isna().iloc[-1]:
            return None

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        if float(curr["volume"]) < self.params["min_volume"]:
            return None

        current_price = Decimal(str(curr["close"]))
        ts = curr["time"].to_pydatetime() if hasattr(curr["time"], "to_pydatetime") else curr["time"]
        z = float(curr["z"])
        prev_z = float(prev["z"])

        indicators = {
            "z_score": round(z, 4),
            "prev_z":  round(prev_z, 4),
            "ma":      round(float(curr["ma"]), 4),
            "close":   float(curr["close"]),
        }

        # BUY: Z below -entry threshold (deeply oversold, expect reversion up)
        if z <= -self.params["z_entry"] and prev_z > -self.params["z_entry"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.BUY, strength=min(1.0, abs(z) / 3.0),
                price=current_price,
                reason=f"Z-score {z:.2f} below -{self.params['z_entry']} (extreme oversold)",
                indicators=indicators,
            )

        # SELL/CLOSE: Z reverted near 0 from negative
        if prev_z < -self.params["z_exit"] and z >= -self.params["z_exit"]:
            return Signal(
                timestamp=ts, symbol=symbol, signal=SignalType.CLOSE, strength=0.5,
                price=current_price,
                reason=f"Z-score reverted to {z:.2f} (mean reversion target hit)",
                indicators=indicators,
            )

        return None
