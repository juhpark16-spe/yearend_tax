"""요청 횟수 제한 (슬라이딩 윈도우, 프로세스 메모리)

- 게스트 토큰 발급은 IP 기준, AI 해설·RAG 검색은 사용자(게스트 포함) + IP 기준, 그 밖의 세션 API는 사용자 기준
- 초과 시 429 Too Many Requests + Retry-After 헤더
- 여러 서버(워커)로 운영할 때는 Redis 등 공유 저장소 기반 제한으로 바꿔야 한다 (이 구현은 프로세스별로 센다)
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import Depends, HTTPException, Request, status

from backend.core.config import settings
from backend.security.auth import get_current_user_id

_buckets: Dict[str, Deque[float]] = {}
_lock = threading.Lock()
_last_sweep = 0.0


def parse_rule(rule: str) -> Tuple[int, int]:
    count, seconds = str(rule).split("/", 1)
    return max(1, int(count)), max(1, int(seconds))


def reset_rate_limits() -> None:
    """테스트·운영 점검용 초기화"""
    with _lock:
        _buckets.clear()


def client_ip(request: Request) -> str:
    if getattr(settings, "TRUST_PROXY_HEADERS", False):
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep > 300:
        for k in [k for k, v in _buckets.items() if not v or v[-1] <= now - 3600]:
            _buckets.pop(k, None)
        _last_sweep = now


def _enforce(keys_rules) -> None:
    """모든 한도를 먼저 확인하고, 통과한 경우에만 요청을 기록한다 (거절된 요청은 다른 한도를 소모하지 않음)"""
    if not getattr(settings, "RATE_LIMIT_ENABLED", True):
        return
    now = time.monotonic()
    with _lock:
        checked = []
        for key, rule in keys_rules:
            limit, window = parse_rule(rule)
            q = _buckets.setdefault(key, deque())
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                retry = max(1, int(q[0] + window - now) + 1)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"요청이 너무 많습니다. {retry}초 후에 다시 시도해 주세요.",
                    headers={"Retry-After": str(retry)},
                )
            checked.append(q)
        for q in checked:
            q.append(now)
        _sweep(now)


def limit_guest_issue(request: Request) -> None:
    _enforce([(f"guest:{client_ip(request)}", settings.RATE_LIMIT_GUEST)])


def limit_ai(request: Request, current_user_id: Optional[str] = Depends(get_current_user_id)) -> None:
    ip = client_ip(request)
    who = current_user_id or f"ip:{ip}"
    _enforce([(f"ai-ip:{ip}", settings.RATE_LIMIT_AI_PER_IP), (f"ai:{who}", settings.RATE_LIMIT_AI)])


def limit_upload(request: Request, current_user_id: Optional[str] = Depends(get_current_user_id)) -> None:
    who = current_user_id or f"ip:{client_ip(request)}"
    _enforce([(f"upload:{who}", settings.RATE_LIMIT_UPLOAD)])


def limit_default(request: Request, current_user_id: Optional[str] = Depends(get_current_user_id)) -> None:
    who = current_user_id or f"ip:{client_ip(request)}"
    _enforce([(f"api:{who}", settings.RATE_LIMIT_DEFAULT)])
