"""Initial schema: all tables + TimescaleDB hypertable

Revision ID: 0001
Create Date: 2025-01-01 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON, UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Enums defined ONCE here — SQLAlchemy auto-creates them on first use.
# Do NOT also call op.execute("CREATE TYPE ...") — that causes DuplicateObjectError.
orderside_enum      = sa.Enum("buy", "sell",                                name="orderside")
ordertype_enum      = sa.Enum("market", "limit", "stop",                    name="ordertype")
orderstatus_enum    = sa.Enum("pending_risk","risk_rejected","submitted","accepted",
                               "partially_filled","filled","canceled","rejected","expired","error",
                               name="orderstatus")
strategystatus_enum = sa.Enum("active", "paused", "disabled",               name="strategystatus")
backteststatus_enum = sa.Enum("pending", "running", "completed", "failed",  name="backteststatus")
tradingmode_enum    = sa.Enum("paper", "live",                              name="tradingmode")


def upgrade() -> None:
    # ── OHLCV hypertable ─────────────────────────────────────────────────
    op.create_table(
        "ohlcv",
        sa.Column("time",      sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol",    sa.String(20),              nullable=False),
        sa.Column("timeframe", sa.String(10),              nullable=False, server_default="1d"),
        sa.Column("open",      sa.Numeric(20, 8),          nullable=False),
        sa.Column("high",      sa.Numeric(20, 8),          nullable=False),
        sa.Column("low",       sa.Numeric(20, 8),          nullable=False),
        sa.Column("close",     sa.Numeric(20, 8),          nullable=False),
        sa.Column("volume",    sa.Numeric(30, 8),          nullable=False),
        sa.PrimaryKeyConstraint("time", "symbol", "timeframe"),
    )
    op.create_index("ix_ohlcv_symbol_time", "ohlcv", ["symbol", sa.text("time DESC")])
    # Convert to a TimescaleDB hypertable when the extension is available
    # (local dev). On vanilla Postgres (e.g. Render free tier) the extension
    # isn't installed — fall back to the plain table, which still works,
    # just without the chunking optimisation.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'
            ) THEN
                CREATE EXTENSION IF NOT EXISTS timescaledb;
                PERFORM create_hypertable(
                    'ohlcv', by_range('time', INTERVAL '7 days'),
                    if_not_exists => TRUE
                );
            END IF;
        END
        $$;
        """
    )

    # ── Strategies ───────────────────────────────────────────────────────
    op.create_table(
        "strategies",
        sa.Column("id",                UUID(as_uuid=True),   primary_key=True),
        sa.Column("name",              sa.String(100),        nullable=False, unique=True),
        sa.Column("strategy_type",     sa.String(50),         nullable=False),
        sa.Column("status",            strategystatus_enum,   nullable=False, server_default="paused"),
        sa.Column("symbols",           JSON,                  nullable=False),
        sa.Column("params",            JSON,                  nullable=False),
        sa.Column("position_size_pct", sa.Numeric(5, 2),      nullable=False, server_default="5.00"),
        sa.Column("schedule_cron",     sa.String(100),        nullable=False, server_default="*/5 9-16 * * 1-5"),
        sa.Column("created_at",        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "strategy_runs",
        sa.Column("id",                UUID(as_uuid=True),   primary_key=True),
        sa.Column("strategy_id",       UUID(as_uuid=True),   sa.ForeignKey("strategies.id", ondelete="CASCADE")),
        sa.Column("started_at",        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("signals_generated", sa.Integer(),          nullable=False, server_default="0"),
        sa.Column("orders_submitted",  sa.Integer(),          nullable=False, server_default="0"),
        sa.Column("error",             sa.Text(),             nullable=True),
        sa.Column("details",           JSON,                  nullable=False, server_default="{}"),
    )

    # ── Orders ───────────────────────────────────────────────────────────
    op.create_table(
        "orders",
        sa.Column("id",              UUID(as_uuid=True),   primary_key=True),
        sa.Column("client_order_id", sa.String(64),        nullable=False, unique=True),
        sa.Column("broker_order_id", sa.String(64),        nullable=True,  unique=True),
        sa.Column("strategy_id",     UUID(as_uuid=True),   sa.ForeignKey("strategies.id"), nullable=True),
        sa.Column("mode",            tradingmode_enum,     nullable=False),
        sa.Column("symbol",          sa.String(20),        nullable=False),
        sa.Column("side",            orderside_enum,       nullable=False),
        sa.Column("order_type",      ordertype_enum,       nullable=False, server_default="market"),
        sa.Column("qty",             sa.Numeric(20, 8),    nullable=False),
        sa.Column("limit_price",     sa.Numeric(20, 8),    nullable=True),
        sa.Column("filled_qty",      sa.Numeric(20, 8),    nullable=False, server_default="0"),
        sa.Column("avg_fill_price",  sa.Numeric(20, 8),    nullable=True),
        sa.Column("status",          orderstatus_enum,     nullable=False, server_default="pending_risk"),
        sa.Column("risk_check",      JSON,                 nullable=False, server_default="{}"),
        sa.Column("reason",          sa.Text(),            nullable=True),
        sa.Column("submitted_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("filled_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at",     sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_orders_symbol",       "orders", ["symbol"])
    op.create_index("ix_orders_status",       "orders", ["status"])
    op.create_index("ix_orders_submitted_at", "orders", [sa.text("submitted_at DESC")])

    # ── Positions ────────────────────────────────────────────────────────
    op.create_table(
        "positions",
        sa.Column("id",              UUID(as_uuid=True),   primary_key=True),
        sa.Column("symbol",          sa.String(20),        nullable=False, unique=True),
        sa.Column("qty",             sa.Numeric(20, 8),    nullable=False),
        sa.Column("avg_entry_price", sa.Numeric(20, 8),    nullable=False),
        sa.Column("current_price",   sa.Numeric(20, 8),    nullable=True),
        sa.Column("unrealized_pl",   sa.Numeric(20, 8),    nullable=True),
        sa.Column("realized_pl",     sa.Numeric(20, 8),    nullable=False, server_default="0"),
        sa.Column("opened_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── Backtests ────────────────────────────────────────────────────────
    op.create_table(
        "backtests",
        sa.Column("id",               UUID(as_uuid=True),   primary_key=True),
        sa.Column("name",             sa.String(200),        nullable=False),
        sa.Column("strategy_type",    sa.String(50),         nullable=False),
        sa.Column("symbols",          JSON,                  nullable=False),
        sa.Column("params",           JSON,                  nullable=False, server_default="{}"),
        sa.Column("start_date",       sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date",         sa.DateTime(timezone=True), nullable=False),
        sa.Column("initial_capital",  sa.Numeric(20, 2),     nullable=False),
        sa.Column("status",           backteststatus_enum,   nullable=False, server_default="pending"),
        sa.Column("final_equity",     sa.Numeric(20, 2),     nullable=True),
        sa.Column("total_return_pct", sa.Numeric(10, 4),     nullable=True),
        sa.Column("sharpe_ratio",     sa.Numeric(10, 4),     nullable=True),
        sa.Column("max_drawdown_pct", sa.Numeric(10, 4),     nullable=True),
        sa.Column("win_rate_pct",     sa.Numeric(10, 4),     nullable=True),
        sa.Column("total_trades",     sa.Integer(),          nullable=False, server_default="0"),
        sa.Column("equity_curve",     JSON,                  nullable=False, server_default="[]"),
        sa.Column("error",            sa.Text(),             nullable=True),
        sa.Column("created_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at",     sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "backtest_trades",
        sa.Column("id",          UUID(as_uuid=True),   primary_key=True),
        sa.Column("backtest_id", UUID(as_uuid=True),   sa.ForeignKey("backtests.id", ondelete="CASCADE")),
        sa.Column("symbol",      sa.String(20),        nullable=False),
        sa.Column("side",        orderside_enum,       nullable=False),
        sa.Column("entry_time",  sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_time",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_price", sa.Numeric(20, 8),    nullable=False),
        sa.Column("exit_price",  sa.Numeric(20, 8),    nullable=True),
        sa.Column("qty",         sa.Numeric(20, 8),    nullable=False),
        sa.Column("pnl",         sa.Numeric(20, 2),    nullable=True),
        sa.Column("pnl_pct",     sa.Numeric(10, 4),    nullable=True),
        sa.Column("reason",      sa.String(200),       nullable=True),
    )

    # ── Audit log ────────────────────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id",        UUID(as_uuid=True),   primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("actor",     sa.String(100),        nullable=False),
        sa.Column("action",    sa.String(100),        nullable=False),
        sa.Column("resource",  sa.String(200),        nullable=True),
        sa.Column("details",   JSON,                  nullable=False, server_default="{}"),
        sa.Column("success",   sa.Boolean(),          nullable=False, server_default="true"),
    )
    op.create_index("ix_audit_timestamp",   "audit_log", [sa.text("timestamp DESC")])
    op.create_index("ix_audit_action_time", "audit_log", ["action", sa.text("timestamp DESC")])

    # ── Account snapshots ────────────────────────────────────────────────
    op.create_table(
        "account_snapshots",
        sa.Column("id",              UUID(as_uuid=True),   primary_key=True),
        sa.Column("timestamp",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("mode",            tradingmode_enum,     nullable=False),
        sa.Column("cash",            sa.Numeric(20, 2),    nullable=False),
        sa.Column("equity",          sa.Numeric(20, 2),    nullable=False),
        sa.Column("buying_power",    sa.Numeric(20, 2),    nullable=False),
        sa.Column("positions_count", sa.Integer(),         nullable=False, server_default="0"),
        sa.Column("day_pl",          sa.Numeric(20, 2),    nullable=True),
        sa.Column("total_pl",        sa.Numeric(20, 2),    nullable=True),
    )
    op.create_index("ix_snapshot_timestamp", "account_snapshots", [sa.text("timestamp DESC")])


def downgrade() -> None:
    op.drop_table("account_snapshots")
    op.drop_table("audit_log")
    op.drop_table("backtest_trades")
    op.drop_table("backtests")
    op.drop_table("positions")
    op.drop_table("orders")
    op.drop_table("strategy_runs")
    op.drop_table("strategies")
    op.drop_table("ohlcv")
    for enum in [tradingmode_enum, backteststatus_enum, strategystatus_enum,
                 orderstatus_enum, ordertype_enum, orderside_enum]:
        enum.drop(op.get_bind(), checkfirst=True)