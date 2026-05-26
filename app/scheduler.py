"""
In-process scheduler — replaces the Celery beat process.

APScheduler's AsyncIOScheduler runs inside the FastAPI event loop, so periodic
jobs share the same DB pool, broker HTTP client, and Redis connection as the
HTTP request path. No separate worker process needed.

Trade-offs to be aware of:
- On Render's free tier the web service sleeps after 15min idle; while asleep
  the scheduler does not run. Use an external pinger (cron-job.org) hitting
  /api/health every 10min during market hours, or upgrade to a paid plan.
- coalesce=True + max_instances=1: if a tick is missed (e.g. during a deploy)
  we collapse the backlog into a single run rather than firing N times in a row.
- Single instance only. If you ever scale the web service horizontally, you'd
  need a Redis leader-lock so the scheduler only runs in one replica.
"""
from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.logging import get_logger
from app.tasks import (
    check_price_alerts,
    compute_strategy_pnl,
    fetch_market_data,
    monitor_open_positions,
    run_active_strategies,
    snapshot_account,
    sync_open_orders,
)

logger = get_logger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _job_defaults() -> dict:
    return {
        "coalesce": True,         # collapse missed runs into a single fire
        "max_instances": 1,       # never overlap the same job with itself
        "misfire_grace_time": 30, # forgive 30s of lag before skipping a tick
    }


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(
            timezone="UTC",
            job_defaults=_job_defaults(),
        )
    return _scheduler


def register_jobs(scheduler: AsyncIOScheduler) -> None:
    """Replicates the schedule that used to live in app/worker.py beat config."""

    scheduler.add_job(
        run_active_strategies,
        IntervalTrigger(seconds=60),
        id="run_active_strategies",
        name="Run active strategies (every 60s)",
        replace_existing=True,
    )
    scheduler.add_job(
        monitor_open_positions,
        IntervalTrigger(seconds=30),
        id="monitor_open_positions",
        name="Monitor positions / stop-loss / take-profit (every 30s)",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_open_orders,
        IntervalTrigger(seconds=30),
        id="sync_open_orders",
        name="Sync open orders with broker (every 30s)",
        replace_existing=True,
    )
    scheduler.add_job(
        snapshot_account,
        IntervalTrigger(minutes=5),
        id="snapshot_account",
        name="Account equity snapshot (every 5min)",
        replace_existing=True,
    )
    scheduler.add_job(
        check_price_alerts,
        IntervalTrigger(seconds=60),
        id="check_price_alerts",
        name="Check user price alerts (every 60s)",
        replace_existing=True,
    )
    scheduler.add_job(
        fetch_market_data,
        CronTrigger(minute=5),  # at :05 of every hour
        id="fetch_market_data",
        name="Refresh market data (hourly @ :05)",
        replace_existing=True,
    )
    scheduler.add_job(
        compute_strategy_pnl,
        CronTrigger(hour=21, minute=30),  # 21:30 UTC — after US close
        id="compute_strategy_pnl",
        name="Compute strategy P&L (daily 21:30 UTC)",
        replace_existing=True,
    )


def start() -> AsyncIOScheduler:
    sch = get_scheduler()
    if sch.running:
        return sch
    register_jobs(sch)
    sch.start()
    logger.info("scheduler_started", jobs=[j.id for j in sch.get_jobs()])
    return sch


async def shutdown() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        # wait=False so a slow job can't block app shutdown.
        _scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
    _scheduler = None
