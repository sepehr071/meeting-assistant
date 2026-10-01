from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


def apply_sqlite_pragmas(async_engine: AsyncEngine) -> None:
    """Set per-connection SQLite pragmas. Without ``foreign_keys=ON`` every
    ``ondelete`` clause in the schema is inert; WAL + ``busy_timeout`` keep the
    concurrent background pipeline from raising ``database is locked``. No-op for
    non-sqlite backends (the future Postgres path)."""
    if async_engine.url.get_backend_name() != "sqlite":
        return

    @event.listens_for(async_engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
apply_sqlite_pragmas(engine)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
