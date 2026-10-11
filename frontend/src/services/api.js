import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const DEMO_USER_STORAGE_KEY = 'selftax_demo_user';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

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

      // 2. Supabase 세션이 없으면 로컬 데모 유저 확인
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
      }
    } catch (err) {
      console.warn('API 인증 헤더 설정 중 오류:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
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
