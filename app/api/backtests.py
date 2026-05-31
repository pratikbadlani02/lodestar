"""Backtest API — create (async via Celery), list, get results, list trades."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import Backtest, BacktestStatus, BacktestTrade
from app.core.schemas import BacktestCreate, BacktestRead, BacktestTradeRead
from app.core.security import get_current_user
from app.services.audit import audit
from app.strategies.cross_sectional import CROSS_SECTIONAL_REGISTRY
from app.strategies.registry import STRATEGY_REGISTRY

router = APIRouter(prefix="/backtests", tags=["Backtests"])


@router.post("", response_model=BacktestRead, status_code=202)
async def create_backtest(
    payload: BacktestCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Backtest:
    if payload.strategy_type not in STRATEGY_REGISTRY and payload.strategy_type not in CROSS_SECTIONAL_REGISTRY:
        known = list(STRATEGY_REGISTRY.keys()) + list(CROSS_SECTIONAL_REGISTRY.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Unknown strategy_type. Available: {known}",
        )
    if payload.end_date <= payload.start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")

    bt = Backtest(
        name=payload.name,
        strategy_type=payload.strategy_type,
        symbols=[s.upper() for s in payload.symbols],
        params=payload.params,
        start_date=payload.start_date,
        end_date=payload.end_date,
        initial_capital=payload.initial_capital,
        status=BacktestStatus.PENDING,
    )
    db.add(bt)
    await db.flush()
    await audit(
        db, actor=user, action="backtest_created",
        resource=f"backtest:{bt.id}",
        details={"name": bt.name, "symbols": bt.symbols},
    )
    await db.commit()

    # Dispatch in-process (no Celery): runs as a background asyncio task.
    from app.tasks import dispatch, run_backtest
    dispatch(run_backtest(bt.id))

    return bt


@router.get("", response_model=list[BacktestRead])
async def list_backtests(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[Backtest]:
    result = await db.execute(
        select(Backtest).order_by(Backtest.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/{backtest_id}", response_model=BacktestRead)
async def get_backtest(
    backtest_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Backtest:
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    bt = result.scalar_one_or_none()
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return bt


@router.get("/{backtest_id}/trades", response_model=list[BacktestTradeRead])
async def get_trades(
    backtest_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[BacktestTrade]:
    result = await db.execute(
        select(BacktestTrade)
        .where(BacktestTrade.backtest_id == backtest_id)
        .order_by(BacktestTrade.entry_time.asc())
    )
    return list(result.scalars().all())


@router.delete("/{backtest_id}", status_code=204)
async def delete_backtest(
    backtest_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> None:
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    bt = result.scalar_one_or_none()
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    await db.delete(bt)
    await audit(db, actor=user, action="backtest_deleted", resource=f"backtest:{backtest_id}")
