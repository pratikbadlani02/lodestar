"""
All SQLAlchemy ORM models — v2.

New in v2:
  - strategies: stop_loss_pct, take_profit_pct, trailing_stop_pct, max_hold_days, timeframe
  - positions: strategy_id, stop_loss_price, take_profit_price, highest_price
  - strategy_performance: per-strategy daily P&L
  - optimizer_runs: parameter optimization runs
  - alerts: notifications/alerts log
  - webhook_events: Alpaca webhook payloads
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer,
    Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


# ═══ ENUMS ═══════════════════════════════════════════════════════════════════
class OrderSide(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, enum.Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderStatus(str, enum.Enum):
    PENDING_RISK = "pending_risk"
    RISK_REJECTED = "risk_rejected"
    SUBMITTED = "submitted"
    ACCEPTED = "accepted"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELED = "canceled"
    REJECTED = "rejected"
    EXPIRED = "expired"
    ERROR = "error"


class StrategyStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


class BacktestStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TradingMode(str, enum.Enum):
    PAPER = "paper"
    LIVE = "live"


# ═══ MARKET DATA ═════════════════════════════════════════════════════════════
class OHLCV(Base):
    __tablename__ = "ohlcv"
    time:      Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    symbol:    Mapped[str]      = mapped_column(String(20), primary_key=True)
    timeframe: Mapped[str]      = mapped_column(String(10), primary_key=True, default="1d")
    open:      Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    high:      Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    low:       Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    close:     Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    volume:    Mapped[Decimal]  = mapped_column(Numeric(30, 8), nullable=False)


# ═══ STRATEGIES ══════════════════════════════════════════════════════════════
class Strategy(Base):
    __tablename__ = "strategies"
    id:                Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name:              Mapped[str]           = mapped_column(String(100), unique=True, nullable=False)
    strategy_type:     Mapped[str]           = mapped_column(String(50), nullable=False)
    status:            Mapped[StrategyStatus] = mapped_column(Enum(StrategyStatus, name="strategystatus", create_type=False, values_callable=lambda x: [e.value for e in x]), default=StrategyStatus.PAUSED)
    symbols:           Mapped[list]          = mapped_column(JSON, default=list)
    params:            Mapped[dict]          = mapped_column(JSON, default=dict)
    position_size_pct: Mapped[Decimal]       = mapped_column(Numeric(5, 2), default=Decimal("5.00"))
    schedule_cron:     Mapped[str]           = mapped_column(String(100), default="*/5 9-16 * * 1-5")
    # v2 additions:
    stop_loss_pct:     Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3), nullable=True)
    take_profit_pct:   Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3), nullable=True)
    trailing_stop_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3), nullable=True)
    max_hold_days:     Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timeframe:         Mapped[str]           = mapped_column(String(10), default="1d")

    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    runs = relationship("StrategyRun", back_populates="strategy", cascade="all, delete-orphan")


class StrategyRun(Base):
    __tablename__ = "strategy_runs"
    id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    strategy_id:  Mapped[uuid.UUID] = mapped_column(ForeignKey("strategies.id", ondelete="CASCADE"))
    started_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    signals_generated: Mapped[int]  = mapped_column(Integer, default=0)
    orders_submitted:  Mapped[int]  = mapped_column(Integer, default=0)
    error:        Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details:      Mapped[dict]      = mapped_column(JSON, default=dict)

    strategy = relationship("Strategy", back_populates="runs")


class StrategyPerformance(Base):
    """Daily P&L snapshot per strategy."""
    __tablename__ = "strategy_performance"
    id:            Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    strategy_id:   Mapped[uuid.UUID] = mapped_column(ForeignKey("strategies.id", ondelete="CASCADE"))
    date:          Mapped[date]      = mapped_column(Date, nullable=False)
    realized_pl:   Mapped[Decimal]   = mapped_column(Numeric(20, 2), default=Decimal("0"))
    unrealized_pl: Mapped[Decimal]   = mapped_column(Numeric(20, 2), default=Decimal("0"))
    trades_count:  Mapped[int]       = mapped_column(Integer, default=0)
    win_count:     Mapped[int]       = mapped_column(Integer, default=0)
    loss_count:    Mapped[int]       = mapped_column(Integer, default=0)

    __table_args__ = (UniqueConstraint("strategy_id", "date", name="uq_strategy_date"),)


# ═══ ORDERS / POSITIONS ══════════════════════════════════════════════════════
class Order(Base):
    __tablename__ = "orders"
    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    client_order_id: Mapped[str]       = mapped_column(String(64), unique=True, nullable=False)
    broker_order_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    strategy_id:     Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("strategies.id"), nullable=True)
    mode:            Mapped[TradingMode] = mapped_column(Enum(TradingMode, name="tradingmode", create_type=False, values_callable=lambda x: [e.value for e in x]), nullable=False)
    symbol:          Mapped[str]       = mapped_column(String(20), nullable=False, index=True)
    side:            Mapped[OrderSide] = mapped_column(Enum(OrderSide, name="orderside", create_type=False, values_callable=lambda x: [e.value for e in x]), nullable=False)
    order_type:      Mapped[OrderType] = mapped_column(Enum(OrderType, name="ordertype", create_type=False, values_callable=lambda x: [e.value for e in x]), default=OrderType.MARKET)
    qty:             Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    limit_price:     Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    filled_qty:      Mapped[Decimal]   = mapped_column(Numeric(20, 8), default=Decimal("0"))
    avg_fill_price:  Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    status:          Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="orderstatus", create_type=False, values_callable=lambda x: [e.value for e in x]), default=OrderStatus.PENDING_RISK, index=True)
    time_in_force:   Mapped[str]       = mapped_column(String(10), nullable=False, default="day")
    risk_check:      Mapped[dict]      = mapped_column(JSON, default=dict)
    reason:          Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at:    Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    filled_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Position(Base):
    __tablename__ = "positions"
    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    symbol:          Mapped[str]       = mapped_column(String(20), unique=True, nullable=False)
    qty:             Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    avg_entry_price: Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    current_price:   Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    unrealized_pl:   Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    realized_pl:     Mapped[Decimal]   = mapped_column(Numeric(20, 8), default=Decimal("0"))
    opened_at:       Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # v2: stop loss tracking
    strategy_id:     Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("strategies.id"), nullable=True)
    stop_loss_price:   Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    take_profit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    highest_price:     Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)


# ═══ BACKTESTS ═══════════════════════════════════════════════════════════════
class Backtest(Base):
    __tablename__ = "backtests"
    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name:            Mapped[str]       = mapped_column(String(200), nullable=False)
    strategy_type:   Mapped[str]       = mapped_column(String(50), nullable=False)
    symbols:         Mapped[list]      = mapped_column(JSON, nullable=False)
    params:          Mapped[dict]      = mapped_column(JSON, default=dict)
    start_date:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    end_date:        Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    initial_capital: Mapped[Decimal]   = mapped_column(Numeric(20, 2), nullable=False)
    status:          Mapped[BacktestStatus] = mapped_column(Enum(BacktestStatus, name="backteststatus", create_type=False, values_callable=lambda x: [e.value for e in x]), default=BacktestStatus.PENDING)
    final_equity:    Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 2), nullable=True)
    total_return_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    sharpe_ratio:    Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    max_drawdown_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    win_rate_pct:    Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    total_trades:    Mapped[int]       = mapped_column(Integer, default=0)
    equity_curve:    Mapped[list]      = mapped_column(JSON, default=list)
    error:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trades = relationship("BacktestTrade", back_populates="backtest", cascade="all, delete-orphan")


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"
    id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    backtest_id:  Mapped[uuid.UUID] = mapped_column(ForeignKey("backtests.id", ondelete="CASCADE"))
    symbol:       Mapped[str]       = mapped_column(String(20), nullable=False)
    side:         Mapped[OrderSide] = mapped_column(Enum(OrderSide, name="orderside", create_type=False, values_callable=lambda x: [e.value for e in x]), nullable=False)
    entry_time:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    exit_time:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    entry_price:  Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    exit_price:   Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 8), nullable=True)
    qty:          Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    pnl:          Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 2), nullable=True)
    pnl_pct:      Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    reason:       Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    backtest = relationship("Backtest", back_populates="trades")


# ═══ NEW v2: OPTIMIZER ═══════════════════════════════════════════════════════
class OptimizerRun(Base):
    __tablename__ = "optimizer_runs"
    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name:            Mapped[str]       = mapped_column(String(200), nullable=False)
    strategy_type:   Mapped[str]       = mapped_column(String(50), nullable=False)
    symbols:         Mapped[list]      = mapped_column(JSON, nullable=False)
    param_grid:      Mapped[dict]      = mapped_column(JSON, nullable=False)
    start_date:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    end_date:        Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    initial_capital: Mapped[Decimal]   = mapped_column(Numeric(20, 2), nullable=False)
    status:          Mapped[str]       = mapped_column(String(20), default="pending")
    results:         Mapped[list]      = mapped_column(JSON, default=list)
    best_params:     Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    best_sharpe:     Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    error:           Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ═══ AUDIT, SNAPSHOTS, ALERTS ════════════════════════════════════════════════
class AuditLog(Base):
    __tablename__ = "audit_log"
    id:        Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    timestamp: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    actor:     Mapped[str]       = mapped_column(String(100), nullable=False)
    action:    Mapped[str]       = mapped_column(String(100), nullable=False, index=True)
    resource:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    details:   Mapped[dict]      = mapped_column(JSON, default=dict)
    success:   Mapped[bool]      = mapped_column(Boolean, default=True)


class AccountSnapshot(Base):
    __tablename__ = "account_snapshots"
    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    timestamp:       Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    mode:            Mapped[TradingMode] = mapped_column(Enum(TradingMode, name="tradingmode", create_type=False, values_callable=lambda x: [e.value for e in x]), nullable=False)
    cash:            Mapped[Decimal]   = mapped_column(Numeric(20, 2), nullable=False)
    equity:          Mapped[Decimal]   = mapped_column(Numeric(20, 2), nullable=False)
    buying_power:    Mapped[Decimal]   = mapped_column(Numeric(20, 2), nullable=False)
    positions_count: Mapped[int]       = mapped_column(Integer, default=0)
    day_pl:          Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 2), nullable=True)
    total_pl:        Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 2), nullable=True)


class Alert(Base):
    """Alerts/notifications log."""
    __tablename__ = "alerts"
    id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    timestamp:    Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    severity:     Mapped[str]       = mapped_column(String(20), nullable=False)
    category:     Mapped[str]       = mapped_column(String(50), nullable=False)
    title:        Mapped[str]       = mapped_column(String(200), nullable=False)
    message:      Mapped[str]       = mapped_column(Text, nullable=False)
    acknowledged: Mapped[bool]      = mapped_column(Boolean, default=False)
    metadata_json: Mapped[dict]     = mapped_column("metadata", JSON, default=dict)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    id:          Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    received_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    event_type:  Mapped[str]       = mapped_column(String(50), nullable=False)
    payload:     Mapped[dict]      = mapped_column(JSON, nullable=False)
    processed:   Mapped[bool]      = mapped_column(Boolean, default=False)


# ═══ WATCHLISTS ══════════════════════════════════════════════════════════════
class Watchlist(Base):
    __tablename__ = "watchlists"
    id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name:       Mapped[str]       = mapped_column(String(100), nullable=False)
    owner:      Mapped[str]       = mapped_column(String(100), nullable=False, index=True)
    symbols:    Mapped[list]      = mapped_column(JSON, default=list)
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ═══ PRICE ALERTS ════════════════════════════════════════════════════════════
class PriceAlert(Base):
    __tablename__ = "price_alerts"
    id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    owner:        Mapped[str]       = mapped_column(String(100), nullable=False, index=True)
    symbol:       Mapped[str]       = mapped_column(String(20), nullable=False)
    alert_type:   Mapped[str]       = mapped_column(String(20), nullable=False, default="price")  # price | volume | pct_change
    condition:    Mapped[str]       = mapped_column(String(10), nullable=False)  # above | below
    threshold:    Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    message:      Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    triggered:    Mapped[bool]      = mapped_column(Boolean, default=False)
    triggered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    username:     Mapped[str]       = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str]    = mapped_column(String(200), nullable=False)
    role:         Mapped[str]       = mapped_column(String(20), nullable=False, default="viewer")  # admin | viewer
    is_active:    Mapped[bool]      = mapped_column(Boolean, default=True)
    created_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())


# Indexes
Index("ix_ohlcv_symbol_time", OHLCV.symbol, OHLCV.time.desc())
