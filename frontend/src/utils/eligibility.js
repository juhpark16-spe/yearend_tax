/**
 * 부양가족 기본공제 요건 판정 유틸 (소득세법 제50조)
 * - 특정 인물 이름이 아니라 관계·생년월일·장애인 여부·소득요건으로만 판정한다.
 */
export const TAX_YEAR = 2025;

export const cleanPersonName = (name) =>
  String(name || '')
    .replace(/\(부양가족\)/g, '')
    .replace(/부양가족/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

/** 생년(4자리) 추정: 'YYYY.MM.DD' / 'YYYYMMDD' / 주민번호 앞 6자리(+성별 자리) 지원 */
export const birthYearOf = (person = {}) => {
  const birth = String(person.birth || person.birthDate || '').trim();
  const m4 = birth.match(/^(19\d{2}|20\d{2})/);
  if (m4) return parseInt(m4[1], 10);
  const src = birth || String(person.rrn || '');
  const digits = src.replace(/[^0-9]/g, '');
  if (digits.length < 6) return null;
  const yy = parseInt(digits.slice(0, 2), 10);
  const rrnDigits = String(person.rrn || '').replace(/[^0-9*]/g, '');
  const g = rrnDigits.length >= 7 ? rrnDigits[6] : '';
  if (['1', '2', '5', '6'].includes(g)) return 1900 + yy;
  if (['3', '4', '7', '8'].includes(g)) return 2000 + yy;
  return yy <= TAX_YEAR % 100 ? 2000 + yy : 1900 + yy;
};

export const ageOf = (person = {}) => {
  const by = birthYearOf(person);
  return by === null ? null : TAX_YEAR - by;
};

export const isDisabledMember = (m = {}) =>
  Boolean(m.isDisabled || (m.disabledDeduction && m.disabledDeduction !== '해당없음'));

export const isIncomeExcessMember = (m = {}) =>
  Boolean(m.incomeExcess || m.income_excess || m.incomeOver === '초과함');

/**
 * 나이 요건 미충족 여부
 * - 본인·배우자: 나이 요건 없음
 * - 장애인: 나이 요건 없음
 * - 자녀·손자녀·입양자: 만 20세 이하
 * - 직계존속: 만 60세 이상
 * - 형제자매: 만 20세 이하 또는 만 60세 이상
 */
export const failsAgeRequirement = (m = {}) => {
  const rel = String(m.relation || '');
  if (m.isSelf || rel.includes('본인') || rel === '배우자') return false;
  if (isDisabledMember(m)) return false;
  const age = ageOf(m);
  if (age === null) return false;
  if (rel.includes('자녀') || rel.includes('손자') || rel.includes('입양') || rel.includes('직계비속')) return age > 20;
  if (rel.includes('존속') || rel.includes('부/모') || rel.includes('부모')) return age < 60;
  if (rel.includes('형제') || rel.includes('자매')) return age > 20 && age < 60;
  return false;
};

/** 기본공제 '해당없음'으로 보정해야 하는지 (소득요건 초과 또는 나이요건 미충족) */
export const shouldExcludeBasicDeduction = (m = {}) =>
  !m.isSelf && m.relation !== '본인' && (isIncomeExcessMember(m) || failsAgeRequirement(m));

const isChildRelation = (rel = '') => /자녀|손자|입양|직계비속|위탁/.test(String(rel));

/**
 * 출산·입양 세액공제 대상 여부 (소득세법 제59조의2 ③)
 * - 해당 과세연도에 출생했거나(isNewborn) 입양 신고한(isAdoptedThisYear) 자녀
 */
export const isNewbornOrAdopted = (m = {}, taxYear = TAX_YEAR) => {
  if (!isChildRelation(m.relation)) return false;
  if (m.isNewborn || m.isAdoptedThisYear) return true;
  return birthYearOf(m) === Number(taxYear);
};

/**
 * 몇째 자녀인지 판정: 입력값(birthOrder)이 있으면 그 값,
 * 없으면 가족 목록의 자녀를 출생연도가 빠른 순(같으면 목록 순)으로 세어 판정
 */
export const birthOrderOf = (m = {}, familyList = []) => {
  const given = Number(m.birthOrder);
  if (given > 0) return given;
  const children = (Array.isArray(familyList) ? familyList : [])
    .map((c, i) => ({ c, i, y: birthYearOf(c) ?? 9999 }))
    .filter((x) => isChildRelation(x.c.relation))
    .sort((a, b) => a.y - b.y || a.i - b.i);
  const idx = children.findIndex((x) => x.c === m);
  return idx >= 0 ? idx + 1 : 1;
};
