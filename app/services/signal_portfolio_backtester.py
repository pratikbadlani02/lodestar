"""
Shared-capital signal portfolio backtester.

The default per-symbol engine backtests each ticker in an isolated 1/N capital
sleeve (all-in / flat per ticker), so idle cash in one sleeve can't fund a
signal in another and the book can't hold a flexible number of positions.

This engine runs a regular per-symbol strategy over a basket on a SHARED cash
pool: each ticker's BUY/SELL signal acts on the common pool, so buying one name
never requires selling another — a BUY just draws from available cash, a SELL
frees cash back for the next signal. Capital is reused to keep more of it
working (maximize utilization), holding up to `max_positions` names at once.

Sizing: each new position targets equity / max_positions dollars, capped by
available cash. Round trips are real (P/L = (exit−entry)×qty) and reconcile.
"""
import math
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.core.models import OrderSide
from app.strategies.base import Signal, SignalType
from app.strategies.registry import get_strategy

logger = get_logger(__name__)


class SignalPortfolioEngine:
    def __init__(self, strategy_type, params, initial_capital, commission_per_trade=0.0, slippage_bps=2.0):
        self.strategy = get_strategy(strategy_type, params)
        self.params = params or {}
        self.initial_capital = float(initial_capital)
        self.commission = commission_per_trade
        self.slippage = slippage_bps / 10_000.0
        self.required_bars = self.strategy.required_bars

    def run(self, data: dict[str, pd.DataFrame]) -> dict[str, Any]:
        symbols = list(data.keys())
        # Align all symbols to a common trading calendar (intersection of dates).
        per = {}
        for s, df in data.items():
            d = df.copy()
            d["time"] = pd.to_datetime(d["time"])
            per[s] = d.sort_values("time").drop_duplicates("time").set_index("time")
        common = None
        for s in symbols:
            idx = per[s].index
            common = idx if common is None else common.intersection(idx)
        common = common.sort_values()
        if common is None or len(common) < self.required_bars + 2:
            raise ValueError("Not enough aligned data across symbols")

        closes = pd.DataFrame({s: per[s]["close"].reindex(common) for s in symbols})
        opens = pd.DataFrame({s: per[s]["open"].reindex(common) for s in symbols})
        # Full OHLCV windows per symbol (for indicator calc inside generate_signal).
        aligned = {s: per[s].reindex(common).reset_index() for s in symbols}
        for s in symbols:
            aligned[s].rename(columns={"index": "time"}, inplace=True)
            if "time" not in aligned[s].columns:
                aligned[s].insert(0, "time", common)

        times = list(common)
        n = len(times)
        max_pos = max(1, int(self.params.get("max_positions", len(symbols))))

        cash = self.initial_capital
        pos = {s: 0.0 for s in symbols}
        entry_px = {s: 0.0 for s in symbols}
        entry_t = {s: None for s in symbols}
        trades, equity_curve = [], []

        def close_trade(s, exit_price, exit_time, reason):
            qty = pos[s]
            pnl = (exit_price - entry_px[s]) * qty - 2 * self.commission
            trades.append({
                "symbol": s, "side": OrderSide.BUY.value,
                "entry_time": entry_t[s].to_pydatetime() if hasattr(entry_t[s], "to_pydatetime") else entry_t[s],
                "exit_time": exit_time.to_pydatetime() if hasattr(exit_time, "to_pydatetime") else exit_time,
                "entry_price": Decimal(str(round(entry_px[s], 4))),
                "exit_price": Decimal(str(round(exit_price, 4))),
                "qty": Decimal(str(round(qty, 8))),
                "pnl": Decimal(str(round(pnl, 2))),
                "pnl_pct": Decimal(str(round((exit_price / entry_px[s] - 1.0) * 100, 4))) if entry_px[s] else Decimal("0"),
                "reason": reason,
            })

        for i in range(self.required_bars, n - 1):
            nt = times[i + 1]
            # 1) Process SELL/CLOSE signals first → frees cash for new buys.
            for s in symbols:
                if pos[s] <= 0:
                    continue
                try:
                    sig = self.strategy.generate_signal(s, aligned[s].iloc[: i + 1])
                except Exception as e:
                    logger.error("sigport_error", symbol=s, error=str(e)); sig = None
                if sig is not None and sig.signal in (SignalType.SELL, SignalType.CLOSE):
                    px = float(opens[s].iloc[i + 1])
                    if np.isfinite(px) and px > 0:
                        cash += pos[s] * px * (1 - self.slippage) - self.commission
                        close_trade(s, px * (1 - self.slippage), nt, sig.reason)
                        pos[s] = 0.0; entry_px[s] = 0.0; entry_t[s] = None
            # 2) Process BUY signals → draw from shared cash (no forced selling).
            held = sum(1 for s in symbols if pos[s] > 0)
            for s in symbols:
                if pos[s] > 0 or held >= max_pos or cash <= 1:
                    continue
                try:
                    sig = self.strategy.generate_signal(s, aligned[s].iloc[: i + 1])
                except Exception:
                    sig = None
                if sig is not None and sig.signal == SignalType.BUY:
                    px = float(opens[s].iloc[i + 1])
                    if not (np.isfinite(px) and px > 0):
                        continue
                    equity = cash + sum(pos[k] * float(closes[k].iloc[i]) for k in symbols)
                    budget = min(equity / max_pos, cash * 0.99)
                    fill = px * (1 + self.slippage)
                    qty = math.floor(budget / fill)
                    if qty > 0:
                        cash -= qty * fill + self.commission
                        pos[s] = qty; entry_px[s] = fill; entry_t[s] = nt
                        held += 1

            eq = cash + sum(pos[s] * float(closes[s].iloc[i + 1]) for s in symbols)
            equity_curve.append({"t": nt.isoformat(), "equity": round(eq, 2)})

        # Liquidate remaining at the final bar.
        last_t = times[-1]
        for s in symbols:
            if pos[s] > 0:
                px = float(closes[s].iloc[-1])
                cash += pos[s] * px - self.commission
                close_trade(s, px, last_t, "backtest_end_liquidation")
                pos[s] = 0.0

        total_return_pct = (cash / self.initial_capital - 1.0) * 100
        sharpe = max_dd = 0.0
        if equity_curve:
            eqs = np.array([e["equity"] for e in equity_curve], float)
            rets = np.diff(eqs) / eqs[:-1]; rets = rets[np.isfinite(rets)]
            if len(rets) > 1 and rets.std() > 0:
                sharpe = (rets.mean() / rets.std()) * math.sqrt(252)
            peak = np.maximum.accumulate(eqs)
            max_dd = abs(((eqs - peak) / peak).min()) * 100 if len(eqs) else 0.0
        winners = [t for t in trades if t["pnl"] and t["pnl"] > 0]
        return {
            "final_equity": Decimal(str(round(cash, 2))),
            "total_return_pct": Decimal(str(round(total_return_pct, 4))),
            "sharpe_ratio": Decimal(str(round(sharpe, 4))),
            "max_drawdown_pct": Decimal(str(round(max_dd, 4))),
            "win_rate_pct": Decimal(str(round((len(winners) / len(trades) * 100) if trades else 0.0, 4))),
            "total_trades": len(trades),
            "trades": trades,
            "equity_curve": equity_curve,
        }
