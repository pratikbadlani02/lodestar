"""
Market calendar — market-aware open/closed + trading-day checks.

US (NYSE/Nasdaq) uses the Alpaca clock/calendar as the source of truth.
India (NSE) is computed locally: regular session 09:15–15:30 IST, Mon–Fri,
excluding a static NSE trading-holiday list (no live Indian broker is wired in).

All functions accept a ``market`` argument and default to US so existing callers
keep working unchanged.
"""
from datetime import date, datetime, time, timedelta, timezone

from app.core.logging import get_logger
from app.core.markets import Market, get_market
from app.services.broker import AlpacaError, get_broker

logger = get_logger(__name__)

# IST is a fixed offset (no DST).
_IST = timezone(timedelta(hours=5, minutes=30))
_NSE_OPEN = time(9, 15)
_NSE_CLOSE = time(15, 30)

# NSE full-day trading holidays (extend yearly). Kept intentionally simple —
# weekend handling is automatic; this only needs weekday holidays.
_NSE_HOLIDAYS_2025 = {
    "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10", "2025-04-14",
    "2025-04-18", "2025-05-01", "2025-08-15", "2025-08-27", "2025-10-02",
    "2025-10-21", "2025-10-22", "2025-11-05", "2025-12-25",
}
_NSE_HOLIDAYS_2026 = {
    "2026-01-26", "2026-03-06", "2026-03-25", "2026-04-01", "2026-04-03",
    "2026-04-14", "2026-05-01", "2026-08-15", "2026-10-02", "2026-11-10",
    "2026-12-25",
}
_NSE_HOLIDAYS = _NSE_HOLIDAYS_2025 | _NSE_HOLIDAYS_2026


def _nse_is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d.isoformat() not in _NSE_HOLIDAYS


def _nse_is_open(now_utc: datetime | None = None) -> bool:
    now = (now_utc or datetime.now(timezone.utc)).astimezone(_IST)
    if not _nse_is_trading_day(now.date()):
        return False
    return _NSE_OPEN <= now.time() <= _NSE_CLOSE


def _nse_next_open(now_utc: datetime | None = None) -> datetime:
    now = (now_utc or datetime.now(timezone.utc)).astimezone(_IST)
    candidate = now
    # If we're before today's open and it's a trading day, that's the next open.
    if _nse_is_trading_day(now.date()) and now.time() < _NSE_OPEN:
        target = now.date()
    else:
        target = now.date() + timedelta(days=1)
        while not _nse_is_trading_day(target):
            target += timedelta(days=1)
    open_ist = datetime.combine(target, _NSE_OPEN, tzinfo=_IST)
    return open_ist.astimezone(timezone.utc)


async def is_market_open(market: "Market | str" = Market.US) -> bool:
    """True if the given market is currently open."""
    if get_market(market) == Market.IN:
        return _nse_is_open()
    broker = get_broker()
    try:
        clock = await broker.get_clock()
        return bool(clock.get("is_open", False))
    except AlpacaError as e:
        logger.error("market_clock_error", error=str(e))
        return False


async def next_market_open(market: "Market | str" = Market.US) -> datetime | None:
    """Next open timestamp (UTC) for the given market, or None on error."""
    if get_market(market) == Market.IN:
        return _nse_next_open()
    broker = get_broker()
    try:
        clock = await broker.get_clock()
        next_open = clock.get("next_open")
        if next_open:
            return datetime.fromisoformat(next_open.replace("Z", "+00:00"))
    except AlpacaError:
        pass
    return None


async def is_trading_day(
    market: "Market | str" = Market.US, d: date | None = None
) -> bool:
    """Best-effort: is the given date a trading day for the market."""
    if d is None:
        d = datetime.now(timezone.utc).date()

    if get_market(market) == Market.IN:
        return _nse_is_trading_day(d)

    broker = get_broker()
    c = await broker._get_client()
    try:
        r = await c.get(
            f"{broker.base}/v2/calendar",
            params={"start": d.isoformat(), "end": d.isoformat()},
        )
        if r.status_code == 200:
            return len(r.json()) > 0
    except Exception as e:
        logger.error("calendar_check_failed", error=str(e))

    # Fallback: weekend check
    return d.weekday() < 5
