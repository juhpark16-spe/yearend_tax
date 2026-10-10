'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * 정산봄(JeongsanBom) - Next.js AI 연말정산 사전점검 인트로 랜딩/로그인 화면
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
export default function LandingIntro({ onExploreDemo }) {
  const { signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('user@jeongsanbom.com');
  const [password, setPassword] = useState('••••••••••••');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [modalType, setModalType] = useState(null); // 'forgot' | 'signup' | null

  // Google OAuth 로그인
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      await signInWithGoogle();
    } catch (err) {
      console.error('Google 로그인 에러:', err);
      setErrorMsg('Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      setLoading(false);
    }
  };

  // 일반 이메일/비밀번호 폼 제출 (데모 진입)
  const handleEmailSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (onExploreDemo) {
        onExploreDemo();
      }
    }, 350);
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-[#EEF2FF] via-[#F3F4F6] to-[#E0E7FF] flex items-center justify-center p-0 sm:p-6 lg:p-10 font-sans selection:bg-indigo-500 selection:text-white">
      {/* 중앙 모던 스플릿 컨테이너 (로그인화면6.png 규격) */}
      <div className="w-full max-w-6xl min-h-screen sm:min-h-[720px] bg-white sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col lg:flex-row relative">
        
        {/* ========================================================================= */}
        {/* LEFT PANEL: 로그인 & 정산봄 시작하기                                         */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-1/2 xl:w-5/12 p-6 sm:p-10 lg:p-11 xl:p-13 flex flex-col justify-between bg-white relative z-10">
          {/* 1. 상단 브랜드 텍스트 로고 */}
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-2.5">
              <span className="text-xl select-none">🌸</span>
              <span className="text-2xl font-black text-slate-900 tracking-tight">정산봄</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-600 border border-indigo-100">
                AI 사전점검
              </span>
            </div>

            <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
              2025 귀속 연말정산
            </span>
          </div>

          {/* 2. 중앙 인증 폼 컨테이너 */}
          <div className="w-full max-w-sm mx-auto my-auto py-1">
            {/* 브랜드 심볼 아이콘 뱃지 */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6366F1] via-[#818CF8] to-[#C084FC] flex items-center justify-center text-white text-xl shadow-lg shadow-indigo-500/20 ring-4 ring-indigo-50 mb-4">
              <span>🌸</span>
            </div>

            {/* 메인 타이틀 & 정산봄 의미 안내 */}
            <h1 className="text-2xl sm:text-[25px] font-black text-slate-900 tracking-tight leading-snug">
              내 연말정산 <span className="text-[#4F46E5]">미리봄</span>
            </h1>
            <p className="text-xs sm:text-[12.5px] text-slate-500 font-medium mt-1 leading-relaxed">
              <span className="font-bold text-slate-700">정산봄</span>은 <span className="text-indigo-600 font-bold">'내 연말정산을 미리봄'</span>의 의미입니다.<br />
              국세청 제출 전, AI로 숨은 공제와 예상 환급액을 미리 점검하세요.
            </p>

            {/* 에러 메시지 알림 */}
            {errorMsg && (
              <div className="mt-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {errorMsg}
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
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500 transition shadow-2xs tracking-widest"
                  />
                </div>
              </div>

              {/* 옵션 행 */}
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
                  onClick={() => setModalType('forgot')}
                  className="text-slate-500 hover:text-indigo-600 font-semibold transition cursor-pointer"
                >
                  비밀번호 찾기
                </button>
              </div>

              {/* 메인 로그인 CTA 버튼 */}
              <button
                type="submit"
                disabled={loading}
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
              {/* Google로 시작하기 */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
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

              {/* 데모 바로 체험 버튼 */}
              <button
                type="button"
                onClick={onExploreDemo}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-50/70 hover:bg-indigo-100/80 active:scale-[0.99] border border-indigo-100 text-indigo-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🚀 로그인 없이 데모 바로 둘러보기</span>
              </button>
            </div>
          </div>

          {/* 3. 하단 계정 생성 안내 푸터 */}
          <div className="pt-4 text-center text-xs text-slate-500 font-medium">
            <span>아직 정산봄 계정이 없으신가요? </span>
            <button
              type="button"
              onClick={() => setModalType('signup')}
              className="text-slate-900 hover:text-indigo-600 font-bold cursor-pointer transition inline-flex items-center gap-0.5"
            >
              <span>무료 회원가입</span>
              <span className="text-[10px]">›</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: 히어로 & AI 사전점검 쇼케이스 (AI chatbot.png 색감 매칭)          */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-1/2 xl:w-7/12 p-6 sm:p-10 lg:p-11 xl:p-13 bg-gradient-to-br from-[#4338CA] via-[#4F46E5] to-[#7C3AED] relative overflow-hidden flex flex-col justify-between text-white">
          {/* 배경 코스믹 글로우 오버레이 */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#A78BFA]/25 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#60A5FA]/25 blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-[#C084FC]/20 blur-2xl pointer-events-none" />

          {/* 별빛 스파클 */}
          <div className="absolute top-10 right-16 text-white/30 text-xs pointer-events-none select-none">✦</div>
          <div className="absolute top-48 left-12 text-white/20 text-sm pointer-events-none select-none">✧</div>
          <div className="absolute bottom-20 right-32 text-white/30 text-base pointer-events-none select-none">✦</div>

          {/* 1. 상단 히어로 헤더 & 설명 */}
          <div className="relative z-10 max-w-lg mb-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold text-white mb-3.5 shadow-sm">
              <span className="text-yellow-300">✨</span>
              <span>13월의 월급을 확실하게 지키는 스마트 세무 AI</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-[33px] font-black tracking-tight leading-snug sm:leading-tight">
              내 연말정산을 미리봄
            </h2>
            <p className="text-xs sm:text-sm text-indigo-100 font-normal mt-2 leading-relaxed max-w-md">
              회사에 최종 제출하기 전, 놓치기 쉬운 15가지 소득·세액공제와 환급 예상액을
              AI 사전점검으로 3초 만에 시뮬레이션하세요.
            </p>

            {/* 캐러셀 인디케이터 바 */}
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

          {/* 2. 입체형 실시간 UI 쇼케이스 */}
          <div className="relative z-10 w-full my-auto pb-4 pt-1">
            {/* 메인 사전점검 리포트 카드 */}
            <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-slate-800 shadow-2xl border border-white/60 transition-transform duration-300">
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

            {/* 플로팅 AI 챗봇 대화 위젯 (AI chatbot.png 감성) */}
            <div className="mt-3 sm:mt-0 sm:absolute sm:-bottom-4 sm:-right-2 w-full sm:w-[310px] bg-white rounded-2xl p-3.5 shadow-2xl border border-indigo-100/90 text-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

              {/* 말풍선 대화 */}
              <div className="space-y-1.5 text-[11px] leading-relaxed">
                <div className="p-2 rounded-xl rounded-tl-xs bg-indigo-50/80 text-indigo-950 border border-indigo-100/60 font-medium">
                  홍길동님, 작년에 빠뜨리신 <span className="font-bold text-[#4F46E5]">월세액 75만원</span>을 이번에 등록하면 <span className="font-bold text-emerald-600">127,500원</span>이 더 환급돼요!
                </div>

                <div className="p-2 rounded-xl rounded-tr-xs bg-[#5B5DF0] text-white font-medium ml-auto max-w-[85%] text-right shadow-xs">
                  진짜요? 지금 바로 반영해 줘! ✨
                </div>
              </div>

              {/* AI chatbot 캡슐형 퀵 버튼들 */}
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

              {/* AI 질문 입력창 */}
              <div className="mt-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-between text-[9.5px] text-slate-400">
                <span>+ 궁금한 세무 질문을 입력하세요...</span>
                <span>🎙️</span>
              </div>
            </div>
          </div>

          {/* 3. 우측 하단 태그라인 */}
          <div className="relative z-10 pt-4 flex items-center justify-between text-[11px] text-indigo-200/80 font-medium">
            <span>AI 사전점검으로 누락 없는 연말정산</span>
            <span>© 2025 정산봄 (JeongsanBom)</span>
          </div>
        </div>
      </div>

      {/* 안내 모달 (비밀번호 찾기 / 회원가입) */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌸</span>
                <span className="font-black text-slate-900 text-base">
                  {modalType === 'forgot' ? '비밀번호 재설정' : '정산봄 무료 회원가입'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="text-slate-400 hover:text-slate-600 p-1 text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {modalType === 'forgot' ? (
                <>가입하신 이메일 주소로 비밀번호 재설정 링크를 발송해 드립니다. 또는 간편하게 <b>Google 계정으로 로그인</b>하시면 비밀번호 없이 즉시 이용하실 수 있습니다.</>
              ) : (
                <>정산봄은 별도의 복잡한 서류 절차 없이 <b>Google 계정으로 1초 만에 무료 회원가입 및 시작</b>할 수 있습니다. 상단의 'Sign in with Google'을 눌러주세요.</>
              )}
            </p>

            <button
              type="button"
              onClick={() => {
                setModalType(null);
                handleGoogleLogin();
              }}
              className="w-full py-3 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
            >
              Google 계정으로 계속하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
