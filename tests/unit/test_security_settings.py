"""2-D 비밀 키 정리: 운영 환경 시작 시 보안 설정 점검"""
from types import SimpleNamespace

import pytest

from backend.core.security_check import PLACEHOLDER_SECRET, collect_security_issues, enforce_security_settings


def _cfg(**kw):
    base = dict(ENVIRONMENT="production", SECRET_KEY="x" * 48, SUPABASE_URL="https://example.supabase.co",
                SUPABASE_JWT_SECRET="", GUEST_TOKEN_SECRET="g" * 48,
                BACKEND_CORS_ORIGINS=["https://jeongsanbom.example"], DATABASE_URL="postgresql://db")
    base.update(kw)
    return SimpleNamespace(**base)


def test_production_ok_when_configured():
    errors, warnings = collect_security_issues(_cfg())
    assert errors == [] and warnings == []
    enforce_security_settings(_cfg())


@pytest.mark.parametrize("override", [
    {"SECRET_KEY": PLACEHOLDER_SECRET},
    {"SECRET_KEY": "short"},
    {"SUPABASE_URL": "", "SUPABASE_JWT_SECRET": ""},
])
def test_production_refuses_to_start_on_missing_secrets(override):
    with pytest.raises(RuntimeError):
        enforce_security_settings(_cfg(**override))


def test_development_only_warns():
    errors, warnings = collect_security_issues(_cfg(ENVIRONMENT="development", SECRET_KEY=PLACEHOLDER_SECRET,
                                                    SUPABASE_URL="", GUEST_TOKEN_SECRET=""))
    assert errors == [] and len(warnings) == 3


def test_messages_never_contain_secret_values():
    secret = "S" * 10
    errors, warnings = collect_security_issues(_cfg(SECRET_KEY=secret))
    assert all(secret not in m for m in errors + warnings)
