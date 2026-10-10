import React from 'react';

/**
 * 누락 방지 & 과다공제 방지 자가진단 질문 카드 스켈레톤
 */
export default function ChecklistCard({ question, onAnswer }) {
  if (!question) return null;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-indigo-100 text-indigo-800">
          {question.category || '공제 진단'}
        </span>
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-2">
        {question.question}
      </h3>
      {question.description && (
        <p className="text-sm text-slate-500 mb-6">
          {question.description}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={() => onAnswer && onAnswer(true)}
          className="flex-1 py-2.5 px-4 rounded-lg bg-[#4F46E5] text-white font-medium hover:bg-[#4338CA] transition"
        >
          예 (적용)
        </button>
        <button
          onClick={() => onAnswer && onAnswer(false)}
          className="flex-1 py-2.5 px-4 rounded-lg bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition"
        >
          아니오 (제외)
        </button>
      </div>
    </div>
  );
}
