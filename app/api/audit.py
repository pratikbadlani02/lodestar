"""Audit log viewer."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import AuditLog
from app.core.security import get_current_user

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("")
async def list_audit(
    limit: int = Query(default=100, le=1000),
    action: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
) -> list[dict]:
    q = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    if action:
        q = q.where(AuditLog.action == action)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "timestamp": r.timestamp.isoformat(),
            "actor": r.actor,
            "action": r.action,
            "resource": r.resource,
            "details": r.details,
            "success": r.success,
        }
        for r in rows
    ]
