import React, { useState } from 'react';
import ProgressBar from '../ProgressBar';
import UploadZone from '../UploadZone';
import OCRTable from '../OCRTable';
import ChecklistCard from '../ChecklistCard';
import RefundCard from '../RefundCard';
import AuditTimeline from '../AuditTimeline';
import CitationBox from '../CitationBox';

const STEPS = [
  { id: 1, title: '안내문 & AI 진단' },
  { id: 2, title: '부양가족 인적공제' },
  { id: 3, title: '소득 및 중도이직' },
  { id: 4, title: '간소화자료 등록' },
  { id: 5, title: 'AI 자가진단' },
  { id: 6, title: '예상세액 산출' },
  { id: 7, title: '종합 리포트' },
];

export default function TaxWizardModal({ initialStep = 1, onClose }) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#F8F9FA] rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-[#EBECEF]">
        {/* 상단 모달 헤더 (GoDash 다크 스타일) */}
        <div className="bg-[#111111] text-white px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DCEB9F]" />
            <h3 className="font-extrabold text-sm tracking-tight text-white">
              AI 셀프 연말정산 시뮬레이터 (SelfTax 2025)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* 진행률 바 & 스텝 탭 */}
        <div className="bg-white px-6 pt-3 pb-2 border-b border-[#EBECEF]">
          <ProgressBar currentStep={currentStep} totalSteps={STEPS.length} />
          <div className="flex justify-between mt-2 overflow-x-auto no-scrollbar text-[11px] text-[#666666] pb-1 gap-2">
            {STEPS.map((step) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`whitespace-nowrap px-2 py-1 rounded-lg transition ${
                  step.id === currentStep
                    ? 'font-bold bg-[#DCEB9F] text-black'
                    : 'hover:text-black hover:bg-[#F8F9FA]'
                }`}
              >
                {step.id}. {step.title}
              </button>
            ))}
          </div>
        </div>

        {/* 메인 컨텐츠 영역 (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: 안내문 */}
          {currentStep === 1 && (
            <div className="space-y-4 text-center py-4">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-[#DCEB9F] items-center justify-center text-2xl shadow-sm">
                📋
              </div>
              <h4 className="text-xl font-extrabold text-[#111111]">
                2025 귀속 연말정산 AI 맞춤 진단
              </h4>
              <p className="text-sm text-[#666666] leading-relaxed max-w-md mx-auto">
                국세청 홈택스 간소화 PDF를 등록하시면, 결정론적 Pure Python 세법 엔진이
                수식을 100% 검증하여 예상 환급액을 정확하게 도출합니다.
              </p>
              <div className="bg-white p-4 rounded-2xl border border-[#EBECEF] text-left text-xs space-y-2 text-[#444444]">
                <div className="font-bold text-[#111111] flex items-center gap-1.5">
                  <span className="text-[#DCEB9F] bg-black px-1.5 py-0.5 rounded text-[10px]">보안 규격</span>
                  주민등록번호 뒷자리 전면 마스킹
                </div>
                <div>• 주민등록번호 뒷자리는 업로드 즉시 마스킹(900101-1******) 처리되어 저장되지 않습니다.</div>
                <div>• Tax Engine 연산은 LLM의 환각 없이 정확한 세법 공식으로만 동작합니다.</div>
              </div>
            </div>
          )}

          {/* Step 2: 부양가족 */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-bold text-[#111111]">부양가족 인적공제 검토</h4>
                <p className="text-xs text-[#666666]">기본공제 대상(1인당 150만 원) 및 추가공제 요건을 확인합니다.</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-[#EBECEF] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold bg-[#DCEB9F] text-black px-2 py-0.5 rounded-full">본인</span>
                  <div className="font-bold text-sm text-[#111111] mt-1">김민수 (900101-1******)</div>
                  <div className="text-xs text-[#888888]">기본공제 대상 (150만 원)</div>
                </div>
                <button className="text-xs font-semibold text-[#111111] underline">수정</button>
              </div>
              <button className="w-full py-3.5 border-2 border-dashed border-[#CCD0D9] rounded-2xl text-xs font-bold text-[#666666] hover:border-black hover:text-black transition">
                + 부양가족 추가 등록 (등본 / 가족관계증명서)
              </button>
            </div>
          )}

          {/* Step 3: 소득 및 중도이직 */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-bold text-[#111111]">근로소득원천징수영수증 & 중도이직 합산</h4>
                <p className="text-xs text-[#666666]">2025년 중 이직한 경우 종전 근무지의 원천징수영수증을 함께 업로드하세요.</p>
              </div>
              <UploadZone />
            </div>
          )}

          {/* Step 4: 간소화 PDF 등록 */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-bold text-[#111111]">간소화 PDF 등록 & 수기 영수증</h4>
                <p className="text-xs text-[#666666]">홈택스 연말정산 간소화 PDF를 등록하시면 항목별 금액이 자동 분류됩니다.</p>
              </div>
              <UploadZone />
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
              <div>
                <h4 className="text-lg font-bold text-[#111111]">AI 누락 방지 & 과다공제 자가진단</h4>
                <p className="text-xs text-[#666666]">놓치기 쉬운 공제 항목을 확인하고 실손보험금 등 과다공제를 차단합니다.</p>
              </div>
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
              <div>
                <h4 className="text-lg font-bold text-[#111111]">실시간 예상 환급액 산출</h4>
                <p className="text-xs text-[#666666]">결정론적 Pure Python 세법 엔진(Tax Engine) 연산 결과입니다.</p>
              </div>
              <RefundCard refundAmount={442500} finalTax={1411500} prepaidTax={1854000} />
              <AuditTimeline
                steps={[
                  { step: '총급여액', amount: 52000000, description: '근로소득원천징수영수증 기반 총급여액' },
                  { step: '근로소득공제', amount: 12350000, description: '총급여 4,500만~1억 구간 산식 적용' },
                  { step: '근로소득금액', amount: 39650000, description: '총급여액 - 근로소득공제' },
                  { step: '인적공제', amount: 1500000, description: '기본공제 본인 1인 (150만 원)' },
                  { step: '과세표준', amount: 28400000, description: '근로소득금액 - 소득공제 합계' },
                  { step: '산출세액', amount: 3420000, description: '2025 기본세율 구간(15%) 적용' },
                  { step: '세액공제', amount: 2008500, description: '근로소득세액공제 + 보장성보험 + 의료비 + 교육비' },
                  { step: '결정세액', amount: 1411500, description: '산출세액 - 세액공제' },
                  { step: '예상 환급액', amount: 442500, description: '기납부세액(1,854,000원) - 결정세액(1,411,500원)' }
                ]}
              />
            </div>
          )}

          {/* Step 7: 종합 리포트 */}
          {currentStep === 7 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-bold text-[#111111]">AI 종합 분석 리포트 & 절세 팁</h4>
                <p className="text-xs text-[#666666]">공제 미충족 사유 및 2026년 차년도 최적 절세 전략입니다.</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-[#EBECEF] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💡</span>
                  <h5 className="font-extrabold text-xs text-[#111111]">체크카드 소비 비중 확대 제안</h5>
                </div>
                <p className="text-xs text-[#666666] leading-relaxed">
                  총급여의 25% 초과 지출분부터 체크카드 및 현금영수증(30%)은 신용카드(15%) 대비 2배의 높은 공제율이 적용됩니다.
                  차년도에는 체크카드 사용을 늘려 약 25만 원의 추가 환급을 기대할 수 있습니다.
                </p>
              </div>
              <button className="w-full py-3.5 rounded-2xl bg-black text-white font-bold text-xs hover:bg-neutral-800 transition shadow-sm">
                📄 연말정산 시뮬레이션 결과지 (PDF 다운로드)
              </button>
            </div>
          )}
        </div>

        {/* 하단 모달 네비게이션 버튼 */}
        <div className="bg-white px-6 py-4 border-t border-[#EBECEF] flex justify-between items-center">
          {currentStep > 1 ? (
            <button
              onClick={prevStep}
              className="px-4 py-2.5 rounded-xl border border-[#CCD0D9] text-xs font-bold text-[#666666] hover:bg-[#F8F9FA] transition"
            >
              이전 단계
            </button>
          ) : (
            <div />
          )}

          {currentStep < STEPS.length ? (
            <button
              onClick={nextStep}
              className="px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-neutral-800 transition"
            >
              다음 단계 ➔
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-[#DCEB9F] text-black text-xs font-black hover:bg-[#CDDC8E] transition"
            >
              완료 및 닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
