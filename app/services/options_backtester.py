"""
Options / volatility backtest engine.

The platform pulls a live options chain but has no *historical* options data, so
this engine prices options with Black–Scholes off the underlying's price path
and a volatility input (trailing realized vol, or a fixed `iv` param). It then
simulates systematic monthly option overlays and marks them to model daily.

Strategies (single underlying = symbols[0]):
  • covered_call      — long 100 sh + short OTM call (income / capped upside)
  • cash_secured_put  — short OTM put, cash-collateralized (premium harvest)
  • short_straddle    — short ATM call + put (pure short-vol)

NOTE: prices are *modeled* (Black–Scholes), not historical market quotes, so
results approximate the vol-risk-premium, not exact fills.
"""
import math
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

from app.core.models import OrderSide

OPTIONS_REGISTRY: dict[str, dict[str, Any]] = {
    "covered_call":     {"dte": 30, "otm_pct": 0.05, "iv": 0.0, "risk_free": 0.04, "cycle_days": 21},
    "cash_secured_put": {"dte": 30, "otm_pct": 0.05, "iv": 0.0, "risk_free": 0.04, "cycle_days": 21},
    "short_straddle":   {"dte": 30, "otm_pct": 0.0,  "iv": 0.0, "risk_free": 0.04, "cycle_days": 21},
}
_DESC = {
    "covered_call": "Covered call — long stock + short OTM call (BS-priced)",
    "cash_secured_put": "Cash-secured put — short OTM put, BS-priced premium harvest",
    "short_straddle": "Short straddle — short ATM call+put (short volatility)",
}


def list_options_strategies() -> list[dict]:
    return [
        {"name": k, "description": _DESC[k], "required_bars": 60, "default_params": v, "options": True}
        for k, v in OPTIONS_REGISTRY.items()
    ]


def _ncdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_price(S: float, K: float, T: float, r: float, sigma: float, call: bool) -> float:
    if T <= 0 or sigma <= 0 or S <= 0:
        return max(0.0, (S - K) if call else (K - S))
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    if call:
        return S * _ncdf(d1) - K * math.exp(-r * T) * _ncdf(d2)
    return K * math.exp(-r * T) * _ncdf(-d2) - S * _ncdf(-d1)


class OptionsBacktestEngine:
    def __init__(self, strategy_type, params, initial_capital, commission_per_trade=0.0, slippage_bps=0.0):
        self.stype = strategy_type
        self.params = {**OPTIONS_REGISTRY[strategy_type], **(params or {})}
        self.initial_capital = float(initial_capital)
        self.required_bars = 60

    def run(self, symbol: str, df: pd.DataFrame) -> dict[str, Any]:
        df = df.copy().reset_index(drop=True)
        close = df["close"].astype(float)
        times = pd.to_datetime(df["time"])
        n = len(df)
        if n < self.required_bars + 5:
            raise ValueError(f"Not enough data: {n} bars")

        r = float(self.params["risk_free"])
        otm = float(self.params["otm_pct"])
        cycle = max(5, int(self.params["cycle_days"]))
        dte_years = float(self.params["dte"]) / 365.0
        fixed_iv = float(self.params["iv"])

        # Trailing realized vol (annualized) as the IV proxy unless `iv` is set.
        rvol = close.pct_change().rolling(20).std() * math.sqrt(252)

        cash = self.initial_capital
        # Open structure (or None): dict with keys per leg.
        pos = None
        equity_curve, trades = [], []

        def sigma_at(i):
            if fixed_iv > 0:
                return fixed_iv
            v = float(rvol.iloc[i]) if not pd.isna(rvol.iloc[i]) else 0.25
            return max(0.05, v)

        def option_value(S, leg, T):
            return bs_price(S, leg["K"], T, r, leg["sigma"], leg["call"])

        start = self.required_bars
        for i in range(start, n):
            S = float(close.iloc[i])

            # Settle at expiry.
            if pos is not None and i >= pos["expiry_i"]:
                Sx = S
                payoff = 0.0  # what we owe option holders at expiry (per share)
                for leg in pos["short"]:
                    payoff += max(0.0, (Sx - leg["K"]) if leg["call"] else (leg["K"] - Sx))
                sh = pos["shares"]
                # Close: liquidate stock (if any) + pay option settlement.
                cash += pos["stock"] * Sx          # sell stock leg (0 if none)
                cash -= payoff * sh                # settle shorts
                eq_now = cash
                pnl = eq_now - pos["equity_open"]
                trades.append({
                    "symbol": symbol, "side": OrderSide.SELL.value,
                    "entry_time": pos["t0"].to_pydatetime(), "exit_time": times.iloc[i].to_pydatetime(),
                    "entry_price": Decimal(str(round(pos["S0"], 4))), "exit_price": Decimal(str(round(Sx, 4))),
                    "qty": Decimal(str(sh)), "pnl": Decimal(str(round(pnl, 2))),
                    "pnl_pct": Decimal(str(round(pnl / pos["equity_open"] * 100, 4))) if pos["equity_open"] else Decimal("0"),
                    "reason": pos["label"],
                })
                pos = None

            # Open a new cycle when flat and on cadence.
            if pos is None and (i - start) % cycle == 0 and i + 2 < n:
                sigma = sigma_at(i)
                # expiry bar ≈ dte calendar days out
                expiry_i = min(n - 1, i + int(round(dte_years * 252)))
                T = dte_years
                if self.stype == "covered_call":
                    contracts = max(1, int(self.initial_capital // (S * 100)))
                    sh = contracts * 100
                    K = round(S * (1 + otm), 2)
                    prem = bs_price(S, K, T, r, sigma, True)
                    cash -= sh * S            # buy stock
                    cash += prem * sh         # sell call
                    pos = {"short": [{"K": K, "call": True, "sigma": sigma}], "stock": sh,
                           "shares": sh, "S0": S, "t0": times.iloc[i], "expiry_i": expiry_i,
                           "equity_open": cash + sh * S - bs_price(S, K, T, r, sigma, True) * sh,
                           "label": f"covered call K={K} dte={self.params['dte']}"}
                elif self.stype == "cash_secured_put":
                    K = round(S * (1 - otm), 2)
                    contracts = max(1, int(self.initial_capital // (K * 100)))
                    sh = contracts * 100
                    prem = bs_price(S, K, T, r, sigma, False)
                    cash += prem * sh
                    pos = {"short": [{"K": K, "call": False, "sigma": sigma}], "stock": 0,
                           "shares": sh, "S0": S, "t0": times.iloc[i], "expiry_i": expiry_i,
                           "equity_open": cash - bs_price(S, K, T, r, sigma, False) * sh,
                           "label": f"cash-secured put K={K} dte={self.params['dte']}"}
                else:  # short_straddle
                    K = round(S, 2)
                    contracts = max(1, int(self.initial_capital // (S * 100 * 2)))
                    sh = contracts * 100
                    c_prem = bs_price(S, K, T, r, sigma, True)
                    p_prem = bs_price(S, K, T, r, sigma, False)
                    cash += (c_prem + p_prem) * sh
                    pos = {"short": [{"K": K, "call": True, "sigma": sigma}, {"K": K, "call": False, "sigma": sigma}],
                           "stock": 0, "shares": sh, "S0": S, "t0": times.iloc[i], "expiry_i": expiry_i,
                           "equity_open": cash - (c_prem + p_prem) * sh,
                           "label": f"short straddle K={K} dte={self.params['dte']}"}

            # Daily mark-to-model equity.
            eq = cash
            if pos is not None:
                T_rem = max(0.0, (pos["expiry_i"] - i)) / 252.0
                eq += pos["stock"] * S
                for leg in pos["short"]:
                    eq -= option_value(S, leg, T_rem) * pos["shares"]
            equity_curve.append({"t": times.iloc[i].isoformat(), "equity": round(eq, 2)})

        # Final settle of any open position at last price.
        if pos is not None:
            Sx = float(close.iloc[-1])
            payoff = sum(max(0.0, (Sx - leg["K"]) if leg["call"] else (leg["K"] - Sx)) for leg in pos["short"])
            cash += pos["stock"] * Sx - payoff * pos["shares"]
            pnl = cash - pos["equity_open"]
            trades.append({
                "symbol": symbol, "side": OrderSide.SELL.value,
                "entry_time": pos["t0"].to_pydatetime(), "exit_time": times.iloc[-1].to_pydatetime(),
                "entry_price": Decimal(str(round(pos["S0"], 4))), "exit_price": Decimal(str(round(Sx, 4))),
                "qty": Decimal(str(pos["shares"])), "pnl": Decimal(str(round(pnl, 2))),
                "pnl_pct": Decimal("0"), "reason": pos["label"] + " (final)",
            })

        return _metrics(self.initial_capital, cash, equity_curve, trades)


def _metrics(initial, final_cash, equity_curve, trades):
    total_return_pct = (final_cash / initial - 1.0) * 100
    sharpe = max_dd = 0.0
    if equity_curve:
        eq = np.array([e["equity"] for e in equity_curve], float)
        rets = np.diff(eq) / eq[:-1]
        rets = rets[np.isfinite(rets)]
        if len(rets) > 1 and rets.std() > 0:
            sharpe = (rets.mean() / rets.std()) * math.sqrt(252)
        peak = np.maximum.accumulate(eq)
        max_dd = abs(((eq - peak) / peak).min()) * 100 if len(eq) else 0.0
    winners = [t for t in trades if t["pnl"] and t["pnl"] > 0]
    return {
        "final_equity": Decimal(str(round(final_cash, 2))),
        "total_return_pct": Decimal(str(round(total_return_pct, 4))),
        "sharpe_ratio": Decimal(str(round(sharpe, 4))),
        "max_drawdown_pct": Decimal(str(round(max_dd, 4))),
        "win_rate_pct": Decimal(str(round((len(winners) / len(trades) * 100) if trades else 0.0, 4))),
        "total_trades": len(trades),
        "trades": trades,
        "equity_curve": equity_curve,
    }
