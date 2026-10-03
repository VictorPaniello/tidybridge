"""add approved_at to client_records

Revision ID: c7d2e9a41b30
Revises: a146263fe066
Create Date: 2026-10-03 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7d2e9a41b30'
down_revision: Union[str, Sequence[str], None] = 'a146263fe066'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'client_records', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('client_records', 'approved_at')
