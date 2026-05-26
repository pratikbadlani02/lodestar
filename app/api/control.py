"""Runtime control: kill switch, pause strategies, emergency liquidate."""
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.db import get_db
from app.core.models import TradingMode
from app.core.schemas import ControlState, KillSwitchRequest
from app.core.security import get_current_user
from app.services.audit import audit
from app.services.control import (
    get_kill_reason,
    is_strategies_enabled,
    is_trading_enabled,
    set_strategies_enabled,
    set_trading_enabled,
)
from app.services.execution import emergency_liquidate_all
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/control", tags=["Control"])


@router.get("/state", response_model=ControlState)
async def get_state(user: str = Depends(get_current_user)) -> ControlState:
    return ControlState(
        trading_enabled=await is_trading_enabled(),
        strategies_enabled=await is_strategies_enabled(),
        mode=TradingMode.LIVE if settings.is_live_trading else TradingMode.PAPER,
        is_live=settings.is_live_trading,
    )


@router.post("/kill")
async def kill_switch(
    req: KillSwitchRequest,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    """Halt all trading — does NOT liquidate positions. Use /liquidate for that."""
    await set_trading_enabled(False, reason=req.reason)
    await set_strategies_enabled(False)
    await audit(
        db, actor=f"user:{user}", action="kill_switch_activated",
        details={"reason": req.reason},
    )
    return {"trading_enabled": False, "strategies_enabled": False, "reason": req.reason}


@router.post("/resume")
async def resume(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    """Re-enable trading and strategies."""
    await set_trading_enabled(True)
    await set_strategies_enabled(True)
    await audit(db, actor=f"user:{user}", action="trading_resumed")
    return {"trading_enabled": True, "strategies_enabled": True}


@router.post("/strategies/pause")
async def pause_strategies(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    await set_strategies_enabled(False)
    await audit(db, actor=f"user:{user}", action="strategies_paused")
    return {"strategies_enabled": False}


@router.post("/strategies/resume")
async def resume_strategies(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    await set_strategies_enabled(True)
    await audit(db, actor=f"user:{user}", action="strategies_resumed")
    return {"strategies_enabled": True}


@router.post("/liquidate")
async def liquidate(
    req: KillSwitchRequest,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> dict:
    """EMERGENCY: cancel all orders + close all positions."""
    # Also activate kill switch
    await set_trading_enabled(False, reason=f"LIQUIDATE: {req.reason}")
    await set_strategies_enabled(False)
    try:
        result = await emergency_liquidate_all(db, actor=f"user:{user}", reason=req.reason)
        return {"status": "liquidated", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Liquidation failed: {e}")
