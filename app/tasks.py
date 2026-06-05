"""
Async task coroutines — formerly Celery tasks in app/worker.py.

These are now plain async functions invoked by APScheduler (periodic) or
asyncio.create_task() (on-demand). No event-loop reset is needed because we
always run inside the FastAPI app's single, long-lived event loop — unlike
the old Celery setup where each task call spun up a fresh loop.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.markets import detect_market
from app.core.models import (
    AccountSnapshot, Backtest, BacktestStatus, BacktestTrade,
    Order, OrderSide, OrderStatus, Position, PriceAlert, Strategy,
    StrategyPerformance, StrategyRun, StrategyStatus, TradingMode,
)
from app.services.alerts import emit_alert
from app.services.backtester import create_engine
from app.services.broker import AlpacaError, get_broker
from app.services.control import is_strategies_enabled
from app.services.execution import execute_order, sync_order_status
from app.services.market_calendar import is_market_open, is_trading_day
from app.services.market_data import fetch_and_store_bars, get_bars_df
from app.services.optimizer import run_optimization
from app.services.position_monitor import monitor_positions, update_position_targets
from app.services.websocket import emit as ws_emit
from app.strategies.base import SignalType
from app.strategies.registry import get_strategy

logger = get_logger(__name__)


# ─── STRATEGY EXECUTION ─────────────────────────────────────────────────────
async def run_active_strategies() -> dict:
    if not await is_strategies_enabled():
        return {"status": "paused"}

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Strategy).where(Strategy.status == StrategyStatus.ACTIVE)
        )
        strategies = list(result.scalars().all())
        if not strategies:
            return {"status": "ok", "count": 0}

        total_signals = 0
        total_orders = 0
        # Cache per-market equity + open-state so we hit each broker once.
        _equity_cache: dict[str, Decimal] = {}
        _open_cache: dict[str, bool] = {}

        async def _market_equity(mkt: str) -> Decimal | None:
            if mkt in _equity_cache:
                return _equity_cache[mkt]
            try:
                acct = await get_broker(mkt).get_account()
                eq = Decimal(acct.get("equity", "0"))
            except AlpacaError as e:
                logger.error("acct_fetch_failed", market=mkt, error=str(e))
                eq = None
            _equity_cache[mkt] = eq
            return eq

        async def _market_open(mkt: str) -> bool:
            if mkt not in _open_cache:
                _open_cache[mkt] = (
                    await is_market_open(mkt) and await is_trading_day(mkt)
                )
            return _open_cache[mkt]

        for strat in strategies:
            run = StrategyRun(strategy_id=strat.id)
            db.add(run)
            await db.flush()

            try:
                # Market is inferred from the strategy's symbols (suffix → IN).
                strat_market = (
                    detect_market(strat.symbols[0]).value if strat.symbols else "us"
                )
                if not await _market_open(strat_market):
                    run.completed_at = datetime.now(timezone.utc)
                    run.details = {"skipped": "market_closed", "market": strat_market}
                    await db.flush()
                    continue
                equity = await _market_equity(strat_market)
                if equity is None:
                    run.error = "broker_unavailable"
                    await db.flush()
                    continue

                strategy = get_strategy(strat.strategy_type, strat.params)
                signals_count = 0
                orders_count = 0

                for symbol in strat.symbols:
                    df = await get_bars_df(
                        db, symbol=symbol, timeframe=strat.timeframe,
                        limit=strategy.required_bars + 10,
                    )
                    if len(df) < strategy.required_bars:
                        continue

                    signal = strategy.generate_signal(symbol, df)
                    if signal is None or signal.signal == SignalType.HOLD:
                        continue
                    signals_count += 1

                    pos_value = equity * (strat.position_size_pct / Decimal("100"))
                    qty = int(pos_value / signal.price)
                    if qty <= 0:
                        continue

                    side = OrderSide.BUY if signal.signal == SignalType.BUY else OrderSide.SELL
                    order = await execute_order(
                        db=db, symbol=symbol, side=side, qty=Decimal(qty),
                        reference_price=signal.price, strategy_id=strat.id,
                        actor=f"strategy:{strat.name}",
                    )
                    if order.status != OrderStatus.RISK_REJECTED:
                        orders_count += 1
                        await asyncio.sleep(0.1)
                        pos_result = await db.execute(
                            select(Position).where(Position.symbol == symbol.upper())
                        )
                        pos = pos_result.scalar_one_or_none()
                        if pos:
                            pos.strategy_id = strat.id
                            await update_position_targets(db, pos, strat, signal.price)

                        await ws_emit("strategy_signal", {
                            "strategy": strat.name, "symbol": symbol,
                            "signal": signal.signal.value, "reason": signal.reason,
                        })

                run.signals_generated = signals_count
                run.orders_submitted = orders_count
                run.completed_at = datetime.now(timezone.utc)
                total_signals += signals_count
                total_orders += orders_count

            except Exception as e:
                run.error = str(e)
                logger.error("strategy_run_failed", strategy=strat.name, error=str(e))

            await db.flush()

        await db.commit()
        return {"status": "ok", "strategies": len(strategies),
                "signals": total_signals, "orders": total_orders}


# ─── POSITION MONITOR (stop loss / take profit) ─────────────────────────────
async def monitor_open_positions() -> dict:
    async with AsyncSessionLocal() as db:
        return await monitor_positions(db)


# ─── ORDER SYNC ─────────────────────────────────────────────────────────────
async def sync_open_orders() -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Order).where(Order.status.in_([
                OrderStatus.SUBMITTED, OrderStatus.ACCEPTED, OrderStatus.PARTIALLY_FILLED,
            ]))
        )
        orders = list(result.scalars().all())
        for o in orders:
            try:
                old_status = o.status
                await sync_order_status(db, o)
                if o.status != old_status:
                    await ws_emit("order_update", {
                        "id": str(o.id), "symbol": o.symbol,
                        "status": o.status.value,
                        "filled_qty": str(o.filled_qty),
                    })
            except Exception as e:
                logger.error("order_sync_failed", order_id=str(o.id), error=str(e))
        await db.commit()
        return {"synced": len(orders)}


# ─── ACCOUNT SNAPSHOT ───────────────────────────────────────────────────────
async def snapshot_account() -> dict:
    async with AsyncSessionLocal() as db:
        broker = get_broker()
        try:
            acct = await broker.get_account()
            positions = await broker.get_positions()
        except AlpacaError as e:
            return {"status": "error", "error": str(e)}

        equity = Decimal(acct.get("equity", "0"))
        last_equity = Decimal(acct.get("last_equity", "0"))
        day_pl = equity - last_equity if last_equity > 0 else None

        snap = AccountSnapshot(
            mode=TradingMode.LIVE if settings.is_live_trading else TradingMode.PAPER,
            cash=Decimal(acct.get("cash", "0")),
            equity=equity,
            buying_power=Decimal(acct.get("buying_power", "0")),
            positions_count=len(positions),
            day_pl=day_pl,
        )
        db.add(snap)
        await db.commit()

        await ws_emit("account_update", {
            "equity": float(equity),
            "cash": float(snap.cash),
            "day_pl": float(day_pl) if day_pl else None,
            "positions_count": len(positions),
        })

        if day_pl is not None and last_equity > 0:
            day_pl_pct = float(day_pl / last_equity * 100)
            if day_pl_pct <= -settings.max_daily_loss_pct:
                await emit_alert(
                    db, severity="critical", category="risk",
                    title=f"Daily loss limit reached: {day_pl_pct:.2f}%",
                    message=f"Day P/L: ${float(day_pl):.2f}",
                    metadata={"day_pl_pct": day_pl_pct},
                )
                await db.commit()

        return {"status": "ok", "equity": str(equity)}


# ─── MARKET DATA REFRESH ────────────────────────────────────────────────────
async def fetch_market_data() -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Strategy))
        strategies = list(result.scalars().all())
        symbols = set()
        for s in strategies:
            symbols.update(s.symbols)

        total = 0
        for sym in symbols:
            try:
                n = await fetch_and_store_bars(
                    db, symbol=sym, timeframe="1Day", lookback_days=365,
                )
                total += n
            except Exception as e:
                logger.error("fetch_failed", symbol=sym, error=str(e))
        await db.commit()
        return {"symbols": len(symbols), "bars_stored": total}


# ─── STRATEGY P&L ───────────────────────────────────────────────────────────
async def compute_strategy_pnl() -> dict:
    today = date.today()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Strategy))
        strategies = list(result.scalars().all())

        for strat in strategies:
            since = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
            orders_result = await db.execute(
                select(Order).where(
                    Order.strategy_id == strat.id,
                    Order.status == OrderStatus.FILLED,
                    Order.filled_at >= since,
                )
            )
            orders = list(orders_result.scalars().all())
            trades_count = len(orders)

            existing = await db.execute(
                select(StrategyPerformance).where(
                    StrategyPerformance.strategy_id == strat.id,
                    StrategyPerformance.date == today,
                )
            )
            perf = existing.scalar_one_or_none()
            if not perf:
                perf = StrategyPerformance(strategy_id=strat.id, date=today)
                db.add(perf)
            perf.trades_count = trades_count

        await db.commit()
        return {"status": "ok", "strategies": len(strategies)}


# ─── PRICE ALERTS ───────────────────────────────────────────────────────────
async def check_price_alerts() -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriceAlert).where(PriceAlert.triggered == False)
        )
        alerts = list(result.scalars().all())
        if not alerts:
            return {"checked": 0, "triggered": 0}

        symbols = list({a.symbol for a in alerts})
        broker = get_broker()
        try:
            snapshots = await broker.get_snapshots(symbols)
        except AlpacaError as e:
            logger.error("price_alert_snapshot_failed", error=str(e))
            return {"checked": len(alerts), "triggered": 0, "error": str(e)}

        triggered_count = 0
        now = datetime.now(timezone.utc)
        for alert in alerts:
            snap = snapshots.get(alert.symbol)
            if not snap:
                continue
            latest_trade = snap.get("latestTrade") or {}
            price = latest_trade.get("p")
            if price is None:
                continue

            price = Decimal(str(price))
            if alert.alert_type == "volume":
                daily_bar = snap.get("dailyBar") or {}
                compare_val = Decimal(str(daily_bar.get("v", 0)))
            elif alert.alert_type == "pct_change":
                daily_bar = snap.get("dailyBar") or {}
                open_price = Decimal(str(daily_bar.get("o", 0)))
                compare_val = (price - open_price) / open_price * 100 if open_price else Decimal("0")
            else:
                compare_val = price

            fired = (
                (alert.condition == "above" and compare_val >= alert.threshold)
                or (alert.condition == "below" and compare_val <= alert.threshold)
            )
            if fired:
                alert.triggered = True
                alert.triggered_at = now
                triggered_count += 1
                msg = alert.message or f"{alert.symbol} hit {alert.condition} {alert.threshold}"
                await emit_alert(
                    db, severity="info", category="order",
                    title=f"Price Alert: {alert.symbol}", message=msg,
                    metadata={
                        "symbol": alert.symbol, "condition": alert.condition,
                        "threshold": str(alert.threshold), "price": str(price),
                    },
                )
                await ws_emit("price_alert_triggered", {
                    "symbol": alert.symbol, "condition": alert.condition,
                    "threshold": str(alert.threshold), "price": str(price),
                })

        await db.commit()
        return {"checked": len(alerts), "triggered": triggered_count}


# ─── BACKTEST (on-demand, long-running) ─────────────────────────────────────
async def run_backtest(backtest_id: UUID) -> dict:
    """
    Long-running backtest. Dispatched via asyncio.create_task() from the API.
    CPU-heavy numpy/pandas work runs in a thread to avoid blocking the loop.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
        bt = result.scalar_one_or_none()
        if not bt:
            return {"error": "not_found"}

        bt.status = BacktestStatus.RUNNING
        await db.commit()

        try:
            # ── Cross-sectional (portfolio) strategies: separate engine that
            #    ranks the whole basket and rotates capital (true sector rotation).
            from app.strategies.cross_sectional import CROSS_SECTIONAL_REGISTRY
            if bt.strategy_type in CROSS_SECTIONAL_REGISTRY:
                from app.services.portfolio_backtester import PortfolioBacktestEngine
                data: dict = {}
                for symbol in bt.symbols:
                    await fetch_and_store_bars(
                        db, symbol=symbol, timeframe="1Day",
                        start=bt.start_date - timedelta(days=60),
                    )
                    df = await get_bars_df(
                        db, symbol=symbol, timeframe="1d",
                        start=bt.start_date, end=bt.end_date,
                    )
                    if len(df) >= 50:
                        data[symbol] = df
                if len(data) < 2:
                    bt.status = BacktestStatus.FAILED
                    bt.error = "Cross-sectional backtest needs ≥2 symbols with data"
                    await db.commit()
                    return {"status": "failed"}

                engine = PortfolioBacktestEngine(bt.strategy_type, bt.params, bt.initial_capital)
                res = await asyncio.to_thread(lambda: engine.run(data))
                for t in res["trades"]:
                    db.add(BacktestTrade(backtest_id=bt.id, **t))
                bt.status = BacktestStatus.COMPLETED
                bt.final_equity = res["final_equity"]
                bt.total_return_pct = res["total_return_pct"]
                bt.sharpe_ratio = res["sharpe_ratio"]
                bt.max_drawdown_pct = res["max_drawdown_pct"]
                bt.win_rate_pct = res["win_rate_pct"]
                bt.total_trades = res["total_trades"]
                bt.equity_curve = res["equity_curve"][:5000]
                bt.completed_at = datetime.now(timezone.utc)
                await db.commit()
                await ws_emit("backtest_completed", {
                    "id": str(bt.id),
                    "return_pct": float(bt.total_return_pct),
                    "trades": bt.total_trades,
                })
                return {"status": "completed", "return_pct": float(bt.total_return_pct)}

            async def _persist(res):
                for t in res["trades"]:
                    db.add(BacktestTrade(backtest_id=bt.id, **t))
                bt.status = BacktestStatus.COMPLETED
                bt.final_equity = res["final_equity"]
                bt.total_return_pct = res["total_return_pct"]
                bt.sharpe_ratio = res["sharpe_ratio"]
                bt.max_drawdown_pct = res["max_drawdown_pct"]
                bt.win_rate_pct = res["win_rate_pct"]
                bt.total_trades = res["total_trades"]
                bt.equity_curve = res["equity_curve"][:5000]
                bt.completed_at = datetime.now(timezone.utc)
                await db.commit()
                await ws_emit("backtest_completed", {
                    "id": str(bt.id), "return_pct": float(bt.total_return_pct), "trades": bt.total_trades,
                })

            # ── Options / volatility strategies (single underlying, BS-priced) ──
            from app.services.options_backtester import OPTIONS_REGISTRY
            if bt.strategy_type in OPTIONS_REGISTRY:
                from app.services.options_backtester import OptionsBacktestEngine
                sym = bt.symbols[0]
                await fetch_and_store_bars(db, symbol=sym, timeframe="1Day", start=bt.start_date - timedelta(days=60))
                df = await get_bars_df(db, symbol=sym, timeframe="1d", start=bt.start_date, end=bt.end_date)
                if len(df) < 65:
                    bt.status = BacktestStatus.FAILED; bt.error = "Not enough data"; await db.commit(); return {"status": "failed"}
                engine = OptionsBacktestEngine(bt.strategy_type, bt.params, bt.initial_capital)
                res = await asyncio.to_thread(lambda: engine.run(sym, df))
                await _persist(res)
                return {"status": "completed", "return_pct": float(bt.total_return_pct)}

            # ── Event-driven (PEAD) — needs the symbol's earnings surprises ──
            from app.services.event_backtester import EVENT_REGISTRY
            if bt.strategy_type in EVENT_REGISTRY:
                from app.services.event_backtester import EventBacktestEngine
                from app.services.fundamentals import get_earnings_surprise
                sym = bt.symbols[0]
                await fetch_and_store_bars(db, symbol=sym, timeframe="1Day", start=bt.start_date - timedelta(days=60))
                df = await get_bars_df(db, symbol=sym, timeframe="1d", start=bt.start_date, end=bt.end_date)
                if len(df) < 10:
                    bt.status = BacktestStatus.FAILED; bt.error = "Not enough data"; await db.commit(); return {"status": "failed"}
                surp = await get_earnings_surprise(sym)
                events = [{"quarter": h.get("quarter"), "surprise_pct": h.get("surprise_pct")} for h in (surp.get("history") or [])]
                engine = EventBacktestEngine(bt.strategy_type, bt.params, bt.initial_capital)
                res = await asyncio.to_thread(lambda: engine.run(sym, df, events))
                await _persist(res)
                return {"status": "completed", "return_pct": float(bt.total_return_pct)}

            # ── Market-making simulation (HFT research; single underlying) ──
            from app.services.mm_backtester import MM_REGISTRY
            if bt.strategy_type in MM_REGISTRY:
                from app.services.mm_backtester import MarketMakingEngine
                sym = bt.symbols[0]
                await fetch_and_store_bars(db, symbol=sym, timeframe="1Day", start=bt.start_date - timedelta(days=60))
                df = await get_bars_df(db, symbol=sym, timeframe="1d", start=bt.start_date, end=bt.end_date)
                if len(df) < 30:
                    bt.status = BacktestStatus.FAILED; bt.error = "Not enough data"; await db.commit(); return {"status": "failed"}
                engine = MarketMakingEngine(bt.strategy_type, bt.params, bt.initial_capital)
                res = await asyncio.to_thread(lambda: engine.run(sym, df))
                await _persist(res)
                return {"status": "completed", "return_pct": float(bt.total_return_pct)}

            # ── Multi-symbol regular strategies: shared-capital portfolio ──
            # One cash pool across tickers (buying one doesn't require selling
            # another; freed cash is redeployed). Single-symbol keeps the
            # original isolated path below for backward compatibility.
            from app.strategies.registry import STRATEGY_REGISTRY as _REG
            if bt.strategy_type in _REG and len(bt.symbols) > 1:
                from app.services.signal_portfolio_backtester import SignalPortfolioEngine
                data: dict = {}
                for symbol in bt.symbols:
                    await fetch_and_store_bars(db, symbol=symbol, timeframe="1Day", start=bt.start_date - timedelta(days=60))
                    sdf = await get_bars_df(db, symbol=symbol, timeframe="1d", start=bt.start_date, end=bt.end_date)
                    if len(sdf) >= 50:
                        data[symbol] = sdf
                if len(data) < 2:
                    bt.status = BacktestStatus.FAILED; bt.error = "Need ≥2 symbols with data"; await db.commit(); return {"status": "failed"}
                engine = SignalPortfolioEngine(bt.strategy_type, bt.params, bt.initial_capital)
                res = await asyncio.to_thread(lambda: engine.run(data))
                await _persist(res)
                return {"status": "completed", "return_pct": float(bt.total_return_pct)}

            all_trades: list = []
            combined_curve: list[dict] = []
            final_equities: list[float] = []

            for symbol in bt.symbols:
                fetch_start = bt.start_date - timedelta(days=60)
                await fetch_and_store_bars(
                    db, symbol=symbol, timeframe="1Day", start=fetch_start,
                )

                df = await get_bars_df(
                    db, symbol=symbol, timeframe="1d",
                    start=bt.start_date, end=bt.end_date,
                )

                if len(df) < 50:
                    logger.warning("backtest_insufficient_data",
                                   symbol=symbol, bars=len(df))
                    continue

                # Push CPU-bound simulation into a worker thread.
                def _simulate(df=df, symbol=symbol):
                    engine = create_engine(
                        strategy_type=bt.strategy_type, params=bt.params,
                        initial_capital=bt.initial_capital / Decimal(len(bt.symbols)),
                    )
                    return engine.run(symbol=symbol, df=df)

                res = await asyncio.to_thread(_simulate)
                all_trades.extend(res["trades"])
                final_equities.append(float(res["final_equity"]))
                combined_curve.extend(res["equity_curve"])

            if not final_equities:
                bt.status = BacktestStatus.FAILED
                bt.error = "No symbols had sufficient data"
                await db.commit()
                return {"status": "failed"}

            total_final = sum(final_equities)
            total_return = (total_final / float(bt.initial_capital) - 1.0) * 100

            for t in all_trades:
                db.add(BacktestTrade(backtest_id=bt.id, **t))

            winners = [t for t in all_trades if t.get("pnl") and float(t["pnl"]) > 0]
            win_rate = (len(winners) / len(all_trades) * 100) if all_trades else 0.0

            bt.status = BacktestStatus.COMPLETED
            bt.final_equity = Decimal(str(round(total_final, 2)))
            bt.total_return_pct = Decimal(str(round(total_return, 4)))
            bt.win_rate_pct = Decimal(str(round(win_rate, 4)))
            bt.total_trades = len(all_trades)
            bt.equity_curve = combined_curve[:5000]
            bt.completed_at = datetime.now(timezone.utc)

            if combined_curve:
                import math
                import numpy as np
                eqs = np.array([e["equity"] for e in combined_curve])
                rets = np.diff(eqs) / eqs[:-1]
                rets = rets[~np.isnan(rets) & ~np.isinf(rets)]
                if len(rets) > 1 and rets.std() > 0:
                    bt.sharpe_ratio = Decimal(str(round(
                        (rets.mean() / rets.std()) * math.sqrt(252), 4
                    )))
                peak = np.maximum.accumulate(eqs)
                dd = (eqs - peak) / peak
                bt.max_drawdown_pct = Decimal(str(round(
                    abs(dd.min()) * 100 if len(dd) else 0, 4
                )))

            await db.commit()
            await ws_emit("backtest_completed", {
                "id": str(bt.id),
                "return_pct": float(bt.total_return_pct),
                "trades": bt.total_trades,
            })
            return {"status": "completed", "return_pct": total_return}

        except Exception as e:
            logger.error("backtest_failed", error=str(e))
            bt.status = BacktestStatus.FAILED
            bt.error = str(e)
            await db.commit()
            return {"status": "failed", "error": str(e)}


# ─── OPTIMIZER (on-demand, long-running) ────────────────────────────────────
async def run_optimizer(run_id: UUID) -> dict:
    async with AsyncSessionLocal() as db:
        return await run_optimization(db, run_id)


# ─── Dispatch helper for on-demand tasks ────────────────────────────────────
# Holds strong references so the GC doesn't cancel orphan tasks.
_background_tasks: set[asyncio.Task] = set()


def dispatch(coro) -> asyncio.Task:
    """Fire-and-forget an awaitable on the running event loop.

    Replaces Celery's `task.delay(args)`. The returned Task is kept alive
    until completion; failures are logged.
    """
    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            logger.error("background_task_failed", error=str(exc))

    task.add_done_callback(_done)
    return task
