import React, { useState, useEffect, useRef } from 'react';

/**
 * 업로드 및 AI 파싱 진행 상태를 생생하고 다채로운 색상으로 보여주는 고품질 진행바 컴포넌트
 */
export default function UploadProgressBar({
  isAnalyzing = false,
  fileName = '',
  fileSize = '',
  title = '연말정산간소화 PDF 분석 중',
  isComplete = false,
  onComplete = null,
}) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef(null);
  const onCompleteCalledRef = useRef(false);

  useEffect(() => {
    if (!isAnalyzing) {
      setProgress(0);
      onCompleteCalledRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // 분석 시작 시 0%에서 시작
    setProgress(5);
    onCompleteCalledRef.current = false;

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (isComplete) {
          return 100;
        }

        // 백엔드 응답 전에는 최대 94%까지 점진적으로 증가
        if (prev < 30) {
          return prev + Math.floor(Math.random() * 4 + 3); // 0~30% 빠르게
        } else if (prev < 65) {
          return prev + Math.floor(Math.random() * 3 + 2); // 30~65%
        } else if (prev < 85) {
          return prev + Math.floor(Math.random() * 2 + 1); // 65~85%
        } else if (prev < 94) {
          return prev + 1; // 85~94% 서서히 대기
        }
        return 94;
      });
    }, 120);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAnalyzing]);

  // isComplete 신호가 오면 빠르게 100%로 가속
  useEffect(() => {
    if (isComplete && isAnalyzing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);

      const timer = setTimeout(() => {
        if (onComplete && !onCompleteCalledRef.current) {
          onCompleteCalledRef.current = true;
          onComplete();
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isComplete, isAnalyzing, onComplete]);

  if (!isAnalyzing && progress === 0) return null;

  // 현재 진행률에 따른 단계 메시지 및 색상 그라데이션 결정
  let stepText = '1단계: PDF 파일 업로드 및 형식 검사 중...';
  let activeStep = 1;
  let barGradient = 'from-blue-500 via-indigo-600 to-indigo-700';
  let badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
  let glowColor = 'shadow-[0_0_15px_rgba(79,70,229,0.5)]';

  if (progress >= 100) {
    stepText = '분석 완료! 데이터를 안전하게 불러왔습니다.';
    activeStep = 4;
    barGradient = 'from-teal-500 via-emerald-500 to-green-500';
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-300';
    glowColor = 'shadow-[0_0_16px_rgba(16,185,129,0.6)]';
  } else if (progress >= 85) {
    stepText = '4단계: 데이터 정합성 검증 및 한도 계산 중...';
    activeStep = 4;
    barGradient = 'from-purple-600 via-violet-500 to-cyan-500';
    badgeColor = 'bg-cyan-50 text-cyan-800 border-cyan-200';
    glowColor = 'shadow-[0_0_15px_rgba(6,182,212,0.5)]';
  } else if (progress >= 55) {
    stepText = '3단계: 공제 항목별 세액·납입금액 AI 자동 추출 중...';
    activeStep = 3;
    barGradient = 'from-indigo-600 via-purple-600 to-pink-500';
    badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
    glowColor = 'shadow-[0_0_15px_rgba(168,85,247,0.5)]';
  } else if (progress >= 25) {
    stepText = '2단계: 문서 서식 구조 및 텍스트 데이터 판독 중...';
    activeStep = 2;
    barGradient = 'from-blue-600 via-indigo-500 to-purple-600';
    badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    glowColor = 'shadow-[0_0_15px_rgba(99,102,241,0.5)]';
  }

  const steps = [
    { num: 1, label: '업로드' },
    { num: 2, label: '서식판독' },
    { num: 3, label: 'AI 추출' },
    { num: 4, label: '검증완료' },
  ];

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-indigo-100 shadow-md space-y-3.5 animate-in fade-in transition-all duration-300">
      {/* 1. 상단: 파일 정보 & 퍼센트 뱃지 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shrink-0">
            {progress >= 100 ? (
              <svg className="w-4.5 h-4.5 text-emerald-600 animate-in zoom-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                {fileName || title}
              </span>
              {fileSize && (
                <span className="text-[11px] text-slate-600 font-mono shrink-0">
                  ({fileSize})
                </span>
              )}
            </div>
            <div className="text-[11.5px] font-medium text-slate-600 truncate mt-0.5">
              {stepText}
            </div>
          </div>
        </div>

        {/* 진행률 퍼센트 뱃지 */}
        <div className={`px-2.5 py-1 rounded-xl border text-xs font-black font-mono tracking-wider shrink-0 transition-all ${badgeColor} ${glowColor}`}>
          {progress}%
        </div>
      </div>

      {/* 2. 메인 프로그레스 바 (화려하고 역동적인 애니메이션 그라데이션) */}
      <div className="relative w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200/70 shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-300 ease-out relative overflow-hidden`}
          style={{ width: `${progress}%` }}
        >
          {/* 사선 스트라이프 물결 애니메이션 */}
          <div
            className="absolute inset-0 opacity-40 animate-progress-stripe"
            style={{
              backgroundImage:
                'linear-gradient(45deg, rgba(255,255,255,0.3) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.3) 75%, transparent 75%, transparent)',
            }}
          />

          {/* 좌우로 흐르는 반짝이는 쉬머 광원 */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-progress-shimmer" />

          {/* 진행 끝단 발광 펄스 포인트 */}
          {progress < 100 && (
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-white rounded-full shadow-[0_0_8px_#ffffff] animate-pulse" />
          )}
        </div>
      </div>

      {/* 3. 하단 스텝 표시기 (4단계) */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 pt-0.5">
        {steps.map((s) => {
          const isPassed = activeStep > s.num || progress >= 100;
          const isCurrent = activeStep === s.num && progress < 100;
          return (
            <div
              key={s.num}
              className={`py-1.5 px-1 rounded-lg text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                isPassed
                  ? 'bg-emerald-50/80 border border-emerald-200 text-emerald-700'
                  : isCurrent
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold shadow-2xs'
                  : 'bg-slate-50 border border-slate-100 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-1">
                <span
                  className={`w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                    isPassed
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {isPassed ? '✓' : s.num}
                </span>
                <span className="text-[10px] sm:text-[11px] leading-tight">
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
