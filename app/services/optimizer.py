"""
Parameter Optimizer.

Walk-forward parameter optimization for strategies. Generates a grid
of parameter combinations from a param_grid spec, runs each as a backtest,
and ranks by Sharpe ratio.

param_grid format:
  {"short_window": [10, 20, 30], "long_window": [50, 100, 200]}
=> 9 combinations
"""
import itertools
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.models import OptimizerRun
from app.services.backtester import create_engine
from app.services.market_data import fetch_and_store_bars, get_bars_df

logger = get_logger(__name__)


def expand_grid(param_grid: dict[str, list]) -> list[dict[str, Any]]:
    """Expand a parameter grid into all combinations."""
    if not param_grid:
        return [{}]
    keys = list(param_grid.keys())
    values = [param_grid[k] for k in keys]
    return [dict(zip(keys, combo)) for combo in itertools.product(*values)]


async def run_optimization(db: AsyncSession, run_id: UUID) -> dict:
    """Execute an OptimizerRun. Updates DB with results."""
    result = await db.execute(select(OptimizerRun).where(OptimizerRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        return {"error": "not_found"}

    run.status = "running"
    await db.commit()

    try:
        combinations = expand_grid(run.param_grid)
        logger.info("optimizer_start", run_id=str(run_id), combos=len(combinations))

        # Pre-fetch data for all symbols once
        for sym in run.symbols:
            await fetch_and_store_bars(db, symbol=sym, timeframe="1Day", lookback_days=730)

        all_results = []
        for i, params in enumerate(combinations):
            try:
                # Run backtest for each symbol, aggregate
                final_equities = []
                trade_counts = []
                sharpe_list = []
                for sym in run.symbols:
                    df = await get_bars_df(
                        db, symbol=sym, timeframe="1d",
                        start=run.start_date, end=run.end_date,
                    )
                    if len(df) < 50:
                        continue
                    engine = create_engine(
                        strategy_type=run.strategy_type,
                        params=params,
                        initial_capital=run.initial_capital / Decimal(len(run.symbols)),
                    )
                    res = engine.run(symbol=sym, df=df)
                    final_equities.append(float(res["final_equity"]))
                    trade_counts.append(res["total_trades"])
                    sharpe_list.append(float(res["sharpe_ratio"]))

                if not final_equities:
                    continue

                total_final = sum(final_equities)
                total_return = (total_final / float(run.initial_capital) - 1.0) * 100
                avg_sharpe = sum(sharpe_list) / len(sharpe_list) if sharpe_list else 0
                total_trades = sum(trade_counts)

                all_results.append({
                    "params": params,
                    "total_return_pct": round(total_return, 4),
                    "avg_sharpe": round(avg_sharpe, 4),
                    "total_trades": total_trades,
                    "final_equity": round(total_final, 2),
                })

                logger.info(
                    "optimizer_progress",
                    run_id=str(run_id), i=i+1, total=len(combinations),
                    return_pct=round(total_return, 2),
                )

            except Exception as e:
                logger.error("optimizer_combo_failed", params=params, error=str(e))

        # Rank by Sharpe (then return as tiebreak)
        all_results.sort(key=lambda r: (r["avg_sharpe"], r["total_return_pct"]), reverse=True)

        if all_results:
            run.best_params = all_results[0]["params"]
            run.best_sharpe = Decimal(str(all_results[0]["avg_sharpe"]))

        run.results = all_results
        run.status = "completed"
        run.completed_at = datetime.now()
        await db.commit()
        return {"status": "completed", "combos_tested": len(all_results)}

    except Exception as e:
        logger.error("optimizer_failed", run_id=str(run_id), error=str(e))
        run.status = "failed"
        run.error = str(e)
        await db.commit()
        return {"status": "failed", "error": str(e)}
