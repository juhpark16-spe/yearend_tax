// 실행: node tests/proofExtract.test.mjs  (증빙서류 업로드 결과 → 부양가족 확인 목록 변환)
import { membersFromProofUpload } from '../src/utils/proofExtract.js';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
const resident = { doc_type: 'RESIDENT', parsed_json: { members: [
  { name: '박주현', relation: 'SELF', birth_date: '1980-01-01', masked_identifier: '800101-[RRN Omitted]' },
  { name: '고길동', relation: 'SPOUSE', birth_date: '1981-01-01', masked_identifier: '810101-[RRN Omitted]' },
  { name: '고영수', relation: 'CHILD', birth_date: '2000-01-01', masked_identifier: '000101-[RRN Omitted]' },
  { name: '고둘리', relation: 'CHILD', birth_date: '2017-01-01', masked_identifier: '170101-[RRN Omitted]' },
] } };
const r = membersFromProofUpload(resident, 'resident');
ok(!r.error && r.items.length === 3, '본인 제외 3명');
ok(r.items[0].relation === '배우자' && r.items[0].rrn === '810101-*******' && r.items[0].birth === '1981.01.01', '관계·생년월일·가린 번호 변환');
ok(r.items[1].basicDeduction === '해당없음', '만 25세 자녀는 기본공제 해당없음');
ok(r.items[2].basicDeduction === '기본공제 (150만 원)', '어린 자녀는 기본공제');
ok(!JSON.stringify(r).includes('RRN Omitted'), '서버 마스킹 표기 노출 안 함');
ok(membersFromProofUpload({ doc_type: 'HOMETAX', parsed_json: {} }, 'resident').error.includes('주민등록등본으로 인식되지'), '다른 문서면 안내');
ok(membersFromProofUpload({ doc_type: 'RESIDENT', parsed_json: { members: [] } }, 'resident').error.includes('찾지 못했습니다'), '가족 없으면 안내');
console.log('all passed');
