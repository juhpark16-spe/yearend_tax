// 두 엔진 결과 비교: 표준입력 {js, result, audit} → 다른 항목 목록(JSON) 출력
import fs from 'fs';

const si = await import(new URL('../../frontend/src/utils/serverInputs.js', import.meta.url).href);
const { js, result, audit } = JSON.parse(fs.readFileSync(0, 'utf-8'));
const diffs = [
  ...si.compareEngines(js, result).filter((r) => !r.same).map((r) => ({ kind: '7단계', ...r })),
  ...si.compareCredits(js, audit, result).filter((r) => !r.same).map((r) => ({ kind: '항목별 세액공제', ...r })),
  ...si.compareAppliedCredits(js, audit).filter((r) => !r.same).map((r) => ({ kind: '적용순서별 배분', ...r })),
];
const alloc = audit.find((l) => l.step_name === '세액감면·공제 적용순서별 배분');
const be = alloc?.output_snapshot?.donation_carryover_next || {};
const jn = js.taxCredits?.donationCarryoverNext || {};
for (const [label, a, b] of [
  ['다음 해 이월 특례', jn.special, be.special],
  ['다음 해 이월 일반(종교단체 외)', jn.generalNonReligious, be.general],
  ['다음 해 이월 일반(종교단체)', jn.generalReligious, be.religious],
  ['지방소득세 차감액', js.diffLocalTax, audit.find((l) => l.step === 7)?.output_snapshot?.final_local_refund_amount],
]) {
  if (Math.round(a || 0) !== Math.round(b || 0)) diffs.push({ kind: '기타', label, js: a, server: b });
}
process.stdout.write(JSON.stringify({ diffs, summary: { finalJs: js.finalIncomeTax, finalServer: result.final_decision_tax, diffTotal: js.diffTotal } }));
