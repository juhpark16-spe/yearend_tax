/**
 * secureStorage.js
 * 브라우저 저장소(localStorage·sessionStorage) 민감 자료 암호화 및 개인정보 마스킹 유틸리티
 *
 * 2-E 로컬 저장 실제 암호화:
 * 1. 암호화 방식: Web Crypto AES-GCM 256비트 (자료마다 임의 IV 12바이트, 위·변조 검증 포함)
 *    저장 형식: `_sec_v2_<IV base64>.<암호문 base64>`
 * 2. 키 보관: 브라우저에서 꺼낼 수 없는(non-extractable) CryptoKey를 IndexedDB에 보관한다.
 *    소스 코드나 localStorage에 키가 없으므로 저장소 내용만 복사해서는 복호화할 수 없다.
 *    (IndexedDB를 쓸 수 없는 환경에서만 예외적으로 키를 localStorage에 두며, 콘솔에 경고한다)
 * 3. 적용 범위: 급여·부양가족·공제·국세청 PDF 추출 자료·AI 리포트·사용자별 백업 번들 등
 *    민감 키(isSensitiveStorageKey)는 기존 코드가 localStorage.getItem/setItem을 그대로 써도
 *    저장 시 자동 암호화, 조회 시 자동 복호화된다(앱 시작 시 initSecureStorage가 복호화해 메모리에 보관).
 * 4. 기존 자료 이전: 평문 JSON과 이전 형식(_sec_v1_, 고정 키 XOR 난독화)은 앱 시작 시 v2로 다시 암호화한다.
 * 5. 한계: 같은 페이지에서 실행되는 스크립트(XSS)는 복호화된 값을 읽을 수 있으므로,
 *    주민등록번호 뒷자리·임대인 번호는 저장 전에 계속 마스킹한다.
 */

const SECURE_PREFIX = '_sec_v2_';
const LEGACY_V1_PREFIX = '_sec_v1_';
// 이전 버전(v1) 난독화 자료를 읽어 v2로 옮길 때만 사용 (새 자료 암호화에는 쓰지 않음)
const LEGACY_V1_KEY = 'SelfTax_2025_Secure_Storage_Key!@#$';
const KEY_DB_NAME = 'selftax-secure';
const KEY_STORE = 'keys';
const KEY_ID = 'storage-aes-gcm-v2';
const FALLBACK_KEY_STORAGE = '_selftax_storage_key_fallback';

const SENSITIVE_EXACT = new Set([
  'hometax_extracted_data',
  'selftax_family_list',
  'selftax_withholding_data',
  'selftax_previous_jobs',
  'selftax_deduction_data',
  'selftax_ai_report_data',
  'selftax_donation_carryover',
  'selftax_previous_year_data',
  'selftax_demo_user',
]);
const SENSITIVE_PREFIXES = ['selftax_other_', 'selftax_user_bundle_', 'selftax_session_backup'];

/** 자동 암호화 대상 키인지 */
export function isSensitiveStorageKey(key) {
  const k = String(key || '');
  if (SENSITIVE_EXACT.has(k)) return true;
  if (SENSITIVE_PREFIXES.some((p) => k.startsWith(p))) return true;
  return k.startsWith('selftax_') && k.endsWith('_checklist');
}

// ---------------------------------------------------------------------------
// 암호화 기본 함수
// ---------------------------------------------------------------------------
const toB64 = (bytes) => {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

async function encryptString(key, plain) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return `${SECURE_PREFIX}${toB64(iv)}.${toB64(ct)}`;
}

async function decryptString(key, raw) {
  const [ivB64, ctB64] = raw.slice(SECURE_PREFIX.length).split('.');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return new TextDecoder().decode(pt);
}

/** 이전 형식(_sec_v1_: 고정 키 XOR) 해독 — 이전 전용 */
function decodeLegacyV1(raw) {
  try {
    const bytes = fromB64(raw.slice(LEGACY_V1_PREFIX.length));
    const keyBytes = new TextEncoder().encode(LEGACY_V1_KEY);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 17) & 0xff);
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 키 보관 (IndexedDB, non-extractable)
// ---------------------------------------------------------------------------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(KEY_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(KEY_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbRequest(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, mode);
    const req = fn(tx.objectStore(KEY_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadOrCreateKey() {
  const algo = { name: 'AES-GCM', length: 256 };
  if (globalThis.indexedDB) {
    try {
      const db = await idbOpen();
      let key = await idbRequest(db, 'readonly', (st) => st.get(KEY_ID));
      if (!key) {
        key = await subtle().generateKey(algo, false, ['encrypt', 'decrypt']);
        await idbRequest(db, 'readwrite', (st) => st.put(key, KEY_ID));
      }
      db.close();
      return key;
    } catch (err) {
      console.warn('[secureStorage] IndexedDB 키 보관을 사용할 수 없어 대체 방식으로 진행합니다.', err);
    }
  }
  // 대체: IndexedDB 불가 환경(일부 사생활 보호 모드 등) — 키를 저장소에 두므로 보호 수준이 낮다
  console.warn('[secureStorage] 암호화 키를 브라우저 저장소에 보관합니다 (IndexedDB 미지원).');
  const saved = native.get ? native.get.call(globalThis.localStorage, FALLBACK_KEY_STORAGE) : null;
  if (saved) return subtle().importKey('raw', fromB64(saved), algo, false, ['encrypt', 'decrypt']);
  const key = await subtle().generateKey(algo, true, ['encrypt', 'decrypt']);
  const rawKey = await subtle().exportKey('raw', key);
  native.set.call(globalThis.localStorage, FALLBACK_KEY_STORAGE, toB64(rawKey));
  return subtle().importKey('raw', rawKey, algo, false, ['encrypt', 'decrypt']);
}

// ---------------------------------------------------------------------------
// 투명 암호화 계층: 민감 키는 Storage.getItem/setItem/removeItem 에서 자동 처리
// ---------------------------------------------------------------------------
const native = {};
const cache = new Map(); // `${area}:${key}` -> { plain, cipher, version, pending }
let cryptoKey = null;
let installed = false;
let initPromise = null;

const areaOf = (storage) => {
  if (typeof globalThis.localStorage !== 'undefined' && storage === globalThis.localStorage) return 'local';
  if (typeof globalThis.sessionStorage !== 'undefined' && storage === globalThis.sessionStorage) return 'session';
  return null;
};

function persistEncrypted(storage, key, id, entry) {
  if (!cryptoKey) return; // 키 준비 전 기록은 initSecureStorage 완료 시 일괄 암호화
  encryptString(cryptoKey, entry.plain)
    .then((cipher) => {
      const cur = cache.get(id);
      if (!cur || cur.version !== entry.version) return; // 그 사이 더 새 값으로 바뀌었거나 삭제됨
      native.set.call(storage, key, cipher);
      cur.cipher = cipher;
      cur.pending = false;
    })
    .catch((err) => console.error(`[secureStorage] 암호화 저장 실패 [${key}]`, err));
}

function writeSensitive(storage, area, key, value) {
  const id = `${area}:${key}`;
  const prev = cache.get(id);
  const entry = { plain: String(value), cipher: prev ? prev.cipher : null, version: (prev ? prev.version : 0) + 1, pending: true };
  cache.set(id, entry);
  persistEncrypted(storage, key, id, entry);
}

function refreshFromCipher(storage, area, key, raw) {
  if (!cryptoKey) return;
  decryptString(cryptoKey, raw)
    .then((plain) => {
      const id = `${area}:${key}`;
      const cur = cache.get(id);
      if (cur && cur.pending) return;
      if (native.get.call(storage, key) !== raw) return;
      cache.set(id, { plain, cipher: raw, version: (cur ? cur.version : 0) + 1, pending: false });
    })
    .catch(() => {});
}

function readSensitive(storage, area, key) {
  const id = `${area}:${key}`;
  const entry = cache.get(id);
  if (entry && entry.pending) return entry.plain;
  const raw = native.get.call(storage, key);
  if (raw === null || raw === undefined) {
    cache.delete(id);
    return null;
  }
  if (entry && entry.cipher === raw) return entry.plain;
  if (raw.startsWith(SECURE_PREFIX)) {
    // 다른 탭이 방금 바꾼 값 등 아직 복호화하지 못한 경우: 비동기로 갱신하고 기존 값 유지
    refreshFromCipher(storage, area, key, raw);
    return entry ? entry.plain : null;
  }
  // 평문 또는 v1 형식 → 값 그대로 돌려주고 v2로 다시 저장
  const plain = raw.startsWith(LEGACY_V1_PREFIX) ? decodeLegacyV1(raw) : raw;
  if (plain === null) return null;
  if (isSensitiveStorageKey(key)) writeSensitive(storage, area, key, plain);
  return plain;
}

/** Storage.prototype 의 getItem/setItem/removeItem/clear 를 감싸 민감 키를 투명하게 암·복호화 */
export function installEncryptedStorage() {
  if (installed || typeof globalThis.Storage === 'undefined') return;
  const proto = globalThis.Storage.prototype;
  native.get = proto.getItem;
  native.set = proto.setItem;
  native.remove = proto.removeItem;
  native.clear = proto.clear;
  proto.getItem = function getItem(key) {
    const area = areaOf(this);
    if (area) {
      if (isSensitiveStorageKey(key)) return readSensitive(this, area, String(key));
      const raw = native.get.call(this, key);
      if (typeof raw === 'string' && (raw.startsWith(SECURE_PREFIX) || raw.startsWith(LEGACY_V1_PREFIX))) {
        return readSensitive(this, area, String(key));
      }
      return raw;
    }
    return native.get.call(this, key);
  };
  proto.setItem = function setItem(key, value) {
    const area = areaOf(this);
    if (area && isSensitiveStorageKey(key)) return writeSensitive(this, area, String(key), value);
    return native.set.call(this, key, value);
  };
  proto.removeItem = function removeItem(key) {
    const area = areaOf(this);
    if (area) cache.delete(`${area}:${key}`);
    return native.remove.call(this, key);
  };
  proto.clear = function clear() {
    const area = areaOf(this);
    if (area) [...cache.keys()].filter((id) => id.startsWith(`${area}:`)).forEach((id) => cache.delete(id));
    return native.clear.call(this);
  };
  installed = true;
}

/** 테스트용: 원래 Storage 동작으로 되돌리고 상태 초기화 */
export function uninstallEncryptedStorage() {
  if (!installed) return;
  const proto = globalThis.Storage.prototype;
  proto.getItem = native.get;
  proto.setItem = native.set;
  proto.removeItem = native.remove;
  proto.clear = native.clear;
  cache.clear();
  cryptoKey = null;
  installed = false;
  initPromise = null;
}

/**
 * 앱 시작 시 1회 호출 (main.jsx에서 렌더링 전에 await)
 * - 암호화 키 준비 → 저장된 v2 자료 복호화(메모리 보관) → 평문·v1 자료를 v2로 이전 → 대기 중 기록 암호화
 */
export function initSecureStorage() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    installEncryptedStorage();
    if (!installed || !subtle()) {
      console.warn('[secureStorage] Web Crypto를 사용할 수 없어 암호화 없이 동작합니다.');
      return { encrypted: false };
    }
    cryptoKey = await loadOrCreateKey();
    let migrated = 0;
    let unreadable = 0;
    for (const [area, storage] of [['local', globalThis.localStorage], ['session', globalThis.sessionStorage]]) {
      if (!storage) continue;
      const keys = [];
      for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
      for (const key of keys) {
        if (!key || key === FALLBACK_KEY_STORAGE) continue;
        const raw = native.get.call(storage, key);
        if (typeof raw !== 'string') continue;
        const id = `${area}:${key}`;
        if (raw.startsWith(SECURE_PREFIX)) {
          try {
            const plain = await decryptString(cryptoKey, raw);
            const cur = cache.get(id);
            if (!cur || !cur.pending) cache.set(id, { plain, cipher: raw, version: (cur ? cur.version : 0) + 1, pending: false });
          } catch {
            // 키가 바뀌어(브라우저 데이터 일부 삭제 등) 복호화할 수 없는 자료는 제거
            native.remove.call(storage, key);
            unreadable += 1;
          }
        } else if (isSensitiveStorageKey(key) || raw.startsWith(LEGACY_V1_PREFIX)) {
          const plain = raw.startsWith(LEGACY_V1_PREFIX) ? decodeLegacyV1(raw) : raw;
          if (plain !== null && !(cache.get(id) || {}).pending) {
            writeSensitive(storage, area, key, plain);
            migrated += 1;
          }
        }
      }
    }
    // 키 준비 전에 기록된 값 암호화 저장
    for (const [id, entry] of cache.entries()) {
      if (!entry.pending) continue;
      const [area, ...rest] = id.split(':');
      const storage = area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
      persistEncrypted(storage, rest.join(':'), id, entry);
    }
    // 다른 탭에서 바꾼 암호화 자료 반영
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('storage', (ev) => {
        if (!ev.key || typeof ev.newValue !== 'string' || !ev.newValue.startsWith(SECURE_PREFIX)) return;
        const area = areaOf(ev.storageArea);
        if (area) refreshFromCipher(ev.storageArea, area, ev.key, ev.newValue);
      });
    }
    if (unreadable) console.warn(`[secureStorage] 복호화할 수 없는 자료 ${unreadable}건을 정리했습니다.`);
    return { encrypted: true, migrated, unreadable };
  })();
  return initPromise;
}

/** 대기 중인 암호화 저장이 모두 끝날 때까지 기다림 (테스트·종료 직전용) */
export async function flushSecureStorage() {
  for (let i = 0; i < 50 && [...cache.values()].some((e) => e.pending); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

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
    // 민감 키는 저장소 계층에서 AES-GCM으로 암호화되어 기록된다
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch (err) {
    console.error(`setSecureItem failed for key [${key}]:`, err);
  }
}

/**
 * 안전한 스토리지 조회 (복호화 및 자동 파싱, 평문 호환)
 */
export function getSecureItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key); // 민감 키는 복호화된 값
    if (raw === null || raw === undefined || raw === '') return fallback;
    let value = raw;
    if (raw.startsWith(LEGACY_V1_PREFIX)) value = decodeLegacyV1(raw);
    try {
      value = JSON.parse(value);
    } catch {
      /* JSON이 아닌 문자열은 그대로 */
    }
    return value !== null && value !== undefined ? value : fallback;
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
