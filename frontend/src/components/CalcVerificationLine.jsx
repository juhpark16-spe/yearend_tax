import React, { useEffect, useState } from 'react';
import { taxService, SERVER_SESSION_KEY } from '../services/api';
import { recordVerificationMismatch, runServerCrossCheck } from '../utils/serverCrossCheck';

/**
 * 근로자용 계산 검증 한 줄
 * - 결과 화면이 열리면 같은 입력을 백엔드 결정론적 엔진으로 자동 재계산해 비교한다.
 * - 같으면 "✓ 계산검증완료 - 확인OK", 다르면 숫자 없이 "계산검증완료 - 확인필요"만 보여 주고
 *   차이는 개발자용 기록(recordVerificationMismatch)으로 남긴다. 옆에 '서버에 저장된 내 자료 삭제' 버튼.
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

  const status = {
    checking: { text: '계산검증 중...', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
    ok: { text: '✓ 계산검증완료 - 확인OK', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    mismatch: { text: '계산검증완료 - 확인필요', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    unavailable: { text: '계산검증 - 서버 연결 안 됨', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
  }[state];

  return (
    <div className="w-full flex items-center gap-2">
      <div className={`flex-1 min-w-0 rounded-2xl border px-4 py-2.5 text-[12.5px] font-bold truncate ${status.cls}`}>
        {status.text}
      </div>
      <button
        type="button"
        onClick={deleteServerData}
        disabled={deleteState === 'deleting'}
        className={`shrink-0 text-[11px] font-bold px-2.5 py-2.5 rounded-xl border transition cursor-pointer ${
          deleteState === 'confirm' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-500 hover:text-rose-600'
        }`}
      >
        {deleteState === 'confirm' ? '한 번 더 누르면 삭제'
          : deleteState === 'deleting' ? '삭제 중...'
          : deleteState === 'done' ? '서버 자료 삭제됨'
          : deleteState === 'error' ? '삭제 실패 · 다시 시도'
          : '서버에 저장된 내 자료 삭제'}
      </button>
    </div>
  );
}
