"""
Runtime control state backed by Redis.

Provides a persistent kill switch that survives restarts. If the
trading_enabled flag is false, NO orders will be submitted regardless
of strategy signals or manual API calls.
"""
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

KEY_TRADING_ENABLED = "control:trading_enabled"
KEY_STRATEGIES_ENABLED = "control:strategies_enabled"
KEY_KILL_REASON = "control:kill_reason"

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=10,
            socket_timeout=10,
        )
    return _redis


async def init_control_state() -> None:
    """Set default values on startup if not set."""
    r = await get_redis()
    if not await r.exists(KEY_TRADING_ENABLED):
        await r.set(KEY_TRADING_ENABLED, "1" if settings.trading_enabled else "0")
    if not await r.exists(KEY_STRATEGIES_ENABLED):
        await r.set(KEY_STRATEGIES_ENABLED, "1" if settings.strategies_enabled else "0")


async def is_trading_enabled() -> bool:
    r = await get_redis()
    val = await r.get(KEY_TRADING_ENABLED)
    return val == "1"


async def is_strategies_enabled() -> bool:
    r = await get_redis()
    val = await r.get(KEY_STRATEGIES_ENABLED)
    return val == "1"


async def set_trading_enabled(enabled: bool, reason: str = "") -> None:
    r = await get_redis()
    await r.set(KEY_TRADING_ENABLED, "1" if enabled else "0")
    if not enabled and reason:
        await r.set(KEY_KILL_REASON, reason)
    logger.warning("trading_enabled_changed", enabled=enabled, reason=reason)


async def set_strategies_enabled(enabled: bool) -> None:
    r = await get_redis()
    await r.set(KEY_STRATEGIES_ENABLED, "1" if enabled else "0")
    logger.warning("strategies_enabled_changed", enabled=enabled)


async def get_kill_reason() -> str | None:
    r = await get_redis()
    return await r.get(KEY_KILL_REASON)


async def check_redis() -> float:
    """Returns latency in ms."""
    import time

    r = await get_redis()
    start = time.perf_counter()
    await r.ping()
    return round((time.perf_counter() - start) * 1000, 2)
