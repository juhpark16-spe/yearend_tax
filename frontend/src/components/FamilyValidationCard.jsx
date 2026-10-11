import React, { useState } from 'react';
import { serverErrorMessage, taxService, withServerSession } from '../services/api';
import { buildValidationRequest, compareValidation } from '../utils/serverInputs';
import { getSecureItem } from '../utils/secureStorage';

const RELATION_LABEL = { SELF: '본인', SPOUSE: '배우자', CHILD: '직계비속', PARENT: '직계존속', SIBLING: '형제자매' };

/**
 * 부양가족 서버 규칙검증 카드 (POST /tax/validate)
 * - 백엔드 규칙 엔진이 나이·소득 요건, 중복공제 위험, 근무지 합산, (등본이 있으면) 세대원 대조를 다시 판정한다.
 * - 화면 판정(기본공제 신청 여부)과 서버 판정을 인별로 나란히 보여 주고 다른 곳을 표시한다.
 * - 주민등록번호 원문은 보내지 않는다 (buildValidationRequest 참고).
 */
export default function FamilyValidationCard({ familyList = [], userName = '' }) {
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async () => {
    setState('running');
    setError('');
    try {
      const withholdingData = getSecureItem('selftax_withholding_data');
      const previousJobs = getSecureItem('selftax_previous_jobs', []) || [];
      const { req, res } = await withServerSession(async (sessionId) => {
        const body = buildValidationRequest({ sessionId, familyList, withholdingData, previousJobs, userName });
        return { req: body, res: await taxService.validateTax(body) };
      });
      setRows(compareValidation(req, res));
      setResult(res);
      setState('done');
    } catch (e) {
      setError(serverErrorMessage(e));
      setState('error');
    }
  };

  const errors = result?.errors || [];
  const warnings = result?.warnings || [];
  const blocked = rows.filter((r) => r.screenClaimed && !r.serverEligible);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold text-emerald-600 tracking-wide">서버 규칙검증</p>
          <h3 className="text-[14px] font-extrabold text-slate-900 leading-snug">부양가족 공제 요건을 다시 확인해 봐요</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">나이·소득 요건, 이중공제 위험, 근무지 합산을 백엔드 규칙 엔진이 판정합니다.</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state === 'running' || familyList.length === 0}
          className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-white transition ${state === 'running' ? 'bg-slate-400 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'}`}
        >
          {state === 'running' ? '검증 중...' : state === 'done' ? '다시 검증' : '요건 검증'}
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

      {state === 'done' && (
        <>
          <div className={`rounded-xl px-3 py-2 text-xs font-bold border ${errors.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
            {errors.length === 0
              ? '✓ 기본공제를 신청한 가족 모두 요건을 충족합니다.'
              : `기본공제 신청 가족 중 ${blocked.length || errors.length}건이 요건을 충족하지 않습니다.`}
          </div>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] bg-slate-50 text-[11px] font-bold text-slate-500 px-3 py-2">
              <span>이름</span><span>관계</span><span className="text-center">화면</span><span className="text-center">서버</span>
            </div>
            {rows.map((r, i) => (
              <div key={`${r.name}-${i}`} className="px-3 py-2 text-xs border-t border-slate-100">
                <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] items-center">
                  <span className="font-semibold text-slate-800 truncate">{r.name}{r.age !== null && r.relation !== 'SELF' ? ` (만 ${r.age}세)` : ''}</span>
                  <span className="text-slate-500">{RELATION_LABEL[r.relation] || r.relation}</span>
                  <span className="text-center text-slate-700">{r.screenClaimed ? '신청' : '미신청'}</span>
                  <span className={`text-center font-bold ${r.serverEligible ? 'text-emerald-600' : 'text-rose-600'}`}>{r.serverEligible ? '요건 충족' : '요건 미충족'}</span>
                </div>
                {r.screenClaimed && !r.serverEligible && r.reasons.map((reason) => (
                  <p key={reason} className="mt-1 text-[11px] text-rose-600">· {reason}</p>
                ))}
                {!r.screenClaimed && r.serverEligible && r.relation !== 'SELF' && (
                  <p className="mt-1 text-[11px] text-slate-500">· 요건은 충족하지만 기본공제를 신청하지 않았습니다 (다른 가족이 공제받는 경우라면 그대로 두세요).</p>
                )}
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 space-y-1">
              <p className="text-[11px] font-bold text-amber-800">확인해 주세요</p>
              {warnings.map((w) => <p key={w} className="text-[11px] text-amber-800 leading-relaxed">· {w}</p>)}
            </div>
          )}
          <p className="text-[10.5px] text-slate-400">주민등록번호 원문은 서버로 보내지 않으며, 생년월일·관계·소득초과 여부만 사용합니다.</p>
        </>
      )}
    </div>
  );
}
