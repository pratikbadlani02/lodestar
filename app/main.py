"""FastAPI main entrypoint — public market-data viewer."""
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import health, market
from app.core.config import settings
from app.core.db import engine
from app.core.logging import configure_logging, get_logger
from app.services.broker import get_broker

configure_logging()
logger = get_logger(__name__)

# Initialize Sentry early so exceptions during app construction are captured.
# A blank DSN is a no-op — safe default in dev.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.0,
        send_default_pii=False,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
            AsyncioIntegration(),
        ],
    )
    logger.info("sentry_enabled")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", env=settings.app_env)
    yield
    logger.info("shutdown")
    await get_broker().close()
    await engine.dispose()


_is_prod = settings.app_env == "production"

app = FastAPI(
    title="Lodestar",
    description="Public market-data viewer",
    version="3.0.0",
    lifespan=lifespan,
    # Docs / OpenAPI schema disabled in production to reduce surface area.
    docs_url=None if _is_prod else "/api/docs",
    redoc_url=None if _is_prod else "/api/redoc",
    openapi_url=None if _is_prod else "/api/openapi.json",
)


# ── Security headers ──────────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Defense-in-depth headers applied to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if _is_prod:
            h["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains"
            h["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "connect-src 'self' wss: https:; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False, allow_methods=["GET"], allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_handler(request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", error=str(exc), path=str(request.url))
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": str(exc)},
    )


# Only two routers in the public build: health + market data.
for r in [health.router, market.router]:
    app.include_router(r, prefix="/api")


# ── Static frontend (built React dashboard) ─────────────────────────────────
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir() and (_FRONTEND_DIST / "index.html").is_file():
    _INDEX = _FRONTEND_DIST / "index.html"
    app.mount(
        "/assets",
        StaticFiles(directory=str(_FRONTEND_DIST / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Unmatched /api/* paths should 404 rather than silently returning
        # the SPA shell — otherwise consumers think a deleted endpoint
        # "works."
        if full_path.startswith("api/") or full_path.startswith("api"):
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "path": "/" + full_path},
            )
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_INDEX)
else:
    @app.get("/")
    async def root() -> dict:
        return {
            "service": "lodestar",
            "version": "3.0.0",
            "mode": "public-viewer",
            "docs": app.docs_url,
        }
