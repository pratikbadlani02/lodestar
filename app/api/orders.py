"""Order submission and history."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import Order, OrderStatus
from app.core.schemas import OrderCreate, OrderRead
from app.core.security import get_current_user
from app.services.execution import execute_order, sync_order_status

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("", response_model=OrderRead, status_code=201)
async def submit(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Order:
    """Submit a manual order (goes through full risk check)."""
    order = await execute_order(
        db=db,
        symbol=payload.symbol,
        side=payload.side,
        qty=payload.qty,
        order_type=payload.order_type,
        limit_price=payload.limit_price,
        stop_price=payload.stop_price,
        time_in_force=payload.time_in_force,
        reference_price=payload.limit_price or payload.stop_price,
        actor=f"user:{user}",
        extended_hours=payload.extended_hours,
    )
    if order.status == OrderStatus.RISK_REJECTED:
        # Return 422 so frontend can show reason
        raise HTTPException(
            status_code=422,
            detail={"reason": order.reason, "risk_check": order.risk_check},
        )
    return order


@router.get("", response_model=list[OrderRead])
async def list_orders(
    limit: int = Query(default=50, le=500),
    status: OrderStatus | None = None,
    symbol: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[Order]:
    q = select(Order).order_by(Order.submitted_at.desc()).limit(limit)
    if status:
        q = q.where(Order.status == status)
    if symbol:
        q = q.where(Order.symbol == symbol.upper())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Order:
    result = await db.execute(select(Order).where(Order.id == order_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return o


@router.post("/{order_id}/sync", response_model=OrderRead)
async def sync(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> Order:
    """Force-sync order status from broker."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return await sync_order_status(db, o)
