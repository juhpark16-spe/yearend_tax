// 국세청 PDF 인별 자료 ↔ 부양가족 매칭 + 공제요건 표 테스트 (node tests/hometaxMatch.test.mjs)
import assert from 'node:assert/strict';
import { matchHometaxPersons, toBirth6, familyMemberFromHometaxPerson, guessRelation } from '../src/utils/hometaxMatch.js';
import { expenseEligibility, expenseEligibilityNote } from '../src/utils/eligibility.js';

assert.equal(toBirth6({ birth: '1981.01.01' }), '810101');
assert.equal(toBirth6({ rrn: '810101-*******', birth: '1981.01.01' }), '810101');
assert.equal(toBirth6({ birth: '810101' }), '810101');

const family = [
  { id: 'self', name: '홍길동', relation: '본인', isSelf: true, birth: '' },
  { id: 'a', name: '고길동', relation: '배우자', birth: '1981.01.01' },
  { id: 'b', name: '고영수', relation: '자녀,손자녀,입양자', birth: '2000.01.01' },
  { id: 'c', name: '고철수', relation: '자녀,손자녀,입양자', birth: '2005.01.01' },
  { id: 'd', name: '고우너', relation: '자녀,손자녀,입양자', birth: '2011.01.01' },
  { id: 'e', name: '고둘리', relation: '자녀,손자녀,입양자', birth: '2017.01.01' },
];
const persons = [
  { name: '박주현', birth: '800101', rrn: '800101-*******' },
  { name: '고길동', birth: '810101', rrn: '810101-*******' },
  { name: '고둘리', birth: '170101', rrn: '170101-*******' },
  { name: '고철수', birth: '050101', rrn: '050101-*******' },
  { name: '고부친', birth: '420101', rrn: '420101-*******', items: { medical_general: 3510000 } },
  { name: '고우너', birth: '110101', rrn: '110101-*******' },
];
const { matched, unmatched } = matchHometaxPersons(persons, family);
assert.deepEqual(matched.map((m) => m.name), ['박주현', '고길동', '고둘리', '고철수', '고우너']);
assert.equal(matched[0].relation, '본인'); // 로그인 이름이 달라도 PDF 첫 사람 = 본인
assert.deepEqual(unmatched.map((m) => m.name), ['고부친']);

// 고부친 추가: 직계존속, 소득 초과 → 기본공제 제외, 의료비만 공제
assert.equal(guessRelation(unmatched[0]), '직계존속 (부/모)');
const father = familyMemberFromHometaxPerson(unmatched[0], { relation: '직계존속 (부/모)', incomeOver: '초과함' });
assert.equal(father.birth, '1942.01.01');
assert.equal(father.basicDeduction, '해당없음');
const e = expenseEligibility(father);
assert.deepEqual([e.insurance, e.medical, e.education, e.card, e.donation], [false, true, false, false, false]);
assert.match(expenseEligibilityNote(father), /의료비는 공제됩니다/);
const re = matchHometaxPersons(persons, [...family, father]);
assert.equal(re.unmatched.length, 0);
assert.equal(re.matched.length, 6);

// 소득요건 충족 직계존속(만 83세) → 기본공제 + 경로우대
const father2 = familyMemberFromHometaxPerson(unmatched[0], { relation: '직계존속 (부/모)' });
assert.equal(father2.basicDeduction, '기본공제 (150만 원)');
assert.equal(father2.seniorDeduction, '해당');

// 나이요건만 미충족(만 25세 자녀): 보험료 ×, 의료·교육·카드·기부 ○
const son = expenseEligibility({ name: '고영수', relation: '자녀,손자녀,입양자', birth: '2000.01.01' });
assert.deepEqual([son.insurance, son.medical, son.education, son.card, son.donation], [false, true, true, true, true]);
assert.equal(expenseEligibilityNote({ name: '고영수', relation: '자녀,손자녀,입양자', birth: '2000.01.01' }),
  '기본공제는 제외되지만 의료비·교육비·신용카드 등·기부금은 공제됩니다');
// 형제자매: 카드 제외
assert.equal(expenseEligibility({ relation: '형제자매', birth: '2010.01.01' }).card, false);
console.log('hometaxMatch tests ok');
