import React from 'react';
import UserAuthStatus from '../UserAuthStatus';

/**
 * 2025년 연말정산 모바일 메인 화면
 * - 2025년 연말정산 배너 카드 & '연말정산자료입력' 버튼
 * - 2025년 연말정산 진행상태 (미작성, 작성중, 작성완료, 확인완료) — 읽기 전용
 * - 6개 주요 메뉴 (부양가족, 근로소득원천징수영수증, 종전근무지, 국세청 자료, 자료 입력, 연도별 현황)
 * - 하단 3대 서브 메뉴 (절세꿀팁, 구비서류, 이용가이드)
 */
export default function MainDashboard({
  onNavigate, onBackToIntro, userProfile, onSignOut,
  taxProgress = 1,
  completedMenus = new Set(),
}) {

  const statusSteps = [
    { id: 1, label: '미작성' },
    { id: 2, label: '작성중' },
    { id: 3, label: '작성완료' },
    { id: 4, label: '확인완료' },
  ];

  // 6개 메인 메뉴 (3열 2행)
  const mainMenus = [
    {
      id: 'family',
      title: '부양가족',
      targetScreen: 'family',
      icon: (
        <svg className="w-7 h-7 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: 'withholding',
      title: '근로소득원천징수영수증',
      targetScreen: 'withholding',
      icon: (
        <svg className="w-7 h-7 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h6" />
          <circle cx="16" cy="16" r="3" />
          <line x1="18.5" y1="18.5" x2="21" y2="21" />
        </svg>
      ),
    },
    {
      id: 'previous_job',
      title: '종전근무지',
      targetScreen: 'previous_job',
      icon: (
        <svg className="w-7 h-7 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M9 22v-4h6v4" />
          <path d="M8 6h.01" />
          <path d="M16 6h.01" />
          <path d="M8 10h.01" />
          <path d="M16 10h.01" />
          <path d="M8 14h.01" />
          <path d="M16 14h.01" />
        </svg>
      ),
    },
    {
      id: 'hometax',
      title: '국세청 자료',
      targetScreen: 'hometax',
      icon: (
        <svg className="w-7 h-7 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'input_data',
      title: '자료 입력',
      targetScreen: 'input_data',
      icon: (
        <svg className="w-7 h-7 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
    },
    {
      id: 'history',
      title: '연도별 현황',
      targetScreen: 'history',
      icon: (
        <svg className="w-7 h-7 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
          <rect x="2" y="2" width="20" height="20" rx="3" />
        </svg>
      ),
    },
  ];

  // 하단 3대 서브 메뉴 (일괄제공동의 삭제 반영)
  const subMenus = [
    {
      id: 'tax_tips',
      title: '절세꿀팁',
      targetScreen: 'tax_tips',
      icon: (
        <svg className="w-6 h-6 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      id: 'required_docs',
      title: '구비서류',
      targetScreen: 'required_docs',
      icon: (
        <svg className="w-6 h-6 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z" />
          <line x1="8" y1="13" x2="16" y2="13" />
        </svg>
      ),
    },
    {
      id: 'guide',
      title: '이용가이드',
      targetScreen: 'user_guide',
      icon: (
        <svg className="w-6 h-6 text-[#6366F1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          <circle cx="12" cy="11" r="1.5" />
          <path d="M12 14v1" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[#F6F7FB] text-[#1E293B] flex flex-col justify-between pb-6 select-none font-sans">
      {/* 1. 상단 헤더: 2025년 연말정산 타이틀 + 우측 프로필/로그아웃/로그인/정산봄 */}
      <div className="w-full px-4 sm:px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-200/60 bg-white/70 backdrop-blur-xs">
        {/* 제목만 (배로가기 삭제) */}
        <div className="flex items-center gap-1.5">
          <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight">
            2025년 연말정산
          </h1>
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
            사전점검
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* 로그인 사용자 프로필 및 로그아웃/로그인 버튼 */}
          <UserAuthStatus
            userProfile={userProfile}
            onSignOut={onSignOut}
            onLogin={onBackToIntro}
          />

          {/* 정산봄 로고와 정산봄 글자만 표기 */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('company')}
            className="group flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white hover:bg-indigo-50/90 border border-slate-200/90 hover:border-indigo-300 shadow-2xs transition-all cursor-pointer"
            title="정산봄 회사소개 상세페이지로 이동"
          >
            <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#4338CA] via-[#4F46E5] to-[#7C3AED] text-white flex items-center justify-center text-[11px] shadow-xs shrink-0 group-hover:scale-110 transition-transform">
              🌸
            </span>
            <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight">
              정산봄
            </span>
          </button>
        </div>
      </div>

      {/* 메인 스크롤 콘텐츠 (AI 안내 배너 삭제, 연말정산 배너부터 시작) */}
      <div className="flex-1 px-5 space-y-3.5 overflow-y-auto">
        {/* 2. 상단 히어로 배너 카드 */}
        <div className="relative rounded-3xl p-6 bg-gradient-to-br from-[#4338CA] via-[#4F46E5] to-[#7C3AED] text-white shadow-md overflow-hidden">
          {/* 우측 상단 TAX 그래픽 일러스트 */}
          <div className="absolute right-4 top-5 w-24 h-24 opacity-85 pointer-events-none">
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full drop-shadow">
              <rect x="20" y="15" width="60" height="70" rx="10" stroke="#FFFFFF" strokeWidth="4" fill="rgba(255,255,255,0.08)" />
              <rect x="30" y="23" width="40" height="15" rx="4" stroke="#FFFFFF" strokeWidth="2" fill="rgba(255,255,255,0.15)" />
              <text x="50" y="34" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">TAX</text>
              <circle cx="36" cy="48" r="3.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="50" cy="48" r="3.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="64" cy="48" r="3.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="36" cy="60" r="3.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="50" cy="60" r="3.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="64" cy="60" r="9" stroke="#FFFFFF" strokeWidth="2.5" fill="#A78BFA" />
              <text x="64" y="64" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">₩</text>
            </svg>
          </div>

          {/* 타이틀 및 안내 문구 */}
          <div className="relative z-10 max-w-[230px]">
            <h2 className="text-2xl font-black tracking-tight text-white mb-2">
              2025년 연말정산
            </h2>
            <p className="text-xs text-white/90 leading-relaxed font-medium">
              2025년 귀속 연말정산 대상자입니다.
              <br />
              연말정산자료 입력을 진행해주세요.
            </p>
          </div>

          {/* 하단 액션 버튼: 연말정산자료입력 (클릭 시 family 화면으로 이동) */}
          <div className="mt-6 relative z-10">
            <button
              onClick={() => onNavigate && onNavigate('family')}
              className="w-full py-3.5 px-5 rounded-2xl bg-white/20 hover:bg-white/30 active:scale-[0.99] backdrop-blur-sm border border-white/30 text-white font-bold text-sm tracking-wide shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>연말정산자료입력</span>
            </button>
          </div>
        </div>

        {/* 3. 2025년 연말정산 진행상태 카드 — 읽기 전용 (prop 기반) */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
              2025년 연말정산 진행상태
            </h3>
          </div>

          {/* 수평 평행 바 (클릭 불가 — pointer-events-none) */}
          <div className="relative px-2 pointer-events-none select-none">
            <div className="absolute left-6 right-6 top-[13px] h-[2.5px] bg-[#E2E8F0]" />
            <div
              className="absolute left-6 top-[13px] h-[2.5px] bg-[#4F46E5] transition-all duration-500"
              style={{
                width: `${((taxProgress - 1) / (statusSteps.length - 1)) * 100}%`,
                maxWidth: 'calc(100% - 48px)',
              }}
            />
            <div className="relative z-10 flex justify-between items-center">
              {statusSteps.map((step) => {
                const isPassed = step.id < taxProgress;
                const isCurrent = step.id === taxProgress;
                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div className="h-7 flex items-center justify-center">
                      {isCurrent ? (
                        <div className="w-7 h-7 rounded-full bg-[#4338CA] text-white flex items-center justify-center shadow-md ring-4 ring-indigo-100">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <line x1="7" y1="8" x2="17" y2="8" />
                            <line x1="7" y1="12" x2="17" y2="12" />
                            <line x1="7" y1="16" x2="13" y2="16" />
                          </svg>
                        </div>
                      ) : isPassed ? (
                        <div className="w-4 h-4 rounded-full bg-[#4F46E5] ring-2 ring-white shadow-sm" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-[#CBD5E1] ring-2 ring-white" />
                      )}
                    </div>
                    <span className={`text-xs mt-2.5 ${
                      isCurrent ? 'font-bold text-[#4338CA]'
                      : isPassed ? 'font-semibold text-slate-700'
                      : 'font-normal text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. 메인 메뉴 6개 (3열 2행 그리드) */}
        <div className="grid grid-cols-3 gap-3">
          {mainMenus.map((menu) => {
            const done = completedMenus.has(menu.id);
            return (
              <button
                key={menu.id}
                onClick={() => onNavigate && onNavigate(menu.targetScreen)}
                className={`bg-white rounded-2xl p-4 shadow-sm hover:shadow-md border active:scale-[0.97] transition-all flex flex-col justify-between items-start text-left min-h-[116px] group cursor-pointer ${
                  done ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-100 hover:border-indigo-300'
                }`}
              >
                <div className="w-full flex items-start justify-between">
                  <span className={`text-[13px] font-bold leading-snug line-clamp-2 transition-colors ${
                    done ? 'text-indigo-700' : 'text-[#1E293B] group-hover:text-indigo-600'
                  }`}>
                    {menu.title}
                  </span>
                  {done && (
                    <span className="shrink-0 ml-1 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold shadow-sm">
                      ✓
                    </span>
                  )}
                </div>

                <div className="w-full flex items-end justify-between mt-2">
                  {done && (
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md">작성</span>
                  )}
                  <div className="ml-auto w-9 h-9 rounded-xl bg-indigo-50/80 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                    {menu.icon}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. 하단 3대 서브 메뉴 / 퀵 링크 바 (절세꿀팁, 구비서류, 이용가이드) */}
      <div className="px-5 pt-3 mt-2 border-t border-slate-200/80 bg-white/70 backdrop-blur-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          {subMenus.map((sub) => (
            <button
              key={sub.id}
              onClick={() => onNavigate && onNavigate(sub.targetScreen)}
              className="py-1.5 px-1 rounded-xl hover:bg-slate-100 active:scale-95 transition flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-indigo-50 flex items-center justify-center transition">
                {sub.icon}
              </div>
              <span className="text-[11px] font-medium text-slate-600 group-hover:text-slate-900 truncate w-full">
                {sub.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
