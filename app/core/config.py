"""
Central configuration with enterprise safety defaults.
Paper trading is REQUIRED to be explicitly disabled for live trading.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
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
    # Comma-separated list, e.g. "https://quant.onrender.com,https://example.com".
    # In dev, leave blank to fall back to the localhost defaults in main.py.
    cors_origins: str = ""

    # ── Security ───────────────────────────────────────────────
    secret_key: str = Field(default="change-me-use-openssl-rand-hex-32")
    access_token_expire_minutes: int = 60 * 24  # 24h
    admin_username: str = "admin"
    admin_password: str = "admin"

    # ── Database ───────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://quantuser:changeme@localhost/quantdb"
    database_url_sync: str = "postgresql+psycopg2://quantuser:changeme@localhost/quantdb"

    # ── Redis (control state + WebSocket pub/sub) ──────────────
    redis_url: str = "redis://localhost:6379/0"
    # Cap the shared connection pool so concurrent work (e.g. the sentiment
    # scanner fan-out) can't exceed a managed Redis provider's client limit
    # ("max number of clients reached"). Tune via REDIS_MAX_CONNECTIONS.
    redis_max_connections: int = 12

    # ── Alpaca Brokerage ───────────────────────────────────────
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    # ENTERPRISE SAFETY: paper URL is the default. Changing to live requires
    # BOTH (a) editing this URL and (b) setting ALPACA_LIVE_CONFIRMED=true
    alpaca_base_url: str = "https://paper-api.alpaca.markets"
    alpaca_data_url: str = "https://data.alpaca.markets"
    alpaca_live_confirmed: bool = False  # Must be explicitly set to enable live trading

    # ── Risk Management (HARD GUARDRAILS) ──────────────────────
    # These apply to BOTH paper and live trading.
    max_drawdown_pct: float = Field(default=5.0, ge=0.1, le=50.0)
    max_daily_loss_pct: float = Field(default=2.0, ge=0.1, le=20.0)
    max_position_size_pct: float = Field(default=10.0, ge=0.1, le=100.0)
    max_open_positions: int = Field(default=10, ge=1, le=100)
    max_orders_per_minute: int = Field(default=10, ge=1, le=200)

    # ── Trading control flags ──────────────────────────────────
    trading_enabled: bool = True  # Global kill switch (runtime override via API)
    strategies_enabled: bool = True  # Pause strategy execution globally

    # ── Email notifications (optional — leave blank to disable) ───
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_email_to: str = ""   # recipient address for critical alerts

    # ── Backtesting ────────────────────────────────────────────
    backtest_default_capital: float = 100_000.0
    backtest_commission_per_trade: float = 0.0  # Alpaca is commission-free
    backtest_slippage_bps: float = 2.0  # basis points

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if v in ("change-me-use-openssl-rand-hex-32", "change-me-run-openssl-rand-hex-32"):
            import warnings
            warnings.warn(
                "SECURITY: Using default SECRET_KEY. "
                "Generate one with: openssl rand -hex 32",
                UserWarning,
            )
        return v

    @field_validator("database_url")
    @classmethod
    def coerce_async_database_url(cls, v: str) -> str:
        # Render / Heroku-style "postgres://..." URLs need the async driver suffix
        # for SQLAlchemy's asyncpg dialect to pick them up.
        if v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v[len("postgres://"):]
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    @field_validator("database_url_sync")
    @classmethod
    def coerce_sync_database_url(cls, v: str) -> str:
        if v.startswith("postgres://"):
            v = "postgresql+psycopg2://" + v[len("postgres://"):]
        elif v.startswith("postgresql://") and "+psycopg2" not in v:
            v = "postgresql+psycopg2://" + v[len("postgresql://"):]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        if not self.cors_origins.strip():
            return [
                "http://localhost", "http://localhost:3000",
                "http://localhost:5173", "http://localhost:8080",
                "http://127.0.0.1:8080",
            ]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_live_trading(self) -> bool:
        """True only if URL is live AND explicit confirmation flag set."""
        return (
            "paper" not in self.alpaca_base_url.lower()
            and self.alpaca_live_confirmed is True
        )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
