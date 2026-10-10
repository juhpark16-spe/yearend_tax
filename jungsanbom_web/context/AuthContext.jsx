'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const AuthContext = createContext(null);
const DEMO_USER_STORAGE_KEY = 'jungsanbom_demo_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription = null;

    async function initAuth() {
      try {
        if (isSupabaseConfigured && supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser(session.user);
          } else {
            checkLocalDemoUser();
          }

          const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              setUser(session.user);
              if (typeof window !== 'undefined') {
                localStorage.removeItem(DEMO_USER_STORAGE_KEY);
              }
            } else {
              checkLocalDemoUser();
            }
          });
          subscription = data.subscription;
        } else {
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
      if (typeof window === 'undefined') return;
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
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
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
      // Supabase 연동 전 즉시 체험 가능한 Google 데모 계정
      const demoGoogleUser = {
        id: 'google-demo-' + Date.now(),
        email: 'jungsanbom.ai@gmail.com',
        app_metadata: { provider: 'google' },
        user_metadata: {
          full_name: '김태훈 (Google)',
          name: '김태훈 (Google)',
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
          picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
          email: 'jungsanbom.ai@gmail.com',
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(demoGoogleUser));
      }
      setUser(demoGoogleUser);
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
      if (typeof window !== 'undefined') {
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      }
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
