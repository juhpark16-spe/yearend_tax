import React from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * 첫 페이지(메인 대시보드)의 로그인/로그아웃 표기 컴포넌트
 * - 로그인 상태: [ (아바타/이니셜) 사용자명 | 로그아웃 ]
 * - 비로그인 상태: [ 🔑 로그인 ]
 */
export default function UserAuthStatus({ userProfile, onSignOut, onLogin }) {
  const { user, profile, signOut } = useAuth();

  // userProfile prop 우선, 없으면 useAuth의 profile 또는 user 기반 fallback
  const currentProfile = userProfile !== undefined
    ? userProfile
    : (profile || (user ? {
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          '근로자',
        avatar:
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null,
      } : null));

  const handleSignOutClick = async (e) => {
    e?.stopPropagation?.();
    if (onSignOut) {
      await onSignOut();
    } else if (signOut) {
      await signOut();
      if (onLogin) onLogin();
    }
  };

  const handleLoginClick = (e) => {
    e?.stopPropagation?.();
    if (onLogin) {
      onLogin();
    }
  };

  if (currentProfile) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100/90 border border-slate-200/90 shadow-2xs shrink-0 select-none">
        {currentProfile.avatar ? (
          <img
            src={currentProfile.avatar}
            alt={currentProfile.name}
            className="w-5 h-5 rounded-full object-cover ring-1 ring-white shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
            {currentProfile.name ? currentProfile.name.charAt(0) : 'U'}
          </div>
        )}
        <span className="text-xs font-bold text-slate-800 max-w-[65px] sm:max-w-[100px] truncate">
          {currentProfile.name}
        </span>
        <button
          type="button"
          onClick={handleSignOutClick}
          className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
          title="로그아웃"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLoginClick}
      className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] text-white text-xs font-bold shadow-2xs hover:shadow-sm hover:from-indigo-600 hover:to-violet-700 transition-all cursor-pointer flex items-center gap-1 shrink-0 select-none"
      title="로그인 화면으로 이동"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      <span>로그인</span>
    </button>
  );
}
