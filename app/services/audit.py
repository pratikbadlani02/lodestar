"""Audit logging service — every sensitive action recorded to DB."""
import decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.models import AuditLog

logger = get_logger(__name__)


def _json_safe(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, decimal.Decimal):
        return str(obj)
    return obj


async def audit(
    db: AsyncSession,
    actor: str,
    action: str,
    resource: str | None = None,
    details: dict[str, Any] | None = None,
    success: bool = True,
) -> None:
    """Record an auditable action to both DB and structured logs."""
    safe_details = _json_safe(details or {})
    entry = AuditLog(
        actor=actor,
        action=action,
        resource=resource,
        details=safe_details,
        success=success,
    )
    db.add(entry)
    await db.flush()
    logger.info(
        "audit",
        actor=actor,
        action=action,
        resource=resource,
        details=safe_details,
        success=success,
    )
