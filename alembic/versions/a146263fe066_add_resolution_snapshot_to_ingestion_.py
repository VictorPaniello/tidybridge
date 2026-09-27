"""add resolution snapshot to ingestion_runs

Revision ID: a146263fe066
Revises: f1a2b3c4d5e6
Create Date: 2026-09-26 18:45:08.936347

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a146263fe066'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('ingestion_runs', sa.Column('resolution', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ingestion_runs', 'resolution')
