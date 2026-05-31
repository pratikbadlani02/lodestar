"""
Event-driven backtest engine — Post-Earnings-Announcement Drift (PEAD).

The well-documented tendency for stocks to keep drifting in the direction of an
earnings surprise for weeks after the report. After a beat above a threshold we
go long for `drift_days`; after a miss we (optionally) go short.

DATA NOTE: the fundamentals feed exposes the fiscal *quarter-end* date and the
EPS surprise, not the exact announcement timestamp — so we approximate the
announcement as quarter-end + `report_lag_days` (large-caps report ~4 weeks
after quarter close). Good enough for the drift window; not tick-accurate.

Merger-arb and other deal-driven events are out of scope (no deal/M&A feed).
"""
import math
from datetime import timedelta
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

from app.core.models import OrderSide

EVENT_REGISTRY: dict[str, dict[str, Any]] = {
    "pead": {
        "surprise_threshold": 0.03,   # |surprise| > 3% to act
        "drift_days": 20,             # holding window (trading days)
        "report_lag_days": 28,        # quarter-end → announcement approximation
        "short_misses": False,        # also short on big misses
    },
}


def list_event_strategies() -> list[dict]:
    return [{
        "name": "pead", "description": "Post-earnings drift — trade the direction of EPS surprises",
        "required_bars": 5, "default_params": EVENT_REGISTRY["pead"], "event": True,
    }]


class EventBacktestEngine:
    def __init__(self, strategy_type, params, initial_capital, commission_per_trade=0.0, slippage_bps=2.0):
        self.params = {**EVENT_REGISTRY[strategy_type], **(params or {})}
        self.initial_capital = float(initial_capital)
        self.slippage = slippage_bps / 10_000.0
        self.required_bars = 5

    def run(self, symbol: str, df: pd.DataFrame, events: list[dict]) -> dict[str, Any]:
        """events: [{quarter: ISO date, surprise_pct: float}] (quarter-end dates)."""
        df = df.copy().reset_index(drop=True)
        df["time"] = pd.to_datetime(df["time"], utc=True)
        times = df["time"]
        close = df["close"].astype(float)
        opens = df["open"].astype(float)
        n = len(df)

        thr = float(self.params["surprise_threshold"])
        drift = int(self.params["drift_days"])
        lag = int(self.params["report_lag_days"])
        short_misses = bool(self.params["short_misses"])

        # Map each earnings event to an entry bar (first bar on/after the
        # approximated announcement date).
        signals = []  # (entry_i, direction, surprise_pct)
        for ev in events:
            q = ev.get("quarter")
            sp = ev.get("surprise_pct")
            if q is None or sp is None:
                continue
            try:
                ann = pd.to_datetime(str(q))
                ann = (ann.tz_localize("UTC") if ann.tzinfo is None else ann.tz_convert("UTC")) + timedelta(days=lag)
            except Exception:
                continue
            after = times[times >= ann]
            if after.empty:
                continue
            entry_i = int(after.index[0])
            if entry_i >= n - 1:
                continue
            if sp > thr:
                signals.append((entry_i, 1, sp))
            elif sp < -thr and short_misses:
                signals.append((entry_i, -1, sp))
        signals.sort()

        cash = self.initial_capital
        equity_curve, trades = [], []
        pos_qty = 0.0
        entry_px = 0.0
        entry_t = None
        exit_i = None
        direction = 0
        sig_ptr = 0

        for i in range(n - 1):
            # Open a position at the next bar when an event fires and we're flat.
            if pos_qty == 0 and sig_ptr < len(signals) and signals[sig_ptr][0] <= i:
                _, direction, sp = signals[sig_ptr]
                sig_ptr += 1
                fill = float(opens.iloc[i + 1]) * (1 + self.slippage * direction)
                qty = math.floor((cash * 0.95) / fill)
                if qty > 0:
                    pos_qty = qty * direction
                    entry_px = fill
                    entry_t = times.iloc[i + 1]
                    exit_i = min(n - 1, i + 1 + drift)
                    cash -= qty * fill if direction > 0 else -qty * fill  # short: receive proceeds
            # Close when the drift window ends.
            elif pos_qty != 0 and exit_i is not None and i + 1 >= exit_i:
                fill = float(opens.iloc[i + 1]) * (1 - self.slippage * (1 if pos_qty > 0 else -1))
                qty = abs(pos_qty)
                cash += qty * fill if pos_qty > 0 else -qty * fill
                pnl = (fill - entry_px) * pos_qty
                trades.append({
                    "symbol": symbol, "side": OrderSide.BUY.value if pos_qty > 0 else OrderSide.SELL.value,
                    "entry_time": entry_t.to_pydatetime(), "exit_time": times.iloc[i + 1].to_pydatetime(),
                    "entry_price": Decimal(str(round(entry_px, 4))), "exit_price": Decimal(str(round(fill, 4))),
                    "qty": Decimal(str(qty)), "pnl": Decimal(str(round(pnl, 2))),
                    "pnl_pct": Decimal(str(round((fill / entry_px - 1) * 100 * (1 if pos_qty > 0 else -1), 4))),
                    "reason": f"PEAD {'long beat' if pos_qty > 0 else 'short miss'}",
                })
                pos_qty = 0.0; entry_px = 0.0; entry_t = None; exit_i = None

            eq = cash + pos_qty * float(close.iloc[i + 1])
            equity_curve.append({"t": times.iloc[i + 1].isoformat(), "equity": round(eq, 2)})

        if pos_qty != 0:
            fill = float(close.iloc[-1])
            cash += abs(pos_qty) * fill if pos_qty > 0 else -abs(pos_qty) * fill
            pnl = (fill - entry_px) * pos_qty
            trades.append({
                "symbol": symbol, "side": OrderSide.BUY.value if pos_qty > 0 else OrderSide.SELL.value,
                "entry_time": entry_t.to_pydatetime(), "exit_time": times.iloc[-1].to_pydatetime(),
                "entry_price": Decimal(str(round(entry_px, 4))), "exit_price": Decimal(str(round(fill, 4))),
                "qty": Decimal(str(abs(pos_qty))), "pnl": Decimal(str(round(pnl, 2))),
                "pnl_pct": Decimal("0"), "reason": "PEAD end-liquidation",
            })

        total_return_pct = (cash / self.initial_capital - 1.0) * 100
        sharpe = max_dd = 0.0
        if equity_curve:
            eq = np.array([e["equity"] for e in equity_curve], float)
            rets = np.diff(eq) / eq[:-1]; rets = rets[np.isfinite(rets)]
            if len(rets) > 1 and rets.std() > 0:
                sharpe = (rets.mean() / rets.std()) * math.sqrt(252)
            peak = np.maximum.accumulate(eq)
            max_dd = abs(((eq - peak) / peak).min()) * 100 if len(eq) else 0.0
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
