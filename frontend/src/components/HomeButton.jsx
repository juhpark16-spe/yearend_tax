import React from 'react';

/**
 * 첨부 이미지 기준: 캡슐형 파란색 홈화면 버튼
 * - 연한 하늘색 배경 및 테두리 (알약 캡슐 형태)
 * - 파란색 집(홈) 채움 아이콘 + '홈화면' 텍스트
 */
export default function HomeButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#C7D2FE] bg-[#EEF2FF] hover:bg-[#E0E7FF] active:scale-95 transition cursor-pointer text-[#4F46E5] text-xs font-bold shadow-2xs select-none"
      title="홈화면으로 이동"
    >
      {/* 인디고 솔리드 홈 아이콘 */}
      <svg className="w-3.5 h-3.5 fill-[#4F46E5] shrink-0" viewBox="0 0 24 24">
        <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" />
      </svg>
      <span className="tracking-tight">홈화면</span>
    </button>
  );
}
