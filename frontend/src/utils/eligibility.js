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

/**
 * 기본공제에서 빠진 가족이라도 공제받을 수 있는 지출 항목 (국세청 연말정산 안내 '부양가족 공제요건' 표)
 * - 보장성보험료: 나이·소득 요건 모두 필요
 * - 의료비: 나이·소득 요건 없음 (근로기간 지출분)
 * - 교육비: 소득 요건만 (직계존속 제외, 장애인특수교육비는 소득 요건 없고 직계존속도 가능)
 * - 신용카드 등: 소득 요건만 (형제자매 제외)
 * - 기부금: 소득 요건만 (정치자금·고향사랑·우리사주조합 기부금은 본인만)
 */
export const isSiblingRelation = (rel = '') => /형제|자매/.test(String(rel));
export const isAscendantRelation = (rel = '') => /존속|부\/모|부모|조부|조모/.test(String(rel));

export const expenseEligibility = (m = null, { incomeExcess = false } = {}) => {
  const isSelf = Boolean(m?.isSelf || m?.relation === '본인');
  if (isSelf) {
    return { insurance: true, medical: true, education: true, specialEducation: true, card: true, donation: true };
  }
  const rel = String(m?.relation || '');
  const incomeOk = !(incomeExcess || (m && isIncomeExcessMember(m)));
  const ageOk = !(m && failsAgeRequirement(m));
  return {
    insurance: incomeOk && ageOk,
    medical: true,
    education: incomeOk && !isAscendantRelation(rel),
    specialEducation: true,
    card: incomeOk && !isSiblingRelation(rel),
    donation: incomeOk,
  };
};

/** 본인만 공제되는 기부금 종류 */
export const isSelfOnlyDonationType = (type = '') => /정치자금|고향사랑|우리사주/.test(String(type));

/** 기본공제 제외 가족에게 보여 줄 '그래도 공제되는 항목' 안내 (해당 없으면 '') */
export const expenseEligibilityNote = (m = {}) => {
  if (!m || m.isSelf || m.relation === '본인' || !shouldExcludeBasicDeduction(m)) return '';
  const e = expenseEligibility(m);
  const labels = [
    e.insurance && '보장성보험료',
    e.medical && '의료비',
    e.education && '교육비',
    e.card && '신용카드 등',
    e.donation && '기부금',
  ].filter(Boolean);
  if (labels.length === 1) return '기본공제는 제외되지만 의료비는 공제됩니다 (나이·소득 요건 없음)';
  const last = labels[labels.length - 1];
  const code = last.charCodeAt(last.length - 1) - 0xac00;
  const josa = code >= 0 && code % 28 !== 0 ? '은' : '는';
  return `기본공제는 제외되지만 ${labels.join('·')}${josa} 공제됩니다`;
};
