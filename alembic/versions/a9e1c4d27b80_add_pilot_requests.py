"""add pilot_requests table

Revision ID: a9e1c4d27b80
Revises: c7d2e9a41b30
Create Date: 2026-10-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a9e1c4d27b80"
down_revision: Union[str, Sequence[str], None] = "c7d2e9a41b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pilot_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("firm", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("volume", sa.String(10), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("language", sa.String(2), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("pilot_requests")
