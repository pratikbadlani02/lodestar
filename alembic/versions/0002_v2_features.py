"""v2 schema: stop-loss, strategy P&L, multi-timeframe, optimizer, more

Revision ID: 0002
Revises: 0001
Create Date: 2025-02-01 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON, UUID

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Add stop-loss / take-profit to strategies ─────────────────────────
    op.add_column("strategies", sa.Column("stop_loss_pct",   sa.Numeric(6, 3), nullable=True))
    op.add_column("strategies", sa.Column("take_profit_pct", sa.Numeric(6, 3), nullable=True))
    op.add_column("strategies", sa.Column("trailing_stop_pct", sa.Numeric(6, 3), nullable=True))
    op.add_column("strategies", sa.Column("max_hold_days",   sa.Integer(), nullable=True))
    op.add_column("strategies", sa.Column("timeframe",       sa.String(10), nullable=False, server_default="1d"))

    # ── Add per-strategy P&L tracking to positions ────────────────────────
    op.add_column("positions", sa.Column("strategy_id", UUID(as_uuid=True),
                  sa.ForeignKey("strategies.id"), nullable=True))
    op.add_column("positions", sa.Column("stop_loss_price",   sa.Numeric(20, 8), nullable=True))
    op.add_column("positions", sa.Column("take_profit_price", sa.Numeric(20, 8), nullable=True))
    op.add_column("positions", sa.Column("highest_price",     sa.Numeric(20, 8), nullable=True))

    # ── Strategy performance snapshot table ───────────────────────────────
    op.create_table(
        "strategy_performance",
        sa.Column("id",            UUID(as_uuid=True), primary_key=True),
        sa.Column("strategy_id",   UUID(as_uuid=True), sa.ForeignKey("strategies.id", ondelete="CASCADE")),
        sa.Column("date",          sa.Date(), nullable=False),
        sa.Column("realized_pl",   sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("unrealized_pl", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("trades_count",  sa.Integer(), nullable=False, server_default="0"),
        sa.Column("win_count",     sa.Integer(), nullable=False, server_default="0"),
        sa.Column("loss_count",    sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("strategy_id", "date", name="uq_strategy_date"),
    )

    # ── Optimizer runs ────────────────────────────────────────────────────
    op.create_table(
        "optimizer_runs",
        sa.Column("id",              UUID(as_uuid=True), primary_key=True),
        sa.Column("name",            sa.String(200), nullable=False),
        sa.Column("strategy_type",   sa.String(50), nullable=False),
        sa.Column("symbols",         JSON, nullable=False),
        sa.Column("param_grid",      JSON, nullable=False),
        sa.Column("start_date",      sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date",        sa.DateTime(timezone=True), nullable=False),
        sa.Column("initial_capital", sa.Numeric(20, 2), nullable=False),
        sa.Column("status",          sa.String(20), nullable=False, server_default="pending"),
        sa.Column("results",         JSON, nullable=False, server_default="[]"),
        sa.Column("best_params",     JSON, nullable=True),
        sa.Column("best_sharpe",     sa.Numeric(10, 4), nullable=True),
        sa.Column("error",           sa.Text(), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at",    sa.DateTime(timezone=True), nullable=True),
    )

    # ── Alerts / notifications log ────────────────────────────────────────
    op.create_table(
        "alerts",
        sa.Column("id",         UUID(as_uuid=True), primary_key=True),
        sa.Column("timestamp",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("severity",   sa.String(20), nullable=False),  # info | warning | critical
        sa.Column("category",   sa.String(50), nullable=False),  # risk | order | system | strategy
        sa.Column("title",      sa.String(200), nullable=False),
        sa.Column("message",    sa.Text(), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("metadata",   JSON, nullable=False, server_default="{}"),
    )
    op.create_index("ix_alerts_timestamp", "alerts", [sa.text("timestamp DESC")])
    op.create_index("ix_alerts_severity",  "alerts", ["severity", sa.text("timestamp DESC")])

    # ── Webhook events from Alpaca ────────────────────────────────────────
    op.create_table(
        "webhook_events",
        sa.Column("id",          UUID(as_uuid=True), primary_key=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("event_type",  sa.String(50), nullable=False),
        sa.Column("payload",     JSON, nullable=False),
        sa.Column("processed",   sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── Multi-timeframe support: existing OHLCV already has timeframe col ─
    # but add multi-timeframe ohlcv hypertable extension if needed
    # (the existing primary key is (time, symbol, timeframe) so we're good)


def downgrade() -> None:
    op.drop_table("webhook_events")
    op.drop_table("alerts")
    op.drop_table("optimizer_runs")
    op.drop_table("strategy_performance")

    op.drop_column("positions", "highest_price")
    op.drop_column("positions", "take_profit_price")
    op.drop_column("positions", "stop_loss_price")
    op.drop_column("positions", "strategy_id")

    op.drop_column("strategies", "timeframe")
    op.drop_column("strategies", "max_hold_days")
    op.drop_column("strategies", "trailing_stop_pct")
    op.drop_column("strategies", "take_profit_pct")
    op.drop_column("strategies", "stop_loss_pct")
