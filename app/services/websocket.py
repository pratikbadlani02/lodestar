"""
WebSocket connection manager.

Pushes real-time updates to connected dashboards. Uses an in-memory
broadcast set; each FastAPI worker has its own. For multi-worker setup,
use Redis pub/sub instead.
"""
import asyncio
import json
from typing import Any

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.active.add(ws)
        logger.info("ws_connected", connections=len(self.active))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self.active.discard(ws)
        logger.info("ws_disconnected", connections=len(self.active))

    async def broadcast(self, event_type: str, data: Any) -> None:
        """Send event to all connected clients."""
        if not self.active:
            return

        msg = json.dumps({"type": event_type, "data": data}, default=str)
        async with self._lock:
            stale = set()
            for ws in self.active:
                try:
                    await ws.send_text(msg)
                except Exception:
                    stale.add(ws)
            self.active -= stale


manager = ConnectionManager()


async def emit(event_type: str, data: Any) -> None:
    """Convenience function callable from anywhere."""
    await manager.broadcast(event_type, data)
