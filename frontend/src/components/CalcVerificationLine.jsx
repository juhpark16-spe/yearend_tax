import React, { useEffect, useState } from 'react';
import { taxService, SERVER_SESSION_KEY } from '../services/api';
import { recordVerificationMismatch, runServerCrossCheck } from '../utils/serverCrossCheck';

/** "왜 이 금액인가요?" 해설(AiExplainCard)을 열도록 요청 */
export const EXPLAIN_EVENT = 'selftax:open-explain';

/**
 * 근로자용 계산 검증 한 줄
 * - 결과 화면이 열리면 같은 입력을 백엔드 결정론적 엔진으로 자동 재계산해 비교한다.
 * - 같으면 "✓ 계산 검증 완료" 한 줄(누르면 "왜 이 금액인가요?" 해설), 다르면 숫자 없이 "확인이 필요합니다"만 보여 주고
 *   차이는 개발자용 기록(recordVerificationMismatch)으로 남긴다.
 * - 비교표·감사 로그 원문은 검증 모드(개발자용, ?verify=1)의 서버 교차검증 카드에서만 보인다.
 */
export default function CalcVerificationLine({ jsResult, userName = '' }) {
  const [state, setState] = useState('checking'); // checking | ok | mismatch | unavailable
  const runKey = JSON.stringify([jsResult?.totalSalary, jsResult?.taxBase, jsResult?.finalIncomeTax, jsResult?.diffIncomeTax, jsResult?.diffLocalTax]);

  useEffect(() => {
    // 결과 금액이 바뀔 때만 다시 검증 (runKey)
    if (!jsResult) return undefined;
    let alive = true;
    setState('checking');
    runServerCrossCheck({ jsResult, userName })
      .then(({ allSame, diffs }) => {
        if (!alive) return;
        if (allSame) {
          setState('ok');
        } else {
          recordVerificationMismatch(diffs, { refund: jsResult?.diffIncomeTax });
          setState('mismatch');
        }
      })
      .catch(() => { if (alive) setState('unavailable'); });
    return () => { alive = false; };
  }, [runKey]);

  // 서버에 저장된 내 자료 삭제 (한 번 더 눌러야 삭제되는 2단계 버튼)
  const [deleteState, setDeleteState] = useState('idle'); // idle | confirm | deleting | done | error
  const deleteServerData = async () => {
    if (deleteState !== 'confirm') { setDeleteState('confirm'); return; }
    setDeleteState('deleting');
    try {
      await taxService.deleteMyServerData();
      try { localStorage.removeItem(SERVER_SESSION_KEY); } catch { /* ignore */ }
      setDeleteState('done');
    } catch {
      setDeleteState('error');
    }
  };

  const openExplain = () => window.dispatchEvent(new CustomEvent(EXPLAIN_EVENT, { detail: { key: '근로소득' } }));

  return (
    <div className="w-full space-y-1.5">
      {state === 'ok' && (
        <button
          type="button"
          onClick={openExplain}
          className="w-full text-left rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70 px-4 py-3 transition cursor-pointer"
        >
          <p className="text-[12.5px] font-bold text-emerald-800 leading-snug">✓ 계산 검증 완료 — 서로 독립된 두 계산이 같은 결과를 냈습니다</p>
          <p className="text-[11px] font-semibold text-emerald-700/80 mt-0.5">왜 이 금액인가요? ›</p>
        </button>
      )}
      {state === 'mismatch' && (
        <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[12.5px] font-bold text-amber-800">확인이 필요합니다</p>
        </div>
      )}
      {state === 'checking' && (
        <p className="text-[11.5px] text-slate-400 px-1">계산 결과를 검증하고 있어요...</p>
      )}
      {state === 'unavailable' && (
        <p className="text-[11.5px] text-slate-400 px-1">지금은 계산 검증을 할 수 없습니다. 잠시 후 다시 열어 주세요.</p>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10.5px] text-slate-400 leading-snug">서버 자료는 마지막 사용 후 일정 기간이 지나면 자동 삭제됩니다.</p>
        <button
          type="button"
          onClick={deleteServerData}
          disabled={deleteState === 'deleting'}
          className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
            deleteState === 'confirm' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:text-rose-600'
          }`}
        >
          {deleteState === 'confirm' ? '한 번 더 누르면 삭제'
            : deleteState === 'deleting' ? '삭제 중...'
            : deleteState === 'done' ? '서버 자료 삭제됨'
            : deleteState === 'error' ? '삭제 실패 · 다시 시도'
            : '서버에 저장된 내 자료 삭제'}
        </button>
      </div>
    </div>
  );
}
