/**
 * 게스트(로그인 없이 둘러보기) 세션 및 데이터 관리 유틸리티
 * 
 * 정책:
 * 1. "로그인 없이 데모 바로 둘러보기" 클릭 시: 이전 비로그인 업로드/입력 자료 완전 리셋
 * 2. 1회 입장 후 둘러보는 동안: 메뉴 간 이동 시 업로드 및 입력 데이터 유지
 * 3. 로그인 화면으로 복귀 시 or 다음에 다시 둘러보기 입장 시: 깨끗한 초기 상태로 리셋
 * 4. 새로고침(F5): sessionStorage가 남아 있으므로 보던 화면과 자료를 그대로 유지
 * 5. 브라우저 창/탭을 닫았을 때: sessionStorage가 사라지므로 다음 접속 시 이전 자료를 완전 삭제
 *    (beforeunload는 새로고침과 창 닫기를 구분하지 못하므로 삭제 시점으로 쓰지 않는다)
 * 6. (2-C) 게스트는 서버에서도 게스트마다 별도 계정(서명 토큰)으로 분리되며, 위 리셋 시점에
 *    게스트 토큰을 폐기하고 서버에 남은 게스트 세션·결과·감사로그 삭제를 요청한다.
 */
import { discardGuestIdentity } from '../services/api.js';

export const GUEST_TAX_STORAGE_KEYS = [
  'hometax_extracted_data',
  'selftax_family_list',
  'selftax_withholding_data',
  'selftax_previous_jobs',
  'selftax_deduction_data',
  'selftax_housing_loan_checklist',
  'selftax_housing_savings_checklist',
  'selftax_rent_checklist',
  'selftax_small_biz_checklist',
  'selftax_other_medical',
  'selftax_other_insurance',
  'selftax_other_education',
  'selftax_other_donation',
  'selftax_other_card',
  'selftax_other_pension',
  'selftax_other_long_invest',
  'selftax_other_small_biz',
  'selftax_other_deduct',
  'selftax_other_housing_loan',
  'selftax_other_housing_savings',
  'selftax_other_rent',
  'selftax_ai_report_data',
  'selftax_donation_carryover',
  'selftax_edu_review_included',
  'selftax_server_session_id',
  'selftax_active_owner',
];

export const GUEST_SESSION_TOKEN = 'selftax_guest_active_session';
export const GUEST_MODE_FLAG = 'selftax_is_guest_mode';

/**
 * 비로그인 게스트가 업로드/입력한 모든 자료를 로컬/세션 스토리지에서 일괄 삭제(리셋)
 */
export function clearGuestTaxData() {
  try {
    // 서버 측 게스트 자료 삭제 요청 + 게스트 토큰 폐기 (다음 둘러보기는 새 게스트로 시작)
    discardGuestIdentity();
    GUEST_TAX_STORAGE_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    // 게스트 진행상태 및 완료메뉴 키 정리 (등록된 실제 사용자 번들과 진행 키는 절대 삭제하지 않음)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // 실제 로그인 사용자의 영구 보존 번들(`selftax_user_bundle_...`)은 절대 삭제 금지
      if (k.startsWith('selftax_user_bundle_') && k !== 'selftax_user_bundle_guest') {
        continue;
      }
      // 실제 로그인 사용자의 진행 상태 키는 삭제 금지
      if (
        (k.startsWith('taxProgress_') && k !== 'taxProgress_guest') ||
        (k.startsWith('completedMenus_') && k !== 'completedMenus_guest')
      ) {
        continue;
      }

      if (
        k === 'taxProgress_guest' ||
        k === 'completedMenus_guest' ||
        k === 'selftax_user_bundle_guest' ||
        k.startsWith('selftax_other_') ||
        k.includes('checklist') ||
        k.includes('guest')
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    sessionStorage.removeItem(GUEST_SESSION_TOKEN);
    localStorage.removeItem(GUEST_MODE_FLAG);
  } catch (err) {
    console.error('clearGuestTaxData error:', err);
  }
}

/**
 * 신규 게스트 세션 시작 (이전 잔여 자료 삭제 후 활성 세션 토큰 부여)
 */
export function startGuestSession() {
  clearGuestTaxData();
  sessionStorage.setItem(GUEST_SESSION_TOKEN, 'active');
  localStorage.setItem(GUEST_MODE_FLAG, 'true');
}

/**
 * 이 탭에서 게스트 둘러보기가 진행 중임을 표시 (자료는 지우지 않음 — 새로고침 후 복원 판단용)
 */
export function markGuestSessionActive() {
  try {
    sessionStorage.setItem(GUEST_SESSION_TOKEN, 'active');
    localStorage.setItem(GUEST_MODE_FLAG, 'true');
  } catch { /* 저장소 사용 불가 시 새로고침 복원만 되지 않음 */ }
}

/**
 * 현재 활성 상태인 게스트 세션인지 확인 (창이 닫히면 sessionStorage가 사라짐)
 */
export function isGuestSessionActive() {
  return sessionStorage.getItem(GUEST_SESSION_TOKEN) === 'active';
}

/**
 * 창이 닫혔다 다시 열렸거나 세션이 만료된 경우 비로그인 데이터 자동 리셋 검사
 */
export function checkAndResetExpiredGuestSession(isLoggedIn) {
  if (isLoggedIn) return;
  if (!isGuestSessionActive()) {
    clearGuestTaxData();
  }
}
