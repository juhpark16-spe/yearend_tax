import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const DEMO_USER_STORAGE_KEY = 'selftax_demo_user';
export const GUEST_TOKEN_STORAGE_KEY = 'selftax_guest_token';
const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 게스트(로그인 없이 둘러보기) 세션 분리
 * - 로그인하지 않은 사용자는 서버가 서명한 게스트 전용 토큰(/auth/guest)을 받아 요청한다.
 *   게스트마다 서버 계정이 따로 생기므로 다른 게스트의 세션·결과·감사로그에 접근할 수 없다.
 * - 토큰은 이 브라우저에만 저장되며, 둘러보기를 끝내거나 창을 닫으면 서버 자료와 함께 폐기한다.
 */
function readGuestToken({ allowExpired = false } = {}) {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_TOKEN_STORAGE_KEY) || 'null');
    if (!g?.guest_token) return null;
    if (allowExpired) return g;
    const left = Date.parse(g.expires_at) - Date.now();
    return Number.isFinite(left) && left > 60 * 1000 ? g : null;
  } catch {
    return null;
  }
}

let guestTokenPromise = null;
export async function ensureGuestToken() {
  const current = readGuestToken();
  if (current) return current;
  if (!guestTokenPromise) {
    guestTokenPromise = axios
      .post(`${API_BASE}/auth/guest`)
      .then((res) => {
        try { localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, JSON.stringify(res.data)); } catch { /* 저장 실패 시 이번 요청만 사용 */ }
        return res.data;
      })
      .finally(() => { guestTokenPromise = null; });
  }
  return guestTokenPromise;
}

/** 게스트 식별 정보를 버리고(다음 요청부터 새 게스트) 서버에 남은 게스트 자료 삭제를 요청한다. */
export function discardGuestIdentity({ deleteServerData = true } = {}) {
  const g = readGuestToken({ allowExpired: true });
  try { localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY); } catch { /* ignore */ }
  if (deleteServerData && g?.guest_token && typeof fetch === 'function') {
    try {
      fetch(`${API_BASE}/auth/guest`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${g.guest_token}` },
        keepalive: true, // 창을 닫는 중에도 요청이 전송되도록
      }).catch(() => {});
    } catch {
      /* 서버 미연결 시 무시 (만료 시 서버에서 자동 정리) */
    }
  }
}

// 종단간 인가(Authorization) 가드를 위한 요청 인터셉터
api.interceptors.request.use(
  async (config) => {
    try {
      let token = null;
      let userId = null;

      // 1. Supabase Auth 세션 확인
      if (isSupabaseConfigured && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          token = session.access_token;
          userId = session.user?.id;
        }
      }

      // 2. Supabase 세션이 없으면 로컬 데모 유저 확인 (개발 환경 전용 데모 로그인)
      if (!userId) {
        const savedDemo = localStorage.getItem(DEMO_USER_STORAGE_KEY);
        if (savedDemo) {
          try {
            const demoUser = JSON.parse(savedDemo);
            userId = demoUser.id;
            token = `demo-token-${demoUser.id}`;
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      if (userId) {
        config.headers['X-User-Id'] = userId;
      } else {
        // 3. 로그인하지 않은 경우: 게스트 전용 토큰 (게스트끼리 자료 공유 방지)
        const guest = await ensureGuestToken();
        if (guest?.guest_token) {
          config.headers['Authorization'] = `Bearer ${guest.guest_token}`;
          config._usedGuestToken = true;
        }
      }
    } catch (err) {
      console.warn('API 인증 헤더 설정 중 오류:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 게스트 토큰이 만료·무효(401)이면 새 게스트 토큰으로 한 번만 다시 시도
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error?.config;
    if (error?.response?.status === 401 && config?._usedGuestToken && !config._guestRetried) {
      config._guestRetried = true;
      discardGuestIdentity({ deleteServerData: false });
      return api(config);
    }
    return Promise.reject(error);
  }
);

export const taxService = {
  // 세션 생성
  createSession: async (data) => {
    const response = await api.post('/tax/sessions', data);
    return response.data;
  },
  // 세션 상태 조회
  getSession: async (sessionId) => {
    const response = await api.get(`/tax/sessions/${sessionId}`);
    return response.data;
  },
  // 문서 업로드
  uploadDocuments: async (formData) => {
    const response = await api.post('/tax/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  // 화면 입력 자료 저장 (근무지·부양가족·공제) — 백엔드 세액 엔진 교차검증용
  saveSessionInputs: async (sessionId, inputs) => {
    const response = await api.put(`/tax/sessions/${sessionId}/inputs`, inputs);
    return response.data;
  },
  // 정산 결과 상세 조회
  getResult: async (sessionId) => {
    const response = await api.get(`/tax/result/${sessionId}`);
    return response.data;
  },
  // 세액 계산 요청
  calculateTax: async (sessionId) => {
    const response = await api.post('/tax/calculate', { session_id: sessionId });
    return response.data;
  },
  // 세무 감사 로그(Audit Trail) 조회
  getAuditTrail: async (sessionId) => {
    const response = await api.get(`/tax/audit/${sessionId}`);
    return response.data;
  },
  // 체크리스트 조회
  getChecklist: async () => {
    const response = await api.post('/tax/checklist');
    return response.data;
  },
  // RAG 가이드 검색
  // 화면 계산값(수치만) 기반 AI 해설 — 세션 없이 /rag/explain 호출
  explainResult: async ({ category, query, payload }) => {
    const response = await api.post('/tax/rag/explain', { category, query, payload });
    return response.data;
  },
  searchRag: async (query, section) => {
    const response = await api.post('/tax/rag/explain', { query, section });
    return response.data;
  },
};

export default api;
