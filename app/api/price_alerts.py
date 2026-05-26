"""Price alert CRUD — create, list, delete user-defined price triggers."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import PriceAlert
from app.core.schemas import PriceAlertCreate, PriceAlertRead
from app.core.security import get_current_user

router = APIRouter(prefix="/price-alerts", tags=["Price Alerts"])


@router.post("", response_model=PriceAlertRead, status_code=201)
async def create_price_alert(
    payload: PriceAlertCreate,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> PriceAlert:
    alert = PriceAlert(
        owner=user,
        symbol=payload.symbol.upper(),
        condition=payload.condition,
        threshold=payload.threshold,
        message=payload.message,
    )
    db.add(alert)
    await db.flush()
    await db.refresh(alert)
    return alert


@router.get("", response_model=list[PriceAlertRead])
async def list_price_alerts(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[PriceAlert]:
    result = await db.execute(
        select(PriceAlert)
        .where(PriceAlert.owner == user)
        .order_by(PriceAlert.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/{alert_id}", status_code=204)
async def delete_price_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> None:
    result = await db.execute(select(PriceAlert).where(PriceAlert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert or alert.owner != user:
        raise HTTPException(status_code=404, detail="Price alert not found")
    await db.delete(alert)
    await db.flush()
