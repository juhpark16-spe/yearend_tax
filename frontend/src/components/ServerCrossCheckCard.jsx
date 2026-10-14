import React, { useState } from 'react';
import { SERVER_SESSION_KEY, serverErrorMessage, taxService } from '../services/api';
import { recordVerificationMismatch, runServerCrossCheck } from '../utils/serverCrossCheck';
import { wipeLocalTaxData, getActiveOwner } from '../utils/userTaxStorage';

const SESSION_KEY = SERVER_SESSION_KEY;
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}원`;

/**
 * 서버 교차검증 카드 — 검증 모드(개발자용, ?verify=1)에서만 표시 (근로자에게는 CalcVerificationLine 한 줄)
 * - 화면 엔진(taxCalculator.js) 결과는 그대로 두고, 같은 입력을 백엔드 결정론적 엔진(/calculate)으로 다시 계산해 비교한다.
 * - 백엔드가 기록한 7단계 감사 로그(/audit)를 타임라인으로 보여준다.
 */
export default function ServerCrossCheckCard({ jsResult, userName = '' }) {
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [rows, setRows] = useState([]);
  const [creditRows, setCreditRows] = useState([]);
  const [appliedRows, setAppliedRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [openLogs, setOpenLogs] = useState(false);
  // 결과가 길어서 접어 둘 수 있게 (요약 한 줄은 항상 표시)
  const [collapsed, setCollapsed] = useState(false);
  // 내 자료 전체 삭제: 서버 + 이 브라우저 (한 번 더 눌러야 삭제되는 2단계 버튼)
  const [deleteState, setDeleteState] = useState('idle'); // idle | confirm | deleting | done | error
  const deleteServerData = async () => {
    if (deleteState !== 'confirm') {
      setDeleteState('confirm');
      return;
    }
    setDeleteState('deleting');
    try {
      await taxService.deleteMyServerData();
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      setRows([]); setCreditRows([]); setAppliedRows([]); setLogs([]);
      setState('idle');
      // 서버 자료와 함께 이 브라우저에 남은 내 자료도 지우고 처음 화면으로
      wipeLocalTaxData(getActiveOwner() || 'guest');
      try { sessionStorage.setItem('selftax_current_screen', 'main'); } catch { /* ignore */ }
      setDeleteState('done');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setDeleteState('error');
    }
  };

  const run = async () => {
    setState('running');
    setError('');
    try {
      const r = await runServerCrossCheck({ jsResult, userName });
      if (!r.allSame) recordVerificationMismatch(r.diffs, { refund: jsResult?.diffIncomeTax, source: 'verify-mode' });
      setRows(r.rows);
      setCreditRows(r.creditRows);
      setAppliedRows(r.appliedRows);
      setLogs(r.logs);
      setCollapsed(false);
      setState('done');
    } catch (e) {
      setError(serverErrorMessage(e));
      setState('error');
    }
  };

  const allSame = rows.length > 0 && rows.every((r) => r.same);
  const creditDiffs = creditRows.filter((r) => !r.same && !r.total);
  const visibleCreditRows = creditRows.filter((r) => r.total || r.js !== 0 || r.server !== 0);
  const appliedDiffs = appliedRows.filter((r) => !r.same);
  const visibleAppliedRows = appliedRows.filter((r) => r.js !== 0 || r.server !== 0);

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-2xs p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold text-emerald-600 tracking-wide">검증 모드(개발자용) · 서버 교차검증</p>
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
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mx-auto pt-1 cursor-pointer"
          >
            <span>{collapsed ? '자세히보기' : '접기'}</span>
            <span className="text-[11px]">{collapsed ? '∨' : '∧'}</span>
          </button>
          {!collapsed && (
          <>
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

          <div className="pt-1">
            <div className="flex items-end justify-between gap-2 px-1 pb-1.5">
              <p className="text-[12.5px] font-extrabold text-slate-800">세액공제·감면 항목별 비교</p>
              <p className="text-[10.5px] text-slate-400">산출세액 한도 적용 전 산출액 · 0원 항목 생략</p>
            </div>
            <div className={`rounded-xl px-3 py-2 mb-2 text-xs font-bold border ${creditDiffs.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {creditDiffs.length === 0
                ? '✓ 세액공제 항목별 산출액도 두 엔진이 같습니다.'
                : `세액공제 ${creditDiffs.length}개 항목의 산출액이 다릅니다: ${creditDiffs.map((r) => r.label).join(', ')}`}
            </div>
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1fr_1fr_44px] bg-slate-50 text-[11px] font-bold text-slate-500 px-3 py-2">
                <span>항목</span><span className="text-right">화면 엔진</span><span className="text-right">백엔드 엔진</span><span className="text-center">결과</span>
              </div>
              {visibleCreditRows.map((r) => (
                <div
                  key={r.label}
                  className={`grid grid-cols-[1.2fr_1fr_1fr_44px] px-3 py-2 text-xs border-t ${r.total ? 'border-slate-200 bg-slate-50/70 font-bold' : 'border-slate-100'}`}
                >
                  <span className="font-semibold text-slate-700">{r.label}</span>
                  <span className="text-right font-mono text-slate-900">{won(r.js)}</span>
                  <span className="text-right font-mono text-slate-900">{won(r.server)}</span>
                  <span className={`text-center font-bold ${r.same ? 'text-emerald-600' : 'text-amber-600'}`}>{r.same ? '일치' : '차이'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <div className="flex items-end justify-between gap-2 px-1 pb-1.5">
              <p className="text-[12.5px] font-extrabold text-slate-800">산출세액 한도 배분 (적용 순서별 실제 적용액)</p>
              <p className="text-[10.5px] text-slate-400">소득세법 제60조 순서 · 0원 항목 생략</p>
            </div>
            <div className={`rounded-xl px-3 py-2 mb-2 text-xs font-bold border ${appliedDiffs.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {appliedDiffs.length === 0
                ? '✓ 적용 순서와 항목별 실제 적용액도 두 엔진이 같습니다.'
                : `적용액이 다른 항목: ${appliedDiffs.map((r) => r.label).join(', ')}`}
            </div>
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <div className="grid grid-cols-[28px_1.2fr_1fr_1fr_44px] bg-slate-50 text-[11px] font-bold text-slate-500 px-3 py-2">
                <span>순서</span><span>항목</span><span className="text-right">화면 엔진</span><span className="text-right">백엔드 엔진</span><span className="text-center">결과</span>
              </div>
              {visibleAppliedRows.map((r) => (
                <div key={r.label} className="grid grid-cols-[28px_1.2fr_1fr_1fr_44px] px-3 py-2 text-xs border-t border-slate-100">
                  <span className="text-slate-400 font-mono">{r.order}</span>
                  <span className="font-semibold text-slate-700">{r.label}{r.group && <span className="block text-[10px] font-medium text-slate-400">{r.group}</span>}</span>
                  <span className="text-right font-mono text-slate-900">{won(r.js)}</span>
                  <span className="text-right font-mono text-slate-900">{won(r.server)}</span>
                  <span className={`text-center font-bold ${r.same ? 'text-emerald-600' : 'text-amber-600'}`}>{r.same ? '일치' : '차이'}</span>
                </div>
              ))}
            </div>
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
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mx-auto pt-1 cursor-pointer"
          >
            <span>접기</span>
            <span className="text-[11px]">∧</span>
          </button>
          </>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
        <p className="text-[10.5px] text-slate-400 leading-snug">
          서버 자료(업로드 분석·입력·결과)는 마지막 사용 후 30일이 지나면 자동 삭제됩니다.
        </p>
        <button
          type="button"
          onClick={deleteServerData}
          disabled={deleteState === 'deleting'}
          className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
            deleteState === 'confirm' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:text-rose-600'
          }`}
        >
          {deleteState === 'confirm'
            ? '한 번 더 누르면 삭제'
            : deleteState === 'deleting'
            ? '삭제 중...'
            : deleteState === 'done'
            ? '삭제 완료 · 처음 화면으로'
            : deleteState === 'error'
            ? '삭제 실패 · 다시 시도'
            : '내 자료 전체 삭제'}
        </button>
      </div>
    </div>
  );
}
