"""두 세액 엔진 일치 테스트 (화면 엔진 taxCalculator.js ↔ 백엔드 TaxCalculationService)

화면에는 보이지 않는 개발용 점검이다. 시나리오(tests/parity/scenarios/*.json)마다
1) node 로 화면 엔진을 계산하고 백엔드 입력을 만든 뒤
2) 백엔드 API(/sessions → /inputs → /calculate → /result·/audit)로 다시 계산해
3) 7단계·세액공제 항목별·적용순서별 배분·다음 해 이월 기부금·지방소득세까지 같은지 확인한다.
시나리오의 expected 값(결정세액·차감징수세액)이 있으면 그 값도 고정 확인한다(회귀 방지).

실행: pytest tests/parity  (node 가 없으면 건너뜀)
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

HERE = Path(__file__).resolve().parent
SCENARIOS = sorted((HERE / "scenarios").glob("*.json"))
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(NODE is None, reason="node 미설치 — 화면 엔진을 실행할 수 없음")


def _node(script: str, *args: str, stdin: str = None) -> dict:
    out = subprocess.run([NODE, str(HERE / script), *args], input=stdin, capture_output=True,
                         text=True, encoding="utf-8", timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[p.stem for p in SCENARIOS])
def test_engines_agree(client: TestClient, scenario: Path):
    spec = json.loads(scenario.read_text(encoding="utf-8"))
    calc = _node("run_js.mjs", str(scenario))
    js, inputs = calc["js"], calc["inputs"]

    h = {"Authorization": "Bearer " + client.post("/api/v1/auth/guest").json()["guest_token"]}
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=h).json()["session_id"]
    assert client.put(f"/api/v1/sessions/{sid}/inputs", json=inputs, headers=h).status_code == 200
    assert client.post("/api/v1/calculate", json={"session_id": sid}, headers=h).status_code == 200
    result = client.get(f"/api/v1/result/{sid}", headers=h).json()
    audit = client.get(f"/api/v1/audit/{sid}", headers=h).json()["logs"]
    client.delete("/api/v1/me/data", headers=h)

    cmp = _node("compare.mjs", stdin=json.dumps({"js": js, "result": result, "audit": audit}, ensure_ascii=False))
    assert cmp["diffs"] == [], f"{spec.get('title', scenario.stem)}: 두 엔진 차이 {cmp['diffs']}"

    exp = spec.get("expected") or {}
    if "final_income_tax" in exp:
        assert js["finalIncomeTax"] == exp["final_income_tax"]
    if "diff_total" in exp:
        assert js["diffTotal"] == exp["diff_total"]
    if "use_standard_credit" in exp:
        assert js["useStandardCredit"] is exp["use_standard_credit"]
