"""Health check endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.db import check_db
from app.core.schemas import HealthCheck, HealthOverview
from app.services.broker import AlpacaError, get_broker

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthOverview)
async def health_overview() -> HealthOverview:
    checks: dict[str, HealthCheck] = {}

    try:
        latency = await check_db()
        checks["database"] = HealthCheck(status="ok", service="postgresql", latency_ms=latency)
    except Exception:
        checks["database"] = HealthCheck(status="fail", service="postgresql", latency_ms=None)

    try:
        broker = get_broker()
        await broker.get_clock()
        checks["broker"] = HealthCheck(status="ok", service="alpaca")
    except AlpacaError:
        checks["broker"] = HealthCheck(status="fail", service="alpaca")
    except Exception:
        checks["broker"] = HealthCheck(status="unknown", service="alpaca")

    overall = "ok" if all(c.status == "ok" for c in checks.values()) else "degraded"
    return HealthOverview(
        status=overall,
        timestamp=datetime.now(timezone.utc),
        checks=checks,
    )


@router.get("/live")
async def liveness() -> dict:
    """Lightweight liveness probe — no dependencies."""
    return {"status": "alive", "timestamp": datetime.now(timezone.utc).isoformat()}
