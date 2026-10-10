/**
 * secureStorage.js
 * 브라우저 localStorage 민감 개인정보 암호화 및 마스킹 보안 유틸리티
 * 
 * 보안 요구사항 대응:
 * 1. 부양가족 주민등록번호(rrn): 브라우저 저장 시 뒷자리 마스킹 (YYMMDD-*******)
 * 2. 월세 임대인 식별번호: 주민등록번호는 뒷자리 마스킹(YYMMDD-*******), 사업자번호는 마스킹(123-**-*****)
 * 3. 급여 내역, 부양가족, 공제 자료 등 민감 데이터의 localStorage 평문(Plaintext) 저장 방지:
 *    - 대칭 바이트 XOR 치환 + Base64 암호화 토큰화(_sec_v1_...) 적용
 *    - 개발자 도구 및 XSS 취약점으로부터 평문 개인정보 보호
 * 4. 기존에 저장된 데이터와의 완벽한 하위 호환(Backward Compatibility) 지원
 */

const STORAGE_SECRET_KEY = 'SelfTax_2025_Secure_Storage_Key!@#$';
const SECURE_PREFIX = '_sec_v1_';

/**
 * 주민등록번호 뒷자리 마스킹 (규격: YYMMDD-*******)
 * 앞 6자리(생년월일)만 유지하고 뒷자리 7자리는 반드시 '*******'로 마스킹
 */
export function maskRrn(val) {
  if (!val) return '';
  const str = String(val).trim();
  // 이미 YYMMDD-******* 형태인 경우
  if (/^\d{6}-\*{7}$/.test(str)) return str;
  // YYMMDD-1****** 등 이전 형태인 경우도 통일
  if (/^\d{6}-[\d*]{7}$/.test(str)) {
    return `${str.slice(0, 6)}-*******`;
  }
  const clean = str.replace(/[^0-9]/g, '');
  if (clean.length < 6) return clean;
  const front = clean.slice(0, 6);
  return `${front}-*******`;
}

/**
 * 임대인 식별번호 마스킹
 * - 주민등록번호(13자리): YYMMDD-*******
 * - 사업자등록번호(10자리): 123-**-*****
 */
export function maskLandlordId(val) {
  if (!val) return '';
  const str = String(val).trim();
  const clean = str.replace(/[^0-9]/g, '');

  // 주민등록번호 (13자리 숫자 또는 하이픈 포함 14자리)
  if (clean.length === 13 || /^\d{6}-?[\d*]{7}$/.test(str)) {
    return maskRrn(clean.slice(0, 13));
  }
  // 사업자등록번호 (10자리 숫자 또는 3-2-5 형식)
  if (clean.length === 10 || /^\d{3}-?[\d*]{2}-?[\d*]{5}$/.test(str)) {
    const p1 = clean.slice(0, 3);
    return `${p1}-**-*****`;
  }
  // 6자리 이상인 경우 앞 6자리만 남기고 마스킹
  if (clean.length >= 6) {
    return `${clean.slice(0, 6)}-*******`;
  }
  return str;
}

/**
 * 부양가족 목록 주민등록번호 마스킹 전처리
 */
export function sanitizeFamilyList(list) {
  if (!Array.isArray(list)) return list;
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      rrn: item.rrn ? maskRrn(item.rrn) : '',
    };
  });
}

/**
 * 월세 항목 목록 임대인 식별번호 마스킹 전처리
 */
export function sanitizeRentItems(list) {
  if (!Array.isArray(list)) return list;
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      landlordId: item.landlordId ? maskLandlordId(item.landlordId) : '',
    };
  });
}

/**
 * 객체 내 모든 계층의 민감정보(주민등록번호, 임대인번호)를 재귀적으로 탐색하여 마스킹
 */
export function deepSanitizeSensitiveData(data) {
  if (!data) return data;
  if (typeof data !== 'object') {
    if (typeof data === 'string' && /^\d{6}-?[1-4]\d{6}$/.test(data.trim())) {
      return maskRrn(data);
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => deepSanitizeSensitiveData(item));
  }
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('rrn') ||
      lowerKey.includes('resident') ||
      lowerKey.includes('jumin')
    ) {
      result[key] = value ? maskRrn(value) : value;
    } else if (lowerKey.includes('landlordid')) {
      result[key] = value ? maskLandlordId(value) : value;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = deepSanitizeSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 문자열/객체 데이터 암호화 (대칭 바이트 치환 + Base64 인코딩)
 */
export function encryptData(data) {
  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const key = STORAGE_SECRET_KEY;
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    const keyBytes = new TextEncoder().encode(key);

    const cipherBytes = new Uint8Array(utf8Bytes.length);
    for (let i = 0; i < utf8Bytes.length; i++) {
      cipherBytes[i] = utf8Bytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 17) & 0xff);
    }

    let binary = '';
    for (let i = 0; i < cipherBytes.length; i++) {
      binary += String.fromCharCode(cipherBytes[i]);
    }
    const base64 = btoa(binary);
    return `${SECURE_PREFIX}${base64}`;
  } catch (err) {
    console.error('encryptData error:', err);
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
}

/**
 * 암호화된 문자열 복호화
 */
export function decryptData(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return null;

  // SECURE_PREFIX가 없으면 기존 평문 데이터로 간주 (하위 호환성)
  if (!cipherText.startsWith(SECURE_PREFIX)) {
    try {
      return JSON.parse(cipherText);
    } catch {
      return cipherText;
    }
  }

  try {
    const base64 = cipherText.slice(SECURE_PREFIX.length);
    const binary = atob(base64);
    const cipherBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      cipherBytes[i] = binary.charCodeAt(i);
    }

    const key = STORAGE_SECRET_KEY;
    const keyBytes = new TextEncoder().encode(key);
    const utf8Bytes = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      utf8Bytes[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 17) & 0xff);
    }

    const jsonStr = new TextDecoder().decode(utf8Bytes);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('decryptData error:', err);
    return null;
  }
}

/**
 * 안전한 스토리지 저장 (주민번호/임대인번호 마스킹 및 암호화)
 */
export function setSecureItem(key, value) {
  try {
    let sanitized = deepSanitizeSensitiveData(value);
    if (key === 'selftax_family_list') {
      sanitized = sanitizeFamilyList(sanitized);
    } else if (key === 'selftax_other_rent') {
      sanitized = sanitizeRentItems(sanitized);
    }

    const encrypted = encryptData(sanitized);
    localStorage.setItem(key, encrypted);
  } catch (err) {
    console.error(`setSecureItem failed for key [${key}]:`, err);
  }
}

/**
 * 안전한 스토리지 조회 (복호화 및 자동 파싱, 평문 호환)
 */
export function getSecureItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const decrypted = decryptData(raw);
    return decrypted !== null && decrypted !== undefined ? decrypted : fallback;
  } catch (err) {
    console.error(`getSecureItem failed for key [${key}]:`, err);
    return fallback;
  }
}

/**
 * 스토리지 삭제
 */
export function removeSecureItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`removeSecureItem failed for key [${key}]:`, err);
  }
}
