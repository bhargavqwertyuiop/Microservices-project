from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres123@localhost:5432/userdb")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    rabbitmq_url: str = os.getenv("RABBITMQ_URL", "amqp://rabbit:rabbit123@localhost:5672/")
    secret_key: str = os.getenv("SECRET_KEY", "your-super-secret-key-change-in-production")
    allowed_origins: List[str] = ["http://localhost:3000", "http://localhost:8080"]
    allowed_hosts: List[str] = ["localhost", "127.0.0.1", "user-service"]
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    class Config:
        env_file = ".env"

settings = Settings()