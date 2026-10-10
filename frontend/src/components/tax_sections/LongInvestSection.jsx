import React, { useState, useEffect } from 'react';

/**
 * [장기집합증권] 상세 화면 컴포넌트
 * 1. 장기집합증권 조회 (long_invest_view) - 히어로 카드, 인별 아코디언(증권 구분만 간단히 표기)
 * 2. 장기집합증권 수정 (long_invest_edit) - 국세청/기타자료 분리, 인별 상세내용에 증권 구분만 표기
 * 3. 장기집합증권 추가/수정 (long_invest_add) - 증권구분, 금융투자회사, 펀드코드/계좌번호, 가입일자, 납입연도, 납입금액
 */

// 가입일자 및 총급여 요건 검증 헬퍼 (조특법 제91조의16, 제91조의20)
export const checkLongInvestEligibility = (item, totalSalary = 0) => {
  const pType = (item.type || '').trim();
  const isOverSalary = Number(totalSalary) > 80000000;

  if (isOverSalary && (pType.includes('장기집합') || pType.includes('청년형'))) {
    return {
      eligible: false,
      reason: '총급여 8천만원 초과 제외',
      badgeClass: 'bg-rose-50 text-rose-600 border-rose-200',
    };
  }

  const rawDate = item.startDate || item.start_date || item.date || '';
  if (rawDate) {
    const parts = String(rawDate).match(/\d+/g) || [];
    if (parts.length > 0) {
      const year = parseInt(parts[0], 10);
      const month = parts.length > 1 ? parseInt(parts[1], 10) : 1;
      const day = parts.length > 2 ? parseInt(parts[2], 10) : 1;
      const dateNum = year * 10000 + month * 100 + day;

      if (pType.includes('청년형')) {
        // 청년형: 2023-12-31까지 가입분만 소득공제 대상
        if (dateNum > 20231231 || year > 2023) {
          return {
            eligible: false,
            reason: '2023.12.31 이전 가입 요건 미달',
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
          };
        }
      } else if (pType.includes('장기집합')) {
        // 일반 장기집합: 2015-12-31 이전 가입분만 소득공제 대상 (2016-01-01 이후 가입분 배제)
        if (dateNum > 20151231 || year > 2015) {
          return {
            eligible: false,
            reason: '2015.12.31 이전 가입 요건 미달',
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
          };
        }
      }
    }
  }

  return { eligible: true, reason: null, badgeClass: null };
};

// 사유 안내 뱃지 렌더링 헬퍼 (총급여 8천 초과 or 가입일자 요건 미달)
export const renderLongInvestDisqualifyBadge = (item, totalSalary = 0) => {
  const { eligible, reason, badgeClass } = checkLongInvestEligibility(item, totalSalary);
  if (eligible || !reason) return null;

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-sans font-medium mb-1 inline-block ${badgeClass}`}>
      {reason}
    </span>
  );
};

// 소득공제 대상금액 계산 헬퍼 (세법 요건: 총급여 8천만원 초과 또는 가입일자 미달 시 0원 - 조특법 제91조의16, 제91조의20)
export const calculateLongInvestDeductible = (item, totalSalary = 0) => {
  const raw = Number(item.rawAmount ?? item.amount ?? 0);
  const pType = (item.type || '').trim();

  // 요건 검증: 총급여 8천만원 초과 또는 가입일자 요건 미달 시 국세청/기타자료 불문 무조건 0원
  const { eligible } = checkLongInvestEligibility(item, totalSalary);
  if (!eligible) {
    return 0;
  }

  // 1) 청년형 장기집합투자증권저축: 납입액의 40% (최대 연 240만원)
  if (pType.includes('청년형')) {
    if (item.deductibleAmount !== undefined && item.deductibleAmount !== null && item.isNts) {
      return Number(item.deductibleAmount);
    }
    return Math.min(2400000, Math.floor(raw * 0.4));
  }

  // 2) 일반 장기집합투자증권저축: 2015-12-31 이전 가입분만 납입액의 40% (최대 연 240만원)
  if (pType.includes('장기집합')) {
    if (item.deductibleAmount !== undefined && item.deductibleAmount !== null && item.isNts) {
      return Number(item.deductibleAmount);
    }
    return Math.min(2400000, Math.floor(raw * 0.4));
  }

  // 3) 벤처투자조합 출자 (벤처기업투자신탁 등 10% 공제, 최대 300만원 한도) - 총급여 제한 없음
  if (pType.includes('벤처') || pType.includes('투자조합') || pType.includes('신탁')) {
    return Math.min(3000000, Math.floor(raw * 0.1));
  }

  return raw;
};

// 인별 장기집합증권 요약 헬퍼
export const getMemberLongInvestSummary = (memberItems, totalSalary = 0) => {
  const typeSummary = {
    '장기집합투자증권저축': 0,
    '청년형 장기집합투자증권저축': 0,
    '벤처투자조합 출자': 0,
  };

  memberItems.forEach((i) => {
    let t = i.type || '장기집합투자증권저축';
    if (t.includes('청년형')) t = '청년형 장기집합투자증권저축';
    else if (t.includes('벤처') || t.includes('투자조합') || t.includes('신탁')) t = '벤처투자조합 출자';
    else t = '장기집합투자증권저축';

    const amt = calculateLongInvestDeductible(i, totalSalary);
    typeSummary[t] = (typeSummary[t] || 0) + amt;
  });

  const memberTotal = Object.values(typeSummary).reduce((acc, v) => acc + v, 0);
  return { typeSummary, memberTotal };
};

export default function LongInvestSection({
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
  totalSalary = 0,
}) {
  const [showProofModal, setShowProofModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const toggleAccordion = (id) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  // 폼 입력 상태
  const selfMember = familyMembers.find((m) => m.isSelf || m.relation === '본인');
  const defaultWorkerName = (workerName || selfMember?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
  const [editingItemId, setEditingItemId] = useState(null);
  const [formName, setFormName] = useState(defaultWorkerName);
  const [formType, setFormType] = useState('장기집합투자증권저축');
  const [formBank, setFormBank] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formPayYear, setFormPayYear] = useState('');
  const [formAmount, setFormAmount] = useState('');

  // familyMembers 또는 workerName 변경 시 폼 이름 동기화
  useEffect(() => {
    if (!editingItemId) {
      const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
      setFormName((workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim());
    }
  }, [familyMembers, workerName, editingItemId]);

  // 히어로 카드 금액 계산
  const allCleanNames = Array.from(new Set(items.map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())));
  let totalGeneral = 0;
  let totalYouth = 0;
  let totalVenture = 0;
  let totalAmount = 0;

  allCleanNames.forEach((mName) => {
    const mItems = items.filter((i) => (i.name || '').replace(/\(.*?\)/g, '').trim() === mName);
    const { typeSummary, memberTotal } = getMemberLongInvestSummary(mItems, totalSalary);
    totalGeneral += typeSummary['장기집합투자증권저축'] || 0;
    totalYouth += typeSummary['청년형 장기집합투자증권저축'] || 0;
    totalVenture += typeSummary['벤처투자조합 출자'] || 0;
    totalAmount += memberTotal;
  });

  // 추가 폼 열기
  const handleOpenAdd = () => {
    setEditingItemId(null);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanSelfName = (workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanSelfName);
    setFormType('장기집합투자증권저축');
    setFormBank('');
    setFormAccount('');
    setFormStartDate('');
    setFormPayYear('');
    setFormAmount('');
    setViewMode('long_invest_add');
  };

  // 수정 폼 열기
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const cleanItemName = (item.name || workerName || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanItemName);
    let sType = item.type || '장기집합투자증권저축';
    if (sType.includes('청년형')) sType = '청년형 장기집합투자증권저축';
    else if (sType.includes('벤처') || sType.includes('투자조합') || sType.includes('신탁')) sType = '벤처투자조합 출자';
    else sType = '장기집합투자증권저축';

    setFormType(sType);
    setFormBank(item.bank || item.company || '');
    setFormAccount(item.account || item.accountNo || item.fundName || '');
    setFormStartDate(item.startDate || '');
    setFormPayYear(item.payYear || '');
    const rawVal = item.rawAmount ?? item.amount ?? '';
    setFormAmount(rawVal ? Number(rawVal).toLocaleString() : '');
    setViewMode('long_invest_add');
  };

  // 저장 핸들러
  const handleSave = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanName = (formName || workerName || '본인').replace(/\(.*?\)/g, '').trim();

    if (!formBank.trim()) {
      showAlert('금융투자회사(취급기관)명을 입력해주세요.');
      return;
    }
    if (cleanAmount <= 0) {
      showAlert('납입금액을 입력해주세요.');
      return;
    }

    const calculatedDeductible = calculateLongInvestDeductible({
      type: formType,
      rawAmount: cleanAmount,
      startDate: formStartDate.trim(),
      payYear: formPayYear.trim(),
      isNts: false,
    }, totalSalary);

    if (editingItemId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                name: cleanName,
                relation: '본인',
                type: formType,
                bank: formBank.trim(),
                company: formBank.trim(),
                account: formAccount.trim(),
                startDate: formStartDate.trim(),
                payYear: formPayYear.trim(),
                rawAmount: cleanAmount,
                amount: calculatedDeductible,
              }
            : item
        )
      );
      setToastMsg('장기집합증권 자료가 수정되었습니다.');
    } else {
      const newItem = {
        id: `linvest_${Date.now()}`,
        name: cleanName,
        relation: '본인',
        type: formType,
        bank: formBank.trim(),
        company: formBank.trim(),
        account: formAccount.trim(),
        startDate: formStartDate.trim(),
        payYear: formPayYear.trim(),
        rawAmount: cleanAmount,
        amount: calculatedDeductible,
        isNts: false,
        source: 'other',
      };
      setItems((prev) => [...prev, newItem]);
      setToastMsg('장기집합증권 자료가 등록되었습니다.');
    }

    setViewMode('long_invest_edit');
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
      {/* 1. 장기집합증권 조회 화면 (long_invest_view)                                 */}
      {/* ========================================================================= */}
      {viewMode === 'long_invest_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 장기집합증권 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">장기집합증권 조회</span>
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
            {/* 장기집합투자증권 명세 히어로 카드 (기부금 명세 스타일과 동일) */}
            <div
              className={`w-full ${
                totalAmount > 0
                  ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-3.5'
                  : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'
              } rounded-2xl text-white shadow-md transition-all`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold tracking-tight">장기집합투자증권 소득공제 명세</span>
                  <span
                    onClick={onOpenGuide}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="장기집합증권 안내"
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
                    {/* 장기집합투자증권 소득공제 합계 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white/90">📈</span>
                        <span className="text-sm font-semibold tracking-tight">장기집합투자증권 소득공제 합계</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-base font-bold font-mono tracking-tight">
                          {totalAmount.toLocaleString()}원
                        </span>
                        {Number(totalSalary) > 80000000 && items.some(i => (i.type || '').includes('장기집합') || (i.type || '').includes('청년형')) && (
                          <span className="text-[10px] text-amber-200">
                            (총급여 8,000만원 초과 소득공제 배제)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ㄴ 장기집합투자증권저축 */}
                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>장기집합투자증권저축</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalGeneral.toLocaleString()}원
                      </span>
                    </div>

                    {/* ㄴ 청년형 장기집합투자증권저축 */}
                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>청년형 장기집합투자증권저축</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalYouth.toLocaleString()}원
                      </span>
                    </div>

                    {/* ㄴ 벤처투자조합 출자 등 */}
                    {totalVenture > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>벤처투자조합 출자 등</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalVenture.toLocaleString()}원
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 항목이 없는 경우 안내 카드 */}
            {items.length === 0 && (
              <div className="py-14 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-2xl text-slate-400">
                  📁
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">조회할 자료가 없습니다.</div>
                  <div className="text-xs text-slate-400 mt-1">
                    간소화 자료가 없거나 아직 등록하지 않았습니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  <span>+ 자료입력</span>
                </button>
              </div>
            )}

            {/* 국세청자료 & 기타자료 인별 아코디언 목록 (요구사항 1, 2) */}
            {items.length > 0 && (
              <div className="space-y-4">
                {/* 1. 국세청자료 */}
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
                        const { memberTotal } = getMemberLongInvestSummary(memberItems, totalSalary);
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

                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => {
                                  const itDeduct = calculateLongInvestDeductible(it, totalSalary);
                                  return (
                                    <div
                                      key={it.id || idx}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <div>
                                        <div className="font-medium text-slate-600">
                                          {it.type || '장기집합투자증권저축'}
                                        </div>
                                        {it.startDate && (
                                          <div className="text-[10px] text-slate-400 font-mono">
                                            가입일자: {it.startDate}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {renderLongInvestDisqualifyBadge(it, totalSalary)}
                                        <span className="font-bold font-mono text-slate-900 text-[13px]">
                                          {itDeduct.toLocaleString()}원
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. 기타자료 */}
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
                        const { memberTotal } = getMemberLongInvestSummary(memberItems, totalSalary);
                        const isExpanded = !!expandedIds[`other_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-indigo-200/90 hover:border-indigo-400'
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

                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => {
                                  const itDeduct = calculateLongInvestDeductible(it, totalSalary);
                                  return (
                                    <div
                                      key={it.id || idx}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <div>
                                        <div className="font-medium text-slate-600">
                                          {it.type || '장기집합투자증권저축'}
                                        </div>
                                        {it.startDate && (
                                          <div className="text-[10px] text-slate-400 font-mono">
                                            가입일자: {it.startDate}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {renderLongInvestDisqualifyBadge(it, totalSalary)}
                                        <span className="font-bold font-mono text-slate-900 text-[13px]">
                                          {itDeduct.toLocaleString()}원
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
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
                if (items.length === 0) {
                  handleOpenAdd();
                } else {
                  setViewMode('long_invest_edit');
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
      {/* 2. 장기집합증권 수정 화면 (long_invest_edit)                                 */}
      {/* ========================================================================= */}
      {viewMode === 'long_invest_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('long_invest_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">장기집합투자증권 수정</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                장기집합증권 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 요구사항 1 & 3: 성명 본인/부양가족 삭제, 인별 상세내용에 증권 구분만 표기 */}
            <div className="space-y-4 pt-1">
              {/* 국세청자료 섹션 */}
              {items.filter((item) => item.isNts).length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-800">국세청자료</div>
                  <div className="space-y-3">
                    {items
                      .filter((item) => item.isNts)
                      .map((item) => {
                        const cleanName = (item.name || '').replace(/\(.*?\)/g, '').trim();
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
                              {/* 인별 상세내용에 증권 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '장기집합투자증권저축'}
                              </div>
                              {item.startDate && (
                                <div className="text-[11px] text-slate-400 font-mono">
                                  가입일자: {item.startDate}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                {renderLongInvestDisqualifyBadge(item, totalSalary)}
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {calculateLongInvestDeductible(item, totalSalary).toLocaleString()}원
                                </span>
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
                              {/* 인별 상세내용에 증권 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '장기집합투자증권저축'}
                              </div>
                              {item.startDate && (
                                <div className="text-[11px] text-slate-400 font-mono">
                                  가입일자: {item.startDate}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                {renderLongInvestDisqualifyBadge(item, totalSalary)}
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {calculateLongInvestDeductible(item, totalSalary).toLocaleString()}원
                                </span>
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
          </div>

          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('long_invest_view')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer text-center"
            >
              수정/추가 완료
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-1"
            >
              <span>+ 기타자료 추가</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. 장기집합증권 추가/수정 폼 (long_invest_add)                               */}
      {/* ========================================================================= */}
      {viewMode === 'long_invest_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('long_invest_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '장기집합증권 수정' : '장기집합증권 추가'}
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
                장기집합증권 기타자료를<br />
                {editingItemId ? '수정하세요.' : '입력하세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                청년형, 일반 장기집합투자증권 및 벤처투자 출자 정보를 입력해주세요.
              </p>
            </div>

            {Number(totalSalary) > 80000000 && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed font-medium">
                ⚠️ <span className="font-bold">총급여 8천만원 초과:</span> 근로자의 총급여액이 8,000만 원을 초과하여 세법(조특법 제91조의16, 제91조의20)상 일반 및 청년형 장기집합투자증권 소득공제 대상에서 제외(공제액 0원)됩니다.
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 pt-1">
              {/* 성명* (요구사항 1: 본인, 부양가족 표기 삭제) */}
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
                      const cleanName = (m.name || '').replace(/\(.*?\)/g, '').trim();
                      return (
                        <option key={m.id} value={cleanName}>
                          {cleanName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 증권 구분* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  증권 구분<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setFormType(nextType);
                      if (nextType === '벤처투자조합 출자' && !editingItemId) {
                        setFormPayYear('');
                      }
                    }}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="장기집합투자증권저축">장기집합투자증권저축</option>
                    <option value="청년형 장기집합투자증권저축">청년형 장기집합투자증권저축</option>
                    <option value="벤처투자조합 출자">벤처투자조합 출자</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 금융투자회사* (연말정산 PDF자료의 '취급기관' 내용 작성 - 요구사항 5, 6) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  금융투자회사 (취급기관)<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formBank}
                  onChange={(e) => setFormBank(e.target.value)}
                  placeholder={
                    formType === '벤처투자조합 출자'
                      ? '예: (주)국민은행, 유안타증권 주식회사'
                      : '예: 중소기업은행, 현대차증권 주식회사'
                  }
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 펀드코드/계좌번호 (요구사항 5: 펀드명 작성 / 요구사항 6: 계좌번호 작성) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  {formType === '벤처투자조합 출자' ? '계좌번호' : '펀드명 (펀드코드/계좌번호)'}
                </label>
                <input
                  type="text"
                  value={formAccount}
                  onChange={(e) => setFormAccount(e.target.value)}
                  placeholder={
                    formType === '벤처투자조합 출자'
                      ? '예: 20315504351234'
                      : '예: KKK 10년투자 증권투자신탁'
                  }
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                />
              </div>

              {/* 가입일자 (요구사항 5: 장기집합/청년형인 경우 가입일자 항목 추가) */}
              {formType !== '벤처투자조합 출자' && (
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500">가입일자</label>
                    <span className="text-[11px] text-slate-400">
                      {formType === '청년형 장기집합투자증권저축'
                        ? '2023.12.31까지 가입분만 공제 대상'
                        : '2015.12.31까지 가입분 공제 대상'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    placeholder={
                      formType === '청년형 장기집합투자증권저축'
                        ? '예: 2023-12-15 (2023.12.31 이전 가입)'
                        : '예: 2015-06-30 (2015.12.31 이전 가입)'
                    }
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                  {/* 실시간 가입일자 요건 검증 배너 및 사유 뱃지 */}
                  {(() => {
                    const badge = renderLongInvestDisqualifyBadge({ type: formType, startDate: formStartDate }, totalSalary);
                    if (badge) {
                      return (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200/90 flex items-start gap-2 text-xs text-amber-800">
                          <div className="shrink-0">{badge}</div>
                          <div className="leading-tight pt-0.5">
                            {formType.includes('청년형')
                              ? '청년형 장기집합투자증권저축은 2023.12.31 이전 가입분만 소득공제 대상입니다. 요건 미달 시 공제금액은 0원으로 적용됩니다.'
                              : '장기집합투자증권저축은 2015.12.31 이전 가입분만 소득공제(납입액의 40%) 대상입니다. 2015.12.31 이후 가입분은 소득공제 대상에서 제외되어 0원으로 계산됩니다.'}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* 납입연도 (요구사항 6: 벤처투자조합 출자인 경우 납입연도 항목 추가) */}
              {formType === '벤처투자조합 출자' && (
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500">납입연도</label>
                  </div>
                  <input
                    type="text"
                    value={formPayYear}
                    onChange={(e) => setFormPayYear(e.target.value)}
                    placeholder="예: 2025, 2024, 2023"
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                </div>
              )}

              {/* 납입금액* (요구사항 4: '당해년도 납입금액' -> '납입금액'으로 변경) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500">
                    납입금액<span className="text-rose-500">*</span>
                  </label>
                </div>
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

              {/* 요구사항 7: 아래쪽에 '벤처투자조합 출자 등에 대한 소득공제 한도' 내용 추가 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-2">
                <div className="font-semibold text-[#4F46E5]">📌 장기집합증권 공제 한도 및 조건</div>
                <div className="space-y-0.5">
                  <div>• 장기집합투자증권저축(2015.12.31 이전 가입): 연 600만원 한도 내 납입금액의 40% (최대 연 240만원)</div>
                  <div>• 청년형 장기집합투자증권저축(2023.12.31 이전 가입): 연 600만원 한도 내 납입액의 40% (최대 연 240만원)</div>
                  <div className="text-slate-500 pt-0.5">※ 당해 과세연도 총급여액이 8,000만원을 초과하는 근로자는 조특법 제91조의16 및 제91조의20에 따라 소득공제 적용이 배제됩니다.</div>
                </div>

                <div className="pt-2 border-t border-indigo-100">
                  <div className="font-semibold text-[#4F46E5] mb-1">
                    📌 벤처투자조합 출자 등에 대한 소득공제 한도
                  </div>
                  <div className="space-y-0.5">
                    <div>• 벤처기업투자신탁(코스닥벤처펀드 등): 투자금액의 10% 소득공제 (최대 연 300만원 한도)</div>
                    <div>• 벤처투자조합 / 개인투자조합 / 벤처기업 직접투자:</div>
                    <div className="pl-2">- 3,000만원 이하분: 100% 소득공제</div>
                    <div className="pl-2">- 3,000만원 초과 ~ 5,000만원 이하분: 70% 소득공제</div>
                    <div className="pl-2">- 5,000만원 초과분: 30% 소득공제</div>
                    <div>• 공제 한도: 해당 과세연도 종합소득금액의 50% 한도</div>
                  </div>
                </div>
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

      {/* 증빙 안내 모달 */}
      {showProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              📎
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">장기집합증권 증빙자료</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                장기집합투자증권저축 및 벤처투자조합 소득공제 증빙 서류 안내입니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1.5">
              <div>• 인정 서류: 장기집합투자증권저축 납입증명서, 출자 등 소득공제용 계산서</div>
              <div>• 간소화자료: 국세청에서 제공하는 자료는 별도 영수증 제출 불필요</div>
              <div>• 청년형 장기집합: 2023.12.31까지 가입분 연 600만원 한도 내 40% 공제</div>
              <div>• 벤처투자신탁: 투자금액의 10% 소득공제 (최대 300만원 한도)</div>
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
