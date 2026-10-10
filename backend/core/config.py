"""애플리케이션 환경설정 모듈
"""
import os
from typing import List
from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """시스템 전역 환경 변수 설정
    """
    PROJECT_NAME: str = "AI 셀프 연말정산(SelfTax 2025)"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # CORS 허용 도메인 목록
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # 데이터베이스 연결 URL (기본 SQLite)
    DATABASE_URL: str = "sqlite:///./selftax.db"

    # 보안 및 암호화 키
    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # 연말정산 귀속 연도
    TAX_YEAR: int = 2025

    # AI & API Keys
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    TAVILY_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
