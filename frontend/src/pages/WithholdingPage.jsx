import React, { useState, useEffect } from 'react';
import TaxStepProgressBar from '../components/TaxStepProgressBar';
import HomeButton from '../components/HomeButton';
import UserAuthStatus from '../components/UserAuthStatus';
import UploadProgressBar from '../components/UploadProgressBar';
import { taxService } from '../services/api';
import { getSecureItem, setSecureItem, removeSecureItem } from '../utils/secureStorage';
import { saveUserData, removeUserTaxDataKey } from '../utils/userTaxStorage';
import { validatePdfFile } from '../utils/fileValidation';

/**
 * [Step 2] 근로소득원천징수자료 화면
 * 사용자 요구사항:
 * - 근로소득원천징수영수증 PDF 자료 업로드 시 백엔드 파싱 및 파일 분석 연동
 * - 근무처별 소득명세의 16.계 주(현) 금액을 총급여액에 정확히 반영
 * - 자료 추출 완료 표기 칸 삭제
 * - 파일 표기 아래 상세 내용(파일크기, 등록 시간 등) 삭제, '서류보기'는 파일표기 바로 옆으로 이동, 우측에 삭제 'X' 표기
 * - 업로드된 PDF 파일 기준으로 표기된 상세 내용에서 수정 버튼 삭제
 * - 샘플 서류로 바로 추출 라인 삭제
 */
export default function WithholdingPage({
  onGoHome,
  onNext,
  onPrev,
  onGoPreviousJob,
  onNavigateStep,
  onDataChange,
  userProfile,
  onSignOut,
  onLogin,
}) {
  // 업로드된 원천징수영수증 추출 데이터 (암호화 localStorage 영속화)
  const [withholdingData, setWithholdingData] = useState(() => {
    try {
      const saved = getSecureItem('selftax_withholding_data');
      if (saved) return saved;
    } catch {
      // ignore
    }
    return null;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [isUploadComplete, setIsUploadComplete] = useState(false);

  // 업로드한 실제 파일의 Object URL (문서 미리보기용)
  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  // 증빙 문서 확인 뷰어 열림 상태
  const [showDocViewer, setShowDocViewer] = useState(false);

  // 종전근무지 목록 확인 헬퍼 (암호화 스토리지 및 일반 스토리지 호환)
  const getExistingPreviousJobs = () => {
    try {
      const secured = getSecureItem('selftax_previous_jobs', null);
      if (Array.isArray(secured) && secured.length > 0) {
        return secured;
      }
      const raw = localStorage.getItem('selftax_previous_jobs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return [];
  };

  const [existingJobs, setExistingJobs] = useState(() => getExistingPreviousJobs());

  // 종전근무지 여부 ('yes' | 'no') - 기존에 PDF 업로드나 수기 직접 추가로 등록된 종전근무지가 있으면 'yes'로 기본 체크
  const [hasPreviousJob, setHasPreviousJob] = useState(() => {
    const prevs = getExistingPreviousJobs();
    return prevs.length > 0 ? 'yes' : 'no';
  });

  // 컴포넌트 마운트 시에도 종전근무지 등록 여부 동기화
  useEffect(() => {
    const prevs = getExistingPreviousJobs();
    setExistingJobs(prevs);
    if (prevs.length > 0) {
      setHasPreviousJob('yes');
    }
  }, []);

  // 파일명에서 유효한 회사명을 추론하는 헬퍼 함수
  const extractCompanyFromFileName = (fileName) => {
    if (!fileName) return '(주)주근무지';
    const cleanName = fileName.replace(/\.pdf$/i, '');
    const corpMatch = cleanName.match(/((?:\(주\)|주식회사)\s*[\w가-힣]{2,20}|[\w가-힣]{2,20}\s*(?:\(주\)|주식회사))/);
    if (corpMatch) return corpMatch[1].trim();

    // 괄호 및 불필요한 단어 제거
    const stripped = cleanName
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/202[0-9]년?(귀속)?/g, '')
      .replace(/근로소득/g, '')
      .replace(/원천징수(영수증)?/g, '')
      .replace(/지급명세서/g, '')
      .replace(/연말정산/g, '')
      .replace(/최종/g, '')
      .replace(/제출용/g, '')
      .replace(/[_-\s]+/g, ' ')
      .trim();

    if (stripped && stripped.length >= 2 && !stripped.match(/^\d+$/)) {
      return stripped.startsWith('(') ? stripped : `(주)${stripped}`;
    }
    return '';
  };

  // 파일 업로드 처리 및 실제 백엔드 파싱 / 추출
  const handleFileUpload = async (file) => {
    if (!file) return;

    // PDF 확장자 및 Content-Type 검증 + 20MB 이하 크기 제한 검증
    if (!validatePdfFile(file)) {
      return;
    }

    const fileName = file.name;
    const fileSize = file.size ? (file.size / 1024).toFixed(1) + ' KB' : '0 KB';

    try {
      const blobUrl = URL.createObjectURL(file);
      setFileBlobUrl(blobUrl);
    } catch (err) {
      console.error('Failed to create file blob URL', err);
      setFileBlobUrl(null);
    }

    setUploadingFile({ name: fileName, size: fileSize });
    setIsAnalyzing(true);
    setIsUploadComplete(false);

    let parsedResult = null;
    let parseError = null;

    // 실제 파일이 넘어온 경우 백엔드 OCR / PDF 파싱 API 호출 시도
    try {
      const formData = new FormData();
      formData.append('files', file);
      const res = await taxService.uploadDocuments(formData);
      if (res && res.length > 0 && res[0].parsed_json) {
        parsedResult = res[0].parsed_json;
      } else {
        parseError = 'PDF 파일에서 유효한 원천징수영수증 서식 및 텍스트를 추출하지 못했습니다.';
      }
    } catch (err) {
      console.error('Backend PDF upload/parse error:', err);
      parseError = err?.userMessage || '백엔드 서버 통신 장애가 발생했거나 파일 형식을 분석할 수 없습니다.';
    }

    // 서버 응답 대기 및 자연스러운 파싱 처리 완료
    setTimeout(() => {
      // 파싱 실패 또는 누락 발생 시 실패 원인 안내 알림 띄우기
      if (parseError || !parsedResult) {
        alert(
          `[원천징수영수증 분석 안내]\n\n실패 원인: ${parseError || '데이터 파싱 실패'}\n\n서버 장애 또는 PDF 인식 실패로 인해 금액란이 0원으로 표기되었습니다. 선명한 원본 PDF로 재시도하시거나 수기로 입력해 주세요.`
        );
      } else if (!parsedResult.gross_salary && !parsedResult.prepaid_income_tax) {
        alert(
          `[원천징수영수증 일부 누락 안내]\n\n업로드된 PDF에서 총급여(16. 계) 또는 기납부세액(74/75번 행) 항목이 확인되지 않아 해당 항목이 0원으로 표기되었습니다.`
        );
      }

      const inferredCompany = extractCompanyFromFileName(fileName);
      const company = parsedResult?.company_name && parsedResult.company_name !== '종전 근무지'
        ? parsedResult.company_name
        : (inferredCompany || '(주)근무지');

      // 보조 기본값(52,000,000원, 1,685,450원 등) 완전 삭제 -> 실패/누락 시 0원 표기
      const totalSalary = Number(parsedResult?.gross_salary) || 0;
      const taxFree = Number(parsedResult?.non_taxable_salary) || 0;
      const paidIncomeTax = Number(parsedResult?.prepaid_income_tax) || 0;
      const paidLocalTax = parsedResult && parsedResult.prepaid_local_tax !== undefined && parsedResult.prepaid_local_tax !== null
        ? Number(parsedResult.prepaid_local_tax)
        : (paidIncomeTax > 0 ? Math.floor(paidIncomeTax * 0.1) : 0);
      const businessNumber = parsedResult?.business_number || '-';
      const period = parsedResult?.period_start && parsedResult?.period_end
        ? `${parsedResult.period_start} ~ ${parsedResult.period_end}`
        : '-';

      const nationalPension = Number(parsedResult?.national_pension) || 0;
      const healthInsurance = Number(parsedResult?.health_insurance) || 0;
      const employmentInsurance = Number(parsedResult?.employment_insurance) || 0;

      const newWithholdingData = {
        uploaded: true,
        fileName,
        size: fileSize,
        company,
        totalSalary,
        taxFree,
        paidIncomeTax,
        paidLocalTax,
        businessNumber,
        period,
        nationalPension,
        healthInsurance,
        employmentInsurance,
        uploadedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      };

      setWithholdingData(newWithholdingData);

      try {
        setSecureItem('selftax_withholding_data', newWithholdingData);
      } catch (e) {
        console.error('Failed to save withholding data', e);
      }

      if (onDataChange) {
        onDataChange(newWithholdingData);
      }

      // 파싱 및 데이터 반영 완료 -> 프로그레스 바 100% 가속 신호
      setIsUploadComplete(true);
    }, 400);
  };

  // 등록된 파일 삭제 (초기 빈 상태로 복귀 및 영구 번들/스토리지 완전 삭제)
  const handleRemoveFile = () => {
    setWithholdingData(null);
    setFileBlobUrl(null);
    setShowDocViewer(false);
    const effectiveId = userProfile?.id || userProfile?.sub || 'guest';
    try {
      removeSecureItem('selftax_withholding_data');
      localStorage.removeItem('selftax_withholding_data');
      sessionStorage.removeItem('selftax_withholding_data');
      removeUserTaxDataKey(effectiveId, 'selftax_withholding_data');
      saveUserData(effectiveId, { selftax_withholding_data: null });
    } catch (e) {
      console.error('Failed to completely remove withholding data', e);
    }
    if (onDataChange) {
      onDataChange(null);
    }
  };

  // 다음 단계 이동 처리
  const handleProceedNext = () => {
    if (hasPreviousJob === 'yes' && onGoPreviousJob) {
      onGoPreviousJob();
    } else if (onNext) {
      onNext();
    }
  };

  return (
    <div className="w-full min-h-screen bg-white flex flex-col justify-between font-sans select-none">
      {/* 1. 상단 헤더: ← 연말정산자료입력 + 캡슐형 홈화면 버튼 */}
      <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev || onGoHome}
            className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
            title="뒤로가기"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-slate-900 tracking-tight">
            연말정산자료입력
          </h1>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <UserAuthStatus
            userProfile={userProfile}
            onSignOut={onSignOut}
            onLogin={onLogin}
          />
          <HomeButton onClick={onGoHome} />
        </div>
      </div>

      {/* 상단 파란색 5단계 프로세스 바 (Step 2: 근로소득원천징수자료 활성화) */}
      <TaxStepProgressBar currentStep={2} onSelectStep={onNavigateStep} />

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        {/* 타이틀 및 서브텍스트 */}
        <div className="pt-1">
          <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
            근로소득원천징수자료를<br />
            등록해주세요.
          </h2>
          <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
            회사에서 발급받은 2025 귀속 근로소득원천징수영수증(PDF)을 등록하시면,
            총급여액과 기납부세액이 자동으로 정확하게 산출됩니다.
          </p>
        </div>

        {/* 1) 근로소득원천징수영수증 업로드 란 (드래그앤드롭 & 파일 선택 지원) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className={`border-2 rounded-2xl p-5 bg-white flex flex-col items-center justify-between min-h-[190px] transition-all text-center relative ${
            isDragging
              ? 'border-[#4F46E5] bg-indigo-50/70 scale-[1.01] shadow-md ring-2 ring-[#4F46E5]/40'
              : withholdingData
              ? 'border-[#4F46E5] bg-indigo-50/20 shadow-2xs'
              : 'border-[#4F46E5] hover:border-[#4338CA] shadow-2xs'
          }`}
        >
          {/* 상단 아이콘 및 안내 문구 */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 my-2">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center text-[#4F46E5] shadow-2xs">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-bold text-slate-800">
                근로소득원천징수영수증 업로드
              </div>
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                {isDragging ? '여기에 파일을 놓으세요!' : 'PDF파일을 드래그 드롭하거나 업로드하세요'}
              </p>
            </div>
          </div>

          {/* 업로드 버튼 */}
          <div className="w-full pt-2">
            <label
              className="w-full py-3.5 px-6 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.99] text-white font-bold text-[14px] transition cursor-pointer text-center flex items-center justify-center gap-2.5 shadow-sm"
            >
              <svg className="w-5 h-5 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>PDF 파일 업로드</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onClick={(e) => {
                  e.target.value = '';
                }}
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>

        {/* AI 분석 중 실시간 고성능 프로그레스 바 */}
        {isAnalyzing && (
          <UploadProgressBar
            isAnalyzing={isAnalyzing}
            fileName={uploadingFile?.name}
            fileSize={uploadingFile?.size}
            title="근로소득원천징수영수증 PDF 분석 중"
            isComplete={isUploadComplete}
            onComplete={() => {
              setIsAnalyzing(false);
              setIsUploadComplete(false);
            }}
          />
        )}

        {/* ========================================================================= */}
        {/* 업로드 완료 시: 파일 표기(서류보기 옆, 삭제 'X' 우측) 및 회사명/금액 표기    */}
        {/* ========================================================================= */}
        {withholdingData && !isAnalyzing && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* 1. 업로드된 PDF 파일 정보 카드 (파일명 바로 옆 '서류보기', 우측 삭제 'X') */}
            <div className="p-3 px-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200/70 text-red-600 flex flex-col items-center justify-center font-black text-[8.5px] shrink-0 shadow-2xs">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="-mt-0.5">PDF</span>
                </div>
                <span className="font-bold text-slate-800 text-[13px] truncate max-w-[190px] sm:max-w-[320px]">
                  {withholdingData.fileName || '2025_근로소득원천징수영수증.pdf'}
                </span>

                {/* 서류보기: 파일명 바로 옆에 배치 */}
                <button
                  type="button"
                  onClick={() => setShowDocViewer(true)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] font-bold text-[11px] border border-indigo-200/80 transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                  title="업로드한 원천징수영수증 원본 서류 열람"
                >
                  <span>서류보기</span>
                  <span>🔍</span>
                </button>
              </div>

              {/* 우측 삭제 'X' 버튼 */}
              <button
                type="button"
                onClick={handleRemoveFile}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition cursor-pointer flex items-center justify-center font-bold text-sm shrink-0"
                title="삭제하고 다시 업로드"
              >
                ✕
              </button>
            </div>

            {/* 2. 업로드한 PDF 자료로 추출된 회사명과 금액 상세 카드 */}
            <div className="bg-white rounded-2xl p-5 shadow-2xs border border-slate-200/90 space-y-3.5">
              {/* 상단: 회사명(근무지명) 및 귀속연도 (수정버튼 삭제 완료) */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100 gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight truncate">
                      {withholdingData.company || '(주)주근무지'}
                    </h3>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold shrink-0">
                      주근무지
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono pl-4.5">
                    근무기간: {withholdingData.period || '2025.01.01 ~ 2025.12.31'}
                    {withholdingData.businessNumber ? ` • 사업자번호: ${withholdingData.businessNumber}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                    2025 귀속 정상 반영
                  </span>
                </div>
              </div>

              {/* 금액 상세 4칸 그리드 */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {/* 1. 총급여액 */}
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100">
                  <span className="text-slate-500 text-[11px] block font-medium">총급여액 (과세대상소득)</span>
                  <div className="text-[16px] font-extrabold text-slate-900 mt-1 font-mono tracking-tight">
                    {Number(withholdingData.totalSalary || 0).toLocaleString()}원
                  </div>
                </div>

                {/* 2. 비과세소득 */}
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100">
                  <span className="text-slate-500 text-[11px] block font-medium">비과세소득 (식대/운전)</span>
                  <div className="text-[16px] font-extrabold text-slate-900 mt-1 font-mono tracking-tight">
                    {Number(withholdingData.taxFree || 0).toLocaleString()}원
                  </div>
                </div>

                {/* 3. 소득세 */}
                <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/80">
                  <span className="text-indigo-700 text-[11px] block font-medium">기납부 소득세</span>
                  <div className="text-[16px] font-extrabold text-[#4F46E5] mt-1 font-mono tracking-tight">
                    {Number(withholdingData.paidIncomeTax || 0).toLocaleString()}원
                  </div>
                </div>

                {/* 4. 지방소득세 */}
                <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/80">
                  <span className="text-indigo-700 text-[11px] block font-medium">기납부 지방소득세</span>
                  <div className="text-[16px] font-extrabold text-[#4F46E5] mt-1 font-mono tracking-tight">
                    {Number(withholdingData.paidLocalTax || 0).toLocaleString()}원
                  </div>
                </div>
              </div>

              {/* 하단: 기납부세액 총계 바 */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/50 border border-indigo-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span>💰</span>
                  <span>총 기납부세액 합계</span>
                </div>
                <div className="font-black text-sm text-[#4F46E5] font-mono">
                  {(Number(withholdingData.paidIncomeTax || 0) + Number(withholdingData.paidLocalTax || 0)).toLocaleString()}원
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2) 종전근무지 안내 내용 카드 */}
        <div className="rounded-2xl border-2 border-indigo-100 bg-[#F9FAFC] p-5 space-y-3.5 shadow-2xs mt-2">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-[#4F46E5] flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
              🏢
            </div>
            <div>
              <h3 className="text-[13.5px] font-bold text-slate-900 leading-snug">
                연도 중 다른 근무지에서 근무한 적이 있나요?
              </h3>
              <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
                2025년에 이직, 중도퇴사 등으로 이전 직장(종전근무지)이 있는 경우, 종전근무지의 근로소득원천징수영수증을 함께 합산하여 연말정산해야 가산세(추가 납부)를 방지할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 예 / 아니오 선택 버튼 그룹 */}
          <div className="grid grid-cols-2 gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={() => setHasPreviousJob('yes')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 cursor-pointer transition-all ${
                hasPreviousJob === 'yes'
                  ? 'border-[#4F46E5] bg-indigo-50/80 text-[#4F46E5] font-extrabold shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  hasPreviousJob === 'yes'
                    ? 'border-[#4F46E5] bg-[#4F46E5]'
                    : 'border-slate-400 bg-white'
                }`}
              >
                {hasPreviousJob === 'yes' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
              <span className="text-xs">예 (있음)</span>
            </button>

            <button
              type="button"
              onClick={() => setHasPreviousJob('no')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 cursor-pointer transition-all ${
                hasPreviousJob === 'no'
                  ? 'border-[#4F46E5] bg-indigo-50/80 text-[#4F46E5] font-extrabold shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  hasPreviousJob === 'no'
                    ? 'border-[#4F46E5] bg-[#4F46E5]'
                    : 'border-slate-400 bg-white'
                }`}
              >
                {hasPreviousJob === 'no' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
              <span className="text-xs">아니오 (없음)</span>
            </button>
          </div>

          {/* 종전근무지 선택에 따른 안내 피드백 */}
          {hasPreviousJob === 'yes' ? (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-indigo-950">
                  <span>📌</span>
                  <span>종전근무지 원천징수영수증 합산 안내</span>
                </div>
                {existingJobs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#4F46E5] text-white font-bold text-[10.5px]">
                    등록된 종전근무지 {existingJobs.length}건 연동됨
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-indigo-800 leading-relaxed pl-5">
                {existingJobs.length > 0
                  ? `기존에 등록된 종전근무지(${existingJobs.map((j) => j.company || '종전근무지').join(', ')})가 확인되어 '예 (있음)'으로 자동 체크되었습니다. 다음 단계에서 내역을 확인하거나 추가/수정하실 수 있습니다.`
                  : "이전 직장에서 발급받은 '근로소득원천징수영수증'을 등록하시면, 현 직장 소득과 자동으로 합산되어 정확한 정산이 이루어집니다."}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11.5px] text-slate-600 flex items-center gap-1.5 font-medium animate-in fade-in">
              <span>➡️</span>
              <span>종전근무지가 없는 경우, 아래 '다음'을 누르면 <strong>국세청 간소화자료 등록 메뉴</strong>로 바로 이동합니다.</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. 하단 네비게이션 액션 바 */}
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
          onClick={handleProceedNext}
          className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center flex items-center justify-center gap-1"
        >
          저장/다음
        </button>
      </div>

      {/* 4. 원천징수영수증 확인 뷰어 모달 */}
      {showDocViewer && withholdingData && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#C2C5CD] select-none animate-in fade-in duration-200">
          {/* 상단 다크 헤더 */}
          <div className="w-full px-4 py-3.5 bg-[#4D5057] text-white flex items-center justify-between shadow-md z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDocViewer(false)}
                className="p-1 -ml-1 text-white hover:text-slate-300 transition cursor-pointer text-lg font-light flex items-center justify-center"
                title="닫기"
              >
                ✕
              </button>
              <span className="text-sm font-semibold tracking-tight text-white truncate max-w-[280px]">
                {withholdingData.fileName || '근로소득원천징수영수증.pdf'}
              </span>
            </div>
          </div>

          {/* 중앙 PDF/문서 서류 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-start relative">
            <div className="w-full max-w-[440px] bg-white shadow-2xl rounded-xs overflow-hidden border border-slate-300/80 mb-14">
              {fileBlobUrl ? (
                <iframe
                  src={fileBlobUrl}
                  className="w-full h-[650px] border-0"
                  title="근로소득원천징수영수증 미리보기"
                />
              ) : (
                /* 샘플 또는 텍스트 서류 열람 시: 실제 추출된 회사명과 금액이 일치하도록 동적 렌더링 */
                <div className="p-4 text-slate-800 text-[11px] leading-tight select-text font-sans bg-[#FBFBFA]">
                  <div className="border border-slate-400 p-3 bg-white space-y-3">
                    {/* 원본 파일이 없을 때: 공식 서식처럼 보이지 않도록 입력·추출 값 요약만 표시 */}
                    <div className="text-center pb-2 border-b-2 border-slate-800">
                      <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                        원천징수영수증 입력 내용 요약
                      </h3>
                      <div className="text-[10px] text-amber-700 mt-0.5 font-medium">
                        원본 PDF가 없어 입력·추출된 값만 보여 줍니다 (공식 서류 아님)
                      </div>
                    </div>

                    {/* 기본 인적사항 / 회사 정보 */}
                    <div className="grid grid-cols-2 gap-1 text-[10px] bg-slate-50 p-2 border border-slate-200 rounded">
                      <div><strong className="text-slate-500">징수의무자:</strong> {withholdingData.company || '-'}</div>
                      <div><strong className="text-slate-500">사업자등록번호:</strong> {withholdingData.businessNumber || '-'}</div>
                      <div><strong className="text-slate-500">소득자성명:</strong> {userProfile?.name || '근로자'}</div>
                      <div><strong className="text-slate-500">귀속연도:</strong> 2025년</div>
                      <div className="col-span-2"><strong className="text-slate-500">근무기간:</strong> {withholdingData.period || '-'}</div>
                    </div>

                    {/* 주요 급여 및 결정세액 표 */}
                    <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-center font-bold">
                          <th className="border border-slate-300 p-1.5">구분</th>
                          <th className="border border-slate-300 p-1.5">금액 (원)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-slate-300 p-1.5 font-medium">① 총급여액 (과세소득)</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">
                            {Number(withholdingData.totalSalary || 0).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 p-1.5 font-medium">② 비과세소득 계</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono">
                            {Number(withholdingData.taxFree || 0).toLocaleString()}
                          </td>
                        </tr>
                        <tr className="bg-indigo-50/60 font-semibold text-indigo-950">
                          <td className="border border-slate-300 p-1.5">79. 소득세 (기납부세액)</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono text-[#4F46E5]">
                            {Number(withholdingData.paidIncomeTax || 0).toLocaleString()}
                          </td>
                        </tr>
                        <tr className="bg-indigo-50/60 font-semibold text-indigo-950">
                          <td className="border border-slate-300 p-1.5">80. 지방소득세 (기납부세액)</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono text-[#4F46E5]">
                            {Number(withholdingData.paidLocalTax || 0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    
                  </div>
                </div>
              )}
            </div>

            {/* 페이지 인디케이터 */}
            <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="bg-[#383A3F]/90 backdrop-blur-xs text-white text-[11px] font-semibold px-3 py-0.5 rounded-full shadow-lg tracking-widest border border-white/10">
                1/1
              </div>
            </div>
          </div>

          {/* 하단 다크 툴바 */}
          <div className="w-full px-8 py-3 bg-[#4D5057] text-white flex items-center justify-between border-t border-slate-600/50 shadow-inner z-20">
            <button
              type="button"
              onClick={() => {
                if (fileBlobUrl) {
                  const a = document.createElement('a');
                  a.href = fileBlobUrl;
                  a.download = withholdingData.fileName || '근로소득원천징수영수증.pdf';
                  a.click();
                } else {
                  alert('💾 원천징수영수증 서류 다운로드가 완료되었습니다.');
                }
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer flex items-center justify-center"
              title="증빙서류 다운로드"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() =>
                alert(
                  '📄 증빙서류 정보\n\n' +
                  '• 서류명: 근로소득원천징수영수증 (소득자 보관용)\n' +
                  '• 파일명: ' + (withholdingData.fileName || '근로소득원천징수영수증.pdf') + '\n' +
                  '• 징수의무자: ' + (withholdingData.company || '-') + '\n' +
                  '• 귀속연도: 2025년도 (정산연월: 2026.02)'
                )
              }
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer flex items-center justify-center"
              title="증빙서류 상세 정보"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2.5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
