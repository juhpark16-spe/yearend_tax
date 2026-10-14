/**
 * 앱 화면을 최상단으로 스크롤
 * - 앱 프레임 안의 <main id="app-scroll-container">가 실제 스크롤 영역이므로 이를 함께 초기화
 * - 브라우저(window) 스크롤도 함께 0으로 맞춤 (모바일/구형 레이아웃 대비)
 */
export function scrollAppToTop() {
  try {
    const el = document.getElementById('app-scroll-container');
    if (el) el.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  } catch { /* ignore */ }
}
