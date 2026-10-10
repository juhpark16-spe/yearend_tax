import React from 'react';

/**
 * 7단계 사용자 여정 진행률 표시 바 스켈레톤
 */
export default function ProgressBar({ currentStep = 1, totalSteps = 7 }) {
  const percentage = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
      <div
        className="bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#6366F1] h-2.5 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
