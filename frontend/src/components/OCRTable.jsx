import React from 'react';

/**
 * 파싱된 영수증 및 간소화 내역 확인 테이블 스켈레톤
 */
export default function OCRTable({ items = [] }) {
  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">항목</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">지출처 / 내역</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-600">금액</th>
            <th className="px-4 py-3 text-center font-semibold text-slate-600">공제 대상 여부</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <tr>
              <td colSpan="4" className="px-4 py-8 text-center text-slate-400">
                추출된 데이터가 없습니다. 문서를 업로드해 주세요.
              </td>
            </tr>
          ) : (
            items.map((item, idx) => (
              <tr key={idx}>
                <td className="px-4 py-3 text-slate-800">{item.category}</td>
                <td className="px-4 py-3 text-slate-600">{item.description}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{item.amount?.toLocaleString()}원</td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">적격</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
