import React from 'react';

/**
 * 모든 서브 페이지 상단 공통 헤더
 * - 왼쪽 위: 홈화면 버튼 (사용자 핵심 요구사항)
 * - 상단: 현재 단계 및 이전/다음 스텝 네비게이션
 */
export default function SubPageHeader({
  title,
  stepText,
  currentKey,
  onGoHome,
  onNavigateStep,
}) {
  const allSteps = [
    { key: 'family', label: '부양가족', stepNum: 2 },
    { key: 'withholding', label: '원천징수', stepNum: 3 },
    { key: 'previous_job', label: '종전근무지', stepNum: 3 },
    { key: 'hometax', label: '국세청자료', stepNum: 4 },
    { key: 'input_data', label: '자료입력', stepNum: 4 },
    { key: 'history', label: '연도별현황', stepNum: 5 },
  ];

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
      {/* 상단 메인 라인: 왼쪽 위 홈화면 버튼 + 타이틀 */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* 왼쪽 위: 홈화면 버튼 */}
          <button
            onClick={onGoHome}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:scale-95 transition font-bold text-xs border border-indigo-200 shadow-xs cursor-pointer group"
            title="메인 홈화면으로 이동"
          >
            <svg
              className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
            <span>홈화면</span>
          </button>

          <span className="text-slate-300">/</span>

          <h2 className="text-sm font-bold text-slate-800 tracking-tight">
            {title}
          </h2>
        </div>

        {/* 우측 스텝 뱃지 */}
        {stepText && (
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
            {stepText}
          </span>
        )}
      </div>

      {/* 스텝 수평 스크롤 탭 (연말정산자료입력과 아래 메뉴가 100% 동일하게 공유) */}
      <div className="px-4 pb-2 pt-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-slate-100 bg-slate-50/70">
        {allSteps.map((s) => {
          const isActive = s.key === currentKey;
          return (
            <button
              key={s.key}
              onClick={() => onNavigateStep && onNavigateStep(s.key)}
              className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                isActive
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200/60'
              }`}
            >
              <span className={`text-[10px] ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                {s.stepNum}.
              </span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
