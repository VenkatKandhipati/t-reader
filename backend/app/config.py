from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(..., description="Postgres URL, e.g. postgresql+asyncpg://...")
    supabase_jwt_secret: str = Field(..., description="Supabase project JWT secret (HS256)")
    supabase_jwt_audience: str = "authenticated"
    cors_origins: str = "*"
    environment: str = "dev"


settings = Settings()
