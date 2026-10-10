import React, { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import TaxStepProgressBar from '../components/TaxStepProgressBar';
import HomeButton from '../components/HomeButton';
import UserAuthStatus from '../components/UserAuthStatus';
import { calculateSettlementTax } from '../utils/taxCalculator';
import { getSecureItem } from '../utils/secureStorage';

/**
 * [Step 5] 연말정산 예상세액 조회 및 상세결과 화면
 * 
 * 사용자 요구사항:
 * 1. '박미미'는 로그인한 근로자로 변경
 * 2. 원천징수자료, 종전근무지 PDF자료와 공제자료 입력의 공제자료를 기반으로 계산한 예상세액 요약 화면에 금액을 표기 -> 돌려받을 금액에 표기
 * 3. 상단의 이미지의 글자도 결과에 따라 자동변경
 * 4. 상세내역 확인을 클릭했을 때 결과리포트 이동화면에서 '박미미'로 표기된 부분도 로그인한 근로자로 변경
 */
export default function TaxResultPage({
  onGoHome,
  onPrev,
  onGoAiReport,
  onNavigateStep,
  userName,
  taxYear = '2025',
  userProfile,
  onSignOut,
  onLogin,
  sessionId,
}) {
  const { profile, user } = useAuth();

  // 로그인한 근로자 성명 (Google 접미사 제거 및 fallback)
  const loggedInWorkerName = (profile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || '')
    .replace(/\s*\(Google\)/g, '')
    .trim();

  const effectiveUserName = (userName && userName !== '박미미') ? userName : (loggedInWorkerName || '근로자');

  // 원천징수자료, 종전근무지, 간소화 PDF, 공제자료, 부양가족을 기반으로 예상세액 실시간 계산
  const taxResult = useMemo(() => {
    let withholdingData = null;
    let previousJobs = [];
    let deductionData = null;
    let hometaxData = null;
    let familyList = [];

    try {
      withholdingData = getSecureItem('selftax_withholding_data');
      previousJobs = getSecureItem('selftax_previous_jobs', []);
      deductionData = getSecureItem('selftax_deduction_data');
      hometaxData = getSecureItem('hometax_extracted_data');
      familyList = getSecureItem('selftax_family_list', []);
    } catch (e) {
      console.error('Error loading tax calculation source data', e);
    }

    try {
      const primarySalary = Number(
        withholdingData?.totalSalary ??
        withholdingData?.gross_salary ??
        withholdingData?.salary ??
        0
      );
      const prevSalaryTotal = Array.isArray(previousJobs)
        ? previousJobs.reduce((sum, job) => sum + (Number(job?.salary) || 0), 0)
        : 0;

      const effectiveFamilyList = Array.isArray(familyList) ? familyList : [];
      const effectiveDeductionData = (deductionData && typeof deductionData === 'object') ? deductionData : {};

      const result = calculateSettlementTax({
        userName: effectiveUserName,
        taxYear,
        withholdingData: withholdingData ? {
          ...withholdingData,
          totalSalary: primarySalary,
        } : null,
        previousJobs: Array.isArray(previousJobs) ? previousJobs : [],
        deductionData: effectiveDeductionData,
        hometaxData: (hometaxData && typeof hometaxData === 'object') ? hometaxData : null,
        familyList: effectiveFamilyList,
      });

      return result || {};
    } catch (err) {
      console.error('Tax calculation error in TaxResultPage:', err);
      return {
        diffTotal: 0,
        isRefund: true,
        totalSalary: 0,
        earnedIncome: 0,
        taxBase: 0,
        calculatedTax: 0,
        finalIncomeTax: 0,
        finalLocalTax: 0,
        paidTaxTotal: 0,
        paidIncomeTax: 0,
        paidLocalTax: 0,
        diffIncomeTax: 0,
        diffLocalTax: 0,
      };
    }
  }, [effectiveUserName, taxYear]);

  return (
    <div className="w-full min-h-screen bg-white flex flex-col justify-between font-sans select-none animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. 상단 헤더: ← 연말정산 예상세액 조회 + 홈버튼                             */}
      {/* ========================================================================= */}
      <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
        <button
          type="button"
          onClick={onPrev || onGoHome}
          className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer min-w-0"
          title="뒤로가기"
        >
          <span className="shrink-0 flex items-center justify-center">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
            연말정산 예상세액 조회
          </h1>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <UserAuthStatus
            userProfile={userProfile}
            onSignOut={onSignOut}
            onLogin={onLogin}
          />
          <HomeButton onClick={onGoHome} />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 상단 5단계 프로세스 바 (5. 예상세액 활성화)                                  */}
      {/* ========================================================================= */}
      <TaxStepProgressBar currentStep={5} onSelectStep={onNavigateStep} />

      {/* ========================================================================= */}
      {/* 3. 메인 콘텐츠 스크롤 영역                                                  */}
      {/* ========================================================================= */}
      <div className="flex-1 px-5 py-5 overflow-y-auto space-y-5 bg-[#F8FAFC]">
        {/* 상단 타이틀 안내 */}
        <div className="text-center space-y-1 pt-1">
          <h2 className="text-[19px] font-black text-slate-900 leading-snug tracking-tight">
            {effectiveUserName}님의 {taxYear}년<br />
            연말정산 예상세액 결과입니다.
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            {taxResult.diffTotal === 0
              ? '등록된 신고 자료가 없어 예상세액이 0원으로 계산되었어요.'
              : taxResult.isRefund
              ? '차감납부(환급)세액에 음수(-) 표기가 있으면 환급이에요!'
              : '차감납부(환급)세액에 양수(+) 표기가 있으면 추가 납부예요.'}
          </p>
        </div>

        {/* 중앙 그래픽: 스마일 캘린더 + 계산기 일러스트 (결과에 따라 계산기 화면 글자 및 표정 자동 변경) */}
        <div className="py-1 flex items-center justify-center">
          <div className="relative w-44 h-36 flex items-center justify-center">
            {/* 달력 본체 */}
            <div className="w-34 h-34 bg-gradient-to-b from-indigo-50/50 via-white to-purple-50/40 rounded-2xl p-2.5 shadow-md border border-slate-200/80 flex flex-col justify-between relative transform -rotate-2">
              {/* 상단 바인더 링 */}
              <div className="flex items-center justify-around -mt-4 px-3">
                <div className="w-2 h-4 rounded-full bg-slate-400 border border-slate-300 shadow-2xs" />
                <div className="w-2 h-4 rounded-full bg-slate-400 border border-slate-300 shadow-2xs" />
                <div className="w-2 h-4 rounded-full bg-slate-400 border border-slate-300 shadow-2xs" />
              </div>

              {/* 달력 날짜 그리드 */}
              <div className="grid grid-cols-4 gap-1.5 pt-2.5 px-1">
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
                <div className="h-2 rounded bg-sky-200/80" />
              </div>

              {/* 스마일 이모지 (환급이면 활짝 웃는 표정, 추가납부면 긴장한 표정) */}
              <div className="w-11 h-11 rounded-full bg-gradient-to-b from-amber-300 to-amber-400 mx-auto mb-1 flex flex-col items-center justify-center shadow-md relative border border-amber-200">
                {/* 눈 */}
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                </div>
                {taxResult.isRefund ? (
                  /* 활짝 웃는 입 */
                  <div className="w-3.5 h-2 border-b-2 border-slate-800 rounded-b-full" />
                ) : (
                  /* 일자 입 */
                  <div className="w-3 h-0.5 bg-slate-800 rounded-full mt-0.5" />
                )}
              </div>
            </div>

            {/* 계산기 일러스트 (상단 이미지의 글자: 결과에 따라 자동변경) */}
            <div className="absolute -bottom-1 right-2 w-18 h-20 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-2 shadow-lg border border-white transform rotate-3 flex flex-col justify-between">
              {/* 계산기 화면 (환급: 초록색 / 추가납부: 로즈레드) */}
              <div className="w-full h-4 rounded bg-indigo-950/80 p-0.5 flex items-center justify-end px-1">
                <span
                  className={`text-[8.5px] font-mono font-bold truncate ${
                    (Number(taxResult?.diffTotal) || 0) === 0
                      ? 'text-indigo-200'
                      : taxResult?.isRefund
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {(Number(taxResult?.diffTotal) || 0) === 0
                    ? '0'
                    : (taxResult?.isRefund ? '' : '+') + Math.abs(Number(taxResult?.diffTotal) || 0).toLocaleString()}
                </span>
              </div>
              {/* 계산기 키패드 */}
              <div className="grid grid-cols-3 gap-1 pt-0.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-2 rounded bg-indigo-300/40" />
                ))}
                <div className="col-span-3 h-2.5 rounded bg-amber-400 flex items-center justify-center text-[8px] font-black text-indigo-950">
                  =
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 결과 카드: 로그인한 근로자 및 돌려받을(환급) 금액 표기 */}
        <div className="w-full space-y-2">
          <div className="w-full bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-1.5">
            <div className="text-[15px] sm:text-[16.5px] font-bold text-slate-800 leading-snug">
              <span className="text-slate-900 font-extrabold">{effectiveUserName}님!</span>{' '}
              {(Number(taxResult?.diffTotal) || 0) === 0
                ? '예상 정산 세액은 0원이에요.'
                : taxResult?.isRefund
                ? '이만큼 돌려 받으실걸로 예상돼요.'
                : '이만큼 추가로 납부하셔야 해요.'}
            </div>
            <div className="text-right pt-1">
              <span
                className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                  (Number(taxResult?.diffTotal) || 0) === 0
                    ? 'text-slate-800'
                    : taxResult?.isRefund
                    ? 'text-[#16A34A]'
                    : 'text-[#DC2626]'
                }`}
              >
                {(Number(taxResult?.diffTotal) || 0) === 0
                  ? '0'
                  : (taxResult?.isRefund ? '' : '+') + Math.abs(Number(taxResult?.diffTotal) || 0).toLocaleString()}
              </span>
              <span
                className={`text-base font-bold ml-1 ${
                  (Number(taxResult?.diffTotal) || 0) === 0
                    ? 'text-slate-800'
                    : taxResult?.isRefund
                    ? 'text-[#16A34A]'
                    : 'text-[#DC2626]'
                }`}
              >
                원
              </span>
            </div>
          </div>

          {/* 하단 유의사항 텍스트 */}
          <p className="text-[11px] text-slate-400 text-center leading-relaxed px-2 font-normal">
            예상세액은 근로자 본인이 직접 입력한 내용으로 나온 결과이므로<br className="hidden sm:inline" /> 연말정산 실제 결과는 다를 수 있습니다.
          </p>
        </div>

        {/* 예상세액 요약 섹션 (원천징수, 종전근무지, 공제자료 실시간 기반 계산) */}
        <div className="w-full space-y-2 pt-1">
          <h3 className="text-xs font-bold text-slate-800 tracking-tight">
            예상세액 요약
          </h3>

          <div className="w-full bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3.5 text-xs">
            {/* 1. 총 급여 블록 */}
            <div className="space-y-2 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between font-bold text-slate-900 text-[13px]">
                <span>총 급여</span>
                <span className="font-mono">{(Number(taxResult?.totalSalary) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>근로소득금액</span>
                <span className="font-mono font-medium">{(Number(taxResult?.earnedIncome) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>과세표준</span>
                <span className="font-mono font-medium">{(Number(taxResult?.taxBase) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>산출세액</span>
                <span className="font-mono font-medium">{(Number(taxResult?.calculatedTax) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>결정세액 (소득세)</span>
                <span className="font-mono font-medium">{(Number(taxResult?.finalIncomeTax) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>결정세액 (지방소득세)</span>
                <span className="font-mono font-medium">{(Number(taxResult?.finalLocalTax) || 0).toLocaleString()}원</span>
              </div>
            </div>

            {/* 2. 기납부세액 블록 */}
            <div className="space-y-2 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between font-bold text-slate-900 text-[12.5px]">
                <span>기납부세액</span>
                <span className="font-mono text-slate-800">{(Number(taxResult?.paidTaxTotal) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>소득세</span>
                <span className="font-mono font-medium">{(Number(taxResult?.paidIncomeTax) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>지방소득세</span>
                <span className="font-mono font-medium">{(Number(taxResult?.paidLocalTax) || 0).toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>농어촌 특별세</span>
                <span className="font-mono font-medium">0원</span>
              </div>
            </div>

            {/* 3. 차감납부 (환급)세액 블록 */}
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center justify-between font-bold text-slate-900 text-[12.5px]">
                <span>차감납부 (환급)세액</span>
                <span
                  className={`font-mono font-extrabold text-sm ${
                    taxResult.diffTotal === 0
                      ? 'text-slate-800'
                      : taxResult.isRefund
                      ? 'text-[#16A34A]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  {(Number(taxResult?.diffTotal) || 0) === 0
                    ? '0원'
                    : taxResult?.isRefund
                    ? `(-)${Math.abs(Number(taxResult?.diffTotal) || 0).toLocaleString()}원`
                    : `(+)${(Number(taxResult?.diffTotal) || 0).toLocaleString()}원`}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>소득세</span>
                <span className="font-mono font-medium">
                  {(Number(taxResult?.diffIncomeTax) || 0) === 0
                    ? '0원'
                    : (Number(taxResult?.diffIncomeTax) || 0) < 0
                    ? `(-)${Math.abs(Number(taxResult?.diffIncomeTax) || 0).toLocaleString()}원`
                    : `(+)${(Number(taxResult?.diffIncomeTax) || 0).toLocaleString()}원`}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>지방소득세</span>
                <span className="font-mono font-medium">
                  {(Number(taxResult?.diffLocalTax) || 0) === 0
                    ? '0원'
                    : (Number(taxResult?.diffLocalTax) || 0) < 0
                    ? `(-)${Math.abs(Number(taxResult?.diffLocalTax) || 0).toLocaleString()}원`
                    : `(+)${(Number(taxResult?.diffLocalTax) || 0).toLocaleString()}원`}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 pl-1 text-[11.5px]">
                <span>농어촌 특별세</span>
                <span className="font-mono font-medium">0원</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. 하단 고정 액션 바: [이전] [상세내역 확인]                                  */}
      {/* ========================================================================= */}
      <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => {
            if (onGoAiReport) {
              onGoAiReport(taxResult);
            }
          }}
          className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center flex items-center justify-center gap-1.5"
        >
          <span>상세내역 확인</span>
          <span className="text-[11px] text-indigo-200">›</span>
        </button>
      </div>
    </div>
  );
}
