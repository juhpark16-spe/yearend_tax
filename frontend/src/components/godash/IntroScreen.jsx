import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { saveUserData, clearActiveTaxData } from '../../utils/userTaxStorage';

/**
 * 정산봄(JeongsanBom) - AI 연말정산 사전점검 인트로 화면
 * 
 * 디자인 및 구성 (사용자 요청 100% 반영):
 * 1. [로그인화면6.png] 참고:
 *    - 좌우 분할 스플릿 레이아웃 (좌측: 깔끔한 로그인/인증 카드, 우측: 입체적인 AI 사전점검 쇼케이스)
 *    - 브랜드 로고, 아이콘 뱃지, 이메일/비밀번호 입력폼, 기억하기 체크박스, 비밀번호 찾기
 *    - 메인 CTA 버튼('로그인하고 미리봄 →'), 구분선('or continue with'), Google 로그인 버튼
 *    - 하단 계정 생성 안내 링크
 * 2. [AI chatbot.png] 참고:
 *    - 부드러운 라벤더/페리윙클/소프트 바이올렛 및 로열 인디고(#5B5DF0, #4F46E5, #6366F1) 컬러 팔레트
 *    - 둥근 캡슐형 칩(#Finance, #Payment 스타일의 공제 칩)과 플로팅 AI 챗봇 어시스턴트 카드
 *    - 은은하고 몽환적인 코스믹 파스텔 그라데이션과 글래스모피즘
 * 3. 정산봄의 핵심 의미:
 *    - "내 연말정산을 미리봄 -> 정산봄" 슬로건 전면 배치
 */
export default function IntroScreen({ onGetStarted }) {
  const { user, profile, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState(0); // 0: 미리봄, 1: 공제진단, 2: 절세가이드
  const [modalType, setModalType] = useState(null); // 'forgot' | 'signup' | null

  // 회원가입 폼 상태
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [signupError, setSignupError] = useState(null);
  const [signupSuccess, setSignupSuccess] = useState(null);
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false);

  // 비밀번호 표시/숨김
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [showSignupPwConfirm, setShowSignupPwConfirm] = useState(false);

  // 모달 초기화 헬퍼
  const resetSignupForm = () => {
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupPasswordConfirm('');
    setSignupError(null);
    setSignupSuccess(null);
    setIsSignupSubmitting(false);
  };

  const openModal = (type) => {
    resetSignupForm();
    setModalType(type);
  };

  // Google OAuth 로그인
  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      setAuthError(null);
      await signInWithGoogle();
    } catch (err) {
      console.error('Google 로그인 실패:', err);
      setAuthError('Google 로그인에 실패했습니다. 다시 시도해 주세요.');
      setIsSubmitting(false);
    }
  };

  // 이메일/비밀번호 로그인
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }
    try {
      setIsSubmitting(true);
      setAuthError(null);
      await signInWithEmail(email, password);
    } catch (err) {
      console.error('이메일 로그인 실패:', err);
      const msg = err?.message || '';
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        setAuthError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (msg.includes('Email not confirmed')) {
        setAuthError('이메일 인증이 필요합니다. 받은 편지함을 확인해 주세요.');
      } else {
        setAuthError('로그인에 실패했습니다. 다시 시도해 주세요.');
      }
      setIsSubmitting(false);
    }
  };

  // 이메일/비밀번호 회원가입
  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setSignupError(null);
    if (!signupName.trim()) {
      setSignupError('이름을 입력해 주세요.');
      return;
    }
    if (!signupEmail.includes('@')) {
      setSignupError('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (signupPassword !== signupPasswordConfirm) {
      setSignupError('비밀번호가 일치하지 않습니다.');
      return;
    }
    try {
      setIsSignupSubmitting(true);
      const res = await signUpWithEmail(signupEmail, signupPassword, signupName.trim());
      if (res?.needsConfirmation) {
        setSignupSuccess(`✅ ${signupEmail}로 인증 메일을 발송했습니다. 받은 편지함을 확인 후 로그인해 주세요.`);
      } else if (res?.isDemo || res?.success) {
        setSignupSuccess(null);
        setModalType(null);
      }
    } catch (err) {
      console.error('회원가입 실패:', err);
      const msg = err?.message || '';
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        setSignupError('이미 가입된 이메일입니다. 로그인을 시도해 주세요.');
      } else if (msg.includes('Password should be at least')) {
        setSignupError('비밀번호는 8자 이상이어야 합니다.');
      } else {
        setSignupError('회원가입에 실패했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setIsSignupSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen lg:min-h-[720px] bg-white flex flex-col lg:flex-row relative select-none font-sans overflow-hidden">
      {/* ========================================================================= */}
      {/* LEFT PANEL: 로그인 & 정산봄 시작하기 (로그인화면6.png 좌측 규격 완벽 일치)         */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-1/2 xl:w-5/12 p-6 sm:p-10 lg:p-11 xl:p-13 flex flex-col justify-between bg-white relative z-10">
        {/* 1. 상단 브랜드 로고 */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-2.5">
            {/* 둥근사각형 파랑-보라 그라데이션 로고 배지 */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4F46E5] via-[#6366F1] to-[#7C3AED] flex items-center justify-center shadow-md shadow-indigo-500/25">
              <span className="text-base select-none">🌸</span>
            </div>
            <span className="text-2xl font-black text-slate-900 tracking-tight">정산봄</span>
          </div>

          <span className="hidden sm:inline-block text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
            AI사전점검으로 누락 없는 연말정산
          </span>
        </div>

        {/* 2. 중앙 콘텐츠 영역: 로그인 상태 / 비로그인 상태 분기 */}
        <div className="w-full max-w-sm mx-auto my-auto py-1">

          {/* ── 로그인된 상태: 웰컴 카드 ── */}
          {user ? (
            <div className="space-y-5">
              {/* 웰컴 배지 */}
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-indigo-200 shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] flex items-center justify-center text-white text-lg font-black shadow-sm">
                    {(profile?.name || '근로자').charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-semibold text-emerald-600">로그인됨</span>
                  </div>
                  <p className="font-black text-slate-900 text-base leading-tight truncate">{profile?.name || '근로자'} 님</p>
                  <p className="text-[11px] text-slate-400 font-medium truncate">{profile?.email || ''}</p>
                </div>
              </div>

              {/* 타이틀 */}
              <div>
                <h1 className="text-2xl sm:text-[25px] font-black text-slate-900 tracking-tight leading-snug">
                  내 연말정산 <span className="text-[#4F46E5]">미리봄</span>
                </h1>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  국세청 제출 전, AI로 숨은 공제와 예상 환급액을 미리 점검하세요.
                </p>
              </div>

              {/* 연말정산 하러가기 버튼 */}
              <button
                type="button"
                onClick={onGetStarted}
                className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] hover:from-indigo-600 hover:to-violet-700 active:scale-[0.99] text-white font-black text-base shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <span>🌸</span>
                <span>연말정산 하러가기</span>
                <span className="text-indigo-200 font-normal">→</span>
              </button>

              {/* 빠른 통계 */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-base">📋</div>
                  <div className="text-[10px] font-bold text-slate-700 mt-0.5">소득공제</div>
                  <div className="text-[10px] text-slate-400">자동 분석</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-base">💰</div>
                  <div className="text-[10px] font-bold text-slate-700 mt-0.5">환급 예측</div>
                  <div className="text-[10px] text-slate-400">AI 계산</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-base">🎯</div>
                  <div className="text-[10px] font-bold text-slate-700 mt-0.5">절세 가이드</div>
                  <div className="text-[10px] text-slate-400">맞춤 제안</div>
                </div>
              </div>

              {/* 로그아웃 */}
              <button
                type="button"
                onClick={async () => {
                  // 로그아웃 전 작성 내용을 계정별 저장소에 보존 후 활성 데이터 정리
                  if (user?.id) {
                    saveUserData(user.id);
                  }
                  await signOut();
                  clearActiveTaxData();
                }}
                className="w-full py-2 rounded-xl text-slate-400 hover:text-slate-600 text-xs font-medium transition cursor-pointer hover:bg-slate-50"
              >
                로그아웃
              </button>
            </div>
          ) : (
            /* ── 비로그인 상태: 로그인 폼 ── */
            <>
              {/* 메인 타이틀 */}
              <h1 className="text-2xl sm:text-[25px] font-black text-slate-900 tracking-tight leading-snug">
                내 연말정산 <span className="text-[#4F46E5]">미리봄</span>
              </h1>
              <p className="text-xs sm:text-[12.5px] text-slate-500 font-medium mt-1 leading-relaxed">
                국세청 제출 전, AI로 숨은 공제와 예상 환급액을 미리 점검하세요.
              </p>

          {/* 에러 메시지 알림 */}
          {authError && (
            <div className="mt-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {authError}
            </div>
          )}

          {/* 로그인 입력 폼 */}
          <form onSubmit={handleEmailSubmit} className="mt-5 space-y-3.5">
            {/* 이메일 입력 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                이메일
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jayson_marhiela@gmail.com"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition shadow-2xs"
                />
              </div>
            </div>

            {/* 비밀번호 입력 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-4 py-2.5 pr-16 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition shadow-2xs tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs font-medium"
                >
                  {showPassword ? '숨김' : '표시'}
                </button>
              </div>
            </div>

            {/* 옵션 행: Remember me & Forgot password */}
            <div className="flex items-center justify-between pt-0.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 font-medium">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 accent-indigo-600 cursor-pointer"
                />
                <span>로그인 상태 유지</span>
              </label>
              <button
                type="button"
                onClick={() => openModal('forgot')}
                className="text-slate-500 hover:text-indigo-600 font-semibold transition cursor-pointer"
              >
                비밀번호 찾기
              </button>
            </div>

            {/* 메인 로그인 CTA 버튼 (로그인화면6.png 다크 버튼 스타일) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
            >
              <span>로그인하고 미리봄</span>
              <span className="text-slate-400 font-normal">→</span>
            </button>
          </form>

          {/* 구분선 (or continue with) */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-slate-400 font-medium">or continue with</span>
            </div>
          </div>

          {/* 소셜 및 간편 로그인 버튼들 */}
          <div className="space-y-2">
            {/* Google로 시작하기 (공식 4색 SVG) */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-[0.99] border border-slate-200/90 text-slate-800 font-bold text-xs sm:text-sm shadow-2xs hover:shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer group disabled:opacity-70"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google</span>
            </button>

            {/* 원클릭 게스트 빠른 체험 버튼 */}
            <button
              type="button"
              onClick={onGetStarted}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-50/70 hover:bg-indigo-100/80 active:scale-[0.99] border border-indigo-100 text-indigo-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>🚀 로그인 없이 데모 바로 둘러보기</span>
            </button>
          </div>

              {/* 하단 계정 생성 안내 */}
              <div className="pt-4 text-center text-xs text-slate-500 font-medium">
                <span>아직 정산봄 계정이 없으신가요? </span>
                <button
                  type="button"
                  onClick={() => openModal('signup')}
                  className="text-slate-900 hover:text-indigo-600 font-bold cursor-pointer transition inline-flex items-center gap-0.5"
                >
                  <span>무료 회원가입</span>
                  <span className="text-[10px]">›</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT PANEL: 히어로 & AI 사전점검 쇼케이스 (AI chatbot.png 색감 + 로그인화면6 레이아웃) */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-1/2 xl:w-7/12 p-6 sm:p-10 lg:p-11 xl:p-13 bg-gradient-to-br from-[#4338CA] via-[#4F46E5] to-[#7C3AED] relative overflow-hidden flex flex-col justify-between text-white">
        {/* 배경 은은한 코스믹 글로우 오버레이 (AI chatbot.png 감성) */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#A78BFA]/25 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#60A5FA]/25 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-[#C084FC]/20 blur-2xl pointer-events-none" />

        {/* 미세 별빛/스파클 장식 */}
        <div className="absolute top-10 right-16 text-white/30 text-xs pointer-events-none select-none">✦</div>
        <div className="absolute top-48 left-12 text-white/20 text-sm pointer-events-none select-none">✧</div>
        <div className="absolute bottom-20 right-32 text-white/30 text-base pointer-events-none select-none">✦</div>

        {/* 1. 상단 히어로 헤더 & 설명 (로그인화면6.png 우측 타이포그래피 구조) */}
        <div className="relative z-10 max-w-lg mb-6">
          {/* AI 뱃지 */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold text-white mb-3.5 shadow-sm">
            <span className="text-yellow-300">✨</span>
            <span>13월의 월급을 확실하게 지키는 스마트 세무 AI</span>
          </div>

          {/* 메인 슬로건: 내 연말정산을 미리봄 */}
          <h2 className="text-2xl sm:text-3xl lg:text-[33px] font-black tracking-tight leading-snug sm:leading-tight">
            내 연말정산을 미리봄
          </h2>
          <p className="text-xs sm:text-sm text-indigo-100 font-normal mt-2 leading-relaxed max-w-md">
            회사에 최종 제출하기 전, 놓치기 쉬운 15가지 소득·세액공제와 환급 예상액을
            AI 사전점검으로 시뮬레이션하세요.
          </p>

          {/* 캐러셀 인디케이터 바 (로그인화면6.png 점 3개 규격) */}
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab(0)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === 0 ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'
              }`}
              title="01. 미리봄"
            />
            <button
              type="button"
              onClick={() => setActiveTab(1)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === 1 ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'
              }`}
              title="02. 공제진단"
            />
            <button
              type="button"
              onClick={() => setActiveTab(2)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === 2 ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'
              }`}
              title="03. 절세가이드"
            />
          </div>
        </div>

        {/* 2. 입체형 실시간 UI 쇼케이스 (로그인화면6 대시보드 + AI chatbot 플로팅 챗봇) */}
        <div className="relative z-10 w-full my-auto pb-4 pt-1">
          {/* 메인 사전점검 리포트 카드 (로그인화면6의 틸티드 대시보드 카드 규격) */}
          <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-slate-800 shadow-2xl border border-white/60 transition-transform duration-300">
            {/* 리포트 카드 헤더 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  🌸
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-black text-slate-900 leading-none">
                    {activeTab === 0 && '2025 귀속 연말정산 사전점검 리포트'}
                    {activeTab === 1 && '15대 주요 소득·세액공제 정밀 진단'}
                    {activeTab === 2 && 'AI 맞춤형 절세 최적화 솔루션'}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">홍길동 님 맞춤 시뮬레이션</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                분석완료
              </span>
            </div>

            {/* 탭 0: 미리봄 핵심 결과 */}
            {activeTab === 0 && (
              <>
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-purple-50/50 border border-indigo-100/80 flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[11px] font-bold text-indigo-700 block">
                      예상 차감징수세액 (13월의 월급)
                    </span>
                    <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight mt-0.5">
                      <span className="text-emerald-600">+842,500</span> 원
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-emerald-500 text-white text-xs font-black shadow-xs">
                    환급 대상 🟢
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-medium">총급여액</span>
                    <span className="font-bold text-slate-800 text-[11px] sm:text-xs font-mono">54,000,000원</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-medium">결정세액</span>
                    <span className="font-bold text-slate-800 text-[11px] sm:text-xs font-mono">1,280,000원</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-medium">기납부세액</span>
                    <span className="font-bold text-indigo-600 text-[11px] sm:text-xs font-mono">2,122,500원</span>
                  </div>
                </div>
              </>
            )}

            {/* 탭 1: 공제진단 현황 */}
            {activeTab === 1 && (
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <span className="font-bold text-slate-800">부양가족 인적공제 (3명)</span>
                  <span className="font-bold text-emerald-600 font-mono">4,500,000원 공제 ✓</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <span className="font-bold text-slate-800">신용카드·체크카드 황금비율</span>
                  <span className="font-bold text-indigo-600 font-mono">92% 최적화 달성</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs">
                  <span className="font-bold text-amber-900">월세액 세액공제 (미반영 감지)</span>
                  <span className="font-bold text-amber-700 font-mono">+127,500원 환급 가능 ⚠️</span>
                </div>
              </div>
            )}

            {/* 탭 2: 절세가이드 */}
            {activeTab === 2 && (
              <div className="space-y-2 mb-3">
                <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs">
                  <div className="font-bold text-indigo-950">연금저축/IRP 한도 추가 납입 가이드</div>
                  <p className="text-[11px] text-indigo-700 mt-0.5">올해 120만원 추가 납입 시 198,000원 세액공제 혜택</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <div className="font-bold text-slate-800">맞벌이 부부 의료비 몰아주기 분석</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">총급여가 낮은 배우자에게 몰아줄 때 환급액 극대화</p>
                </div>
              </div>
            )}

            {/* 놓친 공제 발견 안내 바 */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-900 text-[11px] font-semibold">
              <span className="shrink-0">💡</span>
              <span className="truncate">
                놓치기 쉬운 3건의 추가 공제 기회 발견 (월세액, 교육비, 카드비율)
              </span>
            </div>
          </div>

          {/* 플로팅 AI 챗봇 대화 위젯 (AI chatbot.png의 대화창 완벽 재현!) */}
          <div className="mt-3 sm:mt-0 sm:absolute sm:-bottom-4 sm:-right-2 w-full sm:w-[310px] bg-white rounded-2xl p-3.5 shadow-2xl border border-indigo-100/90 text-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* 챗봇 헤더 */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#6366F1] to-[#A855F7] text-white flex items-center justify-center text-[10px] shadow-xs">
                  🌸
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900">정산봄 AI 봄이</span>
                  <span className="text-[10px] text-slate-400 ml-1.5">세무 어시스턴트</span>
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="실시간 대기 중" />
            </div>

            {/* 말풍선 대화 (AI chatbot.png의 보라/인디고 말풍선 컬러 매칭) */}
            <div className="space-y-1.5 text-[11px] leading-relaxed">
              {/* AI 어시스턴트 메시지 */}
              <div className="p-2 rounded-xl rounded-tl-xs bg-indigo-50/80 text-indigo-950 border border-indigo-100/60 font-medium">
                홍길동님, 작년에 빠뜨리신 <span className="font-bold text-[#4F46E5]">월세액 75만원</span>을 이번에 등록하면 <span className="font-bold text-emerald-600">127,500원</span>이 더 환급돼요!
              </div>

              {/* 사용자 답변 메시지 (AI chatbot.png의 로열 인디고 말풍선 #5B5DF0) */}
              <div className="p-2 rounded-xl rounded-tr-xs bg-[#5B5DF0] text-white font-medium ml-auto max-w-[85%] text-right shadow-xs">
                진짜요? 지금 바로 반영해 줘! ✨
              </div>
            </div>

            {/* AI chatbot.png 스타일의 캡슐형 퀵 버튼들 */}
            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100 overflow-x-auto text-[9.5px] font-bold text-indigo-700">
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 shrink-0">
                🏠 월세공제
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 shrink-0">
                💳 카드비율
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 shrink-0">
                🎓 교육비
              </span>
            </div>

            {/* AI 입력창 흉내 (AI chatbot.png 하단 필드) */}
            <div className="mt-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-between text-[9.5px] text-slate-400">
              <span>+ 궁금한 세무 질문을 입력하세요...</span>
              <span>🎙️</span>
            </div>
          </div>
        </div>

        {/* 우측 하단 회사정보 */}
        <div className="relative z-10 pt-4 border-t border-white/20">
          {/* 사업자 정보 라인들 */}
          <div className="space-y-0.5 text-[11px] text-white/75 font-medium leading-relaxed">
            <p>• 상호명: (주)정산봄 &nbsp;|&nbsp; 대표이사: 최봄</p>
            <p>• 사업자등록번호: 214-88-20250 &nbsp;|&nbsp; 통신판매업신고: 제2025-서울강남-0125호</p>
            <p>• 개인정보보호책임자: 김세무 (privacy@jeongsanbom.com)</p>
          </div>

          {/* 저작권 */}
          <p className="text-[11px] text-white/55 font-medium mt-2">
            © 2025 JeongSanBom Co., Ltd. All rights reserved.
          </p>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 안내 모달 (비밀번호 찾기 / 회원가입)                                       */}
      {/* ========================================================================= */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            {/* 모달 헤더 */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6366F1] to-[#C084FC] flex items-center justify-center text-sm shadow-sm">
                    🌸
                  </div>
                  <span className="font-black text-slate-900 text-base">
                    {modalType === 'forgot' ? '비밀번호 재설정' : '이메일로 회원가입'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-xs cursor-pointer transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 비밀번호 찾기 */}
            {modalType === 'forgot' && (
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  가입하신 이메일 주소로 비밀번호 재설정 링크를 발송해 드립니다.<br />
                  또는 <b>Google 계정으로 로그인</b>하시면 비밀번호 없이 즉시 이용하실 수 있습니다.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">이메일</label>
                  <input
                    type="email"
                    placeholder="가입한 이메일 입력"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition"
                  />
                </div>
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition cursor-pointer"
                  onClick={() => setModalType(null)}
                >
                  재설정 메일 보내기
                </button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center text-xs"><span className="px-3 bg-white text-slate-400 font-medium">또는</span></div>
                </div>
                <button
                  type="button"
                  onClick={() => { setModalType(null); handleGoogleLogin(); }}
                  className="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 font-bold text-sm transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Google 계정으로 로그인
                </button>
              </div>
            )}

            {/* 이메일 회원가입 */}
            {modalType === 'signup' && (
              <div className="px-6 py-5">
                {/* 성공 메시지 */}
                {signupSuccess ? (
                  <div className="text-center space-y-4 py-4">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-2xl mx-auto">✅</div>
                    <p className="text-sm font-semibold text-slate-800 leading-relaxed">{signupSuccess}</p>
                    <button
                      type="button"
                      onClick={() => setModalType(null)}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition cursor-pointer"
                    >
                      확인
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSignupSubmit} className="space-y-3">
                    <p className="text-xs text-slate-500 pb-1">이메일과 비밀번호로 정산봄 계정을 만들어보세요.</p>

                    {/* 에러 메시지 */}
                    {signupError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                        {signupError}
                      </div>
                    )}

                    {/* 이름 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">이름 <span className="text-rose-400">*</span></label>
                      <input
                        type="text"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        placeholder="홍길동"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition"
                      />
                    </div>

                    {/* 이메일 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">이메일 <span className="text-rose-400">*</span></label>
                      <input
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        placeholder="example@email.com"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition"
                      />
                    </div>

                    {/* 비밀번호 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">비밀번호 <span className="text-rose-400">*</span></label>
                      <div className="relative">
                        <input
                          type={showSignupPw ? 'text' : 'password'}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="8자 이상 입력"
                          required
                          minLength={8}
                          className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition tracking-wider"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPw(!showSignupPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                        >
                          {showSignupPw ? '숨김' : '표시'}
                        </button>
                      </div>
                      {signupPassword && (
                        <div className="mt-1.5 flex gap-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                              signupPassword.length >= (i + 1) * 2
                                ? i < 1 ? 'bg-rose-400'
                                : i < 2 ? 'bg-orange-400'
                                : i < 3 ? 'bg-yellow-400'
                                : 'bg-emerald-400'
                                : 'bg-slate-200'
                            }`} />
                          ))}
                          <span className="text-[10px] text-slate-400 ml-1">
                            {signupPassword.length < 4 ? '매우 약함' : signupPassword.length < 6 ? '약함' : signupPassword.length < 8 ? '보통' : '강함'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 비밀번호 확인 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">비밀번호 확인 <span className="text-rose-400">*</span></label>
                      <div className="relative">
                        <input
                          type={showSignupPwConfirm ? 'text' : 'password'}
                          value={signupPasswordConfirm}
                          onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                          placeholder="비밀번호 재입력"
                          required
                          className={`w-full px-4 py-2.5 pr-10 rounded-xl border text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 transition tracking-wider ${
                            signupPasswordConfirm && signupPassword !== signupPasswordConfirm
                              ? 'border-rose-300 bg-rose-50 focus:ring-rose-400 focus:border-rose-400'
                              : signupPasswordConfirm && signupPassword === signupPasswordConfirm
                              ? 'border-emerald-300 bg-emerald-50 focus:ring-emerald-400 focus:border-emerald-400'
                              : 'border-slate-200 bg-white focus:ring-indigo-400 focus:border-indigo-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPwConfirm(!showSignupPwConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                        >
                          {showSignupPwConfirm ? '숨김' : '표시'}
                        </button>
                        {signupPasswordConfirm && (
                          <span className={`absolute right-10 top-1/2 -translate-y-1/2 text-xs ${
                            signupPassword === signupPasswordConfirm ? 'text-emerald-500' : 'text-rose-400'
                          }`}>
                            {signupPassword === signupPasswordConfirm ? '✓' : '✗'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 회원가입 버튼 */}
                    <button
                      type="submit"
                      disabled={isSignupSubmitting}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] hover:from-indigo-600 hover:to-violet-700 active:scale-[0.99] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-1"
                    >
                      {isSignupSubmitting ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />처리 중...</>
                      ) : (
                        <><span>🌸</span><span>정산봄 계정 만들기</span></>
                      )}
                    </button>

                    {/* 구분선 */}
                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                      <div className="relative flex justify-center text-xs"><span className="px-3 bg-white text-slate-400 font-medium">또는 소셜 계정으로</span></div>
                    </div>

                    {/* Google 회원가입 */}
                    <button
                      type="button"
                      onClick={() => { setModalType(null); handleGoogleLogin(); }}
                      className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      Google 계정으로 가입하기
                    </button>

                    <p className="text-center text-[11px] text-slate-400 pt-1">
                      이미 계정이 있으신가요?{' '}
                      <button type="button" onClick={() => setModalType(null)} className="text-indigo-600 font-bold hover:underline cursor-pointer">로그인</button>
                    </p>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
