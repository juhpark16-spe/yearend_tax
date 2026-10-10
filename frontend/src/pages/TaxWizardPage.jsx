import React, { useState } from 'react';
import SubPageHeader from '../components/SubPageHeader';
import ProgressBar from '../components/ProgressBar';
import UploadZone from '../components/UploadZone';
import OCRTable from '../components/OCRTable';
import ChecklistCard from '../components/ChecklistCard';
import RefundCard from '../components/RefundCard';
import AuditTimeline from '../components/AuditTimeline';
import CitationBox from '../components/CitationBox';

const STEPS = [
  { id: 1, title: '안내문 & AI 진단' },
  { id: 2, title: '부양가족 인적공제' },
  { id: 3, title: '소득 및 종전근무지' },
  { id: 4, title: '간소화자료 등록' },
  { id: 5, title: 'AI 자가진단' },
  { id: 6, title: '예상세액 산출' },
  { id: 7, title: '종합 리포트' },
];

/**
 * 2025년 연말정산 전체 단계 순차 진행 화면 (위자드)
 * 팝업이 아닌 완전한 전체 화면(페이지)으로 동작하며, 왼쪽 위에 홈화면 표기
 */
export default function TaxWizardPage({ initialStep = 1, onGoHome }) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  return (
    <div className="w-full min-h-screen bg-[#F0F4FA] flex flex-col justify-between">
      {/* 1. 상단 헤더: 왼쪽 위에 홈화면 표기 */}
      <SubPageHeader
        title={`연말정산 자료입력 (${currentStep}/${STEPS.length})`}
        stepText={`Step ${currentStep}`}
        onGoHome={onGoHome}
      />

      {/* 진행률 바 & 스텝 탭 */}
      <div className="bg-white px-5 pt-3 pb-2 border-b border-slate-200">
        <ProgressBar currentStep={currentStep} totalSteps={STEPS.length} />
        <div className="flex justify-between mt-2 overflow-x-auto no-scrollbar text-[11px] text-slate-500 pb-1 gap-1">
          {STEPS.map((step) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id)}
              className={`whitespace-nowrap px-2 py-1 rounded-lg transition font-medium ${
                step.id === currentStep
                  ? 'font-bold bg-blue-600 text-white'
                  : 'hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {step.id}. {step.title}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        {/* Step 1: 안내문 */}
        {currentStep === 1 && (
          <div className="space-y-4 text-center py-4">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 items-center justify-center text-2xl shadow-xs">
              📋
            </div>
            <h3 className="text-xl font-black text-slate-900">
              2025 귀속 연말정산 AI 맞춤 진단
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              홈택스에서 다운로드한 PDF만 등록하시면, 결정론적 Pure Python 세법 엔진이
              수식을 100% 검증하여 예상 환급액을 정확하게 도출합니다.
            </p>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 text-left text-xs space-y-2 text-slate-700 shadow-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="text-white bg-blue-600 px-1.5 py-0.5 rounded text-[10px]">보안 규격</span>
                주민등록번호 뒷자리 전면 마스킹
              </div>
              <div>• 주민등록번호 뒷자리는 업로드 즉시 마스킹(900101-1******) 처리되어 저장되지 않습니다.</div>
              <div>• 세액 계산은 LLM의 환각 없이 결정론적 순수 파이썬 공식으로만 수행됩니다.</div>
            </div>
          </div>
        )}

        {/* Step 2: 부양가족 */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <h4 className="text-sm font-bold text-slate-900 mb-1">기본공제 대상자 확인</h4>
              <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center mt-2">
                <div>
                  <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">본인</span>
                  <div className="font-bold text-xs text-slate-800 mt-1">김민수 (900101-1******)</div>
                  <div className="text-[11px] text-slate-500">기본공제 (150만 원)</div>
                </div>
                <span className="text-xs text-emerald-600 font-bold">적격</span>
              </div>
            </div>
            <button className="w-full py-3.5 border-2 border-dashed border-blue-300 rounded-2xl text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 transition">
              + 부양가족 추가 등록 (등본 첨부)
            </button>
          </div>
        )}

        {/* Step 3: 소득 및 종전근무지 */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900">근로소득원천징수영수증 등록</h4>
            <UploadZone onFilesSelected={() => alert('영수증이 등록되었습니다.')} />
          </div>
        )}

        {/* Step 4: 간소화자료 등록 */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900">국세청 간소화 PDF 등록</h4>
            <UploadZone onFilesSelected={() => alert('간소화 PDF가 등록되었습니다.')} />
            <OCRTable
              items={[
                { category: '신용카드', description: '일반 신용카드 사용액', amount: 14200000 },
                { category: '의료비', description: '병원 및 약국 본인부담금', amount: 2800000 },
                { category: '보험료', description: '보장성 보험료 납입액', amount: 1000000 },
              ]}
            />
          </div>
        )}

        {/* Step 5: AI 자가진단 */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900">AI 누락 방지 & 과다공제 체크</h4>
            <ChecklistCard
              question={{
                category: '월세액 세액공제',
                question: '2025년도 중 무주택 근로자로서 월세를 직접 지급하셨나요?',
                description: '총급여 8,000만 원 이하 무주택 세대주인 경우 최대 17% 세액공제를 받을 수 있습니다.'
              }}
            />
            <CitationBox
              title="2025년 귀속 연말정산 주택자금·월세액 공제의 이해"
              sourcePage={12}
              content="월세액 세액공제는 총급여 8천만 원 이하 무주택 세대주가 국민주택규모 또는 기준시가 4억 원 이하 주택에 지출한 월세액의 15%(5,500만 원 이하는 17%)를 공제합니다."
            />
          </div>
        )}

        {/* Step 6: 예상세액 산출 */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900">실시간 예상세액 산출 결과</h4>
            <RefundCard refundAmount={442500} finalTax={1411500} prepaidTax={1854000} />
            <AuditTimeline
              steps={[
                { step: '총급여액', amount: 52000000, description: '근로소득원천징수영수증 기반 총급여액' },
                { step: '근로소득공제', amount: 12350000, description: '총급여 4,500만~1억 구간 산식 적용' },
                { step: '근로소득금액', amount: 39650000, description: '총급여액 - 근로소득공제' },
                { step: '과세표준', amount: 28400000, description: '근로소득금액 - 소득공제 합계' },
                { step: '결정세액', amount: 1411500, description: '산출세액 - 세액공제' },
                { step: '예상 환급액', amount: 442500, description: '기납부세액 - 결정세액' },
              ]}
            />
          </div>
        )}

        {/* Step 7: 종합 리포트 */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900">AI 종합 분석 리포트</h4>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-lg">💡</span>
                <h5 className="font-extrabold text-xs text-slate-900">체크카드 소비 비중 확대 제안</h5>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                총급여의 25% 초과 지출분부터 체크카드 및 현금영수증(30%)은 신용카드(15%) 대비 2배의 높은 공제율이 적용됩니다.
              </p>
            </div>
            <button
              onClick={() => alert('연말정산 결과지 PDF가 다운로드됩니다.')}
              className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition shadow-xs"
            >
              📄 결과지 PDF 다운로드
            </button>
          </div>
        )}
      </div>

      {/* 3. 하단 네비게이션 액션 바 */}
      <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        {currentStep > 1 ? (
          <button
            onClick={prevStep}
            className="py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
          >
            이전 단계
          </button>
        ) : (
          <button
            onClick={onGoHome}
            className="py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
          >
            홈으로 이동
          </button>
        )}

        {currentStep < STEPS.length ? (
          <button
            onClick={nextStep}
            className="flex-1 py-3 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition shadow-xs"
          >
            다음 단계 ➔
          </button>
        ) : (
          <button
            onClick={onGoHome}
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shadow-xs"
          >
            정산 완료 (홈으로 이동)
          </button>
        )}
      </div>
    </div>
  );
}
