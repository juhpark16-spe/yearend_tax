"""AI 셀프 연말정산(SelfTax 2025) FastAPI 진입점
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.core.config import settings
from backend.core.database import Base, engine
from backend.api.v1.endpoints import router as api_v1_router
from backend.core.security_check import enforce_security_settings

# 비밀 키·보안 설정 점검 (운영 환경에서 치명적 누락이 있으면 시작하지 않음)
enforce_security_settings()
_IS_PRODUCTION = str(settings.ENVIRONMENT).lower() == "production"

# DB 테이블 자동 생성 (스켈레톤 개발용)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="근로자를 위한 AI 셀프 연말정산 시뮬레이션 및 감사 추적 서비스",
    version="2.0.0",
    # 운영 환경에서는 API 문서(스키마) 노출을 끈다
    openapi_url=None if _IS_PRODUCTION else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if _IS_PRODUCTION else "/docs",
    redoc_url=None if _IS_PRODUCTION else "/redoc"
)

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 보안 응답 헤더 미들웨어 추가
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# API v1 라우터 등록
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
def health_check():
    """서버 헬스 체크 엔드포인트
    """
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "tax_year": settings.TAX_YEAR,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
