/**
 * 화면 입력 자료 → 백엔드 세액 엔진 입력(PUT /sessions/{id}/inputs) 변환
 * - 주민등록번호 원문은 보내지 않는다 (생년월일·관계·소득·장애 여부만)
 * - 집계 금액은 화면 엔진(calculateSettlementTax) 결과를 그대로 사용해 두 엔진이 같은 입력을 보게 한다
 */
import { collectDonationItems, collectPensionItems } from './taxCalculator.js';
import { birthOrderOf, birthYearOf, cleanPersonName, isDisabledMember, isNewbornOrAdopted, shouldExcludeBasicDeduction } from './eligibility.js';

const n = (v) => {
  const x = Number(String(v ?? 0).replace(/,/g, ''));
  return Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0;
};

const toRelation = (rel = '', isSelf = false) => {
  if (isSelf || rel.includes('본인')) return 'SELF';
  if (rel === '배우자') return 'SPOUSE';
  if (rel.includes('자녀') || rel.includes('손자') || rel.includes('입양') || rel.includes('비속')) return 'CHILD';
  if (rel.includes('존속') || rel.includes('부/모') || rel.includes('부모')) return 'PARENT';
  return 'SIBLING';
};

const toBirthDate = (m = {}) => {
  const b = String(m.birth || m.birthDate || '').replace(/[^0-9]/g, '');
  if (b.length >= 8) return `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`;
  const by = birthYearOf(m);
  const r = String(m.rrn || '').replace(/[^0-9]/g, '');
  if (by && r.length >= 6) return `${by}-${r.slice(2, 4)}-${r.slice(4, 6)}`;
  return null;
};

export function buildServerInputs({ jsResult = {}, deductionData = {}, familyList = [], withholdingData = null, previousJobs = [], userName = '' } = {}) {
  const dd = deductionData || {};

  // 1) 근무지: 종(전) 근무지 + 나머지는 주(현) 근무지
  const prevList = (Array.isArray(previousJobs) ? previousJobs : [])
    .filter((j) => n(j.salary) > 0 || n(j.tax) > 0)
    .map((j) => ({
      workplace_type: 'PREVIOUS',
      company_name: String(j.company || '종(전) 근무지').slice(0, 200),
      gross_salary: n(j.salary),
      prepaid_income_tax: n(j.tax),
    }));
  const prevSalary = prevList.reduce((s, w) => s + w.gross_salary, 0);
  const prevTax = prevList.reduce((s, w) => s + w.prepaid_income_tax, 0);
  const workplaces = [
    {
      workplace_type: 'CURRENT',
      company_name: String(withholdingData?.companyName || withholdingData?.company || '주(현) 근무지').slice(0, 200),
      gross_salary: Math.max(0, n(jsResult.totalSalary) - prevSalary),
      prepaid_income_tax: Math.max(0, n(jsResult.paidIncomeTax) - prevTax),
      prepaid_local_tax: n(jsResult.paidLocalTax),
    },
    ...prevList,
  ];

  // 2) 부양가족: 부양가족 단계의 판정(기본공제·소득·장애)을 그대로 전달
  const dependents = (Array.isArray(familyList) ? familyList : []).map((m) => {
    const isSelf = Boolean(m.isSelf || m.relation === '본인');
    const by = birthYearOf(m);
    const excluded = !isSelf && (m.basicDeduction === '해당없음' || shouldExcludeBasicDeduction(m));
    return {
      name: cleanPersonName(m.name) || (isSelf ? '본인' : '부양가족'),
      relation: toRelation(String(m.relation || ''), isSelf),
      birth_date: toBirthDate(m),
      annual_income_amount: m.incomeOver === '초과함' ? 5000000 : 0,
      is_disabled: isDisabledMember(m),
      is_elderly: Boolean(by && 2025 - by >= 70),
      is_basic_deduction: isSelf ? true : !excluded,
      // 출산·입양 세액공제: 해당 과세연도 출생·입양 자녀만 순서(첫째·둘째·셋째 이상) 전달
      birth_order: !isSelf && !excluded && isNewbornOrAdopted(m) ? birthOrderOf(m, familyList) : 0,
    };
  });
  if (!dependents.some((d) => d.relation === 'SELF')) {
    dependents.unshift({ name: userName || '본인', relation: 'SELF', is_basic_deduction: true });
  }

  // 3) 연금: 화면 엔진이 분류한 구분별 납입액 + 2000년 이전 개인연금저축
  const pensionPaid = jsResult.pensionAccount?.paid || {};
  const pensionItems = collectPensionItems({ deductionData: dd, hometaxData: null, userName });
  const personalPensionOldPaid = pensionItems
    .filter((it) => String(it.type || '').includes('개인연금'))
    .filter((it) => {
      const y = parseInt(String(it.startDate || '').replace(/[^0-9]/g, '').slice(0, 4), 10);
      return !y || y <= 2000;
    })
    .reduce((s, it) => s + n(it.rawAmount ?? it.amount), 0);

  // 4) 장기집합투자증권 / 벤처투자조합 납입액
  const longItems = Array.isArray(dd.longInvestItems) ? dd.longInvestItems : [];
  const isVenture = (t = '') => t.includes('벤처') || t.includes('투자조합') || t.includes('신탁');
  const longNonVenture = longItems.filter((it) => !isVenture(String(it.type || '')));
  // 국세청 자료는 공제대상금액(가입요건 반영)을 그대로, 직접 입력분은 납입액을 보낸다 (화면 엔진과 같은 기준)
  const isNtsDeductible = (it) => it.isNts && it.deductibleAmount !== undefined && it.deductibleAmount !== null;
  const longInvestNtsDeductible = longNonVenture.filter(isNtsDeductible).reduce((s, it) => s + n(it.deductibleAmount), 0);
  const longInvestPaid = longNonVenture.filter((it) => !isNtsDeductible(it)).reduce((s, it) => s + n(it.rawAmount ?? it.amount), 0);
  const ventureFundPaid = longItems.filter((it) => isVenture(String(it.type || ''))).reduce((s, it) => s + n(it.rawAmount ?? it.amount), 0);

  // 5) 교육비: 인별 내역('확인 필요' 미포함 항목은 제외 표시)
  const educationDetails = (Array.isArray(dd.eduItems) ? dd.eduItems : []).map((it) => ({
    name: cleanPersonName(it.name),
    category: it.category || '',
    amount: n(it.amount),
    needs_review: Boolean(it.needsReview),
  }));

  // 6) 기부금: 종류별 내역 (정치자금·고향사랑·우리사주는 본인 기부분만 공제 — 화면 엔진과 같은 본인 판정)
  const donationDetails = collectDonationItems({ deductionData: dd, hometaxData: null, userName })
    .map((it) => {
      const pName = cleanPersonName(it.name);
      const isSelf = !it.relation || it.relation === '본인' || (userName && pName.includes(userName)) || pName === '본인';
      return {
        type: String(it.type || it.raw_type || it.category || ''),
        amount: n(it.amount),
        is_self: Boolean(isSelf),
      };
    })
    .filter((it) => it.amount > 0);

  const expense = {
    national_pension: n(jsResult.incomeDeductions?.nationalPension),
    health_insurance: n(jsResult.incomeDeductions?.healthInsurance),
    employment_insurance: n(jsResult.incomeDeductions?.employmentInsurance),
    credit_card_general: n(dd.creditCard),
    debit_card_cash: n(dd.debitCard) + n(dd.cashReceipt),
    market_transport: n(dd.marketCard) + n(dd.transitCard),
    culture_sports: n(dd.cultureCard),
    housing_subscription: n(dd.housingSavings),
    mortgage_interest: n(dd.housingLoan),
    personal_pension_saving: n(pensionPaid.saving),
    irp_saving: n(pensionPaid.irp),
    medical_general: n(dd.medicalGeneral),
    medical_special: n(dd.medicalSpecial),
    education_child: n(dd.education),
    monthly_rent_paid: n(dd.rent),
    raw_details: {
      isa_irp_saving: n(pensionPaid.isaIrp),
      isa_pension_saving: n(pensionPaid.isaSaving),
      general_insurance: n(jsResult.insuranceDetails?.generalPaid),
      disabled_insurance: n(jsResult.insuranceDetails?.disabledPaid),
      medical_general: n(dd.medicalGeneral),
      medical_special: n(dd.medicalSpecial),
      medical_self: n(dd.medicalSelf),
      medical_premature: n(dd.medicalPremature),
      medical_infertility: n(dd.medicalInfertility),
      donation_amount: n(dd.donation),
      donation_details: donationDetails,
      // 전년도 이월 기부금 (특례·일반, 기부연도별 이월 잔액)
      donation_carryover: (Array.isArray(dd.donationCarryoverItems) ? dd.donationCarryoverItems : [])
        .map((it) => ({ year: n(it.year), type: String(it.type || ''), amount: n(it.amount) }))
        .filter((it) => it.amount > 0),
      education_details: educationDetails,
      personal_pension_old_paid: personalPensionOldPaid,
      small_biz_paid: n(dd.smallBiz),
      long_invest_paid: longInvestPaid,
      long_invest_nts_deductible: longInvestNtsDeductible,
      venture_fund_paid: ventureFundPaid,
    },
  };

  return {
    workplaces,
    dependents,
    expense,
    is_newly_married: n(jsResult.taxCredits?.marriageCredit) > 0,
  };
}

/** 화면 엔진 결과와 백엔드 결과를 단계별로 비교 */
export function compareEngines(jsResult = {}, server = {}) {
  const rows = [
    ['총급여', jsResult.totalSalary, server.total_gross_salary],
    ['근로소득금액', jsResult.earnedIncome, server.earned_income_amount],
    ['인적공제', jsResult.humanDeductions?.total, server.total_personal_deduction],
    ['과세표준', jsResult.taxBase, server.taxable_standard],
    ['산출세액', jsResult.calculatedTax, server.calculated_tax],
    ['결정세액(소득세)', jsResult.finalIncomeTax, server.final_decision_tax],
    ['차감징수(소득세)', jsResult.diffIncomeTax, server.final_refund_amount],
  ];
  return rows.map(([label, a, b]) => ({ label, js: Math.round(Number(a) || 0), server: Math.round(Number(b) || 0), same: Math.round(Number(a) || 0) === Math.round(Number(b) || 0) }));
}

/**
 * 세액공제·감면 항목별 비교 (산출세액 한도 적용 전 산출액 기준)
 * - 결정세액이 같아도 항목별 산식 차이를 찾을 수 있도록 각 공제를 한도 차감 전 금액으로 비교한다.
 * - 백엔드 값은 /audit 감사 로그의 단계별 기록에서 읽는다.
 */
export function compareCredits(jsResult = {}, auditLogs = [], server = {}) {
  const tc = jsResult.taxCredits || {};
  const byName = (name) => (auditLogs || []).find((l) => l.step_name === name) || {};
  const amt = (l) => Math.round(Number(l.calculated_amount ?? l.output_value ?? 0) || 0);
  const special = byName('특별세액공제 및 표준세액공제 비교');
  const sp = special.input_snapshot || {};
  const separate = byName('정치자금·고향사랑·우리사주 기부금 세액공제');
  const pension = byName('연금계좌 세액공제');
  const pensionBeforeCap = (pension.output_snapshot || {}).tax_credit_pension_account_before_cap;
  const rows = [
    ['중소기업 취업자 감면', tc.smeReduction, amt(byName('중소기업 취업자 소득세 감면'))],
    ['근로소득세액공제', tc.earnedIncomeCredit, amt(byName('근로소득 세액공제'))],
    ['자녀세액공제', tc.childCredit, amt(byName('자녀 세액공제'))],
    ['혼인세액공제', tc.marriageCredit, amt(byName('신혼부부 혼인 세액공제'))],
    ['보험료', tc.insuranceCredit, sp.ins_credit],
    ['의료비', tc.medicalCredit, sp.med_credit],
    ['교육비', tc.educationCredit, sp.edu_credit],
    ['기부금', tc.donationCredit, (Number(sp.don_credit) || 0) + amt(separate)],
    ['월세액', tc.rentCredit, amt(byName('월세액 세액공제'))],
    ['연금계좌', tc.pensionCredit, pensionBeforeCap ?? amt(pension)],
    ['표준세액공제', tc.standardCreditRaw ?? tc.standardCredit, sp.standard_tax_credit],
  ];
  const items = rows.map(([label, a, b]) => {
    const js = Math.round(Number(a) || 0);
    const sv = Math.round(Number(b) || 0);
    return { label, js, server: sv, same: js === sv };
  });
  // 산출세액 한도를 반영해 실제로 적용된 세액공제·감면 합계
  const appliedJs = Math.round((Number(jsResult.calculatedTax) || 0) - (Number(jsResult.finalIncomeTax) || 0));
  const appliedServer = Math.round((Number(server.calculated_tax) || 0) - (Number(server.final_decision_tax) || 0));
  items.push({ label: '적용 합계 (산출세액 한도 반영)', js: appliedJs, server: appliedServer, same: appliedJs === appliedServer, total: true });
  return items;
}

/**
 * 세액감면·공제 적용순서별 실제 적용액 비교 (산출세액 한도 배분)
 * - 두 엔진 모두 소득세법 제60조 순서로 남은 산출세액 안에서 차감한다:
 *   ① 세액감면 → ② 이월공제 불가 세액공제 → ③ 이월공제 가능(특례·일반기부금, 같은 종류는 이월분 먼저) → ④ 연금계좌
 */
export const CREDIT_APPLY_ORDER = [
  ['세액감면(중소기업 취업자)', 'appliedSmeReduction'],
  ['근로소득세액공제', 'appliedEarnedIncomeCredit'],
  ['혼인세액공제', 'appliedMarriageCredit'],
  ['자녀세액공제', 'appliedChildCredit'],
  ['보장성보험료', 'appliedInsuranceCredit'],
  ['의료비', 'appliedMedicalCredit'],
  ['교육비', 'appliedEducationCredit'],
  ['정치자금기부금', 'appliedPoliticalDonationCredit'],
  ['고향사랑기부금', 'appliedHometownDonationCredit'],
  ['우리사주조합기부금', 'appliedEmployeeStockDonationCredit'],
  ['표준세액공제', 'standardCredit'],
  ['월세액', 'appliedRentCredit'],
  ['특례기부금(이월분)', 'appliedSpecialCarryDonationCredit'],
  ['특례기부금', 'appliedSpecialCurrentDonationCredit'],
  ['일반기부금(종교단체 외·이월분)', 'appliedGeneralNonReligiousCarryDonationCredit'],
  ['일반기부금(종교단체 외)', 'appliedGeneralNonReligiousCurrentDonationCredit'],
  ['일반기부금(종교단체·이월분)', 'appliedGeneralReligiousCarryDonationCredit'],
  ['일반기부금(종교단체)', 'appliedGeneralReligiousCurrentDonationCredit'],
  ['연금계좌', 'appliedPensionCredit'],
];

export function creditGroupOf(label) {
  if (label.startsWith('세액감면')) return '① 세액감면';
  if (label === '연금계좌') return '④ 초과분 미공제';
  if (label.startsWith('특례기부금') || label.startsWith('일반기부금')) return '③ 이월 가능';
  return '② 이월 불가';
}

export function compareAppliedCredits(jsResult = {}, auditLogs = []) {
  const tc = jsResult.taxCredits || {};
  const alloc = (auditLogs || []).find((l) => l.step_name === '세액감면·공제 적용순서별 배분') || {};
  const applied = (alloc.output_snapshot || {}).applied || {};
  return CREDIT_APPLY_ORDER.map(([label, jsKey], idx) => {
    const js = Math.round(Number(tc[jsKey]) || 0);
    const server = Math.round(Number(applied[label]) || 0);
    return { order: idx + 1, label, group: creditGroupOf(label), js, server, same: js === server };
  });
}
