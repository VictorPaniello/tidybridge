"""backfill is_verified before enforcing email verification

Revision ID: d4f8a2c61e05
Revises: a9e1c4d27b80
Create Date: 2026-11-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "d4f8a2c61e05"
down_revision: Union[str, Sequence[str], None] = "a9e1c4d27b80"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Same UPDATE as 8bd3619c5dd2, run again: that one only covered
    accounts that existed on 2026-09-10. Every account registered since
    then has is_verified = false (no verification flow existed), and
    current_active_user now requires it - without this they'd be locked
    out. Safe because no account can be legitimately "pending" yet."""
    op.execute("UPDATE users SET is_verified = true WHERE is_verified = false")


def downgrade() -> None:
    """No-op, same reason as 8bd3619c5dd2: which rows were genuinely
    unverified can't be recovered."""
    pass
