import React from 'react';

/**
 * 국세청 공식 가이드라인 인용 및 출처 박스 스켈레톤
 */
export default function CitationBox({ title, sourcePage, content }) {
  return (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-amber-900 flex items-center gap-1.5">
          📖 국세청 공식 해설 근거
        </span>
        {sourcePage && (
          <span className="text-xs bg-amber-200/60 text-amber-800 px-2 py-0.5 rounded-full font-medium">
            p.{sourcePage} 참조
          </span>
        )}
      </div>
      <p className="text-amber-900/90 leading-relaxed text-xs">
        {content || '국세청 연말정산 신고안내 자료에 기반한 법령 요건 해설입니다.'}
      </p>
      {title && (
        <div className="mt-2 text-[11px] text-amber-700/70">
          출처: {title}
        </div>
      )}
    </div>
  );
}
