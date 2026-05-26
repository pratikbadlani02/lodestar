"""Pydantic v2 schemas for API I/O."""
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.models import (
    BacktestStatus,
    OrderSide,
    OrderStatus,
    OrderType,
    StrategyStatus,
    TradingMode,
)



# ── Auth ────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Strategy ────────────────────────────────────────────────────────────────
class StrategyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    strategy_type: str  # sma_crossover | rsi_mean_reversion | atr_breakout
    symbols: list[str] = Field(..., min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)
    position_size_pct: Decimal = Field(default=Decimal("5.00"), gt=0, le=100)
    schedule_cron: str = "*/5 9-16 * * 1-5"


class StrategyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    status: Optional[StrategyStatus] = None
    symbols: Optional[list[str]] = None
    params: Optional[dict[str, Any]] = None
    position_size_pct: Optional[Decimal] = None
    schedule_cron: Optional[str] = None
    stop_loss_pct: Optional[Decimal] = None
    take_profit_pct: Optional[Decimal] = None
    trailing_stop_pct: Optional[Decimal] = None
    max_hold_days: Optional[int] = None
    timeframe: Optional[str] = None


class StrategyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    strategy_type: str
    status: StrategyStatus
    symbols: list[str]
    params: dict[str, Any]
    position_size_pct: Decimal
    schedule_cron: str
    stop_loss_pct: Optional[Decimal]
    take_profit_pct: Optional[Decimal]
    trailing_stop_pct: Optional[Decimal]
    max_hold_days: Optional[int]
    timeframe: str
    created_at: datetime
    updated_at: datetime


# ── Orders ──────────────────────────────────────────────────────────────────
class OrderCreate(BaseModel):
    symbol: str
    side: OrderSide
    qty: Decimal = Field(..., gt=0)
    order_type: OrderType = OrderType.MARKET
    limit_price: Optional[Decimal] = Field(default=None, gt=0)
    stop_price: Optional[Decimal] = Field(default=None, gt=0)
    time_in_force: str = Field(default="day", pattern="^(day|gtc|ioc|fok|opg)$")
    extended_hours: bool = False


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_order_id: str
    broker_order_id: Optional[str]
    strategy_id: Optional[UUID]
    mode: TradingMode
    symbol: str
    side: OrderSide
    order_type: OrderType
    qty: Decimal
    limit_price: Optional[Decimal]
    filled_qty: Decimal
    avg_fill_price: Optional[Decimal]
    time_in_force: str
    status: OrderStatus
    reason: Optional[str]
    submitted_at: datetime
    filled_at: Optional[datetime]


# ── Positions ───────────────────────────────────────────────────────────────
class PositionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    qty: Decimal
    avg_entry_price: Decimal
    current_price: Optional[Decimal]
    unrealized_pl: Optional[Decimal]
    realized_pl: Decimal
    opened_at: datetime


# ── Account ─────────────────────────────────────────────────────────────────
class AccountRead(BaseModel):
    mode: TradingMode
    cash: Decimal
    equity: Decimal
    buying_power: Decimal
    positions_count: int
    day_pl: Optional[Decimal]
    total_pl: Optional[Decimal]
    trading_enabled: bool
    strategies_enabled: bool


# ── Backtest ────────────────────────────────────────────────────────────────
class BacktestCreate(BaseModel):
    name: str
    strategy_type: str
    symbols: list[str] = Field(..., min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal = Field(default=Decimal("100000"), gt=0)


class BacktestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    strategy_type: str
    symbols: list[str]
    params: dict[str, Any]
    start_date: datetime
    end_date: datetime
    initial_capital: Decimal
    status: BacktestStatus
    final_equity: Optional[Decimal]
    total_return_pct: Optional[Decimal]
    sharpe_ratio: Optional[Decimal]
    max_drawdown_pct: Optional[Decimal]
    win_rate_pct: Optional[Decimal]
    total_trades: int
    equity_curve: list[dict[str, Any]]
    error: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


class BacktestTradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    side: OrderSide
    entry_time: datetime
    exit_time: Optional[datetime]
    entry_price: Decimal
    exit_price: Optional[Decimal]
    qty: Decimal
    pnl: Optional[Decimal]
    pnl_pct: Optional[Decimal]
    reason: Optional[str]


# ── Control ─────────────────────────────────────────────────────────────────
class ControlState(BaseModel):
    trading_enabled: bool
    strategies_enabled: bool
    mode: TradingMode
    is_live: bool


class KillSwitchRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


# ── Health ──────────────────────────────────────────────────────────────────
class HealthCheck(BaseModel):
    status: str
    service: str
    latency_ms: Optional[float] = None


class HealthOverview(BaseModel):
    status: str
    timestamp: datetime
    checks: dict[str, HealthCheck]


# ── Watchlists ───────────────────────────────────────────────────────────────
class WatchlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    symbols: list[str] = Field(default_factory=list)


class WatchlistUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    symbols: Optional[list[str]] = None


class WatchlistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    owner: str
    symbols: list[str]
    created_at: datetime
    updated_at: datetime


# ── Price Alerts ─────────────────────────────────────────────────────────────
class PriceAlertCreate(BaseModel):
    symbol: str
    alert_type: str = Field(default="price", pattern="^(price|volume|pct_change)$")
    condition: str = Field(..., pattern="^(above|below)$")
    threshold: Decimal = Field(..., gt=0)
    message: Optional[str] = None


class PriceAlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner: str
    symbol: str
    alert_type: str
    condition: str
    threshold: Decimal
    message: Optional[str]
    triggered: bool
    triggered_at: Optional[datetime]
    created_at: datetime


# ── Users ────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    role: str = Field(default="viewer", pattern="^(admin|viewer)$")


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    role: str
    is_active: bool
    created_at: datetime
