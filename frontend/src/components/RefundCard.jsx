import React from 'react';

/**
 * 실시간 예상세액 및 환급/추징금 표시 카드 스켈레톤
 */
export default function RefundCard({ refundAmount = 0, finalTax = 0, prepaidTax = 0 }) {
  const isRefund = refundAmount >= 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-lg">
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">2025 귀속 예상 결과</span>
          <h2 className="text-2xl font-bold mt-1">
            {isRefund ? '예상 환급액' : '예상 추가 납부세액'}
          </h2>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${isRefund ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
          {isRefund ? '환급' : '추징'}
        </div>
      </div>

      <div className="text-4xl font-extrabold tracking-tight mb-6">
        <span className={isRefund ? 'text-emerald-400' : 'text-rose-400'}>
          {Math.abs(refundAmount).toLocaleString()}
        </span>
        <span className="text-2xl ml-1">원</span>
      </div>

      <div className="border-t border-slate-700/60 pt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-slate-400">결정세액</div>
          <div className="font-semibold text-slate-200">{finalTax.toLocaleString()}원</div>
        </div>
        <div>
          <div className="text-slate-400">기납부세액</div>
          <div className="font-semibold text-slate-200">{prepaidTax.toLocaleString()}원</div>
        </div>
      </div>
    </div>
  );
}
