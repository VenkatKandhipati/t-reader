from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(..., description="Postgres URL, e.g. postgresql+asyncpg://...")
    supabase_url: str = Field("", description="Supabase project URL, used for JWKS")
    supabase_jwt_secret: str = Field("", description="Legacy HS256 JWT secret (optional)")
    supabase_jwt_audience: str = "authenticated"
    supabase_service_role_key: str = Field(
        "", description="Service-role key for admin operations (delete user)"
    )
    cors_origins: str = "*"
    environment: str = "dev"


settings = Settings()
