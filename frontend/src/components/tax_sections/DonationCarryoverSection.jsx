import React, { useMemo, useState } from 'react';
import {
  DONATION_CARRYOVER_TYPES,
  DONATION_CARRYOVER_YEARS,
  normalizeDonationCarryoverItems,
} from '../../utils/taxCalculator';

/**
 * 전년도 이월 기부금 입력 (소득세법 제61조)
 * - 이월 대상: 특례기부금, 일반기부금(종교단체 외·종교단체) — 정치자금·고향사랑·우리사주조합은 이월 불가
 * - 이월 기간: 10년 (2025년 귀속은 2015~2024년 지출분)
 * - 금액: 전년도 기부금명세서 '기부금 조정명세'의 '다음 연도 이월액' (공제받지 못한 금액)
 * - 이월분은 같은 종류의 올해 기부금보다 먼저, 기부연도가 빠른 것부터 공제된다.
 */
const won = (v) => `${(Number(v) || 0).toLocaleString()}원`;

export default function DonationCarryoverSection({ items = [], onChange, taxYear = 2025, carryoverNext = null }) {
  const ty = Number(taxYear) || 2025;
  const years = useMemo(() => {
    const list = [];
    for (let y = ty - 1; y >= ty - DONATION_CARRYOVER_YEARS; y -= 1) list.push(y);
    return list;
  }, [ty]);

  const [year, setYear] = useState(String(ty - 1));
  const [type, setType] = useState(DONATION_CARRYOVER_TYPES[0]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const valid = normalizeDonationCarryoverItems(items, ty);
  const totals = valid.reduce(
    (acc, it) => ({ ...acc, [it.kind]: (acc[it.kind] || 0) + it.amount, all: acc.all + it.amount }),
    { all: 0 }
  );
  const sorted = [...items].sort((a, b) => Number(a.year) - Number(b.year));

  const handleAdd = () => {
    const amt = parseInt(String(amount).replace(/[^0-9]/g, ''), 10) || 0;
    if (amt <= 0) {
      setError('이월 금액을 입력해주세요.');
      return;
    }
    setError('');
    const id = `carry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onChange?.([...items, { id, year: Number(year), type, amount: amt }]);
    setAmount('');
  };

  const handleDelete = (id) => onChange?.(items.filter((it) => it.id !== id));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#4F46E5] to-[#6366F1] text-white p-5 shadow-xs">
        <div className="text-xs font-semibold text-indigo-100">전년도 이월 기부금 합계</div>
        <div className="text-2xl font-extrabold font-mono mt-1">{won(totals.all)}</div>
        <div className="mt-3 space-y-1 text-xs text-indigo-100/90">
          <div className="flex justify-between"><span>ㄴ 특례기부금</span><span className="font-mono">{won(totals.special)}</span></div>
          <div className="flex justify-between"><span>ㄴ 일반기부금(종교단체 외)</span><span className="font-mono">{won(totals.generalNonReligious)}</span></div>
          <div className="flex justify-between"><span>ㄴ 일반기부금(종교단체)</span><span className="font-mono">{won(totals.generalReligious)}</span></div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-[12px] leading-relaxed text-slate-600 space-y-1">
        <p>· 전년도까지 한도초과·세액부족으로 공제받지 못한 <b>특례·일반기부금</b>을 기부연도별로 입력하세요.</p>
        <p>· 금액은 전년도 <b>기부금명세서의 '기부금 조정명세' 중 이월금액</b>(공제받지 못한 금액)입니다.</p>
        <p>· 이월 기간은 10년이며 {ty}년에는 {ty - DONATION_CARRYOVER_YEARS}~{ty - 1}년 기부분을 공제할 수 있습니다
          ({ty - DONATION_CARRYOVER_YEARS}년 기부분은 올해가 마지막).</p>
        <p>· 이월분은 같은 종류의 올해 기부금보다 먼저, 기부연도가 빠른 것부터 공제됩니다.</p>
        <p>· 정치자금·고향사랑·우리사주조합 기부금은 이월되지 않습니다.</p>
        <p>· 원천징수의무자(회사)가 바뀐 경우 전년도 기부금명세서를 함께 제출해야 합니다.</p>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-slate-800">이월 기부금 내역</div>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2 rounded-2xl border border-dashed border-slate-200">
            <div className="text-sm font-bold text-slate-700">전년도 이월 기부금 내역이 없습니다.</div>
            <p className="text-xs text-slate-400">아래에서 기부연도·종류·이월금액을 추가하세요.</p>
          </div>
        ) : (
          sorted.map((it) => {
            const y = Number(it.year);
            const outOfRange = y < ty - DONATION_CARRYOVER_YEARS || y > ty - 1;
            const lastYear = y === ty - DONATION_CARRYOVER_YEARS;
            const next = carryoverNext?.entries?.find((e) => e.year === y && e.amount === Number(it.amount));
            return (
              <div key={it.id} className="w-full bg-white rounded-2xl border border-slate-200/90 p-4 flex items-center justify-between shadow-2xs">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold text-slate-900">{y}년 기부분</span>
                    {lastYear && <span className="text-[10.5px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">올해 마지막 공제</span>}
                    {outOfRange && <span className="text-[10.5px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">이월기간 경과 · 제외</span>}
                  </div>
                  <div className="text-[13px] text-slate-600">{it.type}</div>
                  {next && (
                    <div className="text-[11px] text-slate-400">
                      올해 공제 {won(next.applied)} · {next.expires ? `소멸 ${won(next.remaining)}` : `다음 해 이월 ${won(next.remaining)}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-base font-bold text-slate-900 font-mono">{won(it.amount)}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(it.id)}
                    className="text-slate-300 hover:text-rose-500 p-1 text-base leading-none cursor-pointer rounded-md hover:bg-rose-50"
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-white p-4 space-y-3">
        <div className="text-xs font-bold text-slate-800">이월 기부금 추가</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-slate-500 space-y-1">
            <span>기부연도</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 bg-white"
            >
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-500 space-y-1">
            <span>기부금 종류</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 bg-white"
            >
              {DONATION_CARRYOVER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-[11px] font-semibold text-slate-500 space-y-1">
          <span>이월금액 (공제받지 못한 금액)</span>
          <input
            inputMode="numeric"
            value={amount ? Number(String(amount).replace(/[^0-9]/g, '') || 0).toLocaleString() : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="예: 1,000,000"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 font-mono"
          />
        </label>
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <button
          type="button"
          onClick={handleAdd}
          className="w-full py-3 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm cursor-pointer"
        >
          + 이월 기부금 추가
        </button>
      </div>

      {carryoverNext && carryoverNext.total + carryoverNext.expired > 0 && (
        <div className="rounded-2xl border border-slate-200 p-4 text-xs text-slate-600 space-y-1">
          <div className="font-bold text-slate-800">다음 해({ty + 1}년)로 이월 예상</div>
          <div className="flex justify-between"><span>특례기부금</span><span className="font-mono">{won(carryoverNext.special)}</span></div>
          <div className="flex justify-between"><span>일반기부금(종교단체 외)</span><span className="font-mono">{won(carryoverNext.generalNonReligious)}</span></div>
          <div className="flex justify-between"><span>일반기부금(종교단체)</span><span className="font-mono">{won(carryoverNext.generalReligious)}</span></div>
          {carryoverNext.expired > 0 && (
            <div className="flex justify-between text-rose-600"><span>이월기간 경과로 소멸</span><span className="font-mono">{won(carryoverNext.expired)}</span></div>
          )}
          <p className="text-[11px] text-slate-400 pt-1">예상세액 계산 결과 기준이며, 표준세액공제를 택하면 올해 기부금은 이월되지 않습니다.</p>
        </div>
      )}
    </div>
  );
}
