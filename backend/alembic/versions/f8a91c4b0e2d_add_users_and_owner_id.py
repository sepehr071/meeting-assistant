"""add users and owner_id

Revision ID: f8a91c4b0e2d
Revises: c1e2f2e247ca
Create Date: 2026-05-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8a91c4b0e2d'
down_revision: Union[str, Sequence[str], None] = 'c1e2f2e247ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('username', sa.String(length=80), nullable=False),
        sa.Column('password_hash', sa.String(length=500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username', name='uq_users_username'),
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index('ix_users_username', ['username'], unique=False)

    with op.batch_alter_table('meetings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('owner_id', sa.String(length=36), nullable=True))
        batch_op.create_index('ix_meetings_owner_id', ['owner_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_meetings_owner_id', 'users', ['owner_id'], ['id'], ondelete='CASCADE'
        )

    with op.batch_alter_table('series', schema=None) as batch_op:
        batch_op.add_column(sa.Column('owner_id', sa.String(length=36), nullable=True))
        batch_op.create_index('ix_series_owner_id', ['owner_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_series_owner_id', 'users', ['owner_id'], ['id'], ondelete='CASCADE'
        )
        batch_op.drop_constraint('uq_series_name', type_='unique')
        batch_op.create_unique_constraint('uq_series_owner_name', ['owner_id', 'name'])

    with op.batch_alter_table('tags', schema=None) as batch_op:
        batch_op.add_column(sa.Column('owner_id', sa.String(length=36), nullable=True))
        batch_op.create_index('ix_tags_owner_id', ['owner_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_tags_owner_id', 'users', ['owner_id'], ['id'], ondelete='CASCADE'
        )
        batch_op.drop_constraint('uq_tag_name', type_='unique')
        batch_op.create_unique_constraint('uq_tag_owner_name', ['owner_id', 'name'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('tags', schema=None) as batch_op:
        batch_op.drop_constraint('uq_tag_owner_name', type_='unique')
        batch_op.create_unique_constraint('uq_tag_name', ['name'])
        batch_op.drop_constraint('fk_tags_owner_id', type_='foreignkey')
        batch_op.drop_index('ix_tags_owner_id')
        batch_op.drop_column('owner_id')

    with op.batch_alter_table('series', schema=None) as batch_op:
        batch_op.drop_constraint('uq_series_owner_name', type_='unique')
        batch_op.create_unique_constraint('uq_series_name', ['name'])
        batch_op.drop_constraint('fk_series_owner_id', type_='foreignkey')
        batch_op.drop_index('ix_series_owner_id')
        batch_op.drop_column('owner_id')

    with op.batch_alter_table('meetings', schema=None) as batch_op:
        batch_op.drop_constraint('fk_meetings_owner_id', type_='foreignkey')
        batch_op.drop_index('ix_meetings_owner_id')
        batch_op.drop_column('owner_id')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index('ix_users_username')

    op.drop_table('users')
