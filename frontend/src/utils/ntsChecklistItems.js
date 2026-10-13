/**
 * 국세청 간소화 PDF에서 읽은 체크리스트 항목(주택자금·주택마련저축·소기업소상공인) → 공제자료 입력 항목
 * - 서버가 PDF 표에서 행 단위로 뽑은 상세(housing_loan_details 등)만 사용한다.
 * - 샘플 금액·기관명을 코드에 두지 않는다: PDF에 해당 자료가 없으면 빈 목록을 돌려준다.
 */

const readSavedHometax = () => {
  try {
    const saved = localStorage.getItem('hometax_extracted_data');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

/** 루트 → 인별(persons) 순서로 상세 목록을 찾는다 (화면 상태가 없으면 저장된 분석 결과 사용) */
export function collectNtsDetails(hometaxData, key) {
  const sources = [hometaxData, hometaxData ? null : readSavedHometax()].filter(Boolean);
  for (const src of sources) {
    if (Array.isArray(src?.[key]) && src[key].length > 0) return src[key];
    const persons = src?.matchedPersons || src?.persons || [];
    const fromPersons = persons.flatMap((p) => (Array.isArray(p?.[key]) ? p[key] : []));
    if (fromPersons.length > 0) return fromPersons;
  }
  return [];
}

/** 어느 PDF에서 만든 항목인지 표시 (다른 PDF를 올리면 이전 PDF로 만든 항목을 새로 만든다) */
export const ntsSourceKey = (hometaxData) => {
  const d = hometaxData || readSavedHometax() || {};
  return `${d.fileName || ''}|${d.size || ''}`;
};

/** 기존 항목 중 지금 PDF로 만든 국세청 항목이 있는지 */
export const hasCurrentNtsItems = (items = [], key) =>
  items.some((i) => (i.isNts || i.source === 'nts') && i.ntsKey === key);

const cleanName = (n) => String(n || '본인').replace(/\(.*?\)/g, '').trim() || '본인';

/** 장기주택저당차입금 공제 구분 (입력 화면 determineFinalType과 같은 규칙) */
export function classifyMortgageType(row = {}) {
  const startYear = parseInt(String(row.startDate || '').slice(0, 4), 10);
  const is2011 = Number.isFinite(startYear) && startYear <= 2011;
  const y = Number(row.periodYears) || 15;
  const fixed = Number(row.fixedRateAmount) > 0;
  const nonGrace = Number(row.nonGraceAmount) > 0;
  if (!is2011) {
    if (y >= 15) {
      if (fixed && nonGrace) return '장기주택저당차입금(2012이후 15년이상 고정AND비거치)';
      if (fixed || nonGrace) return '장기주택저당차입금(2012이후 15년이상 고정OR비거치)';
      return '장기주택저당차입금(2012이후 15년이상 기타)';
    }
    return '장기주택저당차입금(2012이후 10~15년 고정OR비거치)';
  }
  if (y >= 15 && fixed && nonGrace) return '장기주택저당차입금(2011이전 15년이상 고정AND비거치)';
  if (y >= 15 && (fixed || nonGrace)) return '장기주택저당차입금(2011이전 15년이상 고정OR비거치)';
  if (y >= 30) return '장기주택저당차입금(2011이전 30년이상)';
  if (y >= 15) return '장기주택저당차입금(2011이전 15~29년)';
  return '장기주택저당차입금(2011이전 15년미만)';
}

export function buildNtsHousingLoanItems(hometaxData, workerName, ntsKey = ntsSourceKey(hometaxData)) {
  const name = cleanName(workerName);
  return collectNtsDetails(hometaxData, 'housing_loan_details')
    .filter((r) => Number(r.amount) > 0)
    .map((r, idx) => {
      const isMortgage = r.kind === 'mortgage';
      return {
        id: `nts_hloan_${isMortgage ? 'mort' : 'rent'}_${idx + 1}`,
        name,
        relation: '본인',
        type: isMortgage ? classifyMortgageType(r) : '주택임차차입금(대출기관)',
        bank: r.bank || '',
        bizNumber: r.bizNumber || '',
        account: isMortgage ? (r.product || '') : (r.account || ''),
        startDate: r.startDate || '',
        endDate: r.endDate || '',
        period: isMortgage && r.periodYears ? `${r.periodYears}년` : '',
        acquisitionDate: r.acquisitionDate || '',
        mortgageDate: r.mortgageDate || '',
        amount: Number(r.amount) || 0,
        isNts: true,
        source: 'nts',
        ntsKey,
      };
    });
}

export function buildNtsHousingSavingsItems(hometaxData, workerName, ntsKey = ntsSourceKey(hometaxData)) {
  const name = cleanName(workerName);
  return collectNtsDetails(hometaxData, 'housing_savings_details')
    .filter((r) => Number(r.amount) > 0)
    .map((r, idx) => ({
      id: `nts_hsavings_${idx + 1}`,
      name,
      relation: '본인',
      type: r.type || '주택청약종합저축',
      bank: r.bank || '',
      account: r.account || '',
      amount: Number(r.amount) || 0,
      joinDate: r.joinDate || '',
      isTerminated: false,
      isNts: true,
      source: 'nts',
      ntsKey,
    }));
}

export function buildNtsSmallBizItems(hometaxData, workerName, ntsKey = ntsSourceKey(hometaxData)) {
  const name = cleanName(workerName);
  return collectNtsDetails(hometaxData, 'small_biz_details')
    .filter((r) => Number(r.amount) > 0)
    .map((r, idx) => ({
      id: r.id || `nts_sbiz_${idx + 1}`,
      name: r.name || name,
      relation: '본인',
      type: r.type || '소기업소상공인 공제부금',
      bizType: r.bizType || '',
      joinPeriod: r.joinPeriod || '',
      bank: r.bank || '중소기업중앙회',
      account: r.account || '',
      contractNo: r.contractNo || r.account || '',
      amount: Number(r.amount) || 0,
      isNts: true,
      source: 'nts',
      ntsKey,
    }));
}
