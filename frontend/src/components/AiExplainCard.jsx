import React, { useEffect, useRef, useState } from 'react';
import { taxService } from '../services/api';

/**
 * AI 근거 보기 카드
 * - 화면에서 계산한 세액 수치(개인정보 제외)를 /rag/explain 으로 보내
 *   국세청 안내서 출처(페이지)가 포함된 해설을 받아 보여준다.
 * - 계산은 하지 않는다: 표시되는 금액은 모두 화면 엔진(taxCalculator.js)의 결과다.
 */
const TOPICS = [
  // key는 지식베이스(rag_data/markdown)의 category 값과 일치해야 해당 문서로 검색 범위가 좁혀진다
  { key: '근로소득', label: '왜 이 금액인가요?', query: '근로소득공제, 과세표준, 산출세액을 거쳐 결정세액과 환급(추가납부) 금액이 이렇게 나온 이유를 설명해 주세요.' },
  { key: '신용카드', label: '신용카드 공제', query: '신용카드 등 사용금액 소득공제가 어떻게 계산되는지 설명해 주세요.' },
  { key: '교육비', label: '교육비 공제', query: '교육비 세액공제 대상과 한도를 설명해 주세요.' },
  { key: '의료비', label: '의료비 공제', query: '의료비 세액공제 요건과 계산 방법을 설명해 주세요.' },
];

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export const buildExplainPayload = (t = {}) => ({
  gross_salary: toNumber(t.totalSalary),
  earned_income_deduction: toNumber(t.earnedIncomeDeduction),
  taxable_standard: toNumber(t.taxBase),
  calculated_tax: toNumber(t.calculatedTax),
  tax_credits: toNumber(t.taxCreditsTotal),
  final_decision_tax: toNumber(t.finalIncomeTax),
  total_prepaid_tax: toNumber(t.paidIncomeTax),
  final_refund_amount: toNumber(t.diffIncomeTax),
});

export default function AiExplainCard({ taxResult }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const cardRef = useRef(null);

  const requestExplain = async (t) => {
    setTopic(t);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await taxService.explainResult({
        category: t.key,
        query: t.query,
        payload: buildExplainPayload(taxResult || {}),
      });
      setResult(data);
    } catch (e) {
      setError(e?.userMessage || '해설 서버에 연결하지 못했습니다. 백엔드 서버가 실행 중인지 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  // 근로자용 "계산 검증 완료" 줄(CalcVerificationLine)을 누르면 이 카드로 이동해 해당 해설을 연다
  useEffect(() => {
    const onOpen = (e) => {
      const t = TOPICS.find((x) => x.key === e?.detail?.key) || TOPICS[0];
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!loading) requestExplain(t);
    };
    window.addEventListener('selftax:open-explain', onOpen);
    return () => window.removeEventListener('selftax:open-explain', onOpen);
  });

  return (
    <div ref={cardRef} className="w-full bg-white rounded-3xl border border-indigo-100 shadow-2xs p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold text-[#4F46E5] tracking-wide">AI 근거 보기</p>
          <h3 className="text-[15.5px] font-extrabold text-slate-900 leading-snug">
            국세청 안내서 출처와 함께 설명해 드려요
          </h3>
        </div>
        <span className="text-[10.5px] text-slate-400 text-right leading-tight">
          계산은 결정론적 엔진,<br />AI는 설명만 담당
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TOPICS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={loading}
            onClick={() => requestExplain(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              topic.key === t.key && (result || loading)
                ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
            } ${loading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
          <span className="w-4 h-4 border-2 border-indigo-100 border-t-[#4F46E5] rounded-full animate-spin" />
          국세청 안내서를 찾아 해설을 만들고 있어요...
        </div>
      )}

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

      {result && (
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
          <p className="text-sm font-extrabold text-slate-900">{result.title}</p>
          <p className="text-[13px] text-slate-700 leading-relaxed">{result.summary}</p>
          {result.reason && <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">{result.reason}</p>}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-[#4F46E5] bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5">
              출처: 2025 연말정산 신고안내 p.{result.page}
            </span>
            {(result.references || []).slice(0, 3).map((r) => (
              <span key={r} className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
