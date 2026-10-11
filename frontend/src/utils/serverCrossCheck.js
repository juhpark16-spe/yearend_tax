/**
 * 서버 교차검증 실행 (화면 엔진 결과 vs 백엔드 결정론적 엔진)
 * - 근로자용 한 줄(CalcVerificationLine)과 검증 모드(개발자용) 카드(ServerCrossCheckCard)가 함께 쓴다.
 * - 같은 입력을 PUT /sessions/{id}/inputs → POST /calculate → GET /result, /audit 로 다시 계산해 비교한다.
 */
import { taxService, withServerSession } from '../services/api.js';
import { buildServerInputs, compareAppliedCredits, compareCredits, compareEngines } from './serverInputs.js';
import { getSecureItem } from './secureStorage.js';

export async function runServerCrossCheck({ jsResult, userName = '' }) {
  const inputs = buildServerInputs({
    jsResult,
    deductionData: getSecureItem('selftax_deduction_data') || {},
    familyList: getSecureItem('selftax_family_list', []) || [],
    withholdingData: getSecureItem('selftax_withholding_data'),
    previousJobs: getSecureItem('selftax_previous_jobs', []) || [],
    userName,
  });
  const { result, audit } = await withServerSession(async (sessionId) => {
    await taxService.saveSessionInputs(sessionId, inputs);
    await taxService.calculateTax(sessionId);
    return {
      result: await taxService.getResult(sessionId),
      audit: await taxService.getAuditTrail(sessionId),
    };
  });
  const logs = Array.isArray(audit?.logs) ? audit.logs : [];
  const rows = compareEngines(jsResult, result);
  const creditRows = compareCredits(jsResult, logs, result);
  const appliedRows = compareAppliedCredits(jsResult, logs);
  const diffs = [
    ...rows.filter((r) => !r.same).map((r) => ({ kind: '단계', ...r })),
    ...creditRows.filter((r) => !r.same && !r.total).map((r) => ({ kind: '세액공제 산출액', ...r })),
    ...appliedRows.filter((r) => !r.same).map((r) => ({ kind: '적용 순서·적용액', ...r })),
  ];
  return { rows, creditRows, appliedRows, logs, diffs, allSame: rows.length > 0 && diffs.length === 0 };
}

const DEV_LOG_KEY = 'selftax_verify_dev_log';

/** 두 엔진 결과가 다를 때 개발자용 기록을 남긴다 (브라우저 콘솔 + 이 탭의 sessionStorage, 최근 20건) */
export function recordVerificationMismatch(diffs = [], context = {}) {
  const entry = { at: new Date().toISOString(), ...context, diffs };
  // eslint-disable-next-line no-console
  console.warn('[정산봄 계산 검증] 화면 엔진과 백엔드 엔진 결과가 다릅니다', entry);
  try {
    const prev = JSON.parse(sessionStorage.getItem(DEV_LOG_KEY) || '[]');
    sessionStorage.setItem(DEV_LOG_KEY, JSON.stringify([...prev, entry].slice(-20)));
  } catch { /* 기록 실패는 무시 */ }
}

export function readVerificationDevLog() {
  try { return JSON.parse(sessionStorage.getItem(DEV_LOG_KEY) || '[]'); } catch { return []; }
}
