import React, { useState, useEffect } from 'react';
import { buildNtsHousingLoanItems } from '../../utils/ntsChecklistItems';

/**
 * [주택자금] 상세 화면 컴포넌트
 * 1. 주택자금 조회 (housing_loan_view) - 파란색 히어로 카드, 요건 체크리스트 배너, 빈 상태/+자료입력, 국세청/기타자료 목록
 * 2. 주택자금 체크리스트 (housing_loan_checklist) - 체크1,2,3 요건 판정, 네/아니오, 공제불가 모달
 * 3. 주택자금 수정 (housing_loan_edit) - 카드형 목록, 수정/삭제 버튼, 50:50 하단 액션
 * 4. 주택자금 추가/수정 (housing_loan_add) - 자금구분, 금융기관, 계좌번호, 상환금액
 */
export function getMortgageLoanLimit(type = '') {
  const t = String(type);
  if (t.includes('주택임차차입금')) {
    return 4000000;
  }
  // 2011년 이전 차입금
  if (t.includes('2011년이전') || t.includes('2011 이전') || t.includes('2011이전')) {
    if (t.includes('고정AND비거치') || t.includes('고정·비거치') || t.includes('2,000만')) return 20000000;
    if (t.includes('고정OR비거치') || t.includes('1,800만')) return 18000000;
    if (t.includes('30년') || t.includes('1,500만')) return 15000000;
    if (t.includes('15~29년') || t.includes('15년~29년') || t.includes('1,000만')) return 10000000;
    if (t.includes('15년미만') || t.includes('15년 미만') || t.includes('600만')) return 6000000;
    return 10000000;
  }
  // 2012년 이후 차입금 (기본)
  if (t.includes('고정AND비거치') || t.includes('고정·비거치') || t.includes('2,000만')) return 20000000;
  if (t.includes('고정OR비거치') || t.includes('1,800만')) return 18000000;
  if (t.includes('10~15년') || t.includes('10년~15년') || t.includes('600만')) return 6000000;
  if (t.includes('그밖') || t.includes('기타') || t.includes('800만')) return 8000000;
  return 8000000;
}

export default function HousingLoanSection({
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
  housingSavingsItems = [],
  totalSalary = 0,
  hometaxData,
}) {
  // 모달 상태
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

  // 세부 구분 상태 (요구사항 6, 7)
  const [loanCategory, setLoanCategory] = useState('주택임차차입금'); // '주택임차차입금' | '장기주택저당차입금'
  const [rentLoanType, setRentLoanType] = useState('대출기관 차입'); // '대출기관 차입' | '개인차입(거주자 차입)'
  const [mortgageEra, setMortgageEra] = useState('2012년 이후 차입'); // '2012년 이후 차입' | '2011년 이전 차입'
  const [isFixedRate, setIsFixedRate] = useState(false); // 고정금리
  const [isNonGrace, setIsNonGrace] = useState(false); // 비거치식

  const [formBank, setFormBank] = useState('');
  const [formBizNumber, setFormBizNumber] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formPeriod, setFormPeriod] = useState('');
  const [formAcquisitionDate, setFormAcquisitionDate] = useState('');
  const [formMortgageDate, setFormMortgageDate] = useState('');
  const [formAmount, setFormAmount] = useState('');

  // 최초차입일과 최종상환예정일로부터 차입기간(연수) 자동 계산 (요구사항 7)
  const calculatedPeriodYears = React.useMemo(() => {
    if (!formStartDate || !formEndDate) return null;
    const sStr = String(formStartDate).replace(/[^0-9]/g, '');
    const eStr = String(formEndDate).replace(/[^0-9]/g, '');
    if (sStr.length >= 4 && eStr.length >= 4) {
      const sYear = parseInt(sStr.slice(0, 4), 10);
      const eYear = parseInt(eStr.slice(0, 4), 10);
      if (eYear >= sYear) {
        let years = eYear - sYear;
        if (sStr.length >= 6 && eStr.length >= 6) {
          const sMonth = parseInt(sStr.slice(4, 6), 10);
          const eMonth = parseInt(eStr.slice(4, 6), 10);
          if (eMonth < sMonth) {
            years -= 1;
          } else if (eMonth === sMonth && sStr.length >= 8 && eStr.length >= 8) {
            const sDay = parseInt(sStr.slice(6, 8), 10);
            const eDay = parseInt(eStr.slice(6, 8), 10);
            if (eDay < sDay) years -= 1;
          }
        }
        return Math.max(1, years);
      }
    }
    return null;
  }, [formStartDate, formEndDate]);

  // 최종 자금 구분 결정 헬퍼
  const determineFinalType = () => {
    if (loanCategory === '주택임차차입금') {
      return rentLoanType === '대출기관 차입'
        ? '주택임차차입금(대출기관)'
        : '주택임차차입금(거주자)';
    }
    // 장기주택저당차입금
    const is2011 = mortgageEra.includes('2011');
    const y = calculatedPeriodYears || (parseInt(formPeriod, 10) || 15);

    if (!is2011) {
      if (y >= 15) {
        if (isFixedRate && isNonGrace) return '장기주택저당차입금(2012이후 15년이상 고정AND비거치)';
        if (isFixedRate || isNonGrace) return '장기주택저당차입금(2012이후 15년이상 고정OR비거치)';
        return '장기주택저당차입금(2012이후 15년이상 기타)';
      }
      return '장기주택저당차입금(2012이후 10~15년 고정OR비거치)';
    } else {
      if (y >= 15 && isFixedRate && isNonGrace) return '장기주택저당차입금(2011이전 15년이상 고정AND비거치)';
      if (y >= 15 && (isFixedRate || isNonGrace)) return '장기주택저당차입금(2011이전 15년이상 고정OR비거치)';
      if (y >= 30) return '장기주택저당차입금(2011이전 30년이상)';
      if (y >= 15) return '장기주택저당차입금(2011이전 15~29년)';
      return '장기주택저당차입금(2011이전 15년미만)';
    }
  };

  // familyMembers 또는 workerName이 변경되면 폼 이름 동기화
  useEffect(() => {
    if (!editingItemId) {
      const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
      setFormName((workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim());
    }
  }, [familyMembers, workerName, editingItemId]);

  // 주택자금 한도 계산 맵 (소득세법 제52조 및 국세청 증명서류 한도 산정 공식 100% 일치)
  const limitMap = React.useMemo(() => {
    // 1. 주택마련저축 공제액 (최대 400만원 한도 내)
    // 세법 요건: 총급여 7,000만 원 이하 무주택 세대주만 주택마련저축 공제 가능
    let savingsDeduction = 0;
    const isOverSavingsSalary = Number(totalSalary) > 70000000;
    if (!isOverSavingsSalary && Array.isArray(housingSavingsItems) && housingSavingsItems.length > 0) {
      let subRemaining = 3000000;
      let workerRemaining = 1800000;
      const hasMortgage = items.some((i) => i.type && i.type.includes('장기주택저당차입금') && Number(i.amount) > 0);
      housingSavingsItems.forEach((it) => {
        if (it.isTerminated && it.terminationReason !== '주택당첨') return;
        if (it.submitProof === false) return;
        const raw = Number(it.amount) || 0;
        const itType = it.type || '';
        // 장기주택저당차입금 공제 받는 경우 청약저축/주택청약종합저축은 공제 제외 (소득세법 규정: 유주택자 제외)
        if (hasMortgage && (itType.includes('청약저축') || itType.includes('주택청약종합저축') || itType.includes('주택청약'))) {
          return;
        }
        let allowed = 0;
        if (itType.includes('근로자주택')) {
          allowed = Math.min(raw, Math.max(0, workerRemaining));
          workerRemaining -= allowed;
        } else {
          allowed = Math.min(raw, Math.max(0, subRemaining));
          subRemaining -= allowed;
        }
        savingsDeduction += Math.floor(allowed * 0.4);
      });
      savingsDeduction = Math.min(4000000, savingsDeduction);
    }

    // 2. 주택임차차입금 공제액 (상환액의 40%, 1+2 <= 연 400만원 한도)
    // 세법 요건: 대부업 외 개인(거주자) 차입금은 총급여 5,000만 원 이하인 자만 공제 가능
    let rentLoanCapacity = Math.max(0, 4000000 - savingsDeduction);
    const map = {};
    const eligibleRentItems = items.filter((item) => {
      const isRent = !item.type || item.type.includes('주택임차차입금');
      if (!isRent) return false;
      const isIndividualRent = item.type?.includes('거주자') || item.type?.includes('개인차입');
      if (isIndividualRent && Number(totalSalary) > 50000000) {
        return false;
      }
      return true;
    });
    const totalRentRaw = eligibleRentItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const targetTotalRentDeduction = Math.min(Math.round(totalRentRaw * 0.4), rentLoanCapacity);

    let currentRentSum = 0;
    const allRentItems = items.filter((item) => !item.type || item.type.includes('주택임차차입금'));
    allRentItems.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const isIndividualRent = item.type?.includes('거주자') || item.type?.includes('개인차입');
      if (isIndividualRent && Number(totalSalary) > 50000000) {
        map[item.id] = {
          rawAmount: raw,
          deductionAmount: 0,
          limitAmount: 0,
          isRent: true,
          rate: 0.4,
          maxLimit: 4000000,
          ineligibleReason: '총급여 5천만원 초과 공제제외',
        };
        return;
      }

      const isLast = item.id === eligibleRentItems[eligibleRentItems.length - 1]?.id;
      let allowed = 0;
      if (isLast) {
        allowed = Math.max(0, targetTotalRentDeduction - currentRentSum);
      } else {
        allowed = Math.round(raw * 0.4);
      }
      currentRentSum += allowed;
      map[item.id] = {
        rawAmount: raw,
        deductionAmount: allowed,
        limitAmount: allowed,
        isRent: true,
        rate: 0.4,
        maxLimit: 4000000,
      };
    });

    const combined1And2 = savingsDeduction + targetTotalRentDeduction;

    // 3. 장기주택저당차입금 이자상환액 (국세청 서식 공식: 1 + 2 + [대출] <= [해당 대출한도])
    // 예: ⓘ 그밖의 대출: 1 + 2 + ⓘ <= 800만원 -> ⓘ 한도 = 8,000,000 - 2,689,587 = 5,310,413원
    const mortgageItems = items.filter((i) => i.type && i.type.includes('장기주택저당차입금'));
    const maxMortgageCeiling = mortgageItems.reduce((max, it) => Math.max(max, getMortgageLoanLimit(it.type)), 0);
    let remainingOverallCapacity = Math.max(0, maxMortgageCeiling - combined1And2);

    mortgageItems.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const itemMaxLimit = getMortgageLoanLimit(item.type);
      // 서식 산식에 따른 개별 한도: max(0, itemMaxLimit - combined1And2)
      const itemCapacity = Math.max(0, itemMaxLimit - combined1And2);
      const availableCap = Math.min(itemCapacity, remainingOverallCapacity);
      const allowed = Math.min(raw, availableCap);
      remainingOverallCapacity = Math.max(0, remainingOverallCapacity - allowed);

      map[item.id] = {
        rawAmount: raw,
        deductionAmount: allowed,
        limitAmount: allowed,
        isRent: false,
        rate: 1.0,
        maxLimit: itemMaxLimit,
      };
    });

    return map;
  }, [items, housingSavingsItems]);

  // 총 공제금액 합계 (한도계산 적용)
  const totalDeductionAmount = React.useMemo(() => {
    return Object.values(limitMap).reduce((acc, it) => acc + (it.deductionAmount || 0), 0);
  }, [limitMap]);

  // 주택임차차입금 공제액 합계
  const totalRentLoanDeduction = React.useMemo(() => {
    return Object.values(limitMap).filter((it) => it.isRent).reduce((acc, it) => acc + (it.deductionAmount || 0), 0);
  }, [limitMap]);

  // 장기주택저당차입금 공제액 합계
  const totalMortgageLoanDeduction = React.useMemo(() => {
    return Object.values(limitMap).filter((it) => !it.isRent).reduce((acc, it) => acc + (it.deductionAmount || 0), 0);
  }, [limitMap]);

  // 총 지출 상환액 합계
  const totalAmount = items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  // 추가 폼 열기
  const handleOpenAdd = () => {
    setEditingItemId(null);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanSelfName = (workerName || self?.name || familyMembers?.[0]?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanSelfName);
    setLoanCategory('주택임차차입금');
    setRentLoanType('대출기관 차입');
    setMortgageEra('2012년 이후 차입');
    setIsFixedRate(false);
    setIsNonGrace(false);
    setFormBank('');
    setFormBizNumber('');
    setFormAccount('');
    setFormStartDate('');
    setFormEndDate('');
    setFormPeriod('');
    setFormAcquisitionDate('');
    setFormMortgageDate('');
    setFormAmount('');
    setViewMode('housing_loan_add');
  };

  // 수정 폼 열기
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const self = familyMembers.find((m) => m.isSelf || m.relation === '본인');
    const cleanItemName = (item.name || workerName || self?.name || '홍길동').replace(/\(.*?\)/g, '').trim();
    setFormName(cleanItemName);

    const itType = item.type || '';
    if (itType.includes('장기주택저당차입금')) {
      setLoanCategory('장기주택저당차입금');
      setMortgageEra(itType.includes('2011') ? '2011년 이전 차입' : '2012년 이후 차입');
      setIsFixedRate(itType.includes('고정'));
      setIsNonGrace(itType.includes('비거치'));
    } else {
      setLoanCategory('주택임차차입금');
      setRentLoanType(itType.includes('거주자') || itType.includes('개인') ? '개인차입(거주자 차입)' : '대출기관 차입');
    }

    setFormBank(item.bank || '');
    setFormBizNumber(item.bizNumber || '');
    setFormAccount(item.account || '');
    setFormStartDate(item.startDate || item.loanDate || '');
    setFormEndDate(item.endDate || '');
    setFormPeriod(item.period || '');
    setFormAcquisitionDate(item.acquisitionDate || '');
    setFormMortgageDate(item.mortgageDate || '');
    setFormAmount(item.amount ? Number(item.amount).toLocaleString() : '');
    setViewMode('housing_loan_add');
  };

  // 저장 핸들러
  const handleSave = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanFormName = (formName || workerName || '홍길동').replace(/\(.*?\)/g, '').trim();

    if (!formBank.trim()) {
      showAlert(loanCategory === '주택임차차입금' && rentLoanType === '개인차입(거주자 차입)' ? '대여인 성명(차입처)을 입력해주세요.' : '취급기관(금융기관명)을 입력해주세요.');
      return;
    }
    if (cleanAmount <= 0) {
      showAlert('상환금액을 입력해주세요.');
      return;
    }

    const finalType = determineFinalType();
    const finalPeriod = loanCategory === '장기주택저당차입금'
      ? (calculatedPeriodYears ? `${calculatedPeriodYears}년` : (formPeriod.trim() || '15년'))
      : '';

    const payload = {
      name: cleanFormName,
      relation: '본인',
      type: finalType,
      bank: formBank.trim(),
      bizNumber: '', // 요구사항 6, 7: 사업자등록번호 항목 삭제
      account: formAccount.trim(),
      startDate: formStartDate.trim(),
      endDate: loanCategory === '장기주택저당차입금' ? formEndDate.trim() : '',
      period: finalPeriod,
      acquisitionDate: loanCategory === '장기주택저당차입금' ? formAcquisitionDate.trim() : '',
      mortgageDate: loanCategory === '장기주택저당차입금' ? formMortgageDate.trim() : '',
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
      setToastMsg('주택자금 자료가 수정되었습니다.');
    } else {
      const newItem = {
        id: `hloan_${Date.now()}`,
        ...payload,
        isNts: false,
        source: 'other',
      };
      setItems((prev) => [...prev, newItem]);
      setToastMsg('주택자금 자료가 등록되었습니다.');
    }

    setViewMode('housing_loan_edit');
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
      {/* 1. 주택자금 조회 화면 (housing_loan_view)                                  */}
      {/* ========================================================================= */}
      {viewMode === 'housing_loan_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 주택자금 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">주택자금 조회</span>
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
            {/* 상단 체크리스트 안내 배너 (월세액 화면 규격 100% 동일) */}
            <div className="bg-[#EEF2FF] border border-indigo-100/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div>
                <div className="flex items-center gap-1.5">
                  {checklistAnswer === 'yes' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      ✓
                    </span>
                  )}
                  <div className="font-bold text-[13px] text-slate-800 leading-snug">
                    {checklistAnswer === 'yes' ? '주택자금 소득공제 요건 충족' : '주택자금(대출) 공제를 받을 예정이신가요?'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('housing_loan_checklist')}
                  className="mt-2 py-1 px-3 rounded-lg bg-white border border-indigo-200 text-[#4F46E5] text-[11.5px] font-bold shadow-2xs hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1"
                >
                  <span>{checklistAnswer === 'yes' ? '체크리스트 재확인' : '체크리스트 진행하기'}</span>
                  <span className="text-[10px]">›</span>
                </button>
              </div>

              {/* 주택 & 서류 SVG 일러스트 */}
              <div className="w-16 h-14 flex items-center justify-center">
                <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
                  <rect x="2" y="14" width="22" height="28" rx="2" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
                  <line x1="6" y1="20" x2="18" y2="20" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="6" y1="26" x2="16" y2="26" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="6" y1="31" x2="13" y2="31" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M25 21L45 6L63 21" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="#DBEAFE" />
                  <rect x="29" y="20" width="30" height="24" rx="2.5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.2" />
                  <rect x="34" y="25" width="7" height="7" rx="1.5" fill="#93C5FD" />
                  <rect x="46" y="25" width="8" height="19" rx="1.5" fill="#2563EB" />
                  <circle cx="56" cy="40" r="3" fill="#10B981" />
                </svg>
              </div>
            </div>

            {/* 주택자금 명세 히어로 카드 */}
            <div className={`w-full ${totalAmount > 0 ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-3.5' : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'} rounded-2xl text-white shadow-md transition-all`}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-bold tracking-tight">주택자금 공제 명세</span>
                  <span
                    onClick={onOpenGuide}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="주택자금 안내"
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
                        <span className="text-sm font-semibold tracking-tight">주택자금 공제 합계</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-base font-bold font-mono tracking-tight">
                          {totalDeductionAmount.toLocaleString()}원
                        </span>
                        {totalAmount > totalDeductionAmount && (
                          <span className="text-[10px] text-indigo-200">
                            (총 상환 {totalAmount.toLocaleString()}원 / 한도적용)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>주택임차차입금(전세) 공제 (40%)</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalRentLoanDeduction.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>장기주택저당차입금(담보) 공제</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalMortgageLoanDeduction.toLocaleString()}원
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
                        const memberDeductionTotal = memberItems.reduce((acc, it) => acc + (limitMap[it.id]?.deductionAmount || 0), 0);
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
                                    {memberDeductionTotal.toLocaleString()}원
                                  </span>
                                  {memberRawTotal > memberDeductionTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      (상환 {memberRawTotal.toLocaleString()}원)
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

                            {/* 아코디언 펼침 상세 내역: 자금 구분만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">
                                      {it.type || '주택자금'}
                                    </span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {(limitMap[it.id]?.deductionAmount || 0).toLocaleString()}원
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
                        const memberDeductionTotal = memberItems.reduce((acc, it) => acc + (limitMap[it.id]?.deductionAmount || 0), 0);
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
                                    {memberDeductionTotal.toLocaleString()}원
                                  </span>
                                  {memberRawTotal > memberDeductionTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      (상환 {memberRawTotal.toLocaleString()}원)
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

                            {/* 아코디언 펼침 상세 내역: 자금 구분만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">
                                      {it.type || '주택자금'}
                                    </span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {(limitMap[it.id]?.deductionAmount || 0).toLocaleString()}원
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

          {/* 하단 고정 액션 버튼 (50:50 너비) */}
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
                  setViewMode('housing_loan_edit');
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
      {/* 2. 주택자금 요건 체크리스트 화면 (housing_loan_checklist)                    */}
      {/* ========================================================================= */}
      {viewMode === 'housing_loan_checklist' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('housing_loan_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">주택자금 요건 체크리스트</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <div className="font-bold text-[#4F46E5] text-[12.5px]">
                ⓘ 주택자금에 대한 소득공제를 받으시나요?
              </div>
              <p className="text-[11.5px] text-slate-500">
                아래 요건을 모두 충족해야 공제가 가능해요.<br />
                한 개라도 충족되지 않으면 '아니오'를 선택해주세요.
              </p>
            </div>

            {/* 3대 체크 카드 */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-5 text-xs">
              <div className="space-y-1.5">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크1
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  근로자 본인이 2025.12.31 기준 무주택 세대주이거나<br />
                  1주택 세대주(장기주택저당차입금의 경우)여야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (단, 세대주가 주택자금 공제를 받지 않은 경우 세대원도 일정 요건 하에 가능)
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크2
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  임차/취득한 주택이 국민주택규모(85㎡ 이하) 또는<br />
                  취득 당시 기준시가 5억원(2024년 이후 6억) 이하 주택이어야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (주거용 오피스텔 포함)
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크3
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  임대차계약서/등기부등본의 주소지와<br />
                  주민등록표등본의 주소지가 동일해야 해요.
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

                  const cleanWorkerName = (workerName || '본인').replace(/\(.*?\)/g, '').trim();
                  // PDF 표에서 읽은 행만 사용 (PDF에 이 항목이 없으면 직접 입력 화면으로)
                  const defaultNtsHousingLoan = hasHometaxPdf ? buildNtsHousingLoanItems(hometaxData, cleanWorkerName) : [];
                  if (defaultNtsHousingLoan.length > 0) {
                    setItems((prev) => {
                      const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
                      return [...others, ...defaultNtsHousingLoan];
                    });
                    setChecklistAnswer('yes');
                    showAlert(
                      '요건을 충족하여 연말정산 간소화자료 PDF내용이 적용되었습니다.',
                      '알림',
                      () => {
                        setViewMode('housing_loan_view');
                      }
                    );
                  } else {
                    // 국세청 PDF가 없거나 PDF에 이 항목 자료가 없을 경우: 국세청자료 미표시 및 기타자료 추가 페이지로 바로 이동
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
      {/* 3. 주택자금 수정 화면 (housing_loan_edit)                                  */}
      {/* ========================================================================= */}
      {viewMode === 'housing_loan_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('housing_loan_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">주택자금 수정</span>
            </button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                주택자금 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 요구사항 1 & 3: 성명란 본인/부양가족 삭제, 인별 상세내용에 자금 구분만 표기 */}
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
                          deductionAmount: Number(item.amount || 0),
                          rawAmount: Number(item.amount || 0),
                          isRent: false,
                        };
                        const rawAmount = Number(item.amount || 0);
                        const deductionAmt = limitInfo.deductionAmount || 0;
                        const isExceeded = rawAmount > deductionAmt;

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
                              {/* 인별 상세내용에 자금 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '주택자금'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {deductionAmt.toLocaleString()}원
                                </span>
                                {limitInfo.ineligibleReason ? (
                                  <span className="text-[10px] text-rose-500 font-medium">
                                    ({limitInfo.ineligibleReason})
                                  </span>
                                ) : isExceeded ? (
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    (상환 {rawAmount.toLocaleString()}원 / {limitInfo.isRent ? '40% 공제적용' : '한도적용'})
                                  </span>
                                ) : null}
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
                          deductionAmount: Number(item.amount || 0),
                          rawAmount: Number(item.amount || 0),
                          isRent: false,
                        };
                        const rawAmount = Number(item.amount || 0);
                        const deductionAmt = limitInfo.deductionAmount || 0;
                        const isExceeded = rawAmount > deductionAmt;

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
                              {/* 인별 상세내용에 자금 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '주택자금'}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {deductionAmt.toLocaleString()}원
                                </span>
                                {limitInfo.ineligibleReason ? (
                                  <span className="text-[10px] text-rose-500 font-medium">
                                    ({limitInfo.ineligibleReason})
                                  </span>
                                ) : isExceeded ? (
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    (상환 {rawAmount.toLocaleString()}원 / {limitInfo.isRent ? '40% 공제적용' : '한도적용'})
                                  </span>
                                ) : null}
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
              onClick={() => setViewMode('housing_loan_view')}
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
      {/* 4. 주택자금 추가/수정 폼 (housing_loan_add)                                  */}
      {/* ========================================================================= */}
      {viewMode === 'housing_loan_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('housing_loan_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '주택자금 수정' : '주택자금 추가'}
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
                주택자금 기타자료를<br />
                {editingItemId ? '수정하세요.' : '입력하세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                주택임차차입금 또는 장기주택저당차입금 상환 정보를 입력해주세요.
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

              {/* 자금 구분* (대분류 탭/선택) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  자금 구분<span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/80 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLoanCategory('주택임차차입금')}
                    className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      loanCategory === '주택임차차입금'
                        ? 'bg-white text-[#4F46E5] shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🏠 주택임차차입금 (전세)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoanCategory('장기주택저당차입금')}
                    className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      loanCategory === '장기주택저당차입금'
                        ? 'bg-white text-[#4F46E5] shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🏢 장기주택저당차입금 (담보)</span>
                  </button>
                </div>
              </div>

              {/* ================================================================ */}
              {/* [자금구분 1: 주택임차차입금] (요구사항 6)                         */}
              {/* 사업자등록번호, 최종상환예정일, 상환기간, 주택취득일, 저당권설정일 삭제*/}
              {/* ================================================================ */}
              {loanCategory === '주택임차차입금' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* 차입처 선택: 대출기관 차입 vs 개인차입 */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      차입처 구분<span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRentLoanType('대출기관 차입')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          rentLoanType === '대출기관 차입'
                            ? 'border-[#4F46E5] bg-indigo-50/40 text-[#4F46E5] font-bold ring-1 ring-[#4F46E5]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">대출기관 차입</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">은행 및 금융기관 전세대출</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRentLoanType('개인차입(거주자 차입)')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          rentLoanType === '개인차입(거주자 차입)'
                            ? 'border-[#4F46E5] bg-indigo-50/40 text-[#4F46E5] font-bold ring-1 ring-[#4F46E5]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">개인차입 (거주자)</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">총급여 5천만원 이하 거주자</div>
                      </button>
                    </div>
                  </div>

                  {/* 금융기관/차입처명* */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      {rentLoanType === '개인차입(거주자 차입)' ? '대여인 성명(차입처)' : '금융기관(대출기관)'}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formBank}
                      onChange={(e) => setFormBank(e.target.value)}
                      placeholder={rentLoanType === '개인차입(거주자 차입)' ? '예: 홍길동 (대여인 성명)' : '예: 우리은행, 국민은행, 농협은행'}
                      className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                    />
                  </div>

                  {/* 대출계좌번호 */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      대출계좌번호
                    </label>
                    <input
                      type="text"
                      value={formAccount}
                      onChange={(e) => setFormAccount(e.target.value)}
                      placeholder="예: 64800901234567"
                      className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                    />
                  </div>

                  {/* 대출일 (최초차입일) */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      대출일 (최초차입일)
                    </label>
                    <input
                      type="text"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      placeholder="예: 2018-08-26"
                      className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                    />
                  </div>

                  {/* 당해년도 원리금상환액* */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      당해년도 원리금상환액<span className="text-rose-500">*</span>
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
                </div>
              )}

              {/* ================================================================ */}
              {/* [자금구분 2: 장기주택저당차입금] (요구사항 7)                    */}
              {/* 사업자등록번호 삭제, 2011이전/2012이후 선택, 고정/비거치 선택, 차입기간 자동계산 */}
              {/* ================================================================ */}
              {loanCategory === '장기주택저당차입금' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* 차입시기: 2012년 이후 vs 2011년 이전 */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      차입시기<span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMortgageEra('2012년 이후 차입')}
                        className={`py-2 px-3 rounded-xl border text-center transition cursor-pointer ${
                          mortgageEra === '2012년 이후 차입'
                            ? 'border-[#4F46E5] bg-indigo-50/40 text-[#4F46E5] font-bold ring-1 ring-[#4F46E5]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xs font-bold">2012년 이후 차입</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMortgageEra('2011년 이전 차입')}
                        className={`py-2 px-3 rounded-xl border text-center transition cursor-pointer ${
                          mortgageEra === '2011년 이전 차입'
                            ? 'border-[#4F46E5] bg-indigo-50/40 text-[#4F46E5] font-bold ring-1 ring-[#4F46E5]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xs font-bold">2011년 이전 차입</span>
                      </button>
                    </div>
                  </div>

                  {/* 고정금리, 비거치식 선택 (하나만 선택: OR, 둘 다: AND) */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500">
                        금리 및 상환방식 (다중 선택 가능)
                      </label>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {isFixedRate && isNonGrace
                          ? '✨ 고정 AND 비거치식 (최대한도 적용)'
                          : isFixedRate || isNonGrace
                          ? '✨ 고정 OR 비거치식 적용'
                          : '기타 대출(변동/거치식)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsFixedRate((prev) => !prev)}
                        className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer ${
                          isFixedRate
                            ? 'border-[#4F46E5] bg-indigo-50/60 text-[#4F46E5] font-bold shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                          isFixedRate ? 'bg-[#4F46E5] border-[#4F46E5] text-white font-bold' : 'border-slate-300 bg-white'
                        }`}>
                          {isFixedRate ? '✓' : ''}
                        </span>
                        <span className="text-xs font-bold">고정금리</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsNonGrace((prev) => !prev)}
                        className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer ${
                          isNonGrace
                            ? 'border-[#4F46E5] bg-indigo-50/60 text-[#4F46E5] font-bold shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
                          isNonGrace ? 'bg-[#4F46E5] border-[#4F46E5] text-white font-bold' : 'border-slate-300 bg-white'
                        }`}>
                          {isNonGrace ? '✓' : ''}
                        </span>
                        <span className="text-xs font-bold">비거치식 상환</span>
                      </button>
                    </div>
                  </div>

                  {/* 취급기관(금융기관)* */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      취급기관(금융기관)<span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formBank}
                      onChange={(e) => setFormBank(e.target.value)}
                      placeholder="예: S.K종합공사, 농협은행, 국민은행"
                      className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                    />
                  </div>

                  {/* 대출종류(상품명) / 계좌번호 */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      대출종류(상품명) / 계좌번호
                    </label>
                    <input
                      type="text"
                      value={formAccount}
                      onChange={(e) => setFormAccount(e.target.value)}
                      placeholder="예: 주택구입자금대출 또는 104-86-39742"
                      className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                    />
                  </div>

                  {/* 최초차입일 & 최종상환예정일 (차입기간 자동계산) */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500">
                          최초차입일 (대출일)<span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formStartDate}
                          onChange={(e) => setFormStartDate(e.target.value)}
                          placeholder="예: 2020-08-31"
                          className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500">
                          최종상환예정일<span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formEndDate}
                          onChange={(e) => setFormEndDate(e.target.value)}
                          placeholder="예: 2040-08-31"
                          className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                        />
                      </div>
                    </div>

                    {/* 차입기간 자동 계산 결과 표시 (요구사항 7) */}
                    <div className="pt-1">
                      {calculatedPeriodYears ? (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                          <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                            <span>⏱ 계산된 차입기간:</span>
                            <span className="font-extrabold text-emerald-800 font-mono text-sm underline decoration-emerald-300">{calculatedPeriodYears}년</span>
                          </span>
                          <span className="text-[11px] text-emerald-600 font-medium">
                            {calculatedPeriodYears >= 15 ? '15년 이상 요건 충족' : calculatedPeriodYears >= 10 ? '10~15년 요건' : '10년 미만'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 py-1">
                          ⓘ 최초차입일과 최종상환예정일을 입력하면 차입기간(상환연수)이 자동 계산됩니다.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 주택취득일 & 저당권설정일 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">
                        주택취득일
                      </label>
                      <input
                        type="text"
                        value={formAcquisitionDate}
                        onChange={(e) => setFormAcquisitionDate(e.target.value)}
                        placeholder="예: 2022-08-30"
                        className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">
                        저당권설정일
                      </label>
                      <input
                        type="text"
                        value={formMortgageDate}
                        onChange={(e) => setFormMortgageDate(e.target.value)}
                        placeholder="예: 2022-08-31"
                        className="w-full text-sm font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                      />
                    </div>
                  </div>

                  {/* 당해년도 이자상환액* */}
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      당해년도 이자상환액<span className="text-rose-500">*</span>
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
                </div>
              )}

              {/* 안내 문구 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-1 leading-relaxed">
                <div className="font-semibold text-[#4F46E5]">📌 공제한도 및 요건 안내 (소득세법 제52조)</div>
                {loanCategory === '주택임차차입금' ? (
                  <>
                    <div>• <strong>주택임차차입금</strong>: 원리금 상환액의 40% 공제 (주택마련저축과 합산하여 연 400만원 한도)</div>
                    <div className="text-[10.5px] text-slate-400">※ 무주택 세대주인 근로자가 국민주택규모 주택(주거용 오피스텔 포함) 임차 시 공제 가능합니다.</div>
                  </>
                ) : (
                  <>
                    <div>• <strong>장기주택저당차입금</strong>: 이자상환액 100% 공제 (상환조건 및 차입연도에 따라 연 600만 ~ 최대 2,000만원 한도)</div>
                    <div className="text-[10.5px] text-slate-400">※ 무주택 또는 1주택 세대주(취득 당시 기준시가 6억원 이하, 2023년 이전 5억/4억) 요건 충족 시 공제됩니다.</div>
                  </>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
                >
                  {editingItemId ? '수정 완료' : '저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 모달 3종                                                                   */}
      {/* ========================================================================= */}
      {/* 1. 체크리스트 작성 필요 안내 모달 */}
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
                  setViewMode('housing_loan_checklist');
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

      {/* 2. 공제불가 모달 */}
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
                  setViewMode('housing_loan_view');
                }}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. 증빙 안내 모달 */}
      {showProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              📎
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">주택자금 소득공제 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                주택임차차입금 및 장기주택저당차입금 공제 시 필요한 증빙 서류입니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 인정 서류: 주택자금상환증명서, 임대차계약서 사본, 주민등록표등본, 건물등기부등본</div>
              <div>• 간소화자료: 국세청에서 제공하는 대출 상환자료는 별도 영수증 제출 불필요</div>
              <div>• 공제한도: 전세대출 연 400만원, 주택담보대출 연 300만~2,000만원 한도</div>
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

