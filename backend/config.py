"""
All of Setu's configuration in one validated place (pydantic-settings).
Values come from environment variables (or a local .env file in development).

In production (SETU_ENV=production) the app refuses to start with the
insecure default AUTH_SECRET, so a forgotten secret can't slip through.
"""
from functools import lru_cache
from typing import List, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    setu_env: Literal["development", "production"] = "development"
    auth_secret: str = DEV_SECRET

    # Browser origins allowed to call the API. Comma-separated, e.g.
    # "https://setu.vercel.app,https://setu-staging.vercel.app". "*" = any (development).
    allowed_origins: str = "*"

    # Link to BhooSuraksha (landslide risk)
    bhoosuraksha_api_url: str = ""
    bhoosuraksha_timeout_s: float = Field(default=4.0, gt=0, le=30)
    risk_cache_minutes: int = Field(default=30, ge=1)
    risk_failure_cooldown_s: int = Field(default=120, ge=5)  # after a failure, don't retry for this long

    # Optional AI photo check for incident reports
    ai_provider: Literal["", "gemini", "anthropic"] = ""
    ai_model: str = ""
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    ai_timeout_s: float = Field(default=30.0, gt=0, le=120)

    @field_validator("bhoosuraksha_api_url")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.strip().rstrip("/")

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()] or ["*"]

    def check_production(self) -> None:
        if self.setu_env == "production":
            if self.auth_secret == DEV_SECRET or len(self.auth_secret) < 32:
                raise RuntimeError("SETU_ENV=production needs AUTH_SECRET set to a long random value (32+ characters).")
            if self.origins == ["*"]:
                print("[config] WARNING: ALLOWED_ORIGINS is '*' in production; set it to your site's address.")


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings()
