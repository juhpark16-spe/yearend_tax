import React, { useState, useMemo } from 'react';
import HomeButton from '../components/HomeButton';
import { useAuth } from '../context/AuthContext';
import { calculateSettlementTax } from '../utils/taxCalculator';
import { getSecureItem } from '../utils/secureStorage';

/**
 * [전년도 연말정산 자료비교 페이지]
 * 
 * 사용자 요구사항 반영:
 * 1. 글씨 크기를 아담하게 축소하고 박스 안 내용이 너무 꽉 차지 않도록 여백 및 균형감 조정
 * 2. 가로/세로 막대 그래프 크기를 적절히 슬림하고 단정하게 축소 (h-52~h-56)
 * 3. '국세청 사용액' -> '사용액'으로 통일하고 '국세청 간소화자료에 등록된...' 문구 전면 제거
 * 4. 사용액 = (국세청 PDF 추출 금액) + (공제자료 입력 페이지의 기타자료 추가 금액) 합산 적용
 * 5. 상세 안내 및 문구에서 '국세청자료/국세청 간소화 자료/국세청 등록' 단어 제거
 * 6. 카드 사용액 및 연금계좌 사용액 0원 오류 완벽 해결 (각종 배열 및 합산 필드 전수 조사)
 * 7. 공제받은 주요 항목 위주 배치 및 기부금은 맨 뒤쪽에 배치
 */
export default function TaxHistoryPage({ onGoHome, onPrev, onNavigateStep, userName = '근로자' }) {
  const { profile, user } = useAuth();

  // 로그인한 근로자 실명 추출
  const effectiveUserName = (profile?.name || user?.user_metadata?.full_name || userName || '근로자')
    .replace(/\s*\(Google\)/g, '')
    .trim();

  // 1. 현재 연도(2025년) 실시간 데이터 로드 및 세액 계산
  const { currentTaxResult, hasCurrentData, rawHometax, rawDeduction } = useMemo(() => {
    let withholdingData = null;
    let previousJobs = [];
    let deductionData = null;
    let hometaxData = null;
    let familyList = [];

    try {
      withholdingData = getSecureItem('selftax_withholding_data');
      previousJobs = getSecureItem('selftax_previous_jobs', []);
      familyList = getSecureItem('selftax_family_list', []);

      const savedDed = localStorage.getItem('selftax_deduction_data');
      if (savedDed) {
        try { deductionData = JSON.parse(savedDed); } catch (e) {}
      }
      const savedHt = localStorage.getItem('hometax_extracted_data');
      if (savedHt) {
        try { hometaxData = JSON.parse(savedHt); } catch (e) {}
      }
    } catch (e) {
      console.error('Error loading history source data:', e);
    }

    const hasData = Boolean(
      (withholdingData && ((Number(withholdingData.totalSalary) || 0) > 0 || withholdingData.uploaded)) ||
      (previousJobs && previousJobs.length > 0) ||
      hometaxData ||
      deductionData
    );

    const result = calculateSettlementTax({
      userName: effectiveUserName,
      taxYear: '2025',
      withholdingData,
      previousJobs,
      deductionData,
      hometaxData,
      familyList,
    });

    return {
      currentTaxResult: result || {},
      hasCurrentData: hasData,
      rawHometax: hometaxData,
      rawDeduction: deductionData,
    };
  }, [effectiveUserName]);

  // 2. 전년도(2024년) 저장 데이터 로드
  const prevYearData = useMemo(() => {
    try {
      const secured = getSecureItem('selftax_previous_year_data');
      if (secured && typeof secured === 'object') return secured;

      const raw = localStorage.getItem('selftax_previous_year_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.error('Error loading previous year data:', e);
    }
    return null;
  }, []);

  const hasPreviousData = Boolean(
    prevYearData &&
    (prevYearData.diffTotal !== undefined ||
      prevYearData.diffTax !== undefined ||
      (Number(prevYearData.totalSalary) || 0) > 0)
  );

  // 3. 올해(2025) 세액 결과 수치
  const currDiffTax = Number(currentTaxResult?.diffTotal ?? currentTaxResult?.diffTax ?? 0);
  const isCurrRefund = currDiffTax <= 0;
  const currTaxAmount = Math.abs(currDiffTax);

  // 4. 전년도(2024) 세액 결과 수치
  const prevDiffTax = hasPreviousData ? Number(prevYearData?.diffTotal ?? prevYearData?.diffTax ?? 0) : null;
  const isPrevRefund = prevDiffTax !== null ? prevDiffTax <= 0 : false;
  const prevTaxAmount = prevDiffTax !== null ? Math.abs(prevDiffTax) : null;

  // 5. 항목별 실시간 사용액 = (PDF 자료 추출 금액) + (공제자료 입력 페이지의 기타자료 금액)
  const deductionCategories = useMemo(() => {
    // -------------------------------------------------------------------------
    // 1) 신용·체크카드 소비액 (PDF 추출분 + 공제자료 입력 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsCard = 0;
    let otherCard = 0;

    // A. 공제자료 입력(DataInputPage)의 cardItems 내역이 있는 경우
    if (Array.isArray(rawDeduction?.cardItems) && rawDeduction.cardItems.length > 0) {
      rawDeduction.cardItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsCard += amt;
        } else {
          otherCard += amt;
        }
      });
    }

    // B. PDF 추출 원본(rawHometax)에서 카드가 있고 ntsCard가 아직 안 잡힌 경우 보강
    if (ntsCard === 0 && rawHometax) {
      const c = Number(rawHometax.credit_card_total ?? rawHometax.credit ?? rawHometax.creditCard ?? 0);
      const d = Number(rawHometax.debit_card_total ?? rawHometax.debit ?? rawHometax.debitCard ?? 0);
      const r = Number(rawHometax.cash_receipt_total ?? rawHometax.cash ?? rawHometax.cashReceipt ?? 0);
      const m = Number(rawHometax.market_amount ?? rawHometax.market ?? 0);
      const t = Number(rawHometax.transport_amount ?? rawHometax.transport ?? 0);
      const cul = Number(rawHometax.culture_amount ?? rawHometax.culture ?? 0);
      ntsCard = c + d + r + m + t + cul;
    }

    // C. 기타자료 localStorage(selftax_other_card) 보강
    try {
      const savedOtherCard = localStorage.getItem('selftax_other_card');
      if (savedOtherCard) {
        const parsed = JSON.parse(savedOtherCard);
        if (Array.isArray(parsed)) {
          const addAmt = parsed.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
          if (otherCard === 0) otherCard = addAmt;
        }
      }
    } catch {}

    // D. 최종 합산 및 폴백 (DataInputPage의 card 총액 또는 taxCalculator 총 소비액)
    const cardUsage = (ntsCard + otherCard) > 0
      ? (ntsCard + otherCard)
      : Number(rawDeduction?.card || currentTaxResult?.creditCardCalc?.totalSpent || 0);

    const cardDeduction = Number(currentTaxResult?.incomeDeductions?.creditCard || 0);

    // -------------------------------------------------------------------------
    // 2) 의료비 지출 (PDF 추출분 + 공제자료 입력 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsMedical = 0;
    let otherMedical = 0;

    if (Array.isArray(rawDeduction?.medicalItems) && rawDeduction.medicalItems.length > 0) {
      rawDeduction.medicalItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsMedical += amt;
        } else {
          otherMedical += amt;
        }
      });
    }

    if (ntsMedical === 0 && rawHometax) {
      ntsMedical = Number(rawHometax.medical_general ?? rawHometax.medical ?? 0);
    }

    const medicalUsage = (ntsMedical + otherMedical) > 0
      ? (ntsMedical + otherMedical)
      : Number(rawDeduction?.medical || currentTaxResult?.medicalDetails?.totalNetPaid || 0);

    const medicalCredit = Number(
      currentTaxResult?.taxCredits?.appliedMedicalCredit ??
      currentTaxResult?.taxCredits?.medicalCredit ??
      0
    );

    // -------------------------------------------------------------------------
    // 3) 보장성 보험료 납입액 (PDF 추출분 + 공제자료 입력 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsInsurance = 0;
    let otherInsurance = 0;

    if (Array.isArray(rawDeduction?.insuranceItems) && rawDeduction.insuranceItems.length > 0) {
      rawDeduction.insuranceItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsInsurance += amt;
        } else {
          otherInsurance += amt;
        }
      });
    }

    if (ntsInsurance === 0 && rawHometax) {
      ntsInsurance = Number(
        rawHometax.insurance_guaranteed ??
        rawHometax.insurance ??
        ((rawHometax.generalInsurance || 0) + (rawHometax.disabledInsurance || 0)) ??
        0
      );
    }

    const insuranceUsage = (ntsInsurance + otherInsurance) > 0
      ? (ntsInsurance + otherInsurance)
      : Number(
          rawDeduction?.insurance ||
          (currentTaxResult?.insuranceDetails?.generalPaid || 0) + (currentTaxResult?.insuranceDetails?.disabledPaid || 0) ||
          0
        );

    const insuranceCredit = Number(
      currentTaxResult?.taxCredits?.appliedInsuranceCredit ??
      currentTaxResult?.taxCredits?.insuranceCredit ??
      0
    );

    // -------------------------------------------------------------------------
    // 4) 연금계좌 납입액 (연금저축/IRP: PDF 추출분 + 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsPension = 0;
    let otherPension = 0;

    if (Array.isArray(rawDeduction?.pensionItems) && rawDeduction.pensionItems.length > 0) {
      rawDeduction.pensionItems.forEach((item) => {
        const amt = Number(item.rawAmount ?? item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsPension += amt;
        } else {
          otherPension += amt;
        }
      });
    }

    // A. PDF 원본에서 연금 세부내역이나 연금저축 필드 탐색
    if (ntsPension === 0 && rawHometax) {
      if (Array.isArray(rawHometax.pension_details) && rawHometax.pension_details.length > 0) {
        ntsPension = rawHometax.pension_details.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      } else {
        ntsPension = Number(rawHometax.personal_pension_saving ?? rawHometax.pension_saving ?? 0);
      }
    }

    // B. 기타 연금 localStorage(selftax_other_pension) 보강
    try {
      const savedOtherPension = localStorage.getItem('selftax_other_pension');
      if (savedOtherPension) {
        const parsed = JSON.parse(savedOtherPension);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const addPension = parsed.reduce((sum, i) => sum + (Number(i.rawAmount ?? i.amount) || 0), 0);
          if (otherPension === 0) otherPension = addPension;
        }
      }
    } catch {}

    const pensionUsage = (ntsPension + otherPension) > 0
      ? (ntsPension + otherPension)
      : Number(currentTaxResult?.pensionAccount?.paid || rawDeduction?.pension || 0);

    const pensionCredit = Number(
      currentTaxResult?.taxCredits?.appliedPensionCredit ??
      currentTaxResult?.taxCredits?.pensionCredit ??
      0
    );

    // -------------------------------------------------------------------------
    // 5) 교육비 지출 (PDF 추출분 + 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsEdu = 0;
    let otherEdu = 0;

    if (Array.isArray(rawDeduction?.eduItems) && rawDeduction.eduItems.length > 0) {
      rawDeduction.eduItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsEdu += amt;
        } else {
          otherEdu += amt;
        }
      });
    }

    if (ntsEdu === 0 && rawHometax) {
      ntsEdu = Number(rawHometax.education_child ?? rawHometax.education ?? 0);
    }

    const educationUsage = (ntsEdu + otherEdu) > 0
      ? (ntsEdu + otherEdu)
      : Number(rawDeduction?.education || 0);

    const educationCredit = Number(
      currentTaxResult?.taxCredits?.appliedEducationCredit ??
      currentTaxResult?.taxCredits?.educationCredit ??
      0
    );

    // -------------------------------------------------------------------------
    // 6) 주택 월세액 (PDF 추출분 + 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsRent = 0;
    let otherRent = 0;

    if (Array.isArray(rawDeduction?.rentItems) && rawDeduction.rentItems.length > 0) {
      rawDeduction.rentItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsRent += amt;
        } else {
          otherRent += amt;
        }
      });
    }

    if (ntsRent === 0 && rawHometax) {
      ntsRent = Number(rawHometax.monthly_rent_paid || 0);
    }

    const rentUsage = (ntsRent + otherRent) > 0
      ? (ntsRent + otherRent)
      : Number(rawDeduction?.rawRent || rawDeduction?.monthlyRent || 0);

    const rentCredit = Number(
      currentTaxResult?.taxCredits?.appliedRentCredit ??
      currentTaxResult?.taxCredits?.rentCredit ??
      0
    );

    // -------------------------------------------------------------------------
    // 7) 기부금 (요구사항: 맨 뒤쪽에 배치 / PDF 추출분 + 기타자료분 합산)
    // -------------------------------------------------------------------------
    let ntsDonation = 0;
    let otherDonation = 0;

    if (Array.isArray(rawDeduction?.donationItems) && rawDeduction.donationItems.length > 0) {
      rawDeduction.donationItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.isNts || item.source === 'nts') {
          ntsDonation += amt;
        } else {
          otherDonation += amt;
        }
      });
    }

    if (ntsDonation === 0 && rawHometax) {
      ntsDonation = Number(rawHometax.donation_amount ?? rawHometax.donation ?? 0);
    }

    const donationUsage = (ntsDonation + otherDonation) > 0
      ? (ntsDonation + otherDonation)
      : Number(currentTaxResult?.donationDetails?.totalDonation || rawDeduction?.donation || 0);

    const donationCredit = Number(
      currentTaxResult?.taxCredits?.appliedDonationCredit ??
      currentTaxResult?.taxCredits?.donationCredit ??
      0
    );

    // 전년도(2024년) 저장 데이터 매핑
    const prevCat = prevYearData?.categories || {};

    return [
      {
        id: 'card',
        name: '신용·체크카드',
        icon: '💳',
        currUsage: cardUsage,
        currDeduction: cardDeduction,
        prevUsage: hasPreviousData ? (Number(prevCat.card?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.card?.deduction) || 0) : null,
        detailInfo: '신용카드, 직불·체크카드, 현금영수증, 대중교통, 전통시장 등 총 사용금액과 소득공제 금액입니다.',
      },
      {
        id: 'medical',
        name: '의료비',
        icon: '💊',
        currUsage: medicalUsage,
        currDeduction: medicalCredit,
        prevUsage: hasPreviousData ? (Number(prevCat.medical?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.medical?.deduction) || 0) : null,
        detailInfo: '본인 및 부양가족의 의료비 지출액(총급여 3% 초과분 15% 세액공제)입니다.',
      },
      {
        id: 'insurance',
        name: '보장성 보험료',
        icon: '🛡️',
        currUsage: insuranceUsage,
        currDeduction: insuranceCredit,
        prevUsage: hasPreviousData ? (Number(prevCat.insurance?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.insurance?.deduction) || 0) : null,
        detailInfo: '보장성보험료 납입액(연 100만 원 한도 12%, 장애인 15%)과 세액공제 금액입니다.',
      },
      {
        id: 'pension',
        name: '연금계좌',
        icon: '🏦',
        currUsage: pensionUsage,
        currDeduction: pensionCredit,
        prevUsage: hasPreviousData ? (Number(prevCat.pension?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.pension?.deduction) || 0) : null,
        detailInfo: '연금저축 및 IRP 납입액과 세액공제 금액입니다.',
      },
      {
        id: 'education',
        name: '교육비',
        icon: '🎓',
        currUsage: educationUsage,
        currDeduction: educationCredit,
        prevUsage: hasPreviousData ? (Number(prevCat.education?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.education?.deduction) || 0) : null,
        detailInfo: '본인 및 부양가족 교육비 지출액(15% 세액공제)입니다.',
      },
      {
        id: 'rent',
        name: '주택 월세액',
        icon: '🏠',
        currUsage: rentUsage,
        currDeduction: rentCredit,
        prevUsage: hasPreviousData ? (Number(prevCat.rent?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.rent?.deduction) || 0) : null,
        detailInfo: '무주택 세대주가 지출한 연간 월세액(연 1,000만원 한도, 최대 17% 세액공제)입니다.',
      },
      {
        id: 'donation',
        name: '기부금',
        icon: '🎁',
        currUsage: donationUsage,
        currDeduction: donationCredit,
        prevUsage: hasPreviousData ? (Number(prevCat.donation?.usage) || 0) : null,
        prevDeduction: hasPreviousData ? (Number(prevCat.donation?.deduction) || 0) : null,
        detailInfo: '고향사랑기부금 및 지정기부금 지출액과 세액공제 금액입니다.',
      },
    ];
  }, [currentTaxResult, rawHometax, rawDeduction, prevYearData, hasPreviousData]);

  // 하단 슬라이더 활성 인덱스
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const activeCategory = deductionCategories[activeCategoryIndex] || deductionCategories[0];

  // 금액 포맷 함수
  const formatShortManWon = (amount) => {
    if (amount === null || amount === undefined) return '자료 없음';
    const num = Math.round(Number(amount) || 0);
    if (num === 0) return '0원';
    if (num >= 100000000) {
      return `약 ${(num / 100000000).toFixed(1)}억원`;
    }
    if (num >= 10000) {
      return `약 ${Math.round(num / 10000)}만원`;
    }
    return `${num.toLocaleString()}원`;
  };

  // 전년도 대비 증감율 계산 헬퍼
  const getRateChange = (curr, prev) => {
    if (prev === null || prev === undefined || prev === 0) {
      return null;
    }
    const diff = curr - prev;
    const rate = Math.round((Math.abs(diff) / prev) * 100);
    return {
      rate,
      isDecrease: diff < 0,
      isSame: diff === 0,
      isIncrease: diff > 0,
    };
  };

  const usageChange = getRateChange(activeCategory.currUsage, activeCategory.prevUsage);
  const deductionChange = getRateChange(activeCategory.currDeduction, activeCategory.prevDeduction);

  // 상단 세액 비교 바 너비 비율 계산 (슬림화)
  const maxTaxAmount = Math.max(currTaxAmount, prevTaxAmount || 0, 100000);
  const currTaxBarWidth = Math.min(100, Math.max(20, (currTaxAmount / maxTaxAmount) * 100));
  const prevTaxBarWidth = prevTaxAmount !== null
    ? Math.min(100, Math.max(20, (prevTaxAmount / maxTaxAmount) * 100))
    : 0;

  // 하단 공제 카테고리 세로 막대 높이 계산 (슬림화)
  const catMaxUsage = Math.max(activeCategory.currUsage, activeCategory.prevUsage || 0, 10000);
  const catMaxDeduction = Math.max(activeCategory.currDeduction, activeCategory.prevDeduction || 0, 10000);

  const getBarHeightPercent = (val, maxVal) => {
    if (val === null || val === undefined || val === 0) return 8; // 최소 눈금 높이
    return Math.min(100, Math.max(16, Math.round((val / maxVal) * 100)));
  };

  const handleClose = () => {
    if (onGoHome) {
      onGoHome();
    } else if (onPrev) {
      onPrev();
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#F6F7FB] flex flex-col font-sans select-none pb-10">
      
      {/* ================================================================= */}
      {/* 1. 상단 헤더: 뒤로가기 + 타이틀 + 홈화면 버튼                         */}
      {/* ================================================================= */}
      <header className="w-full px-5 py-3 flex items-center justify-between border-b border-slate-200/80 bg-white sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="p-1 -ml-1 text-slate-700 hover:text-indigo-600 transition cursor-pointer"
            title="뒤로가기"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-sm sm:text-[15px] font-bold text-slate-900 tracking-tight">
            전년도 연말정산 자료비교
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <HomeButton onClick={onGoHome || handleClose} />
        </div>
      </header>

      {/* ================================================================= */}
      {/* 2. 본문 컨테이너: 여유 있는 여백과 정돈된 글씨 크기                    */}
      {/* ================================================================= */}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-5 space-y-5">

        {/* ----------------------------------------------------------------- */}
        {/* 상단 카드: 전년도 연말정산 세액과 비교해 보아요                         */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <h2 className="text-[15px] sm:text-base font-bold text-slate-900 tracking-tight">
              전년도 연말정산 세액과 비교해 보아요
            </h2>

            {/* 범례 (납부액 / 환급액) */}
            <div className="flex items-center gap-3 text-xs text-slate-600 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e0564c]"></span>
                <span>납부액</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3ec59d]"></span>
                <span>환급액</span>
              </div>
            </div>
          </div>

          {/* 설명 문구 */}
          <div className="mt-3.5 text-xs sm:text-[13.5px] leading-relaxed text-slate-700">
            {hasPreviousData ? (
              <>
                <span className="font-bold text-slate-900">{effectiveUserName}</span>님은 전년도에{' '}
                <span className={`font-bold ${isPrevRefund ? 'text-emerald-500' : 'text-[#e0564c]'}`}>
                  {prevTaxAmount.toLocaleString()}원
                </span>을 {isPrevRefund ? '환급' : '납부'} 하였고 이번년도에{' '}
                <span className={`font-bold ${isCurrRefund ? 'text-emerald-500' : 'text-[#e0564c]'}`}>
                  {currTaxAmount.toLocaleString()}원
                </span>을 {isCurrRefund ? '환급' : '추가 납부'} 받을 수 있어요.
              </>
            ) : (
              <>
                <span className="font-bold text-slate-900">{effectiveUserName}</span>님은 이번년도에{' '}
                <span className={`font-bold ${isCurrRefund ? 'text-emerald-500' : 'text-[#e0564c]'}`}>
                  {currTaxAmount.toLocaleString()}원
                </span>을 {isCurrRefund ? '환급' : '추가 납부'} 받을 수 있어요.
                <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  작년(2024년) 연말정산 자료가 없어 올해 내용만 표시됩니다.
                </div>
              </>
            )}
          </div>

          {/* 가로 막대 그래프 (슬림하고 단정하게 조정) */}
          <div className="mt-5 space-y-3">
            {/* 2025년 (올해) 바 */}
            <div className="flex items-center gap-3">
              <span className="text-xs sm:text-[13px] font-bold text-slate-700 w-12 sm:w-14 shrink-0">
                2025년
              </span>
              <div className="flex-1 bg-slate-50 rounded-full h-7 sm:h-8 flex items-center relative overflow-hidden border border-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out flex items-center px-3.5 ${
                    isCurrRefund
                      ? 'bg-gradient-to-r from-[#4ad1aa] to-[#36ba94] text-white shadow-2xs'
                      : 'bg-gradient-to-r from-[#f07369] to-[#e0564c] text-white shadow-2xs'
                  }`}
                  style={{ width: `${currTaxBarWidth}%` }}
                >
                  <span className="text-[11.5px] sm:text-xs font-bold whitespace-nowrap drop-shadow-2xs">
                    {isCurrRefund ? `(-) ${currTaxAmount.toLocaleString()}원` : `${currTaxAmount.toLocaleString()}원`}
                  </span>
                </div>
              </div>
            </div>

            {/* 2024년 (작년) 바 */}
            <div className="flex items-center gap-3">
              <span className="text-xs sm:text-[13px] font-bold text-slate-700 w-12 sm:w-14 shrink-0">
                2024년
              </span>
              <div className="flex-1 bg-slate-50 rounded-full h-7 sm:h-8 flex items-center relative overflow-hidden border border-slate-100">
                {hasPreviousData ? (
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out flex items-center px-3.5 justify-end ${
                      isPrevRefund
                        ? 'bg-gradient-to-r from-[#4ad1aa] to-[#36ba94] text-white shadow-2xs'
                        : 'bg-gradient-to-r from-[#e8816b] to-[#dc584a] text-white shadow-2xs'
                    }`}
                    style={{ width: `${prevTaxBarWidth}%` }}
                  >
                    <span className="text-[11.5px] sm:text-xs font-bold whitespace-nowrap drop-shadow-2xs">
                      {isPrevRefund ? `(-) ${prevTaxAmount.toLocaleString()}원` : `${prevTaxAmount.toLocaleString()}원`}
                    </span>
                  </div>
                ) : (
                  <div className="w-full h-full border border-dashed border-slate-200 rounded-full flex items-center px-3.5 text-slate-400 text-xs font-medium">
                    작년(2024년) 연말정산 자료 없음
                  </div>
                )}
              </div>
            </div>
          </div>

          {!hasCurrentData && (
            <div className="mt-3.5 p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-amber-800 flex items-center justify-between">
              <span>원천징수영수증 및 간소화자료를 등록하시면 실시간 정확한 세액이 산출됩니다.</span>
            </div>
          )}
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* 하단 카드: 전년도 공제자료와 비교해 보아요                             */}
        {/* ----------------------------------------------------------------- */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <h2 className="text-[15px] sm:text-base font-bold text-slate-900 tracking-tight">
              전년도 공제자료와 비교해 보아요.
            </h2>

            {/* 범례 (사용액 / 공제액) */}
            <div className="flex items-center gap-3 text-xs text-slate-600 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#936bf4]"></span>
                <span>사용액</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4a8bf7]"></span>
                <span>공제액</span>
              </div>
            </div>
          </div>

          {/* 주요 공제 항목 선택 탭 (칩 버튼) - 기부금은 맨 뒤쪽에 배치됨 */}
          <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {deductionCategories.map((cat, idx) => {
              const isSelected = activeCategoryIndex === idx;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryIndex(idx)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="text-[11px]">{cat.icon}</span>
                  <span>{cat.name}</span>
                  {cat.currDeduction > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-indigo-500'}`}></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 항목 비교 요약 텍스트 ('국세청 사용액' -> '사용액'으로 통일) */}
          <div className="mt-3.5 p-3.5 bg-slate-50/80 rounded-xl border border-slate-100">
            <div className="text-xs sm:text-[13.5px] leading-relaxed text-slate-800">
              {hasPreviousData && usageChange !== null && deductionChange !== null ? (
                <>
                  <span className="font-bold text-indigo-600">{activeCategory.name}</span> 사용액은 전년도에 비해{' '}
                  <span className="font-bold text-slate-900">
                    {usageChange.isSame ? '변동이 없었고' : `${usageChange.rate}% ${usageChange.isDecrease ? '감소하였고' : '증가하였고'}`}
                  </span>
                  , 공제금액은{' '}
                  <span className="font-bold text-slate-900">
                    {deductionChange.isSame ? '변동이 없어요.' : `${deductionChange.rate}% ${deductionChange.isDecrease ? '감소하였어요.' : '증가하였어요.'}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold text-indigo-600">{activeCategory.name}</span> 사용액은{' '}
                  <span className="font-bold text-slate-900">{formatShortManWon(activeCategory.currUsage)}</span>이고,
                  공제금액은 <span className="font-bold text-slate-900">{formatShortManWon(activeCategory.currDeduction)}</span>이에요.
                  <div className="text-xs text-slate-500 mt-0.5">
                    전년도 공제 자료가 등록되지 않아 올해 실시간 데이터만 표기됩니다.
                  </div>
                </>
              )}
            </div>

            {/* "사용액을 자세히 볼까요?" 버튼 */}
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowDetailModal(!showDetailModal)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition font-medium cursor-pointer"
              >
                {activeCategory.name} 사용액을 자세히 볼까요?
              </button>
            </div>

            {/* 세부 안내 펼침 카드 (국세청 단어 전면 제거) */}
            {showDetailModal && (
              <div className="mt-2.5 p-3 bg-white border border-indigo-100 rounded-xl text-xs text-indigo-950 space-y-1.5 shadow-2xs">
                <div className="font-bold text-indigo-700 flex items-center justify-between">
                  <span>📌 {activeCategory.name} 산출 안내</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-semibold">실시간 계산</span>
                </div>
                <div className="leading-relaxed text-slate-700 text-[11.5px] sm:text-xs">{activeCategory.detailInfo}</div>
                <div className="pt-1.5 text-xs text-slate-700 border-t border-slate-100 flex flex-wrap gap-3 justify-between font-medium">
                  <span>사용액: <b className="text-slate-900">{activeCategory.currUsage.toLocaleString()}원</b></span>
                  <span>산출공제: <b className="text-indigo-600">{activeCategory.currDeduction.toLocaleString()}원</b></span>
                </div>
              </div>
            )}
          </div>

          {/* =============================================================== */}
          {/* 세로 막대 그래프 영역 (적절히 단정하고 균형 잡힌 높이: h-52 sm:h-56)    */}
          {/* =============================================================== */}
          <div className="mt-6 pt-3 pb-1 px-3 sm:px-10 relative bg-white rounded-xl">
            {/* 점선 배경 가이드 라인 */}
            <div className="absolute inset-x-6 sm:inset-x-12 top-3 bottom-9 flex flex-col justify-between pointer-events-none opacity-30">
              <div className="border-b border-dashed border-slate-300 w-full"></div>
              <div className="border-b border-dashed border-slate-300 w-full"></div>
              <div className="border-b border-dashed border-slate-300 w-full"></div>
              <div className="border-b border-slate-200 w-full"></div>
            </div>

            {/* 막대 기둥 그리드 (좌측: 사용액 2개 / 우측: 공제액 2개) */}
            <div className="relative z-10 grid grid-cols-2 gap-6 sm:gap-14 h-52 sm:h-56 items-end">
              
              {/* 1) 사용액 그룹 (보라색 계열) */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 h-full items-end pb-7">
                
                {/* 2024년 사용액 바 */}
                <div className="flex flex-col items-center justify-end h-full">
                  {hasPreviousData ? (
                    <div
                      className="w-full max-w-[48px] sm:max-w-[54px] rounded-t-lg bg-gradient-to-t from-[#8c5ff4] to-[#a77eff] flex flex-col items-center justify-start pt-1.5 text-white transition-all duration-700 ease-out shadow-2xs"
                      style={{ height: `${getBarHeightPercent(activeCategory.prevUsage, catMaxUsage)}%` }}
                    >
                      <span className="text-[9.5px] font-medium leading-tight opacity-90">약</span>
                      <span className="text-[11px] sm:text-xs font-bold leading-tight">
                        {formatShortManWon(activeCategory.prevUsage).replace('약 ', '')}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full max-w-[48px] sm:max-w-[54px] h-8 rounded-t-lg border-t border-x border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 font-medium">자료없음</span>
                    </div>
                  )}
                  <span className="mt-2 text-xs font-semibold text-slate-500">2024년</span>
                </div>

                {/* 2025년 사용액 바 */}
                <div className="flex flex-col items-center justify-end h-full">
                  <div
                    className={`w-full max-w-[48px] sm:max-w-[54px] rounded-t-lg flex flex-col items-center justify-start pt-1.5 text-white transition-all duration-700 ease-out shadow-2xs ${
                      activeCategory.currUsage > 0
                        ? 'bg-gradient-to-t from-[#ba9efc] to-[#cbaffd] text-[#4b1fa1]'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                    style={{ height: `${getBarHeightPercent(activeCategory.currUsage, catMaxUsage)}%` }}
                  >
                    {activeCategory.currUsage > 0 ? (
                      <>
                        <span className="text-[9.5px] font-medium leading-tight opacity-80">약</span>
                        <span className="text-[11px] sm:text-xs font-bold leading-tight">
                          {formatShortManWon(activeCategory.currUsage).replace('약 ', '')}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] font-semibold mt-1">0원</span>
                    )}
                  </div>
                  <span className="mt-2 text-xs font-bold text-slate-800">2025년</span>
                </div>
              </div>

              {/* 2) 공제액 그룹 (파란색 계열) */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 h-full items-end pb-7">
                
                {/* 2024년 공제액 바 */}
                <div className="flex flex-col items-center justify-end h-full">
                  {hasPreviousData ? (
                    <div
                      className="w-full max-w-[48px] sm:max-w-[54px] rounded-t-lg bg-gradient-to-t from-[#3b82f6] to-[#60a5fa] flex flex-col items-center justify-start pt-1.5 text-white transition-all duration-700 ease-out shadow-2xs"
                      style={{ height: `${getBarHeightPercent(activeCategory.prevDeduction, catMaxDeduction)}%` }}
                    >
                      <span className="text-[9.5px] font-medium leading-tight opacity-90">약</span>
                      <span className="text-[11px] sm:text-xs font-bold leading-tight">
                        {formatShortManWon(activeCategory.prevDeduction).replace('약 ', '')}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full max-w-[48px] sm:max-w-[54px] h-8 rounded-t-lg border-t border-x border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 font-medium">자료없음</span>
                    </div>
                  )}
                  <span className="mt-2 text-xs font-semibold text-slate-500">2024년</span>
                </div>

                {/* 2025년 공제액 바 */}
                <div className="flex flex-col items-center justify-end h-full">
                  <div
                    className={`w-full max-w-[48px] sm:max-w-[54px] rounded-t-lg flex flex-col items-center justify-start pt-1.5 transition-all duration-700 ease-out shadow-2xs ${
                      activeCategory.currDeduction > 0
                        ? 'bg-gradient-to-t from-[#9ec4fa] to-[#bfdbfe] text-[#1e40af]'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                    style={{ height: `${getBarHeightPercent(activeCategory.currDeduction, catMaxDeduction)}%` }}
                  >
                    {activeCategory.currDeduction > 0 ? (
                      <>
                        <span className="text-[9.5px] font-medium leading-tight opacity-80">약</span>
                        <span className="text-[11px] sm:text-xs font-bold leading-tight">
                          {formatShortManWon(activeCategory.currDeduction).replace('약 ', '')}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] font-semibold mt-1">0원</span>
                    )}
                  </div>
                  <span className="mt-2 text-xs font-bold text-slate-800">2025년</span>
                </div>
              </div>

            </div>
          </div>

          {/* 하단 페이지네이션 도트 및 컨트롤 */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setActiveCategoryIndex((prev) => (prev > 0 ? prev - 1 : deductionCategories.length - 1))}
              className="p-1 text-slate-400 hover:text-slate-800 rounded-full hover:bg-slate-100 transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="이전 공제항목"
            >
              <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline text-[11px]">이전 항목</span>
            </button>

            {/* 페이지네이션 도트들 */}
            <div className="flex items-center gap-1.5">
              {deductionCategories.map((cat, idx) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryIndex(idx)}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${
                    activeCategoryIndex === idx
                      ? 'w-5 h-1.5 bg-indigo-600'
                      : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
                  }`}
                  title={cat.name}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveCategoryIndex((prev) => (prev < deductionCategories.length - 1 ? prev + 1 : 0))}
              className="p-1 text-slate-400 hover:text-slate-800 rounded-full hover:bg-slate-100 transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="다음 공제항목"
            >
              <span className="hidden sm:inline text-[11px]">다음 항목</span>
              <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

        </section>

      </main>

    </div>
  );
}
