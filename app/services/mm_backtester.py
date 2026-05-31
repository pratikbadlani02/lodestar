"""
Market-making simulation engine (the research form of HFT).

IMPORTANT — what this is and isn't:
  Real high-frequency market making needs a live Level-2 order book, a tick/quote
  feed, and colocation for microsecond execution. None of that comes from a pip
  dependency — it's a data-vendor + infrastructure decision. This platform only
  has daily/minute bars, so true live HFT is out of reach here.

  What this engine DOES, which is exactly how MM strategies are researched
  offline, is simulate an Avellaneda–Stoikov optimal market maker against a
  modeled intraday tick path (GBM seeded by the symbol's realized vol). It quotes
  a bid/ask around a reservation price, captures spread, carries inventory risk,
  and gets filled via a Poisson(λ=A·e^(−kδ)) arrival model — one session per
  trading day across the backtest window.

  Avellaneda & Stoikov (2008), "High-frequency trading in a limit order book."

  Production upgrade path (if you provision the data): a tick vendor (Polygon /
  Databento) + a real LOB backtester (hftbacktest / nautilus_trader).
"""
import math
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

MM_REGISTRY: dict[str, dict[str, Any]] = {
    "market_making": {
        "gamma": 0.01,        # inventory risk aversion
        "k": 1.5,             # order-book liquidity (fill-intensity decay)
        "A": 140.0,           # base arrival intensity
        "steps": 390,         # quote updates per session (~1/min over 6.5h)
        "order_size": 100,    # shares per fill (auto-scaled to capital)
        "max_inventory": 2000,
        "adverse_selection": 0.4,  # fraction of half-spread lost to toxic/informed fills
        "seed": 7,
    },
}


def list_mm_strategies() -> list[dict]:
    return [{
        "name": "market_making",
        "description": "Avellaneda–Stoikov market-making sim (HFT research; modeled order flow)",
        "required_bars": 25, "default_params": MM_REGISTRY["market_making"], "simulated_hft": True,
    }]


class MarketMakingEngine:
    def __init__(self, strategy_type, params, initial_capital, commission_per_trade=0.0, slippage_bps=0.0):
        self.params = {**MM_REGISTRY[strategy_type], **(params or {})}
        self.initial_capital = float(initial_capital)
        self.required_bars = 25

    def _session(self, S0, sigma_daily, rng) -> tuple[float, int]:
        """Simulate one trading session. Returns (pnl_dollars, fills).

        Inventory is bounded to a fraction of capital so a market maker on
        $100k trades sane size (not $50k clips), and the intraday path uses the
        per-step *return* vol (not price vol) so it doesn't explode.
        """
        gamma = float(self.params["gamma"])
        k = float(self.params["k"])
        A = float(self.params["A"])
        steps = int(self.params["steps"])
        adv = float(self.params["adverse_selection"])

        # Size relative to capital: cap inventory notional at ~25% of equity.
        max_inv = max(1.0, math.floor((0.25 * self.initial_capital) / S0))
        size = max(1.0, math.floor(max_inv / 10.0))

        dt = 1.0 / steps
        sig = max(1e-6, S0 * sigma_daily)          # daily price vol (for A-S quotes)
        sig2 = sig * sig
        sret = sigma_daily * math.sqrt(dt)          # per-step RETURN vol (for the path)
        s = S0
        q = 0.0
        cash = 0.0
        fills = 0

        for n in range(steps):
            tau = 1.0 - n * dt                      # time to session close
            r = s - q * gamma * sig2 * tau          # inventory-skewed reservation price
            half = 0.5 * (gamma * sig2 * tau + (2.0 / gamma) * math.log1p(gamma / k))
            half = min(max(half, 0.0001 * s), 0.02 * s)
            bid, ask = r - half, r + half
            db, da = max(0.0, s - bid), max(0.0, ask - s)
            pb = min(0.99, A * math.exp(-k * db) * dt)
            pa = min(0.99, A * math.exp(-k * da) * dt)
            # Adverse-selection: a fraction of fills are informed and pick us off,
            # costing part of the captured half-spread.
            if rng.random() < pb and q < max_inv:   # hit our bid → we buy
                cash -= bid * size + adv * half * size; q += size; fills += 1
            if rng.random() < pa and q > -max_inv:  # lift our ask → we sell
                cash += ask * size - adv * half * size; q -= size; fills += 1
            s *= math.exp(-0.5 * sret * sret + sret * rng.standard_normal())

        cash += q * s                                # flatten inventory at close
        return cash, fills

    def run(self, symbol: str, df: pd.DataFrame) -> dict[str, Any]:
        df = df.copy().reset_index(drop=True)
        times = pd.to_datetime(df["time"])
        close = df["close"].astype(float)
        vol = close.pct_change().rolling(20).std()
        n = len(df)
        if n < self.required_bars + 2:
            raise ValueError(f"Not enough data: {n} bars")

        rng = np.random.default_rng(int(self.params["seed"]))
        equity = self.initial_capital
        equity_curve = []
        day_pnls = []
        total_fills = 0
        # Market making has no directional entry/exit round trips — it's a stream
        # of interleaved fills whose P&L is spread capture. Forcing it into the
        # (entry, exit, qty) trade schema is always misleading, so we don't emit
        # per-session "trades"; the result lives in the equity curve + fill count
        # + session win-rate. `total_trades` here means total fills (executions).
        for i in range(self.required_bars, n):
            sd = float(vol.iloc[i]) if not pd.isna(vol.iloc[i]) else 0.01
            pnl, fills = self._session(float(close.iloc[i - 1]), max(0.002, sd), rng)
            total_fills += fills
            equity += pnl
            day_pnls.append(pnl)
            equity_curve.append({"t": times.iloc[i].isoformat(), "equity": round(equity, 2)})
        trades = []

        total_return_pct = (equity / self.initial_capital - 1.0) * 100
        sharpe = max_dd = 0.0
        eq = np.array([e["equity"] for e in equity_curve], float)
        if len(eq) > 2:
            rets = np.diff(eq) / eq[:-1]; rets = rets[np.isfinite(rets)]
            if len(rets) > 1 and rets.std() > 0:
                sharpe = (rets.mean() / rets.std()) * math.sqrt(252)
            peak = np.maximum.accumulate(eq)
            max_dd = abs(((eq - peak) / peak).min()) * 100
        win_days = sum(1 for p in day_pnls if p > 0)
        return {
            "final_equity": Decimal(str(round(equity, 2))),
            "total_return_pct": Decimal(str(round(total_return_pct, 4))),
            "sharpe_ratio": Decimal(str(round(sharpe, 4))),
            "max_drawdown_pct": Decimal(str(round(max_dd, 4))),
            "win_rate_pct": Decimal(str(round(win_days / len(day_pnls) * 100, 4))) if day_pnls else Decimal("0"),
            "total_trades": total_fills,   # executions (fills), not round trips
            "trades": trades,              # intentionally empty for MM
            "equity_curve": equity_curve,
        }
