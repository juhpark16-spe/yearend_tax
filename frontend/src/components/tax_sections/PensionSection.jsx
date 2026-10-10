import React, { useState, useEffect } from 'react';
import { classifyPensionType, allocatePensionLimits } from '../../utils/pensionLimit';

/**
 * [연금저축/연금계좌] 상세 화면 컴포넌트
 * 1. 연금계좌 조회 (pension_view) - 히어로 카드, 인별 아코디언(연금 구분만 간단히 표기)
 * 2. 연금계좌 수정 (pension_edit) - 국세청/기타자료 분리, 인별 상세내용에 연금 구분만 표기
 * 3. 연금계좌 추가/수정 (pension_add) - 연금구분(개인연금저축, 연금저축, 퇴직연금), 계약시작일, 납입금액
 */

// 연금 항목별 인별 한도 및 조건 반영 매핑 계산 헬퍼
// - 개인연금저축: 납입액 40% 최대 72만원 (소득공제)
// - 연금계좌 세액공제 한도: 연금저축 600만원 (퇴직연금 합산 900만원) + min(ISA납입액 x 10%, 300만원)
// - 한도 차감순서: 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축
export const calculatePensionDisplayMap = (itemList = []) => {
  const resultMap = {};
  if (!Array.isArray(itemList) || itemList.length === 0) return resultMap;

  let personalRemaining = 720000;
  const paid = { irp: 0, saving: 0, isaIrp: 0, isaSaving: 0 };

  // 1. 개인연금저축(소득공제) 및 연금계좌(세액공제) 납입액 집계
  itemList.forEach((item) => {
    const raw = Number(item.rawAmount ?? item.amount ?? 0);
    const kind = classifyPensionType(item.type);

    if (kind === 'personal') {
      let qualifies = true;
      if (item.startDate) {
        const digits = String(item.startDate).replace(/[^0-9]/g, '');
        if (digits.length >= 4 && parseInt(digits.slice(0, 4), 10) > 2000) {
          qualifies = false;
        }
      }
      if (!qualifies) {
        resultMap[item.id] = 0;
      } else {
        const deductible = Math.floor(raw * 0.4);
        const applied = Math.max(0, Math.min(deductible, personalRemaining));
        resultMap[item.id] = applied;
        personalRemaining -= applied;
      }
    } else {
      paid[kind] += raw;
    }
  });

  // 2. 구분별 한도 적용 후, 같은 구분 내에서는 순서대로 한도를 소진
  // 차감순서: 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축
  const { applied: kindApplied } = allocatePensionLimits(paid);
  const kindRemaining = { ...kindApplied };

  itemList.forEach((item) => {
    const kind = classifyPensionType(item.type);
    if (kind === 'personal') return;
    const raw = Number(item.rawAmount ?? item.amount ?? 0);
    const applied = Math.max(0, Math.min(raw, kindRemaining[kind]));
    resultMap[item.id] = applied;
    kindRemaining[kind] -= applied;
  });

  return resultMap;
};

// 단일 연금 항목 표시 금액 계산 헬퍼
export const getPensionDisplayAmount = (item, allItems = []) => {
  if (allItems && allItems.length > 0) {
    const map = calculatePensionDisplayMap(allItems);
    if (item.id && map[item.id] !== undefined) return map[item.id];
  }
  const raw = Number(item.rawAmount ?? item.amount ?? 0);
  const pType = (item.type || '').trim();

  if (pType.includes('개인연금저축')) {
    let qualifies = true;
    if (item.startDate) {
      const digits = String(item.startDate).replace(/[^0-9]/g, '');
      if (digits.length >= 4 && parseInt(digits.slice(0, 4), 10) > 2000) {
        qualifies = false;
      }
    }
    return qualifies ? Math.min(720000, Math.floor(raw * 0.4)) : 0;
  }

  const kind = classifyPensionType(pType);
  const paid = { irp: 0, saving: 0, isaIrp: 0, isaSaving: 0 };
  paid[kind] = raw;
  const { applied } = allocatePensionLimits(paid);
  return applied[kind] ?? raw;
};

// 인별 연금 요약 헬퍼
export const getMemberPensionSummary = (memberItems) => {
  const displayMap = calculatePensionDisplayMap(memberItems);
  const typeSummary = {
    '개인연금저축': 0,
    '연금저축': 0,
    '퇴직연금': 0,
    'ISA퇴직연금': 0,
    'ISA연금저축': 0,
  };

  memberItems.forEach((i) => {
    let t = i.type || '연금저축';
    const kind = classifyPensionType(t);
    if (kind === 'isaIrp') t = 'ISA퇴직연금';
    else if (kind === 'isaSaving') t = 'ISA연금저축';
    else if (kind === 'irp') t = '퇴직연금';
    else if (kind === 'personal') t = '개인연금저축';
    else t = '연금저축';

    const amt = displayMap[i.id] ?? getPensionDisplayAmount(i, memberItems);
    typeSummary[t] = (typeSummary[t] || 0) + amt;
  });

  const memberTotal = Object.values(typeSummary).reduce((acc, v) => acc + v, 0);
  return { typeSummary, memberTotal };
};

export default function PensionSection({
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
}) {
  const [showProofModal, setShowProofModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const toggleAccordion = (id) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  // 폼 입력 상태
  const selfMember = familyMembers.find((m) => m.isSelf || m.relation === '본인');
  const defaultWorkerName = (workerName || selfMember?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
  const [editingItemId, setEditingItemId] = useState(null);
  const [formName, setFormName] = useState(defaultWorkerName);
  const [formType, setFormType] = useState('연금저축');
  const [formBank, setFormBank] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formAmount, setFormAmount] = useState('');

  // 인별 한도 적용 리스트 디스플레이 맵 계산
  const displayMap = calculatePensionDisplayMap(items);

  // familyMembers 또는 workerName 변경 시 폼 이름 동기화
  useEffect(() => {
    if (!editingItemId) {
      const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
      setFormName((workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim());
    }
  }, [familyMembers, workerName, editingItemId]);

  // 히어로 카드 금액 계산
  const allCleanNames = Array.from(new Set(items.map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())));
  let totalPersonalSavings = 0;
  let totalSavings = 0;
  let totalIrp = 0;
  let totalIsaIrp = 0;
  let totalIsaSaving = 0;
  let totalAmount = 0;

  allCleanNames.forEach((mName) => {
    const mItems = items.filter((i) => (i.name || '').replace(/\(.*?\)/g, '').trim() === mName);
    const { typeSummary, memberTotal } = getMemberPensionSummary(mItems);
    totalPersonalSavings += typeSummary['개인연금저축'] || 0;
    totalSavings += typeSummary['연금저축'] || 0;
    totalIrp += typeSummary['퇴직연금'] || 0;
    totalIsaIrp += typeSummary['ISA퇴직연금'] || 0;
    totalIsaSaving += typeSummary['ISA연금저축'] || 0;
    totalAmount += memberTotal;
  });

  // 추가 폼 열기
  const handleOpenAdd = () => {
    setEditingItemId(null);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanSelfName = (workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanSelfName);
    setFormType('연금저축');
    setFormBank('');
    setFormAccount('');
    setFormStartDate('');
    setFormAmount('');
    setViewMode('pension_add');
  };

  // 수정 폼 열기
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const cleanItemName = (item.name || workerName || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanItemName);
    let pType = item.type || '연금저축';
    const pKind = classifyPensionType(pType);
    if (pKind === 'isaIrp') pType = 'ISA퇴직연금';
    else if (pKind === 'isaSaving') pType = 'ISA연금저축';
    else if (pKind === 'irp') pType = '퇴직연금';
    else if (pKind === 'personal') pType = '개인연금저축';
    else pType = '연금저축';

    setFormType(pType);
    setFormBank(item.bank || '');
    setFormAccount(item.account || '');
    setFormStartDate(item.startDate || '');
    const rawVal = item.rawAmount ?? item.amount ?? '';
    setFormAmount(rawVal ? Number(rawVal).toLocaleString() : '');
    setViewMode('pension_add');
  };

  // 저장 핸들러
  const handleSave = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanName = (formName || workerName || '본인').replace(/\(.*?\)/g, '').trim();

    if (!formBank.trim()) {
      showAlert('금융기관명을 입력해주세요.');
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
                name: cleanName,
                relation: '본인',
                type: formType,
                bank: formBank.trim(),
                account: formAccount.trim(),
                startDate: formStartDate.trim(),
                rawAmount: cleanAmount,
                amount: cleanAmount,
              }
            : item
        )
      );
      setToastMsg('연금계좌 자료가 수정되었습니다.');
    } else {
      const newItem = {
        id: `pension_${Date.now()}`,
        name: cleanName,
        relation: '본인',
        type: formType,
        bank: formBank.trim(),
        account: formAccount.trim(),
        startDate: formStartDate.trim(),
        rawAmount: cleanAmount,
        amount: cleanAmount,
        isNts: false,
        source: 'other',
      };
      setItems((prev) => [...prev, newItem]);
      setToastMsg('연금계좌 자료가 등록되었습니다.');
    }

    setViewMode('pension_edit');
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
      {/* 1. 연금계좌 조회 화면 (pension_view)                                       */}
      {/* ========================================================================= */}
      {viewMode === 'pension_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 연금저축/연금계좌 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">연금저축/연금계좌 조회</span>
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
            {/* 연금계좌 명세 히어로 카드 */}
            <div className={`w-full ${totalAmount > 0 ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-3.5' : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'} rounded-2xl text-white shadow-md transition-all`}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold tracking-tight">연금계좌 세액공제 명세</span>
                  <span
                    onClick={onOpenGuide}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="연금계좌 안내"
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
                        <span className="text-sm font-semibold text-white/90">🪙</span>
                        <span className="text-sm font-semibold tracking-tight">연금계좌 공제대상 합계</span>
                      </div>
                      <span className="text-base font-bold font-mono tracking-tight">
                        {totalAmount.toLocaleString()}원
                      </span>
                    </div>

                    {totalPersonalSavings > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>개인연금저축</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalPersonalSavings.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>연금저축</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalSavings.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>퇴직연금</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalIrp.toLocaleString()}원
                      </span>
                    </div>

                    {totalIsaIrp > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>ISA퇴직연금</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalIsaIrp.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {totalIsaSaving > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>ISA연금저축</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalIsaSaving.toLocaleString()}원
                        </span>
                      </div>
                    )}
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
                    onClick={handleOpenAdd}
                    className="px-5 py-2 rounded-lg border border-indigo-300 text-[#4F46E5] bg-white hover:bg-indigo-50/60 font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <span>+ 자료입력</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                {/* 1. 국세청자료 (요구사항 1, 2: 성명 본인/부양가족 삭제, 인별 박스 클릭 시 연금 구분만 표기) */}
                {items.filter((i) => i.isNts).length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          items
                            .filter((i) => i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName, memberIdx) => {
                        const memberItems = items.filter(
                          (i) => i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const { typeSummary, memberTotal } = getMemberPensionSummary(memberItems);
                        const isExpanded = !!expandedIds[`nts_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-indigo-300'
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

                            {/* 아코디언 펼침 상세 내역 (연금 구분만 간단히 표기) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {Object.entries(typeSummary)
                                  .filter(([typeKey, amt]) => amt > 0 || memberItems.some((i) => {
                                    const kind = classifyPensionType(i.type);
                                    const map = { irp: '퇴직연금', saving: '연금저축', isaIrp: 'ISA퇴직연금', isaSaving: 'ISA연금저축', personal: '개인연금저축' };
                                    return map[kind] === typeKey;
                                  }))
                                  .map(([typeKey, amt]) => (
                                    <div
                                      key={typeKey}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-slate-600">{typeKey}</span>
                                      <span className="font-bold font-mono text-slate-900 text-[13px]">
                                        {Number(amt).toLocaleString()}원
                                      </span>
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

                {/* 2. 기타자료 (요구사항 1, 2: 성명 본인/부양가족 삭제, 인별 박스 클릭 시 연금 구분만 표기) */}
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
                        const { typeSummary, memberTotal } = getMemberPensionSummary(memberItems);
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
                              <span className="text-[15px] font-bold text-slate-900 tracking-tight">
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

                            {/* 아코디언 펼침 상세 내역 (연금 구분만 간단히 표기) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {Object.entries(typeSummary)
                                  .filter(([typeKey, amt]) => amt > 0 || memberItems.some((i) => {
                                    const kind = classifyPensionType(i.type);
                                    const map = { irp: '퇴직연금', saving: '연금저축', isaIrp: 'ISA퇴직연금', isaSaving: 'ISA연금저축', personal: '개인연금저축' };
                                    return map[kind] === typeKey;
                                  }))
                                  .map(([typeKey, amt]) => (
                                    <div
                                      key={typeKey}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-slate-600">{typeKey}</span>
                                      <span className="font-bold font-mono text-slate-900 text-[13px]">
                                        {Number(amt).toLocaleString()}원
                                      </span>
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
                if (items.length === 0) {
                  handleOpenAdd();
                } else {
                  setViewMode('pension_edit');
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
      {/* 2. 연금계좌 수정 화면 (pension_edit)                                       */}
      {/* ========================================================================= */}
      {viewMode === 'pension_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('pension_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">연금저축/연금계좌 수정</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                연금계좌 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                연금저축 및 퇴직연금 납입 정보를 확인하세요.<br />
                기타자료를 편집할 경우에는 꼭 금융회사 납입확인서를 확인하시기 바랍니다.
              </p>
            </div>

            {/* 요구사항 1 & 3: 본인/부양가족 삭제, 인별 상세내용에 연금 구분만 표기 (국세청/기타자료 모두다) */}
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
                              {/* 인별 상세내용에 연금 구분만 표기 */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '연금저축'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                {(displayMap[item.id] ?? getPensionDisplayAmount(item, items)).toLocaleString()}원
                              </span>
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
                              {/* 인별 상세내용에 연금 구분만 표기 */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '연금저축'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                {(displayMap[item.id] ?? getPensionDisplayAmount(item, items)).toLocaleString()}원
                              </span>
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
              onClick={() => setViewMode('pension_view')}
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
      {/* 3. 연금계좌 추가/수정 폼 (pension_add)                                      */}
      {/* ========================================================================= */}
      {viewMode === 'pension_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('pension_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '연금계좌 수정' : '연금계좌 추가'}
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
                연금계좌 자료를<br />
                {editingItemId ? '수정하세요.' : '입력하세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                연금저축 및 퇴직연금 납입 정보를 입력해주세요.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4 pt-1">
              {/* 성명* (본인, 부양가족 표기 삭제) */}
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

              {/* 연금 구분* (개인형퇴직연금(IRP), 확정기여형 퇴직연금 삭제하고 퇴직연금 추가) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  연금 구분<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="개인연금저축">개인연금저축</option>
                    <option value="연금저축">연금저축</option>
                    <option value="퇴직연금">퇴직연금</option>
                    <option value="ISA퇴직연금">ISA퇴직연금 (ISA 만기자금 전환)</option>
                    <option value="ISA연금저축">ISA연금저축 (ISA 만기자금 전환)</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 금융기관명* (연말정산 PDF자료의 '상호'부분 작성) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  금융기관명<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formBank}
                  onChange={(e) => setFormBank(e.target.value)}
                  placeholder={
                    formType === '퇴직연금'
                      ? '예: 주식회사 하나은행'
                      : formType === '연금저축'
                      ? '예: 신용협동조합중앙회, 엔에이치투자증권(주)'
                      : '예: 수산업협동조합중앙회, 신한투자증권(주)'
                  }
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 계좌번호 (연말정산 PDF자료의 '계좌번호' 부분 작성 / 상호 아래줄 계좌번호) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  계좌번호
                </label>
                <input
                  type="text"
                  value={formAccount}
                  onChange={(e) => setFormAccount(e.target.value)}
                  placeholder={
                    formType === '퇴직연금'
                      ? '예: 91991001712345, 68991007021234'
                      : formType === '연금저축'
                      ? '예: 3304271234, 06905201234'
                      : '예: 04411218821234, 03001107662345'
                  }
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                />
              </div>

              {/* 계약시작일 (요구사항 5: 개인연금저축 선택 시 계약시작일 항목 추가) */}
              {formType === '개인연금저축' && (
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500">
                      계약시작일
                    </label>
                    <span className="text-[11px] text-slate-400">
                      2000.12.31 이전 가입분만 공제 대상
                    </span>
                  </div>
                  <input
                    type="text"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    placeholder="예: 1998-07-23"
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                </div>
              )}

              {/* 당해년도 납입금액* (해당 행의 '납입금액 계' 또는 상호 행의 오른쪽 끝칸 '순납입금액') */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500">
                    당해년도 납입금액<span className="text-rose-500">*</span>
                  </label>
                  {formType === '개인연금저축' && (
                    <span className="text-[11px] text-indigo-600 font-medium">
                      납입금액의 40% (최대 연 72만원) 공제 반영
                    </span>
                  )}
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

              {/* 안내 문구 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-[#4F46E5]">📌 연금계좌 공제 한도 및 조건</div>
                <div>• 개인연금저축(2000.12.31 이전 가입): 납입액의 40% 소득공제 (연 72만원 한도)</div>
                <div>• 연금저축계좌: 600만원, 퇴직연금·ISA퇴직연금 합산 시 900만원 세액공제 한도</div>
                <div>• 기존 한도 초과 시 ISA 납입금액의 10% 한도 추가 (최대 300만원)</div>
                <div>• 한도 차감순서: 퇴직연금 &gt; 연금저축 &gt; ISA퇴직연금 &gt; ISA연금저축</div>
                <div>• 공제율: 총급여 5,500만원 이하 15%, 초과 12%</div>
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
              <h3 className="text-base font-bold text-slate-900">연금계좌 납입확인서 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                연금저축 및 퇴직연금 세액공제를 위한 증빙 서류 안내입니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 인정 서류: 연금저축 납입확인서, 퇴직연금 납입증명서</div>
              <div>• 간소화자료: 국세청에서 제공하는 자료는 별도 영수증 제출 불필요</div>
              <div>• 개인연금저축: 납입액의 40% 소득공제 (최대 연 72만원)</div>
              <div>• 연금계좌(연금저축+퇴직연금): 최대 900만원 세액공제 (12%~15%)</div>
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
