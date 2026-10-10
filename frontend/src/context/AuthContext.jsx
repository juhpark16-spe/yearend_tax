import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const DEMO_USER_STORAGE_KEY = 'selftax_demo_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 세션 로드 및 인증 상태 리스너 등록
  useEffect(() => {
    let subscription = null;

    async function initAuth() {
      try {
        if (isSupabaseConfigured && supabase) {
          // 1. Supabase 세션 가져오기
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser(session.user);
          } else {
            // 로컬 데모 유저 확인 (선택 사항)
            checkLocalDemoUser();
          }

          // 2. 인증 상태 변경 리스너
          const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              setUser(session.user);
              localStorage.removeItem(DEMO_USER_STORAGE_KEY);
            } else {
              checkLocalDemoUser();
            }
          });
          subscription = data.subscription;
        } else {
          // Supabase 환경변수 미설정 시 로컬 데모 상태 확인
          checkLocalDemoUser();
        }
      } catch (err) {
        console.error('인증 상태 초기화 오류:', err);
        checkLocalDemoUser();
      } finally {
        setLoading(false);
      }
    }

    function checkLocalDemoUser() {
      const savedDemo = localStorage.getItem(DEMO_USER_STORAGE_KEY);
      if (savedDemo) {
        try {
          setUser(JSON.parse(savedDemo));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    }

    initAuth();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Google OAuth 로그인 핸들러
  const signInWithGoogle = async () => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) {
        console.error('Google 로그인 오류:', error);
        throw error;
      }
      return { success: true };
    } else {
      // Supabase 환경변수가 아직 없을 때 즉시 체험 가능한 Google 데모 로그인
      const demoEmail = 'selftax.ai@gmail.com';
      const demoGoogleUser = {
        id: 'google-demo-' + btoa(demoEmail).replace(/=/g, ''),
        email: demoEmail,
        app_metadata: { provider: 'google' },
        user_metadata: {
          full_name: '최지연 (Google)',
          name: '최지연 (Google)',
          avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
          picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
          email: demoEmail,
        },
      };
      localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(demoGoogleUser));
      setUser(demoGoogleUser);
      return { success: true, isDemo: true };
    }
  };

  // 이메일/비밀번호 회원가입 핸들러
  const signUpWithEmail = async (email, password, displayName) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName || email.split('@')[0],
            name: displayName || email.split('@')[0],
          },
        },
      });
      if (error) throw error;
      // 이메일 확인이 필요한 경우 data.user가 있지만 세션이 없을 수 있음
      if (data.user && !data.session) {
        return { success: true, needsConfirmation: true };
      }
      if (data.user) {
        setUser(data.user);
      }
      return { success: true };
    } else {
      // Supabase 미설정 시 데모 회원가입
      const cleanEmail = email.toLowerCase().trim();
      const demoUser = {
        id: 'email-demo-' + btoa(cleanEmail).replace(/=/g, ''),
        email: cleanEmail,
        app_metadata: { provider: 'email' },
        user_metadata: {
          full_name: displayName || cleanEmail.split('@')[0],
          name: displayName || cleanEmail.split('@')[0],
          avatar_url: null,
          picture: null,
          email: cleanEmail,
        },
      };
      localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(demoUser));
      setUser(demoUser);
      return { success: true, isDemo: true };
    }
  };

  // 이메일/비밀번호 로그인 핸들러
  const signInWithEmail = async (email, password) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) setUser(data.user);
      return { success: true };
    } else {
      // Supabase 미설정 시 데모 로그인 (이메일 기반)
      const cleanEmail = email.toLowerCase().trim();
      const demoUser = {
        id: 'email-demo-' + btoa(cleanEmail).replace(/=/g, ''),
        email: cleanEmail,
        app_metadata: { provider: 'email' },
        user_metadata: {
          full_name: cleanEmail.split('@')[0],
          name: cleanEmail.split('@')[0],
          avatar_url: null,
          picture: null,
          email: cleanEmail,
        },
      };
      localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(demoUser));
      setUser(demoUser);
      return { success: true, isDemo: true };
    }
  };

  // 로그아웃 핸들러
  const signOut = async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Supabase signOut 오류:', err);
    } finally {
      localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      setUser(null);
    }
  };

  // 프로필 정규화 헬퍼
  const profile = user
    ? {
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          '근로자',
        avatar:
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null,
        email: user.email || '',
        provider: user.app_metadata?.provider || 'google',
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isConfigured: isSupabaseConfigured,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
