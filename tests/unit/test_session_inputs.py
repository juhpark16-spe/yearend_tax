"""PUT /sessions/{id}/inputs → /calculate → /audit 연동 테스트 (서버 교차검증)"""
import uuid


def _inputs(salary=71_500_000, prepaid=2_878_680):
    return {
        "workplaces": [{"workplace_type": "CURRENT", "company_name": "테스트", "gross_salary": salary, "prepaid_income_tax": prepaid}],
        "dependents": [
            {"name": "본인", "relation": "SELF", "is_disabled": True},
            {"name": "배우자", "relation": "SPOUSE", "annual_income_amount": 5_000_000, "is_basic_deduction": False},
            {"name": "대학생", "relation": "CHILD", "birth_date": "2000-01-01", "is_basic_deduction": False},
            {"name": "초등생", "relation": "CHILD", "birth_date": "2015-01-01"},
        ],
        "expense": {
            "national_pension": 1_190_610, "health_insurance": 2_545_170, "employment_insurance": 1_772_080,
            "raw_details": {"personal_pension_old_paid": 6_060_000, "venture_fund_paid": 2_318_690, "small_biz_paid": 1_000_000,
                            "long_invest_paid": 1_000_000, "long_invest_nts_deductible": 0},
        },
    }


def test_inputs_calculate_audit_flow(client):
    uid = str(uuid.uuid4())
    h = {"X-User-Id": uid}
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=h).json()["session_id"]
    r = client.put(f"/api/v1/sessions/{sid}/inputs", json=_inputs(), headers=h)
    assert r.status_code == 200 and r.json()["dependents"] == 4
    assert client.post("/api/v1/calculate", json={"session_id": sid}, headers=h).status_code == 200
    res = client.get(f"/api/v1/result/{sid}", headers=h).json()
    # 인적공제: 본인 150 + 초등생 150 + 본인 장애인 200 (배우자 소득초과·대학생 나이요건 제외)
    assert res["total_personal_deduction"] == 5_000_000
    audit = client.get(f"/api/v1/audit/{sid}", headers=h).json()
    step3 = next(l for l in audit["logs"] if l["step"] == 3)
    snap = step3["input_snapshot"]
    assert snap["personal_pension_old_deduction"] == 720_000
    assert snap["venture_fund_deduction"] == 231_869
    assert snap["small_biz_deduction"] == 1_000_000
    assert snap["long_invest_deduction"] == 400_000

    # 다시 저장하면 기존 자료를 교체한다
    r2 = client.put(f"/api/v1/sessions/{sid}/inputs", json={**_inputs(), "dependents": [{"name": "본인", "relation": "SELF"}]}, headers=h)
    assert r2.json()["dependents"] == 1


def test_inputs_requires_session_owner(client):
    owner, other = str(uuid.uuid4()), str(uuid.uuid4())
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers={"X-User-Id": owner}).json()["session_id"]
    r = client.put(f"/api/v1/sessions/{sid}/inputs", json=_inputs(), headers={"X-User-Id": other})
    assert r.status_code == 403


def test_inputs_reject_unknown_relation(client):
    uid = str(uuid.uuid4())
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers={"X-User-Id": uid}).json()["session_id"]
    bad = {**_inputs(), "dependents": [{"name": "x", "relation": "COUSIN"}]}
    assert client.put(f"/api/v1/sessions/{sid}/inputs", json=bad, headers={"X-User-Id": uid}).status_code == 422


def test_audit_exposes_item_level_credits_for_cross_check(client):
    """교차검증 항목별 비교에 필요한 값(한도 적용 전 연금계좌 공제 등)이 감사 로그에 기록되는지"""
    uid = str(uuid.uuid4())
    h = {"X-User-Id": uid}
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=h).json()["session_id"]
    body = _inputs(salary=30_000_000, prepaid=500_000)
    body["expense"]["personal_pension_saving"] = 6_000_000
    body["expense"]["medical_general"] = 5_000_000
    client.put(f"/api/v1/sessions/{sid}/inputs", json=body, headers=h)
    client.post("/api/v1/calculate", json={"session_id": sid}, headers=h)
    logs = client.get(f"/api/v1/audit/{sid}", headers=h).json()["logs"]
    names = {l["step_name"]: l for l in logs}
    pension = names["연금계좌 세액공제"]
    assert pension["output_snapshot"]["tax_credit_pension_account_before_cap"] == 900_000  # 600만 × 15%
    assert pension["calculated_amount"] <= 900_000                                      # 산출세액 한도 반영
    special = names["특별세액공제 및 표준세액공제 비교"]["input_snapshot"]
    for key in ("ins_credit", "med_credit", "edu_credit", "don_credit", "standard_tax_credit"):
        assert key in special
    assert "정치자금·고향사랑·우리사주 기부금 세액공제" in names
