"""Pytest 공통 픽스처 및 테스트 설정
"""
import pytest
from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture
def client():
    """FastAPI TestClient 픽스처
    """
    with TestClient(app) as test_client:
        yield test_client
