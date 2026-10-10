/**
 * fileValidation.js
 * 업로드 파일 확장자, Content-Type, 파일 크기(20MB) 검증 유틸리티
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * 단일 PDF 파일 유효성 검증
 * - 확장자: .pdf (대소문자 무관)
 * - Content-Type: application/pdf (브라우저 환경에 따라 빈 문자열일 수 있어 .pdf 확장자와 병행 검증)
 * - 크기: 20MB 이하
 * 
 * 위반 시 요구사항에 맞춘 알림창 안내 후 false 반환
 * @param {File} file
 * @returns {boolean}
 */
export function validatePdfFile(file) {
  if (!file) return false;

  // 1. 확장자 및 Content-Type 검증
  const isPdf =
    file.name.toLowerCase().endsWith('.pdf') &&
    (!file.type || file.type === 'application/pdf');

  if (!isPdf) {
    alert('PDF 파일만 업로드할 수 있습니다.');
    return false;
  }

  // 2. 파일 크기 20MB 이하 제한 체크
  if (file.size > MAX_FILE_SIZE) {
    alert('파일 크기는 20MB를 초과할 수 없습니다.');
    return false;
  }

  return true;
}

/**
 * 다중 PDF 파일 목록 일괄 검증
 * @param {FileList|File[]} files
 * @returns {boolean}
 */
export function validatePdfFiles(files) {
  if (!files || files.length === 0) return false;
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    if (!validatePdfFile(file)) {
      return false;
    }
  }
  return true;
}
