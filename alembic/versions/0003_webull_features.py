"""Webull-inspired features: watchlists, price alerts

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-30 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON, UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "watchlists",
        sa.Column("id",         UUID(as_uuid=True), primary_key=True),
        sa.Column("name",       sa.String(100), nullable=False),
        sa.Column("owner",      sa.String(100), nullable=False),
        sa.Column("symbols",    JSON, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_watchlists_owner", "watchlists", ["owner"])

    op.create_table(
        "price_alerts",
        sa.Column("id",           UUID(as_uuid=True), primary_key=True),
        sa.Column("owner",        sa.String(100), nullable=False),
        sa.Column("symbol",       sa.String(20), nullable=False),
        sa.Column("condition",    sa.String(10), nullable=False),
        sa.Column("threshold",    sa.Numeric(20, 8), nullable=False),
        sa.Column("message",      sa.Text(), nullable=True),
        sa.Column("triggered",    sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_price_alerts_owner", "price_alerts", ["owner"])


def downgrade() -> None:
    op.drop_index("ix_price_alerts_owner", "price_alerts")
    op.drop_table("price_alerts")
    op.drop_index("ix_watchlists_owner", "watchlists")
    op.drop_table("watchlists")
