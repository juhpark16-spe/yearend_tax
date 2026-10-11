import React, { useState } from 'react';
import { taxService } from '../services/api';
import { buildServerInputs, compareEngines } from '../utils/serverInputs';
import { getSecureItem } from '../utils/secureStorage';

const SESSION_KEY = 'selftax_server_session_id';
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}원`;

/**
 * 서버 교차검증 카드
 * - 화면 엔진(taxCalculator.js) 결과는 그대로 두고, 같은 입력을 백엔드 결정론적 엔진(/calculate)으로 다시 계산해 비교한다.
 * - 백엔드가 기록한 7단계 감사 로그(/audit)를 타임라인으로 보여준다.
 */
export default function ServerCrossCheckCard({ jsResult, userName = '' }) {
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [openLogs, setOpenLogs] = useState(false);

  const run = async () => {
    setState('running');
    setError('');
    try {
      let sessionId = null;
      try { sessionId = localStorage.getItem(SESSION_KEY); } catch { sessionId = null; }
      const ensureSession = async () => {
        const created = await taxService.createSession({ tax_year: 2025 });
        try { localStorage.setItem(SESSION_KEY, created.session_id); } catch { /* 저장 실패 무시 */ }
        return created.session_id;
      };
      if (!sessionId) sessionId = await ensureSession();

      // 화면 엔진과 같은 저장 자료를 읽어 백엔드 입력으로 변환
      const inputs = buildServerInputs({
        jsResult,
        deductionData: getSecureItem('selftax_deduction_data') || {},
        familyList: getSecureItem('selftax_family_list', []) || [],
        withholdingData: getSecureItem('selftax_withholding_data'),
        previousJobs: getSecureItem('selftax_previous_jobs', []) || [],
        userName,
      });
      try {
        await taxService.saveSessionInputs(sessionId, inputs);
      } catch (e) {
        // 세션이 만료·삭제되었거나 다른 사용자 세션이면 새로 발급
        if ([403, 404].includes(e?.response?.status)) {
          sessionId = await ensureSession();
          await taxService.saveSessionInputs(sessionId, inputs);
        } else {
          throw e;
        }
      }
      await taxService.calculateTax(sessionId);
      const result = await taxService.getResult(sessionId);
      const audit = await taxService.getAuditTrail(sessionId);
      setRows(compareEngines(jsResult, result));
      setLogs(Array.isArray(audit?.logs) ? audit.logs : []);
      setState('done');
    } catch (e) {
      setError('백엔드 서버에 연결하지 못했습니다. 서버(uvicorn)가 실행 중인지 확인해 주세요.');
      setState('error');
    }
  };

  const allSame = rows.length > 0 && rows.every((r) => r.same);

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-2xs p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold text-emerald-600 tracking-wide">서버 교차검증</p>
          <h3 className="text-[15.5px] font-extrabold text-slate-900 leading-snug">
            두 개의 결정론적 엔진으로 다시 계산해 봐요
          </h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5">화면 엔진(JS) 결과를 백엔드 Python 엔진이 같은 입력으로 재계산하고 근거를 기록합니다.</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state === 'running'}
          className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold text-white transition ${state === 'running' ? 'bg-slate-400 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'}`}
        >
          {state === 'running' ? '계산 중...' : state === 'done' ? '다시 검증' : '교차검증 실행'}
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

      {state === 'done' && (
        <>
          <div className={`rounded-xl px-3 py-2 text-xs font-bold border ${allSame ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {allSame ? '✓ 7개 단계 모두 두 엔진의 결과가 일치합니다.' : '일부 단계에서 두 엔진의 결과가 다릅니다. 아래 표에서 차이를 확인하세요.'}
          </div>
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_44px] bg-slate-50 text-[11px] font-bold text-slate-500 px-3 py-2">
              <span>단계</span><span className="text-right">화면 엔진</span><span className="text-right">백엔드 엔진</span><span className="text-center">결과</span>
            </div>
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[1.2fr_1fr_1fr_44px] px-3 py-2 text-xs border-t border-slate-100">
                <span className="font-semibold text-slate-700">{r.label}</span>
                <span className="text-right font-mono text-slate-900">{won(r.js)}</span>
                <span className="text-right font-mono text-slate-900">{won(r.server)}</span>
                <span className={`text-center font-bold ${r.same ? 'text-emerald-600' : 'text-amber-600'}`}>{r.same ? '일치' : '차이'}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpenLogs((v) => !v)}
            className="w-full text-left text-xs font-bold text-[#4F46E5] py-1"
          >
            {openLogs ? '▾' : '▸'} 백엔드 감사 로그(Audit Trail) {logs.length}건 — 단계별 수식·근거 조항
          </button>
          {openLogs && (
            <ol className="space-y-2">
              {logs.map((l) => (
                <li key={`${l.sequence_order}-${l.step_name}`} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      <span className="inline-block w-5 h-5 mr-1.5 rounded-full bg-[#4F46E5] text-white text-[10px] leading-5 text-center">{l.step}</span>
                      {l.step_name}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-900">{won(l.calculated_amount ?? l.output_value)}</span>
                  </div>
                  {l.legal_formula && <p className="mt-1 text-[11px] text-slate-500">{l.legal_formula}</p>}
                  {l.explanation && <p className="mt-0.5 text-[11.5px] text-slate-600 leading-relaxed">{l.explanation}</p>}
                  {l.legal_basis && <p className="mt-0.5 text-[10.5px] font-semibold text-[#4F46E5]">{l.legal_basis}</p>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
