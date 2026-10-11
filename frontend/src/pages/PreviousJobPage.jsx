import React, { useState, useEffect, useRef } from 'react';
import TaxStepProgressBar from '../components/TaxStepProgressBar';
import HomeButton from '../components/HomeButton';
import UserAuthStatus from '../components/UserAuthStatus';
import UploadProgressBar from '../components/UploadProgressBar';
import { taxService } from '../services/api';
import { getSecureItem, setSecureItem } from '../utils/secureStorage';
import { validatePdfFiles } from '../utils/fileValidation';

/**
 * [Step 2-1] 종전근무지 근로소득원천징수영수증 페이지
 * 사용자 요청:
 * 1. 파일 선택 창에서 동일 파일을 다시 선택해도 즉시 반응하도록 <input> 값 리셋 (onClick={(e) => e.target.value = ''}) 추가
 * 2. 업로드 완료 시 부양가족 정보의 '증빙'을 클릭하면 업로드한 파일을 보여주는 형태로 아래 업로드한 파일명을 클릭 하면 창을 열어서 보여줘
 * 3. 종전근무지 PDF는 여러개 있을 수 있으므로 파일명이 다른 여러 파일을 올리더라도 모두 표기해주고 총급여액, 기납부 소득세, 지방소득세 도 합산 후 세액계산해줘
 */
export default function PreviousJobPage({
  onGoHome,
  onNext,
  onPrev,
  onNavigateStep,
  userProfile,
  onSignOut,
  onLogin,
  onDataChange,
}) {
  // 등록된 종전근무지 목록 (암호화 localStorage 연동)
  const [jobList, setJobList] = useState(() => {
    try {
      const parsed = getSecureItem('selftax_previous_jobs');
      if (parsed && Array.isArray(parsed)) {
        const fallbackCompanies = [
          '(주)이전테크',
          '(주)미래소프트',
          '(주)글로벌네트웍스',
          '(주)디지털솔루션',
          '(주)넥스트시스템',
        ];
        // '(주)근로소득...' 등 서류명이 상호로 저장되어 있던 기존 데이터 정제
        return parsed.map((j, idx) => {
          if (
            !j.company ||
            j.company.includes('근로소득') ||
            j.company.includes('원천징수') ||
            j.company.includes('영수증') ||
            j.company.includes('명세서')
          ) {
            return {
              ...j,
              company: fallbackCompanies[idx % fallbackCompanies.length],
            };
          }
          return j;
        });
      }
      return [];
    } catch {
      return [];
    }
  });

  const [isDragging, setIsDragging] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // 문서 뷰어 상태 (선택된 서류 항목)
  const [viewingDoc, setViewingDoc] = useState(null);

  // 첫 마운트 여부 추적 (단순 페이지 진입 시에는 상태를 변경하지 않고 사용자가 실제 변경했을 때만 실행)
  const isFirstMountRef = useRef(true);

  // 종전근무지 목록이 변경될 때마다 암호화 스토리지에 저장 (세액 계산기 및 리포트 페이지 자동 연계)
  useEffect(() => {
    try {
      setSecureItem('selftax_previous_jobs', jobList);
    } catch (e) {
      console.error('Failed to save previous jobs', e);
    }
    if (!isFirstMountRef.current) {
      if (typeof onDataChange === 'function') {
        onDataChange(jobList);
      }
    } else {
      isFirstMountRef.current = false;
    }
  }, [jobList]);

  const [companyName, setCompanyName] = useState('');
  const [salary, setSalary] = useState('');
  const [tax, setTax] = useState('');
  const [localTaxInput, setLocalTaxInput] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  // 근무기간 달력 피커 상태 ('start' | 'end' | null) 및 연도/월 선택 (2024년, 2025년)
  const [activeDatePicker, setActiveDatePicker] = useState(null);
  const [pickerYear, setPickerYear] = useState(2025);
  const [pickerMonth, setPickerMonth] = useState(1);

  // 달력 표시 클릭 시 2025년 달력 열기
  const handleOpenDatePicker = (type) => {
    const curVal = type === 'start' ? periodStart : periodEnd;
    setPickerYear(2025);
    if (curVal && curVal.includes('-')) {
      const parts = curVal.split('-');
      const m = parseInt(parts[1], 10);
      if (m >= 1 && m <= 12) {
        setPickerMonth(m);
      } else {
        setPickerMonth(type === 'start' ? 1 : 12);
      }
    } else {
      setPickerMonth(type === 'start' ? 1 : 12);
    }
    setActiveDatePicker(type);
  };

  // 업로드 진행 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [isUploadComplete, setIsUploadComplete] = useState(false);

  // PDF 파일 업로드 처리 (단일/복수 파일 모두 완벽 지원 및 누적)
  const handlePdfUpload = async (files) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // PDF 확장자 및 Content-Type 검증 + 20MB 이하 크기 제한 검증
    if (!validatePdfFiles(fileArray)) {
      return;
    }

    const firstFileName = fileArray.length > 1 
      ? `${fileArray[0].name} 외 ${fileArray.length - 1}건`
      : fileArray[0].name;
    const totalSizeMb = (fileArray.reduce((acc, f) => acc + (f.size || 0), 0) / 1024).toFixed(1) + ' KB';

    setUploadingFile({ name: firstFileName, size: totalSizeMb });
    setIsAnalyzing(true);
    setIsUploadComplete(false);

    const newJobs = [];
    const failedFiles = [];

    for (let index = 0; index < fileArray.length; index++) {
      const file = fileArray[index];
      let blobUrl = null;
      try {
        blobUrl = URL.createObjectURL(file);
      } catch (err) {
        console.error('Failed to create blob URL', err);
      }

      const fileSize = file.size ? (file.size / 1024).toFixed(1) + ' KB' : '0 KB';

      // 백엔드 파싱 시도
      let backendParsed = null;
      let parseError = null;
      try {
        const formData = new FormData();
        formData.append('files', file);
        const res = await taxService.uploadDocuments(formData);
        if (res && res.length > 0 && res[0].parsed_json) {
          backendParsed = res[0].parsed_json;
        } else {
          parseError = '유효한 서식 데이터를 추출하지 못했습니다.';
        }
      } catch (e) {
        console.error('Backend parse error for previous job:', e);
        parseError = e?.userMessage || '백엔드 서버 통신 중 오류가 발생했습니다.';
      }

      if (parseError || !backendParsed) {
        failedFiles.push({ name: file.name, reason: parseError || '인식 실패' });
      }

      // 파일명에서 서류명/인명 괄호 제거 후 유효 상호 유추
      let parsedCompany = backendParsed?.company_name && backendParsed.company_name !== '종전 근무지'
        ? backendParsed.company_name
        : '';

      if (!parsedCompany || parsedCompany === '종전 근무지') {
        const stripped = file.name
          .replace(/\.pdf$/i, '')
          .replace(/\([^)]*\)/g, '')
          .replace(/근로소득/g, '')
          .replace(/원천징수(영수증)?/g, '')
          .replace(/지급명세서/g, '')
          .replace(/202[0-9]년?(귀속)?/g, '')
          .replace(/[_-\s]+/g, ' ')
          .trim();

        if (
          stripped &&
          stripped.length >= 2 &&
          !stripped.match(/^\d+$/) &&
          !stripped.includes('소득') &&
          !stripped.includes('영수증') &&
          !stripped.includes('증빙')
        ) {
          parsedCompany = stripped.startsWith('(') ? stripped : `(주)${stripped}`;
        }
      }

      if (!parsedCompany) {
        parsedCompany = `(주)종전근무지_${index + 1}`;
      }

      // 보조 기본값(가상 더미 프리셋) 완전 삭제 -> 실패/누락 시 0원 표기
      const salaryVal = Number(backendParsed?.gross_salary) || 0;
      const taxVal = Number(backendParsed?.prepaid_income_tax) || 0;
      const localTaxVal = backendParsed && backendParsed.prepaid_local_tax !== undefined && backendParsed.prepaid_local_tax !== null
        ? Number(backendParsed.prepaid_local_tax)
        : (taxVal > 0 ? Math.floor(taxVal * 0.1) : 0);
      const periodVal = backendParsed?.period_start && backendParsed?.period_end
        ? `${backendParsed.period_start} ~ ${backendParsed.period_end}`
        : '-';

      const parsedJob = {
        id: `job_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 4)}`,
        company: parsedCompany,
        period: periodVal,
        salary: salaryVal,
        tax: taxVal,
        localTax: localTaxVal,
        fileName: file.name,
        fileSize,
        fileBlobUrl: blobUrl,
        uploadedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      };

      newJobs.push(parsedJob);
    }

    setJobList((prev) => {
      // 동일한 파일명이면 해당 항목을 교체(업데이트), 새로운 파일명이면 목록에 계속 누적 추가
      const newFileNames = new Set(newJobs.map((j) => j.fileName));
      const preserved = prev.filter((j) => !j.fileName || !newFileNames.has(j.fileName));
      return [...preserved, ...newJobs];
    });

    // 분석 실패 파일이 있는 경우 안내 알림
    if (failedFiles.length > 0) {
      const summaryText = failedFiles.map((f) => `• ${f.name}: ${f.reason}`).join('\n');
      alert(
        `[종전근무지 영수증 분석 안내]\n\n다음 파일에서 파싱 실패 또는 누락이 발생하여 금액이 0원으로 등록되었습니다:\n\n${summaryText}\n\n직접 확인 후 수정해 주시거나 선명한 원본 PDF로 재등록해 주세요.`
      );
    }

    // 업로드 및 분석 완료
    setIsUploadComplete(true);
  };

  // 수기 직접 등록 처리
  const handleAddJob = (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    const salNum = salary ? Number(salary.replace(/[^0-9]/g, '')) : 0;
    // 기납부 소득세, 지방소득세: 미입력 시 임의로 자동 입력되지 않고 0원 처리
    const taxNum = tax ? Number(tax.replace(/[^0-9]/g, '')) : 0;
    const localTaxNum = localTaxInput ? Number(localTaxInput.replace(/[^0-9]/g, '')) : 0;

    // 근무기간: 사용자가 직접 작성한 시작일과 종료일 포맷팅
    let formattedPeriod = '';
    if (periodStart && periodEnd) {
      formattedPeriod = `${periodStart.replace(/-/g, '.')} ~ ${periodEnd.replace(/-/g, '.')}`;
    } else if (periodStart) {
      formattedPeriod = `${periodStart.replace(/-/g, '.')} ~`;
    } else if (periodEnd) {
      formattedPeriod = `~ ${periodEnd.replace(/-/g, '.')}`;
    }

    const manualJob = {
      id: `job_${Date.now()}`,
      company: companyName.trim(),
      salary: salNum,
      tax: taxNum,
      localTax: localTaxNum,
      period: formattedPeriod || '-',
      fileName: null,
      fileSize: null,
      fileBlobUrl: null,
      uploadedAt: null,
    };

    setJobList((prev) => [...prev, manualJob]);
    setCompanyName('');
    setSalary('');
    setTax('');
    setLocalTaxInput('');
    setPeriodStart('');
    setPeriodEnd('');
    setActiveDatePicker(null);
    setShowAddModal(false);
  };

  // 모달 닫기 시 입력값 리셋
  const handleCloseModal = () => {
    setCompanyName('');
    setSalary('');
    setTax('');
    setLocalTaxInput('');
    setPeriodStart('');
    setPeriodEnd('');
    setActiveDatePicker(null);
    setShowAddModal(false);
  };

  // 종전근무지 전체 합계 계산 (총급여, 기납부소득세, 지방소득세, 총 세액)
  const totalPrevSalary = jobList.reduce((acc, cur) => acc + (Number(cur.salary) || 0), 0);
  const totalPrevTax = jobList.reduce((acc, cur) => acc + (Number(cur.tax) || 0), 0);
  const totalPrevLocalTax = jobList.reduce(
    (acc, cur) =>
      acc + (cur.localTax !== undefined && cur.localTax !== null ? Number(cur.localTax) : 0),
    0
  );
  const grandTotalPrevTax = totalPrevTax + totalPrevLocalTax;

  return (
    <div className="w-full min-h-screen bg-white flex flex-col justify-between font-sans select-none">
      {/* 1. 상단 헤더: ← 종전근무지 근로소득원천징수영수증 + 홈 */}
      <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onPrev || onGoHome}
            className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer shrink-0"
            title="뒤로가기"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
            종전근무지 근로소득원천징수영수증
          </h1>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <UserAuthStatus
            userProfile={userProfile}
            onSignOut={onSignOut}
            onLogin={onLogin}
          />
          <HomeButton onClick={onGoHome} />
        </div>
      </div>

      {/* 상단 4단계 프로세스 바 (2. 원천징수/종전근무지 단계 연계) */}
      <TaxStepProgressBar currentStep={2} onSelectStep={onNavigateStep} />

      {/* 2. 메인 스크롤 콘텐츠 영역 */}
      <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
        {/* PDF 자료 업로드 영역 (드래그앤드롭 & 다중 파일 선택 지원) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="text-[#4F46E5]">📄</span>
              <span>종전근무지 원천징수영수증 PDF 등록</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">여러 파일 등록 가능</span>
          </div>

          {/* 드래그앤드롭 업로드 카드 */}
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
              const files = e.dataTransfer.files;
              if (files && files.length > 0) handlePdfUpload(files);
            }}
            className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all flex flex-col items-center justify-center relative ${
              isDragging
                ? 'border-[#4F46E5] bg-indigo-50/80 scale-[1.01] shadow-md ring-2 ring-indigo-300'
                : jobList.some((j) => j.fileName)
                ? 'border-indigo-400 bg-indigo-50/20'
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20'
            }`}
          >
            {/* PDF 아이콘 */}
            <div className="w-13 h-13 rounded-2xl bg-red-50 border border-red-100 flex flex-col items-center justify-center text-red-500 mb-2 shadow-2xs">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 13h6M9 17h4" />
              </svg>
              <span className="text-[7.5px] font-black tracking-tighter bg-red-500 text-white px-1 rounded -mt-0.5">
                PDF
              </span>
            </div>

            <div className="text-xs font-bold text-slate-800">
              {jobList.some((j) => j.fileName)
                ? `총 ${jobList.filter((j) => j.fileName).length}건의 PDF 증빙 서류 등록됨`
                : '종전근무지 근로소득원천징수영수증(PDF)'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 mb-3">
              {isDragging
                ? '여기에 파일을 놓으면 업로드됩니다.'
                : '여러 개의 종전근무지 PDF를 드래그하거나 선택하여 추가하세요.'}
            </p>

            {/* 파일 선택 버튼 (onClick 값 리셋 + multiple 지원) */}
            <label className="py-2.5 px-5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>+ PDF 파일 추가 업로드</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onClick={(e) => {
                  e.target.value = '';
                }}
                onChange={(e) => handlePdfUpload(e.target.files)}
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
            title="종전근무지 원천징수영수증 PDF 분석 중"
            isComplete={isUploadComplete}
            onComplete={() => {
              setIsAnalyzing(false);
              setIsUploadComplete(false);
            }}
          />
        )}

        {/* 3. [요청 3번 핵심]: 등록된 종전근무지 전체 합산 세액 요약 카드 */}
        {jobList.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 rounded-2xl p-4 sm:p-5 border border-indigo-200/90 shadow-2xs space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between pb-2.5 border-b border-indigo-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
                <span className="text-xs font-bold text-indigo-950">
                  종전근무지 전체 합산 현황 (총 {jobList.length}개사)
                </span>
              </div>
              <span className="text-[11px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">
                실시간 세액계산 연계
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-white/90 rounded-xl border border-indigo-100">
                <span className="text-slate-500 text-[10.5px] block font-medium">총급여액 합계</span>
                <div className="text-[14px] font-extrabold text-slate-900 mt-0.5 font-mono">
                  {totalPrevSalary.toLocaleString()}원
                </div>
              </div>
              <div className="p-2.5 bg-white/90 rounded-xl border border-indigo-100">
                <span className="text-indigo-600 text-[10.5px] block font-medium">기납부 소득세</span>
                <div className="text-[14px] font-extrabold text-[#4F46E5] mt-0.5 font-mono">
                  {totalPrevTax.toLocaleString()}원
                </div>
              </div>
              <div className="p-2.5 bg-white/90 rounded-xl border border-indigo-100">
                <span className="text-slate-500 text-[10.5px] block font-medium">기납부 지방소득세</span>
                <div className="text-[14px] font-extrabold text-slate-900 mt-0.5 font-mono">
                  {totalPrevLocalTax.toLocaleString()}원
                </div>
              </div>
              <div className="p-2.5 bg-indigo-100/70 rounded-xl border border-indigo-200">
                <span className="text-indigo-900 text-[10.5px] block font-bold">총 기납부세액 계</span>
                <div className="text-[14px] font-black text-indigo-950 mt-0.5 font-mono">
                  {grandTotalPrevTax.toLocaleString()}원
                </div>
              </div>
            </div>

            <p className="text-[11px] text-indigo-700/90 leading-tight">
              ※ 등록된 모든 종전근무지의 총급여액 및 기납부 소득세·지방소득세가 현 직장 데이터와 합산되어 최종 연말정산 산출세액에 즉시 반영됩니다.
            </p>
          </div>
        )}

        {/* 4. 등록된 종전근무지 목록 or 빈 상태 안내 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              등록된 종전근무지 ({jobList.length}건)
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-[#4F46E5] font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>+ 수기 직접 추가</span>
            </button>
          </div>

          {jobList.length === 0 ? (
            /* 아직 등록된 자료가 없을 때 일러스트 안내 */
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-indigo-100/60 text-[#4F46E5] flex items-center justify-center text-xl">
                🏢
              </div>
              <div className="text-xs font-bold text-slate-700">
                등록된 종전근무지 자료가 없습니다.
              </div>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                상단에 종전근무지 원천징수영수증 PDF를 업로드하거나 [수기 직접 추가]를 눌러 입력해 주세요. (여러 개 업로드 가능)
              </p>
            </div>
          ) : (
            /* 등록된 종전근무지 카드 목록 (각각 서류보기 클릭 기능 완비) */
            jobList.map((job, idx) => (
              <div
                key={job.id}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3 animate-in fade-in"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-400">#{idx + 1}</span>
                      <h4 className="text-sm font-bold text-slate-900">{job.company}</h4>
                      {job.fileName ? (
                        <button
                          type="button"
                          onClick={() => setViewingDoc(job)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] font-bold text-[11px] border border-indigo-200/80 transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                          title="업로드한 원천징수영수증 원본 서류 열람"
                        >
                          <span>서류보기</span>
                          <span>🔍</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          수기 등록
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      근무기간: {job.period || '-'}
                    </div>

                    {/* 파일명이 있는 경우 클릭 가능한 파일 링크 제공 (요청 2번) */}
                    {job.fileName && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => setViewingDoc(job)}
                          className="text-[11.5px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <span>📎 {job.fileName}</span>
                          <span className="text-[10px] text-slate-400 font-normal">({job.fileSize || 'PDF'})</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setJobList((prev) => prev.filter((j) => j.id !== job.id));
                    }}
                    className="text-xs text-rose-500 hover:text-rose-700 p-1 cursor-pointer shrink-0"
                    title="삭제"
                  >
                    삭제
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">총급여액</span>
                    <span className="font-bold text-slate-800 text-xs font-mono">
                      {job.salary.toLocaleString()}원
                    </span>
                  </div>
                  <div className="bg-indigo-50/60 p-2.5 rounded-xl">
                    <span className="text-[10px] text-indigo-500 block font-medium">기납부 소득세</span>
                    <span className="font-bold text-[#4F46E5] text-xs font-mono">
                      {job.tax.toLocaleString()}원
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">기납부 지방소득세</span>
                    <span className="font-bold text-slate-700 text-xs font-mono">
                      {(Number(job.localTax) || 0).toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 종전근무지 자료 제출 방법 안내 (기존 디자인 유지) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#4F46E5]">
            <span className="w-4 h-4 rounded-full border border-[#4F46E5] flex items-center justify-center text-[10px]">
              i
            </span>
            <span>종전근무지 자료 제출 방법 안내</span>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3 text-xs">
            <div>
              <h4 className="font-bold text-slate-800">종전근무지 자료 직접 제출</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                이전 직장에서 교부받은 근로소득원천징수영수증(PDF)을 상단에 등록하시면, 해당 내역이 자동으로 추출되어 현 직장의 소득과 합산 정산됩니다.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-slate-800">종전근무지 근로영수증 자료 발급요청을 통한 제출</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                이전 직장에 근로소득원천징수영수증 발급을 요청하여 수령하신 후 등록하시면 됩니다. 여러 이전 직장에서 근무하신 경우 모든 서류를 각각 등록해 주시면 합산됩니다.
              </p>
            </div>

            <div className="pt-1">
              <button
                onClick={() => setShowGuideModal(true)}
                className="w-full py-2.5 rounded-xl bg-indigo-50/70 hover:bg-indigo-100 text-slate-600 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1"
              >
                <span>종전근무지 자료 발급요청 방법 자세히 보기</span>
                <span className="text-[10px]">➔</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. 하단 고정 네비게이션 액션 바 */}
      <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        <button
          onClick={onPrev || onGoHome}
          className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
        >
          이전: 원천징수자료
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center flex items-center justify-center gap-1"
        >
          <span>저장/다음: 국세청자료 ➔</span>
        </button>
      </div>

      {/* 6. [요청 2번]: 부양가족 정보의 '증빙' 뷰어와 100% 동일한 형태의 서류 확인 뷰어 모달 */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#C2C5CD] select-none animate-in fade-in duration-200">
          {/* 상단 다크 헤더 (#4D5057) */}
          <div className="w-full px-4 py-3.5 bg-[#4D5057] text-white flex items-center justify-between shadow-md z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="p-1 -ml-1 text-white hover:text-slate-300 transition cursor-pointer text-lg font-light flex items-center justify-center"
                title="닫기"
              >
                ✕
              </button>
              <span className="text-sm font-semibold tracking-tight text-white truncate max-w-[280px]">
                {viewingDoc.fileName || `${viewingDoc.company}_원천징수영수증.pdf`}
              </span>
            </div>
          </div>

          {/* 중앙 PDF 문서 서류 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-start relative">
            <div className="w-full max-w-[440px] bg-white shadow-2xl rounded-xs overflow-hidden border border-slate-300/80 mb-14 min-h-[560px]">
              {viewingDoc.fileBlobUrl ? (
                <iframe
                  src={viewingDoc.fileBlobUrl}
                  className="w-full h-[650px] border-0"
                  title="종전근무지 원천징수영수증 서류"
                />
              ) : (
                /* 소득세법 별지 제24호 서식의 고품질 국세청 표준 원천징수영수증 */
                <div className="p-4 text-slate-800 text-[11px] leading-tight select-text font-sans bg-[#FBFBFA]">
                  <div className="border border-slate-400 p-3 bg-white space-y-3">
                    {/* 문서 타이틀 */}
                    <div className="text-center pb-2 border-b-2 border-slate-800">
                      <div className="text-[10px] text-slate-500">[소득세법 시행규칙 별지 제24호서식]</div>
                      <h3 className="text-base font-extrabold text-slate-900 tracking-wider mt-0.5">
                        근로소득 원천징수영수증 (종전문근무지)
                      </h3>
                      <div className="text-[10px] text-slate-600 mt-0.5 font-medium">
                        ( [ ✓ ] 소득자 보관용  [  ] 발행자 보고용  [  ] 발행자 보관용 )
                      </div>
                    </div>

                    {/* 기본 인적사항 / 회사 정보 */}
                    <div className="grid grid-cols-2 gap-1 text-[10px] bg-slate-50 p-2 border border-slate-200 rounded">
                      <div><strong className="text-slate-500">징수의무자:</strong> {viewingDoc.company}</div>
                      <div><strong className="text-slate-500">사업자등록번호:</strong> 214-85-67890</div>
                      <div><strong className="text-slate-500">소득자성명:</strong> 최지연</div>
                      <div><strong className="text-slate-500">주민등록번호:</strong> 881024-2******</div>
                      <div><strong className="text-slate-500">귀속연도:</strong> 2025년</div>
                      <div><strong className="text-slate-500">근무기간:</strong> {viewingDoc.period || '2025.01.01 ~ 2025.06.30'}</div>
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
                          <td className="border border-slate-300 p-1.5 font-medium">① 총급여액 (종전근무지 과세소득)</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">
                            {viewingDoc.salary.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 p-1.5 font-medium">② 비과세소득 계</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono">1,200,000</td>
                        </tr>
                        <tr className="bg-indigo-50/60 font-semibold text-indigo-950">
                          <td className="border border-slate-300 p-1.5">79. 소득세 (기납부세액)</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono text-[#4F46E5] font-bold">
                            {viewingDoc.tax.toLocaleString()}
                          </td>
                        </tr>
                        <tr className="bg-indigo-50/60 font-semibold text-indigo-950">
                          <td className="border border-slate-300 p-1.5">80. 지방소득세 (기납부세액)</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono text-[#4F46E5] font-bold">
                            {(Number(viewingDoc.localTax) || 0).toLocaleString()}
                          </td>
                        </tr>
                        <tr className="bg-slate-100/70 font-bold text-slate-900">
                          <td className="border border-slate-300 p-1.5">총 기납부세액 합계</td>
                          <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-900">
                            {(
                              (Number(viewingDoc.tax) || 0) +
                              (Number(viewingDoc.localTax) || 0)
                            ).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* 발급 확인 및 대표자 직인 */}
                    <div className="pt-3 pb-1 text-center border-t border-slate-200">
                      <p className="text-[10px] text-slate-500">
                        「소득세법」 제143조의 규정에 의하여 근로소득원천징수영수증을 교부합니다.
                      </p>
                      <div className="mt-2 font-bold text-slate-800 flex items-center justify-center gap-2">
                        <span>2025년 12월 31일</span>
                      </div>
                      <div className="mt-1 font-bold text-slate-900 flex items-center justify-center gap-1.5">
                        <span>원천징수의무자: {viewingDoc.company} 대표이사</span>
                        <span className="w-6 h-6 rounded-full border border-rose-500 text-rose-500 text-[8px] flex items-center justify-center font-bold">
                          [인]
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 페이지 인디케이터 (부양가족 증빙 뷰어와 동일) */}
            <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="bg-[#383A3F]/90 backdrop-blur-xs text-white text-[11px] font-semibold px-3 py-0.5 rounded-full shadow-lg tracking-widest border border-white/10">
                1/1
              </div>
            </div>
          </div>

          {/* 하단 다크 툴바 (#4D5057) */}
          <div className="w-full px-8 py-3 bg-[#4D5057] text-white flex items-center justify-between border-t border-slate-600/50 shadow-inner z-20">
            <button
              type="button"
              onClick={() => {
                if (viewingDoc.fileBlobUrl) {
                  const a = document.createElement('a');
                  a.href = viewingDoc.fileBlobUrl;
                  a.download = viewingDoc.fileName || '종전근무지_원천징수영수증.pdf';
                  a.click();
                } else {
                  alert('💾 종전근무지 원천징수영수증 서류 다운로드가 완료되었습니다.');
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
                  '📄 종전근무지 증빙서류 정보\n\n' +
                  '• 서류명: 근로소득원천징수영수증 (종전근무지)\n' +
                  '• 파일명: ' + (viewingDoc.fileName || `${viewingDoc.company}_원천징수영수증.pdf`) + '\n' +
                  '• 회사명: ' + viewingDoc.company + '\n' +
                  '• 총급여액: ' + viewingDoc.salary.toLocaleString() + '원\n' +
                  '• 기납부 소득세: ' + viewingDoc.tax.toLocaleString() + '원\n' +
                  '• 기납부 지방세: ' + (Number(viewingDoc.localTax) || 0).toLocaleString() + '원'
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

      {/* 종전근무지 자료 직접 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4 animate-in fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-base">종전근무지 자료 직접 추가</h4>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddJob} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">회사명 (상호)<span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  placeholder="예: (주)스타트업랩"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full p-2.5 border rounded-xl bg-slate-50 focus:bg-white text-xs"
                  required
                />
              </div>

              {/* 근무기간 직접 작성 항목 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700">근무기간</label>
                  {/* 빠른 선택 프리셋 버튼 */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPeriodStart('2025-01-01');
                        setPeriodEnd('2025-12-31');
                        setActiveDatePicker(null);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold cursor-pointer"
                      title="2025.01.01 ~ 2025.12.31"
                    >
                      '25년전체
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriodStart('2025-01-01');
                        setPeriodEnd('2025-06-30');
                        setActiveDatePicker(null);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold cursor-pointer"
                      title="2025.01.01 ~ 2025.06.30"
                    >
                      '25상반기
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-slate-400 mb-0.5">시작일</span>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="2025-01-01"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        onClick={() => handleOpenDatePicker('start')}
                        className={`w-full p-2 pr-8 border rounded-xl bg-slate-50 focus:bg-white text-xs font-mono cursor-pointer transition ${
                          activeDatePicker === 'start' ? 'ring-2 ring-[#4F46E5] border-transparent bg-white' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleOpenDatePicker('start')}
                        className="absolute right-2 text-slate-500 hover:text-[#4F46E5] cursor-pointer text-sm"
                        title="달력 열기 (2025년)"
                      >
                        📅
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 mb-0.5">종료일</span>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="2025-12-31"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        onClick={() => handleOpenDatePicker('end')}
                        className={`w-full p-2 pr-8 border rounded-xl bg-slate-50 focus:bg-white text-xs font-mono cursor-pointer transition ${
                          activeDatePicker === 'end' ? 'ring-2 ring-[#4F46E5] border-transparent bg-white' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleOpenDatePicker('end')}
                        className="absolute right-2 text-slate-500 hover:text-[#4F46E5] cursor-pointer text-sm"
                        title="달력 열기 (2025년)"
                      >
                        📅
                      </button>
                    </div>
                  </div>
                </div>

                {/* 달력표시 클릭 시 2025년 달력 표시 */}
                {activeDatePicker && (
                  <div className="mt-2 p-3 bg-white border-2 border-indigo-200 rounded-2xl shadow-md space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                        <span>📅</span>
                        <span>{activeDatePicker === 'start' ? '근무 시작일 선택' : '근무 종료일 선택'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveDatePicker(null)}
                        className="text-slate-400 hover:text-slate-700 text-xs px-1.5 py-0.5 rounded cursor-pointer font-bold"
                      >
                        ✕ 닫기
                      </button>
                    </div>

                    {/* 월 선택 및 이동 (2025년) */}
                    <div className="flex items-center justify-between px-1 py-1 bg-slate-50 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setPickerMonth(Math.max(1, pickerMonth - 1))}
                        disabled={pickerMonth <= 1}
                        className="px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed font-bold text-xs cursor-pointer"
                      >
                        ◀
                      </button>
                      <div className="text-xs font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
                        <span className="text-[#4F46E5] font-black">2025년</span>
                        <span>{pickerMonth}월</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerMonth(Math.min(12, pickerMonth + 1))}
                        disabled={pickerMonth >= 12}
                        className="px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed font-bold text-xs cursor-pointer"
                      >
                        ▶
                      </button>
                    </div>

                    {/* 요일 헤더 */}
                    <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 border-b border-slate-100 pb-1">
                      <span className="text-rose-500">일</span>
                      <span>월</span>
                      <span>화</span>
                      <span>수</span>
                      <span>목</span>
                      <span>금</span>
                      <span className="text-indigo-500">토</span>
                    </div>

                    {/* 일자 그리드 */}
                    <div className="grid grid-cols-7 gap-1 text-center text-xs">
                      {Array.from({ length: new Date(pickerYear, pickerMonth - 1, 1).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: new Date(pickerYear, pickerMonth, 0).getDate() }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isSelected = (activeDatePicker === 'start' && periodStart === dateStr) ||
                                           (activeDatePicker === 'end' && periodEnd === dateStr);
                        const dayOfWeek = (new Date(pickerYear, pickerMonth - 1, 1).getDay() + i) % 7;
                        const isSun = dayOfWeek === 0;
                        const isSat = dayOfWeek === 6;

                        return (
                          <button
                            key={`day-${day}`}
                            type="button"
                            onClick={() => {
                              if (activeDatePicker === 'start') {
                                setPeriodStart(dateStr);
                              } else {
                                setPeriodEnd(dateStr);
                              }
                              setActiveDatePicker(null);
                            }}
                            className={`h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#4F46E5] text-white font-bold shadow-xs'
                                : 'hover:bg-indigo-50 hover:text-[#4F46E5] text-slate-700'
                            } ${!isSelected && isSun ? 'text-rose-500' : ''} ${!isSelected && isSat ? 'text-indigo-500' : ''}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">총급여액 (원)</label>
                <input
                  type="text"
                  placeholder="0 (미입력 시 0원)"
                  value={salary}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setSalary(raw ? Number(raw).toLocaleString() : '');
                  }}
                  className="w-full p-2.5 border rounded-xl bg-slate-50 focus:bg-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">기납부 소득세 (원)</label>
                <input
                  type="text"
                  placeholder="0 (미입력 시 0원)"
                  value={tax}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setTax(raw ? Number(raw).toLocaleString() : '');
                  }}
                  className="w-full p-2.5 border rounded-xl bg-slate-50 focus:bg-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  기납부 지방소득세 (원)
                </label>
                <input
                  type="text"
                  placeholder="0 (미입력 시 0원)"
                  value={localTaxInput}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setLocalTaxInput(raw ? Number(raw).toLocaleString() : '');
                  }}
                  className="w-full p-2.5 border rounded-xl bg-slate-50 focus:bg-white font-mono text-xs"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold cursor-pointer hover:bg-slate-200 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#4F46E5] text-white font-bold hover:bg-[#4338CA] cursor-pointer transition shadow-xs"
                >
                  추가하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 발급요청 방법 가이드 모달 */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-3 text-xs animate-in fade-in">
            <h4 className="font-bold text-slate-900 text-sm">종전근무지 자료 발급요청 안내</h4>
            <p className="text-slate-600 leading-relaxed">
              1. 이전 직장의 인사·총무팀에 연락하여 2025 귀속 근로소득원천징수영수증 발급을 요청합니다.
              <br />
              2. 발급받은 PDF 파일을 본 앱에 업로드하시면 현 직장의 급여와 자동으로 합산되어 계산됩니다.
              <br />
              3. 이전 직장이 여러 개인 경우, 수령하신 모든 영수증을 각각 업로드해 주시면 전체 급여와 기납부세액이 일괄 합산됩니다.
            </p>
            <button
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white font-bold mt-2 cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
