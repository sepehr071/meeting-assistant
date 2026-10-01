"""add oidc fields to user

Revision ID: a1b2c3d4e5f6
Revises: f8a91c4b0e2d
Create Date: 2026-06-10 00:00:00.000000

Adds Keycloak/OIDC identity columns and makes password_hash nullable
(OIDC-provisioned users have no local password). Constraints/indexes are
named explicitly so the SQLite batch downgrade works.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f8a91c4b0e2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('oidc_sub', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('email', sa.String(length=320), nullable=True))
        batch_op.create_index('ix_users_oidc_sub', ['oidc_sub'], unique=True)
        batch_op.alter_column(
            'password_hash', existing_type=sa.String(length=500), nullable=True
        )


def downgrade() -> None:
    """Downgrade schema.

    Note: restoring password_hash to NOT NULL fails if any OIDC user rows have
    a null password_hash — expected, drop/migrate those rows first.
    """
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column(
            'password_hash', existing_type=sa.String(length=500), nullable=False
        )
        batch_op.drop_index('ix_users_oidc_sub')
        batch_op.drop_column('email')
        batch_op.drop_column('oidc_sub')
