"""
Portfolio (cross-sectional) backtest engine.

Unlike BacktestEngine (one symbol at a time, all-in/flat), this engine sees the
whole basket simultaneously, asks a CrossSectionalStrategy for target weights on
a rebalance cadence, and simulates rotating capital across multiple holdings.

This is what makes *true* sector rotation / cross-sectional factor strategies
possible. Decisions use data through bar i; fills happen at bar i+1's open with
slippage. total_return / sharpe / max_drawdown are computed exactly from the
daily mark-to-market equity curve; `trades` records completed round trips
(emitted on full exits).
"""
import math
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.core.models import OrderSide
from app.strategies.cross_sectional import get_xs_strategy

logger = get_logger(__name__)


class PortfolioBacktestEngine:
    def __init__(
        self,
        strategy_type: str,
        params: dict[str, Any],
        initial_capital: Decimal,
        commission_per_trade: float = 0.0,
        slippage_bps: float = 2.0,
    ):
        self.strategy = get_xs_strategy(strategy_type, params)
        self.params = {**self.strategy.default_params, **(params or {})}
        self.initial_capital = float(initial_capital)
        self.commission = commission_per_trade
        self.slippage = slippage_bps / 10_000.0
        self.rebalance_days = max(1, int(self.params.get("rebalance_days", 21)))
        self.required_bars = self.strategy.required_bars

    def run(self, data: dict[str, pd.DataFrame]) -> dict[str, Any]:
        symbols = list(data.keys())
        # Align every symbol onto a common trading calendar (intersection).
        close_cols, open_cols = {}, {}
        for s, df in data.items():
            d = df.copy()
            d["time"] = pd.to_datetime(d["time"])
            d = d.sort_values("time").drop_duplicates("time").set_index("time")
            close_cols[s], open_cols[s] = d["close"], d["open"]
        closes = pd.DataFrame(close_cols).dropna(how="any")
        opens = pd.DataFrame(open_cols).reindex(closes.index)
        times = list(closes.index)
        n = len(times)
        if n < self.required_bars + 2:
            raise ValueError(f"Not enough aligned data: {n} common bars")

        cash = self.initial_capital
        pos = {s: 0.0 for s in symbols}
        entry_px = {s: 0.0 for s in symbols}
        entry_t = {s: None for s in symbols}
        trades: list[dict[str, Any]] = []
        equity_curve: list[dict[str, Any]] = []
        target: dict[str, float] = {}

        def _close_trade(s, exit_price, exit_time, reason):
            qty = pos[s]
            pnl = (exit_price - entry_px[s]) * qty - 2 * self.commission
            pnl_pct = (exit_price / entry_px[s] - 1.0) * 100 if entry_px[s] else 0.0
            trades.append({
                "symbol": s, "side": OrderSide.BUY.value,
                "entry_time": entry_t[s].to_pydatetime() if hasattr(entry_t[s], "to_pydatetime") else entry_t[s],
                "exit_time": exit_time.to_pydatetime() if hasattr(exit_time, "to_pydatetime") else exit_time,
                "entry_price": Decimal(str(round(entry_px[s], 4))),
                "exit_price": Decimal(str(round(exit_price, 4))),
                "qty": Decimal(str(round(qty, 8))),
                "pnl": Decimal(str(round(pnl, 2))),
                "pnl_pct": Decimal(str(round(pnl_pct, 4))),
                "reason": reason,
            })

        for i in range(self.required_bars, n - 1):
            t, nt = times[i], times[i + 1]

            # Rebalance decision on cadence, using data through bar i.
            if (i - self.required_bars) % self.rebalance_days == 0:
                sub = {s: pd.DataFrame({"close": closes[s].iloc[: i + 1].to_numpy()}) for s in symbols}
                try:
                    target = self.strategy.target_weights(sub)
                except Exception as e:
                    logger.error("xs_rebalance_error", error=str(e), bar=i)
                    target = {}

                equity = cash + sum(pos[s] * float(closes[s].iloc[i]) for s in symbols)
                # 1) Sell / trim everything first to free cash.
                for s in symbols:
                    px = float(opens[s].iloc[i + 1])
                    if not np.isfinite(px) or px <= 0:
                        continue
                    w = target.get(s, 0.0)
                    desired = math.floor((w * equity) / (px * (1 + self.slippage))) if w > 0 else 0
                    if desired < pos[s]:
                        sell_qty = pos[s] - desired
                        cash += sell_qty * px * (1 - self.slippage) - self.commission
                        if desired == 0 and pos[s] > 0:
                            _close_trade(s, px * (1 - self.slippage), nt, f"rotated out (w={w:.2f})")
                            entry_px[s], entry_t[s] = 0.0, None
                        pos[s] = desired
                # 2) Buy / add into the new targets.
                for s in symbols:
                    w = target.get(s, 0.0)
                    if w <= 0:
                        continue
                    px = float(opens[s].iloc[i + 1])
                    if not np.isfinite(px) or px <= 0:
                        continue
                    fill = px * (1 + self.slippage)
                    desired = math.floor((w * equity) / fill)
                    add = desired - pos[s]
                    if add <= 0:
                        continue
                    cost = add * fill + self.commission
                    if cost > cash:  # cap at affordable
                        add = max(0, math.floor((cash - self.commission) / fill))
                        cost = add * fill + self.commission
                    if add <= 0:
                        continue
                    if pos[s] == 0:
                        entry_px[s], entry_t[s] = fill, nt
                    else:
                        entry_px[s] = (entry_px[s] * pos[s] + fill * add) / (pos[s] + add)
                    cash -= cost
                    pos[s] += add

            # Daily mark-to-market at bar i+1 close.
            eq = cash + sum(pos[s] * float(closes[s].iloc[i + 1]) for s in symbols)
            equity_curve.append({"t": nt.isoformat(), "equity": round(eq, 2)})

        # Liquidate at the final bar.
        last_t = times[-1]
        for s in symbols:
            if pos[s] > 0:
                px = float(closes[s].iloc[-1])
                cash += pos[s] * px - self.commission
                _close_trade(s, px, last_t, "backtest_end_liquidation")
                pos[s] = 0.0

        return self._metrics(cash, equity_curve, trades)

    def _metrics(self, final_cash, equity_curve, trades) -> dict[str, Any]:
        final_equity = final_cash
        total_return_pct = (final_equity / self.initial_capital - 1.0) * 100
        sharpe = 0.0
        max_dd_pct = 0.0
        if equity_curve:
            eq = np.array([e["equity"] for e in equity_curve], dtype=float)
            rets = np.diff(eq) / eq[:-1]
            rets = rets[np.isfinite(rets)]
            if len(rets) > 1 and rets.std() > 0:
                sharpe = (rets.mean() / rets.std()) * math.sqrt(252)
            peak = np.maximum.accumulate(eq)
            dd = (eq - peak) / peak
            max_dd_pct = abs(dd.min()) * 100 if len(dd) else 0.0
        winners = [t for t in trades if t["pnl"] and t["pnl"] > 0]
        win_rate_pct = (len(winners) / len(trades) * 100) if trades else 0.0
        return {
            "final_equity": Decimal(str(round(final_equity, 2))),
            "total_return_pct": Decimal(str(round(total_return_pct, 4))),
            "sharpe_ratio": Decimal(str(round(sharpe, 4))),
            "max_drawdown_pct": Decimal(str(round(max_dd_pct, 4))),
            "win_rate_pct": Decimal(str(round(win_rate_pct, 4))),
            "total_trades": len(trades),
            "trades": trades,
            "equity_curve": equity_curve,
        }
