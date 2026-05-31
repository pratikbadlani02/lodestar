"""
Cross-sectional (portfolio-level) strategies.

These overcome the core limitation of the per-symbol BacktestEngine: a normal
strategy only ever sees ONE symbol's bars via generate_signal(), so it cannot
*rank* names against each other. Sector rotation, cross-sectional momentum, and
factor long-only books all require seeing the whole basket at once.

A CrossSectionalStrategy instead implements `target_weights(data)`, where
`data` is {symbol: DataFrame-up-to-now}, and returns target portfolio weights
{symbol: weight} (summing to ≤ 1; the remainder is cash). It is driven by the
PortfolioBacktestEngine, not the per-symbol engine.
"""
from abc import ABC, abstractmethod
from statistics import mean, pstdev
from typing import Any

import pandas as pd


class CrossSectionalStrategy(ABC):
    name: str = "base_xs"
    description: str = ""
    required_bars: int = 70
    default_params: dict[str, Any] = {}
    is_portfolio: bool = True

    def __init__(self, params: dict[str, Any] | None = None):
        self.params = {**self.default_params, **(params or {})}

    @abstractmethod
    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        """Return {symbol: weight} (sum ≤ 1). Empty dict = go fully to cash."""
        ...


class XSMomentumStrategy(CrossSectionalStrategy):
    """Cross-sectional momentum / rotation — the *real* sector rotation.

    Ranks the basket by lookback return and holds the top-N (only those with
    momentum above a threshold), equal-weighted, rebalancing every
    `rebalance_days`. Use sector ETFs for sector rotation, or any basket for
    cross-sectional equity momentum.
    """
    name = "xs_momentum"
    description = "Cross-sectional momentum rotation — hold top-N names by lookback return"
    required_bars = 70
    default_params = {
        "lookback": 63,            # ~3 months
        "top_n": 3,
        "rebalance_days": 21,      # ~monthly
        "momentum_threshold": 0.0,  # only hold names with return above this
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        lb = int(self.params["lookback"])
        topn = int(self.params["top_n"])
        thr = float(self.params["momentum_threshold"])
        scores: dict[str, float] = {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < lb + 1:
                continue
            base = float(c.iloc[-lb - 1])
            if base > 0:
                scores[s] = float(c.iloc[-1]) / base - 1.0
        elig = [s for s, v in scores.items() if v > thr]
        ranked = sorted(elig, key=lambda s: scores[s], reverse=True)[:topn]
        if not ranked:
            return {}
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


class XSMultiFactorStrategy(CrossSectionalStrategy):
    """Cross-sectional multi-factor book — rank by a momentum + low-volatility
    composite (z-scored across the basket), hold the top-N positive-momentum
    names equal-weighted. A price-based factor sleeve (no fundamentals)."""
    name = "xs_multifactor"
    description = "Cross-sectional factor rank (momentum + low-vol), hold top-N"
    required_bars = 80
    default_params = {
        "lookback": 63,
        "vol_window": 20,
        "top_n": 3,
        "rebalance_days": 21,
        "w_momentum": 0.6,
        "w_lowvol": 0.4,
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        lb = int(self.params["lookback"])
        vw = int(self.params["vol_window"])
        topn = int(self.params["top_n"])
        wm, wv = float(self.params["w_momentum"]), float(self.params["w_lowvol"])

        mom: dict[str, float] = {}
        vol: dict[str, float] = {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < max(lb, vw) + 1:
                continue
            base = float(c.iloc[-lb - 1])
            if base <= 0:
                continue
            mom[s] = float(c.iloc[-1]) / base - 1.0
            vol[s] = float(c.pct_change().iloc[-vw:].std())

        common = [s for s in mom if s in vol]
        if len(common) < 2:
            return {}

        def zscore(d: dict[str, float]) -> dict[str, float]:
            vals = [d[s] for s in common]
            m = mean(vals)
            sd = pstdev(vals) or 1.0
            return {s: (d[s] - m) / sd for s in common}

        zm, zv = zscore(mom), zscore(vol)
        # Higher momentum good, lower vol good (so subtract the vol z-score).
        score = {s: wm * zm[s] - wv * zv[s] for s in common}
        ranked = sorted(common, key=lambda s: score[s], reverse=True)[:topn]
        ranked = [s for s in ranked if mom[s] > 0]  # absolute-momentum guard
        if not ranked:
            return {}
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


CROSS_SECTIONAL_REGISTRY: dict[str, type[CrossSectionalStrategy]] = {
    XSMomentumStrategy.name:    XSMomentumStrategy,
    XSMultiFactorStrategy.name: XSMultiFactorStrategy,
}


def get_xs_strategy(strategy_type: str, params: dict | None = None) -> CrossSectionalStrategy:
    return CROSS_SECTIONAL_REGISTRY[strategy_type](params=params)


def list_xs_strategies() -> list[dict]:
    return [
        {
            "name": c.name,
            "description": c.description,
            "required_bars": c.required_bars,
            "default_params": c.default_params,
            "portfolio": True,
        }
        for c in CROSS_SECTIONAL_REGISTRY.values()
    ]
