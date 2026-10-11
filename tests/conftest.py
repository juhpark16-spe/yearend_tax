"""Pytest 공통 픽스처 및 테스트 설정
"""
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.rate_limit import reset_rate_limits
from backend.services.data_retention import reset_purge_timer


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """테스트마다 요청 횟수 제한 기록 초기화 (같은 테스트 클라이언트 IP를 공유하므로)"""
    reset_rate_limits()
    reset_purge_timer()
    yield
    reset_rate_limits()


@pytest.fixture
def client():
    """FastAPI TestClient 픽스처
    """
    with TestClient(app) as test_client:
        yield test_client
