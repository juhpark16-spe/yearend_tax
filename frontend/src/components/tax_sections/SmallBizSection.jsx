import React, { useState, useEffect } from 'react';
import { calculateEarnedIncomeDeduction } from '../../utils/taxCalculator';

/**
 * [소기업소상공인] 상세 화면 컴포넌트
 * 1. 소기업소상공인공제 조회 (small_biz_view) - 파란색 히어로 카드, 요건 체크리스트 배너, 빈 상태/+자료입력, 국세청/기타자료 목록
 * 2. 소기업소상공인 체크리스트 (small_biz_checklist) - 체크1,2,3 요건 판정, 네/아니오, 공제불가 모달
 * 3. 소기업소상공인 수정 (small_biz_edit) - 카드형 목록, 수정/삭제 버튼, 50:50 하단 액션
 * 4. 소기업소상공인 추가/수정 (small_biz_add) - 공제구분, 사업자등록번호, 사업장명, 납입금액
 */
export default function SmallBizSection({
  viewMode,
  setViewMode,
  onBack,
  onOpenGuide,
  familyMembers = [],
  workerName,
  showAlert,
  setToastMsg,
  setShowToast,
  items = [],
  setItems,
  checklistAnswer,
  setChecklistAnswer,
  hometaxData,
  totalSalary = 0,
}) {
  const [showProofModal, setShowProofModal] = useState(false);
  const [showChecklistNoticeModal, setShowChecklistNoticeModal] = useState(false);
  const [showIneligibleModal, setShowIneligibleModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const toggleAccordion = (id) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  // 폼 입력 상태
  const selfMember = familyMembers.find((m) => m.isSelf || m.relation === '본인');
  const defaultWorkerName = (workerName || selfMember?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
  const [editingItemId, setEditingItemId] = useState(null);
  const [formName, setFormName] = useState(defaultWorkerName);
  const [formType, setFormType] = useState('소기업·소상공인 공제부금 (노란우산공제)');
  const [formBizType, setFormBizType] = useState('법인대표자'); // '법인대표자' | '개인사업자' (요구사항 7)
  const [formJoinPeriod, setFormJoinPeriod] = useState('2016년 이후 가입');
  const [formAccount, setFormAccount] = useState(''); // 공제계약번호 / 증서번호 (요구사항 6)
  const [formAmount, setFormAmount] = useState('');

  // familyMembers 또는 workerName 변경 시 폼 이름 동기화
  useEffect(() => {
    if (!editingItemId) {
      const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
      setFormName((workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim());
    }
  }, [familyMembers, workerName, editingItemId]);

  // 근로소득금액 산출 (총급여액 - 근로소득공제)
  const earnedIncomeDeduction = React.useMemo(() => {
    return calculateEarnedIncomeDeduction(Number(totalSalary) || 0);
  }, [totalSalary]);

  const earnedIncomeAmount = React.useMemo(() => {
    return Math.max(0, (Number(totalSalary) || 0) - earnedIncomeDeduction);
  }, [totalSalary, earnedIncomeDeduction]);

  // 사업(근로)소득금액에 따른 2016년 이후 가입자 법정 공제한도 결정 (조특법 제86조의3)
  // - 4천만원 이하 : 500만원
  // - 4천만원~1억원 : 300만원
  // - 1억원 초과 : 200만원
  const { statutoryLimit, limitTierText } = React.useMemo(() => {
    if (earnedIncomeAmount <= 40000000) {
      return { statutoryLimit: 5000000, limitTierText: '4천만원 이하 (한도 500만원)' };
    } else if (earnedIncomeAmount <= 100000000) {
      return { statutoryLimit: 3000000, limitTierText: '4천만원~1억원 (한도 300만원)' };
    } else {
      return { statutoryLimit: 2000000, limitTierText: '1억원 초과 (한도 200만원)' };
    }
  }, [earnedIncomeAmount]);

  // 소기업소상공인 한도 계산 맵 (세법 요건: 개인사업자는 공제 가능, 법인대표자는 총급여 7천만원 이하만 공제 가능, 근로소득금액 구간별 한도 순차 차감)
  const limitMap = React.useMemo(() => {
    const isOverSalary = Number(totalSalary) > 70000000;
    let remaining = statutoryLimit;
    const map = {};

    items.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const bType = item.bizType || '법인대표자';
      const jPeriod = item.joinPeriod || '2016년 이후 가입';

      // 1. 법인대표자이면서 총급여 7천만원 초과 시 공제 제외
      if (bType === '법인대표자' && isOverSalary) {
        map[item.id] = {
          limitAmount: 0,
          rawAmount: raw,
          limitTierText,
          ineligibleReason: '법인대표자 총급여 7천만원 초과 제외',
        };
        return;
      }

      // 2. 2015년 이전 가입 종전 규정(일괄 300만원 한도) vs 2016년 이후 개정 규정
      const maxForThisItem = jPeriod === '2015년 이전 가입' ? Math.min(3000000, remaining) : remaining;

      // 3. 정상 공제 가능분 산출
      const allowed = Math.min(raw, Math.max(0, maxForThisItem));
      remaining -= allowed;
      map[item.id] = {
        limitAmount: allowed,
        rawAmount: raw,
        limitTierText: jPeriod === '2015년 이전 가입' ? '2015년 이전 가입 (한도 300만원)' : limitTierText,
        ineligibleReason: null,
      };
    });

    return map;
  }, [items, totalSalary, statutoryLimit, limitTierText]);

  const totalLimitAmount = React.useMemo(() => {
    return Object.values(limitMap).reduce((acc, curr) => acc + (curr.limitAmount || 0), 0);
  }, [limitMap]);

  // 금액 계산 (전체 입력 납입금액 합계)
  const totalAmount = items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  // 국세청 PDF 업로드 자료에서 소기업소상공인 가입구분 및 상세정보 감지
  const getDetectedHometaxSmallBiz = () => {
    let sDetails = hometaxData?.small_biz_details || hometaxData?.summary?.small_biz_details;
    if (Array.isArray(sDetails) && sDetails.length > 0) {
      return sDetails[0];
    }
    const persons = hometaxData?.matchedPersons || hometaxData?.persons || [];
    for (const p of persons) {
      if (Array.isArray(p.small_biz_details) && p.small_biz_details.length > 0) {
        return p.small_biz_details[0];
      }
    }
    try {
      const saved = localStorage.getItem('hometax_extracted_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        sDetails = parsed?.small_biz_details || parsed?.summary?.small_biz_details;
        if (Array.isArray(sDetails) && sDetails.length > 0) {
          return sDetails[0];
        }
        if (Array.isArray(parsed?.persons)) {
          for (const p of parsed.persons) {
            if (Array.isArray(p.small_biz_details) && p.small_biz_details.length > 0) {
              return p.small_biz_details[0];
            }
          }
        }
        const rawStr = JSON.stringify(parsed);
        if (rawStr.includes('소기업') || rawStr.includes('공제부금') || rawStr.includes('노란우산')) {
          let bType = '법인대표자';
          if (rawStr.includes('개인사업자')) bType = '개인사업자';
          else if (rawStr.includes('법인대표자') || rawStr.includes('법인 대표자')) bType = '법인대표자';
          return { bizType: bType };
        }
      }
    } catch {}
    return null;
  };

  // 추가 폼 열기 (요청사항: 기본사항 성명 로그인 근로자 기준)
  const handleOpenAdd = () => {
    setEditingItemId(null);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanSelfName = (workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    const detected = getDetectedHometaxSmallBiz();
    setFormName(cleanSelfName);
    setFormType('소기업·소상공인 공제부금 (노란우산공제)');
    setFormBizType(detected?.bizType || '법인대표자');
    setFormJoinPeriod(detected?.joinPeriod || '2016년 이후 가입');
    setFormAccount('');
    setFormAmount('');
    setViewMode('small_biz_add');
  };

  // 수정 폼 열기 (요청사항: 국세청자료 PDF업로드 했을 때 가입구분을 확인해서 체크)
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanItemName = (item.name || workerName || self?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanItemName);
    setFormType(item.type || '소기업·소상공인 공제부금 (노란우산공제)');
    
    // 국세청자료(isNts)이거나 가입구분이 필요한 경우 PDF 업로드 가입구분을 확인
    const detected = getDetectedHometaxSmallBiz();
    let targetBizType = item.bizType;
    if (item.isNts || item.source === 'nts' || !targetBizType) {
      targetBizType = detected?.bizType || item.bizType || '법인대표자';
    }
    setFormBizType(targetBizType || '법인대표자');
    setFormJoinPeriod(item.joinPeriod || detected?.joinPeriod || '2016년 이후 가입');
    setFormAccount(item.contractNo || item.account || '');
    setFormAmount(item.amount ? Number(item.amount).toLocaleString() : '');
    setViewMode('small_biz_add');
  };

  // 저장 핸들러
  const handleSave = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanFormName = (formName || workerName || '홍길동').replace(/\(.*?\)/g, '').trim();

    if (cleanAmount <= 0) {
      showAlert('당해년도 납입금액을 입력해주세요.');
      return;
    }

    const payload = {
      name: cleanFormName,
      relation: '본인',
      type: formType,
      bizType: formBizType, // '법인대표자' | '개인사업자' (요구사항 7)
      joinPeriod: formJoinPeriod,
      account: formAccount.trim(), // 공제계약번호/증서번호 (요구사항 6)
      contractNo: formAccount.trim(),
      amount: cleanAmount,
    };

    if (editingItemId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );
      setToastMsg('소기업소상공인 공제자료가 수정되었습니다.');
    } else {
      const newItem = {
        id: `sbiz_${Date.now()}`,
        ...payload,
        isNts: false,
        source: 'other',
      };
      setItems((prev) => [...prev, newItem]);
      setToastMsg('소기업소상공인 공제자료가 등록되었습니다.');
    }

    setViewMode('small_biz_edit');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 삭제 핸들러
  const handleDelete = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. 소기업소상공인공제 조회 화면 (small_biz_view)                           */}
      {/* ========================================================================= */}
      {viewMode === 'small_biz_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 소기업소상공인공제 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">소기업소상공인공제 조회</span>
            </button>

            <button
              type="button"
              onClick={onOpenGuide}
              className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
              title="AI 공제 가이드"
            >
              <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
              <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 체크리스트 안내 배너 */}
            <div className="bg-[#EEF2FF] border border-indigo-100/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div>
                <div className="flex items-center gap-1.5">
                  {checklistAnswer === 'yes' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      ✓
                    </span>
                  )}
                  <div className="font-bold text-[13px] text-slate-800 leading-snug">
                    {checklistAnswer === 'yes' ? '소기업소상공인공제 요건 충족' : '노란우산공제 납입 중이신가요?'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('small_biz_checklist')}
                  className="mt-2 py-1 px-3 rounded-lg bg-white border border-indigo-200 text-[#4F46E5] text-[11.5px] font-bold shadow-2xs hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1"
                >
                  <span>{checklistAnswer === 'yes' ? '체크리스트 재확인' : '체크리스트 진행하기'}</span>
                  <span className="text-[10px]">›</span>
                </button>
              </div>

              {/* 노란우산 SVG 일러스트 */}
              <div className="w-16 h-14 flex items-center justify-center">
                <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
                  <path d="M12 28C12 16.9543 20.9543 8 32 8C43.0457 8 52 16.9543 52 28H12Z" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5" />
                  <path d="M32 8V38C32 40.2091 30.2091 42 28 42C25.7909 42 24 40.2091 24 38" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="32" cy="7" r="2" fill="#F59E0B" />
                </svg>
              </div>
            </div>

            {/* 소기업소상공인 공제부금 명세 히어로 카드 */}
            <div className={`w-full ${totalAmount > 0 ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-3.5' : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'} rounded-2xl text-white shadow-md transition-all`}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold tracking-tight">소기업소상공인 공제부금 명세</span>
                  <span
                    onClick={onOpenGuide}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="소기업소상공인공제 안내"
                  >
                    ⓘ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProofModal(true)}
                  className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition cursor-pointer flex items-center gap-1 border border-white/30 shadow-2xs"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>

              {totalAmount > 0 && (
                <>
                  <div className="border-t border-white/20 pt-1" />
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white/90">☂️</span>
                        <span className="text-sm font-semibold tracking-tight">공제부금 납입합계</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-base font-bold font-mono tracking-tight">
                          {totalLimitAmount.toLocaleString()}원
                        </span>
                        {totalAmount > totalLimitAmount && (
                          <span className="text-[10px] text-amber-200">
                            {totalLimitAmount === 0 && Number(totalSalary) > 70000000 && items.every((i) => (i.bizType || '법인대표자') === '법인대표자')
                              ? '(법인대표자 총급여 7,000만원 초과 제외)'
                              : `(총 납입 ${totalAmount.toLocaleString()}원 / 한도 ${Math.floor(statutoryLimit / 10000)}만원 [${limitTierText}] 적용)`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>소기업·소상공인 공제부금 (노란우산)</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalLimitAmount.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 데이터 유무 분기 */}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 space-y-3.5">
                <div className="relative w-32 h-32 rounded-full bg-[#EEF4FD] flex items-center justify-center shadow-inner">
                  <div className="w-16 h-20 bg-white rounded-xl shadow-xs border border-slate-200/80 p-2.5 flex flex-col justify-between">
                    <div className="w-full h-5 rounded-md bg-[#AECDFB]/60" />
                    <div className="space-y-1.5 pb-1">
                      <div className="w-full h-1.5 bg-slate-200/80 rounded" />
                      <div className="w-4/5 h-1.5 bg-slate-200/80 rounded" />
                    </div>
                  </div>
                  <div className="absolute bottom-5 right-7 w-6 h-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-sm font-bold shadow-md border-2 border-white">
                    +
                  </div>
                </div>

                <div className="text-[13px] font-semibold text-slate-500">
                  조회할 자료가 없습니다.
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (checklistAnswer !== 'yes') {
                        setShowChecklistNoticeModal(true);
                      } else {
                        handleOpenAdd();
                      }
                    }}
                    className="px-5 py-2 rounded-lg border border-indigo-300 text-[#4F46E5] bg-white hover:bg-indigo-50/60 font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <span>+ 자료입력</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                {/* 1. 국세청자료 인별 아코디언 */}
                {items.filter((i) => i.isNts).length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          items
                            .filter((i) => i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName) => {
                        const memberItems = items.filter(
                          (i) => i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const memberTotal = memberItems.reduce((acc, it) => acc + (limitMap[it.id]?.limitAmount ?? Number(it.amount || 0)), 0);
                        const isExpanded = !!expandedIds[`nts_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleAccordion(`nts_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역: 상세내역 없이 이름만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-slate-600">
                                        {memberName}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-sans font-medium">
                                        {it.bizType || '법인대표자'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {limitMap[it.id]?.ineligibleReason && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 font-sans font-medium">
                                          {limitMap[it.id].ineligibleReason}
                                        </span>
                                      )}
                                      <span className="font-bold font-mono text-slate-900 text-[13px]">
                                        {(limitMap[it.id]?.limitAmount ?? Number(it.amount || 0)).toLocaleString()}원
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. 기타자료 인별 아코디언 */}
                {items.filter((i) => !i.isNts).length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-semibold text-slate-400">기타자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          items
                            .filter((i) => !i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName) => {
                        const memberItems = items.filter(
                          (i) => !i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const memberTotal = memberItems.reduce((acc, it) => acc + (limitMap[it.id]?.limitAmount ?? Number(it.amount || 0)), 0);
                        const isExpanded = !!expandedIds[`other_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-indigo-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleAccordion(`other_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역: 상세내역 없이 이름만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-slate-600">
                                        {memberName}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-sans font-medium">
                                        {it.bizType || '법인대표자'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {limitMap[it.id]?.ineligibleReason && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 font-sans font-medium">
                                          {limitMap[it.id].ineligibleReason}
                                        </span>
                                      )}
                                      <span className="font-bold font-mono text-slate-900 text-[13px]">
                                        {(limitMap[it.id]?.limitAmount ?? Number(it.amount || 0)).toLocaleString()}원
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 하단 고정 액션 버튼 */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer text-center"
            >
              목록보기
            </button>
            <button
              type="button"
              onClick={() => {
                if (checklistAnswer !== 'yes' && items.length === 0) {
                  setShowChecklistNoticeModal(true);
                } else {
                  setViewMode('small_biz_edit');
                }
              }}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
            >
              자료 수정/추가
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 소기업소상공인 요건 체크리스트 화면 (small_biz_checklist)                 */}
      {/* ========================================================================= */}
      {viewMode === 'small_biz_checklist' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('small_biz_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">소기업소상공인 요건 체크리스트</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <div className="font-bold text-[#4F46E5] text-[12.5px]">
                ⓘ 소기업소상공인 공제부금(노란우산) 소득공제를 받으시나요?
              </div>
              <p className="text-[11.5px] text-slate-500">
                아래 요건을 모두 충족해야 공제가 가능해요.<br />
                한 개라도 충족되지 않으면 '아니오'를 선택해주세요.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-5 text-xs">
              <div className="space-y-1.5">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크1
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  중소기업중앙회가 운영하는 노란우산공제에 가입하여<br />
                  부금을 정상 납입하고 있어야 해요.
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크2
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  법인의 대표자(총급여액 7천만 원 이하)이거나<br />
                  개인사업을 겸업하는 근로소득자여야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (일반 근로자는 노란우산공제 공제 대상이 아닙니다)
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크3
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  해당 과세연도에 실제로 부금을 납입했거나<br />
                  연체 없는 정상 납입액이 존재해야 해요.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white border-t border-slate-200 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">위 요건을 모두 충족하나요?</span>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setChecklistAnswer('yes')}
                    className="flex items-center gap-1.5 cursor-pointer text-slate-700 bg-transparent border-none p-0 outline-none"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        checklistAnswer === 'yes' ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checklistAnswer === 'yes' && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>네</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChecklistAnswer('no')}
                    className="flex items-center gap-1.5 cursor-pointer text-slate-700 bg-transparent border-none p-0 outline-none"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        checklistAnswer === 'no' ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checklistAnswer === 'no' && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>아니오</span>
                  </button>
                </div>
              </div>

              <div className="pt-0.5 text-[11px] font-semibold">
                {checklistAnswer === null && (
                  <span className="text-amber-500">아직 체크리스트를 진행하지 않았어요.</span>
                )}
                {checklistAnswer === 'yes' && (
                  <span className="text-emerald-600">공제요건을 모두 충족했어요.</span>
                )}
                {checklistAnswer === 'no' && (
                  <span className="text-rose-500">공제요건을 충족하지 못했어요.</span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (checklistAnswer === 'no') {
                  setShowIneligibleModal(true);
                } else if (checklistAnswer === 'yes') {
                  const hasHometaxPdf = (() => {
                    if (hometaxData && (hometaxData.uploaded || hometaxData.hasData || hometaxData.fileName || (Array.isArray(hometaxData.persons) && hometaxData.persons.length > 0))) {
                      return true;
                    }
                    try {
                      const saved = localStorage.getItem('hometax_extracted_data');
                      if (saved) {
                        const parsed = JSON.parse(saved);
                        return Boolean(parsed && (parsed.uploaded || parsed.hasData || parsed.fileName || (Array.isArray(parsed?.persons) && parsed.persons.length > 0)));
                      }
                    } catch {}
                    return false;
                  })();

                  if (hasHometaxPdf) {
                    const cleanWorkerName = (workerName || '본인').replace(/\(.*?\)/g, '').trim();
                    const detected = getDetectedHometaxSmallBiz();
                    const defaultNtsSmallBiz = [
                      {
                        id: 'nts_sbiz_1',
                        name: detected?.name || cleanWorkerName,
                        relation: '본인',
                        type: detected?.type || '소기업소상공인 공제부금',
                        bizType: detected?.bizType || '법인대표자',
                        joinPeriod: detected?.joinPeriod || '2016년 이후 가입',
                        bank: detected?.bank || '중소기업중앙회',
                        account: detected?.account || '100-82-123456',
                        contractNo: detected?.contractNo || '100-82-123456',
                        amount: Number(detected?.amount) || 5000000,
                        isNts: true,
                        source: 'nts',
                      },
                    ];
                    setItems((prev) => {
                      const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
                      return [...others, ...defaultNtsSmallBiz];
                    });
                    setChecklistAnswer('yes');
                    showAlert(
                      '요건을 충족하여 연말정산 간소화자료 PDF내용이 적용되었습니다.',
                      '알림',
                      () => {
                        setViewMode('small_biz_view');
                      }
                    );
                  } else {
                    // 국세청 PDF 자료를 삭제했거나 업로드 자료가 없을 경우: 국세청자료 미표시 및 기타자료 추가 페이지로 바로 이동
                    setItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
                    setChecklistAnswer('yes');
                    handleOpenAdd();
                  }
                } else {
                  showAlert('위 요건을 모두 충족하는지 네/아니오를 선택해주세요.');
                }
              }}
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              결과 저장하기
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. 소기업소상공인 수정 화면 (small_biz_edit)                               */}
      {/* ========================================================================= */}
      {viewMode === 'small_biz_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('small_biz_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">소기업소상공인공제 수정</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                소기업소상공인 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                노란우산공제 납입 정보를 확인하세요.<br />
                기타자료를 편집할 경우에는 꼭 중소기업중앙회 납입증명서를 확인하시기 바랍니다.
              </p>
            </div>

            {/* 공제한도 기준 안내 카드 (첨부 이미지 서식 및 요건 100% 반영) */}
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100/90 text-xs text-slate-700 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-bold text-[#4F46E5] text-[12.5px] flex items-center gap-1.5">
                  <span>ℹ️</span>
                  <span>소기업·소상공인 공제부금 공제한도 (조특법 제86조의3)</span>
                </span>
                <span className="text-[11px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded-md border border-indigo-200/60 shadow-2xs">
                  내 근로소득금액: <strong className="text-[#4F46E5] font-mono">{earnedIncomeAmount.toLocaleString()}원</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                2016년 이후 가입자는 사업(근로)소득금액에 따라 아래 한도가 적용되며, 법인 대표자는 해당 과세기간 총급여액이 7천만 원 이하인 경우에만 근로소득금액에서 공제됩니다.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-center text-[11px] border-collapse bg-white rounded-xl overflow-hidden border border-slate-200 shadow-2xs">
                  <thead className="bg-slate-100/80 font-bold text-slate-700">
                    <tr>
                      <th className="py-2 px-3 border-b border-r border-slate-200">사업(근로)소득금액</th>
                      <th className={`py-2 px-2 border-b border-r border-slate-200 ${earnedIncomeAmount <= 40000000 ? 'bg-indigo-100/80 text-[#4F46E5] font-black' : ''}`}>
                        4천만원 이하 {earnedIncomeAmount <= 40000000 && '✓'}
                      </th>
                      <th className={`py-2 px-2 border-b border-r border-slate-200 ${earnedIncomeAmount > 40000000 && earnedIncomeAmount <= 100000000 ? 'bg-indigo-100/80 text-[#4F46E5] font-black' : ''}`}>
                        4천만원~1억원 {earnedIncomeAmount > 40000000 && earnedIncomeAmount <= 100000000 && '✓'}
                      </th>
                      <th className={`py-2 px-2 border-b border-slate-200 ${earnedIncomeAmount > 100000000 ? 'bg-indigo-100/80 text-[#4F46E5] font-black' : ''}`}>
                        1억원 초과 {earnedIncomeAmount > 100000000 && '✓'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 font-medium">
                    <tr>
                      <td className="py-2 px-3 font-bold bg-slate-50 border-r border-slate-200">공제한도</td>
                      <td className={`py-2 px-2 border-r border-slate-200 font-mono ${earnedIncomeAmount <= 40000000 ? 'bg-indigo-50 font-black text-[#4F46E5]' : ''}`}>
                        500만원
                      </td>
                      <td className={`py-2 px-2 border-r border-slate-200 font-mono ${earnedIncomeAmount > 40000000 && earnedIncomeAmount <= 100000000 ? 'bg-indigo-50 font-black text-[#4F46E5]' : ''}`}>
                        300만원
                      </td>
                      <td className={`py-2 px-2 font-mono ${earnedIncomeAmount > 100000000 ? 'bg-indigo-50 font-black text-[#4F46E5]' : ''}`}>
                        200만원
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 국세청자료 섹션 */}
            {items.filter((item) => item.isNts).length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="text-xs font-bold text-slate-800">국세청자료</div>
                <div className="space-y-3">
                  {items
                    .filter((item) => item.isNts)
                    .map((item) => {
                      const cleanName = (item.name || '').replace(/\(.*?\)/g, '').trim();
                      const limitInfo = limitMap[item.id] || { limitAmount: Number(item.amount || 0), rawAmount: Number(item.amount || 0) };
                      const rawAmount = Number(item.amount || 0);
                      return (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {cleanName}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            {/* 인별 상세내용에 이름 및 가입구분 표기 */}
                            <div className="text-[13px] font-medium text-slate-600 leading-normal flex items-center gap-1.5">
                              <span>{cleanName}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-sans font-medium">
                                {item.bizType || '법인대표자'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1.5">
                                {limitInfo.ineligibleReason && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 font-sans font-medium">
                                    {limitInfo.ineligibleReason}
                                  </span>
                                )}
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {limitInfo.limitAmount.toLocaleString()}원
                                </span>
                              </div>
                              {rawAmount > limitInfo.limitAmount && !limitInfo.ineligibleReason && (
                                <span className="text-[10px] text-amber-600 font-medium">
                                  (납입 {rawAmount.toLocaleString()}원 / {limitInfo.limitTierText || '한도적용'})
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 기타자료 섹션 */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-slate-800">기타자료</div>
              <div className="space-y-3">
                {items.filter((item) => !item.isNts).length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    직접 등록한 기타자료가 없습니다. 아래 버튼으로 추가해주세요.
                  </div>
                ) : (
                  items
                    .filter((item) => !item.isNts)
                    .map((item) => {
                      const cleanName = (item.name || '').replace(/\(.*?\)/g, '').trim();
                      const limitInfo = limitMap[item.id] || { limitAmount: Number(item.amount || 0), rawAmount: Number(item.amount || 0) };
                      const rawAmount = Number(item.amount || 0);
                      return (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-indigo-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {cleanName}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            {/* 인별 상세내용에 이름 및 사업자구분 표기 */}
                            <div className="text-[13px] font-medium text-slate-600 leading-normal flex items-center gap-1.5">
                              <span>{cleanName}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-[#4F46E5] border border-indigo-200 font-sans font-semibold">
                                {item.bizType || '법인대표자'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1.5">
                                {limitInfo.ineligibleReason && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 font-sans font-medium">
                                    {limitInfo.ineligibleReason}
                                  </span>
                                )}
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {limitInfo.limitAmount.toLocaleString()}원
                                </span>
                              </div>
                              {rawAmount > limitInfo.limitAmount && !limitInfo.ineligibleReason && (
                                <span className="text-[10px] text-amber-600 font-medium">
                                  (납입 {rawAmount.toLocaleString()}원 / {limitInfo.limitTierText || '한도적용'})
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
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
            </div>
          </div>

          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('small_biz_view')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer text-center"
            >
              수정/추가 완료
            </button>
            <button
              type="button"
              onClick={() => {
                if (checklistAnswer !== 'yes') {
                  setShowChecklistNoticeModal(true);
                } else {
                  handleOpenAdd();
                }
              }}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-1"
            >
              <span>+ 기타자료 추가</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. 소기업소상공인 추가/수정 폼 (small_biz_add)                              */}
      {/* ========================================================================= */}
      {viewMode === 'small_biz_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('small_biz_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '소기업소상공인 수정' : '소기업소상공인 추가'}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenGuide}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              ⓘ
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                소기업소상공인 기타자료를<br />
                {editingItemId ? '수정하세요.' : '입력하세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                노란우산공제 납입 정보를 입력해주세요.<br />
                기타자료 추가 시에는 중소기업중앙회 납입증명서를 구비해야 합니다.
              </p>
            </div>

            {formBizType === '법인대표자' && Number(totalSalary) > 70000000 && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed font-medium">
                ⚠️ <span className="font-bold">법인대표자 총급여 7천만원 초과:</span> 법인 대표자는 총급여액이 7,000만 원 이하인 경우에만 근로소득공제가 가능하므로 세법상 공제 대상에서 제외(공제액 0원)됩니다. (개인사업자인 경우 '개인사업자'를 선택하시면 공제 가능합니다.)
              </div>
            )}
            {formBizType === '개인사업자' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 leading-relaxed font-medium">
                ✓ <span className="font-bold">개인사업자:</span> 소기업·소상공인 공제부금(노란우산공제) 소득공제 적용 대상입니다. (연간 최대 500만원 한도)
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 pt-1">
              {/* 성명* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  성명<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    {familyMembers.map((m) => {
                      const cleanMemberName = (m.name || '').replace(/\(.*?\)/g, '').trim();
                      return (
                        <option key={m.id} value={cleanMemberName}>
                          {cleanMemberName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 공제 구분* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  공제 구분<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formType}
                  readOnly
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none cursor-not-allowed"
                />
              </div>

              {/* 가입시기 구분 (2015년 이전 가입 / 2016년 이후 가입) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  가입시기 구분<span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setFormJoinPeriod('2015년 이전 가입')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      formJoinPeriod === '2015년 이전 가입'
                        ? 'border-[#4F46E5] bg-indigo-50 text-[#4F46E5] shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] ${
                      formJoinPeriod === '2015년 이전 가입' ? 'border-[#4F46E5] bg-[#4F46E5] text-white' : 'border-slate-300'
                    }`}>
                      {formJoinPeriod === '2015년 이전 가입' && '✓'}
                    </span>
                    2015년 이전 가입
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormJoinPeriod('2016년 이후 가입')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      formJoinPeriod === '2016년 이후 가입'
                        ? 'border-[#4F46E5] bg-indigo-50 text-[#4F46E5] shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] ${
                      formJoinPeriod === '2016년 이후 가입' ? 'border-[#4F46E5] bg-[#4F46E5] text-white' : 'border-slate-300'
                    }`}>
                      {formJoinPeriod === '2016년 이후 가입' && '✓'}
                    </span>
                    2016년 이후 가입
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  2015년 이전 가입자는 종합소득금액에서 공제되며, 2016년 이후 가입자는 사업소득금액(법인 대표자는 총급여 7천만원 이하 근로소득)에서 공제됩니다.
                </p>
              </div>

              {/* 사업자 구분 (법인대표자 vs 개인사업자) (요구사항 7) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  사업자 구분<span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setFormBizType('법인대표자')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      formBizType === '법인대표자'
                        ? 'border-[#4F46E5] bg-indigo-50 text-[#4F46E5] shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] ${
                      formBizType === '법인대표자' ? 'border-[#4F46E5] bg-[#4F46E5] text-white' : 'border-slate-300'
                    }`}>
                      {formBizType === '법인대표자' && '✓'}
                    </span>
                    🏢 법인 대표자
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormBizType('개인사업자')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      formBizType === '개인사업자'
                        ? 'border-[#4F46E5] bg-indigo-50 text-[#4F46E5] shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] ${
                      formBizType === '개인사업자' ? 'border-[#4F46E5] bg-[#4F46E5] text-white' : 'border-slate-300'
                    }`}>
                      {formBizType === '개인사업자' && '✓'}
                    </span>
                    👤 개인사업자
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {formBizType === '법인대표자'
                    ? '• 법인 대표자: 총급여 7천만원 이하 근로소득에서 소득공제 가능합니다.'
                    : '• 개인사업자: 소기업·소상공인 공제부금 소득공제 가능합니다.'}
                </p>
              </div>

              {/* 공제계약번호 / 증서번호 (요구사항 6) - 사업장, 사업자번호는 삭제(요구사항 8) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  공제계약번호 (증서번호)
                </label>
                <input
                  type="text"
                  value={formAccount}
                  onChange={(e) => setFormAccount(e.target.value)}
                  placeholder="예: 공제계약번호 또는 증서번호"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                />
                <p className="text-[11px] text-slate-400">
                  공제계약번호 또는 증서번호 내용을 입력해주세요.
                </p>
              </div>

              {/* 납입금액* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  당해년도 납입금액<span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={formAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setFormAmount(raw ? Number(raw).toLocaleString() : '');
                    }}
                    placeholder="0"
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                </div>
              </div>

              {/* 안내 문구 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-[#4F46E5]">📌 소기업소상공인 공제 한도</div>
                <div>• 사업소득/근로소득 4천만원 이하 연 500만원, 4천만~1억원 이하 연 300만원 한도</div>
                <div>• 법인 대표자(총급여 7천만원 이하)는 근로소득에서 소득공제 가능</div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
                >
                  {editingItemId ? '수정' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달 3종 */}
      {showChecklistNoticeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[290px] bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-full bg-[#4E88FF] text-white flex items-center justify-center text-2xl font-black mx-auto shadow-md shrink-0">
              ?
            </div>
            <div className="text-sm font-bold text-slate-800 leading-snug">
              공제요건 확인을 위해<br />
              체크리스트 작성이 필요해요.
            </div>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowChecklistNoticeModal(false);
                  setViewMode('small_biz_checklist');
                }}
                className="w-full py-3 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs transition shadow-xs cursor-pointer text-center"
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => setShowChecklistNoticeModal(false)}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition cursor-pointer text-center"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showIneligibleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[290px] bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-full bg-[#FF4D4F] text-white flex items-center justify-center text-2xl font-black mx-auto shadow-md shrink-0">
              !
            </div>
            <div>
              <h4 className="text-base font-extrabold text-slate-900 leading-tight">
                공제불가
              </h4>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                공제 요건을 만족하지 않아요.<br />
                공제 요건을 다시 한번 확인해주세요.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowIneligibleModal(false);
                  setViewMode('small_biz_view');
                }}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {showProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              📎
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">소기업소상공인 공제부금 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                노란우산공제 부금 소득공제 증빙 서류 안내입니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 인정 서류: 소기업·소상공인 공제부금 납입증명서, 사업자등록증 사본</div>
              <div>• 간소화자료: 국세청 연말정산간소화 서비스에서 자동 조회 가능</div>
              <div>• 공제한도: 사업소득/근로소득금액에 따라 연 200만~500만원 소득공제</div>
            </div>
            <button
              type="button"
              onClick={() => setShowProofModal(false)}
              className="w-full py-3 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-[#4338CA] transition"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}

