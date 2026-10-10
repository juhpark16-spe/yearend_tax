import React, { useState, useEffect } from 'react';
import { taxService } from '../services/api';

/**
 * 7단계 세액 계산 증빙 타임라인/아코디언 컴포넌트 (AuditTrailTimeline)
 * - PRD_v3.0.md, SRS_v3.0.md, API_v1.0.md 완벽 준수
 * - 7단계 (총급여 -> 근로소득금액 -> 과세표준 -> 산출세액 -> 세액공제/감면 -> 결정세액 -> 최종환급금)
 * - 최종 환급금에서 역추적(Reverse Order) 토글 지원
 * - 각 단계별: 단계명, 입력값, 계산식, 계산결과, 적용기준(법령), 사용자용 설명 표시
 * - 0원 상태도 '해당 없음' 설명과 함께 명확히 증빙
 */
export default function AuditTrailTimeline({
  sessionId,
  taxResult,
  defaultExpanded = false,
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isReverse, setIsReverse] = useState(false); // 역추적 모드 토글
  const [expandedItems, setExpandedItems] = useState({});
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | '1~7'

  // 백엔드 API에서 Audit Trail 로그 불러오기 시도
  useEffect(() => {
    let isMounted = true;
    const fetchAuditLogs = async () => {
      if (!sessionId) return;
      try {
        setLoading(true);
        const data = await taxService.getAuditTrail(sessionId);
        if (isMounted && data.logs && data.logs.length > 0) {
          setLogs(data.logs);
          return;
        }
      } catch (err) {
        console.warn('Failed to fetch audit logs from backend, falling back to local simulation data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAuditLogs();
    return () => { isMounted = false; };
  }, [sessionId]);

  // 백엔드 데이터가 없을 때 프론트엔드 세금 계산 결과로부터 7단계 AuditLog 생성
  const effectiveLogs = React.useMemo(() => {
    if (logs.length > 0) return logs;
    if (!taxResult) return [];

    const totalSalary = taxResult.totalSalary || 0;
    const earnedIncome = taxResult.earnedIncome || 0;
    const earnedIncomeDeduction = totalSalary - earnedIncome;
    const taxBase = taxResult.taxBase || 0;
    const totalDeductions = Math.max(0, earnedIncome - taxBase);
    const calculatedTax = taxResult.calculatedTax || 0;
    const finalIncomeTax = taxResult.finalIncomeTax || 0;
    const paidIncomeTax = taxResult.paidIncomeTax || 0;
    const diffTotal = taxResult.diffTotal || (finalIncomeTax - paidIncomeTax);

    return [
      {
        sequence: 1,
        sequence_order: 1,
        step: 1,
        step_name: '총급여/소득 집계',
        calculation_type: 'GROSS_SALARY',
        input_snapshot: { total_salary: totalSalary },
        formula: '총급여액 = 주(현)근무지 과세총급여 + 종(전)근무지 과세총급여 (비과세소득 제외)',
        output_value: totalSalary,
        calculated_amount: totalSalary,
        legal_basis: '소득세법 제14조, 제20조',
        explanation: totalSalary > 0
          ? `2025년 총급여액은 ${totalSalary.toLocaleString()}원입니다.`
          : '등록된 근로소득(총급여)이 없어 0원으로 산정되었습니다.',
      },
      {
        sequence: 2,
        sequence_order: 2,
        step: 2,
        step_name: '근로소득공제 및 근로소득금액',
        calculation_type: 'EARNED_INCOME',
        input_snapshot: { gross_salary: totalSalary },
        formula: '근로소득금액 = 총급여액 - 소득세법 제47조 근로소득공제액(한도 2,000만 원)',
        output_value: earnedIncome,
        calculated_amount: earnedIncome,
        legal_basis: '소득세법 제47조(근로소득공제)',
        explanation: totalSalary > 0
          ? `총급여 ${totalSalary.toLocaleString()}원에서 법정 근로소득공제 ${earnedIncomeDeduction.toLocaleString()}원을 차감하여 근로소득금액은 ${earnedIncome.toLocaleString()}원입니다.`
          : '총급여가 0원이므로 근로소득공제 및 근로소득금액이 0원입니다.',
      },
      {
        sequence: 3,
        sequence_order: 3,
        step: 3,
        step_name: '종합소득공제 및 과세표준',
        calculation_type: 'TAXABLE_STANDARD',
        input_snapshot: { earned_income: earnedIncome, deductions_total: totalDeductions },
        formula: '과세표준 = max(0, 근로소득금액 - 종합소득공제합계 + 종합한도초과액)',
        output_value: taxBase,
        calculated_amount: taxBase,
        legal_basis: '소득세법 제48조~제52조, 조특법 제132조의2',
        explanation: earnedIncome > 0
          ? `근로소득금액 ${earnedIncome.toLocaleString()}원에서 소득공제 합계 ${totalDeductions.toLocaleString()}원을 공제하여 과세표준 ${taxBase.toLocaleString()}원이 산출되었습니다.`
          : '소득금액이 0원이므로 과세표준은 0원입니다.',
      },
      {
        sequence: 4,
        sequence_order: 4,
        step: 4,
        step_name: '산출세액 계산',
        calculation_type: 'CALCULATED_TAX',
        input_snapshot: { tax_base: taxBase },
        formula: '산출세액 = 과세표준 × 2025년 8단계 누진세율(6%~45%) - 누진공제액',
        output_value: calculatedTax,
        calculated_amount: calculatedTax,
        legal_basis: '소득세법 제55조(세율)',
        explanation: taxBase > 0
          ? `과세표준 ${taxBase.toLocaleString()}원에 대해 법정 누진세율을 적용하여 산출세액 ${calculatedTax.toLocaleString()}원이 산출되었습니다.`
          : '과세표준이 0원이므로 산출세액은 0원입니다.',
      },
      {
        sequence: 5,
        sequence_order: 5,
        step: 5,
        step_name: '세액감면 및 세액공제 산출',
        calculation_type: 'TAX_CREDITS_TOTAL',
        input_snapshot: { calculated_tax: calculatedTax },
        formula: '산출세액 - 중소기업청년감면(90%) - 근로소득/자녀/혼인/연금/특별세액공제(또는 표준공제 13만)',
        output_value: Math.max(0, calculatedTax - finalIncomeTax),
        calculated_amount: Math.max(0, calculatedTax - finalIncomeTax),
        legal_basis: '소득세법 제59조, 제59조의2, 제59조의3, 제59조의4, 조특법 제30조',
        explanation: calculatedTax > 0
          ? `산출세액 범위 내에서 법정 감면 및 세액공제 총 ${(calculatedTax - finalIncomeTax).toLocaleString()}원이 차감 적용되었습니다.`
          : '산출세액이 0원이므로 추가 공제할 세액이 없습니다.',
      },
      {
        sequence: 6,
        sequence_order: 6,
        step: 6,
        step_name: '결정세액 확정',
        calculation_type: 'DECISION_TAX',
        input_snapshot: { calculated_tax: calculatedTax, credits: Math.max(0, calculatedTax - finalIncomeTax) },
        formula: '결정세액 = max(0, 산출세액 - 세액감면 - 세액공제)',
        output_value: finalIncomeTax,
        calculated_amount: finalIncomeTax,
        legal_basis: '소득세법 제137조(근로소득세액에 대한 연말정산)',
        explanation: finalIncomeTax > 0
          ? `산출세액에서 감면 및 공제를 차감한 최종 2025년도 소득세 결정세액은 ${finalIncomeTax.toLocaleString()}원입니다.`
          : '세액공제 및 감면 적용 결과 최종 결정세액은 0원(전액 면제)입니다.',
      },
      {
        sequence: 7,
        sequence_order: 7,
        step: 7,
        step_name: '기납부세액 및 최종 환급/추가납부세액',
        calculation_type: 'FINAL_REFUND',
        input_snapshot: { final_decision_tax: finalIncomeTax, prepaid_tax: paidIncomeTax },
        formula: '차감징수세액 = 결정세액 - 기납부세액 (음수: 환급, 양수: 추가납부)',
        output_value: diffTotal,
        calculated_amount: diffTotal,
        legal_basis: '소득세법 제137조(연말정산 차감징수)',
        explanation: diffTotal <= 0
          ? `기납부세액(${paidIncomeTax.toLocaleString()}원)이 결정세액(${finalIncomeTax.toLocaleString()}원)보다 많아 ${Math.abs(diffTotal).toLocaleString()}원을 돌려받습니다(환급).`
          : `결정세액(${finalIncomeTax.toLocaleString()}원)이 기납부세액(${paidIncomeTax.toLocaleString()}원)보다 많아 ${diffTotal.toLocaleString()}원을 추가 납부해야 합니다.`,
      },
    ];
  }, [logs, taxResult]);

  const toggleExpand = (idx) => {
    setExpandedItems(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleAll = (expand) => {
    const newState = {};
    effectiveLogs.forEach((_, idx) => {
      newState[idx] = expand;
    });
    setExpandedItems(newState);
  };

  // 정방향 또는 역추적 정렬
  const displayedLogs = React.useMemo(() => {
    let items = [...effectiveLogs];
    if (activeFilter !== 'ALL') {
      items = items.filter(item => String(item.step) === activeFilter);
    }
    return isReverse ? items.reverse() : items;
  }, [effectiveLogs, isReverse, activeFilter]);

  if (effectiveLogs.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-4">
      {/* 상단 컨트롤러 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>7단계 세액 계산 증빙 (Audit Trail)</span>
              <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                추적 검증
              </span>
            </h3>
          </div>
          <p className="text-[11.5px] text-slate-500">
            최종 환급금이 산출된 모든 근거와 법정 산식을 단계별로 역추적·검증할 수 있습니다.
          </p>
        </div>

        {/* 액션 버튼들 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 역추적 모드 토글 버튼 */}
          <button
            type="button"
            onClick={() => setIsReverse(!isReverse)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 border cursor-pointer ${
              isReverse
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="환급금부터 총급여까지 역방향으로 추적합니다"
          >
            <span>{isReverse ? '🔄 역추적 모드 (환급금 → 총급여)' : '➡️ 정방향 모드 (총급여 → 환급금)'}</span>
          </button>

          {/* 전체 펼침/접힘 토글 */}
          <button
            type="button"
            onClick={() => toggleAll(Object.keys(expandedItems).length < effectiveLogs.length)}
            className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
          >
            {Object.keys(expandedItems).length < effectiveLogs.length ? '모두 펼치기' : '모두 접기'}
          </button>
        </div>
      </div>

      {/* 단계별 필터 칩 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveFilter('ALL')}
          className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition shrink-0 ${
            activeFilter === 'ALL'
              ? 'bg-indigo-600 text-white font-bold'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          전체 보기 ({effectiveLogs.length})
        </button>
        {[1, 2, 3, 4, 5, 6, 7].map(stepNum => (
          <button
            key={stepNum}
            type="button"
            onClick={() => setActiveFilter(String(stepNum))}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition shrink-0 ${
              activeFilter === String(stepNum)
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Step {stepNum}
          </button>
        ))}
      </div>

      {/* 단계별 타임라인 아코디언 리스트 */}
      <div className="space-y-2.5 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-100">
        {displayedLogs.map((log, idx) => {
          const isExpanded = expandedItems[idx] ?? defaultExpanded;
          const stepNum = log.step || 1;
          const amount = log.output_value ?? log.calculated_amount ?? 0;
          const isZero = amount === 0;

          return (
            <div
              key={log.id || `${log.sequence_order}-${idx}`}
              className="relative pl-8 transition-all"
            >
              {/* 스텝 번호 배지 */}
              <div
                className={`absolute left-0 top-3.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-2xs border ${
                  stepNum === 7
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : stepNum === 5
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800 text-white border-slate-600'
                }`}
              >
                {stepNum}
              </div>

              {/* 아코디언 카드 헤더 */}
              <div
                onClick={() => toggleExpand(idx)}
                className={`rounded-xl border p-3 cursor-pointer transition select-none ${
                  isExpanded
                    ? 'bg-indigo-50/40 border-indigo-200 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      Step {stepNum}
                    </span>
                    <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                      {log.step_name}
                    </h4>
                    {isZero && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                        해당없음 (0원)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs sm:text-[13px] font-extrabold font-mono ${
                        stepNum === 7
                          ? amount <= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                          : 'text-slate-900'
                      }`}
                    >
                      {stepNum === 7
                        ? amount <= 0
                          ? `(-)${Math.abs(amount).toLocaleString()}원 (환급)`
                          : `(+)${amount.toLocaleString()}원 (납부)`
                        : `${amount.toLocaleString()}원`}
                    </span>
                    <span className="text-slate-400 text-xs font-bold transform transition-transform duration-200">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* 한 줄 요약 설명 */}
                <p className="text-[11.5px] text-slate-600 pt-1 line-clamp-1">
                  {log.explanation || log.legal_formula}
                </p>

                {/* 아코디언 상세 영역 */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2.5 text-xs">
                    {/* 1. 사용자용 설명 */}
                    {log.explanation && (
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/60 space-y-1">
                        <div className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                          <span>💡 산출 근거 및 설명</span>
                        </div>
                        <p className="text-[12px] text-slate-800 leading-relaxed">
                          {log.explanation}
                        </p>
                      </div>
                    )}

                    {/* 2. 적용 계산 공식 */}
                    {(log.formula || log.legal_formula) && (
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 space-y-1">
                        <div className="text-[11px] font-bold text-slate-700">
                          📐 법정 적용 계산식
                        </div>
                        <code className="text-[11.5px] font-mono text-slate-800 block break-all">
                          {log.formula || log.legal_formula}
                        </code>
                      </div>
                    )}

                    {/* 3. 적용 법령 기준 */}
                    {log.legal_basis && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="font-bold text-slate-600">⚖️ 적용 기준:</span>
                        <span>{log.legal_basis}</span>
                      </div>
                    )}

                    {/* 4. 입력값 스냅샷 */}
                    {log.input_snapshot && Object.keys(log.input_snapshot).length > 0 && (
                      <div className="pt-1 border-t border-slate-100">
                        <div className="text-[10.5px] font-bold text-slate-500 mb-1">
                          📥 계산 입력값 스냅샷
                        </div>
                        <div className="bg-slate-900 text-slate-100 p-2 rounded-md font-mono text-[10.5px] overflow-x-auto max-h-32">
                          <pre>{JSON.stringify(log.input_snapshot, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
