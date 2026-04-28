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
    ALLOWED_ORIGIN: str = "http://localhost:3000"
    ALLOWED_ORIGIN_REGEX: str = ""

    @property
    def audio_dir(self) -> Path:
        return self.STORAGE_DIR / "audio"


settings = Settings()
