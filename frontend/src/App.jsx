import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import IntroScreen from './components/godash/IntroScreen';
import MainDashboard from './components/godash/MainDashboard';
import DesignAlertModal from './components/DesignAlertModal';
import BgmPlayer from './components/BgmPlayer';
import {
  checkAndResetExpiredGuestSession,
  isGuestSessionActive,
  markGuestSessionActive,
} from './utils/guestStorage';

// 새로고침(F5) 후에도 보던 화면을 유지하기 위한 키 (sessionStorage: 탭을 닫으면 사라짐)
const SCREEN_STORAGE_KEY = 'selftax_current_screen';
const readSavedScreen = () => {
  try { return sessionStorage.getItem(SCREEN_STORAGE_KEY) || 'intro'; } catch { return 'intro'; }
};
import {
  saveUserData,
  loadUserData,
  clearActiveTaxData,
  checkHasInputData,
  checkHasWithholdingData,
  checkHasFamilyData,
  removeUserTaxDataKey,
} from './utils/userTaxStorage';
import { discardGuestIdentity, GUEST_TOKEN_STORAGE_KEY } from './services/api';

// 코드 분할 (Code Splitting): 페이지별 지연 로딩을 통한 초기 번들 크기 및 로딩 속도 최적화
const FamilyPage = lazy(() => import('./pages/FamilyPage'));
const WithholdingPage = lazy(() => import('./pages/WithholdingPage'));
const PreviousJobPage = lazy(() => import('./pages/PreviousJobPage'));
const HometaxPage = lazy(() => import('./pages/HometaxPage'));
const DataInputPage = lazy(() => import('./pages/DataInputPage'));
const TaxHistoryPage = lazy(() => import('./pages/TaxHistoryPage'));
const TaxResultPage = lazy(() => import('./pages/TaxResultPage'));
const AiReportPage = lazy(() => import('./pages/AiReportPage'));
const RequiredDocsPage = lazy(() => import('./pages/RequiredDocsPage'));
const TaxTipsPage = lazy(() => import('./pages/TaxTipsPage'));
const UserGuidePage = lazy(() => import('./pages/UserGuidePage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));

// 페이지 전환 로딩 스피너 컴포넌트
function PageLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] py-16">
      <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
      <p className="mt-4 text-sm font-medium text-slate-500 animate-pulse">화면을 불러오는 중입니다...</p>
    </div>
  );
}

/**
 * 2025년 AI 셀프 연말정산 SPA 메인 애플리케이션 (정산봄)
 * 요구사항:
 * - 서비스 최초 접속 시 '정산봄' AI 연말정산 사전점검 인트로 랜딩페이지 표시
 * - Google 로그인 완료 시 메인 대시보드로 자동 이동 및 프로필/로그아웃 제공
 * - 비로그인(게스트) 데모 둘러보기 시:
 *   1) 1회 입장 후 둘러보는 동안: 메뉴 간 이동 시 업로드 및 입력 데이터 정상 유지
 *   2) 로그인 화면으로 복귀 시 or 다시 데모 입장 시: 이전 데이터 완전 리셋
 *   3) 새로고침(F5)하면: 보던 화면과 입력 자료를 그대로 유지
 *   4) 브라우저 창/탭을 닫으면: 다음 접속 시 이전 업로드/입력 자료 완전 삭제(초기화)
 */
export default function App() {
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const isLoggingOutRef = useRef(false);

  // 로그인한 근로자 성명
  const loggedInWorkerName = (profile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || '')
    .replace(/\s*\(Google\)/g, '')
    .trim() || '근로자';

  // 서비스에 처음 접속하면 인트로 랜딩페이지('intro')가 기본으로 노출됩니다.
  // 새로고침이면 이 탭에서 보던 화면을 복원합니다 (로그인·게스트 여부는 인증 확인 후 다시 판정).
  const [currentScreen, setCurrentScreen] = useState(readSavedScreen);

  // 게스트(로그인 없이 둘러보기) 재입장 시 컴포넌트 내부 상태를 완전히 새로고침(리셋)하기 위한 세션 키
  const [guestSessionKey, setGuestSessionKey] = useState(() => Date.now());

  // 연말정산 진행상태 (1:미작성, 2:작성중, 3:작성완료, 4:확인완료) - user별 localStorage 영속화
  const [taxProgress, setTaxProgress] = useState(1);

  // 작성완료된 메뉴 목록 (Set) - user별 localStorage 영속화
  const [completedMenus, setCompletedMenus] = useState(new Set());

  // 예상세액 상세결과 데이터 (AI 연말정산 리포트로 전달)
  const [aiReportData, setAiReportDataState] = useState(null);

  // 국세청 간소화 PDF에서 추출된 공제 데이터 (HometaxPage → DataInputPage 전달)
  const [hometaxExtractedData, setHometaxExtractedDataState] = useState(() => {
    try {
      const saved = localStorage.getItem('hometax_extracted_data');
      if (saved) {
        return JSON.parse(saved);
      }
      return null;
    } catch {
      return null;
    }
  });

  // 최신 PDF 추출·AI 리포트 값을 즉시 참조하기 위한 ref
  // (setState 직후 같은 이벤트 안에서 저장하면 이전 값(null)이 저장돼 국세청 자료가 지워지던 문제 방지)
  const hometaxDataRef = useRef(hometaxExtractedData);
  const aiReportDataRef = useRef(aiReportData);
  const setHometaxExtractedData = (d) => {
    hometaxDataRef.current = d;
    setHometaxExtractedDataState(d);
  };
  const setAiReportData = (d) => {
    aiReportDataRef.current = d;
    setAiReportDataState(d);
  };

  // 1) 최초 로드 시: 브라우저 탭/창을 닫았다가 다시 열었을 때 게스트 세션 만료 검사 및 잔여 자료 리셋
  //    (인증 상태 확인 중에는 로그인 사용자를 게스트로 오인하여 자료를 지우지 않도록 대기)
  useEffect(() => {
    if (authLoading) return;
    if (isLoggingOutRef.current) return;
    checkAndResetExpiredGuestSession(Boolean(user?.id));
    // 로그인도 진행 중인 둘러보기도 아니면(창을 닫았다 다시 연 경우 등) 복원한 화면 대신 인트로로
    if (!user?.id && !isGuestSessionActive()) setCurrentScreen('intro');
  }, [user?.id, authLoading]);

  // 1-1) 보고 있는 화면을 탭 단위로 기억 (새로고침 시 복원)
  useEffect(() => {
    try { sessionStorage.setItem(SCREEN_STORAGE_KEY, currentScreen); } catch { /* ignore */ }
  }, [currentScreen]);

  // 2) 페이지를 떠날 때(beforeunload — 새로고침과 창 닫기 모두): 작성 내용을 저장만 합니다.
  //    게스트 자료 삭제는 창이 닫혀 sessionStorage가 사라진 뒤 다음 접속 시(1번) 처리합니다.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isLoggingOutRef.current) return;
      saveUserData(user?.id || 'guest');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.id]);

  // 2-1) 로그인 사용자의 각 메뉴 입력/PDF 업로드 내용을 주기적으로 계정별 저장소에 자동 저장
  useEffect(() => {
    if (!user?.id || authLoading) return undefined;
    const timer = setInterval(() => {
      if (!isLoggingOutRef.current && user?.id) {
        saveUserData(user.id);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [user?.id, authLoading]);

  // 3) user가 로그인/변경될 때마다 해당 사용자의 영구 저장소에서 이전 입력/업로드 자료 100% 복원
  useEffect(() => {
    if (authLoading) return;
    if (isLoggingOutRef.current) return;
    const effectiveId = user?.id || 'guest';
    // 게스트로 둘러보다 로그인하면 게스트 토큰과 서버의 게스트 자료를 폐기 (게스트 세션 분리)
    if (user?.id) {
      try {
        if (localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)) discardGuestIdentity();
      } catch { /* ignore */ }
    }
    // loadUserData는 계정이 바뀌었으면 이전 계정의 활성 자료를 비운다 (claimActiveWorkspace)
    const restored = loadUserData(effectiveId);
    if (restored && restored.hasData) {
      setTaxProgress(restored.taxProgress || 1);
      const menus = new Set(restored.completedMenus || []);

      // 부양가족 실제 입력 여부와 completedMenus 동기화 (빈 '본인' 한 줄만 있으면 미완료)
      if (checkHasFamilyData()) {
        menus.add('family');
      } else {
        menus.delete('family');
      }

      // 근로소득원천징수영수증 업로드 여부와 completedMenus 동기화
      if (checkHasWithholdingData(effectiveId)) {
        menus.add('withholding');
      } else {
        menus.delete('withholding');
      }

      // 국세청 간소화 자료 업로드 여부와 completedMenus 동기화
      const rawLocalHometax = localStorage.getItem('hometax_extracted_data');
      let parsedLocalHometax = null;
      if (rawLocalHometax) {
        try { parsedLocalHometax = JSON.parse(rawLocalHometax); } catch (e) {}
      }
      const hasHometax = Boolean(
        (restored.hometaxData && (restored.hometaxData.uploaded || restored.hometaxData.fileName || (Array.isArray(restored.hometaxData.persons) && restored.hometaxData.persons.length > 0))) ||
        (parsedLocalHometax && (parsedLocalHometax.uploaded || parsedLocalHometax.fileName || (Array.isArray(parsedLocalHometax.persons) && parsedLocalHometax.persons.length > 0)))
      );
      if (hasHometax) {
        menus.add('hometax');
      } else {
        menus.delete('hometax');
      }

      // 공제자료 입력 메뉴 동기화 (국세청 자료 또는 수기 입력 자료가 존재할 때만 완료)
      if (checkHasInputData(effectiveId)) {
        menus.add('input_data');
      } else {
        menus.delete('input_data');
      }

      setCompletedMenus(menus);
      if (restored.hometaxData) {
        setHometaxExtractedData(restored.hometaxData);
      }
      if (restored.aiReportData) {
        setAiReportData(restored.aiReportData);
      }
      // 자식 컴포넌트들이 복원된 로컬스토리지 데이터를 즉시 읽어 마운트되도록 세션 키 갱신
      setGuestSessionKey(Date.now());
    } else {
      const saved = localStorage.getItem(`taxProgress_${effectiveId}`);
      setTaxProgress(saved ? parseInt(saved, 10) : 1);
      const savedMenus = localStorage.getItem(`completedMenus_${effectiveId}`);
      const menus = savedMenus ? new Set(JSON.parse(savedMenus)) : new Set();

      // 부양가족 실제 입력 여부와 completedMenus 동기화 (빈 '본인' 한 줄만 있으면 미완료)
      if (checkHasFamilyData()) {
        menus.add('family');
      } else {
        menus.delete('family');
      }

      // 근로소득원천징수영수증 업로드 여부와 completedMenus 동기화
      if (checkHasWithholdingData(effectiveId)) {
        menus.add('withholding');
      } else {
        menus.delete('withholding');
      }

      const rawLocalHometax = localStorage.getItem('hometax_extracted_data');
      let parsedLocalHometax = null;
      if (rawLocalHometax) {
        try { parsedLocalHometax = JSON.parse(rawLocalHometax); } catch (e) {}
      }
      const hasHometax = Boolean(parsedLocalHometax && (parsedLocalHometax.uploaded || parsedLocalHometax.fileName || (Array.isArray(parsedLocalHometax.persons) && parsedLocalHometax.persons.length > 0)));
      if (hasHometax) {
        menus.add('hometax');
      } else {
        menus.delete('hometax');
      }
      // 화면 상태도 현재 계정의 저장소 기준으로 맞춤 (이전 계정의 PDF 추출·AI 리포트가 남지 않도록)
      setHometaxExtractedData(parsedLocalHometax);
      if (!localStorage.getItem('selftax_ai_report_data')) setAiReportData(null);

      // 공제자료 입력 메뉴 동기화
      if (checkHasInputData(effectiveId)) {
        menus.add('input_data');
      } else {
        menus.delete('input_data');
      }

      setCompletedMenus(menus);
      setGuestSessionKey(Date.now());
    }
  }, [user?.id, authLoading]);

  // 로그인 및 게스트 사용자의 입력/업로드 데이터 실시간 세션 자동 백업
  const syncCurrentUserTaxData = (extra = {}) => {
    if (isLoggingOutRef.current) return;
    const effectiveId = user?.id || 'guest';
    saveUserData(effectiveId, {
      aiReportData: aiReportDataRef.current,
      hometaxExtractedData: hometaxDataRef.current,
      taxProgress,
      completedMenus,
      ...extra,
    });
  };

  // 화면 이동 또는 핵심 상태 변경 시 실시간 세션 동기화
  useEffect(() => {
    if (authLoading) return;
    if (isLoggingOutRef.current) return;
    syncCurrentUserTaxData();
  }, [user?.id, authLoading, currentScreen, hometaxExtractedData, aiReportData, taxProgress, completedMenus]);

  const markMenuComplete = (menuId) => {
    const effectiveId = user?.id || 'guest';
    setCompletedMenus((prev) => {
      const next = new Set(prev);
      next.add(menuId);
      localStorage.setItem(`completedMenus_${effectiveId}`, JSON.stringify([...next]));
      saveUserData(effectiveId, { completedMenus: next, taxProgress, hometaxExtractedData: hometaxDataRef.current, aiReportData: aiReportDataRef.current });
      return next;
    });
  };

  const unmarkMenuComplete = (menuId) => {
    const effectiveId = user?.id || 'guest';
    setCompletedMenus((prev) => {
      const next = new Set(prev);
      next.delete(menuId);
      localStorage.setItem(`completedMenus_${effectiveId}`, JSON.stringify([...next]));
      saveUserData(effectiveId, { completedMenus: next, taxProgress, hometaxExtractedData: hometaxDataRef.current, aiReportData: aiReportDataRef.current });
      return next;
    });
  };

  const updateTaxProgress = (level, force = false) => {
    const effectiveId = user?.id || 'guest';
    setTaxProgress((prev) => {
      let next;
      if (force) {
        next = level;
      } else if (level === 2) {
        // 자료 수정/삭제/추가 발생 시: 작성완료(3)나 확인완료(4) 상태였더라도 작성완료하기를 다시 누르기 전까지는 반드시 작성중(2)으로 복귀
        next = 2;
      } else {
        next = Math.max(prev, level);
      }
      localStorage.setItem(`taxProgress_${effectiveId}`, String(next));
      saveUserData(effectiveId, { taxProgress: next, completedMenus, hometaxExtractedData: hometaxDataRef.current, aiReportData: aiReportDataRef.current });
      return next;
    });
  };

  // 사용자가 로그인되면 자동으로 메인 대시보드로 이동
  useEffect(() => {
    if (user && currentScreen === 'intro') {
      setCurrentScreen('main');
    }
  }, [user]);

  // 화면 전환 시 브라우저 및 페이지 최상단으로 스크롤 이동
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [currentScreen]);



  // 전역 디자인 알림창 상태
  const [globalAlert, setGlobalAlert] = useState({
    isOpen: false,
    title: '알림',
    message: '',
  });

  // 브라우저 기본 시스템 alert 전역 가로채기
  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (msg) => {
      setGlobalAlert({
        isOpen: true,
        title: '알림',
        message: typeof msg === 'string' ? msg : String(msg),
      });
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // 홈화면으로 이동
  const goHome = () => setCurrentScreen('main');

  // 로그인 없이 데모 바로 둘러보기 클릭 시 실행:
  // - 기존에 작성 중이던 세션 자료가 있으면 100% 복원하여 기존 작성 내용이 보여지게 유지
  const handleStartGuestDemo = () => {
    const effectiveId = user?.id || 'guest';
    if (!user?.id) markGuestSessionActive();
    const restored = loadUserData(effectiveId);
    if (restored && restored.hasData) {
      setTaxProgress(restored.taxProgress || 1);
      const guestMenus = new Set(restored.completedMenus || []);
      if (checkHasFamilyData()) guestMenus.add('family'); else guestMenus.delete('family');
      setCompletedMenus(guestMenus);
      if (restored.hometaxData) setHometaxExtractedData(restored.hometaxData);
      if (restored.aiReportData) setAiReportData(restored.aiReportData);
    } else {
      setTaxProgress(1);
      setCompletedMenus(new Set());
      setHometaxExtractedData(null);
      setAiReportData(null);
    }
    setGuestSessionKey(Date.now());
    setCurrentScreen('main');
  };

  // 로그인(인트로) 화면으로 이동 시 실행:
  // - 기존에 작성 중이던 세션 자료를 영구 저장소에 보존하여 다시 들어왔을 때도 보여지게 유지
  const handleGoToIntro = () => {
    const effectiveId = user?.id || 'guest';
    saveUserData(effectiveId, {
      aiReportData: aiReportDataRef.current,
      hometaxExtractedData: hometaxDataRef.current,
      taxProgress,
      completedMenus,
    });
    setCurrentScreen('intro');
  };

  // 로그아웃 처리 후 인트로 화면으로 복귀
  const handleSignOut = async () => {
    isLoggingOutRef.current = true;
    const effectiveId = user?.id;
    // 1. 현재 로그인 사용자의 최신 상태(입력 자료, PDF 추출 자료 등)를 세션/영구 저장소에 최종 저장 확정
    if (effectiveId) {
      saveUserData(effectiveId, {
        aiReportData: aiReportDataRef.current,
        hometaxExtractedData: hometaxDataRef.current,
        taxProgress,
        completedMenus,
      });
    }
    // 2. 인증 로그아웃 완료
    await signOut();
    // 3. 로그아웃 완료 후 현재 활성 작업 공간만 초기화 (사용자별 영구 보존 데이터는 온전히 유지됨)
    clearActiveTaxData();
    setHometaxExtractedData(null);
    setAiReportData(null);
    setTaxProgress(1);
    setCompletedMenus(new Set());
    setGuestSessionKey(Date.now());
    setCurrentScreen('intro');
    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 300);
  };

  // 특정 스텝 키로 바로 이동 (상단 스텝 탭 클릭 등)
  const navigateToStep = (stepKey) => {
    setCurrentScreen(stepKey);
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EEF2FF] via-[#F5F3FF] to-[#EDE9FE] flex items-center justify-center p-0 sm:py-6 font-sans transition-all">
      {/* 
        태블릿/모바일 반응형 프레임 컨테이너 (Design.md 최신 규격 반영):
        - 인트로 화면(intro): PC 웹에서 로그인화면6.png 규격의 모던 와이드 스플릿 모달 (max-w-[1120px])
        - 내부 앱 화면: max-w-[768px] (태블릿/모바일 앱 사이즈), shadow-2xl, 중앙 정렬
      */}
      <div className={`w-full ${
        currentScreen === 'intro'
          ? 'sm:max-w-[1040px] xl:max-w-[1120px] min-h-screen sm:min-h-[720px] bg-white sm:rounded-[32px] shadow-2xl sm:ring-8 sm:ring-black/5'
          : 'sm:max-w-[680px] lg:max-w-[768px] min-h-screen sm:min-h-[860px] bg-[#F6F7FB] sm:rounded-[36px] shadow-2xl sm:ring-8 sm:ring-black/5'
      } overflow-hidden relative flex flex-col transition-all`}>

        {/* 상단 모바일/태블릿 상태바 (내부 앱 화면에서만 노출, 인트로 화면에서는 웹 모달 디자인 적용) */}
        {currentScreen !== 'intro' && (
          <div className="w-full pt-2.5 px-6 pb-1 bg-white/90 backdrop-blur-xs flex items-center justify-between text-xs font-semibold text-slate-800 select-none border-b border-slate-100">
            <span className="font-bold">15:42</span>
            {/* Dynamic Island 펀치홀 */}
            <div className="w-22 h-5 rounded-full bg-black flex items-center justify-between px-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#E5484D]" />
              <div className="w-2.5 h-2.5 rounded-full bg-black" />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <svg className="w-3.5 h-3.5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 18.25A9.956 9.956 0 0 1 2 12C2 6.48 6.48 2 12 2s10 4.48 10 10c0 2.32-.8 4.45-2.14 6.15l-.62-.62A8.96 8.96 0 0 0 21 12c0-4.97-4.03-9-9-9z" />
                <path d="M12 6a6 6 0 0 0-6 6c0 1.48.54 2.84 1.43 3.9l.71-.71A4.973 4.973 0 0 1 7 12c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.15-.39 2.22-1.05 3.07l.71.71A5.968 5.968 0 0 0 18 12a6 6 0 0 0-6-6z" />
              </svg>
              <span>5G</span>
              <div className="px-1 py-0.2 rounded-sm bg-slate-200 text-[10px] font-mono text-slate-800 font-bold">
                23
              </div>
            </div>
          </div>
        )}

        {/* 
          화면 라우팅
          '연말정산자료입력'에서 순차적으로 넘어오든, 아래 6개 메뉴에서 바로 들어오든
          동일한 단일 페이지 컴포넌트가 렌더링됩니다.
        */}
        <main className="flex-1 flex flex-col overflow-hidden" key={`${user?.id || 'guest'}_${guestSessionKey}`}>
          <Suspense fallback={<PageLoadingFallback />}>
            {/* 1. 메인 홈 화면 */}
          {currentScreen === 'main' && (
            <MainDashboard
              onNavigate={navigateToStep}
              onBackToIntro={handleGoToIntro}
              userProfile={profile}
              onSignOut={handleSignOut}
              taxProgress={taxProgress}
              onProgressChange={updateTaxProgress}
              completedMenus={completedMenus}
            />
          )}

          {/* 2. [Step 1] 부양가족 인적공제 검토 화면 */}
          {currentScreen === 'family' && (
            <FamilyPage
              onGoHome={goHome}
              onNext={() => { updateTaxProgress(2); markMenuComplete('family'); syncCurrentUserTaxData(); setCurrentScreen('withholding'); }}
              onPrev={goHome}
              onNavigateStep={navigateToStep}
              onDataChange={() => { updateTaxProgress(2); markMenuComplete('family'); syncCurrentUserTaxData(); }}
              userProfile={profile}
              onSignOut={handleSignOut}
              onLogin={handleGoToIntro}
            />
          )}

          {/* 3. [Step 2] 근로소득원천징수자료 및 종전근무지 안내 화면 */}
          {currentScreen === 'withholding' && (
            <WithholdingPage
              onGoHome={goHome}
              onNext={() => {
                if (checkHasWithholdingData(user?.id)) {
                  markMenuComplete('withholding');
                } else {
                  unmarkMenuComplete('withholding');
                }
                updateTaxProgress(2);
                syncCurrentUserTaxData();
                setCurrentScreen('hometax');
              }}
              onPrev={() => setCurrentScreen('family')}
              onGoPreviousJob={() => { syncCurrentUserTaxData(); setCurrentScreen('previous_job'); }}
              onNavigateStep={navigateToStep}
              onDataChange={(newData) => {
                if (newData && (newData.uploaded || Number(newData.totalSalary) > 0 || newData.fileName)) {
                  markMenuComplete('withholding');
                } else {
                  unmarkMenuComplete('withholding');
                }
                updateTaxProgress(2, true);
                syncCurrentUserTaxData({ selftax_withholding_data: newData });
              }}
              userProfile={profile}
              onSignOut={handleSignOut}
              onLogin={handleGoToIntro}
            />
          )}

          {/* 4. [Step 2-1] 종전근무지 소득 합산 및 원천징수영수증 화면 */}
          {currentScreen === 'previous_job' && (
            <PreviousJobPage
              onGoHome={goHome}
              onNext={() => { updateTaxProgress(2); syncCurrentUserTaxData(); setCurrentScreen('hometax'); }}
              onPrev={() => setCurrentScreen('withholding')}
              onNavigateStep={navigateToStep}
              onDataChange={(jobs) => {
                if (Array.isArray(jobs) && jobs.length > 0) {
                  markMenuComplete('previous_job');
                } else {
                  unmarkMenuComplete('previous_job');
                }
                updateTaxProgress(2, true);
                syncCurrentUserTaxData();
              }}
              userProfile={profile}
              onSignOut={handleSignOut}
              onLogin={handleGoToIntro}
            />
          )}

          {/* 5. [Step 3] 국세청 간소화 자료 등록 화면 (단독 연말정산간소화자료 화면) */}
          {currentScreen === 'hometax' && (
            <HometaxPage
              initialData={hometaxExtractedData}
              onGoHome={goHome}
              onNext={() => {
                if (hometaxExtractedData) {
                  markMenuComplete('hometax');
                  markMenuComplete('input_data');
                } else {
                  unmarkMenuComplete('hometax');
                  if (!checkHasInputData(user?.id)) {
                    unmarkMenuComplete('input_data');
                  }
                }
                updateTaxProgress(2);
                syncCurrentUserTaxData();
                setCurrentScreen('input_data');
              }}
              onGoInputData={() => { syncCurrentUserTaxData(); setCurrentScreen('input_data'); }}
              onPrev={() => setCurrentScreen('withholding')}
              onNavigateStep={navigateToStep}
              onDataChange={(newData) => {
                if (newData) {
                  markMenuComplete('hometax');
                  markMenuComplete('input_data');
                } else {
                  unmarkMenuComplete('hometax');
                  if (!checkHasInputData(user?.id)) {
                    unmarkMenuComplete('input_data');
                  }
                }
                updateTaxProgress(2, true);
                syncCurrentUserTaxData();
              }}
              onRemoveFile={() => {
                unmarkMenuComplete('hometax');
                if (!checkHasInputData(user?.id)) {
                  unmarkMenuComplete('input_data');
                }
                removeUserTaxDataKey(user?.id || 'guest', 'hometax_extracted_data');
                updateTaxProgress(2, true);
                syncCurrentUserTaxData({ hometaxExtractedData: null });
              }}
              onSaveData={(data) => {
                setHometaxExtractedData(data);
                if (data) {
                  markMenuComplete('hometax');
                  markMenuComplete('input_data');
                } else {
                  unmarkMenuComplete('hometax');
                  if (!checkHasInputData(user?.id)) {
                    unmarkMenuComplete('input_data');
                  }
                  removeUserTaxDataKey(user?.id || 'guest', 'hometax_extracted_data');
                }
                updateTaxProgress(2, true);
                if (user?.id) {
                  saveUserData(user.id, { hometaxExtractedData: data });
                }
              }}
              userProfile={profile}
              onSignOut={handleSignOut}
              onLogin={handleGoToIntro}
            />
          )}

          {/* 6. [Step 4] 추가 수기 영수증 입력 화면 (공제자료 입력) */}
          {currentScreen === 'input_data' && (
            <DataInputPage
              onGoHome={goHome}
              onNext={() => {
                updateTaxProgress(3, true);
                markMenuComplete('input_data');
                syncCurrentUserTaxData();
                setCurrentScreen('tax_result');
              }}
              onPrev={() => setCurrentScreen('hometax')}
              onNavigateStep={navigateToStep}
              onDataChange={(hasAnyItems) => {
                updateTaxProgress(2, true);
                const hasData = hasAnyItems !== undefined ? Boolean(hasAnyItems) : checkHasInputData(user?.id);
                if (hasData) {
                  markMenuComplete('input_data');
                } else {
                  unmarkMenuComplete('input_data');
                }
                syncCurrentUserTaxData();
              }}
              hometaxData={hometaxExtractedData}
              userProfile={profile}
              onSignOut={handleSignOut}
              onLogin={handleGoToIntro}
            />
          )}

          {/* 7. [Step 5] 연말정산 결과조회 화면 */}
          {currentScreen === 'tax_result' && (
            <TaxResultPage
              taxYear="2025"
              userName={loggedInWorkerName}
              onGoHome={goHome}
              onPrev={() => setCurrentScreen('input_data')}
              onGoAiReport={(data) => {
                setAiReportData(data);
                window.scrollTo({ top: 0, behavior: 'instant' });
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                setCurrentScreen('ai_report');
              }}
              onNavigateStep={navigateToStep}
              userProfile={profile}
              onSignOut={handleSignOut}
              onLogin={handleGoToIntro}
            />
          )}

          {/* 8. AI 연말정산 결과 리포트 화면 */}
          {currentScreen === 'ai_report' && (
            <AiReportPage
              taxYear="2025"
              taxData={aiReportData}
              userName={aiReportData?.userName || loggedInWorkerName}
              onGoBack={() => setCurrentScreen('tax_result')}
              onGoHome={goHome}
              onConfirmReport={() => updateTaxProgress(4, true)}
            />
          )}

          {/* 9. 연도별 현황 상세 화면 */}
          {currentScreen === 'history' && (
            <TaxHistoryPage
              onGoHome={goHome}
              onPrev={goHome}
              onNavigateStep={navigateToStep}
              userName={profile?.name || user?.user_metadata?.full_name || '근로자'}
            />
          )}

          {/* 9. 인트로 화면 */}
          {currentScreen === 'intro' && (
            <IntroScreen
              onGetStarted={handleStartGuestDemo}
            />
          )}

          {/* 10. 연말정산 공제항목별 구비서류 총람 화면 */}
          {currentScreen === 'required_docs' && (
            <RequiredDocsPage
              onGoHome={goHome}
              onPrev={goHome}
            />
          )}

          {/* 11. 연말정산 핵심 절세 꿀팁 총람 화면 */}
          {currentScreen === 'tax_tips' && (
            <TaxTipsPage
              onGoHome={goHome}
              onPrev={goHome}
              onNavigate={navigateToStep}
            />
          )}

          {/* 12. 연말정산 이용가이드 상세 화면 */}
          {currentScreen === 'user_guide' && (
            <UserGuidePage
              onGoHome={goHome}
              onPrev={goHome}
              onNavigate={navigateToStep}
            />
          )}

          {/* 13. 정산봄 회사소개 상세 화면 (회사소개, 연락처, 주소, 지도) */}
          {currentScreen === 'company' && (
            <CompanyPage
              onGoHome={goHome}
              onPrev={goHome}
            />
          )}
          </Suspense>
        </main>

        {/* 하단 홈 인디케이터 바 */}
        <div className="w-full py-2 flex justify-center bg-white/70 border-t border-slate-100">
          <button
            onClick={goHome}
            title="홈으로 이동"
            className="w-32 h-1 bg-slate-900/30 hover:bg-blue-600 rounded-full transition-colors cursor-pointer"
          />
        </div>
      </div>

      {/* 전역 디자인 알림창 (시스템 alert 완벽 대체) */}
      <DesignAlertModal
        isOpen={globalAlert.isOpen}
        title={globalAlert.title}
        message={globalAlert.message}
        onClose={() => setGlobalAlert((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* 전역 집중 배경음악(BGM) 컨트롤러 */}
      <BgmPlayer />
    </div>
  );
}
