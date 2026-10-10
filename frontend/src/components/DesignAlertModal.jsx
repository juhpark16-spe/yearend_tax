import React, { useEffect } from 'react';

/**
 * 시스템 기본 브라우저 alert(localhost:5173 내용...)을 대체하는
 * 세련된 프리미엄 디자인 알림창 (Design Alert Dialog)
 */
export default function DesignAlertModal({
  isOpen,
  title = '알림',
  message = '',
  onClose,
  type = 'info', // 'info' | 'warning' | 'success'
}) {
  // ESC 키로 닫기 지원
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150"
      >
        {/* 상단 알림 아이콘 배지 (동그라미 모양의 느낌표 ! 배지) */}
        <div className="w-14 h-14 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-2xl font-black mx-auto shadow-md shrink-0 select-none">
          !
        </div>

        {/* 안내 타이틀 및 메시지 본문 */}
        <div className="space-y-1.5 px-1">
          <h4 className="text-base font-black text-slate-900 tracking-tight">
            {title}
          </h4>
          <p className="text-[13px] text-slate-600 leading-relaxed font-medium break-keep">
            {message}
          </p>
        </div>

        {/* 확인 버튼 */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="w-full py-3.5 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-tight transition shadow-sm cursor-pointer active:scale-98"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
