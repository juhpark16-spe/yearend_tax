"""세션 관리 비즈니스 로직 서비스 (TaxSessionService)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.user import User


class TaxSessionService:
    """연말정산 세션 발급 및 라이프사이클 관리 서비스
    """

    def __init__(self, db: Session):
        self.db = db

    def get_or_create_default_user(self, user_id: Optional[str] = None) -> User:
        """지정된 user_id를 조회하거나, 없으면 기본 근로자 사용자를 자동 확보합니다.
        """
        if user_id:
            try:
                uid = uuid.UUID(str(user_id))
            except (ValueError, AttributeError):
                uid = uuid.uuid5(uuid.NAMESPACE_DNS, str(user_id))

            user = self.db.query(User).filter(User.id == uid).first()
            if not user:
                is_guest = str(user_id).startswith("guest-")
                if is_guest:
                    email = f"{user_id}@guest.selftax"
                else:
                    email = str(user_id) if "@" in str(user_id) else f"{str(user_id)[:16]}@auth.selftax"
                user = User(
                    id=uid,
                    email=email,
                    name="게스트" if is_guest else f"사용자({str(user_id)[:8]})",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                self.db.add(user)
                self.db.commit()
                self.db.refresh(user)
            return user

        # 기본 데모 사용자 조회 또는 신규 생성
        default_email = "worker@selftax.com"
        user = self.db.query(User).filter(User.email == default_email).first()
        if not user:
            user = User(
                email=default_email,
                name="근로자",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
        return user

    def create_session(
        self,
        user_id: Optional[str] = None,
        tax_year: int = 2025,
        is_sme_youth: bool = False,
        is_newly_married: bool = False,
    ) -> TaxSession:
        """새로운 연말정산 시뮬레이션 세션을 개설합니다.
        """
        user = self.get_or_create_default_user(user_id)
        session = TaxSession(
            user_id=user.id,
            tax_year=tax_year,
            status=TaxSessionStatus.UPLOADED,
            is_sme_youth=is_sme_youth,
            is_newly_married=is_newly_married,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_latest_session_for_user(self, user_id: str, tax_year: int = 2025) -> Optional[TaxSession]:
        """요청자의 가장 최근(마지막 사용) 세션 — 업로드 시 세션을 새로 만들지 않고 이어 쓰기 위함"""
        try:
            uid = uuid.UUID(str(user_id))
        except (ValueError, AttributeError):
            uid = uuid.uuid5(uuid.NAMESPACE_DNS, str(user_id))
        return (
            self.db.query(TaxSession)
            .filter(TaxSession.user_id == uid, TaxSession.tax_year == tax_year)
            .order_by(TaxSession.updated_at.desc(), TaxSession.created_at.desc())
            .first()
        )

    def get_session(self, session_id: str) -> Optional[TaxSession]:
        """세션 ID로 세션 정보를 조회합니다.
        """
        try:
            uid = uuid.UUID(session_id)
            return self.db.query(TaxSession).filter(TaxSession.id == uid).first()
        except (ValueError, AttributeError):
            return None

    def update_session_status(self, session_id: str, new_status: TaxSessionStatus) -> Optional[TaxSession]:
        """세션의 진행 상태(status)를 갱신합니다.
        """
        session = self.get_session(session_id)
        if session:
            session.status = new_status
            session.updated_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(session)
        return session
