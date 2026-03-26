from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_KEY: str
    ADZUNA_APP_ID: str
    ADZUNA_API_KEY: str
    SECRET_KEY: str = "change-me-in-production-min-32-chars"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    RATE_LIMIT_PER_MINUTE: int = 60

    class Config:
        env_file = ".env"

settings = Settings()
