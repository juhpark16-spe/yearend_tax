import React, { useState, useEffect } from 'react';

/**
 * [기타공제] 상세 화면 컴포넌트
 * 1. 기타공제 조회 (other_deduct_view) - 기타공제 명세 아래 공제 구분별 금액 표기, 인별 아코디언(공제 구분만 간단히 표기)
 * 2. 기타공제 수정 (other_deduct_edit) - 국세청/기타자료 분리, 인별 상세내용에 공제 구분만 표기
 * 3. 기타공제 추가/수정 (other_deduct_add) - 공제구분(혼인세액공제/납세조합공제), 세부 입력 필드
 */
export default function OtherDeductSection({
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
  const [formType, setFormType] = useState('혼인세액공제');

  // 혼인세액공제 전용 필드
  const [formSpouseName, setFormSpouseName] = useState('');
  const [formMarriageDate, setFormMarriageDate] = useState('');

  // 납세조합공제 전용 필드
  const [formAssocName, setFormAssocName] = useState('');
  const [formAssocBizNumber, setFormAssocBizNumber] = useState('');
  const [formAssocTax, setFormAssocTax] = useState('');

  // 최종 공제신청금액
  const [formAmount, setFormAmount] = useState('');

  // familyMembers 또는 workerName 변경 시 폼 이름 동기화
  useEffect(() => {
    if (!editingItemId) {
      const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
      setFormName((workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim());
    }
  }, [familyMembers, workerName, editingItemId]);

  // 금액 계산
  const totalMarriageDeduct = items
    .filter((i) => i.type && i.type.includes('혼인'))
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const totalTaxAssocDeduct = items
    .filter((i) => i.type && i.type.includes('납세조합'))
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const totalAmount = items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  // 추가 폼 열기
  const handleOpenAdd = () => {
    setEditingItemId(null);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanSelfName = (workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanSelfName);
    setFormType('혼인세액공제');
    setFormSpouseName('');
    setFormMarriageDate('');
    setFormAssocName('');
    setFormAssocBizNumber('');
    setFormAssocTax('');
    setFormAmount('');
    setViewMode('other_deduct_add');
  };

  // 수정 폼 열기
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const cleanItemName = (item.name || workerName || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanItemName);
    setFormType(item.type || '혼인세액공제');
    setFormSpouseName(item.spouseName || '');
    setFormMarriageDate(item.marriageDate || '');
    setFormAssocName(item.assocName || '');
    setFormAssocBizNumber(item.assocBizNumber || '');
    setFormAssocTax(item.assocTax ? Number(item.assocTax).toLocaleString() : '');
    setFormAmount(item.amount ? Number(item.amount).toLocaleString() : '');
    setViewMode('other_deduct_add');
  };

  // 공제구분 변경 핸들러
  const handleTypeChange = (newType) => {
    setFormType(newType);
    if (newType === '혼인세액공제') {
      setFormSpouseName('');
      setFormMarriageDate('');
      setFormAmount('');
    } else {
      setFormAssocName('');
      setFormAssocBizNumber('');
      setFormAssocTax('');
      setFormAmount('');
    }
  };

  // 납세조합 원천징수세액 입력 시 5% 자동 계산
  const handleAssocTaxChange = (val) => {
    const raw = val.replace(/[^0-9]/g, '');
    const cleanTax = parseInt(raw, 10) || 0;
    setFormAssocTax(cleanTax ? cleanTax.toLocaleString() : '');
    const credit = Math.floor(cleanTax * 0.05);
    setFormAmount(credit ? credit.toLocaleString() : '');
  };

  // 저장 핸들러
  const handleSave = (e) => {
    if (e) e.preventDefault();
    let cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    if (formType === '혼인세액공제' && cleanAmount <= 0) {
      cleanAmount = 500000;
    }

    if (formType === '혼인세액공제') {
      if (!formSpouseName.trim()) {
        showAlert('배우자 성명을 입력해주세요.');
        return;
      }
      if (!formMarriageDate.trim()) {
        showAlert('혼인신고일자를 입력해주세요.');
        return;
      }
    } else {
      if (!formAssocName.trim()) {
        showAlert('납세조합명을 입력해주세요.');
        return;
      }
      if (!formAssocBizNumber.trim()) {
        showAlert('납세조합 사업자등록번호를 입력해주세요.');
        return;
      }
      if (cleanAmount <= 0) {
        showAlert('공제금액을 입력해주세요.');
        return;
      }
    }

    const cleanName = (formName || workerName || '본인').replace(/\(.*?\)/g, '').trim();

    if (editingItemId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                name: cleanName,
                relation: '본인',
                type: formType,
                spouseName: formSpouseName.trim(),
                marriageDate: formMarriageDate.trim(),
                assocName: formAssocName.trim(),
                assocBizNumber: formAssocBizNumber.trim(),
                assocTax: parseInt(String(formAssocTax).replace(/[^0-9]/g, ''), 10) || 0,
                amount: cleanAmount,
              }
            : item
        )
      );
      setToastMsg('기타공제 자료가 수정되었습니다.');
    } else {
      const newItem = {
        id: `other_ded_${Date.now()}`,
        name: cleanName,
        relation: '본인',
        type: formType,
        spouseName: formSpouseName.trim(),
        marriageDate: formMarriageDate.trim(),
        assocName: formAssocName.trim(),
        assocBizNumber: formAssocBizNumber.trim(),
        assocTax: parseInt(String(formAssocTax).replace(/[^0-9]/g, ''), 10) || 0,
        amount: cleanAmount,
        isNts: false,
        source: 'other',
      };
      setItems((prev) => [...prev, newItem]);
      setToastMsg('기타공제 자료가 등록되었습니다.');
    }

    setViewMode('other_deduct_edit');
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
      {/* 1. 기타공제 조회 화면 (other_deduct_view)                                   */}
      {/* ========================================================================= */}
      {viewMode === 'other_deduct_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 기타공제 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">기타공제 조회</span>
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
            {/* 기타공제 명세 히어로 카드 */}
            <div className={`w-full ${totalAmount > 0 ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-3.5' : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'} rounded-2xl text-white shadow-md transition-all`}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold tracking-tight">기타공제 세액공제 명세</span>
                  <span
                    onClick={onOpenGuide}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="기타공제 안내"
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
                        <span className="text-sm font-semibold text-white/90">⨁</span>
                        <span className="text-sm font-semibold tracking-tight">기타공제 세액공제 합계</span>
                      </div>
                      <span className="text-base font-bold font-mono tracking-tight">
                        {totalAmount.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>혼인세액공제 (1인 50만원)</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalMarriageDeduct.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>납세조합공제 (원천세 5%)</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalTaxAssocDeduct.toLocaleString()}원
                      </span>
                    </div>
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
                        const memberTotal = memberItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
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

                            {/* 아코디언 펼침 상세 내역: 공제 구분만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">
                                      {it.type || '기타공제'}
                                    </span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(it.amount || 0).toLocaleString()}원
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
                        const memberTotal = memberItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
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

                            {/* 아코디언 펼침 상세 내역: 공제 구분만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">
                                      {it.type || '기타공제'}
                                    </span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(it.amount || 0).toLocaleString()}원
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
                  setViewMode('other_deduct_edit');
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
      {/* 2. 기타공제 수정 화면 (other_deduct_edit)                                   */}
      {/* ========================================================================= */}
      {viewMode === 'other_deduct_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('other_deduct_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">기타공제 수정</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                기타공제 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 요구사항 1 & 3: 성명란 본인/부양가족 삭제, 인별 상세내용에 공제 구분만 표기 */}
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
                              {/* 인별 상세내용에 공제 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '기타공제'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                {Number(item.amount || 0).toLocaleString()}원
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
                              {/* 인별 상세내용에 공제 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '기타공제'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                {Number(item.amount || 0).toLocaleString()}원
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
              onClick={() => setViewMode('other_deduct_view')}
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
      {/* 3. 기타공제 추가/수정 폼 (other_deduct_add)                                 */}
      {/* ========================================================================= */}
      {viewMode === 'other_deduct_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('other_deduct_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '기타공제 수정' : '기타공제 추가'}
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
                기타공제 자료를<br />
                {editingItemId ? '수정하세요.' : '입력하세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                혼인세액공제(생애 1회 50만원) 또는 납세조합공제(원천세액 5%) 정보를 입력하세요.
              </p>
            </div>

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

              {/* 공제 구분* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  공제 구분<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="혼인세액공제">혼인세액공제 (1인 50만원, 생애 1회)</option>
                    <option value="납세조합공제">납세조합공제 (원천징수세액의 5%)</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* ===================== 혼인세액공제 전용 필드 ===================== */}
              {formType === '혼인세액공제' && (
                <>
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      배우자 성명<span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formSpouseName}
                      onChange={(e) => setFormSpouseName(e.target.value)}
                      placeholder=""
                      className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                    />
                  </div>

                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      혼인신고일자<span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formMarriageDate}
                      onChange={(e) => setFormMarriageDate(e.target.value)}
                      placeholder=""
                      className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                    />
                    <p className="text-[11px] text-slate-400">
                      (2024.1.1 ~ 2026.12.31 중 혼인신고한 경우 적용 대상)
                    </p>
                  </div>
                </>
              )}

              {/* ===================== 납세조합공제 전용 필드 ===================== */}
              {formType === '납세조합공제' && (
                <>
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      납세조합명<span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAssocName}
                      onChange={(e) => setFormAssocName(e.target.value)}
                      placeholder=""
                      className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                    />
                  </div>

                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      조합 사업자등록번호<span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAssocBizNumber}
                      onChange={(e) => setFormAssocBizNumber(e.target.value)}
                      placeholder=""
                      className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                    />
                  </div>

                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      당해년도 원천징수세액<span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={formAssocTax}
                        onChange={(e) => handleAssocTaxChange(e.target.value)}
                        placeholder=""
                        className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                      />
                      <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                    </div>
                  </div>
                </>
              )}

              {/* 세액공제 신청금액* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  {formType === '혼인세액공제' ? '세액공제 금액 (정액)' : '세액공제액 (원천세의 5%)'}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={formAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setFormAmount(raw ? Number(raw).toLocaleString() : '');
                    }}
                    placeholder=""
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                </div>
              </div>

              {/* 안내 문구 박스 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-[#4F46E5]">📌 세액공제 요건 안내</div>
                {formType === '혼인세액공제' ? (
                  <>
                    <div>• 2024.1.1 ~ 2026.12.31 혼인신고한 거주자에게 1인당 50만원 세액공제 (생애 1회)</div>
                    <div>• 부부 모두 근로자인 경우 각각 신청하여 최대 100만원 공제 가능</div>
                  </>
                ) : (
                  <>
                    <div>• 납세조합에 가입하여 매월 원천징수된 세액의 5%를 산출세액에서 공제 (소득세법 제150조)</div>
                    <div>• 납세조합이 발행한 원천징수영수증 또는 확인서 증빙 첨부 필수</div>
                  </>
                )}
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
              <h3 className="text-base font-bold text-slate-900">기타공제 증빙자료 안내</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                혼인세액공제 및 납세조합공제를 위한 필수 증빙 안내입니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1.5">
              <div>
                <span className="font-bold text-slate-800">• 혼인세액공제:</span> 혼인관계증명서 (상세)
                <div className="text-[10.5px] text-slate-400 pl-2">
                  혼인신고일자 및 배우자 인적사항 확인용 (정부24 또는 주민센터 발급)
                </div>
              </div>
              <div className="pt-1 border-t border-slate-100">
                <span className="font-bold text-slate-800">• 납세조합공제:</span> 납세조합 원천징수영수증
                <div className="text-[10.5px] text-slate-400 pl-2">
                  소속 납세조합에서 발행한 당해연도 원천징수영수증 (5% 공제액 기재)
                </div>
              </div>
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
