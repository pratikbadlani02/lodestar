"""
Backtesting engine.

Runs a strategy against historical OHLCV data and computes metrics:
  - Total return, Sharpe ratio, max drawdown, win rate, trade count
  - Full equity curve
  - Individual trade log

Assumes:
  - Daily bars (or whatever timeframe stored)
  - No slippage/commission by default (configurable)
  - Single position per symbol, no leverage
  - Buy signal → long, Sell signal → close long
  - Orders filled at next bar's open
"""
import math
from datetime import datetime
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import settings
from app.core.logging import get_logger
from app.core.models import OrderSide
from app.strategies.base import Signal, SignalType
from app.strategies.registry import get_strategy

logger = get_logger(__name__)


class BacktestEngine:
    def __init__(
        self,
        strategy_type: str,
        params: dict[str, Any],
        initial_capital: Decimal,
        commission_per_trade: float = 0.0,
        slippage_bps: float = 2.0,
    ):
        self.strategy = get_strategy(strategy_type, params)
        self.initial_capital = float(initial_capital)
        self.commission = commission_per_trade
        self.slippage = slippage_bps / 10_000.0

    def run(self, symbol: str, df: pd.DataFrame) -> dict[str, Any]:
        """
        Run backtest on a single symbol.
        df: OHLCV dataframe sorted ascending by time.
        """
        if len(df) < self.strategy.required_bars + 1:
            raise ValueError(
                f"Not enough data: need {self.strategy.required_bars + 1} bars, got {len(df)}"
            )

        cash = self.initial_capital
        position_qty = 0.0
        position_entry_price = 0.0
        position_entry_time: datetime | None = None

        equity_curve: list[dict[str, Any]] = []
        trades: list[dict[str, Any]] = []

        # Walk forward bar-by-bar. At each bar, feed strategy data up to
        # the current bar, generate signal, execute at next bar's open.
        for i in range(self.strategy.required_bars, len(df) - 1):
            window = df.iloc[: i + 1].reset_index(drop=True)
            signal: Signal | None = None
            try:
                signal = self.strategy.generate_signal(symbol, window)
            except Exception as e:
                logger.error("backtest_strategy_error", error=str(e), bar=i)

            next_bar = df.iloc[i + 1]
            fill_price_base = float(next_bar["open"])

            # Execute signal (if any) at next bar's open with slippage
            if signal is not None:
                if signal.signal == SignalType.BUY and position_qty == 0:
                    fill_price = fill_price_base * (1 + self.slippage)
                    qty = math.floor((cash * 0.95) / fill_price)  # use 95% of cash
                    if qty > 0:
                        cost = qty * fill_price + self.commission
                        cash -= cost
                        position_qty = qty
                        position_entry_price = fill_price
                        position_entry_time = next_bar["time"]

                elif signal.signal in (SignalType.SELL, SignalType.CLOSE) and position_qty > 0:
                    fill_price = fill_price_base * (1 - self.slippage)
                    proceeds = position_qty * fill_price - self.commission
                    cash += proceeds
                    pnl = (fill_price - position_entry_price) * position_qty - 2 * self.commission
                    pnl_pct = (fill_price / position_entry_price - 1.0) * 100
                    trades.append({
                        "symbol": symbol,
                        "side": OrderSide.BUY.value,
                        "entry_time": position_entry_time,
                        "exit_time": next_bar["time"],
                        "entry_price": Decimal(str(round(position_entry_price, 4))),
                        "exit_price": Decimal(str(round(fill_price, 4))),
                        "qty": Decimal(str(position_qty)),
                        "pnl": Decimal(str(round(pnl, 2))),
                        "pnl_pct": Decimal(str(round(pnl_pct, 4))),
                        "reason": signal.reason,
                    })
                    position_qty = 0.0
                    position_entry_price = 0.0
                    position_entry_time = None

            # Mark-to-market equity at this bar's close
            equity = cash + position_qty * float(df.iloc[i + 1]["close"])
            equity_curve.append({
                "t": df.iloc[i + 1]["time"].isoformat() if hasattr(df.iloc[i + 1]["time"], "isoformat") else str(df.iloc[i + 1]["time"]),
                "equity": round(equity, 2),
            })

        # Force-close any open position at final bar
        if position_qty > 0:
            final_price = float(df.iloc[-1]["close"])
            proceeds = position_qty * final_price - self.commission
            cash += proceeds
            pnl = (final_price - position_entry_price) * position_qty - 2 * self.commission
            pnl_pct = (final_price / position_entry_price - 1.0) * 100
            trades.append({
                "symbol": symbol,
                "side": OrderSide.BUY.value,
                "entry_time": position_entry_time,
                "exit_time": df.iloc[-1]["time"],
                "entry_price": Decimal(str(round(position_entry_price, 4))),
                "exit_price": Decimal(str(round(final_price, 4))),
                "qty": Decimal(str(position_qty)),
                "pnl": Decimal(str(round(pnl, 2))),
                "pnl_pct": Decimal(str(round(pnl_pct, 4))),
                "reason": "backtest_end_liquidation",
            })

        return self._compute_metrics(cash, equity_curve, trades)

    def _compute_metrics(
        self,
        final_cash: float,
        equity_curve: list[dict[str, Any]],
        trades: list[dict[str, Any]],
    ) -> dict[str, Any]:
        final_equity = final_cash
        total_return_pct = (final_equity / self.initial_capital - 1.0) * 100

        if equity_curve:
            equities = np.array([e["equity"] for e in equity_curve])
            returns = np.diff(equities) / equities[:-1]
            returns = returns[~np.isnan(returns) & ~np.isinf(returns)]

            if len(returns) > 1 and returns.std() > 0:
                sharpe = (returns.mean() / returns.std()) * math.sqrt(252)
            else:
                sharpe = 0.0

            # Max drawdown
            running_peak = np.maximum.accumulate(equities)
            drawdowns = (equities - running_peak) / running_peak
            max_dd_pct = abs(drawdowns.min()) * 100 if len(drawdowns) else 0.0
        else:
            sharpe = 0.0
            max_dd_pct = 0.0

        winners = [t for t in trades if t["pnl"] and t["pnl"] > 0]
        win_rate_pct = (len(winners) / len(trades) * 100) if trades else 0.0

        return {
            "final_equity": Decimal(str(round(final_equity, 2))),
            "total_return_pct": Decimal(str(round(total_return_pct, 4))),
            "sharpe_ratio": Decimal(str(round(sharpe, 4))),
            "max_drawdown_pct": Decimal(str(round(max_dd_pct, 4))),
            "win_rate_pct": Decimal(str(round(win_rate_pct, 4))),
            "total_trades": len(trades),
            "equity_curve": equity_curve,
            "trades": trades,
        }


def create_engine(
    strategy_type: str,
    params: dict[str, Any],
    initial_capital: Decimal,
) -> BacktestEngine:
    return BacktestEngine(
        strategy_type=strategy_type,
        params=params,
        initial_capital=initial_capital,
        commission_per_trade=settings.backtest_commission_per_trade,
        slippage_bps=settings.backtest_slippage_bps,
    )
