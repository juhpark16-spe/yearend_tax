"""애플리케이션 환경설정 모듈
"""
import os
from typing import List, Optional
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

    # Supabase JWT 서명 검증 (둘 중 하나 이상 설정; 운영 환경에서는 필수)
    SUPABASE_URL: str = ""            # 신규 서명키(JWKS, ES256/RS256)
    SUPABASE_JWT_SECRET: str = ""     # 레거시 JWT 시크릿(HS256)
    SUPABASE_JWT_AUDIENCE: str = "authenticated"

    # 게스트(로그인 없이 둘러보기) 세션 분리: 게스트 토큰 서명 키와 유효 시간
    GUEST_TOKEN_SECRET: str = ""      # 미설정 시 SECRET_KEY 사용 (기본값이면 프로세스 임시 키)
    GUEST_SESSION_TTL_HOURS: int = 24

    # 요청 횟수 제한 ("횟수/초" 형식, 프로세스 메모리 기준 슬라이딩 윈도우)
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_GUEST: str = "10/600"        # 게스트 토큰 발급: IP당 10분에 10회
    RATE_LIMIT_AI: str = "20/600"           # AI 해설·RAG 검색: 사용자(게스트)당 10분에 20회
    RATE_LIMIT_AI_PER_IP: str = "40/600"    # AI 해설·RAG 검색: IP당 10분에 40회 (게스트 토큰 재발급 우회 방지)
    RATE_LIMIT_UPLOAD: str = "30/600"       # PDF 업로드: 사용자당 10분에 30회
    RATE_LIMIT_DEFAULT: str = "120/60"      # 세션·입력 저장·계산·조회: 사용자당 1분에 120회
    TRUST_PROXY_HEADERS: bool = False       # 리버스 프록시 뒤에서만 True (X-Forwarded-For 사용)

    # 서버 자료 보존 기간: 마지막 사용 후 이 기간이 지난 세션(문서·입력·결과·감사로그 포함)은 자동 삭제
    DATA_RETENTION_DAYS: int = 30

    # DB 구조 관리(Alembic): 시작 시 자동 마이그레이션 여부 (미지정 시 개발 환경만 자동, 운영은 확인만)
    DB_AUTO_MIGRATE: Optional[bool] = None

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
