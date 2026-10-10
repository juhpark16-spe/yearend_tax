"""데이터베이스 세션 관리 모듈
"""
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from backend.core.config import settings

# SQLite 연결 시 connect_args 설정
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 선언적 베이스 클래스"""
    pass


def get_db() -> Generator[Session, None, None]:
    """데이터베이스 세션 의존성 주입 함수
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
