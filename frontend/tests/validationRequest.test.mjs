// 실행: node tests/validationRequest.test.mjs  (/tax/validate 요청 변환·응답 비교 검증)
import { buildValidationRequest, compareValidation } from '../src/utils/serverInputs.js';

const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };

const family = [
  { id: 'self', name: '홍길동', relation: '본인', isSelf: true, rrn: '760101-1234567', basicDeduction: '기본공제 (150만 원)' },
  { name: '이영희', relation: '배우자', rrn: '800101-*******', basicDeduction: '기본공제 (150만 원)', incomeOver: '초과함' },
  { name: '홍자녀', relation: '자녀,손자녀,입양자', rrn: '161201-*******', basicDeduction: '기본공제 (150만 원)' },
  { name: '홍부친', relation: '직계존속 (부/모)', rrn: '680101-*******', basicDeduction: '기본공제 (150만 원)' },
];
const req = buildValidationRequest({
  sessionId: 'S1', familyList: family, userName: '홍길동',
  withholdingData: { totalSalary: 50000000, paidIncomeTax: 2000000, companyName: 'A사' },
  previousJobs: [{ company: 'B사', salary: 1000000, tax: 0 }, { company: '빈칸', salary: 0, tax: 0 }],
});

ok(req.session_id === 'S1', '세션 ID 전달');
ok(!JSON.stringify(req).includes('1234567'), '주민등록번호 뒷자리는 보내지 않음');
ok(req.dependents.map((d) => d.relation).join() === 'SELF,SPOUSE,CHILD,PARENT', '관계 코드 변환');
ok(req.dependents[2].birth_date === '2016-12-01', '생년월일 변환');
ok(req.dependents[1].income_over_limit === true && req.dependents[1].is_basic_deduction === false, '소득 초과 → 미신청 + 초과 표시');
ok(req.dependents[3].is_basic_deduction === false, '나이 요건 미충족(만 57세 부친)은 화면 판정대로 미신청');
ok(req.workplaces.length === 2 && req.workplaces[0].workplace_type === 'CURRENT' && req.workplaces[1].prepaid_tax === 0, '근무지: 주(현) + 금액 있는 종(전)만');

const rows = compareValidation(req, {
  details: { dependents: [
    { is_basic_eligible: true, age: 49 },
    { is_basic_eligible: false, age: 45, disqualification_reasons: ['소득 초과'] },
    { is_basic_eligible: false, age: 9, disqualification_reasons: ['가정'] },
    { is_basic_eligible: false, age: 57 },
  ] },
});
ok(rows[0].same && rows[1].same && rows[3].same, '화면·서버 판정 일치 행');
ok(!rows[2].same && rows[2].reasons[0] === '가정', '화면은 신청했는데 서버가 부적격이면 차이로 표시');
console.log('all passed');
