"""Shared async Redis client.

Lives here (not in services/) because in the public-viewer build Redis is
only used as a JSON cache for fundamentals — there are no trading/control
flags to wrap.
"""
from __future__ import annotations

from redis import asyncio as aioredis

from app.core.config import settings

_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = await aioredis.from_url(
            settings.redis_url, decode_responses=True,
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
