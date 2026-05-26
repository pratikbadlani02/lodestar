"""
Central configuration for the public market-data viewer build.

No auth, no trading flags, no risk limits — just the bits we need to talk
to Postgres, Redis (for caching), and Alpaca's market-data API.
"""
import os
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Environment ────────────────────────────────────────────
    app_env: Literal["development", "production"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"
    # Comma-separated list of allowed origins. Empty falls back to localhost.
    cors_origins: str = ""

    # ── Database ───────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://quantuser:changeme@localhost/quantdb"
    database_url_sync: str = "postgresql+psycopg2://quantuser:changeme@localhost/quantdb"

    # ── Redis (used purely as a JSON cache for fundamentals) ──
    redis_url: str = "redis://localhost:6379/0"

    # ── Alpaca market-data ─────────────────────────────────────
    # Only the data API is used; trading endpoints are not called.
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets"
    alpaca_data_url: str = "https://data.alpaca.markets"

    # ── Error tracking (optional) ──────────────────────────────
    sentry_dsn: str = ""

    # Database URL normalisation — Render / Heroku style URLs need the
    # async / sync driver suffix.
    def model_post_init(self, __context) -> None:
        if self.database_url.startswith("postgres://"):
            self.database_url = "postgresql+asyncpg://" + self.database_url[len("postgres://"):]
        elif self.database_url.startswith("postgresql://") and "+asyncpg" not in self.database_url:
            self.database_url = "postgresql+asyncpg://" + self.database_url[len("postgresql://"):]
        if self.database_url_sync.startswith("postgres://"):
            self.database_url_sync = "postgresql+psycopg2://" + self.database_url_sync[len("postgres://"):]
        elif self.database_url_sync.startswith("postgresql://") and "+psycopg2" not in self.database_url_sync:
            self.database_url_sync = "postgresql+psycopg2://" + self.database_url_sync[len("postgresql://"):]

    @property
    def cors_origin_list(self) -> list[str]:
        if not self.cors_origins.strip():
            return [
                "http://localhost", "http://localhost:3000",
                "http://localhost:5173", "http://localhost:8080",
                "http://127.0.0.1:8080",
            ]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
