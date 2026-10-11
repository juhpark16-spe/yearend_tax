import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import HomeButton from '../components/HomeButton';
import { calculateSettlementTax } from '../utils/taxCalculator';
import { getSecureItem } from '../utils/secureStorage';
import AiExplainCard from '../components/AiExplainCard';
import { failsAgeRequirement } from '../utils/eligibility';

/**
 * AI 연말정산 결과 리포트 화면
 * 
 * 사용자 요구사항:
 * 1. 상단의 산출액 833,645원 중 98.8%가 감면되었습니다! 삭제
 * 2. 결과리포트에 금액들은 모두 실제 자료를 기준으로 작성되게 수정
 * 3. 환급결과 이미지(2d)는 납부세액이 있을때와 환급액일때 각 상황에 맞게 적용
 * 4. 부양가족 공제와 소득·세액 공제에서 실제로 공제된 항목을 한눈에 파악하게 금액 적용
 * 5. 사용금액은 있지만 공제받지 못한 항목을 분석해서 사유를 소득·세액공제 아래쪽에 표기
 */
export default function AiReportPage({
  onGoBack,
  onGoHome,
  onConfirmReport,
  userName,
  taxYear = '2025',
  taxData,
}) {
  const { profile, user } = useAuth();
  const loggedInWorkerName = (profile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || '')
    .replace(/\s*\(Google\)/g, '')
    .trim();

  // 로그인한 근로자 성명 우선 적용 (박미미 fallback 제거)
  const effectiveUserName = (userName && userName !== '박미미')
    ? userName
    : ((taxData?.userName && taxData?.userName !== '박미미') ? taxData.userName : (loggedInWorkerName || '근로자'));

  // 실제 등록된 자료 불러오기 및 계산 보정 (props가 비어있어도 localStorage 실제 데이터 기반 자동 계산)
  const { effectiveTaxData, familyList, rawDeductions } = useMemo(() => {
    let withholdingData = null;
    let previousJobs = [];
    let deductionData = null;
    let hometaxData = null;
    let loadedFamilyList = [];

    try {
      withholdingData = getSecureItem('selftax_withholding_data');
      previousJobs = getSecureItem('selftax_previous_jobs', []);
      deductionData = getSecureItem('selftax_deduction_data');
      hometaxData = getSecureItem('hometax_extracted_data');
      loadedFamilyList = getSecureItem('selftax_family_list', []);
    } catch (e) {
      console.error('Failed to load storage data in AiReportPage', e);
    }

    // 1) 사용자 총급여액: 주근무지 급여 추출
    const primarySalary = Number(
      withholdingData?.totalSalary ??
      withholdingData?.gross_salary ??
      withholdingData?.salary ??
      0
    );

    // 2) 부양가족 및 공제자료: 사용자 입력 및 간소화 연동 데이터 채택 (하드코딩 전면 제거)
    const effectiveFamilyList = Array.isArray(loadedFamilyList) ? loadedFamilyList : [];
    const effectiveDeductionData = (deductionData && typeof deductionData === 'object') ? deductionData : {};

    // 3) 최신 세액 계산 실행 (calculateSettlementTax 내부에서 primarySalary + previousJobs 합산)
    const freshCalculated = calculateSettlementTax({
      userName: effectiveUserName,
      taxYear,
      withholdingData: withholdingData ? {
        ...withholdingData,
        totalSalary: primarySalary,
      } : null,
      previousJobs,
      deductionData: effectiveDeductionData,
      hometaxData,
      familyList: effectiveFamilyList,
    });

    // 4) 최종 calculated 객체 구성: freshCalculated를 100% 기본 Base 데이터로 채택 (과거 캐시 및 하드코딩 완전 제거)
    let calculated = { ...(freshCalculated || {}) };

    if (freshCalculated?.taxCredits) {
      calculated.taxCredits = {
        ...freshCalculated.taxCredits,
        insuranceCredit: Number(freshCalculated.taxCredits.insuranceCredit) || 0,
        medicalCredit: Number(freshCalculated.taxCredits.medicalCredit) || 0,
        donationCredit: Number(freshCalculated.taxCredits.donationCredit) || 0,
        educationCredit: Number(freshCalculated.taxCredits.educationCredit) || 0,
        pensionCredit: Number(freshCalculated.taxCredits.pensionCredit) || 0,
      };
    }

    if (freshCalculated?.medicalDetails) {
      calculated.medicalDetails = freshCalculated.medicalDetails;
    }

    // 스토리지에도 최신 계산 결과 저장하여 다른 화면과 동기화
    try {
      setSecureItem('selftax_ai_report_data', calculated);
      if (withholdingData) {
        setSecureItem('selftax_withholding_data', {
          ...withholdingData,
          totalSalary: primarySalary,
        });
      }
    } catch {}

    return {
      effectiveTaxData: calculated,
      familyList: effectiveFamilyList,
      rawDeductions: {
        deductionData,
        hometaxData,
      },
    };
  }, [taxData, effectiveUserName, taxYear]);

  // 서브 뷰 모드: 'generating' | 'detail' | 'forecast'
  const [viewMode, setViewMode] = useState('generating');
  // AI 리포트 작성 프로그레스 & 단계
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // 3단 탭 상세결과 모달 상태
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTab, setDetailTab] = useState('credit'); // 'human' | 'income' | 'credit'

  // 카드별 아코디언 펼침 상태 (기본값: 닫힘)
  const [isFamilyExpanded, setIsFamilyExpanded] = useState(false);
  const [isTaxCreditExpanded, setIsTaxCreditExpanded] = useState(false);

  // 절세포인트 슬라이더 인덱스 (0: 자녀, 1: 결혼, 2: 월세, 3: 청약)
  const [forecastSlide, setForecastSlide] = useState(0);

  // 화면 마운트 및 뷰 전환 시 항상 상단부터 노출
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (viewMode === 'detail') {
      const el = document.getElementById('detail-scroll-container');
      if (el) el.scrollTop = 0;
    } else if (viewMode === 'forecast') {
      const el = document.getElementById('forecast-scroll-container');
      if (el) el.scrollTop = 0;
    }
  };

  useEffect(() => {
    scrollToTop();
    const t1 = setTimeout(scrollToTop, 30);
    const t2 = setTimeout(scrollToTop, 120);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [viewMode]);

  // 미공제 항목 카드별 자세히보기 아코디언 (card: 신용카드, medical: 의료비, insurance: 보험료)
  const [unclaimedExpandCard, setUnclaimedExpandCard] = useState(false);
  const [unclaimedExpandMedical, setUnclaimedExpandMedical] = useState(false);
  const [unclaimedExpandInsurance, setUnclaimedExpandInsurance] = useState(false);

  // 세액 계산 데이터 실제값 매핑
  const isRefund = effectiveTaxData?.isRefund !== undefined ? effectiveTaxData.isRefund : (effectiveTaxData?.diffTotal !== undefined ? effectiveTaxData.diffTotal <= 0 : true);
  const refundAmount = effectiveTaxData?.refundTotal ?? 0;
  const refundIncomeTax = effectiveTaxData?.refundIncomeTax ?? 0;
  const refundLocalTax = effectiveTaxData?.refundLocalTax ?? 0;
  const totalSalary = effectiveTaxData?.totalSalary ?? 0;
  const calculatedTax = effectiveTaxData?.calculatedTax ?? 0;
  const finalIncomeTax = effectiveTaxData?.finalIncomeTax ?? 0;
  const paidIncomeTax = effectiveTaxData?.paidIncomeTax ?? 0;
  const humanDeductionTotal = effectiveTaxData?.humanDeductions?.total ?? 0;
  const incomeDeductionTotal = effectiveTaxData?.incomeDeductions?.total ?? 0;
  const taxCreditTotal = effectiveTaxData?.taxCredits?.total ?? 0;

  // 예상세액 상세결과 명세 모달용 금액 표기 (공제받은 금액이 있으면 진하게, 0원이면 연하게)
  const renderDetailAmount = (amt) => {
    const num = Number(amt) || 0;
    const isZero = num === 0;
    return (
      <span className={`font-mono ${isZero ? 'text-slate-400 font-normal' : 'text-slate-900 font-bold'}`}>
        {num.toLocaleString()}원
      </span>
    );
  };

  // 사용금액은 있지만 공제받지 못한 항목 분석
  // 조건: 실제 사용금액이 있고(hasData) 공제 기준에 미달하거나 한도를 초과한 항목만 표시
  const unclaimedAnalysis = useMemo(() => {
    const salary = totalSalary || 0;
    const medThreshold = Math.floor(salary * 0.03); // 총급여의 3% (의료비 최저 기준)
    const cardThreshold = Math.floor(salary * 0.25); // 총급여의 25% (신용카드 최저 기준)
    const insLimit = 1000000; // 보장성보험료 연간 공제 한도 100만원

    // 1. 의료비: 실제 입력/추출된 금액 (없으면 0)
    const rawMed = Number(
      rawDeductions?.deductionData?.medical ||
      rawDeductions?.hometaxData?.medical ||
      0
    );
    const medCredit = effectiveTaxData?.taxCredits?.medicalCredit || 0;
    const medBelowThreshold = rawMed > 0 && rawMed < medThreshold; // 사용했지만 기준 미달
    const medShortfall = Math.max(0, medThreshold - rawMed); // 공제기준까지 부족한 금액
    const medBarPct = rawMed > 0 ? Math.min(100, Math.round((rawMed / medThreshold) * 100)) : 0;

    // 2. 신용카드: 실제 입력/추출된 금액 (없으면 0)
    const rawCardDirect = Number(rawDeductions?.deductionData?.card || 0);
    const rawCardHometax = rawDeductions?.hometaxData
      ? Number(rawDeductions.hometaxData.credit || 0) +
        Number(rawDeductions.hometaxData.debit || 0) +
        Number(rawDeductions.hometaxData.cash || 0) +
        Number(rawDeductions.hometaxData.market || 0) +
        Number(rawDeductions.hometaxData.transport || 0) +
        Number(rawDeductions.hometaxData.culture || 0)
      : 0;
    const rawCard = rawCardDirect || rawCardHometax; // 실제 데이터만 사용 (샘플값 사용 안함)
    const cardDeduction = effectiveTaxData?.incomeDeductions?.creditCard || 0;
    const cardBelowThreshold = rawCard > 0 && rawCard < cardThreshold; // 사용했지만 기준 미달
    const cardShortfall = Math.max(0, cardThreshold - rawCard); // 공제기준까지 부족한 금액
    const cardBarPct = rawCard > 0 ? Math.min(100, Math.round((rawCard / cardThreshold) * 100)) : 0;

    // 3. 보장성보험료: 실제 입력/추출된 금액 (없으면 0)
    const rawIns = Number(
      rawDeductions?.deductionData?.insurance ||
      rawDeductions?.hometaxData?.insurance ||
      0
    );
    const insCredit = effectiveTaxData?.taxCredits?.insuranceCredit || 0;
    const insDisallowed = Math.max(0, rawIns - insLimit); // 한도 초과 미공제액
    const insOverLimit = rawIns > 0 && insDisallowed > 0; // 납입했지만 한도 초과
    const insBarPct = rawIns > 0 ? Math.min(150, Math.round((rawIns / insLimit) * 100)) : 0; // 100% 초과 표현 위해 150 상한

    return {
      medical: {
        hasData: rawMed > 0,
        show: rawMed > 0 && medBelowThreshold, // 사용금액 있지만 기준 미달인 경우만 표시
        spent: rawMed,
        threshold: medThreshold,
        shortfall: medShortfall,
        credit: medCredit,
        barPct: medBarPct,
        belowThreshold: medBelowThreshold,
      },
      card: {
        hasData: rawCard > 0,
        show: rawCard > 0 && cardBelowThreshold, // 사용금액 있지만 기준 미달인 경우만 표시
        spent: rawCard,
        threshold: cardThreshold,
        shortfall: cardShortfall,
        deduction: cardDeduction,
        barPct: cardBarPct,
        belowThreshold: cardBelowThreshold,
      },
      insurance: {
        hasData: rawIns > 0,
        show: rawIns > 0 && insOverLimit, // 납입했지만 한도 초과인 경우만 표시
        spent: rawIns,
        limit: insLimit,
        credit: insCredit,
        disallowed: insDisallowed,
        barPct: insBarPct,
        overLimit: insOverLimit,
      },
    };
  }, [totalSalary, effectiveTaxData, rawDeductions]);

  // AI 리포트 실시간 작성 인터랙션 타이머
  useEffect(() => {
    if (viewMode === 'generating') {
      setGenerationProgress(0);
      setCurrentStepIndex(0);

      const interval = setInterval(() => {
        setGenerationProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'instant' });
              setViewMode('detail');
            }, 300);
            return 100;
          }
          const next = prev + 25;
          if (next >= 75) setCurrentStepIndex(3);
          else if (next >= 50) setCurrentStepIndex(2);
          else if (next >= 25) setCurrentStepIndex(1);
          return next;
        });
      }, 300);

      return () => clearInterval(interval);
    }
  }, [viewMode]);

  const generationSteps = [
    {
      title: '총급여 및 기납부세액 정밀 대조',
      desc: `총급여 ${(totalSalary / 10000).toLocaleString()}만원 / 기납부 ${(paidIncomeTax).toLocaleString()}원 분석`,
      icon: '📊',
    },
    {
      title: '부양가족 및 인적공제 요건 검증',
      desc: `기본공제 ${(humanDeductionTotal / 10000).toLocaleString()}만원 정상 반영`,
      icon: '👨‍👩‍👧',
    },
    {
      title: '세액공제(보험·의료·교육·기부) 최적 산출',
      desc: `산출세액 ${calculatedTax.toLocaleString()}원 중 ${(taxCreditTotal).toLocaleString()}원 세액 감면`,
      icon: '🧾',
    },
    {
      title: isRefund ? '최종 결정세액 및 환급액 확정 리포트 완성' : '최종 결정세액 및 납부세액 확정 리포트 완성',
      desc: isRefund
        ? `결정세액 ${finalIncomeTax.toLocaleString()}원 확정 ➔ 최종 환급세액 ${refundAmount.toLocaleString()}원 도출!`
        : `결정세액 ${finalIncomeTax.toLocaleString()}원 확정 ➔ 최종 납부세액 ${refundAmount.toLocaleString()}원 산출`,
      icon: isRefund ? '🎉' : '📋',
    },
  ];

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col justify-between font-sans select-none animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* VIEW 1: AI 결과리포트 실시간 작성 중 화면 ('generating')                    */}
      {/* ========================================================================= */}
      {viewMode === 'generating' && (
        <div className="flex-1 flex flex-col justify-between p-0 bg-gradient-to-b from-[#F0F5FF] via-white to-[#F8FAFC]">
          {/* 상단 헤더: ← AI 연말정산 리포트 + 첨부 홈화면 아이콘 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-xs sticky top-0 z-20">
            <button
              type="button"
              onClick={onGoBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="shrink-0 flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                AI 연말정산 리포트
              </span>
            </button>
            <HomeButton onClick={onGoHome} />
          </div>

          {/* 중앙 AI 분석 애니메이션 영역 */}
          <div className="flex-1 px-6 py-8 flex flex-col items-center justify-center text-center space-y-6">
            {/* AI 펄스 뱃지 & 아이콘 */}
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#4338CA] via-[#4F46E5] to-[#7C3AED] shadow-xl shadow-indigo-500/25 flex items-center justify-center text-white text-3xl animate-bounce">
                ✨
              </div>
              <div className="absolute -inset-1 rounded-3xl bg-indigo-400/20 animate-ping -z-10" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-block px-3 py-1 rounded-full bg-indigo-100/80 text-[#4F46E5] text-[11.5px] font-extrabold tracking-wide">
                AI 세무 분석 엔진 가동 중
              </div>
              <h2 className="text-[19px] font-black text-slate-900 leading-snug tracking-tight">
                {effectiveUserName}님의 예상세액 상세결과를 바탕으로<br />
                <span className="text-[#4F46E5]">AI 맞춤 결과리포트</span>를 작성하고 있어요
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                소득·인적공제 및 5대 세액공제를 정밀 대조하고 있습니다.
              </p>
            </div>

            {/* 프로그레스 바 */}
            <div className="w-full max-w-sm space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                <span>리포트 완성도</span>
                <span className="text-[#4F46E5] font-mono">{generationProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#4338CA] to-[#6366F1] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            </div>

            {/* 실시간 단계별 분석 상태 카드 */}
            <div className="w-full max-w-sm space-y-2 pt-2 text-left">
              {generationSteps.map((step, idx) => {
                const isDone = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl border transition-all duration-300 flex items-center gap-3 ${
                      isDone
                        ? 'bg-white border-indigo-200 shadow-2xs'
                        : 'bg-white/50 border-slate-100 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        isDone
                          ? 'bg-[#4F46E5] text-white'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {step.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate font-mono">
                        {step.desc}
                      </div>
                    </div>
                    {isCurrent && (
                      <div className="w-2 h-2 rounded-full bg-[#4F46E5] animate-ping shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 스킵/바로보기 버튼 */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onGoBack}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              이전 (예상세액)
            </button>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
                setViewMode('detail');
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              <span>리포트 바로보기</span>
              <span className="text-[11px] text-indigo-200">›</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: AI 연말정산 결과 리포트 상세 분석 화면 ('detail')                       */}
      {/* ========================================================================= */}
      {viewMode === 'detail' && (
        <div className="flex-1 flex flex-col justify-between p-0 bg-[#F4F7FC] animate-in fade-in duration-200">
          {/* 상단 헤더: ← AI 연말정산 결과 리포트 + 첨부 홈화면 아이콘 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20 shadow-2xs">
            <button
              type="button"
              onClick={onGoBack}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="shrink-0 flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                AI 연말정산 결과 리포트
              </span>
            </button>

            {/* 첨부 이미지의 홈화면 아이콘 */}
            <HomeButton onClick={onGoHome} />
          </div>

          {/* 메인 스크롤 콘텐츠 */}
          <div id="detail-scroll-container" className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
            {/* 상단 AI 안내 배너 (요구사항: 실제 신고 자료 문구 삭제) */}
            <div className="bg-[#EEF2FF] border border-indigo-100/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <p className="font-bold text-[15px] sm:text-[16px] text-slate-800 leading-snug">
                  AI가 예상세액 상세결과를 정밀 분석하여,<br />
                  <span className="text-[#4F46E5]">맞춤 절세 성과와 {refundAmount === 0 ? '예상세액' : (isRefund ? '환급액' : '납부세액')}</span>을 도출했어요.
                </p>
              </div>

              {/* 2D AI 리포트 분석 아이콘 */}
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                <img
                  src="/assets/report_banner_2d.jpg"
                  alt="AI 리포트 분석 2D 일러스트"
                  className="w-12 h-12 object-contain rounded-xl"
                />
              </div>
            </div>

            {/* 카드 0: 연말정산 결과 (요구사항 3: 납부세액/환급액에 따라 2D 일러스트 자동 전환) */}
            <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex flex-col items-center text-center space-y-3.5">
              <div className={`inline-block px-3.5 py-1 rounded-full text-[11.5px] font-extrabold border ${
                isRefund
                  ? 'bg-[#ECFDF5] text-[#059669] border-emerald-100'
                  : 'bg-[#FFF1F2] text-[#E11D48] border-rose-100'
              }`}>
                {isRefund ? `🎉 ${taxYear}년 연말정산 환급 결과` : `📋 ${taxYear}년 연말정산 납부(징수) 결과`}
              </div>

              {/* 2D 일러스트: 환급 시 지갑&환급금 일러스트, 추가납부 시 세금고지&납부 일러스트 적용 */}
              <div className="w-52 h-44 flex items-center justify-center py-1">
                <img
                  src={isRefund ? '/assets/report_refund_2d.jpg' : '/assets/report_payment_2d.jpg'}
                  alt={isRefund ? `${taxYear}년 환급 결과 2D 일러스트` : `${taxYear}년 납부 결과 2D 일러스트`}
                  className="max-h-40 max-w-full object-contain rounded-2xl shadow-xs"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[13px] font-bold text-slate-800">
                  {refundAmount === 0 ? (
                    <>올해 <span className="text-slate-900 font-extrabold">예상 정산 세액</span>은</>
                  ) : isRefund ? (
                    <>올해 <span className="text-[#16A34A] font-extrabold">돌려받으실(환급)</span> 세금은</>
                  ) : (
                    <>올해 <span className="text-[#DC2626] font-extrabold">추가 납부하실</span> 세금은</>
                  )}
                </div>
                <div className={`text-[26px] font-black font-mono tracking-tight ${refundAmount === 0 ? 'text-slate-800' : (isRefund ? 'text-[#16A34A]' : 'text-[#DC2626]')}`}>
                  {refundAmount === 0 ? '0원' : (isRefund ? `(-)${refundAmount.toLocaleString()}원` : `(+)${refundAmount.toLocaleString()}원`)}
                </div>
                <div className="text-[11.5px] text-slate-500 font-medium">
                  {refundAmount === 0
                    ? '소득세 0원 + 지방소득세 0원'
                    : isRefund
                    ? `소득세 (-)${refundIncomeTax.toLocaleString()}원 + 지방소득세 (-)${refundLocalTax.toLocaleString()}원`
                    : `소득세 (+)${refundIncomeTax.toLocaleString()}원 + 지방소득세 (+)${refundLocalTax.toLocaleString()}원`}
                </div>
              </div>



              <div className="pt-1 w-full flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowDetailModal(true)}
                  className="w-full py-2.5 rounded-xl border border-indigo-200 hover:border-indigo-400 text-xs font-bold text-[#4F46E5] bg-indigo-50/50 hover:bg-indigo-100/60 transition cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                >
                  <span>📊 예상세액 상세결과(3단 탭) 확인하기</span>
                  <span className="text-xs">›</span>
                </button>
              </div>
            </div>

            {/* 카드 0-1: AI 근거 보기 (화면 계산값 → /rag/explain, 국세청 안내서 출처 표시) */}
            <AiExplainCard taxResult={effectiveTaxData} />

            {/* 카드 1: 부양가족공제 (요구사항 4: 실제 등록된 가족 및 공제금액 한눈에 파악) */}
            <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex flex-col items-center text-center space-y-4">
              <div className="inline-block px-3.5 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-[11.5px] font-bold border border-indigo-100">
                부양가족공제 (인적공제)
              </div>

              {/* 2D 부부·가족 일러스트 */}
              <div className="w-52 h-44 flex items-center justify-center py-1">
                <img
                  src="/assets/report_couple_2d.jpg"
                  alt="부양가족 공제 2D 일러스트"
                  className="max-h-40 max-w-full object-contain rounded-2xl"
                />
              </div>

              <div className="space-y-1.5 text-center">
                <div className="text-[17px] font-extrabold text-slate-900 tracking-tight">
                  <span className="text-[#4F46E5]">{humanDeductionTotal.toLocaleString()}원</span> 공제 받았어요.
                </div>
                <div className="text-xs text-slate-500 font-medium leading-relaxed">
                  {humanDeductionTotal === 0 ? (
                    '등록된 부양가족 공제 자료가 없습니다.'
                  ) : (
                    <>
                      본인 기본공제(150만원)
                      {(effectiveTaxData?.humanDeductions?.spouse || 0) > 0 ? ' + 배우자(150만원)' : ''}
                      {(effectiveTaxData?.humanDeductions?.dependents || 0) > 0
                        ? ` + 기타부양가족(${(effectiveTaxData.humanDeductions.dependents / 10000).toLocaleString()}만원)`
                        : ''}
                      {(effectiveTaxData?.humanDeductions?.additional || 0) > 0
                        ? ` + 추가공제(${(effectiveTaxData.humanDeductions.additional / 10000).toLocaleString()}만원)`
                        : ''}
                      <br />
                      총 {humanDeductionTotal.toLocaleString()}원을 소득공제 받아 과세표준을 낮췄어요.
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFamilyExpanded(!isFamilyExpanded)}
                className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition pt-1 cursor-pointer"
              >
                <span>{isFamilyExpanded ? '접기' : '자세히보기'}</span>
                <span className="text-[11px]">{isFamilyExpanded ? '∧' : '∨'}</span>
              </button>

              {isFamilyExpanded && (
                <div className="w-full pt-4 mt-2 border-t border-slate-100 space-y-4 text-left animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800">부양가족 공제 상세 내역</span>
                    <span className="text-[11px] text-indigo-600 font-bold">1인당 150만 원</span>
                  </div>

                  {/* 실제 부양가족 목록 매핑 */}
                  <div className="space-y-2">
                    <div className="space-y-2 text-xs">
                      {/* 본인 */}
                      <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          <span className="font-semibold text-slate-900">{effectiveUserName} (본인)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-100/70 text-indigo-700 font-medium">기본공제</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">
                          {(effectiveTaxData?.humanDeductions?.self ?? 0).toLocaleString()}원
                        </span>
                      </div>

                      {/* 등록된 가족이 있는 경우 가족별 행 렌더링 */}
                      {familyList && familyList.length > 0 ? (
                        familyList
                          .filter((m) => !m.isSelf && m.relation !== '본인')
                          .map((member, idx) => {
                            const cleanMName = (member.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
                            const rel = member.relation || '';
                            const isChild = rel.includes('자녀') || rel.includes('손자녀') || rel.includes('입양') || rel.includes('비속') || rel.includes('위탁');
                            const isDisabled = Boolean(
                              member.isDisabled ||
                              (member.disabledDeduction && member.disabledDeduction !== '해당없음')
                            );

                            // 출생연도 추출
                            const birthStr = String(member.birth || member.birthDate || '').trim();
                            const rrnStr = String(member.rrn || '').replace(/[^0-9]/g, '');
                            let bYear = null;
                            if (birthStr.length >= 4) {
                              const matchY = birthStr.match(/^(19\d{2}|20\d{2})/);
                              if (matchY) bYear = parseInt(matchY[1], 10);
                            }
                            if (bYear === null && rrnStr.length >= 6) {
                              const yy = parseInt(rrnStr.slice(0, 2), 10);
                              bYear = yy <= 25 ? 2000 + yy : 1900 + yy;
                            }

                            const isIncomeOver = Boolean(
                              member.incomeOver === '초과함' ||
                              member.incomeExcess
                            );

                            const isAgeDisqualified = Boolean(
                              !isDisabled && (
                                failsAgeRequirement(member) ||
                                (isChild && bYear !== null && bYear < 2005)
                              )
                            );

                            const isBasic = !isIncomeOver && !isAgeDisqualified && member.basicDeduction !== '해당없음';

                            let memberDeduction = 0;
                            if (isBasic) memberDeduction += 1500000;
                            if (member.isSenior && isBasic) memberDeduction += 1000000;
                            if (isDisabled && isBasic) memberDeduction += 2000000;

                            return (
                              <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-slate-700">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isBasic ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                  <span className="font-semibold text-slate-900">{cleanMName} ({member.relation})</span>
                                  {isBasic ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100/70 text-emerald-700 font-medium">기본공제</span>
                                  ) : isAgeDisqualified ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 font-medium">기본공제 제외(나이요건)</span>
                                  ) : isIncomeOver ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 font-medium">기본공제 제외(소득초과)</span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 font-medium">기본공제 제외</span>
                                  )}
                                  {member.isSenior && isBasic && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">경로우대</span>}
                                  {isDisabled && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">장애인</span>}
                                </div>
                                <span className={`font-mono font-bold ${memberDeduction > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                                  {memberDeduction.toLocaleString()}원
                                </span>
                              </div>
                            );
                          })
                      ) : (
                        // 부양가족 데이터가 기본값일 때
                        <>
                          <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-slate-700">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span className="font-semibold text-slate-900">배우자</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100/70 text-emerald-700 font-medium">기본공제</span>
                            </div>
                            <span className="font-mono font-bold text-slate-900">
                              {(effectiveTaxData?.humanDeductions?.spouse ?? 1500000).toLocaleString()}원
                            </span>
                          </div>
                          {(effectiveTaxData?.humanDeductions?.dependents || 0) > 0 && (
                            <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                <span className="font-semibold text-slate-900">기타 부양가족</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-700 font-medium">자녀/직계존속</span>
                              </div>
                              <span className="font-mono font-bold text-slate-900">
                                {(effectiveTaxData?.humanDeductions?.dependents || 0).toLocaleString()}원
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* 추가공제 합계가 있는 경우 */}
                      {(effectiveTaxData?.humanDeductions?.additional || 0) > 0 && (
                        <div className="flex justify-between items-center p-2.5 bg-amber-50/70 border border-amber-100 rounded-xl text-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span className="font-semibold text-slate-900">추가공제 합계</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-800 font-medium">경로우대/장애인/한부모</span>
                          </div>
                          <span className="font-mono font-bold text-amber-900">
                            {effectiveTaxData.humanDeductions.additional.toLocaleString()}원
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-indigo-50/70 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-indigo-100/60">
                    💡 <strong>AI 검증 코멘트:</strong> 등록된 가족구성원의 소득금액 요건(연 100만원 이하, 근로소득만 있는 경우 총급여 500만원 이하) 충족 여부를 확인하여 인적공제 총 {humanDeductionTotal.toLocaleString()}원이 정확하게 반영되었습니다.
                  </div>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setIsFamilyExpanded(false)}
                      className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mx-auto cursor-pointer"
                    >
                      <span>접기</span>
                      <span className="text-[11px]">∧</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 카드 2: 소득·세액공제 (요구사항 4: 실제 공제된 항목과 금액 한눈에 파악) */}
            <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex flex-col items-center text-center space-y-4">
              <div className="inline-block px-3.5 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-[11.5px] font-bold border border-indigo-100">
                소득·세액공제
              </div>

              {/* 2D 세액공제 계산 일러스트 */}
              <div className="w-52 h-44 flex items-center justify-center py-1">
                <img
                  src="/assets/report_taxcredit_2d.jpg"
                  alt="소득·세액공제 감면 2D 일러스트"
                  className="max-h-40 max-w-full object-contain rounded-2xl"
                />
              </div>

              <div className="space-y-1.5 text-center">
                <div className="text-[17px] font-extrabold text-slate-900 tracking-tight">
                  <span className="text-[#4F46E5]">{taxCreditTotal.toLocaleString()}원</span> 세액 감면 받았어요.
                </div>
                <div className="text-xs text-slate-500 font-medium leading-relaxed">
                  {taxCreditTotal === 0 && incomeDeductionTotal === 0 ? (
                    '등록된 소득·세액공제 증빙 자료가 없습니다.'
                  ) : (
                    <>
                      소득공제 <span className="text-slate-700 font-bold">{incomeDeductionTotal.toLocaleString()}원</span>으로 과세표준을 낮추고,<br />
                      세액공제 <span className="text-[#4F46E5] font-bold">{taxCreditTotal.toLocaleString()}원</span>을 산출세액에서 전액 차감했어요.
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTaxCreditExpanded(!isTaxCreditExpanded)}
                className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition pt-1 cursor-pointer"
              >
                <span>{isTaxCreditExpanded ? '접기' : '자세히보기'}</span>
                <span className="text-[11px]">{isTaxCreditExpanded ? '∧' : '∨'}</span>
              </button>

              {isTaxCreditExpanded && (
                <div className="w-full pt-4 mt-2 border-t border-slate-100 space-y-4 text-left animate-in fade-in duration-150">
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm text-slate-800">
                      실제 공제 반영 항목 및 금액
                    </div>
                    <div className="text-[11px] text-slate-400">
                      입력하신 공제서류를 기반으로 실제 세액 계산에 인정된 금액입니다.
                    </div>
                  </div>

                  {/* 1. 소득공제 항목 (과세표준 차감) */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-[#4F46E5]">소득공제 항목</span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        합계 {incomeDeductionTotal.toLocaleString()}원
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-1 text-xs text-slate-600 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-indigo-400">•</span> 국민연금보험료
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.incomeDeductions?.nationalPension || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-indigo-400">•</span> 건강보험료
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.incomeDeductions?.healthInsurance || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-indigo-400">•</span> 고용보험료
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.incomeDeductions?.employmentInsurance || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-indigo-400">•</span> 신용카드 등 사용금액
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.incomeDeductions?.creditCard || 0).toLocaleString()}원
                        </span>
                      </div>
                      {(effectiveTaxData?.incomeDeductions?.housingLoan || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-indigo-400">•</span> 주택자금 차입금 상환액
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.incomeDeductions.housingLoan.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {(effectiveTaxData?.incomeDeductions?.housingSavings || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-indigo-400">•</span> 주택마련저축 (청약 등)
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.incomeDeductions.housingSavings.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {(effectiveTaxData?.incomeDeductions?.smallBiz || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-indigo-400">•</span> 소기업·소상공인 공제부금
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.incomeDeductions.smallBiz.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {(effectiveTaxData?.incomeDeductions?.longInvest || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-indigo-400">•</span> 장기집합투자증권 저축
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.incomeDeductions.longInvest.toLocaleString()}원
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. 세액공제 항목 (산출세액 직접 차감) */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-[#4F46E5]">세액공제 항목</span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        합계 {taxCreditTotal.toLocaleString()}원
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-1 text-xs text-slate-600 bg-indigo-50/40 p-3 rounded-2xl border border-indigo-100/60">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-[#4F46E5]">•</span> 근로소득세액공제
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.taxCredits?.earnedIncomeCredit || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-[#4F46E5]">•</span> 보장성보험료 세액공제
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.taxCredits?.insuranceCredit || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-[#4F46E5]">•</span> 의료비 세액공제
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.taxCredits?.medicalCredit || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-[#4F46E5]">•</span> 기부금 세액공제
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.taxCredits?.donationCredit || 0).toLocaleString()}원
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-[10px] text-[#4F46E5]">•</span> 교육비 세액공제
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(effectiveTaxData?.taxCredits?.educationCredit || 0).toLocaleString()}원
                        </span>
                      </div>
                      {(effectiveTaxData?.taxCredits?.pensionCredit || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-[#4F46E5]">•</span> 연금계좌 세액공제
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.taxCredits.pensionCredit.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {(effectiveTaxData?.taxCredits?.rentCredit || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-[#4F46E5]">•</span> 월세액 세액공제
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.taxCredits.rentCredit.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {(effectiveTaxData?.taxCredits?.marriageCredit || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-[#4F46E5]">•</span> 혼인세액공제
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.taxCredits.marriageCredit.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {(effectiveTaxData?.taxCredits?.childCredit || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-[10px] text-[#4F46E5]">•</span> 자녀세액공제
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {effectiveTaxData.taxCredits.childCredit.toLocaleString()}원
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setIsTaxCreditExpanded(false)}
                      className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mx-auto cursor-pointer"
                    >
                      <span>접기</span>
                      <span className="text-[11px]">∧</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 카드 2-1: 사용금액이 있지만 공제받지 못한 항목 (예시화면 스타일) */}
            {(unclaimedAnalysis.card.show || unclaimedAnalysis.medical.show || unclaimedAnalysis.insurance.show) && (
              <div className="space-y-3">
                {/* 섹션 헤더 (카드 밖) */}
                <div className="px-1 pt-1">
                  <h3 className="text-[17px] text-slate-800 leading-snug tracking-tight font-normal">
                    사용금액은 있지만<br />
                    <span className="font-extrabold text-slate-900">공제받지 못한 항목</span>을 분석해 봤어요.
                  </h3>
                </div>

                {/* ── 신용카드공제 카드: 사용금액은 있지만 총급여 25% 기준 미달 ── */}
                {unclaimedAnalysis.card.show && (
                  <div className="w-full bg-white rounded-3xl px-5 pt-6 pb-5 border border-slate-200/90 shadow-sm space-y-5 text-center">
                    {/* 배지 */}
                    <span className="inline-block px-4 py-1.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                      신용카드공제
                    </span>

                    {/* 제목 + 설명 */}
                    <div className="space-y-2">
                      <p className="text-[17px] font-extrabold text-slate-900 leading-snug">
                        공제 기준이 충족되지 않았어요.
                      </p>
                      <p className="text-[13px] text-slate-500 leading-relaxed whitespace-pre-line">
                        {'신용카드 등 사용금액이 총 급여의\n25%를 초과해야 공제 가능해요.'}
                      </p>
                    </div>

                    {/* 사용금액 행 + 프로그레스바 */}
                    <div className="text-left space-y-3 pt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">사용금액</span>
                        <span className="text-[17px] font-extrabold text-slate-900 font-mono">
                          {unclaimedAnalysis.card.spent.toLocaleString()}원
                        </span>
                      </div>

                      {/* 프로그레스 바 */}
                      <div className="relative pt-7 pb-1">
                        {/* 버블 레이블 */}
                        <div
                          className="absolute top-0 flex items-center justify-center"
                          style={{
                            left: `${Math.max(8, Math.min(unclaimedAnalysis.card.barPct, 82))}%`,
                            transform: 'translateX(-50%)',
                          }}
                        >
                          <span className="bg-[#3B3B98] text-white text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
                            {unclaimedAnalysis.card.spent.toLocaleString()}원
                          </span>
                        </div>
                        {/* 바 트랙 */}
                        <div className="w-full h-[5px] bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#3B3B98]"
                            style={{ width: `${unclaimedAnalysis.card.barPct}%` }}
                          />
                        </div>
                      </div>

                      {/* 기준 / 미달 정보 행 */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">공제기준(총 급여 25%)</span>
                          <span className="font-mono text-slate-700">{unclaimedAnalysis.card.threshold.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">미달금액</span>
                          <span className="font-mono font-bold text-[#E11D48]">
                            {unclaimedAnalysis.card.shortfall.toLocaleString()}원 부족
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 자세히보기 토글 */}
                    <button
                      type="button"
                      onClick={() => setUnclaimedExpandCard(!unclaimedExpandCard)}
                      className="flex items-center justify-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer w-full pt-1"
                    >
                      <span>자세히보기</span>
                      <span className="text-[11px]">{unclaimedExpandCard ? '∧' : '∨'}</span>
                    </button>

                    {/* 자세히보기 상세 */}
                    {unclaimedExpandCard && (
                      <div className="text-left pt-3 border-t border-slate-100 space-y-2.5">
                        <div className="bg-[#F5F5FF] p-3.5 rounded-2xl space-y-1.5">
                          <p className="text-[11.5px] font-bold text-[#4F46E5]">📌 세법상 불공제 사유</p>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            신용카드 등 사용금액은 <strong>총급여액의 25%(기준: {unclaimedAnalysis.card.threshold.toLocaleString()}원)</strong>를 초과한 금액에 대해서만 결제수단별 공제율(신용카드 15%, 체크카드·현금 30%)이 적용됩니다.
                          </p>
                          <p className="text-[11.5px] text-[#E11D48] font-semibold">
                            현재 사용금액이 기준액에 <strong>{unclaimedAnalysis.card.shortfall.toLocaleString()}원</strong> 미달하여 소득공제가 적용되지 않았습니다.
                          </p>
                        </div>
                        <div className="bg-amber-50/70 p-3.5 rounded-2xl space-y-1">
                          <p className="text-[11.5px] font-bold text-amber-800">💡 내년 절세 전략</p>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            총급여의 25%까지는 혜택이 좋은 신용카드를, <strong>25% 초과분부터는 공제율이 2배인 체크카드·현금영수증(30%)</strong>을 집중 사용하면 내년에 공제 혜택을 받을 수 있어요.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 의료비공제 카드: 사용금액은 있지만 총급여 3% 기준 미달 ── */}
                {unclaimedAnalysis.medical.show && (
                  <div className="w-full bg-white rounded-3xl px-5 pt-6 pb-5 border border-slate-200/90 shadow-sm space-y-5 text-center">
                    {/* 배지 */}
                    <span className="inline-block px-4 py-1.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                      의료비공제
                    </span>

                    {/* 제목 + 설명 */}
                    <div className="space-y-2">
                      <p className="text-[17px] font-extrabold text-slate-900 leading-snug">
                        공제 기준이 충족되지 않았어요.
                      </p>
                      <p className="text-[13px] text-slate-500 leading-relaxed whitespace-pre-line">
                        {'의료비 사용금액이 총 급여의\n3%를 초과해야 공제 가능해요.'}
                      </p>
                    </div>

                    {/* 사용금액 행 + 프로그레스바 */}
                    <div className="text-left space-y-3 pt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">사용금액</span>
                        <span className="text-[17px] font-extrabold text-slate-900 font-mono">
                          {unclaimedAnalysis.medical.spent.toLocaleString()}원
                        </span>
                      </div>

                      {/* 프로그레스 바 */}
                      <div className="relative pt-7 pb-1">
                        <div
                          className="absolute top-0 flex items-center justify-center"
                          style={{
                            left: `${Math.max(8, Math.min(unclaimedAnalysis.medical.barPct, 82))}%`,
                            transform: 'translateX(-50%)',
                          }}
                        >
                          <span className="bg-[#3B3B98] text-white text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
                            {unclaimedAnalysis.medical.spent.toLocaleString()}원
                          </span>
                        </div>
                        <div className="w-full h-[5px] bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#3B3B98]"
                            style={{ width: `${unclaimedAnalysis.medical.barPct}%` }}
                          />
                        </div>
                      </div>

                      {/* 기준 / 미달 정보 행 */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">공제기준(총 급여 3%)</span>
                          <span className="font-mono text-slate-700">{unclaimedAnalysis.medical.threshold.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">미달금액</span>
                          <span className="font-mono font-bold text-[#E11D48]">
                            {unclaimedAnalysis.medical.shortfall.toLocaleString()}원 부족
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 자세히보기 토글 */}
                    <button
                      type="button"
                      onClick={() => setUnclaimedExpandMedical(!unclaimedExpandMedical)}
                      className="flex items-center justify-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer w-full pt-1"
                    >
                      <span>자세히보기</span>
                      <span className="text-[11px]">{unclaimedExpandMedical ? '∧' : '∨'}</span>
                    </button>

                    {/* 자세히보기 상세 */}
                    {unclaimedExpandMedical && (
                      <div className="text-left pt-3 border-t border-slate-100 space-y-2.5">
                        <div className="bg-[#F5F5FF] p-3.5 rounded-2xl space-y-1.5">
                          <p className="text-[11.5px] font-bold text-[#4F46E5]">📌 세법상 불공제 사유</p>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            의료비 세액공제는 <strong>총급여액의 3%(기준액: {unclaimedAnalysis.medical.threshold.toLocaleString()}원)</strong>를 초과하여 지출한 금액에 대해서만 15% 세액공제가 지원됩니다.
                          </p>
                          <p className="text-[11.5px] text-[#E11D48] font-semibold">
                            기준액 이하 지출분 <strong>{unclaimedAnalysis.medical.spent.toLocaleString()}원</strong>은 세법상 공제 대상에서 제외되었습니다.
                          </p>
                        </div>
                        <div className="bg-amber-50/70 p-3.5 rounded-2xl space-y-1">
                          <p className="text-[11.5px] font-bold text-amber-800">💡 내년 절세 전략</p>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            맞벌이 부부의 경우 <strong>총급여가 낮은 배우자 명의로 의료비를 몰아주면</strong> 3% 기준액이 낮아져 더 많은 공제 혜택을 받을 수 있어요.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 보장성보험료 카드: 납입금액이 연 100만원 한도 초과 ── */}
                {unclaimedAnalysis.insurance.show && (
                  <div className="w-full bg-white rounded-3xl px-5 pt-6 pb-5 border border-slate-200/90 shadow-sm space-y-5 text-center">
                    {/* 배지 */}
                    <span className="inline-block px-4 py-1.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                      보장성보험료공제
                    </span>

                    {/* 제목 + 설명 */}
                    <div className="space-y-2">
                      <p className="text-[17px] font-extrabold text-slate-900 leading-snug">
                        한도를 초과한 납입액이 있어요.
                      </p>
                      <p className="text-[13px] text-slate-500 leading-relaxed">
                        보장성보험료는 연간 100만원 한도 내에서만<br />12% 세액공제가 지원돼요.
                      </p>
                    </div>

                    {/* 납입금액 행 + 프로그레스바 */}
                    <div className="text-left space-y-3 pt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">총 납입액</span>
                        <span className="text-[17px] font-extrabold text-slate-900 font-mono">
                          {unclaimedAnalysis.insurance.spent.toLocaleString()}원
                        </span>
                      </div>

                      {/* 프로그레스 바 (한도 초과시 빨간색) */}
                      <div className="relative pt-7 pb-1">
                        <div
                          className="absolute top-0 flex items-center justify-center"
                          style={{
                            left: `${Math.max(8, Math.min(82, Math.round((unclaimedAnalysis.insurance.limit / unclaimedAnalysis.insurance.spent) * 80)))}%`,
                            transform: 'translateX(-50%)',
                          }}
                        >
                          <span className="bg-[#E11D48] text-white text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
                            {unclaimedAnalysis.insurance.spent.toLocaleString()}원
                          </span>
                        </div>
                        {/* 트랙: 한도(파랑) + 초과(빨강) */}
                        <div className="w-full h-[5px] bg-slate-100 rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-[#3B3B98] flex-shrink-0"
                            style={{ width: `${Math.round((unclaimedAnalysis.insurance.limit / unclaimedAnalysis.insurance.spent) * 100)}%` }}
                          />
                          <div className="h-full bg-[#E11D48] flex-1" />
                        </div>
                      </div>

                      {/* 기준 / 초과 정보 행 */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">연간 공제 한도</span>
                          <span className="font-mono text-slate-700">{unclaimedAnalysis.insurance.limit.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">세액공제액 (한도 내 12%)</span>
                          <span className="font-mono font-bold text-[#4F46E5]">{unclaimedAnalysis.insurance.credit.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-slate-500">한도 초과 미공제액</span>
                          <span className="font-mono font-bold text-[#E11D48]">
                            {unclaimedAnalysis.insurance.disallowed.toLocaleString()}원 미공제
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 자세히보기 토글 */}
                    <button
                      type="button"
                      onClick={() => setUnclaimedExpandInsurance(!unclaimedExpandInsurance)}
                      className="flex items-center justify-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer w-full pt-1"
                    >
                      <span>자세히보기</span>
                      <span className="text-[11px]">{unclaimedExpandInsurance ? '∧' : '∨'}</span>
                    </button>

                    {/* 자세히보기 상세 */}
                    {unclaimedExpandInsurance && (
                      <div className="text-left pt-3 border-t border-slate-100 space-y-2.5">
                        <div className="bg-[#F5F5FF] p-3.5 rounded-2xl space-y-1.5">
                          <p className="text-[11.5px] font-bold text-[#4F46E5]">📌 세법상 불공제 사유</p>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            일반 보장성보험료 세액공제는 <strong>연간 납입액 100만 원 한도(12% 공제, 최대 12만 원)</strong>까지만 인정됩니다.
                          </p>
                          <p className="text-[11.5px] text-[#E11D48] font-semibold">
                            연 100만 원을 초과한 <strong>{unclaimedAnalysis.insurance.disallowed.toLocaleString()}원</strong>은 세법상 이월이나 추가 공제가 불가능합니다.
                          </p>
                        </div>
                        <div className="bg-amber-50/70 p-3.5 rounded-2xl space-y-1">
                          <p className="text-[11.5px] font-bold text-amber-800">💡 내년 절세 전략</p>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            한도를 초과한 보험료는 <strong>가족 구성원(배우자, 부양가족) 명의로 분산하여 각자 100만원 한도</strong>를 활용하면 추가 공제 혜택을 받을 수 있어요.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}


            {/* 카드 3: 2026년 절세포인트 미리보기 배너 */}

            <div
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
                setViewMode('forecast');
              }}
              className="w-full bg-gradient-to-r from-rose-50/80 via-white to-indigo-50/60 rounded-2xl p-4 border border-rose-100/90 shadow-2xs flex items-center justify-between cursor-pointer hover:shadow-md hover:border-indigo-300 transition group relative overflow-hidden"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-13 h-13 relative flex items-center justify-center shrink-0">
                  <div className="w-11 h-12 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden transform -rotate-3 group-hover:scale-105 transition">
                    <div className="h-3.5 bg-[#FF6B8B] flex items-center justify-between px-1.5">
                      <div className="w-1 h-1.5 rounded-full bg-white" />
                      <div className="text-[7.5px] font-black text-white tracking-tighter">TAX</div>
                      <div className="w-1 h-1.5 rounded-full bg-white" />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center bg-white">
                      <span className="text-[12.5px] font-black text-slate-800 tracking-tight leading-none">2026</span>
                    </div>
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-[15.5px] text-[#DC2626] font-black tracking-tight leading-tight">
                    2026년 연말정산
                  </div>
                  <div className="text-[13px] font-bold text-slate-700 group-hover:text-[#4F46E5] transition leading-tight mt-0.5">
                    절세포인트 미리 확인해보세요
                  </div>
                </div>
              </div>

              <div className="w-6 h-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                ➔
              </div>
            </div>
          </div>

          {/* 하단 고정 액션 바 */}
          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shadow-md">
            <button
              type="button"
              onClick={onGoBack}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => { onConfirmReport?.(); onGoHome?.(); }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center"
            >
              확인완료
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: 2026년 연말정산 절세 포인트 미리보기 ('forecast')                        */}
      {/* ========================================================================= */}
      {viewMode === 'forecast' && (
        <div className="flex-1 flex flex-col justify-between p-0 bg-[#F4F7FC] animate-in fade-in duration-200">
          {/* 상단 헤더: ← AI 연말정산 결과 리포트 + 첨부 홈화면 아이콘 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                scrollToTop();
                setViewMode('detail');
              }}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                AI 연말정산 결과 리포트
              </span>
            </button>

            {/* 첨부 이미지의 홈화면 아이콘 */}
            <HomeButton onClick={onGoHome} />
          </div>

          <div id="forecast-scroll-container" className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">
            {/* 상단 2026년 배너 */}
            <div className="bg-[#EEF2FF] border border-indigo-100/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div className="space-y-1 text-left">
                <p className="text-[17px] font-extrabold text-slate-900 leading-snug">
                  2026년 연말정산
                </p>
                <p className="text-[17px] font-extrabold text-slate-900 leading-snug">
                  <span className="text-[#4F46E5]">절세포인트</span>를 미리 분석해봤어요!
                </p>
              </div>

              {/* 2D 클립보드 아이콘 */}
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                <div className="w-10 h-11 bg-gradient-to-b from-[#60A5FA] to-[#2563EB] rounded-xl p-1 shadow-md border border-white flex flex-col justify-between">
                  <div className="w-4 h-1 bg-slate-200 rounded-full mx-auto" />
                  <div className="w-full h-7 bg-white rounded-lg p-1 space-y-1 flex flex-col justify-center">
                    <div className="w-full h-1 bg-slate-200 rounded-full" />
                    <div className="w-2/3 h-1 bg-indigo-400 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* 섹션 1: 내년 연말정산에 변동될 부양가족 공제에 대해 알려드려요. */}
            <div className="space-y-2.5 text-left">
              <h3 className="text-[15.5px] text-slate-700 leading-snug px-1 font-normal">
                내년 연말정산에<br />
                <span className="font-extrabold text-slate-900">변동될 부양가족 공제</span>에 대해 알려드려요.
              </h3>

              {/* 카드: 2026년에 부양가족공제 변동사항이 없어요. */}
              <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs flex flex-col items-center text-center space-y-3.5">
                <div className="text-[16.5px] text-slate-700 leading-snug font-normal">
                  2026년에 부양가족공제<br />
                  <span className="font-extrabold text-slate-900">변동사항이 없어요.</span>
                </div>

                {/* 2D 단순하고 간략한 가족 일러스트 */}
                <div className="w-52 h-44 flex items-center justify-center py-1">
                  <img
                    src="/assets/forecast_family_2d.jpg"
                    alt="2026년 부양가족 공제 변동없음 2D 일러스트"
                    className="max-h-40 max-w-full object-contain rounded-2xl"
                  />
                </div>

                <div className="inline-block px-3.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                  ✔ 작년과 동일해요
                </div>

                <div className="w-full p-3.5 bg-slate-50 rounded-2xl text-left text-xs text-slate-600 leading-relaxed space-y-1">
                  <p className="font-semibold text-slate-800">• 2026년 부양가족 공제 변동사항이 없어요.</p>
                  <p className="text-[11px] text-slate-500">본인 및 배우자 기본공제(각 150만원) 요건이 동일하게 유지됩니다.</p>
                </div>
              </div>
            </div>

            {/* 섹션 2: 내년 연말정산 절세 포인트 미리 알려드려요. */}
            <div className="space-y-2.5 text-left">
              <h3 className="text-[15.5px] font-extrabold text-slate-900 leading-snug px-1">
                내년 연말정산 절세 포인트<br />
                미리 알려드려요.
              </h3>

              {/* 슬라이드 0 (1/4): 자녀세액공제 확대 */}
              {forecastSlide === 0 && (
                <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-4 text-center animate-in fade-in duration-200">
                  <div className="inline-block px-3.5 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-[11.5px] font-bold border border-indigo-100">
                    자녀세액공제
                  </div>

                  <div className="text-[16.5px] font-extrabold text-slate-900 leading-snug">
                    2026년에 <span className="text-[#4F46E5]">자녀세액공제</span> 금액이<br />
                    확대될 예정이에요.
                  </div>

                  {/* 2D 자녀 일러스트 */}
                  <div className="w-52 h-44 flex items-center justify-center mx-auto">
                    <img
                      src="/assets/forecast_children_2d.jpg"
                      alt="자녀세액공제 확대 2D 일러스트"
                      className="max-h-40 max-w-full object-contain rounded-2xl"
                    />
                  </div>

                  {/* 맞춤형 절세포인트 박스 */}
                  <div className="w-full p-4 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl text-left space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600">
                      <span>⭐</span>
                      <span>맞춤형 절세포인트</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                      <p>• 2026년에는 자녀세액공제 금액이 15만원에서 25만원으로 확대될 예정이에요.</p>
                      <p>• 자녀세액공제는 부양가족공제에 해당하는 자녀, 손자녀·입양자 및 위탁아동으로서 만 8세~20세이하 나이 요건을 만족해야 해요.</p>
                    </div>
                  </div>

                  {/* 하단 페이지네이션 인디케이터 (1/4) */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-[#4F46E5] tracking-wider">1/4</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForecastSlide(3)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition cursor-pointer"
                      >
                        이전
                      </button>
                      <button
                        type="button"
                        onClick={() => setForecastSlide(1)}
                        className="px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white font-bold hover:bg-[#4338CA] transition cursor-pointer"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 슬라이드 1 (2/4): 결혼세액공제 */}
              {forecastSlide === 1 && (
                <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-4 text-center animate-in fade-in duration-200">
                  <div className="inline-block px-3.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[11.5px] font-bold border border-rose-100">
                    결혼세액공제
                  </div>

                  <div className="text-[16.5px] font-extrabold text-slate-900 leading-snug">
                    <span className="text-rose-600">결혼</span>해도 세액공제 받을 수 있어요!
                  </div>

                  {/* 2D 웨딩 일러스트 */}
                  <div className="w-52 h-44 flex items-center justify-center mx-auto">
                    <img
                      src="/assets/forecast_wedding_2d.jpg"
                      alt="결혼세액공제 2D 일러스트"
                      className="max-h-40 max-w-full object-contain rounded-2xl"
                    />
                  </div>

                  {/* 맞춤형 절세포인트 박스 */}
                  <div className="w-full p-4 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl text-left space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600">
                      <span>⭐</span>
                      <span>맞춤형 절세포인트</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                      <p>• 2026년에 결혼계획이 있다면 결혼세액공제 50만원을 받을 수 있어요.</p>
                      <p>• 결혼세액공제는 2026년까지 가능하니 결혼계획에 참고해주세요.</p>
                    </div>
                  </div>

                  {/* 하단 페이지네이션 인디케이터 (2/4) */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-[#4F46E5] tracking-wider">2/4</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForecastSlide(0)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition cursor-pointer"
                      >
                        이전
                      </button>
                      <button
                        type="button"
                        onClick={() => setForecastSlide(2)}
                        className="px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white font-bold hover:bg-[#4338CA] transition cursor-pointer"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 슬라이드 2 (3/4): 월세액 세액공제 */}
              {forecastSlide === 2 && (
                <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-4 text-center animate-in fade-in duration-200">
                  <div className="inline-block px-3.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11.5px] font-bold border border-indigo-100">
                    월세액 세액공제
                  </div>

                  <div className="text-[16.5px] font-extrabold text-slate-900 leading-snug">
                    <span className="text-[#4F46E5]">월세액 세액공제</span> 한도가<br />
                    확대돼요!
                  </div>

                  {/* 2D 월세 일러스트 */}
                  <div className="w-52 h-44 flex items-center justify-center mx-auto">
                    <img
                      src="/assets/forecast_rent_2d.jpg"
                      alt="월세액 세액공제 2D 일러스트"
                      className="max-h-40 max-w-full object-contain rounded-2xl"
                    />
                  </div>

                  {/* 맞춤형 절세포인트 박스 */}
                  <div className="w-full p-4 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl text-left space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600">
                      <span>⭐</span>
                      <span>맞춤형 절세포인트</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                      <p>• 월세액 세액공제 한도가 기존 750만원에서 1,000만원으로 대폭 확대될 예정이에요.</p>
                      <p>• 총급여 8,000만원 이하 무주택 세대주 근로자가 지출한 월세액의 15%~17%를 세액공제받을 수 있습니다.</p>
                    </div>
                  </div>

                  {/* 하단 페이지네이션 인디케이터 (3/4) */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-[#4F46E5] tracking-wider">3/4</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForecastSlide(1)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition cursor-pointer"
                      >
                        이전
                      </button>
                      <button
                        type="button"
                        onClick={() => setForecastSlide(3)}
                        className="px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white font-bold hover:bg-[#4338CA] transition cursor-pointer"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 슬라이드 3 (4/4): 주택청약종합저축 */}
              {forecastSlide === 3 && (
                <div className="w-full bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-4 text-center animate-in fade-in duration-200">
                  <div className="inline-block px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11.5px] font-bold border border-emerald-100">
                    주택청약공제
                  </div>

                  <div className="text-[16.5px] font-extrabold text-slate-900 leading-snug">
                    <span className="text-emerald-600">주택청약</span> 납입 한도가<br />
                    늘어났어요!
                  </div>

                  {/* 2D 청약 일러스트 */}
                  <div className="w-52 h-44 flex items-center justify-center mx-auto">
                    <img
                      src="/assets/forecast_housing_2d.jpg"
                      alt="주택청약 2D 일러스트"
                      className="max-h-40 max-w-full object-contain rounded-2xl"
                    />
                  </div>

                  {/* 맞춤형 절세포인트 박스 */}
                  <div className="w-full p-4 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl text-left space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600">
                      <span>⭐</span>
                      <span>맞춤형 절세포인트</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                      <p>• 청약통장 월 납입 인정 한도가 10만원에서 25만원으로 대폭 상향되었어요.</p>
                      <p>• 연간 납입한도 300만원의 40%인 최대 120만원까지 소득공제 혜택을 온전히 누려보세요.</p>
                    </div>
                  </div>

                  {/* 하단 페이지네이션 인디케이터 (4/4) */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-[#4F46E5] tracking-wider">4/4</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForecastSlide(2)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition cursor-pointer"
                      >
                        이전
                      </button>
                      <button
                        type="button"
                        onClick={() => setForecastSlide(0)}
                        className="px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white font-bold hover:bg-[#4338CA] transition cursor-pointer"
                      >
                        처음으로
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shadow-md">
            <button
              type="button"
              onClick={() => {
                scrollToTop();
                setViewMode('detail');
              }}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              결과 리포트로 돌아가기
            </button>
            <button
              type="button"
              onClick={() => { onConfirmReport?.(); onGoHome?.(); }}
              className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center"
            >
              확인완료
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: 예상세액 상세결과 3단 탭 모달 (인적공제/소득공제/세액감면·공제)           */}
      {/* ========================================================================= */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 animate-in fade-in duration-150">
          <div className="w-full sm:max-w-[440px] h-[92vh] sm:h-[84vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom-4">
            {/* 모달 상단 헤더: ✕ 예상세액 상세결과 */}
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="p-1 -ml-1 text-slate-700 hover:text-slate-900 transition cursor-pointer text-lg font-light"
                  title="닫기"
                >
                  ✕
                </button>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  예상세액 상세결과 명세
                </h2>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                AI 분석 원천데이터
              </span>
            </div>

            {/* 3단 탭바: [인적공제] [소득공제] [세액감면/공제] */}
            <div className="w-full bg-white border-b border-slate-200 flex items-center text-xs font-bold select-none">
              <button
                type="button"
                onClick={() => setDetailTab('human')}
                className={`flex-1 py-3 text-center transition cursor-pointer relative ${
                  detailTab === 'human'
                    ? 'text-[#4F46E5] font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                인적공제
                {detailTab === 'human' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('income')}
                className={`flex-1 py-3 text-center transition cursor-pointer relative ${
                  detailTab === 'income'
                    ? 'text-[#4F46E5] font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                소득공제
                {detailTab === 'income' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('credit')}
                className={`flex-1 py-3 text-center transition cursor-pointer relative ${
                  detailTab === 'credit'
                    ? 'text-[#4F46E5] font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                세액감면/공제
                {detailTab === 'credit' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4F46E5]" />
                )}
              </button>
            </div>

            {/* 탭 콘텐츠 스크롤 영역 */}
            <div className="flex-1 px-5 py-5 overflow-y-auto space-y-4 bg-[#F8FAFC]">
              {/* TAB 1: 인적공제 */}
              {detailTab === 'human' && (
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                      기본공제 (1명당 150만 원)
                    </h4>
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>본인</span>
                        {renderDetailAmount(effectiveTaxData?.humanDeductions?.self)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>배우자</span>
                        {renderDetailAmount(effectiveTaxData?.humanDeductions?.spouse)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>부양가족</span>
                        {renderDetailAmount(effectiveTaxData?.humanDeductions?.dependents)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                      추가공제
                    </h4>
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>추가공제 (경로우대/장애인/한부모)</span>
                        {renderDetailAmount(effectiveTaxData?.humanDeductions?.additional)}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: 소득공제 */}
              {detailTab === 'income' && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                    특별소득공제 및 기타
                  </h4>
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>국민연금보험료</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.nationalPension)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>건강보험료</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.healthInsurance)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>고용보험료</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.employmentInsurance)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>주택자금 (차입금 상환액)</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.housingLoan)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>주택마련저축 (청약 등)</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.housingSavings)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>개인연금저축</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.personalPension)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>신용카드 등 사용금액</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.creditCard)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>소기업·소상공인 공제부금</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.smallBiz)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>장기집합투자증권 저축</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.longInvest)}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>벤처투자조합 출자 등</span>
                      {renderDetailAmount(effectiveTaxData?.incomeDeductions?.ventureFund)}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: 세액감면/공제 */}
              {detailTab === 'credit' && (
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                      세액공제 (합계 {taxCreditTotal.toLocaleString()}원)
                    </h4>
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>근로소득세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.earnedIncomeCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>보장성보험료 세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.insuranceCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>의료비 세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.medicalCredit ?? effectiveTaxData?.medicalDetails?.totalCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>기부금 세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.donationCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>교육비 세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.educationCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>연금계좌 세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.pensionCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>혼인세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.marriageCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>자녀세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.childCredit)}
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>월세액공제</span>
                        {renderDetailAmount(effectiveTaxData?.taxCredits?.rentCredit)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 모달 하단 닫기 버튼 */}
            <div className="p-4 bg-white border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="w-full py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

