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
    long_short: bool = False   # may return negative (short) weights

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


class XSLongShortStrategy(CrossSectionalStrategy):
    """Market-neutral momentum: long the top-N by momentum, short the bottom-N,
    dollar-neutral (longs and shorts each get half the gross budget). Isolates
    the cross-sectional spread between winners and losers, hedging market beta."""
    name = "xs_long_short"
    description = "Market-neutral momentum — long top-N, short bottom-N (dollar-neutral)"
    required_bars = 70
    long_short = True
    default_params = {
        "lookback": 63,
        "top_n": 2,             # per side
        "rebalance_days": 21,
        "gross": 1.0,           # total gross exposure (0.5 long + 0.5 short)
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        lb = int(self.params["lookback"])
        topn = int(self.params["top_n"])
        gross = float(self.params["gross"])
        scores: dict[str, float] = {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < lb + 1:
                continue
            base = float(c.iloc[-lb - 1])
            if base > 0:
                scores[s] = float(c.iloc[-1]) / base - 1.0
        if len(scores) < 2 * topn:
            return {}
        ranked = sorted(scores, key=lambda s: scores[s], reverse=True)
        longs, shorts = ranked[:topn], ranked[-topn:]
        wl = (gross / 2) / topn
        ws = -(gross / 2) / topn
        weights = {s: wl for s in longs}
        weights.update({s: ws for s in shorts})
        return weights


class RiskParityStrategy(CrossSectionalStrategy):
    """Inverse-volatility risk parity — weight each name by 1/volatility so every
    holding contributes roughly equal risk (the All-Weather sizing principle).
    Optional trend filter (skip downtrending names) and portfolio vol target
    (scale total exposure down, holding cash, when basket vol runs hot)."""
    name = "risk_parity"
    description = "Inverse-vol risk parity sizing across the basket (optional vol target)"
    required_bars = 110
    default_params = {
        "vol_window": 20,
        "rebalance_days": 21,
        "trend_filter": True,
        "trend_ma": 100,
        "vol_target": 0.0,   # annualized % portfolio target; 0 = no scaling
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        import math
        vw = int(self.params["vol_window"])
        use_trend = bool(self.params["trend_filter"])
        ma_n = int(self.params["trend_ma"])
        vt = float(self.params["vol_target"])

        inv, vol = {}, {}
        for s, df in data.items():
            c = df["close"]
            need = max(vw, ma_n if use_trend else 0) + 1
            if len(c) < need:
                continue
            v = float(c.pct_change().iloc[-vw:].std()) * math.sqrt(252)
            if v <= 0:
                continue
            if use_trend and float(c.iloc[-1]) < float(c.rolling(ma_n).mean().iloc[-1]):
                continue  # don't allocate to downtrending names
            vol[s] = v
            inv[s] = 1.0 / v
        if not inv:
            return {}
        tot = sum(inv.values())
        w = {s: inv[s] / tot for s in inv}
        if vt > 0:  # scale exposure to hit a portfolio vol target (lever down only)
            port_vol = sum(w[s] * vol[s] for s in w)  # ignores correlation (conservative)
            scale = min(1.0, (vt / 100.0) / port_vol) if port_vol > 0 else 1.0
            w = {s: wi * scale for s, wi in w.items()}
        return w


class XSSharpeMomentumStrategy(CrossSectionalStrategy):
    """Risk-adjusted (Sharpe) momentum — rank by lookback return divided by
    lookback volatility, holding the top-N. Favors names rising *smoothly*,
    which historically improves both return and stability vs raw momentum."""
    name = "xs_sharpe_momentum"
    description = "Cross-sectional risk-adjusted momentum (return/vol), hold top-N"
    required_bars = 80
    default_params = {"lookback": 63, "top_n": 3, "rebalance_days": 21}

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        import math
        lb = int(self.params["lookback"]); topn = int(self.params["top_n"])
        score = {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < lb + 1:
                continue
            base = float(c.iloc[-lb - 1])
            if base <= 0:
                continue
            mom = float(c.iloc[-1]) / base - 1.0
            vol = float(c.pct_change().iloc[-lb:].std()) * math.sqrt(252)
            if vol > 0 and mom > 0:           # only positive, risk-adjusted
                score[s] = mom / vol
        ranked = sorted(score, key=lambda s: score[s], reverse=True)[:topn]
        if not ranked:
            return {}
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


class XSAccelMomentumStrategy(CrossSectionalStrategy):
    """Acceleration momentum — rank by the *change* in momentum (recent window
    return minus the prior window return), holding names whose momentum is
    accelerating. Catches emerging leaders earlier than level momentum."""
    name = "xs_accel"
    description = "Cross-sectional acceleration (momentum-of-momentum), hold top-N"
    required_bars = 70
    default_params = {"window": 21, "top_n": 3, "rebalance_days": 21}

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        w_ = int(self.params["window"]); topn = int(self.params["top_n"])
        score = {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < 2 * w_ + 1:
                continue
            now = float(c.iloc[-1]); mid = float(c.iloc[-w_ - 1]); old = float(c.iloc[-2 * w_ - 1])
            if mid <= 0 or old <= 0:
                continue
            recent = now / mid - 1.0
            prior = mid / old - 1.0
            accel = recent - prior
            if recent > 0 and accel > 0:      # rising and accelerating
                score[s] = accel
        ranked = sorted(score, key=lambda s: score[s], reverse=True)[:topn]
        if not ranked:
            return {}
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


class XSRegimeMomentumStrategy(CrossSectionalStrategy):
    """Regime-gated cross-sectional momentum — hold top-N momentum names only
    while the market (SPY) is above its long moving average; step fully to cash
    in risk-off regimes. Aims to keep momentum's upside while cutting bear-market
    drawdowns."""
    name = "xs_regime_momentum"
    description = "Momentum top-N, but cash when SPY is below its long MA (regime filter)"
    required_bars = 110
    default_params = {"lookback": 63, "top_n": 2, "rebalance_days": 21, "market": "SPY", "regime_ma": 100}

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        mkt = self.params["market"]; rm = int(self.params["regime_ma"])
        if mkt in data:
            c = data[mkt]["close"]
            if len(c) >= rm and float(c.iloc[-1]) < float(c.rolling(rm).mean().iloc[-1]):
                return {}  # risk-off → all cash
        lb = int(self.params["lookback"]); topn = int(self.params["top_n"])
        score = {}
        for s, df in data.items():
            cc = df["close"]
            if len(cc) < lb + 1:
                continue
            base = float(cc.iloc[-lb - 1])
            if base > 0:
                r = float(cc.iloc[-1]) / base - 1.0
                if r > 0:
                    score[s] = r
        ranked = sorted(score, key=lambda s: score[s], reverse=True)[:topn]
        if not ranked:
            return {}
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


class XSAccelSharpeStrategy(CrossSectionalStrategy):
    """Blend of acceleration and risk-adjusted momentum — z-score each across the
    basket, sum, and hold the top-N positive-momentum names. Combines the two
    signals that each held up out-of-sample."""
    name = "xs_accel_sharpe"
    description = "Cross-sectional blend of acceleration + risk-adjusted momentum"
    required_bars = 90
    default_params = {"lookback": 63, "accel_window": 21, "top_n": 2, "rebalance_days": 21}

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        import math
        from statistics import mean, pstdev
        lb = int(self.params["lookback"]); aw = int(self.params["accel_window"]); topn = int(self.params["top_n"])
        sharpe, accel, mom = {}, {}, {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < max(lb, 2 * aw) + 1:
                continue
            base = float(c.iloc[-lb - 1])
            if base <= 0:
                continue
            m = float(c.iloc[-1]) / base - 1.0
            v = float(c.pct_change().iloc[-lb:].std()) * math.sqrt(252)
            now = float(c.iloc[-1]); mid = float(c.iloc[-aw - 1]); old = float(c.iloc[-2 * aw - 1])
            if v <= 0 or mid <= 0 or old <= 0:
                continue
            mom[s] = m
            sharpe[s] = m / v
            accel[s] = (now / mid - 1.0) - (mid / old - 1.0)
        common = [s for s in sharpe if s in accel and mom[s] > 0]
        if len(common) < 2:
            return {}
        def z(d):
            vals = [d[s] for s in common]; mu = mean(vals); sd = pstdev(vals) or 1.0
            return {s: (d[s] - mu) / sd for s in common}
        zs, za = z(sharpe), z(accel)
        score = {s: zs[s] + za[s] for s in common}
        ranked = sorted(common, key=lambda s: score[s], reverse=True)[:topn]
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


class XSVolManagedStrategy(CrossSectionalStrategy):
    """Volatility-managed momentum (Barroso & Santa-Clara). Rank by the chosen
    signal — acceleration or level momentum — hold top-N, then scale TOTAL
    exposure so the portfolio targets a constant volatility: full when calm,
    partly cash when volatile. Historically improves momentum's return and
    Sharpe by sidestepping high-vol 'momentum crashes'."""
    name = "xs_volmanaged"
    description = "Volatility-managed momentum/acceleration (target-vol exposure, top-N)"
    required_bars = 90
    default_params = {
        "lookback": 63, "accel_window": 21, "top_n": 3, "rebalance_days": 21,
        "target_vol": 20.0, "signal": "accel",  # "accel" | "momentum"
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        import math
        lb = int(self.params["lookback"]); aw = int(self.params["accel_window"])
        topn = int(self.params["top_n"]); tv = float(self.params["target_vol"])
        sig = str(self.params["signal"])
        score, vol = {}, {}
        for s, df in data.items():
            c = df["close"]
            need = max(lb, 2 * aw) + 1
            if len(c) < need:
                continue
            base = float(c.iloc[-lb - 1])
            if base <= 0:
                continue
            v = float(c.pct_change().iloc[-lb:].std()) * math.sqrt(252)
            if v <= 0:
                continue
            vol[s] = v
            if sig == "momentum":
                m = float(c.iloc[-1]) / base - 1.0
                if m > 0:
                    score[s] = m
            else:  # acceleration
                now = float(c.iloc[-1]); mid = float(c.iloc[-aw - 1]); old = float(c.iloc[-2 * aw - 1])
                if mid > 0 and old > 0:
                    recent = now / mid - 1.0; prior = mid / old - 1.0
                    if recent > 0 and (recent - prior) > 0:
                        score[s] = recent - prior
        ranked = sorted(score, key=lambda s: score[s], reverse=True)[:topn]
        if not ranked:
            return {}
        base_w = 1.0 / len(ranked)
        # Conservative portfolio vol estimate (weighted avg ≈ high correlation).
        port_vol = sum(base_w * vol[s] for s in ranked)
        scale = min(1.0, (tv / 100.0) / port_vol) if port_vol > 0 else 1.0
        return {s: base_w * scale for s in ranked}


class XSAdaptiveAccelStrategy(CrossSectionalStrategy):
    """All-weather acceleration — run the (bull-winning) acceleration signal at
    full exposure when the market (SPY) is in an uptrend, and dial exposure down
    (to cash or a reduced fraction) when SPY is below its long MA. Combines the
    bull-regime profit champion with bear-market protection."""
    name = "xs_adaptive_accel"
    description = "Regime-adaptive acceleration — full in risk-on, defensive in risk-off"
    required_bars = 110
    default_params = {
        "accel_window": 21, "top_n": 1, "rebalance_days": 21,
        "market": "SPY", "regime_ma": 100, "risk_off_scale": 0.0,
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        mkt = self.params["market"]; rm = int(self.params["regime_ma"])
        aw = int(self.params["accel_window"]); topn = int(self.params["top_n"])
        off_scale = float(self.params["risk_off_scale"])
        risk_on = True
        if mkt in data:
            c = data[mkt]["close"]
            if len(c) >= rm and float(c.iloc[-1]) < float(c.rolling(rm).mean().iloc[-1]):
                risk_on = False
        if not risk_on and off_scale <= 0:
            return {}  # risk-off → cash
        score = {}
        for s, df in data.items():
            c = df["close"]
            if len(c) < 2 * aw + 1:
                continue
            now = float(c.iloc[-1]); mid = float(c.iloc[-aw - 1]); old = float(c.iloc[-2 * aw - 1])
            if mid <= 0 or old <= 0:
                continue
            recent = now / mid - 1.0; prior = mid / old - 1.0
            if recent > 0 and (recent - prior) > 0:
                score[s] = recent - prior
        ranked = sorted(score, key=lambda s: score[s], reverse=True)[:topn]
        if not ranked:
            return {}
        w = (1.0 / len(ranked)) * (1.0 if risk_on else off_scale)
        return {s: w for s in ranked}


class XSAdaptiveDefensiveStrategy(CrossSectionalStrategy):
    """Acceleration in risk-on; rotate to a DEFENSIVE asset (bonds/gold/T-bills)
    in risk-off instead of cash — earning a return on the sidelines. The
    defensive_symbol must be included in the backtest's symbol list."""
    name = "xs_adaptive_defensive"
    description = "Accel in risk-on, rotate to a defensive asset (TLT/GLD/BIL) in risk-off"
    required_bars = 110
    default_params = {
        "accel_window": 21, "top_n": 1, "rebalance_days": 21,
        "market": "SPY", "regime_ma": 100, "defensive_symbol": "BIL",
    }

    def target_weights(self, data: dict[str, pd.DataFrame]) -> dict[str, float]:
        mkt = self.params["market"]; rm = int(self.params["regime_ma"])
        aw = int(self.params["accel_window"]); topn = int(self.params["top_n"])
        defsym = self.params["defensive_symbol"]
        risk_on = True
        if mkt in data:
            c = data[mkt]["close"]
            if len(c) >= rm and float(c.iloc[-1]) < float(c.rolling(rm).mean().iloc[-1]):
                risk_on = False
        if not risk_on:
            return {defsym: 1.0} if defsym in data else {}
        score = {}
        for s, df in data.items():
            if s == defsym:
                continue
            c = df["close"]
            if len(c) < 2 * aw + 1:
                continue
            now = float(c.iloc[-1]); mid = float(c.iloc[-aw - 1]); old = float(c.iloc[-2 * aw - 1])
            if mid <= 0 or old <= 0:
                continue
            recent = now / mid - 1.0; prior = mid / old - 1.0
            if recent > 0 and (recent - prior) > 0:
                score[s] = recent - prior
        ranked = sorted(score, key=lambda s: score[s], reverse=True)[:topn]
        if not ranked:
            return {}
        w = 1.0 / len(ranked)
        return {s: w for s in ranked}


CROSS_SECTIONAL_REGISTRY: dict[str, type[CrossSectionalStrategy]] = {
    XSMomentumStrategy.name:        XSMomentumStrategy,
    XSMultiFactorStrategy.name:     XSMultiFactorStrategy,
    XSLongShortStrategy.name:       XSLongShortStrategy,
    RiskParityStrategy.name:        RiskParityStrategy,
    XSSharpeMomentumStrategy.name:  XSSharpeMomentumStrategy,
    XSAccelMomentumStrategy.name:   XSAccelMomentumStrategy,
    XSRegimeMomentumStrategy.name:  XSRegimeMomentumStrategy,
    XSAccelSharpeStrategy.name:     XSAccelSharpeStrategy,
    XSVolManagedStrategy.name:      XSVolManagedStrategy,
    XSAdaptiveAccelStrategy.name:   XSAdaptiveAccelStrategy,
    XSAdaptiveDefensiveStrategy.name: XSAdaptiveDefensiveStrategy,
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
            "long_short": c.long_short,
        }
        for c in CROSS_SECTIONAL_REGISTRY.values()
    ]
