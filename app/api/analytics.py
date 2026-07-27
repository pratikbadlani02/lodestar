"""Analytics, alerts, optimizer, equity history routes."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.logging import get_logger
from app.core.models import AccountSnapshot, Alert, OptimizerRun, StrategyPerformance
from app.core.security import get_current_user
from app.services.audit import audit
from app.services.risk_analytics import compute_portfolio_risk

logger = get_logger(__name__)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ── Equity history ───────────────────────────────────────────────────────────
@router.get("/equity-curve")
async def equity_curve(
    days: int = Query(default=30, ge=1, le=730),
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    """Return account equity over time from snapshots."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AccountSnapshot)
        .where(AccountSnapshot.timestamp >= since)
        .order_by(AccountSnapshot.timestamp.asc())
    )
    rows = result.scalars().all()
    return {
        "days": days,
        "points": len(rows),
        "data": [
            {
                "t": r.timestamp.isoformat(),
                "equity": float(r.equity),
                "cash": float(r.cash),
                "buying_power": float(r.buying_power),
                "positions": r.positions_count,
                "day_pl": float(r.day_pl) if r.day_pl else None,
            }
            for r in rows
        ],
    }


# ── Risk analytics ───────────────────────────────────────────────────────────
@router.get("/portfolio-risk")
async def portfolio_risk(
    lookback_days: int = Query(default=90, ge=10, le=365),
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    return await compute_portfolio_risk(db, lookback_days=lookback_days)


# ── Strategy P&L ─────────────────────────────────────────────────────────────
@router.get("/strategy-pnl")
async def strategy_pnl(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[dict]:
    """Per-strategy daily P&L history."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    result = await db.execute(
        select(StrategyPerformance)
        .where(StrategyPerformance.date >= since)
        .order_by(StrategyPerformance.date.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "strategy_id": str(r.strategy_id),
            "date": r.date.isoformat(),
            "realized_pl": float(r.realized_pl),
            "unrealized_pl": float(r.unrealized_pl),
            "trades_count": r.trades_count,
            "win_count": r.win_count,
            "loss_count": r.loss_count,
        }
        for r in rows
    ]


# ── Alerts ───────────────────────────────────────────────────────────────────
alerts_router = APIRouter(prefix="/alerts", tags=["Alerts"])


@alerts_router.get("")
async def list_alerts(
    limit: int = Query(default=50, le=500),
    severity: str | None = None,
    unack_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[dict]:
    q = select(Alert).order_by(Alert.timestamp.desc()).limit(limit)
    if severity:
        q = q.where(Alert.severity == severity)
    if unack_only:
        q = q.where(Alert.acknowledged == False)
    result = await db.execute(q)
    return [
        {
            "id": str(r.id),
            "timestamp": r.timestamp.isoformat(),
            "severity": r.severity,
            "category": r.category,
            "title": r.title,
            "message": r.message,
            "acknowledged": r.acknowledged,
            "metadata": r.metadata_json,
        }
        for r in result.scalars().all()
    ]


@alerts_router.post("/{alert_id}/ack")
async def acknowledge_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    await db.execute(
        update(Alert).where(Alert.id == alert_id).values(acknowledged=True)
    )
    return {"ok": True}


# ── Optimizer ────────────────────────────────────────────────────────────────
class OptimizerCreate(BaseModel):
    name: str
    strategy_type: str
    symbols: list[str]
    param_grid: dict
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal = Field(default=Decimal("100000"))


optimizer_router = APIRouter(prefix="/optimizer", tags=["Optimizer"])


@optimizer_router.post("", status_code=202)
async def create_optimizer_run(
    payload: OptimizerCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    run = OptimizerRun(
        name=payload.name,
        strategy_type=payload.strategy_type,
        symbols=[s.upper() for s in payload.symbols],
        param_grid=payload.param_grid,
        start_date=payload.start_date,
        end_date=payload.end_date,
        initial_capital=payload.initial_capital,
        status="pending",
    )
    db.add(run)
    await db.flush()
    await audit(
        db, actor=f"user:{user}", action="optimizer_created",
        resource=f"optimizer:{run.id}",
    )
    await db.commit()

    from app.tasks import dispatch, run_optimizer
    dispatch(run_optimizer(run.id))

    return {"id": str(run.id), "status": "pending"}


@optimizer_router.get("")
async def list_optimizer_runs(
    limit: int = Query(default=20),
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[dict]:
    result = await db.execute(
        select(OptimizerRun).order_by(OptimizerRun.created_at.desc()).limit(limit)
    )
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "strategy_type": r.strategy_type,
            "symbols": r.symbols,
            "status": r.status,
            "best_params": r.best_params,
            "best_sharpe": float(r.best_sharpe) if r.best_sharpe else None,
            "created_at": r.created_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in result.scalars().all()
    ]


@optimizer_router.get("/{run_id}")
async def get_optimizer_run(
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(OptimizerRun).where(OptimizerRun.id == run_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    return {
        "id": str(r.id),
        "name": r.name,
        "strategy_type": r.strategy_type,
        "symbols": r.symbols,
        "param_grid": r.param_grid,
        "start_date": r.start_date.isoformat(),
        "end_date": r.end_date.isoformat(),
        "initial_capital": float(r.initial_capital),
        "status": r.status,
        "results": r.results,
        "best_params": r.best_params,
        "best_sharpe": float(r.best_sharpe) if r.best_sharpe else None,
        "error": r.error,
        "created_at": r.created_at.isoformat(),
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }


# ── Export endpoints (CSV) ───────────────────────────────────────────────────
export_router = APIRouter(prefix="/export", tags=["Export"])


@export_router.get("/orders.csv")
async def export_orders_csv(
    days: int = Query(default=30),
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Response:
    from app.core.models import Order
    import csv
    import io

    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Order).where(Order.submitted_at >= since).order_by(Order.submitted_at.desc())
    )
    orders = result.scalars().all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "id", "submitted_at", "symbol", "side", "qty", "filled_qty",
        "avg_fill_price", "status", "mode", "reason",
    ])
    for o in orders:
        w.writerow([
            o.id, o.submitted_at.isoformat(), o.symbol, o.side.value, o.qty,
            o.filled_qty, o.avg_fill_price or "", o.status.value, o.mode.value,
            (o.reason or "").replace("\n", " "),
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@export_router.get("/backtest/{backtest_id}/trades.csv")
async def export_backtest_csv(
    backtest_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Response:
    from app.core.models import BacktestTrade
    import csv
    import io

    result = await db.execute(
        select(BacktestTrade)
        .where(BacktestTrade.backtest_id == backtest_id)
        .order_by(BacktestTrade.entry_time.asc())
    )
    trades = result.scalars().all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["symbol", "side", "entry_time", "exit_time", "entry_price",
                "exit_price", "qty", "pnl", "pnl_pct", "reason"])
    for t in trades:
        w.writerow([
            t.symbol, t.side.value,
            t.entry_time.isoformat(),
            t.exit_time.isoformat() if t.exit_time else "",
            t.entry_price, t.exit_price or "", t.qty,
            t.pnl or "", t.pnl_pct or "", t.reason or "",
        ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=backtest_{backtest_id}.csv"},
    )
