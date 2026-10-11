/**
 * 2025 귀속 대한민국 근로소득 연말정산 세액 계산 유틸리티
 * 
 * 데이터 연계:
 * 1. 원천징수자료 (Withholding): 주근무지 총급여, 비과세, 기납부소득세, 기납부지방소득세
 * 2. 종전근무지 (Previous Jobs): 이전 직장별 총급여, 기납부소득세 합산
 * 3. 공제자료 (DataInput / Hometax):
 *    - 인적공제: 본인, 배우자, 부양가족, 경로우대, 장애인 등
 *    - 소득공제: 국민연금, 건강보험, 고용보험, 주택자금, 주택마련저축, 신용카드, 노란우산, 장기펀드
 *    - 세액감면/세액공제: 근로소득세액공제, 자녀세액공제, 연금계좌, 보장성보험, 의료비, 교육비, 기부금, 혼인, 월세액
 *    - 전년도 이월 기부금(특례·일반, 10년): deductionData.donationCarryoverItems
 *
 * 계산 흐름 (백엔드 TaxCalculationService와 같은 규칙):
 *  총급여 → 근로소득공제 → 근로소득금액 → 인적공제·소득공제(종합한도 2,500만원) → 과세표준 → 산출세액
 *  → [특별세액공제 vs 표준세액공제: 두 경우 결정세액 비교, 표준 쪽은 특별소득공제 제외 후 재계산]
 *  → 세액감면·공제를 소득세법 제60조 순서로 산출세액 범위 안에서 배분 → 결정세액 → 차감징수(환급)세액
 */

import { classifyPensionType, calculatePensionAccountCredit } from './pensionLimit.js';
import { birthOrderOf, isNewbornOrAdopted, shouldExcludeBasicDeduction, cleanPersonName, failsAgeRequirement, isIncomeExcessMember } from './eligibility.js';

/**
 * 연금저축/연금계좌 조회페이지(PensionSection)의 연금 항목 목록 수집 헬퍼
 * - deductionData.pensionItems 우선
 * - localStorage의 selftax_deduction_data, selftax_other_pension 및 hometaxData 종합 연계
 */
export function collectPensionItems({ deductionData, hometaxData, userName = '' } = {}) {
  let list = [];
  if (Array.isArray(deductionData?.pensionItems) && deductionData.pensionItems.length > 0) {
    list = [...deductionData.pensionItems];
  } else {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedDed = localStorage.getItem('selftax_deduction_data');
        if (savedDed) {
          const parsed = JSON.parse(savedDed);
          if (Array.isArray(parsed?.pensionItems) && parsed.pensionItems.length > 0) {
            list = [...parsed.pensionItems];
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 기타자료(localStorage: selftax_other_pension) 중 누락된 항목 병합
  try {
    if (typeof localStorage !== 'undefined') {
      const otherSaved = localStorage.getItem('selftax_other_pension');
      if (otherSaved) {
        const others = JSON.parse(otherSaved);
        if (Array.isArray(others)) {
          others.forEach((o) => {
            if (!list.some((existing) => existing.id === o.id)) {
              list.push(o);
            }
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // 국세청 간소화 데이터(hometaxData)에 pension_details가 있고 list에 반영되지 않았다면 병합
  const hasNtsInList = list.some((i) => i.isNts || (i.id && String(i.id).startsWith('nts_')));
  if (!hasNtsInList && hometaxData) {
    if (Array.isArray(hometaxData?.persons)) {
      hometaxData.persons.forEach((p, idx) => {
        const rawName = (p.name || userName || '본인').replace(/\(.*?\)/g, '').trim();
        const isWorker = idx === 0 || p.isSelf || (userName && rawName.includes(userName));
        const pRel = isWorker ? '본인' : (p.relation || '본인');
        const pName = rawName;
        if (Array.isArray(p.pension_details) && p.pension_details.length > 0) {
          p.pension_details.forEach((pd, pIdx) => {
            let pType = pd.type || '연금저축';
            if (pType.includes('ISA퇴직연금') || (/isa/i.test(pType) && (pType.includes('퇴직') || pType.includes('IRP')))) {
              pType = 'ISA퇴직연금';
            } else if (pType.includes('ISA연금저축') || (/isa/i.test(pType) && pType.includes('연금저축'))) {
              pType = 'ISA연금저축';
            } else if (pType.includes('IRP') || pType.includes('퇴직')) {
              pType = '퇴직연금';
            } else if (pType.includes('개인연금')) {
              pType = '개인연금저축';
            } else {
              pType = '연금저축';
            }
            list.push({
              id: `nts_pension_${pName}_${pIdx}_${idx}`,
              name: pName,
              relation: pRel,
              type: pType,
              bank: pd.bank || '국세청 간소화',
              account: pd.account || '',
              startDate: pd.startDate || '',
              rawAmount: Number(pd.raw_amount || pd.amount || 0),
              amount: Number(pd.amount || pd.raw_amount || 0),
              isNts: true,
              source: 'nts',
            });
          });
        }
      });
    }

    if (Array.isArray(hometaxData?.pension_details) && hometaxData.pension_details.length > 0) {
      hometaxData.pension_details.forEach((pd, pIdx) => {
        let pType = pd.type || '연금저축';
        if (pType.includes('ISA퇴직연금') || (/isa/i.test(pType) && (pType.includes('퇴직') || pType.includes('IRP')))) {
          pType = 'ISA퇴직연금';
        } else if (pType.includes('ISA연금저축') || (/isa/i.test(pType) && pType.includes('연금저축'))) {
          pType = 'ISA연금저축';
        } else if (pType.includes('IRP') || pType.includes('퇴직')) {
          pType = '퇴직연금';
        } else if (pType.includes('개인연금')) {
          pType = '개인연금저축';
        } else {
          pType = '연금저축';
        }
        list.push({
          id: `nts_pension_top_${pIdx}`,
          name: userName || '본인',
          relation: '본인',
          type: pType,
          bank: pd.bank || '국세청 간소화',
          account: pd.account || '',
          startDate: pd.startDate || '',
          rawAmount: Number(pd.raw_amount || pd.amount || 0),
          amount: Number(pd.amount || pd.raw_amount || 0),
          isNts: true,
          source: 'nts',
        });
      });
    }
  }

  return list;
}

/**
 * 기부금 세액공제용 기부금 항목 목록 수집 (단일 소스 보장)
 * - deductionData.donationItems
 * - localStorage의 selftax_deduction_data, selftax_other_donation
 * - hometaxData의 persons[].donation_details 병합
 */
export function collectDonationItems({ deductionData, hometaxData, userName = '' } = {}) {
  let list = [];
  if (Array.isArray(deductionData?.donationItems) && deductionData.donationItems.length > 0) {
    list = [...deductionData.donationItems];
  } else {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedDed = localStorage.getItem('selftax_deduction_data');
        if (savedDed) {
          const parsed = JSON.parse(savedDed);
          if (Array.isArray(parsed?.donationItems) && parsed.donationItems.length > 0) {
            list = [...parsed.donationItems];
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 기타자료(localStorage: selftax_other_donation) 중 누락된 항목 병합
  try {
    if (typeof localStorage !== 'undefined') {
      const otherSaved = localStorage.getItem('selftax_other_donation');
      if (otherSaved) {
        const others = JSON.parse(otherSaved);
        if (Array.isArray(others)) {
          others.forEach((o) => {
            if (!list.some((existing) => existing.id === o.id)) {
              list.push(o);
            }
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // 국세청 간소화 데이터(hometaxData)에 donation_details가 있고 list에 반영되지 않았다면 병합
  const hasNtsInList = list.some((i) => i.isNts || (i.id && String(i.id).startsWith('nts_')));
  if (!hasNtsInList && hometaxData) {
    if (Array.isArray(hometaxData?.persons)) {
      hometaxData.persons.forEach((p, idx) => {
        const rawName = (p.name || userName || '본인').replace(/\(.*?\)/g, '').trim();
        const isWorker = idx === 0 || p.isSelf || (userName && rawName.includes(userName));
        const pRel = isWorker ? '본인' : (p.relation || '부양가족');
        const donDetails = Array.isArray(p.donation_details) && p.donation_details.length > 0
          ? p.donation_details
          : (Array.isArray(p.items?.donation_details) && p.items.donation_details.length > 0 ? p.items.donation_details : []);
        if (donDetails.length > 0) {
          donDetails.forEach((d, dIdx) => {
            list.push({
              id: `nts_don_${rawName}_${dIdx}_${idx}`,
              name: rawName,
              relation: pRel,
              type: d.type || d.donation_type || d.raw_type || '특례(법정)기부금',
              company: d.company || d.org_name || d.단체명 || '기부처',
              bizNumber: d.biz_number || '',
              amount: Number(d.amount ?? d.total_amount ?? 0),
              rewardAmount: Number(d.reward_amount ?? 0),
              isNts: true,
              source: 'nts',
            });
          });
        }
      });
    }
  }

  return list;
}

/**
 * 전년도 이월 기부금 (소득세법 제61조 ②, 제59조의4 ④)
 * - 이월 대상: 특례기부금, 일반기부금(종교단체 외·종교단체)만 해당
 *   (정치자금·고향사랑·우리사주조합기부금은 이월공제가 허용되지 않음)
 * - 이월 기간: 2013.1.1. 이후 지출분부터 10년 → 2025년 귀속은 2015~2024년 지출분
 * - 이월분은 같은 종류의 당해연도 기부금보다 먼저, 기부연도가 빠른 것부터 공제
 */
export const DONATION_CARRYOVER_TYPES = ['특례기부금', '일반기부금(종교단체외)', '일반기부금(종교단체)'];
export const DONATION_CARRYOVER_YEARS = 10;

export function carryoverKindOf(type) {
  const t = String(type || '').replace(/\s/g, '');
  if (t.includes('특례') || t.includes('법정')) return 'special';
  if (t.includes('종교단체외')) return 'generalNonReligious';
  if (t.includes('종교')) return 'generalReligious';
  return 'generalNonReligious';
}

export function normalizeDonationCarryoverItems(items = [], taxYear = 2025) {
  const ty = Number(taxYear) || 2025;
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      id: it.id,
      year: Number(it.year) || 0,
      kind: carryoverKindOf(it.type),
      type: it.type,
      amount: Math.max(0, Math.floor(Number(String(it.amount ?? '').replace(/[^0-9]/g, '')) || 0)),
    }))
    .filter((it) => it.amount > 0 && it.year >= ty - DONATION_CARRYOVER_YEARS && it.year <= ty - 1)
    .sort((a, b) => a.year - b.year);
}

/**
 * 기부금 세액공제 (소득세법 제59조의4 ④, 조세특례제한법 제76조·제58조·제88조의4 ⑬)
 * 공제대상금액 한도는 아래 순서로 앞 종류의 공제대상금액을 빼고 계산한다.
 *  ① 정치자금(본인): 근로소득금액 100%  — 10만원 이하 100/110, 10만원 초과 15%, 3천만원 초과분 25%
 *  ② 고향사랑(본인): (근로소득금액 − ①) 100%, 연 2,000만원 — 10만원 이하 100/110, 초과 15%(특별재난지역 30%)
 *  ③ 특례: (근로소득금액 − ① − ②) 100%
 *  ④ 우리사주조합(본인): (근로소득금액 − ① − ② − ③) 30%
 *  ⑤ 일반: 기준 = 근로소득금액 − ① − ② − ③ − ④
 *       종교단체 기부금이 있으면 기준×10% + min(기준×20%, 종교단체 외 기부금), 없으면 기준×30%
 *       (종교단체 외 기부금을 먼저 공제)
 *  특례·우리사주·일반 공제율: 합계 1천만원 이하 15%, 초과분 30% (③→④→⑤ 순으로 구간 적용)
 *  이월 기부금은 같은 종류의 당해연도 기부금보다 먼저 한도를 사용한다.
 *  (이월분 공제율은 현행 15%/30%를 적용 — 2015년 이전 지출분의 지출연도 공제율 특례는 반영하지 않음)
 */
export function calculateDonationCredit({
  donationItems = [],
  earnedIncome = 0,
  userName = '',
  fallbackAmount = 0,
  carryoverItems = [],
  taxYear = 2025,
} = {}) {
  let polPaid = 0;
  let homeGenPaid = 0;
  let homeDisPaid = 0;
  let empPaid = 0;
  let specPaid = 0;
  let genNonRelPaid = 0;
  let genRelPaid = 0;

  const hasItems = Array.isArray(donationItems) && donationItems.length > 0;
  (hasItems ? donationItems : []).forEach((it) => {
    const rawType = String(it.type || it.raw_type || it.category || '');
    const amt = Number(it.amount) || 0;
    if (amt <= 0) return;

    const pName = String(it.name || '').replace(/\(.*?\)/g, '').trim();
    const isSelf =
      !it.relation ||
      it.relation === '본인' ||
      (userName && pName.includes(userName)) ||
      pName === '본인';

    if (rawType.includes('정치')) {
      if (isSelf) polPaid += amt;
    } else if (rawType.includes('고향사랑') || rawType.includes('고향')) {
      if (isSelf) {
        if (rawType.includes('특별재난')) homeDisPaid += amt;
        else homeGenPaid += amt;
      }
    } else if (rawType.includes('우리사주')) {
      if (isSelf) empPaid += amt;
    } else if (rawType.includes('특례') || rawType.includes('법정')) {
      specPaid += amt;
    } else if (rawType.includes('종교단체일반') || (rawType.includes('종교') && !rawType.includes('종교단체외'))) {
      genRelPaid += amt;
    } else {
      genNonRelPaid += amt;
    }
  });
  // 종류별 내역이 없고 합계만 있으면 종교단체 외 일반기부금으로 본다
  if (!hasItems && Number(fallbackAmount) > 0) genNonRelPaid = Math.floor(Number(fallbackAmount));

  // 전년도 이월 기부금 (기부연도 빠른 순)
  const carryEntries = normalizeDonationCarryoverItems(carryoverItems, taxYear).map((e) => ({ ...e, used: 0 }));
  const carryPaid = { special: 0, generalNonReligious: 0, generalReligious: 0 };
  carryEntries.forEach((e) => { carryPaid[e.kind] += e.amount; });
  // 한도 room 안에서 같은 종류 이월분을 오래된 연도부터 사용
  const useCarry = (kind, room) => {
    let left = Math.max(0, room);
    let used = 0;
    carryEntries.filter((e) => e.kind === kind).forEach((e) => {
      const u = Math.min(e.amount, left);
      e.used = u;
      left -= u;
      used += u;
    });
    return used;
  };

  const ei = Math.max(0, Math.floor(Number(earnedIncome) || 0));

  // ① 정치자금기부금 (한도: 근로소득금액)
  const polElig = Math.min(polPaid, ei);
  const politicalCredit =
    Math.floor((Math.min(polElig, 100000) * 100) / 110) +
    Math.floor(Math.min(Math.max(0, polElig - 100000), 29900000) * 0.15) +
    Math.floor(Math.max(0, polElig - 30000000) * 0.25);

  // ② 고향사랑기부금 (한도: 근로소득금액 − ①, 연 2,000만원)
  const homeLimit = Math.max(0, Math.min(20000000, ei - polElig));
  const homeTotal = Math.min(homeGenPaid + homeDisPaid, homeLimit);
  const hometownUnder10Credit = Math.floor((Math.min(homeTotal, 100000) * 100) / 110);
  const homeOver10 = Math.max(0, homeTotal - 100000);
  // 10만원 초과분은 특별재난지역 기부금(30%)부터 배정
  const homeDisOver10 = Math.min(homeDisPaid, homeOver10);
  const hometownDisasterOver10Credit = Math.floor(homeDisOver10 * 0.30);
  const hometownGeneralOver10Credit = Math.floor((homeOver10 - homeDisOver10) * 0.15);
  const hometownCredit = hometownUnder10Credit + hometownDisasterOver10Credit + hometownGeneralOver10Credit;

  // ③ 특례기부금 (한도: 근로소득금액 − ① − ②), 이월분 먼저
  let specRoom = Math.max(0, ei - polElig - homeTotal);
  const specCarryElig = useCarry('special', specRoom);
  specRoom -= specCarryElig;
  const specElig = Math.min(specPaid, specRoom);

  // ④ 우리사주조합기부금 (한도: (근로소득금액 − ① − ② − ③) × 30%)
  const afterSpecial = Math.max(0, ei - polElig - homeTotal - specCarryElig - specElig);
  const empElig = Math.min(empPaid, Math.floor(afterSpecial * 0.30));

  // ⑤ 일반기부금 (종교단체 외 → 종교단체, 각각 이월분 먼저)
  const genBase = Math.max(0, afterSpecial - empElig);
  const hasReligious = genRelPaid + carryPaid.generalReligious > 0;
  const nonReligiousTotal = genNonRelPaid + carryPaid.generalNonReligious;
  const genLimit = hasReligious
    ? Math.floor(genBase * 0.10) + Math.min(Math.floor(genBase * 0.20), nonReligiousTotal)
    : Math.floor(genBase * 0.30);
  let genRoom = genLimit;
  const genNonRelCarryElig = useCarry('generalNonReligious', genRoom);
  genRoom -= genNonRelCarryElig;
  const genNonRelElig = Math.min(genNonRelPaid, genRoom);
  genRoom -= genNonRelElig;
  const genRelCarryElig = useCarry('generalReligious', genRoom);
  genRoom -= genRelCarryElig;
  const genRelElig = Math.min(genRelPaid, genRoom);

  // 특례·우리사주·일반 공제율: 합계 1천만원 이하 15%, 초과분 30%
  let tierUsed = 0;
  const tierCredit = (amt) => {
    const low = Math.min(amt, Math.max(0, 10000000 - tierUsed));
    tierUsed += amt;
    return Math.floor(low * 0.15 + (amt - low) * 0.30);
  };
  const specialCarryCredit = tierCredit(specCarryElig);
  const specialCurrentCredit = tierCredit(specElig);
  const employeeStockCredit = tierCredit(empElig);
  const generalNonReligiousCarryCredit = tierCredit(genNonRelCarryElig);
  const generalNonReligiousCurrentCredit = tierCredit(genNonRelElig);
  const generalReligiousCarryCredit = tierCredit(genRelCarryElig);
  const generalReligiousCurrentCredit = tierCredit(genRelElig);

  const specialCredit = specialCarryCredit + specialCurrentCredit;
  const generalNonReligiousCredit = generalNonReligiousCarryCredit + generalNonReligiousCurrentCredit;
  const generalReligiousCredit = generalReligiousCarryCredit + generalReligiousCurrentCredit;
  const totalCredit = politicalCredit + hometownCredit + specialCredit + employeeStockCredit + generalNonReligiousCredit + generalReligiousCredit;
  const totalPaid = polPaid + homeGenPaid + homeDisPaid + empPaid + specPaid + genNonRelPaid + genRelPaid;

  // 한도초과로 공제받지 못한 당해연도 특례·일반기부금 (다음 과세기간 이월 대상)
  const limitExcess = {
    special: Math.max(0, specPaid - specElig),
    generalNonReligious: Math.max(0, genNonRelPaid - genNonRelElig),
    generalReligious: Math.max(0, genRelPaid - genRelElig),
  };

  // 산출세액 배분용 덩어리 (이월분 → 당해분, 공제대상금액과 세액)
  const chunks = {
    specialCarry: { amount: specCarryElig, credit: specialCarryCredit },
    specialCurrent: { amount: specElig, credit: specialCurrentCredit },
    generalNonReligiousCarry: { amount: genNonRelCarryElig, credit: generalNonReligiousCarryCredit },
    generalNonReligiousCurrent: { amount: genNonRelElig, credit: generalNonReligiousCurrentCredit },
    generalReligiousCarry: { amount: genRelCarryElig, credit: generalReligiousCarryCredit },
    generalReligiousCurrent: { amount: genRelElig, credit: generalReligiousCurrentCredit },
  };

  return {
    totalCredit,
    politicalCredit,
    hometownCredit,
    specialCredit,
    specialCarryCredit,
    specialCurrentCredit,
    employeeStockCredit,
    generalNonReligiousCredit,
    generalNonReligiousCarryCredit,
    generalNonReligiousCurrentCredit,
    generalReligiousCredit,
    generalReligiousCarryCredit,
    generalReligiousCurrentCredit,
    chunks,
    carryover: { entries: carryEntries, paid: carryPaid, limitExcess },
    details: {
      totalPaid,
      totalCredit,
      politicalPaid: polPaid,
      politicalCredit,
      hometownPaid: homeTotal,
      hometownCredit,
      hometownUnder10Credit,
      hometownDisasterOver10Credit,
      hometownGeneralOver10Credit,
      specialPaid: specPaid,
      specialCarryPaid: carryPaid.special,
      specialCredit,
      employeeStockPaid: empPaid,
      employeeStockCredit,
      generalNonReligiousPaid: genNonRelPaid,
      generalNonReligiousCarryPaid: carryPaid.generalNonReligious,
      generalNonReligiousCredit,
      generalReligiousPaid: genRelPaid,
      generalReligiousCarryPaid: carryPaid.generalReligious,
      generalReligiousCredit,
    },
  };
}

// 1. 근로소득공제 계산 (2025년 기준, 최대 2,000만원 한도)
export function calculateEarnedIncomeDeduction(salary) {
  const s = Math.max(0, Number(salary) || 0);
  if (s <= 5000000) return Math.floor(s * 0.7);
  if (s <= 15000000) return Math.floor(3500000 + (s - 5000000) * 0.4);
  if (s <= 45000000) return Math.floor(7500000 + (s - 15000000) * 0.15);
  if (s <= 100000000) return Math.floor(12000000 + (s - 45000000) * 0.05);
  return Math.min(20000000, Math.floor(14750000 + (s - 100000000) * 0.02));
}

// 2. 종합소득세 기본세율 적용 산출세액 (2025년 8단계 누진세율)
export function calculateIncomeTax(taxBase) {
  const tb = Math.max(0, Math.floor(Number(taxBase) || 0));
  if (tb <= 14000000) return Math.floor(tb * 0.06);
  if (tb <= 50000000) return Math.floor(840000 + (tb - 14000000) * 0.15);
  if (tb <= 88000000) return Math.floor(6240000 + (tb - 50000000) * 0.24);
  if (tb <= 150000000) return Math.floor(15360000 + (tb - 88000000) * 0.35);
  if (tb <= 300000000) return Math.floor(37060000 + (tb - 150000000) * 0.38);
  if (tb <= 500000000) return Math.floor(94060000 + (tb - 300000000) * 0.40);
  if (tb <= 1000000000) return Math.floor(174060000 + (tb - 500000000) * 0.42);
  return Math.floor(384060000 + (tb - 1000000000) * 0.45);
}

// 3. 근로소득세액공제 계산 (산출세액 기준)
export function calculateEarnedIncomeTaxCredit(calculatedTax, grossSalary, reductionSme = 0) {
  const ct = Math.max(0, Number(calculatedTax) || 0);
  const gs = Math.max(0, Number(grossSalary) || 0);
  const redSme = Math.max(0, Number(reductionSme) || 0);
  if (ct <= 0 || gs <= 0) return 0;

  // 1) 산출세액 기준 공제세액
  // - 130만원 이하: 산출세액의 55%
  // - 130만원 초과: 71만5천원 + 130만원 초과금액의 100분의 30 (30%)
  let credit = 0;
  if (ct <= 1300000) {
    credit = ct * 0.55;
  } else {
    credit = 715000 + (ct - 1300000) * 0.3;
  }

  // 2) 세액공제 금액한도 (20만원 ~ 74만원) (총급여액 기준)
  // - 3천3백만원 이하: 74만원
  // - 3천3백만원 초과 7천만원 이하: 74만원 - [(총급여액 - 3천3백만원) * 0.008] -> (한도 66만원)
  // - 7천만원 초과 1억2천만원 이하: 66만원 - [(총급여액 - 7천만원) * 1/2] -> (한도 50만원)
  // - 1억2천만원 초과: 50만원 - [(총급여액 - 1억2천만원) * 1/2] -> (한도 20만원)
  let limit = 740000;
  if (gs <= 33000000) {
    limit = 740000;
  } else if (gs <= 70000000) {
    limit = Math.max(660000, Math.floor(740000 - (gs - 33000000) * 0.008));
  } else if (gs <= 120000000) {
    limit = Math.max(500000, Math.floor(660000 - (gs - 70000000) * 0.5));
  } else {
    limit = Math.max(200000, Math.floor(500000 - (gs - 120000000) * 0.5));
  }

  let baseCredit = Math.min(Math.floor(credit), limit);

  // 3) 중소기업취업청년 소득세감면이 있는 경우
  // 근로소득세액공제 X (1 - 감면급여비율)
  // * 감면급여비율 = 중소기업취업자소득세감면액 / 산출세액
  if (redSme > 0 && ct > 0) {
    const ratio = Math.max(0, 1 - (redSme / ct));
    baseCredit = Math.floor(baseCredit * ratio);
  }

  return baseCredit;
}

/**
 * 4. 신용카드 등 사용금액 소득공제 계산 (조세특례제한법 제126조의2)
 * 국세청 연말정산 신고안내의 산출식 기준:
 * 
 * - 최저사용금액 = 총급여 * 0.25
 * - 공제율:
 *   ㉮ 신용카드: 15%
 *   ㉯ 직불/선불카드: 30%
 *   ㉰ 현금영수증: 30%
 *   ㉱ 도서/공연/미술관/박물관/영화관람료/신문/체육 (문화체육): 30% (총급여 7천만원 이하만)
 *   ㉲ 전통시장: 40%
 *   ㉳ 대중교통: 40%
 * 
 * - 공제제외금액 산출 (*1): 최저사용금액을 15% -> 30% -> 40% 순으로 차감
 * - 공제가능금액 = 공제율금액 합계 - 공제제외금액
 * - 공제한도 (*2): 총급여 7천만 이하 300만원, 7천만 초과 250만원
 * - 일반공제금액 = Min[공제가능금액, 공제한도]
 * - 추가공제금액 (*3): Min[공제가능금액 - 공제한도(음수이면 0), 법정 추가공제한도]
 *   (단, 전통시장+대중교통+문화체육 공제율금액 합계 범위 내, 추가공제한도는 7천만 이하 300만, 7천만 초과 200만)
 * - 최종공제금액 = 일반공제금액 + 추가공제금액
 */
export function calculateCreditCardDeduction({
  totalSalary = 0,
  creditCard = 0,
  debitCard = 0,
  cashReceipt = 0,
  culture = 0,
  market = 0,
  transport = 0,
} = {}) {
  const ts = Math.max(0, Number(totalSalary) || 0);
  if (ts <= 0) {
    return {
      threshold: 0,
      totalSpent: 0,
      totalRateAmt: 0,
      excludedAmt: 0,
      possibleDeduction: 0,
      baseLimit: 0,
      generalDeduction: 0,
      additionalDeduction: 0,
      finalDeduction: 0,
    };
  }

  const cCard = Math.max(0, Number(creditCard) || 0);
  const dCard = Math.max(0, Number(debitCard) || 0);
  const cReceipt = Math.max(0, Number(cashReceipt) || 0);
  const mkt = Math.max(0, Number(market) || 0);
  const tr = Math.max(0, Number(transport) || 0);

  // 문화체육사용분: 총급여 7천만원 이하자만 적용 (7천만원 초과는 0)
  const isUnder70m = ts <= 70000000;
  const cult = isUnder70m ? Math.max(0, Number(culture) || 0) : 0;

  // 최저사용액 (총급여 25%)
  const threshold = ts * 0.25;

  // 공제율금액 계산 (원 단위 버림)
  const rateAmtCredit = Math.floor(cCard * 0.15);
  const rateAmtDebit = Math.floor(dCard * 0.30);
  const rateAmtCash = Math.floor(cReceipt * 0.30);
  const rateAmtCulture = Math.floor(cult * 0.30);
  const rateAmtMarket = Math.floor(mkt * 0.40);
  const rateAmtTransport = Math.floor(tr * 0.40);

  const totalRateAmt =
    rateAmtCredit +
    rateAmtDebit +
    rateAmtCash +
    rateAmtCulture +
    rateAmtMarket +
    rateAmtTransport;

  // 공제제외금액 산출 (*1)
  const amt15 = cCard;
  const amt30 = dCard + cReceipt + cult;
  const amt40 = mkt + tr;
  const totalSpent = amt15 + amt30 + amt40;

  let excludedAmt = 0;
  if (threshold <= amt15) {
    excludedAmt = Math.floor(threshold * 0.15);
  } else if (threshold <= amt15 + amt30) {
    excludedAmt = Math.floor(amt15 * 0.15 + (threshold - amt15) * 0.30);
  } else if (threshold <= totalSpent) {
    excludedAmt = Math.floor(amt15 * 0.15 + amt30 * 0.30 + (threshold - amt15 - amt30) * 0.40);
  } else {
    excludedAmt = totalRateAmt;
  }

  // 공제가능금액
  const possibleDeduction = Math.max(0, totalRateAmt - excludedAmt);

  // 공제한도 (*2)
  const baseLimit = isUnder70m ? 3000000 : 2500000;

  // 일반공제금액
  const generalDeduction = Math.min(possibleDeduction, baseLimit);

  // 추가공제금액 (*3)
  const excessPossible = Math.max(0, possibleDeduction - baseLimit);
  const addTargetAmt = rateAmtMarket + rateAmtTransport + rateAmtCulture;
  const addLegalLimit = isUnder70m ? 3000000 : 2000000;
  const additionalDeduction = Math.min(excessPossible, addTargetAmt, addLegalLimit);

  // 최종공제금액
  const finalDeduction = generalDeduction + additionalDeduction;

  return {
    threshold,
    totalSpent,
    totalRateAmt,
    excludedAmt,
    possibleDeduction,
    baseLimit,
    generalDeduction,
    additionalDeduction,
    finalDeduction,
  };
}

/**
 * 전체 연말정산 세액 종합 계산 함수
 */
export function calculateSettlementTax({
  userName = '근로자',
  taxYear = '2025',
  withholdingData = null,
  previousJobs = [],
  deductionData = null,
  hometaxData = null,
  familyList = [],
} = {}) {
  // 사용자가 실제로 업로드하거나 입력한 데이터가 있는지 확인
  const hasWithholding = Boolean(
    withholdingData && (
      withholdingData.uploaded ||
      withholdingData.fileName ||
      (Number(withholdingData.totalSalary) || 0) > 0 ||
      (Number(withholdingData.paidIncomeTax) || 0) > 0
    )
  );

  const hasPrevJobs = Array.isArray(previousJobs) && previousJobs.some((job) =>
    (Number(job.salary) || 0) > 0 || (Number(job.tax) || 0) > 0 || job.company
  );

  const hasDeductions = Boolean(
    deductionData && Object.entries(deductionData).some(([k, v]) =>
      Array.isArray(v) ? v.length > 0 : Number(v) > 0
    )
  );

  const hasHometax = Boolean(
    hometaxData && Object.values(hometaxData).some((v) => Number(v) > 0)
  );

  const hasUserData = hasWithholding || hasPrevJobs || hasDeductions || hasHometax;

  // 근로자가 자료 업로드나 입력을 하지 않은 경우 모든 금액을 0원으로 반환
  if (!hasUserData) {
    return {
      userName,
      taxYear,
      hasUserData: false,
      totalSalary: 0,
      primarySalary: 0,
      prevSalaryTotal: 0,
      earnedIncomeDeduction: 0,
      earnedIncome: 0,
      taxBase: 0,
      calculatedTax: 0,
      taxCreditsTotal: 0,
      finalIncomeTax: 0,
      finalLocalTax: 0,
      finalTaxTotal: 0,
      paidIncomeTax: 0,
      paidLocalTax: 0,
      paidTaxTotal: 0,
      diffIncomeTax: 0,
      diffLocalTax: 0,
      diffTotal: 0,
      isRefund: true,
      refundTotal: 0,
      refundIncomeTax: 0,
      refundLocalTax: 0,
      humanDeductions: {
        total: 0,
        self: 0,
        spouse: 0,
        dependents: 0,
        additional: 0,
      },
      incomeDeductions: {
        total: 0,
        nationalPension: 0,
        healthInsurance: 0,
        employmentInsurance: 0,
        housingLoan: 0,
        housingSavings: 0,
        personalPension: 0,
        creditCard: 0,
        smallBiz: 0,
        longInvest: 0,
        ventureFund: 0,
      },
      taxCredits: {
        total: 0,
        earnedIncomeCredit: 0,
        insuranceCredit: 0,
        generalInsuranceCredit: 0,
        disabledInsuranceCredit: 0,
        medicalCredit: 0,
        educationCredit: 0,
        donationCredit: 0,
        pensionCredit: 0,
        childCredit: 0,
        rentCredit: 0,
        marriageCredit: 0,
      },
    };
  }

  // 1. 주근무지 급여 및 기납부세액 산출
  let primarySalary = 0;
  let primaryPaidIncomeTax = 0;
  let primaryPaidLocalTax = 0;

  if (withholdingData) {
    primarySalary = Number(
      withholdingData.totalSalary ||
      withholdingData.gross_salary ||
      withholdingData.salary ||
      0
    );
    primaryPaidIncomeTax = Number(
      withholdingData.paidIncomeTax ||
      withholdingData.prepaid_income_tax ||
      withholdingData.tax ||
      0
    );
    primaryPaidLocalTax = (withholdingData.paidLocalTax !== undefined && withholdingData.paidLocalTax !== null)
      ? Number(withholdingData.paidLocalTax)
      : (withholdingData.prepaid_local_tax !== undefined
          ? Number(withholdingData.prepaid_local_tax)
          : Math.floor(primaryPaidIncomeTax * 0.1));
  }

  // 2. 종전근무지 급여 및 기납부세액 합산
  let prevSalaryTotal = 0;
  let prevPaidIncomeTaxTotal = 0;
  let prevPaidLocalTaxTotal = 0;

  if (Array.isArray(previousJobs) && previousJobs.length > 0) {
    previousJobs.forEach((job) => {
      const sal = Number(job.salary) || 0;
      const tax = Number(job.tax) || 0;
      const localTax = (job.localTax !== undefined && job.localTax !== null) ? Number(job.localTax) : 0;
      prevSalaryTotal += sal;
      prevPaidIncomeTaxTotal += tax;
      prevPaidLocalTaxTotal += localTax;
    });
  }

  // 총급여액 합계
  const totalSalary = primarySalary + prevSalaryTotal;

  // 기납부세액 합계
  const paidIncomeTax = primaryPaidIncomeTax + prevPaidIncomeTaxTotal;
  const paidLocalTax = primaryPaidLocalTax + prevPaidLocalTaxTotal;
  const paidTaxTotal = paidIncomeTax + paidLocalTax;

  // 3. 근로소득공제 및 근로소득금액
  const earnedIncomeDeduction = calculateEarnedIncomeDeduction(totalSalary);
  const earnedIncome = Math.max(0, totalSalary - earnedIncomeDeduction);

  // 4. 인적공제 계산 (Step 1 부양가족 데이터 연계)
  let selfDeduction = totalSalary > 0 ? 1500000 : 0; // 본인 기본 150만원
  let spouseDeduction = 0;
  let dependentsDeduction = 0;
  let additionalDeduction = 0;
  let childrenCount = 0;

  // 생년월일/주민번호 기준 출생연도 추출 헬퍼 (마스킹 YYMMDD-******* 및 YYYY.MM.DD 형식 지원)
  const getBirthYear = (m) => {
    // 1) birth / birthDate 문자열에서 4자리 연도 직접 추출 (예: '1955.01.01', '1955-01-01')
    const birthStr = String(m?.birth || m?.birthDate || m?.birth_date || '').trim();
    if (birthStr.length >= 4) {
      const matchYear = birthStr.match(/^(19\d{2}|20\d{2})/);
      if (matchYear) return parseInt(matchYear[1], 10);
      const cleanNum = birthStr.replace(/[^0-9]/g, '');
      if (cleanNum.length === 8 && (cleanNum.startsWith('19') || cleanNum.startsWith('20'))) {
        return parseInt(cleanNum.slice(0, 4), 10);
      }
      if (cleanNum.length >= 4) {
        const y = parseInt(cleanNum.slice(0, 4), 10);
        if (y >= 1900 && y <= 2026) return y;
      }
    }

    // 2) 주민번호(rrn) 기반 추출
    const rawRrn = String(m?.rrn || '').trim();
    const cleanNumbers = rawRrn.replace(/[^0-9]/g, '');

    // 8자리 YYYYMMDD 숫자인 경우
    if (cleanNumbers.length === 8 && (cleanNumbers.startsWith('19') || cleanNumbers.startsWith('20'))) {
      return parseInt(cleanNumbers.slice(0, 4), 10);
    }

    // 7자리 이상이고 7번째 자리가 성별 코드인 경우 (예: 760101-1******)
    if (cleanNumbers.length >= 7) {
      const frontYear = parseInt(cleanNumbers.slice(0, 2), 10);
      const gender = cleanNumbers[6];
      const century = ['1', '2', '5', '6'].includes(gender) ? 1900 : 2000;
      return century + frontYear;
    }

    // 마스킹 등으로 앞 6자리(YYMMDD)만 남은 경우 (예: 550101-*******)
    if (cleanNumbers.length >= 6) {
      const frontYear = parseInt(cleanNumbers.slice(0, 2), 10);
      // 대한민국 소득세법: 00~25는 2000년대생, 26~99는 1900년대생
      const century = frontYear <= 25 ? 2000 : 1900;
      return century + frontYear;
    }

    return null;
  };

  if (Array.isArray(familyList) && familyList.length > 0) {
    familyList.forEach((member) => {
      const isSelfPerson = Boolean(member.isSelf || member.relation === '본인');
      const cleanName = (member.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
      const bYear = getBirthYear(member);
      const rel = member.relation || '';
      const isChild = rel.includes('자녀') || rel.includes('손자녀') || rel.includes('입양') || rel.includes('비속') || rel.includes('위탁');
      const isDisabled = Boolean(
        member.isDisabled ||
        (member.disabledDeduction && member.disabledDeduction !== '해당없음')
      );

      // 소득 요건 초과 여부 확인 (연간 소득금액 100만원 초과, 근로소득만 있으면 총급여 500만원 초과)
      const isIncomeOver = Boolean(
        member.incomeOver === '초과함' ||
        member.incomeExcess
      );

      // 나이 요건 검증 (소득세법 제50조):
      // - 직계비속(자녀): 만 20세 이하 (2025년 귀속 기준 2005년 1월 1일 이후 출생자). 장애인은 나이 제한 없음.
      const isAgeDisqualified = Boolean(
        !isSelfPerson && !isDisabled && (
          failsAgeRequirement(member) ||
          (isChild && bYear !== null && bYear < 2005)
        )
      );

      // 기본공제 대상자 여부 판정
      let isBasicDeductible = false;
      if (isSelfPerson) {
        isBasicDeductible = true;
      } else if (isIncomeOver || isAgeDisqualified) {
        isBasicDeductible = false;
      } else if (member.basicDeduction && member.basicDeduction === '해당없음') {
        isBasicDeductible = false;
      } else {
        isBasicDeductible = true;
      }

      if (isSelfPerson) {
        // 본인
      } else if (member.relation === '배우자') {
        if (isBasicDeductible) spouseDeduction += 1500000;
      } else {
        // 직계존속, 직계비속, 형제자매 등
        if (isBasicDeductible) {
          dependentsDeduction += 1500000;
        }

        // 자녀세액공제: 8세 이상(2017.12.31 이전 출생) + 기본공제대상 자녀(손자녀, 입양자 포함)
        if (isChild && isBasicDeductible) {
          // 2025년 기준 만 8세 이상(2017년 이전 출생)이거나 생년월일 미입력 시 포함
          if (bYear === null || bYear <= 2017) {
            childrenCount += 1;
          }
        }
      }

      // 추가공제
      // 1) 경로우대: 기본공제대상자 중 70세 이상(1955.12.31 이전 출생) 1인당 100만 원
      const isSenior = Boolean(
        member.isSenior ||
        (member.seniorDeduction && member.seniorDeduction !== '해당없음') ||
        (isBasicDeductible && bYear !== null && bYear <= 1955)
      );
      if (isSenior && (isSelfPerson || isBasicDeductible)) additionalDeduction += 1000000;

      // 2) 장애인: 기본공제대상자 중 장애인 1인당 200만 원
      if (isDisabled && (isSelfPerson || isBasicDeductible)) additionalDeduction += 2000000;

      // 3) 한부모: 배우자 없는 자로서 부양자녀(20세 이하)가 있는 자 (본인만, 100만 원)
      const isSingleParent = Boolean(
        isSelfPerson &&
        (member.isSingleParent || (member.singleParentDeduction && member.singleParentDeduction !== '해당없음'))
      );
      if (isSingleParent) additionalDeduction += 1000000;

      // 4) 부녀자: 종합소득금액(근로소득금액) 3천만원 이하 여성 근로자 (본인만, 50만 원) - 한부모 중복 시 한부모 우선
      const isWoman = Boolean(
        isSelfPerson &&
        !isSingleParent &&
        earnedIncome <= 30000000 &&
        (member.isWoman || (member.womanDeduction && member.womanDeduction !== '해당없음'))
      );
      if (isWoman) additionalDeduction += 500000;
    });
  }

  const humanDeductionsTotal = selfDeduction + spouseDeduction + dependentsDeduction + additionalDeduction;

  // 5. 소득공제 (특별소득공제 및 기타)
  // 국민연금보험료, 건강보험료, 고용보험료 공제금액 우선순위:
  // 1순위: 연말정산간소화 PDF가 업로드되어 있다면 연말정산간소화 PDF 내용 적용
  // 2순위: 연말정산간소화 PDF가 없다면 근로소득원천징수영수증 PDF 2쪽의 31. 국민연금보험료, 33.보험료의 가.건강보험료, 나.고용보험료 공제금액 추출내용 적용
  const hasHometaxPdf = Boolean(
    hometaxData && (hometaxData.uploaded === true || (hometaxData.fileName && String(hometaxData.fileName).trim() !== ''))
  );

  let nationalPension = 0;
  let healthInsurance = 0;
  let employmentInsurance = 0;

  if (hasHometaxPdf) {
    nationalPension = Number(hometaxData?.pension) || 0;
    healthInsurance = Number(hometaxData?.health) || 0;
    employmentInsurance = Number(hometaxData?.employment) || 0;
  } else {
    // 연말정산 간소화 PDF가 없을 때: 근로소득원천징수영수증 2쪽 31. 국민연금, 33. 가. 건강보험, 나. 고용보험 공제금액 추출내용 적용
    const whPension = Number(withholdingData?.nationalPension ?? withholdingData?.national_pension);
    const whHealth = Number(withholdingData?.healthInsurance ?? withholdingData?.health_insurance);
    const whEmployment = Number(withholdingData?.employmentInsurance ?? withholdingData?.employment_insurance);

    nationalPension = !isNaN(whPension) && whPension > 0 ? whPension : Math.floor(totalSalary * 0.045);
    healthInsurance = !isNaN(whHealth) && whHealth > 0 ? whHealth : Math.floor(totalSalary * 0.03545);
    employmentInsurance = !isNaN(whEmployment) && whEmployment > 0 ? whEmployment : Math.floor(totalSalary * 0.009);
  }

  // 주택자금 & 주택마련저축 (세법 요건: 총급여 7,000만 원 이하 무주택 세대주만 주택마련저축 공제 가능)
  const housingLoanInput = Number(deductionData?.housingLoan) || 0;
  const housingSavingsInput = Number(deductionData?.housingSavings) || 0;
  const housingSavingsDeduction = totalSalary > 70000000 ? 0 : Math.min(1200000, Math.floor(housingSavingsInput * 0.4));

  // 신용카드 등 사용금액 공제 (조특법 제126조의2)
  const creditCardAmt = Number(deductionData?.creditCard ?? (hometaxData?.credit ?? hometaxData?.credit_card_general ?? 0)) || 0;
  const debitCardAmt = Number(deductionData?.debitCard ?? (hometaxData?.debit ?? hometaxData?.debit_card_cash ?? 0)) || 0;
  const cashReceiptAmt = Number(deductionData?.cashReceipt ?? (hometaxData?.cash ?? hometaxData?.cash_receipt ?? 0)) || 0;
  const cultureAmt = Number(deductionData?.cultureCard ?? (hometaxData?.culture ?? hometaxData?.culture_amount ?? hometaxData?.culture_sports ?? 0)) || 0;
  const marketAmt = Number(deductionData?.marketCard ?? (hometaxData?.market ?? hometaxData?.market_amount ?? 0)) || 0;
  const transportAmt = Number(deductionData?.transitCard ?? (hometaxData?.transport ?? hometaxData?.transport_amount ?? 0)) || 0;

  let finalCredit = creditCardAmt;
  let finalDebit = debitCardAmt;
  let finalCash = cashReceiptAmt;
  let finalCulture = cultureAmt;
  let finalMarket = marketAmt;
  let finalTransport = transportAmt;

  const totalDetailedCards = finalCredit + finalDebit + finalCash + finalCulture + finalMarket + finalTransport;
  const cardInputTotal = Number(deductionData?.card) || 0;
  if (totalDetailedCards === 0 && cardInputTotal > 0) {
    finalCredit = cardInputTotal;
  } else if (totalDetailedCards === 0) {
    // 1) deductionData.cardItems 또는 localStorage의 selftax_other_card에서 추출
    const rawCards = Array.isArray(deductionData?.cardItems) && deductionData.cardItems.length > 0
      ? deductionData.cardItems
      : (() => {
          try {
            const s = localStorage.getItem('selftax_other_card');
            return s ? JSON.parse(s) : [];
          } catch { return []; }
        })();

    if (rawCards.length > 0) {
      rawCards.forEach((it) => {
        const amt = Number(it.amount) || 0;
        const t = String(it.type || '').trim();
        if (t === '신용카드') finalCredit += amt;
        else if (t.includes('직불') || t.includes('체크')) finalDebit += amt;
        else if (t.includes('현금')) finalCash += amt;
        else if (t.includes('전통시장')) finalMarket += amt;
        else if (t.includes('대중교통')) finalTransport += amt;
        else if (t.includes('문화') || t.includes('도서')) finalCulture += amt;
        else finalCredit += amt;
      });
    }
  }

  const cardResult = calculateCreditCardDeduction({
    totalSalary,
    creditCard: finalCredit,
    debitCard: finalDebit,
    cashReceipt: finalCash,
    culture: finalCulture,
    market: finalMarket,
    transport: finalTransport,
  });

  const cardDeduction = cardResult.finalDeduction;

  // 소기업·소상공인 (노란우산 - 조특법 제86조의3)
  // 사업(근로)소득금액 구간별 공제한도: 4천만원 이하 500만원, 4천만원~1억원 300만원, 1억원 초과 200만원
  let smallBizLimit = 5000000;
  if (earnedIncome <= 40000000) {
    smallBizLimit = 5000000;
  } else if (earnedIncome <= 100000000) {
    smallBizLimit = 3000000;
  } else {
    smallBizLimit = 2000000;
  }
  const smallBizInput = Number(deductionData?.smallBiz) || 0;
  const smallBizDeduction = Math.min(smallBizLimit, smallBizInput);

  // 장기집합투자증권 및 벤처투자조합 출자 등 (조특법 제91조의16, 제91조의20, 제16조)
  let longInvestDeduction = 0;
  let ventureFundDeduction = 0;
  const rawLongInvestList = Array.isArray(deductionData?.longInvestItems) ? deductionData.longInvestItems : [];

  if (rawLongInvestList.length > 0) {
    rawLongInvestList.forEach((item) => {
      const pType = (item.type || '').trim();
      const raw = Number(item.rawAmount ?? item.amount ?? 0);
      const isVenture = pType.includes('벤처') || pType.includes('투자조합') || pType.includes('신탁');

      if (isVenture) {
        // 벤처투자조합 출자 등: 10% 공제 (최대 연 300만원 한도) - 총급여 제한 없음
        const ded = Math.min(3000000, Math.floor(raw * 0.1));
        ventureFundDeduction += ded;
      } else {
        // 장기집합투자증권 및 청년형: 납입액 40% (최대 연 240만원) - 총급여 8,000만원 초과 시 공제 배제
        if (totalSalary <= 80000000) {
          if (item.deductibleAmount !== undefined && item.deductibleAmount !== null && item.isNts) {
            longInvestDeduction += Number(item.deductibleAmount);
          } else {
            longInvestDeduction += Math.min(2400000, Math.floor(raw * 0.4));
          }
        }
      }
    });
    longInvestDeduction = Math.min(2400000, longInvestDeduction);
  } else {
    if (totalSalary <= 80000000) {
      if (deductionData?.longInvest !== undefined && deductionData?.longInvest !== null) {
        longInvestDeduction = Number(deductionData.longInvest);
      } else {
        const longInvestInput = Number(hometaxData?.long_invest) || Number(hometaxData?.long_invest_amount) || 0;
        longInvestDeduction = Math.min(2400000, Math.floor(longInvestInput * 0.4));
      }
    }
    if (deductionData?.ventureFund !== undefined && deductionData?.ventureFund !== null) {
      ventureFundDeduction = Number(deductionData.ventureFund);
    }
  }

  // 개인연금저축 소득공제 (조특법 제86조: 2000.12.31 이전 가입분 납입액의 40%, 최대 72만원 한도)
  let personalPensionDeduction = 0;
  const isSelfPension = (item) => {
    if (!item) return false;
    const rel = (item.relation || '').trim();
    if (!rel || rel === '본인' || rel.includes('본인') || rel === '근로자' || rel === '소득자' || rel === '세대주') return true;
    if (item.name && userName && (item.name.includes(userName) || userName.includes(item.name))) return true;
    const nonSelfWords = ['배우자', '자녀', '직계존속', '직계비속', '부', '모', '처', '남편', '형제', '자매', '시부', '시모', '장인', '장모'];
    if (rel && nonSelfWords.some((w) => rel.includes(w))) {
      return false;
    }
    return true;
  };
  const rawPensionList = collectPensionItems({ deductionData, hometaxData, userName });
  const personalPensionItems = rawPensionList.filter((item) => {
    if (!isSelfPension(item)) return false;
    return classifyPensionType(item.type) === 'personal';
  });

  if (personalPensionItems.length > 0) {
    let personalRawTotal = 0;
    personalPensionItems.forEach((item) => {
      let qualifies = true;
      if (item.startDate) {
        const digits = String(item.startDate).replace(/[^0-9]/g, '');
        if (digits.length >= 4 && parseInt(digits.slice(0, 4), 10) > 2000) {
          qualifies = false;
        }
      }
      if (qualifies) {
        personalRawTotal += Number(item.rawAmount ?? item.amount) || 0;
      }
    });
    personalPensionDeduction = Math.min(720000, Math.floor(personalRawTotal * 0.4));
  } else if (deductionData?.personalPension !== undefined && deductionData?.personalPension !== null) {
    personalPensionDeduction = Math.min(720000, Number(deductionData.personalPension));
  } else {
    const hometaxPersonalRaw = Number(
      hometaxData?.personal_pension_saving ||
      hometaxData?.personal_pension ||
      hometaxData?.personal_pension_amount ||
      0
    );
    if (hometaxPersonalRaw > 0) {
      personalPensionDeduction = Math.min(720000, Math.floor(hometaxPersonalRaw * 0.4));
    }
  }

  // 6. 과세표준 = 근로소득금액 − 인적공제 − 소득공제 + 소득공제 종합한도 초과액
  // 소득공제 종합한도 (조특법 제132조의2: 연 2,500만원)
  //  대상: 주택자금(특별소득공제), 주택마련저축, 신용카드 등, 소기업·소상공인 공제부금,
  //        장기집합투자증권저축, 벤처투자조합 출자 등 (국민연금·건강/고용보험료·개인연금저축은 대상 아님)
  const INCOME_DEDUCTION_COMPREHENSIVE_LIMIT = 25000000;
  // 특별소득공제 (소득세법 제52조): 건강·고용보험료, 주택자금 — 표준세액공제를 택하면 적용하지 않는다
  const specialIncomeDeductions = healthInsurance + employmentInsurance + housingLoanInput;
  const buildTaxBase = (withSpecialIncome) => {
    const limitTarget =
      (withSpecialIncome ? housingLoanInput : 0) +
      housingSavingsDeduction +
      cardDeduction +
      smallBizDeduction +
      longInvestDeduction +
      ventureFundDeduction;
    const limitExcess = Math.max(0, limitTarget - INCOME_DEDUCTION_COMPREHENSIVE_LIMIT);
    const total =
      nationalPension +
      (withSpecialIncome ? specialIncomeDeductions : 0) +
      housingSavingsDeduction +
      personalPensionDeduction +
      cardDeduction +
      smallBizDeduction +
      longInvestDeduction +
      ventureFundDeduction -
      limitExcess;
    const base = Math.max(0, earnedIncome - humanDeductionsTotal - total);
    // 7. 산출세액
    return { incomeDeductionsTotal: total, limitExcess, taxBase: base, calculatedTax: calculateIncomeTax(base) };
  };
  // 특별세액공제를 받는 경우(특별소득공제 적용)와 표준세액공제를 받는 경우(특별소득공제 미적용)를 모두 계산
  const specialBase = buildTaxBase(true);
  const standardBase = buildTaxBase(false);

  // 8. 세액감면 및 세액공제
  // 중소기업 취업자 소득세 감면 (조특법 제30조: 청년 90%, 연 200만원 한도)
  //  - 원천징수영수증 등에 감면세액이 있으면 그 금액, 감면 대상 표시만 있으면 산출세액 × 90%
  let fixedSmeReduction = null;
  let smeEligible = false;
  if (withholdingData?.smeReduction || withholdingData?.taxReductionSme) {
    fixedSmeReduction = Number(withholdingData.smeReduction || withholdingData.taxReductionSme) || 0;
  } else if (deductionData?.smeReduction || deductionData?.taxReductionSme) {
    fixedSmeReduction = Number(deductionData.smeReduction || deductionData.taxReductionSme) || 0;
  } else if (withholdingData?.isSmeYouth || deductionData?.isSmeYouth) {
    smeEligible = true;
  } else if (Array.isArray(deductionData?.otherDeductItems)) {
    const smeItem = deductionData.otherDeductItems.find(
      (item) => item.type?.includes('중소기업') || item.category?.includes('중소기업') || item.type?.includes('청년')
    );
    if (smeItem && Number(smeItem.amount) > 0) smeEligible = true;
  }
  const smeReductionFor = (ct) =>
    fixedSmeReduction !== null ? fixedSmeReduction : (smeEligible ? Math.min(2000000, Math.floor(ct * 0.9)) : 0);

  // 1) 근로소득세액공제 (소득세법 제59조) — 산출세액에 따라 달라지므로 두 경우 각각 계산
  const smeReductionSpecial = smeReductionFor(specialBase.calculatedTax);
  const earnedIncomeCreditSpecial = calculateEarnedIncomeTaxCredit(specialBase.calculatedTax, totalSalary, smeReductionSpecial);
  const smeReductionStandard = smeReductionFor(standardBase.calculatedTax);
  const earnedIncomeCreditStandard = calculateEarnedIncomeTaxCredit(standardBase.calculatedTax, totalSalary, smeReductionStandard);

  // 2) 보장성보험료 세액공제 (소득세법 제59조의4 제1항)
  // - 일반보장성보험: 공제대상금액 연 100만원 한도 12% 공제율 (최대 12만원)
  // - 장애인전용보장성보험: 공제대상금액 연 100만원 한도 15% 공제율 (최대 15만원)
  let generalInsuranceInput = deductionData?.generalInsurance;
  let disabledInsuranceInput = deductionData?.disabledInsurance;

  // deductionData에 명시적 분리가 없는 경우 insuranceItems 세부항목 파싱
  if ((generalInsuranceInput === undefined || disabledInsuranceInput === undefined) && Array.isArray(deductionData?.insuranceItems)) {
    let genSum = 0;
    let disSum = 0;
    deductionData.insuranceItems.forEach((item) => {
      const amt = Number(item.amount) || Number(item.insuranceAmount) || 0;
      const typeStr = String(item.type || item.insuranceType || item.name || '');
      if (typeStr.includes('장애인')) {
        disSum += amt;
      } else {
        genSum += amt;
      }
    });
    if (generalInsuranceInput === undefined) generalInsuranceInput = genSum;
    if (disabledInsuranceInput === undefined) disabledInsuranceInput = disSum;
  }

  // hometaxData 연동 확인
  if (!generalInsuranceInput && !disabledInsuranceInput && hometaxData) {
    if (Array.isArray(hometaxData.persons)) {
      let ntsGen = 0;
      let ntsDis = 0;
      hometaxData.persons.forEach((p) => {
        const fm = Array.isArray(familyList)
          ? familyList.find((m) => cleanPersonName(m.name) === cleanPersonName(p.name))
          : null;
        if (p.income_excess || (fm && isIncomeExcessMember(fm))) return;
        if (Array.isArray(p.insurance_details) && p.insurance_details.length > 0) {
          p.insurance_details.forEach((d) => {
            const amt = Number(d.amount) || 0;
            const t = String(d.type || d.raw_type || '');
            const subs = Array.isArray(d.sub_insured) ? d.sub_insured : [];
            if (t.includes('장애인')) {
              ntsDis += amt;
            } else {
              ntsGen += amt;
            }
          });
        } else {
          ntsGen += Number(p.items?.insurance_guaranteed) || 0;
          ntsDis += Number(p.items?.insurance_disabled) || 0;
        }
      });
      if (ntsGen > 0 || ntsDis > 0) {
        generalInsuranceInput = ntsGen;
        disabledInsuranceInput = ntsDis;
      }
    }
  }

  if (!generalInsuranceInput && !disabledInsuranceInput) {
    if (hometaxData?.generalInsurance !== undefined || hometaxData?.disabledInsurance !== undefined) {
      generalInsuranceInput = Number(hometaxData?.generalInsurance) || 0;
      disabledInsuranceInput = Number(hometaxData?.disabledInsurance) || 0;
    } else if (hometaxData?.insurance) {
      generalInsuranceInput = Number(hometaxData.insurance) || 0;
      disabledInsuranceInput = 0;
    } else if (deductionData?.insurance) {
      generalInsuranceInput = Number(deductionData.insurance) || 0;
      disabledInsuranceInput = 0;
    }
  }

  const finalGenInsurance = Math.max(0, Number(generalInsuranceInput) || 0);
  const finalDisInsurance = Math.max(0, Number(disabledInsuranceInput) || 0);

  // 일반보험: 공제대상금액 100만원 한도 12% 공제율 (최대 12만원)
  const generalInsuranceCredit = Math.min(120000, Math.floor(Math.min(1000000, finalGenInsurance) * 0.12));
  // 장애인보험: 공제대상금액 100만원 한도 15% 공제율 (최대 15만원)
  const disabledInsuranceCredit = Math.min(150000, Math.floor(Math.min(1000000, finalDisInsurance) * 0.15));
  // 보장성보험료 세액공제 합계
  const insuranceCredit = generalInsuranceCredit + disabledInsuranceCredit;

  // 3) 의료비 세액공제 (소득세법 제59조의4 ②)
  // - 총급여 3% 최저사용금액(Threshold)을 '그 밖의 공제대상자(일반의료비)'에서 우선 차감
  // - 남은 문턱금액을 본인/65세이상/6세이하/장애인/특례자 -> 미숙아 -> 난임시술비 순으로 순차 차감
  // - 공제율: 난임시술비 30%(한도 없음), 미숙아·선천성 20%(한도 없음), 본인/65세/6세/장애인 15%(한도 없음), 그 밖의 공제대상자 15%(연 700만 원 한도)
  let medicalSelf = 0;
  let medicalSpecial = 0;
  let medicalGeneral = 0;
  let medicalPremature = 0;
  let medicalInfertility = 0;

  const familyMapByName = {};
  if (Array.isArray(familyList)) {
    familyList.forEach((m) => {
      const cName = String(m.name || '').replace(/\(.*?\)/g, '').trim();
      if (cName) familyMapByName[cName] = m;
    });
  }

  // 1순위: 공제자료 화면에서 인별 한도·실손보험금을 반영해 구분한 의료비가 있으면 그 값을 사용
  const hasPrecalculatedMedical = (
    deductionData?.medicalSelf !== undefined ||
    deductionData?.medicalSpecial !== undefined ||
    deductionData?.medicalGeneral !== undefined ||
    deductionData?.medicalPremature !== undefined ||
    deductionData?.medicalInfertility !== undefined
  );

  const precalcSelf = Number(deductionData?.medicalSelf || 0);
  const precalcSpec = Number(deductionData?.medicalSpecial || 0);
  const precalcGen = Number(deductionData?.medicalGeneral || 0);
  const precalcPrem = Number(deductionData?.medicalPremature || 0);
  const precalcInfer = Number(deductionData?.medicalInfertility || 0);

  const targetMedicalItems = Array.isArray(deductionData?.medicalItems) && deductionData.medicalItems.length > 0
    ? deductionData.medicalItems
    : (Array.isArray(hometaxData?.medical_details) ? hometaxData.medical_details : []);

  if (hasPrecalculatedMedical && (precalcSelf > 0 || precalcSpec > 0 || precalcGen > 0 || precalcPrem > 0 || precalcInfer > 0)) {
    medicalSelf = precalcSelf;
    medicalSpecial = precalcSpec;
    medicalGeneral = precalcGen;
    medicalPremature = precalcPrem;
    medicalInfertility = precalcInfer;
  } else if (targetMedicalItems && targetMedicalItems.length > 0) {
    // 인별로 의료비 항목 그룹화하여 안경(50만) 한도, 산후조리원(200만) 한도, 실손보험금 인별 차감 적용
    const memberMap = {};
    targetMedicalItems.forEach((item) => {
      const pName = String(item.name || '').replace(/\(.*?\)/g, '').trim() || (userName || '본인');
      if (!memberMap[pName]) memberMap[pName] = [];
      memberMap[pName].push(item);
    });

    Object.entries(memberMap).forEach(([pName, memberItems]) => {
      let mGeneral = 0;
      let mGlasses = 0;
      let mPostpartum = 0;
      let mInfer = 0;
      let mPrem = 0;
      let mInsTotal = 0;
      let mRel = memberItems[0]?.relation || '';

      memberItems.forEach((item) => {
        const rawAmt = Number(item.amount) || 0;
        const insAmt = Number(item.insuranceAmount) || 0;
        mInsTotal += insAmt;
        const t = String(item.type || '').trim();
        if (t.includes('난임')) {
          mInfer += rawAmt;
        } else if (t.includes('미숙아') || t.includes('선천성')) {
          mPrem += rawAmt;
        } else if (t.includes('안경') || t.includes('콘텍트렌즈') || t.includes('콘택트렌즈')) {
          mGlasses += rawAmt;
        } else if (t.includes('산후조리')) {
          mPostpartum += Math.min(2000000, rawAmt);
        } else {
          mGeneral += rawAmt;
        }
      });

      const cappedGlasses = Math.min(500000, mGlasses);
      const regularEligible = mGeneral + cappedGlasses + mPostpartum;
      if (regularEligible + mInfer + mPrem - mInsTotal <= 0) return;

      const fMember = familyMapByName[pName] ||
        (Array.isArray(familyList) ? familyList.find((m) => {
          const mClean = String(m.name || '').replace(/\(.*?\)/g, '').trim();
          return mClean === pName || (pName && mClean.includes(pName)) || (pName && pName.includes(mClean));
        }) : null);

      const isSelf = mRel.includes('본인') || pName === userName || pName === '본인' || Boolean(fMember?.isSelf || fMember?.relation === '본인');
      const bYear = fMember ? getBirthYear(fMember) : (getBirthYear(memberItems[0]));
      const isSenior = Boolean(
        fMember?.isSenior ||
        (fMember?.seniorDeduction && fMember.seniorDeduction !== '해당없음') ||
        (bYear !== null && bYear <= 1960) ||
        mRel.includes('경로우대') || mRel.includes('65세') || pName.includes('65세')
      );
      const isUnder6 = Boolean(
        (bYear !== null && bYear >= 2019) ||
        mRel.includes('6세') || pName.includes('6세')
      );
      const isDisabled = Boolean(
        fMember?.isDisabled ||
        (fMember?.disabledDeduction && fMember.disabledDeduction !== '해당없음') ||
        mRel.includes('장애인') || pName.includes('장애인')
      );
      const isSpecialIll = Boolean(
        fMember?.isSeverelyIll ||
        mRel.includes('산정특례') || pName.includes('산정특례') || mRel.includes('중증질환')
      );

      // 실손의료보험금은 난임시술비 → 미숙아·선천성이상아 → 그 밖의 의료비 순으로 차감하고,
      // 난임·미숙아 의료비는 별도 공제율(30%·20%) 항목으로만 집계한다 (일반 항목에 중복 집계하지 않음)
      if (mInfer > 0) {
        medicalInfertility += Math.max(0, mInfer - mInsTotal);
        mInsTotal = Math.max(0, mInsTotal - mInfer);
      }
      if (mPrem > 0) {
        medicalPremature += Math.max(0, mPrem - mInsTotal);
        mInsTotal = Math.max(0, mInsTotal - mPrem);
      }
      const netEligible = Math.max(0, regularEligible - mInsTotal);
      if (netEligible <= 0) return;

      if (isSelf) {
        medicalSelf += netEligible;
      } else if (isSenior || isUnder6 || isDisabled || isSpecialIll) {
        medicalSpecial += netEligible;
      } else {
        medicalGeneral += netEligible;
      }
    });
  } else if (Array.isArray(hometaxData?.matchedPersons) && hometaxData.matchedPersons.length > 0) {
    hometaxData.matchedPersons.forEach((mp) => {
      const items = mp.items || {};
      const rawAmt = Number(items.medical_general) || 0;
      const insAmt = Number(items.indemnity_insurance) || 0;
      const netAmt = Math.max(0, rawAmt - insAmt);
      if (netAmt <= 0) return;

      const pName = String(mp.name || '').replace(/\(.*?\)/g, '').trim();
      const fMember = familyMapByName[pName] ||
        (Array.isArray(familyList) ? familyList.find((m) => {
          const mClean = String(m.name || '').replace(/\(.*?\)/g, '').trim();
          return mClean === pName || (pName && mClean.includes(pName)) || (pName && pName.includes(mClean));
        }) : null);
      const isSelf = mp.relation === '본인' || pName === userName || pName === '본인' || Boolean(fMember?.isSelf || fMember?.relation === '본인');
      const bYear = fMember ? getBirthYear(fMember) : (getBirthYear(mp));
      const isSenior = Boolean(
        fMember?.isSenior ||
        (fMember?.seniorDeduction && fMember.seniorDeduction !== '해당없음') ||
        (bYear !== null && bYear <= 1960) ||
        (mp.relation && (mp.relation.includes('65세') || mp.relation.includes('경로우대')))
      );
      const isUnder6 = Boolean(
        (bYear !== null && bYear >= 2019) ||
        (mp.relation && mp.relation.includes('6세'))
      );
      const isDisabled = Boolean(
        fMember?.isDisabled ||
        (fMember?.disabledDeduction && fMember.disabledDeduction !== '해당없음') ||
        mp.isDisabled ||
        (mp.relation && mp.relation.includes('장애인'))
      );

      if (isSelf) {
        medicalSelf += netAmt;
      } else if (isSenior || isUnder6 || isDisabled) {
        medicalSpecial += netAmt;
      } else {
        medicalGeneral += netAmt;
      }
    });
  } else {
    const totalMed = Number(deductionData?.medical || hometaxData?.medical || 0);
    const selfMed = Number(deductionData?.medicalSelf || hometaxData?.medicalSelf || 0);
    const specMed = Number(deductionData?.medicalSpecial || hometaxData?.medicalSpecial || 0);
    const genMed = Number(deductionData?.medicalGeneral || hometaxData?.medicalGeneral || 0);
    const premMed = Number(deductionData?.medicalPremature || hometaxData?.medicalPremature || 0);
    const inferMed = Number(deductionData?.medicalInfertility || hometaxData?.medicalInfertility || 0);

    if (selfMed > 0 || specMed > 0 || genMed > 0 || premMed > 0 || inferMed > 0) {
      medicalSelf = selfMed;
      medicalSpecial = specMed;
      medicalGeneral = genMed;
      medicalPremature = premMed;
      medicalInfertility = inferMed;
    } else {
      medicalGeneral = totalMed;
    }
  }

  // deductionData에 카테고리별 의료비가 명시적으로 있는 경우 폴백/보강 적용
  if (medicalSelf === 0 && medicalSpecial === 0 && medicalGeneral === 0 && medicalPremature === 0 && medicalInfertility === 0) {
    const selfMed = Number(deductionData?.medicalSelf || hometaxData?.medicalSelf || 0);
    const specMed = Number(deductionData?.medicalSpecial || hometaxData?.medicalSpecial || 0);
    const genMed = Number(deductionData?.medicalGeneral || hometaxData?.medicalGeneral || 0);
    const premMed = Number(deductionData?.medicalPremature || hometaxData?.medicalPremature || 0);
    const inferMed = Number(deductionData?.medicalInfertility || hometaxData?.medicalInfertility || 0);
    if (selfMed > 0 || specMed > 0 || genMed > 0 || premMed > 0 || inferMed > 0) {
      medicalSelf = selfMed;
      medicalSpecial = specMed;
      medicalGeneral = genMed;
      medicalPremature = premMed;
      medicalInfertility = inferMed;
    }
  }

  const medThreshold = Math.floor(totalSalary * 0.03);
  let remThreshold = medThreshold;

  // 1) 그 밖의 공제대상자(일반의료비, 15%, 연 700만 원 한도)에서 최저사용금액 우선 차감
  let deductibleGeneral = 0;
  if (medicalGeneral > 0) {
    if (medicalGeneral >= remThreshold) {
      deductibleGeneral = Math.min(7000000, medicalGeneral - remThreshold);
      remThreshold = 0;
    } else {
      deductibleGeneral = 0;
      remThreshold -= medicalGeneral;
    }
  }

  // 2) 본인, 65세이상, 6세이하, 장애인, 건강보험산정특례자(15%, 한도 없음)에서 남은 최저사용금액 차감
  let deductibleSpecial = 0;
  const totalSpecialMed = medicalSelf + medicalSpecial;
  if (totalSpecialMed > 0) {
    if (totalSpecialMed >= remThreshold) {
      deductibleSpecial = totalSpecialMed - remThreshold;
      remThreshold = 0;
    } else {
      deductibleSpecial = 0;
      remThreshold -= totalSpecialMed;
    }
  }

  // 3) 미숙아·선천성이상아 의료비(20%, 한도 없음)에서 남은 최저사용금액 차감
  let deductiblePremature = 0;
  if (medicalPremature > 0) {
    if (medicalPremature >= remThreshold) {
      deductiblePremature = medicalPremature - remThreshold;
      remThreshold = 0;
    } else {
      deductiblePremature = 0;
      remThreshold -= medicalPremature;
    }
  }

  // 4) 난임시술비(30%, 한도 없음)에서 남은 최저사용금액 차감
  let deductibleInfertility = 0;
  if (medicalInfertility > 0) {
    deductibleInfertility = Math.max(0, medicalInfertility - remThreshold);
    remThreshold = 0;
  }

  // 5) 최종 의료비 세액공제액 산출
  const creditGeneral = Math.floor(deductibleGeneral * 0.15);
  const creditSpecial = Math.floor(deductibleSpecial * 0.15);
  const creditPremature = Math.floor(deductiblePremature * 0.20);
  const creditInfertility = Math.floor(deductibleInfertility * 0.30);

  const medicalCredit = creditGeneral + creditSpecial + creditPremature + creditInfertility;

  // 4) 교육비 세액공제 (소득세법 제59조의4 ③, 15%)
  // - 공제대상 교육비(deductionData.education)는 교육비 화면에서 1인별 한도를 적용한 금액
  //   본인: 한도 없음(대학원·직업훈련·학자금대출 상환 포함), 취학전·초·중·고: 1인당 300만원,
  //   대학생: 1인당 900만원, 장애인 특수교육비: 한도 없음(나이·소득 제한 없음)
  //   교복 등 1인당 50만원, 현장체험학습비 1인당 30만원, 대학 입학전형료·수능 응시료 포함
  let eduInput = 0;
  if (deductionData?.education !== undefined && deductionData?.education !== null) {
    eduInput = Number(deductionData.education) || 0;
  } else if (hometaxData?.education !== undefined && hometaxData?.education !== null) {
    eduInput = Number(hometaxData.education) || 0;
  }
  const educationCredit = eduInput > 0 ? Math.floor(eduInput * 0.15) : 0;

  // 5) 기부금 세액공제 (소득세법 제59조의4 제4항, 조특법 제76조, 제58조, 제88조의4)
  const donationItemList = collectDonationItems({ deductionData, hometaxData, userName });
  const donationFallbackAmount =
    Number(deductionData?.donation) ||
    Number(hometaxData?.donation || hometaxData?.donation_amount || hometaxData?.donation_total || 0);

  const donationCalcResult = calculateDonationCredit({
    donationItems: donationItemList,
    earnedIncome,
    userName,
    fallbackAmount: donationFallbackAmount,
    carryoverItems: deductionData?.donationCarryoverItems || [],
    taxYear,
  });

  const donationCredit = donationCalcResult.totalCredit;
  const politicalDonationCredit = donationCalcResult.politicalCredit;
  const hometownDonationCredit = donationCalcResult.hometownCredit;
  const specialDonationCredit = donationCalcResult.specialCredit;
  const employeeStockDonationCredit = donationCalcResult.employeeStockCredit;
  const generalNonReligiousDonationCredit = donationCalcResult.generalNonReligiousCredit;
  const generalReligiousDonationCredit = donationCalcResult.generalReligiousCredit;
  const generalDonationCredit = generalNonReligiousDonationCredit + generalReligiousDonationCredit;

  // 6) 연금계좌 세액공제 (소득세법 제59조의3, 조특법 제91조의18)
  //  - 연금저축/연금계좌 조회페이지의 연금저축, 퇴직연금, ISA퇴직연금, ISA연금저축 금액 수집
  //  - 공제한도: 기본 900만원(연금저축 600만원) + ISA납입액의 10%(최대 300만원)
  //  - 법정 차감순서: 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축
  //  - 공제율: 총급여 5,500만원 이하 15%, 초과 12%
  const pensionPaid = { irp: 0, saving: 0, isaIrp: 0, isaSaving: 0 };
  const pensionItemList = collectPensionItems({ deductionData, hometaxData, userName });
  pensionItemList.forEach((item) => {
    // 본인 명의 연금계좌만 공제 가능 (부양가족 명의 제외)
    if (!isSelfPension(item)) return;
    const kind = classifyPensionType(item.type);
    if (kind === 'personal') return; // 개인연금저축(2000.12.31 이전 가입)은 소득공제 대상
    pensionPaid[kind] += Number(item.rawAmount ?? item.amount) || 0;
  });

  if (pensionPaid.irp === 0 && pensionPaid.saving === 0 && pensionPaid.isaIrp === 0 && pensionPaid.isaSaving === 0) {
    const pensionFallback =
      Number(deductionData?.pension) ||
      Number(hometaxData?.pension_saving || hometaxData?.pension) ||
      0;
    pensionPaid.saving = pensionFallback;
  }
  const pensionResult = calculatePensionAccountCredit(pensionPaid, totalSalary);
  const deductibleTotal = pensionResult.total;

  const pensionInput = deductibleTotal;
  const pensionRate = pensionResult.rate;
  const pensionCreditRaw = Math.floor(pensionInput * pensionRate);

  // 7) 자녀세액공제 (소득세법 제59조의2, 2025년 개정)
  // - 1명: 25만 원 / 2명: 55만 원 / 3명 이상: 55만 원 + (2명 초과 1명당 40만 원)
  // - 출산·입양: 첫째 30만 원, 둘째 50만 원, 셋째 이상 70만 원
  let childCredit = 0;
  if (childrenCount === 1) childCredit = 250000;
  else if (childrenCount === 2) childCredit = 550000;
  else if (childrenCount >= 3) childCredit = 550000 + (childrenCount - 2) * 400000;

  // 출산·입양 세액공제: 해당 과세연도에 출생·입양 신고한 기본공제대상 자녀 (첫째 30만, 둘째 50만, 셋째 이상 70만)
  //  - 순서는 birthOrder(입력값)가 있으면 그 값, 없으면 가족 중 자녀의 출생연도 순서로 판정
  if (Array.isArray(familyList)) {
    familyList.forEach((m) => {
      if (!isNewbornOrAdopted(m, taxYear) || shouldExcludeBasicDeduction(m) || m.basicDeduction === '해당없음') return;
      const order = birthOrderOf(m, familyList);
      if (order === 1) childCredit += 300000;
      else if (order === 2) childCredit += 500000;
      else if (order >= 3) childCredit += 700000;
    });
  }

  // 8) 월세액 세액공제 (세법 요건: 총급여 8,000만원 이하 무주택 세대주만 공제 가능, 한도 1,000만원, 장기주택저당차입금 공제 시 배제)
  const hasMortgageInCalc = Array.isArray(deductionData?.housingLoanItems) && deductionData.housingLoanItems.some(
    (item) => item.type && item.type.includes('장기주택저당차입금') && Number(item.amount) > 0
  );
  const rentInput = hasMortgageInCalc ? 0 : (Number(deductionData?.rent) || 0);
  let rentCredit = 0;
  if (!hasMortgageInCalc && totalSalary <= 80000000 && rentInput > 0) {
    const rentRate = totalSalary <= 55000000 ? 0.17 : 0.15;
    rentCredit = Math.min(10000000 * rentRate, Math.floor(rentInput * rentRate));
  }

  // 9) 혼인세액공제 (50만원)
  let marriageCredit = 0;
  if (Array.isArray(deductionData?.otherDeductItems)) {
    const hasMarriage = deductionData.otherDeductItems.some(
      (item) => item.type === '혼인세액공제' || item.category === '혼인세액공제'
    );
    if (hasMarriage) marriageCredit = 500000;
  }

  // ===== 특별세액공제 vs 표준세액공제 선택, 세액감면·공제 적용순서 =====
  // [표준세액공제] 소득세법 제59조의4 ⑨: 특별소득공제(건강·고용보험료, 주택자금)·특별세액공제(보장성보험료·의료비·
  //   교육비·특례/일반기부금)·월세액 세액공제를 신청하지 않은 근로자는 연 13만원을 공제한다.
  //   두 경우를 모두 계산해(표준세액공제 쪽은 특별소득공제를 빼고 과세표준·산출세액부터 다시 계산)
  //   결정세액이 더 적은 쪽을 택한다(같으면 특별세액공제). 근로소득·혼인·자녀·연금계좌 세액공제와
  //   조특법상 정치자금·고향사랑·우리사주조합 기부금 세액공제는 두 경우 모두 적용된다.
  // [적용순서] 소득세법 제60조, 원천세과-830(2023.09.13.)
  //   ① 세액감면(중소기업 취업자)
  //   ② 이월공제가 인정되지 않는 세액공제: 근로소득 → 혼인 → 자녀 → 보장성보험료 → 의료비 → 교육비
  //      → 정치자금 → 고향사랑 → 우리사주조합 → 표준세액공제 → 월세액
  //   ③ 이월공제가 인정되는 세액공제(소득세법 제61조, 10년): 특례(이월분 → 당해분)
  //      → 일반·종교단체 외(이월분 → 당해분) → 일반·종교단체(이월분 → 당해분)
  //   ④ 연금계좌: 감면·공제 합계가 산출세액을 초과하면 그 초과액을 한도로 공제받지 않은 것으로 본다.
  //   각 공제는 앞선 감면·공제를 빼고 남은 산출세액 범위 안에서만 적용된다.
  const STANDARD_TAX_CREDIT = 130000;
  const dch = donationCalcResult.chunks;
  const allocateCredits = ({ ct, sme, earned, useStandard }) => {
    let remaining = Math.max(0, ct);
    const apply = (amount) => {
      const applied = Math.min(Math.max(0, Math.floor(Number(amount) || 0)), remaining);
      remaining -= applied;
      return applied;
    };
    const ifSpecial = (amount) => (useStandard ? 0 : amount);
    const a = {};
    // ① 세액감면
    a.sme = apply(sme);
    // ② 이월공제 불가
    a.earned = apply(earned);
    a.marriage = apply(marriageCredit);
    a.child = apply(childCredit);
    a.insurance = apply(ifSpecial(insuranceCredit));
    a.medical = apply(ifSpecial(medicalCredit));
    a.education = apply(ifSpecial(educationCredit));
    a.political = apply(politicalDonationCredit);
    a.hometown = apply(hometownDonationCredit);
    a.employeeStock = apply(employeeStockDonationCredit);
    a.standard = apply(useStandard ? STANDARD_TAX_CREDIT : 0);
    a.rent = apply(ifSpecial(rentCredit));
    // ③ 이월공제 가능 (같은 종류는 이월분 먼저)
    a.specialCarry = apply(ifSpecial(dch.specialCarry.credit));
    a.specialCurrent = apply(ifSpecial(dch.specialCurrent.credit));
    a.generalNonReligiousCarry = apply(ifSpecial(dch.generalNonReligiousCarry.credit));
    a.generalNonReligiousCurrent = apply(ifSpecial(dch.generalNonReligiousCurrent.credit));
    a.generalReligiousCarry = apply(ifSpecial(dch.generalReligiousCarry.credit));
    a.generalReligiousCurrent = apply(ifSpecial(dch.generalReligiousCurrent.credit));
    // ④ 연금계좌
    a.pension = apply(pensionCreditRaw);
    const total = Object.values(a).reduce((sum, v) => sum + v, 0);
    return { applied: a, total, finalTax: Math.max(0, ct - total) };
  };

  const specialResult = allocateCredits({
    ct: specialBase.calculatedTax, sme: smeReductionSpecial, earned: earnedIncomeCreditSpecial, useStandard: false,
  });
  const standardResult = allocateCredits({
    ct: standardBase.calculatedTax, sme: smeReductionStandard, earned: earnedIncomeCreditStandard, useStandard: true,
  });
  const useStandardCredit = totalSalary > 0 && standardResult.finalTax < specialResult.finalTax;
  const chosen = useStandardCredit ? standardResult : specialResult;
  const chosenBase = useStandardCredit ? standardBase : specialBase;

  // 확정된 과세표준·산출세액·감면·근로소득세액공제
  const incomeDeductionsTotal = chosenBase.incomeDeductionsTotal;
  const incomeDeductionLimitExcess = chosenBase.limitExcess;
  const taxBase = chosenBase.taxBase;
  const calculatedTax = chosenBase.calculatedTax;
  const smeReduction = useStandardCredit ? smeReductionStandard : smeReductionSpecial;
  const earnedIncomeCredit = useStandardCredit ? earnedIncomeCreditStandard : earnedIncomeCreditSpecial;
  const standardCreditRaw = useStandardCredit ? STANDARD_TAX_CREDIT : 0;

  const ap = chosen.applied;
  const appliedSmeReduction = ap.sme;
  const appliedEarnedIncomeCredit = ap.earned;
  const appliedMarriageCredit = ap.marriage;
  const appliedChildCredit = ap.child;
  const appliedInsuranceCredit = ap.insurance;
  const appliedMedicalCredit = ap.medical;
  const appliedEducationCredit = ap.education;
  const appliedPoliticalDonationCredit = ap.political;
  const appliedHometownDonationCredit = ap.hometown;
  const appliedEmployeeStockDonationCredit = ap.employeeStock;
  const standardCredit = ap.standard;
  const appliedRentCredit = ap.rent;
  const appliedSpecialCarryDonationCredit = ap.specialCarry;
  const appliedSpecialCurrentDonationCredit = ap.specialCurrent;
  const appliedGeneralNonReligiousCarryDonationCredit = ap.generalNonReligiousCarry;
  const appliedGeneralNonReligiousCurrentDonationCredit = ap.generalNonReligiousCurrent;
  const appliedGeneralReligiousCarryDonationCredit = ap.generalReligiousCarry;
  const appliedGeneralReligiousCurrentDonationCredit = ap.generalReligiousCurrent;
  const appliedSpecialDonationCredit = appliedSpecialCarryDonationCredit + appliedSpecialCurrentDonationCredit;
  const appliedGeneralNonReligiousDonationCredit =
    appliedGeneralNonReligiousCarryDonationCredit + appliedGeneralNonReligiousCurrentDonationCredit;
  const appliedGeneralReligiousDonationCredit =
    appliedGeneralReligiousCarryDonationCredit + appliedGeneralReligiousCurrentDonationCredit;
  const appliedGeneralDonationCredit = appliedGeneralNonReligiousDonationCredit + appliedGeneralReligiousDonationCredit;
  const appliedPensionCredit = ap.pension;
  const appliedDonationCredit =
    appliedPoliticalDonationCredit +
    appliedHometownDonationCredit +
    appliedSpecialDonationCredit +
    appliedEmployeeStockDonationCredit +
    appliedGeneralDonationCredit;

  // 산출세액 부족으로 공제받지 못한 특례·일반기부금 세액 (특별세액공제를 택한 경우)
  const donationCarryoverCredit = useStandardCredit
    ? 0
    : (specialDonationCredit - appliedSpecialDonationCredit) + (generalDonationCredit - appliedGeneralDonationCredit);

  // 다음 과세기간으로 이월되는 특례·일반기부금 (공제대상금액 기준, 10년)
  //  = 당해연도 한도초과액 + 산출세액 부족으로 공제받지 못한 금액(세액을 공제대상금액으로 환산)
  //  - 이월분은 기부연도가 빠른 것부터 공제된 것으로 보고, 10년이 지난 이월분은 소멸
  //  - 표준세액공제를 택하면 당해연도 기부금은 공제·이월하지 않고, 전년도 이월분은 그대로 이월
  const unappliedAmount = (chunk, applied) =>
    chunk.credit > 0 ? Math.round((chunk.amount * (chunk.credit - applied)) / chunk.credit) : 0;
  const carryKinds = [
    ['special', dch.specialCarry, appliedSpecialCarryDonationCredit, dch.specialCurrent, appliedSpecialCurrentDonationCredit],
    ['generalNonReligious', dch.generalNonReligiousCarry, appliedGeneralNonReligiousCarryDonationCredit,
      dch.generalNonReligiousCurrent, appliedGeneralNonReligiousCurrentDonationCredit],
    ['generalReligious', dch.generalReligiousCarry, appliedGeneralReligiousCarryDonationCredit,
      dch.generalReligiousCurrent, appliedGeneralReligiousCurrentDonationCredit],
  ];
  const taxYearNum = Number(taxYear) || 2025;
  const carryEntriesOut = [];
  const donationCarryoverNext = { special: 0, generalNonReligious: 0, generalReligious: 0, total: 0, expired: 0, entries: carryEntriesOut };
  carryKinds.forEach(([kind, carryChunk, carryApplied, curChunk, curApplied]) => {
    // 실제로 세액공제된 이월분 금액을 오래된 연도부터 배정
    let appliedLeft = useStandardCredit ? 0 : Math.max(0, carryChunk.amount - unappliedAmount(carryChunk, carryApplied));
    donationCalcResult.carryover.entries.filter((e) => e.kind === kind).forEach((e) => {
      const appliedHere = Math.min(e.used, appliedLeft);
      appliedLeft -= appliedHere;
      const remainingAmt = e.amount - appliedHere;
      const expires = e.year <= taxYearNum - DONATION_CARRYOVER_YEARS;
      carryEntriesOut.push({ year: e.year, kind, amount: e.amount, applied: appliedHere, remaining: remainingAmt, expires });
      if (expires) donationCarryoverNext.expired += remainingAmt;
      else donationCarryoverNext[kind] += remainingAmt;
    });
    if (!useStandardCredit) {
      const currentNext = donationCalcResult.carryover.limitExcess[kind] + unappliedAmount(curChunk, curApplied);
      if (currentNext > 0) {
        carryEntriesOut.push({ year: taxYearNum, kind, amount: currentNext, applied: 0, remaining: currentNext, expires: false });
        donationCarryoverNext[kind] += currentNext;
      }
    }
  });
  donationCarryoverNext.total =
    donationCarryoverNext.special + donationCarryoverNext.generalNonReligious + donationCarryoverNext.generalReligious;

  const taxCreditsTotal = chosen.total;

  // 9. 결정세액 (소득세, 지방소득세 = 소득세의 10%)
  const finalIncomeTax = chosen.finalTax;
  const finalLocalTax = Math.floor(finalIncomeTax * 0.1);
  const finalTaxTotal = finalIncomeTax + finalLocalTax;

  // 10. 차감납부(환급)세액 = 결정세액 - 기납부세액
  // 음수면 환급(정부에서 돌려받음), 양수면 추가납부
  const diffIncomeTax = finalIncomeTax - paidIncomeTax;
  const diffLocalTax = finalLocalTax - paidLocalTax;
  const diffTotal = diffIncomeTax + diffLocalTax;

  // 환급 여부 (음수이면 환급)
  const isRefund = diffTotal <= 0;
  const refundTotal = Math.abs(diffTotal);
  const refundIncomeTax = Math.abs(diffIncomeTax);
  const refundLocalTax = Math.abs(diffLocalTax);

  return {
    userName,
    taxYear,
    hasUserData: true,
    totalSalary,
    earnedIncomeDeduction,
    earnedIncome,
    taxBase,
    calculatedTax,
    taxCreditsTotal,
    finalIncomeTax,
    finalLocalTax,
    finalTaxTotal,
    paidIncomeTax,
    paidLocalTax,
    paidTaxTotal,
    diffIncomeTax,
    diffLocalTax,
    diffTotal,
    isRefund,
    refundTotal,
    refundIncomeTax,
    refundLocalTax,
    humanDeductions: {
      total: humanDeductionsTotal,
      self: selfDeduction,
      spouse: spouseDeduction,
      dependents: dependentsDeduction,
      additional: additionalDeduction,
    },
    useStandardCredit,
    standardCreditComparison: {
      specialFinalTax: specialResult.finalTax,
      standardFinalTax: standardResult.finalTax,
      specialTaxBase: specialBase.taxBase,
      standardTaxBase: standardBase.taxBase,
    },
    incomeDeductions: {
      total: incomeDeductionsTotal,
      limitExcess: incomeDeductionLimitExcess,
      nationalPension,
      // 표준세액공제를 택하면 특별소득공제(건강·고용보험료, 주택자금)는 적용하지 않는다
      healthInsurance: useStandardCredit ? 0 : healthInsurance,
      employmentInsurance: useStandardCredit ? 0 : employmentInsurance,
      housingLoan: useStandardCredit ? 0 : housingLoanInput,
      specialIncomeDeductionsWaived: useStandardCredit ? specialIncomeDeductions : 0,
      housingSavings: housingSavingsDeduction,
      personalPension: personalPensionDeduction,
      creditCard: cardDeduction,
      creditCardDetail: cardResult,
      smallBiz: smallBizDeduction,
      longInvest: longInvestDeduction,
      ventureFund: ventureFundDeduction,
    },
    taxCredits: {
      total: taxCreditsTotal,
      rawTotal: (
        smeReduction +
        earnedIncomeCredit +
        marriageCredit +
        childCredit +
        insuranceCredit +
        medicalCredit +
        educationCredit +
        donationCredit +
        rentCredit +
        pensionCreditRaw +
        standardCreditRaw
      ),
      smeReduction,
      appliedSmeReduction,
      earnedIncomeCredit,
      appliedEarnedIncomeCredit,
      insuranceCredit,
      appliedInsuranceCredit,
      generalInsuranceCredit,
      disabledInsuranceCredit,
      medicalCredit,
      appliedMedicalCredit,
      educationCredit,
      appliedEducationCredit,
      donationCredit,
      appliedDonationCredit,
      politicalDonationCredit,
      appliedPoliticalDonationCredit,
      hometownDonationCredit,
      appliedHometownDonationCredit,
      specialDonationCredit,
      appliedSpecialDonationCredit,
      specialCarryDonationCredit: dch.specialCarry.credit,
      appliedSpecialCarryDonationCredit,
      specialCurrentDonationCredit: dch.specialCurrent.credit,
      appliedSpecialCurrentDonationCredit,
      employeeStockDonationCredit,
      appliedEmployeeStockDonationCredit,
      generalDonationCredit,
      appliedGeneralDonationCredit,
      generalNonReligiousDonationCredit,
      appliedGeneralNonReligiousDonationCredit,
      appliedGeneralNonReligiousCarryDonationCredit,
      appliedGeneralNonReligiousCurrentDonationCredit,
      generalReligiousDonationCredit,
      appliedGeneralReligiousDonationCredit,
      appliedGeneralReligiousCarryDonationCredit,
      appliedGeneralReligiousCurrentDonationCredit,
      donationCarryoverCredit,
      donationCarryoverNext,
      pensionCredit: pensionCreditRaw,
      appliedPensionCredit,
      childCredit,
      appliedChildCredit,
      rentCredit,
      appliedRentCredit,
      marriageCredit,
      appliedMarriageCredit,
      standardCredit,
      standardCreditRaw,
    },
    insuranceDetails: {
      generalPaid: finalGenInsurance,
      disabledPaid: finalDisInsurance,
      generalDeductible: Math.min(1000000, finalGenInsurance),
      disabledDeductible: Math.min(1000000, finalDisInsurance),
      generalCredit: generalInsuranceCredit,
      disabledCredit: disabledInsuranceCredit,
      totalCredit: insuranceCredit,
      appliedCredit: appliedInsuranceCredit,
    },
    donationDetails: donationCalcResult.details,
    medicalDetails: {
      threshold: medThreshold,
      selfPaid: medicalSelf,
      specialPaid: medicalSpecial,
      prematurePaid: medicalPremature,
      infertilityPaid: medicalInfertility,
      generalPaid: medicalGeneral,
      totalNetPaid: medicalSelf + medicalSpecial + medicalPremature + medicalInfertility + medicalGeneral,
      deductibleGeneral,
      deductibleSpecial,
      deductiblePremature,
      deductibleInfertility,
      creditGeneral,
      creditSpecial,
      creditPremature,
      creditInfertility,
      totalCredit: medicalCredit,
      appliedCredit: appliedMedicalCredit,
    },
    pensionAccount: {
      paid: pensionPaid,
      applied: pensionResult.applied,
      deductibleTotal: pensionInput,
      isaExtraLimit: pensionResult.isaExtra,
      savingLimit: pensionResult.savingLimit,
      totalLimit: pensionResult.totalLimit,
      rate: pensionRate,
      creditBeforeTaxCap: pensionCreditRaw,
      creditApplied: appliedPensionCredit,
    },
    creditApplyOrder: [
      '세액감면', '근로소득세액공제', '결혼세액공제', '자녀세액공제', '보장성보험료세액공제',
      '의료비세액공제', '교육비세액공제', '정치자금기부세액공제', '고향사랑기부금세액공제',
      '(표준세액공제)', '납세조합공제', '주택차입금공제', '월세액세액공제',
      '특례·우리사주·일반기부금세액공제', '외국납부세액공제', '연금계좌세액공제',
    ],
  };
}
