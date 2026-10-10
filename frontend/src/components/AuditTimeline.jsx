import React from 'react';

/**
 * 계산 근거 감사 추적 타임라인 스켈레톤 ("왜 이 금액인가요?")
 */
export default function AuditTimeline({ steps = [] }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center justify-between">
        <span>세액 계산 산출 근거 (Audit Log)</span>
        <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">결정론적 계산 엔진</span>
      </h3>
      <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
        {steps.length === 0 ? (
          <p className="text-sm text-slate-400 pl-6">계산 내역이 없습니다.</p>
        ) : (
          steps.map((step, idx) => (
            <div key={idx} className="relative pl-6">
              <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-[#4F46E5] border-2 border-white" />
              <div className="flex justify-between items-baseline mb-1">
                <h4 className="text-sm font-semibold text-slate-800">{step.step}</h4>
                {step.amount !== null && (
                  <span className="text-sm font-bold text-slate-900">{step.amount?.toLocaleString()}원</span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{step.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
