"""Gap priorities: stop_limit order type, TIF column, users table, alert_type

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-03 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add stop_limit to ordertype enum
    op.execute("ALTER TYPE ordertype ADD VALUE IF NOT EXISTS 'stop_limit'")

    # Add time_in_force to orders
    op.add_column("orders", sa.Column("time_in_force", sa.String(10), nullable=False, server_default="day"))

    # Add alert_type to price_alerts
    op.add_column("price_alerts", sa.Column("alert_type", sa.String(20), nullable=False, server_default="price"))

    # Users table
    op.create_table(
        "users",
        sa.Column("id",              UUID(as_uuid=True), primary_key=True),
        sa.Column("username",        sa.String(100), nullable=False),
        sa.Column("hashed_password", sa.String(200), nullable=False),
        sa.Column("role",            sa.String(20), nullable=False, server_default="viewer"),
        sa.Column("is_active",       sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_username", "users")
    op.drop_table("users")
    op.drop_column("price_alerts", "alert_type")
    op.drop_column("orders", "time_in_force")
    # Cannot remove enum values in PostgreSQL without recreating the type
