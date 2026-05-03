from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ELEVENLABS_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "google/gemini-3-flash-preview"
    OPENROUTER_REFERER: str = "http://localhost:3000"
    OPENROUTER_TITLE: str = "Meeting Assistant"
    STORAGE_DIR: Path = Path("./storage")
    DATABASE_URL: str = "sqlite+aiosqlite:///./meeting.db"
    # Comma-separated list of permitted origins (exact match, scheme + host
    # + port). Example: "http://localhost:3000,http://192.168.1.10:3001".
    # ALLOWED_ORIGIN_REGEX overrides this if set.
    ALLOWED_ORIGIN: str = "http://localhost:3000"
    ALLOWED_ORIGIN_REGEX: str = ""
    SESSION_SECRET: str = "dev-secret-change-me-in-prod-min-32-chars"
    SESSION_COOKIE_NAME: str = "ma_session"
    SESSION_COOKIE_SECURE: bool = False
    SESSION_SAME_SITE: str = "lax"  # "lax" | "strict" | "none". Use "none"+SECURE=true cross-site.
    SESSION_MAX_AGE_S: int = 60 * 60 * 24 * 14  # 14 days

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGIN.split(",") if o.strip()]

    @property
    def audio_dir(self) -> Path:
        return self.STORAGE_DIR / "audio"


settings = Settings()
