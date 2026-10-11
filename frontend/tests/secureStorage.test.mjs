// 실행: node tests/secureStorage.test.mjs  (2-E 로컬 저장 AES-GCM 암호화 검증, IndexedDB 없는 환경의 대체 키 경로)
// 브라우저 Storage를 흉내 내 AES-GCM 투명 암호화 동작 확인
class Storage { constructor(){ Object.defineProperty(this,'_m',{value:new Map()}) }
  getItem(k){ return this._m.has(String(k)) ? this._m.get(String(k)) : null }
  setItem(k,v){ this._m.set(String(k), String(v)) }
  removeItem(k){ this._m.delete(String(k)) }
  clear(){ this._m.clear() }
  key(i){ return [...this._m.keys()][i] ?? null }
  get length(){ return this._m.size } }
globalThis.Storage = Storage;
globalThis.localStorage = new Storage(); globalThis.sessionStorage = new Storage();
const rawGet = (k, s = localStorage) => s._m.get(k);
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
const path = new URL('../src/utils/secureStorage.js', import.meta.url).href;

// 이전 버전 자료: 평문 공제자료, v1 난독화 가족목록, 비민감 키
const legacyKey = new TextEncoder().encode('SelfTax_2025_Secure_Storage_Key!@#$');
const v1 = (obj) => { const b = new TextEncoder().encode(JSON.stringify(obj)); const o = new Uint8Array(b.length);
  for (let i=0;i<b.length;i++) o[i] = b[i] ^ legacyKey[i % legacyKey.length] ^ ((i*17)&0xff);
  return '_sec_v1_' + Buffer.from(o).toString('base64'); };
localStorage.setItem('selftax_deduction_data', JSON.stringify({ medical: 1234567 }));
localStorage.setItem('selftax_family_list', v1([{ name: '홍길동', rrn: '900101-*******' }]));
localStorage.setItem('selftax_bgm_volume', '0.5');
sessionStorage.setItem('selftax_session_backup_u1', JSON.stringify({ a: '급여 5000만' }));

let m = await import(path + '?a');
const r = await m.initSecureStorage();
await m.flushSecureStorage();
ok(r.encrypted && r.migrated === 3, `기존 자료 3건 이전 (migrated=${r.migrated})`);
ok(rawGet('selftax_deduction_data').startsWith('_sec_v2_') && !rawGet('selftax_deduction_data').includes('1234567'), '평문 공제자료 → AES-GCM 암호문');
ok(rawGet('selftax_family_list').startsWith('_sec_v2_'), 'v1 난독화 → v2');
ok(rawGet('selftax_session_backup_u1', sessionStorage).startsWith('_sec_v2_'), 'sessionStorage 백업도 암호화');
ok(rawGet('selftax_bgm_volume') === '0.5', '비민감 키는 평문 유지');
ok(JSON.parse(localStorage.getItem('selftax_deduction_data')).medical === 1234567, '기존 코드의 localStorage.getItem 으로 복호화된 값 조회');
ok(m.getSecureItem('selftax_family_list')[0].name === '홍길동', 'getSecureItem 복호화');

m.setSecureItem('selftax_withholding_data', { totalSalary: 71500000, rrn: '900101-1234567' });
ok(m.getSecureItem('selftax_withholding_data').totalSalary === 71500000, '저장 직후 조회 (암호화 대기 중)');
await m.flushSecureStorage();
const c = rawGet('selftax_withholding_data');
ok(c.startsWith('_sec_v2_') && !c.includes('71500000'), '새 자료 암호화 저장');
ok(m.getSecureItem('selftax_withholding_data').rrn === '900101-*******', '주민번호 뒷자리 마스킹 유지');
const c2 = (m.setSecureItem('selftax_withholding_data', { totalSalary: 71500000, rrn: '900101-1234567' }), await m.flushSecureStorage(), rawGet('selftax_withholding_data'));
ok(c2 !== c, '같은 값도 매번 다른 IV로 암호화');

localStorage.removeItem('selftax_withholding_data');
ok(localStorage.getItem('selftax_withholding_data') === null, '삭제 반영');

// 위·변조 감지: 암호문 한 글자 변조 → 새로 시작할 때 복호화 실패로 제거
const tampered = rawGet('selftax_deduction_data').replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
localStorage._m.set('selftax_ai_report_data', tampered);

// "새로고침": 모듈 다시 로드 (대체 키 보관 방식이라 같은 키로 복호화 가능해야 함)
m.uninstallEncryptedStorage();
m = await import(path + '?b');
const r2 = await m.initSecureStorage();
ok(JSON.parse(localStorage.getItem('selftax_deduction_data')).medical === 1234567, '새로고침 후에도 복호화');
ok(r2.unreadable === 1 && localStorage.getItem('selftax_ai_report_data') === null, '변조된 암호문은 거부·정리');
m.uninstallEncryptedStorage();
console.log('ALL PASS');
