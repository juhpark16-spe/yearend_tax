/**
 * 검증 모드(개발자용) 스위치
 * - 켜기: 주소 뒤에 ?verify=1 (이 탭이 열려 있는 동안 유지, 새로고침해도 유지)
 * - 끄기: ?verify=0 또는 탭 닫기
 * - 항상 켜기(발표용 빌드 등): frontend/.env 에 VITE_VERIFY_MODE=true
 * 검증 모드에서는 결과 화면에 두 엔진 비교표·감사 로그 원문(서버 교차검증 카드)을 보여 준다.
 */
const KEY = 'selftax_verify_mode';

export function isVerifyMode() {
  try {
    const param = new URLSearchParams(window.location.search).get('verify');
    if (param === '1' || param === 'true') sessionStorage.setItem(KEY, '1');
    if (param === '0' || param === 'false') sessionStorage.removeItem(KEY);
    if (sessionStorage.getItem(KEY) === '1') return true;
  } catch { /* 저장소 사용 불가 */ }
  return String(import.meta.env?.VITE_VERIFY_MODE || '').toLowerCase() === 'true';
}
