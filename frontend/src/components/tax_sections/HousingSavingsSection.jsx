import React, { useState, useEffect } from 'react';

/**
 * [주택마련저축] 상세 화면 컴포넌트
 * 1. 주택마련저축 조회 (housing_savings_view) - 파란색 히어로 카드, 요건 체크리스트 배너, 빈 상태/+자료입력, 국세청/기타자료 목록
 * 2. 주택마련저축 체크리스트 (housing_savings_checklist) - 체크1,2,3 요건 판정, 네/아니오, 공제불가 모달
 * 3. 주택마련저축 수정 (housing_savings_edit) - 카드형 목록, 수정/삭제 버튼, 50:50 하단 액션
 * 4. 주택마련저축 추가/수정 (housing_savings_add) - 저축구분, 가입은행, 계좌번호, 납입금액
 */
export default function HousingSavingsSection({
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
  housingLoanItems = [],
  totalSalary = 0,
  hometaxData,
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
  const [formType, setFormType] = useState('주택청약종합저축');
  const [formBank, setFormBank] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formJoinDate, setFormJoinDate] = useState('2020.01.01'); // 가입일자 (국세청 서식 필수)
  const [formSubmitProof, setFormSubmitProof] = useState(true); // 무주택확인서 제출 여부
  const [formIsTerminated, setFormIsTerminated] = useState(false); // 연도 중 중도해지 여부
  const [formTerminationReason, setFormTerminationReason] = useState('일반해지'); // 해지사유 ('주택당첨' | '일반해지')
  const [formAmount, setFormAmount] = useState('');

  // familyMembers 또는 workerName 변경 시 폼 이름 동기화
  useEffect(() => {
    if (!editingItemId) {
      const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
      setFormName((workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim());
    }
  }, [familyMembers, workerName, editingItemId]);

  // 주택마련저축 항목별 한도계산 맵 (국세청 서식 산식: 1 + 2 <= 연 400만원, 총급여 7천만원 이하, 장기주택저당차입금 공제 시 ②청약 공제 제외)
  const limitMap = React.useMemo(() => {
    // 1. 총급여 7천만원 초과 여부 확인 (첨부 요건: 총급여 7,000만 원 이하인 무주택 세대주만 공제 가능)
    const isOverSalary = Number(totalSalary) > 70000000;

    // 2. 장기주택저당차입금(담보) 공제 여부
    const hasMortgage = housingLoanItems.some(
      (i) => i.type && i.type.includes('장기주택저당차입금') && Number(i.amount) > 0
    );

    // 3. 주택임차차입금 공제액 (2) 계산: 상환액의 40% (연 400만원 한도 내)
    const rentItems = housingLoanItems.filter((i) => !i.type || i.type.includes('주택임차차입금'));
    const totalRentRaw = rentItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const rentDeduction = Math.min(Math.round(totalRentRaw * 0.4), 4000000);

    // 4. 주택마련저축 공제한도 = max(0, 4,000,000 - rentDeduction) (공식: 1 + 2 <= 400만원)
    let savingsTotalDeductionCap = isOverSalary ? 0 : Math.max(0, 4000000 - rentDeduction);

    let subRemaining = 3000000; // 청약저축, 주택청약종합저축 연간 300만원 납입한도
    let workerRemaining = 1800000; // 근로자주택마련저축 월 15만원 = 연간 180만원 한도
    const map = {};

    items.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const type = item.type || '주택청약종합저축';
      const isTerminated = !!item.isTerminated;
      const terminationReason = item.terminationReason || '';
      const submitProof = item.submitProof !== false;

      // 요건 1: 총급여 7천만원 초과 시 공제대상 제외
      if (isOverSalary) {
        map[item.id] = {
          limitAmount: 0,
          deductionAmount: 0,
          rawAmount: raw,
          isTerminated,
          terminationReason,
          ineligibleReason: '총급여 7천만원 초과 공제제외',
        };
        return;
      }

      // 요건 2: 일반 중도해지인 경우 공제대상 제외 (단, 주택당첨으로 인한 해지는 공제 가능)
      if (isTerminated && terminationReason !== '주택당첨') {
        map[item.id] = {
          limitAmount: 0,
          deductionAmount: 0,
          rawAmount: raw,
          isTerminated: true,
          terminationReason,
          ineligibleReason: '중도해지 공제제외',
        };
        return;
      }

      // 요건 3: 주택청약종합저축 무주택확인서 미제출 시 공제 제외
      if (!submitProof && (type.includes('주택청약종합저축') || type.includes('청약종합'))) {
        map[item.id] = {
          limitAmount: 0,
          deductionAmount: 0,
          rawAmount: raw,
          isTerminated,
          terminationReason,
          ineligibleReason: '무주택확인서 미제출',
        };
        return;
      }

      // 요건 4: 국세청 서식 요건: ②는 3. 장기주택저당차입금이자상환액공제를 받는 경우 공제 불가 (유주택자 공제 배제)
      if (hasMortgage && (type.includes('주택청약종합저축') || type.includes('청약저축') || type.includes('주택청약'))) {
        map[item.id] = {
          limitAmount: 0,
          deductionAmount: 0,
          rawAmount: raw,
          isTerminated,
          terminationReason,
          ineligibleReason: '장기주택저당차입금 공제 적용(유주택자)',
        };
        return;
      }

      let allowed = 0;
      if (type === '근로자주택마련저축') {
        allowed = Math.min(raw, Math.max(0, workerRemaining));
        workerRemaining -= allowed;
      } else {
        // 주택청약종합저축, 청약저축
        allowed = Math.min(raw, Math.max(0, subRemaining));
        subRemaining -= allowed;
      }

      // 40% 공제 계산 및 1 + 2 <= 400만원 잔여한도 적용
      const potentialDeduction = Math.floor(allowed * 0.4);
      const actualDeduction = Math.min(potentialDeduction, savingsTotalDeductionCap);
      savingsTotalDeductionCap -= actualDeduction;

      const effectiveLimit = actualDeduction > 0 ? Math.round(actualDeduction / 0.4) : (allowed > 0 && potentialDeduction === 0 ? 0 : (savingsTotalDeductionCap === 0 ? 0 : allowed));

      map[item.id] = {
        limitAmount: effectiveLimit,
        deductionAmount: actualDeduction,
        rawAmount: raw,
        isTerminated,
        terminationReason,
      };
    });

    return map;
  }, [items, housingLoanItems, totalSalary]);

  // 한도 적용된 총 공제대상 납입금액 합계
  const totalLimitAmount = React.useMemo(() => {
    return Object.values(limitMap).reduce((acc, it) => acc + (it.limitAmount || 0), 0);
  }, [limitMap]);

  // 총 소득공제 금액 (40%)
  const totalDeductionAmount = React.useMemo(() => {
    return Object.values(limitMap).reduce((acc, it) => acc + (it.deductionAmount || 0), 0);
  }, [limitMap]);

  // 총 지출 납입금액 합계
  const totalAmount = items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const totalSub = items
    .filter((i) => i.type === '주택청약종합저축')
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const totalOther = items
    .filter((i) => i.type !== '주택청약종합저축')
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  // 추가 폼 열기 (요청사항: 기본사항 성명 로그인 근로자 기준)
  const handleOpenAdd = () => {
    setEditingItemId(null);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanSelfName = (workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanSelfName);
    setFormType('주택청약종합저축');
    setFormBank('');
    setFormAccount('');
    setFormJoinDate('2020.01.01');
    setFormSubmitProof(true);
    setFormIsTerminated(false);
    setFormTerminationReason('일반해지');
    setFormAmount('');
    setViewMode('housing_savings_add');
  };

  // 수정 폼 열기
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanItemName = (item.name || workerName || self?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanItemName);
    setFormType(item.type || '주택청약종합저축');
    setFormBank(item.bank || '');
    setFormAccount(item.account || '');
    setFormJoinDate(item.joinDate || '2020.01.01');
    setFormSubmitProof(item.submitProof !== false);
    setFormIsTerminated(!!item.isTerminated);
    setFormTerminationReason(item.terminationReason || '일반해지');
    setFormAmount(item.amount ? Number(item.amount).toLocaleString() : '');
    setViewMode('housing_savings_add');
  };

  // 저장 핸들러
  const handleSave = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanFormName = (formName || workerName || '홍길동').replace(/\(.*?\)/g, '').trim();

    if (!formBank.trim()) {
      showAlert('가입 은행명을 입력해주세요.');
      return;
    }
    if (cleanAmount <= 0) {
      showAlert('납입금액을 입력해주세요.');
      return;
    }

    if (editingItemId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                name: cleanFormName,
                relation: '본인',
                type: formType,
                bank: formBank.trim(),
                account: formAccount.trim(),
                joinDate: formJoinDate.trim(),
                submitProof: formSubmitProof,
                isTerminated: formIsTerminated,
                terminationReason: formIsTerminated ? formTerminationReason : '',
                amount: cleanAmount,
              }
            : item
        )
      );
      setToastMsg('주택마련저축 자료가 수정되었습니다.');
    } else {
      const newItem = {
        id: `hsavings_${Date.now()}`,
        name: cleanFormName,
        relation: '본인',
        type: formType,
        bank: formBank.trim(),
        account: formAccount.trim(),
        joinDate: formJoinDate.trim(),
        submitProof: formSubmitProof,
        isTerminated: formIsTerminated,
        terminationReason: formIsTerminated ? formTerminationReason : '',
        amount: cleanAmount,
        isNts: false,
        source: 'other',
      };
      setItems((prev) => [...prev, newItem]);
      setToastMsg('주택마련저축 자료가 등록되었습니다.');
    }

    setViewMode('housing_savings_edit');
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
      {/* 1. 주택마련저축 조회 화면 (housing_savings_view)                            */}
      {/* ========================================================================= */}
      {viewMode === 'housing_savings_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 주택마련저축 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">주택마련저축 조회</span>
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
                    {checklistAnswer === 'yes' ? '주택마련저축 소득공제 요건 충족' : '주택청약 등 저축 공제를 받으시나요?'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('housing_savings_checklist')}
                  className="mt-2 py-1 px-3 rounded-lg bg-white border border-indigo-200 text-[#4F46E5] text-[11.5px] font-bold shadow-2xs hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1"
                >
                  <span>{checklistAnswer === 'yes' ? '체크리스트 재확인' : '체크리스트 진행하기'}</span>
                  <span className="text-[10px]">›</span>
                </button>
              </div>

              {/* 주택 & 저축 SVG 일러스트 */}
              <div className="w-16 h-14 flex items-center justify-center">
                <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
                  <circle cx="20" cy="24" r="14" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
                  <text x="20" y="29" textAnchor="middle" fill="#2563EB" fontSize="14" fontWeight="bold">₩</text>
                  <path d="M35 22L48 10L61 22" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#93C5FD" />
                  <rect x="38" y="21" width="20" height="18" rx="2" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.2" />
                  <rect x="44" y="26" width="8" height="13" rx="1" fill="#2563EB" />
                </svg>
              </div>
            </div>

            {/* 주택마련저축 명세 히어로 카드 */}
            <div className={`w-full ${totalAmount > 0 ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-3.5' : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'} rounded-2xl text-white shadow-md transition-all`}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold tracking-tight">주택마련저축 명세</span>
                  <span
                    onClick={onOpenGuide}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="주택마련저축 안내"
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white/90">⨁</span>
                        <span className="text-sm font-semibold tracking-tight">공제대상 한도금액</span>
                      </div>
                      <span className="text-base font-bold font-mono tracking-tight">
                        {totalLimitAmount.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>실제 소득공제 금액 (40%)</span>
                      </div>
                      <span className="font-mono font-bold text-amber-200">
                        {totalDeductionAmount.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/80 text-xs pl-3.5 border-t border-white/10 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>당해년도 총 납입합계</span>
                      </div>
                      <span className="font-mono">
                        {totalAmount.toLocaleString()}원
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
                        const memberLimitTotal = memberItems.reduce((acc, it) => acc + (limitMap[it.id]?.limitAmount || 0), 0);
                        const memberRawTotal = memberItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
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
                                <div className="flex flex-col items-end">
                                  <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                    {memberLimitTotal.toLocaleString()}원
                                  </span>
                                  {memberRawTotal > memberLimitTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      (납입 {memberRawTotal.toLocaleString()}원)
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역: 저축 구분만 간단히 표기 */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => {
                                  const itLimit = limitMap[it.id] || {
                                    limitAmount: Number(it.amount) || 0,
                                    deductionAmount: Math.floor((Number(it.amount) || 0) * 0.4),
                                    rawAmount: Number(it.amount) || 0,
                                  };
                                  return (
                                    <div
                                      key={it.id || idx}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-slate-600">
                                        {it.type || '주택청약종합저축'}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        {itLimit.ineligibleReason && (
                                          <span className="text-[10px] text-rose-500 font-normal">
                                            ({itLimit.ineligibleReason})
                                          </span>
                                        )}
                                        <span className="font-bold font-mono text-slate-900 text-[13px]">
                                          {itLimit.limitAmount.toLocaleString()}원
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
                        const memberLimitTotal = memberItems.reduce((acc, it) => acc + (limitMap[it.id]?.limitAmount || 0), 0);
                        const memberRawTotal = memberItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
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
                                <div className="flex flex-col items-end">
                                  <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                    {memberLimitTotal.toLocaleString()}원
                                  </span>
                                  {memberRawTotal > memberLimitTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      (납입 {memberRawTotal.toLocaleString()}원)
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역: 저축 구분만 간단히 표기 */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => {
                                  const itLimit = limitMap[it.id] || {
                                    limitAmount: Number(it.amount) || 0,
                                    deductionAmount: Math.floor((Number(it.amount) || 0) * 0.4),
                                    rawAmount: Number(it.amount) || 0,
                                  };
                                  return (
                                    <div
                                      key={it.id || idx}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-slate-600">
                                        {it.type || '주택청약종합저축'}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        {itLimit.ineligibleReason && (
                                          <span className="text-[10px] text-rose-500 font-normal">
                                            ({itLimit.ineligibleReason})
                                          </span>
                                        )}
                                        <span className="font-bold font-mono text-slate-900 text-[13px]">
                                          {itLimit.limitAmount.toLocaleString()}원
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
                if (checklistAnswer !== 'yes' && items.length === 0) {
                  setShowChecklistNoticeModal(true);
                } else {
                  setViewMode('housing_savings_edit');
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
      {/* 2. 주택마련저축 요건 체크리스트 화면 (housing_savings_checklist)            */}
      {/* ========================================================================= */}
      {viewMode === 'housing_savings_checklist' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('housing_savings_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">주택마련저축 요건 체크리스트</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <div className="font-bold text-[#4F46E5] text-[12.5px]">
                ⓘ 주택마련저축에 대한 소득공제를 받으시나요?
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
                  총급여액 7,000만 원 이하 근로자로서<br />
                  과세연도 중 무주택 세대의 세대주여야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (배우자 및 세대원 전원 무주택 요건 필요)
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크2
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  근로자 본인 명의로 가입한 저축이어야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (주택청약종합저축, 청약저축 등 / 배우자·가족 명의 불가)
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크3
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  가입 금융회사(은행)에 '무주택확인서'를<br />
                  제출했거나 다음 연도 2월 말까지 제출 예정이어야 해요.
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
                    const defaultNtsHousingSavings = [
                      {
                        id: 'nts_hsavings_1',
                        name: cleanWorkerName,
                        relation: '본인',
                        type: '청약저축',
                        bank: '우리은행',
                        account: '1002-123-456789',
                        amount: 1200000,
                        joinDate: '2014-05-10',
                        isTerminated: false,
                        isNts: true,
                        source: 'nts',
                      },
                      {
                        id: 'nts_hsavings_2',
                        name: cleanWorkerName,
                        relation: '본인',
                        type: '주택청약종합저축',
                        bank: 'KB국민은행',
                        account: '987602-01-234567',
                        amount: 1800000,
                        joinDate: '2018-09-15',
                        isTerminated: false,
                        isNts: true,
                        source: 'nts',
                      },
                    ];
                    setItems((prev) => {
                      const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
                      return [...others, ...defaultNtsHousingSavings];
                    });
                    setChecklistAnswer('yes');
                    showAlert(
                      '요건을 충족하여 연말정산 간소화자료 PDF내용이 적용되었습니다.',
                      '알림',
                      () => {
                        setViewMode('housing_savings_view');
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
      {/* 3. 주택마련저축 수정 화면 (housing_savings_edit)                            */}
      {/* ========================================================================= */}
      {viewMode === 'housing_savings_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('housing_savings_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">주택마련저축 수정</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                주택마련저축 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 등록된 주택마련저축 목록: 한도적용 공제대상 금액 및 소득공제금액 표기 */}
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
                        const limitInfo = limitMap[item.id] || {
                          limitAmount: Number(item.amount) || 0,
                          deductionAmount: Math.floor((Number(item.amount) || 0) * 0.4),
                          rawAmount: Number(item.amount) || 0,
                          isTerminated: false,
                        };
                        const rawAmount = Number(item.amount) || 0;
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
                              {/* 인별 상세내용에 저축 구분만 표기 */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '주택청약종합저축'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {limitInfo.limitAmount.toLocaleString()}원
                                </span>
                                {limitInfo.ineligibleReason ? (
                                  <span className="text-[10.5px] text-rose-500 font-medium">
                                    ({limitInfo.ineligibleReason})
                                  </span>
                                ) : limitInfo.isTerminated && limitInfo.terminationReason !== '주택당첨' ? (
                                  <span className="text-[10.5px] text-rose-500 font-medium">
                                    (중도해지 공제제외)
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[#4F46E5] font-semibold">
                                    공제(40%) {limitInfo.deductionAmount.toLocaleString()}원
                                  </span>
                                )}
                                {rawAmount > limitInfo.limitAmount && !limitInfo.ineligibleReason && (!limitInfo.isTerminated || limitInfo.terminationReason === '주택당첨') && (
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    (납입 {rawAmount.toLocaleString()}원 / 한도적용)
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
                        const limitInfo = limitMap[item.id] || {
                          limitAmount: Number(item.amount) || 0,
                          deductionAmount: Math.floor((Number(item.amount) || 0) * 0.4),
                          rawAmount: Number(item.amount) || 0,
                          isTerminated: false,
                        };
                        const rawAmount = Number(item.amount) || 0;
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
                              {/* 인별 상세내용에 저축 구분만 표기 */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '주택청약종합저축'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {limitInfo.limitAmount.toLocaleString()}원
                                </span>
                                {limitInfo.ineligibleReason ? (
                                  <span className="text-[10.5px] text-rose-500 font-medium">
                                    ({limitInfo.ineligibleReason})
                                  </span>
                                ) : limitInfo.isTerminated && limitInfo.terminationReason !== '주택당첨' ? (
                                  <span className="text-[10.5px] text-rose-500 font-medium">
                                    (중도해지 공제제외)
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[#4F46E5] font-semibold">
                                    공제(40%) {limitInfo.deductionAmount.toLocaleString()}원
                                  </span>
                                )}
                                {rawAmount > limitInfo.limitAmount && !limitInfo.ineligibleReason && (!limitInfo.isTerminated || limitInfo.terminationReason === '주택당첨') && (
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    (납입 {rawAmount.toLocaleString()}원 / 한도적용)
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
          </div>

          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('housing_savings_view')}
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
      {/* 4. 주택마련저축 추가/수정 폼 (housing_savings_add)                          */}
      {/* ========================================================================= */}
      {viewMode === 'housing_savings_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('housing_savings_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '주택마련저축 수정' : '주택마련저축 추가'}
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
                주택마련저축 기타자료를<br />
                {editingItemId ? '수정하세요.' : '입력하세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                주택청약종합저축 등 납입 정보를 입력해주세요.<br />
                기타자료 추가 시에는 은행 발급 납입증명서를 구비해야 합니다.
              </p>
            </div>

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

              {/* 저축 구분* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  저축 구분<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="주택청약종합저축">주택청약종합저축</option>
                    <option value="청약저축">청약저축</option>
                    <option value="근로자주택마련저축">근로자주택마련저축</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 가입 은행* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  가입 은행<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formBank}
                  onChange={(e) => setFormBank(e.target.value)}
                  placeholder="예: KB국민은행, 우리은행, 신한은행"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 계좌번호 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  계좌번호
                </label>
                <input
                  type="text"
                  value={formAccount}
                  onChange={(e) => setFormAccount(e.target.value)}
                  placeholder="예: 123-456-789012"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                />
              </div>

              {/* 가입일자 (국세청 서식 필수 항목 - 가입시기에 따른 법령 요건 적용) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500">
                    가입일자<span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10.5px] text-[#4F46E5] font-semibold">
                    국세청 서식 필수
                  </span>
                </div>
                <input
                  type="text"
                  value={formJoinDate}
                  onChange={(e) => setFormJoinDate(e.target.value)}
                  placeholder="예: 2020.05.15"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                />
                <p className="text-[10.5px] text-slate-400">
                  ※ 2014.12.31 이전 가입자 등 가입시기에 따라 법령 요건이 상이하므로 정확히 입력해주세요.
                </p>
              </div>

              {/* 무주택 확인서 제출 여부 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500">
                    무주택 확인서 제출 여부
                  </label>
                  <span className="text-[10px] text-amber-600 font-medium">다음연도 2월말까지 제출 필수</span>
                </div>
                <div className="flex items-center gap-4 pt-0.5">
                  <label
                    onClick={() => setFormSubmitProof(true)}
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        formSubmitProof ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {formSubmitProof && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>제출 완료 (또는 2월말까지 제출 예정)</span>
                  </label>
                  <label
                    onClick={() => setFormSubmitProof(false)}
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        !formSubmitProof ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {!formSubmitProof && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>미제출</span>
                  </label>
                </div>
              </div>

              {/* 연도 중 중도해지 여부 및 해지사유 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500">
                    연도 중 중도해지 여부
                  </label>
                  <span className="text-[10.5px] text-slate-400">
                    {formIsTerminated ? (formTerminationReason === '주택당첨' ? '당첨해지: 공제가능' : '일반해지: 공제제외') : '정상 유지 중'}
                  </span>
                </div>
                <div className="flex items-center gap-4 pt-0.5">
                  <label
                    onClick={() => setFormIsTerminated(false)}
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        !formIsTerminated ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {!formIsTerminated && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>정상 유지</span>
                  </label>
                  <label
                    onClick={() => setFormIsTerminated(true)}
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        formIsTerminated ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {formIsTerminated && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>중도 해지</span>
                  </label>
                </div>

                {formIsTerminated && (
                  <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600">해지 사유 구분</label>
                    <div className="flex items-center gap-4">
                      <label
                        onClick={() => setFormTerminationReason('주택당첨')}
                        className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                            formTerminationReason === '주택당첨' ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {formTerminationReason === '주택당첨' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span>주택 당첨으로 인한 해지 (공제가능)</span>
                      </label>
                      <label
                        onClick={() => setFormTerminationReason('일반해지')}
                        className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                            formTerminationReason === '일반해지' ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {formTerminationReason === '일반해지' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span>일반 중도해지 (공제불가)</span>
                      </label>
                    </div>
                    <p className="text-[10.5px] text-amber-600">
                      ※ 세법상 연도 중 중도해지 시 공제 불가하나, '주택 당첨'으로 해지된 청약저축은 공제 가능합니다.
                    </p>
                  </div>
                )}
              </div>

              {/* 납입금액* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500">
                    당해년도 납입금액<span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10.5px] text-[#4F46E5] font-semibold">
                    {formType === '근로자주택마련저축' ? '연간 180만원 한도' : '연간 300만원 한도'}
                  </span>
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
                {(() => {
                  const rawVal = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
                  const maxLimit = formType === '근로자주택마련저축' ? 1800000 : 3000000;
                  if (rawVal > maxLimit) {
                    return (
                      <p className="text-[10.5px] text-amber-600 font-medium pt-1">
                        * 연간 한도 {maxLimit.toLocaleString()}원 초과 납입액은 목록 및 소득공제 시 {maxLimit.toLocaleString()}원으로 한도 적용됩니다.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* 법정 공제 요건 핵심 안내 박스 (첨부 이미지 규정 100% 반영) */}
              <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-1.5">
                <div className="font-bold text-[#4F46E5] text-[11.5px]">📌 주택마련저축 공제 요건 핵심 안내</div>
                <div>• <strong>공제대상:</strong> 총급여 7,000만원 이하 무주택 세대의 세대주 본인 명의 납입액의 40% (세대주가 아닌 경우 공제 제외)</div>
                <div>• <strong>납입한도:</strong> 청약저축·주택청약종합저축 연 300만원 한도, 근로자주택 월 15만원(연 180만원) 이하</div>
                <div>• <strong>공제한도:</strong> 주택임차차입금 원리금상환액과 합하여 연 400만원 한도</div>
                <div>• <strong>무주택확인서:</strong> 다음연도 2월말까지 저축취급기관(은행)에 제출해야 공제 가능</div>
                <div>• <strong>중도해지:</strong> 연도 중 해지 시 공제 제외 (단, 주택 당첨으로 해지된 청약저축은 공제 가능)</div>
                <div>• <strong>가입시기 특례:</strong> 2009.12.31 이전 가입 청약저축은 기준시가 3억원 이하 1주택 세대주도 공제 가능</div>
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
                  setViewMode('housing_savings_checklist');
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
                  setViewMode('housing_savings_view');
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
              <h3 className="text-base font-bold text-slate-900">주택마련저축 소득공제 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                주택청약종합저축 소득공제를 위한 필수 증빙 안내입니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 인정 서류: 주택마련저축 납입증명서, 무주택확인서(은행 제출용), 주민등록표등본</div>
              <div>• 은행 제출: 연말정산 전까지 가입 은행에 '무주택확인서'를 1회 제출해야 간소화에 자동 조회</div>
              <div>• 공제한도: 연간 납입액(최대 300만원)의 40% (최대 연 120만원 소득공제)</div>
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

