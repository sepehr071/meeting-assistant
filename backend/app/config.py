from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SESSION_SECRET = "dev-secret-change-me-in-prod-min-32-chars"


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
    # + port). Example: "http://localhost:3000,http://your-lan-host:3001".
    # ALLOWED_ORIGIN_REGEX overrides this if set.
    ALLOWED_ORIGIN: str = "http://localhost:3000"
    ALLOWED_ORIGIN_REGEX: str = ""
    SESSION_SECRET: str = DEFAULT_SESSION_SECRET
    SESSION_COOKIE_NAME: str = "ma_session"
    SESSION_COOKIE_SECURE: bool = False
    SESSION_SAME_SITE: str = "lax"  # "lax" | "strict" | "none". Use "none"+SECURE=true cross-site.
    SESSION_MAX_AGE_S: int = 60 * 60 * 24 * 14  # 14 days
    # Login/register throttle (slowapi syntax, e.g. "5/minute", "100/hour").
    LOGIN_RATE_LIMIT: str = "5/minute"
    # ── Keycloak / OIDC (BFF auth) ────────────────────────────────────────
    # Backend runs the Authorization Code + PKCE flow; the existing signed
    # session cookie stays the app's auth primitive. Tokens never reach the
    # browser. Empty by default so dev/CI run without a Keycloak; required in
    # prod (enforced below when SESSION_COOKIE_SECURE=true).
    OIDC_ISSUER: str = ""  # e.g. https://kc.company.com/realms/<realm>
    OIDC_CLIENT_ID: str = ""
    OIDC_CLIENT_SECRET: str = ""
    OIDC_REDIRECT_URI: str = "http://localhost:8000/api/auth/oidc/callback"
    OIDC_POST_LOGIN_REDIRECT: str = "http://localhost:3000/"
    OIDC_POST_LOGOUT_REDIRECT: str = "http://localhost:3000/login"
    OIDC_SCOPES: str = "openid profile email"
    # Transcription parallelism. 1 = single sync convert(). >1 = ffmpeg-split
    # audio into N chunks with overlap and run parallel asyncio.gather of
    # convert() calls, then stitch results. Set to 1 to disable chunking.
    # Each chunk is diarized independently and speakers are reconciled at the
    # overlap seams — MORE chunks = MORE seams = worse diarization. Keep low (2)
    # for accuracy; raise only if Scribe wall-time is the priority.
    TRANSCRIBE_PARALLEL_CHUNKS: int = 2
    TRANSCRIBE_CHUNK_OVERLAP_S: float = 15.0

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGIN.split(",") if o.strip()]

    @property
    def audio_dir(self) -> Path:
        return self.STORAGE_DIR / "audio"

    @property
    def oidc_configured(self) -> bool:
        return bool(
            self.OIDC_ISSUER
            and self.OIDC_CLIENT_ID
            and self.OIDC_CLIENT_SECRET
            and self.OIDC_REDIRECT_URI
        )

    @model_validator(mode="after")
    def _enforce_prod_session_security(self) -> "Settings":
        """Fail fast on insecure prod posture. SESSION_COOKIE_SECURE=true is the
        prod signal (HTTPS): in that mode the bundled dev secret is forbidden,
        SameSite=none always requires a Secure cookie, and Keycloak/OIDC must
        be fully configured (auth is Keycloak-only)."""
        if self.SESSION_COOKIE_SECURE and self.SESSION_SECRET == DEFAULT_SESSION_SECRET:
            raise ValueError(
                "SESSION_SECRET is still the bundled dev default while "
                "SESSION_COOKIE_SECURE=true. Set a unique random >=32-char secret."
            )
        if self.SESSION_SAME_SITE == "none" and not self.SESSION_COOKIE_SECURE:
            raise ValueError(
                "SESSION_SAME_SITE=none requires SESSION_COOKIE_SECURE=true (HTTPS)."
            )
        if self.SESSION_COOKIE_SECURE and not self.oidc_configured:
            raise ValueError(
                "OIDC_ISSUER/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/OIDC_REDIRECT_URI "
                "must all be set when SESSION_COOKIE_SECURE=true (prod)."
            )
        return self


settings = Settings()
