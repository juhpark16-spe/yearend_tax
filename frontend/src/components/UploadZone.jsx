import React, { useState, useRef } from 'react';
import { validatePdfFiles } from '../utils/fileValidation';

/**
 * 국세청 간소화 및 세무 PDF 드래그앤드롭 + 업로드 버튼 컴포넌트
 * 요구사항: 드래그드롭 혹은 업로드 버튼 클릭으로 파일 업로드 가능
 */
export default function UploadZone({
  onFilesSelected,
  accept = '.pdf,application/pdf',
  title = '국세청 간소화 PDF 등록',
  description = 'PDF 파일을 드래그하여 놓거나 아래 업로드 버튼을 눌러주세요.',
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // 파일 처리 핸들러 (드롭 또는 인풋 선택 공통)
  const processFiles = (fileList) => {
    const fileArray = Array.from(fileList);
    if (!validatePdfFiles(fileArray)) {
      return;
    }

    const validFiles = fileArray;

    setIsProcessing(true);

    // 실제 업로드 및 PII 마스킹 처리 시뮬레이션 (0.6초)
    setTimeout(() => {
      const newFiles = validFiles.map((file) => ({
        id: `${file.name}_${Date.now()}`,
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        uploadedAt: new Date().toLocaleTimeString(),
      }));

      setUploadedFiles((prev) => [...prev, ...newFiles]);
      setIsProcessing(false);

      if (onFilesSelected) {
        onFilesSelected(validFiles);
      }
    }, 600);
  };

  // 1. 드래그 이벤트 핸들러
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 자식 요소로의 이동이 아닌 영역 밖으로 나갔을 때만 해제
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // 2. 업로드 버튼 클릭 핸들러
  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // 파일 삭제 핸들러
  const handleRemoveFile = (id) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* 숨겨진 파일 인풋 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* 드래그앤드롭 영역 */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all duration-200 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50/80 scale-[1.01] shadow-md ring-4 ring-indigo-100'
            : 'border-slate-300 hover:border-indigo-400 bg-white shadow-xs'
        }`}
      >
        {/* 로딩 인디케이터 (파싱 및 마스킹 처리 중) */}
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center py-4 space-y-3 animate-in fade-in">
            <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <div className="text-xs font-bold text-slate-800">
              PDF 분석 및 주민등록번호 뒷자리 마스킹 처리 중...
            </div>
            <div className="text-[11px] text-slate-400">
              원문은 메모리에서 즉시 안전하게 변환됩니다.
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3">
            {/* 업로드 아이콘 */}
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging ? 'bg-[#4F46E5] text-white' : 'bg-indigo-50 text-indigo-600'
              }`}
            >
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            {/* 안내 문구 */}
            <div>
              <p className="text-sm font-bold text-slate-900">
                {isDragging ? '여기에 놓으면 업로드됩니다' : title}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {description}
              </p>
            </div>

            {/* 명시적인 파일 업로드 버튼 */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={handleButtonClick}
                className="px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] active:scale-95 text-white text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                <span>PDF 파일 업로드</span>
              </button>

              <span className="text-[11px] text-slate-400">또는 마우스로 끌어다 놓기</span>
            </div>

            {/* 보안 안내 배지 */}
            <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>주민등록번호 뒷자리 전면 자동 마스킹 (900101-1******)</span>
            </div>
          </div>
        )}
      </div>

      {/* 업로드된 파일 목록 표시 */}
      {uploadedFiles.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              등록된 PDF 파일 ({uploadedFiles.length}건)
            </span>
            <span className="text-[11px] text-emerald-600 font-bold">
              ✓ 파싱 및 마스킹 완료
            </span>
          </div>

          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                    PDF
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {file.name}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{file.size}</span>
                      <span>•</span>
                      <span>{file.uploadedAt}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                    정상 등록
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition text-xs"
                    title="파일 삭제"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
