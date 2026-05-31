"""Strategy CRUD + trigger-now endpoints."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import Strategy, StrategyStatus
from app.core.schemas import StrategyCreate, StrategyRead, StrategyUpdate
from app.core.security import get_current_user
from app.services.audit import audit
from app.services.event_backtester import EVENT_REGISTRY, list_event_strategies
from app.services.mm_backtester import MM_REGISTRY, list_mm_strategies
from app.services.options_backtester import OPTIONS_REGISTRY, list_options_strategies
from app.strategies.cross_sectional import CROSS_SECTIONAL_REGISTRY, list_xs_strategies
from app.strategies.registry import STRATEGY_REGISTRY, list_strategies

router = APIRouter(prefix="/strategies", tags=["Strategies"])


def _known_type(stype: str) -> bool:
    return (stype in STRATEGY_REGISTRY or stype in CROSS_SECTIONAL_REGISTRY
            or stype in OPTIONS_REGISTRY or stype in EVENT_REGISTRY or stype in MM_REGISTRY)


@router.get("/available")
async def available() -> list[dict]:
    """All strategy types: per-symbol, portfolio, options, event-driven, market-making."""
    return (list_strategies() + list_xs_strategies() + list_options_strategies()
            + list_event_strategies() + list_mm_strategies())


@router.get("", response_model=list[StrategyRead])
async def list_all(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[Strategy]:
    result = await db.execute(select(Strategy).order_by(Strategy.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=StrategyRead, status_code=201)
async def create(
    payload: StrategyCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Strategy:
    if not _known_type(payload.strategy_type):
        raise HTTPException(status_code=400, detail="Unknown strategy_type.")

    strategy = Strategy(
        name=payload.name,
        strategy_type=payload.strategy_type,
        symbols=[s.upper() for s in payload.symbols],
        params=payload.params,
        position_size_pct=payload.position_size_pct,
        schedule_cron=payload.schedule_cron,
        status=StrategyStatus.PAUSED,  # Always start paused
    )
    db.add(strategy)
    await db.flush()
    await audit(
        db, actor=user, action="strategy_created",
        resource=f"strategy:{strategy.id}",
        details={"name": payload.name, "type": payload.strategy_type},
    )
    return strategy


@router.get("/{strategy_id}", response_model=StrategyRead)
async def get_one(
    strategy_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Strategy:
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return s


@router.patch("/{strategy_id}", response_model=StrategyRead)
async def update(
    strategy_id: UUID,
    payload: StrategyUpdate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Strategy:
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")

    data = payload.model_dump(exclude_unset=True)
    if "symbols" in data:
        data["symbols"] = [sym.upper() for sym in data["symbols"]]

    for k, v in data.items():
        setattr(s, k, v)

    await audit(
        db, actor=user, action="strategy_updated",
        resource=f"strategy:{strategy_id}",
        details=data,
    )
    await db.flush()
    await db.refresh(s)
    return s


@router.delete("/{strategy_id}", status_code=204)
async def delete(
    strategy_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> None:
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    await db.delete(s)
    await audit(
        db, actor=user, action="strategy_deleted",
        resource=f"strategy:{strategy_id}",
    )
