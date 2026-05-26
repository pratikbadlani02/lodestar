"""WebSocket endpoint for real-time updates and Alpaca webhook receiver."""
from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.logging import get_logger
from app.core.models import WebhookEvent
from app.services.websocket import manager

logger = get_logger(__name__)

router = APIRouter(tags=["Realtime"])


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Real-time updates: positions, orders, alerts, equity changes."""
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive — clients send pings
            await ws.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception as e:
        logger.error("ws_error", error=str(e))
        await manager.disconnect(ws)


@router.post("/webhooks/alpaca")
async def alpaca_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Alpaca webhook receiver.
    Records event for async processing by Celery worker.
    """
    payload = await request.json()
    event_type = payload.get("event", "unknown")

    we = WebhookEvent(event_type=event_type, payload=payload)
    db.add(we)
    await db.flush()

    # Broadcast immediately to connected dashboards
    if event_type in ("fill", "partial_fill", "new", "canceled"):
        await manager.broadcast("order_event", {"event": event_type, **payload})

    logger.info("webhook_received", event_type=event_type)
    return {"received": True, "event_id": str(we.id)}
