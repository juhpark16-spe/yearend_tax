/**
 * 연금계좌 세액공제 공제한도 계산 (2024년 이후 귀속)
 *
 * ※ 연금계좌 세액공제에 대한 공제한도 (2024년~)
 *  - 기존 연금계좌 한도 초과시 ISA 납입 금액의 10% 한도 추가 (최대 300만원)
 *  - 연금계좌 공제한도 차감순서 : 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축
 *
 *  | 총급여액        | 연금저축계좌 공제한도 (퇴직연금/ISA퇴직연금 합산시 한도) | 공제율 |
 *  | 5,500만원 이하  | 600만원 (900만원) + min(ISA납입액 x 10%, 300만원)      | 15%    |
 *  | 5,500만원 초과  | 600만원 (900만원) + min(ISA납입액 x 10%, 300만원)      | 12%    |
 */

export const PENSION_SAVING_LIMIT = 6000000; // 연금저축계좌 공제한도
export const PENSION_TOTAL_LIMIT = 9000000; // 퇴직연금(IRP) 합산 공제한도
export const ISA_EXTRA_RATE = 0.1; // ISA 납입액의 10%
export const ISA_EXTRA_MAX = 3000000; // ISA 추가한도 최대 300만원
export const PENSION_SALARY_THRESHOLD = 55000000; // 총급여 5,500만원

/** 연금계좌 구분 분류: personal(개인연금저축, 소득공제) | irp | saving | isaIrp | isaSaving */
export function classifyPensionType(type) {
  const t = String(type || '').trim();
  if (t.includes('개인연금')) return 'personal';
  const isIsa = /isa/i.test(t);
  const isRetire = t.includes('퇴직') || /irp/i.test(t) || t.includes('확정기여') || /\bdc\b/i.test(t) || t.includes('과학기술');
  if (isIsa) return isRetire ? 'isaIrp' : 'isaSaving';
  return isRetire ? 'irp' : 'saving';
}

/** 총급여액 구간별 세액공제율 */
export function getPensionCreditRate(totalSalary) {
  return (Number(totalSalary) || 0) <= PENSION_SALARY_THRESHOLD ? 0.15 : 0.12;
}

/**
 * 구분별 납입액에 공제한도를 차감순서대로 적용
 * @param {{irp?:number, saving?:number, isaIrp?:number, isaSaving?:number}} paid 구분별 납입액
 * @returns {{applied:object, total:number, isaExtra:number, savingLimit:number, totalLimit:number}}
 */
export function allocatePensionLimits(paid = {}) {
  const irp = Math.max(0, Number(paid.irp) || 0);
  const saving = Math.max(0, Number(paid.saving) || 0);
  const isaIrp = Math.max(0, Number(paid.isaIrp) || 0);
  const isaSaving = Math.max(0, Number(paid.isaSaving) || 0);

  // 1. ISA 만기 전환 추가한도: min(ISA 납입액 합계 x 10%, 300만원)
  const isaExtra = Math.min(Math.floor((isaIrp + isaSaving) * ISA_EXTRA_RATE), ISA_EXTRA_MAX);

  // 2. 일반 연금계좌(기본한도 900만원, 연금저축 600만원) 차감
  // ※ 세법상 ISA 추가한도는 ISA 전환 납입분에만 적용되며, 일반 연금저축 납입분은 기본한도(900만/600만)를 초과할 수 없음
  let remainBaseTotal = PENSION_TOTAL_LIMIT; // 900만원
  let remainBaseSaving = PENSION_SAVING_LIMIT; // 600만원

  // 1순위: 퇴직연금 (기본 총한도 900만원 내)
  const aIrp = Math.min(irp, remainBaseTotal);
  remainBaseTotal -= aIrp;

  // 2순위: 연금저축 (기본 연금저축 한도 600만원 및 잔여 총한도 내)
  const aSaving = Math.min(saving, remainBaseSaving, remainBaseTotal);
  remainBaseTotal -= aSaving;
  remainBaseSaving -= aSaving;

  // 3. ISA 연금계좌 차감 (남은 기본한도 + ISA 추가한도)
  // 차감순서: ISA퇴직연금 > ISA연금저축
  let remainIsaTotal = remainBaseTotal + isaExtra;
  let remainIsaSaving = remainBaseSaving + isaExtra;

  // 3순위: ISA 퇴직연금
  const aIsaIrp = Math.min(isaIrp, remainIsaTotal);
  remainIsaTotal -= aIsaIrp;

  // 4순위: ISA 연금저축
  const aIsaSaving = Math.min(isaSaving, remainIsaSaving, remainIsaTotal);
  remainIsaTotal -= aIsaSaving;

  const applied = { irp: aIrp, saving: aSaving, isaIrp: aIsaIrp, isaSaving: aIsaSaving };
  return {
    applied,
    total: aIrp + aSaving + aIsaIrp + aIsaSaving,
    isaExtra,
    savingLimit: PENSION_SAVING_LIMIT + isaExtra,
    totalLimit: PENSION_TOTAL_LIMIT + isaExtra,
  };
}

/** 연금계좌 세액공제액 = 공제대상 납입액 x 공제율 (총급여 5,500만원 이하 15%, 초과 12%) */
export function calculatePensionAccountCredit(paid, totalSalary) {
  const alloc = allocatePensionLimits(paid);
  const rate = getPensionCreditRate(totalSalary);
  return { ...alloc, rate, credit: Math.floor(alloc.total * rate) };
}
