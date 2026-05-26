"""FastAPI main entrypoint — v2 with WebSocket, webhooks, analytics."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import account, audit, auth, backtests, control, health, market, orders, strategies
from app.api import realtime, watchlists, price_alerts, users
from app.api.analytics import router as analytics_router, alerts_router, optimizer_router, export_router
from app.core.config import settings
from app.core.db import engine
from app.core.logging import configure_logging, get_logger
from app.scheduler import shutdown as scheduler_shutdown, start as scheduler_start
from app.services.broker import get_broker
from app.services.control import init_control_state

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", env=settings.app_env, is_live=settings.is_live_trading)
    if settings.is_live_trading:
        logger.critical("LIVE_TRADING_ENABLED", message="⚠️  LIVE TRADING IS ACTIVE")
    else:
        logger.info("paper_trading_mode")
    await init_control_state()
    scheduler_start()
    yield
    logger.info("shutdown")
    await scheduler_shutdown()
    await get_broker().close()
    await engine.dispose()


app = FastAPI(
    title="Lodestar",
    description="Autonomous quantitative trading platform",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_handler(request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", error=str(exc), path=str(request.url))
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": str(exc)},
    )


# Mount all routers under /api
for r in [
    auth.router, health.router, strategies.router, orders.router,
    account.router, backtests.router, control.router, market.router,
    audit.router,
    # v2:
    analytics_router, alerts_router, optimizer_router, export_router,
    realtime.router,
    # v3 (Webull features):
    watchlists.router, price_alerts.router, users.router,
]:
    app.include_router(r, prefix="/api")


# ── Static frontend (built React dashboard) ─────────────────────────────────
# Mounted LAST so it can't shadow /api/* routes. In dev/CI the dist dir may
# not exist — fall back to a JSON identity response in that case.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir() and (_FRONTEND_DIST / "index.html").is_file():
    _INDEX = _FRONTEND_DIST / "index.html"

    # Serve hashed assets directly (cache-friendly), then SPA fallback below.
    app.mount(
        "/assets",
        StaticFiles(directory=str(_FRONTEND_DIST / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Any non-API path: try the literal file, else serve index.html so the
        # React router can handle client-side routes.
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_INDEX)
else:
    @app.get("/")
    async def root() -> dict:
        return {
            "service": "lodestar",
            "version": "2.0.0",
            "mode": "live" if settings.is_live_trading else "paper",
            "docs": "/api/docs",
        }
