import io
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)
# 업로드는 로그인 사용자 또는 게스트 토큰이 있어야 한다 (2-C 게스트 세션 분리)
client.headers.update({"Authorization": "Bearer " + client.post("/api/v1/auth/guest").json()["guest_token"]})

def test_upload_non_pdf_fails():
    """확장자가 PDF가 아니거나 Content-Type이 application/pdf가 아닐 때 400 에러 및 메시지 검증"""
    file_content = b"fake image content"
    files = [
        ("files", ("photo.png", io.BytesIO(file_content), "image/png"))
    ]
    response = client.post("/api/v1/upload", files=files)
    assert response.status_code == 400
    assert "PDF 파일만 업로드할 수 있습니다." in response.json()["detail"]


def test_upload_mismatched_content_type_fails():
    """파일명은 .pdf지만 Content-Type이 application/pdf가 아닐 때 400 에러 검증"""
    file_content = b"fake html content"
    files = [
        ("files", ("document.pdf", io.BytesIO(file_content), "text/html"))
    ]
    response = client.post("/api/v1/upload", files=files)
    assert response.status_code == 400
    assert "PDF 파일만 업로드할 수 있습니다." in response.json()["detail"]


def test_upload_oversized_pdf_fails():
    """20MB 초과 파일 업로드 시 400 에러 및 메시지 검증"""
    # 20MB + 1KB
    oversized_content = b"0" * (20 * 1024 * 1024 + 1024)
    files = [
        ("files", ("large_document.pdf", io.BytesIO(oversized_content), "application/pdf"))
    ]
    response = client.post("/api/v1/upload", files=files)
    assert response.status_code == 400
    assert "파일 크기는 20MB를 초과할 수 없습니다." in response.json()["detail"]
