import React from 'react';

/**
 * 첨부 이미지 기준: 심플하고 세련된 상단 블루 5단계 프로세스 바
 * 1. 부양가족 > 2. 원천징수자료 > 3. 국세청자료 > 4. 공제자료 입력 > 5. 예상세액
 * - 깔끔한 솔리드 블루 배경 (#4572EB)
 * - 활성화: 흰색 솔리드 원형 + 파란색 아이콘
 * - 비활성화: 옅은 반투명 원형 (bg-white/20) + 흰색 아이콘
 * - 심플한 '>' 화살표 구분자
 */
export default function TaxStepProgressBar({ currentStep = 1, onSelectStep, variant = '5step' }) {
  const fiveSteps = [
    {
      id: 1,
      key: 'family',
      title: '부양가족',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
    },
    {
      id: 2,
      key: 'withholding',
      title: '원천징수자료',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      ),
    },
    {
      id: 3,
      key: 'hometax',
      title: '국세청자료',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <polyline points="9 13.5 11.5 16 15.5 11" />
        </svg>
      ),
    },
    {
      id: 4,
      key: 'input_data',
      title: '공제자료 입력',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
    },
    {
      id: 5,
      key: 'tax_result',
      title: '예상세액',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <circle cx="11.5" cy="14.5" r="2.5" />
          <path d="M13.5 16.5L16 19" />
        </svg>
      ),
    },
  ];

  const fourSteps = [
    {
      id: 1,
      key: 'family',
      title: '부양가족',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
    },
    {
      id: 2,
      key: 'hometax',
      title: '국세청자료',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <polyline points="9 13.5 11.5 16 15.5 11" />
        </svg>
      ),
    },
    {
      id: 3,
      key: 'input_data',
      title: '공제자료 입력',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
    },
    {
      id: 4,
      key: 'tax_result',
      title: '예상세액',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <circle cx="11.5" cy="14.5" r="2.5" />
          <path d="M13.5 16.5L16 19" />
        </svg>
      ),
    },
  ];

  const steps = variant === '4step' ? fourSteps : fiveSteps;

  return (
    <div className="w-full bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#6366F1] text-white px-2 sm:px-4 py-3.5 flex items-center justify-between select-none shadow-sm">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;

        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              onClick={() => onSelectStep && onSelectStep(step.key)}
              title={step.title}
              className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-none flex-1 max-w-[76px] transition-transform active:scale-95"
            >
              {/* 원형 아이콘: 활성화는 흰색 배경 + 인디고 아이콘, 비활성화는 옅은 반투명 원형 + 흰색 아이콘 */}
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-white text-[#4F46E5] shadow-sm'
                    : 'bg-white/25 text-white hover:bg-white/35'
                }`}
              >
                {step.icon}
              </div>

              {/* 스텝 타이틀 */}
              <span
                className={`text-[10px] sm:text-[11.5px] font-bold tracking-tight text-center leading-tight transition-opacity whitespace-nowrap ${
                  isActive ? 'opacity-100 font-extrabold text-white' : 'opacity-90 text-white'
                }`}
              >
                {step.title}
              </span>
            </button>

            {/* 단계 구분 화살표 (마지막 아이템 제외, 원형 아이콘 높이에 맞춰 수직 중앙 정렬) */}
            {index < steps.length - 1 && (
              <div className="text-white/60 text-xs sm:text-sm font-semibold select-none px-0.5 shrink-0 -mt-6">
                &gt;
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
