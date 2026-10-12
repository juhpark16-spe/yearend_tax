/**
 * 국세청 간소화 PDF 인별 자료 ↔ 부양가족 목록 매칭
 * - 이름 + 생년월일(YYMMDD)로 맞춘다. 둘 다 있으면 둘 다 같아야 매칭.
 * - 목록에 없는 사람(unmatched)은 따로 돌려줘 화면에서 '부양가족에 추가' 안내를 띄운다.
 */
import { ageOf, expenseEligibilityNote, shouldExcludeBasicDeduction } from './eligibility.js';

const cleanName = (v) => String(v || '').replace(/\(.*?\)/g, '').trim();

/** 생년월일을 YYMMDD 6자리로 통일 (주민번호 앞자리 우선, "1981.01.01" 같은 8자리 표기도 처리) */
export const toBirth6 = (person) => {
  const fromRrn = String(person?.rrn || '').replace(/[^0-9]/g, '');
  if (fromRrn.length >= 6) return fromRrn.slice(0, 6);
  const d = String(person?.birth || '').replace(/[^0-9]/g, '');
  if (d.length >= 8 && /^(19|20)/.test(d)) return d.slice(2, 8);
  return d.slice(0, 6);
};

const isSameName = (famName, pName) => {
  if (famName === pName) return true;
  if (pName.includes('*')) {
    const prefix = pName.replace(/\*/g, '');
    return Boolean(prefix) && famName.startsWith(prefix);
  }
  return false;
};

export const isSamePerson = (fam, p) => {
  const famBirth = toBirth6(fam);
  const pBirth = toBirth6(p);
  const birthMatch = Boolean(famBirth && pBirth && famBirth === pBirth);
  const famName = cleanName(fam.name);
  const pName = cleanName(p.name);
  const nameMatch = isSameName(famName, pName);
  if (famBirth && pBirth && famName && pName) return birthMatch && nameMatch;
  return birthMatch || nameMatch;
};

/** @returns {{ matched: Array, unmatched: Array }} */
export function matchHometaxPersons(rawPersons = [], familyList = []) {
  const persons = Array.isArray(rawPersons) ? rawPersons : [];
  const fams = Array.isArray(familyList) ? familyList : [];
  if (persons.length === 0 || fams.length === 0) return { matched: [], unmatched: [] };
  const matched = [];
  const unmatched = [];
  // 간소화 PDF의 첫 사람은 자료를 내려받은 근로자 본인. 화면 본인 이름(로그인 이름)과 달라도 본인으로 맞춘다.
  const selfFam = fams.find((f) => f.isSelf || f.relation === '본인');
  const selfTaken = selfFam && persons.some((p) => isSamePerson(selfFam, p));
  persons.forEach((p, idx) => {
    let fam = fams.find((f) => isSamePerson(f, p));
    if (!fam && idx === 0 && selfFam && !selfTaken) fam = selfFam;
    if (fam) {
      matched.push({
        ...p,
        relation: fam.relation || (fam.isSelf ? '본인' : '부양가족'),
        familyId: fam.id,
        eligibilityNote: expenseEligibilityNote(fam),
      });
    } else {
      unmatched.push(p);
    }
  });
  return { matched, unmatched };
}

/** PDF에만 있는 사람을 부양가족 목록 항목 모양으로 (관계·소득요건은 사용자가 고른 값) */
export function familyMemberFromHometaxPerson(p = {}, { relation, incomeOver = '초과하지 않음' } = {}) {
  const six = toBirth6(p);
  const yy = six ? parseInt(six.slice(0, 2), 10) : null;
  const year = yy === null ? null : (yy <= 25 ? 2000 + yy : 1900 + yy);
  const birth = six && year ? `${year}.${six.slice(2, 4)}.${six.slice(4, 6)}` : '';
  const member = {
    id: `nts_add_${Date.now()}_${cleanName(p.name)}`,
    name: cleanName(p.name),
    birth,
    rrn: six ? `${six}-*******` : '',
    relation: relation || '직계존속 (부/모)',
    nationality: '내국인',
    isPublic: true,
    incomeOver,
    basicDeduction: '기본공제 (150만 원)',
    seniorDeduction: '해당없음',
    disabledDeduction: '해당없음',
    womanDeduction: '해당없음',
    singleParentDeduction: '해당없음',
    isSelf: false,
  };
  if (shouldExcludeBasicDeduction(member)) {
    member.basicDeduction = '해당없음';
  } else if ((ageOf(member) ?? 0) >= 70) {
    member.seniorDeduction = '해당';
  }
  return member;
}

/** 관계 기본값: 만 60세 이상이면 직계존속, 만 20세 이하면 자녀 */
export function guessRelation(p = {}) {
  const six = toBirth6(p);
  if (!six) return '직계존속 (부/모)';
  const age = ageOf({ rrn: `${six}-` });
  if (age !== null && age >= 60) return '직계존속 (부/모)';
  if (age !== null && age <= 20) return '자녀,손자녀,입양자';
  return '형제자매';
}

