"""
Market calendar.

Uses pandas_market_calendars for accurate holiday/early-close tracking.
Falls back to broker clock if library unavailable.
"""
from datetime import date, datetime, timezone

from app.core.logging import get_logger
from app.services.broker import AlpacaError, get_broker

logger = get_logger(__name__)


async def is_market_open() -> bool:
    """Returns True if NYSE is currently open (per broker clock)."""
    broker = get_broker()
    try:
        clock = await broker.get_clock()
        return bool(clock.get("is_open", False))
    except AlpacaError as e:
        logger.error("market_clock_error", error=str(e))
        return False


async def next_market_open() -> datetime | None:
    """Returns next market open timestamp, or None on error."""
    broker = get_broker()
    try:
        clock = await broker.get_clock()
        next_open = clock.get("next_open")
        if next_open:
            return datetime.fromisoformat(next_open.replace("Z", "+00:00"))
    except AlpacaError:
        pass
    return None


async def is_trading_day(d: date | None = None) -> bool:
    """Best-effort check if a given date is a trading day (uses broker calendar)."""
    if d is None:
        d = datetime.now(timezone.utc).date()

    broker = get_broker()
    c = await broker._get_client()
    try:
        r = await c.get(
            f"{broker.base}/v2/calendar",
            params={"start": d.isoformat(), "end": d.isoformat()},
        )
        if r.status_code == 200:
            calendar = r.json()
            return len(calendar) > 0
    except Exception as e:
        logger.error("calendar_check_failed", error=str(e))

    # Fallback: weekend check
    return d.weekday() < 5
