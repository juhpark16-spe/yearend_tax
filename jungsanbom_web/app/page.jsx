'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import LandingIntro from '../components/LandingIntro';
import MainDashboard from '../components/MainDashboard';

export default function Home() {
  const { user, loading } = useAuth();
  const [exploreDemo, setExploreDemo] = useState(false);

  // 로딩 인디케이터
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white text-lg animate-pulse shadow-md">
            🌸
          </div>
          <span className="text-xs font-bold text-slate-400">정산봄 불러오는 중...</span>
        </div>
      </div>
    );
  }

  // 로그인 상태이거나 데모 둘러보기를 선택한 경우 메인 대시보드 노출
  if (user || exploreDemo) {
    return <MainDashboard onBackToIntro={() => setExploreDemo(false)} />;
  }

  // 기본 첫 화면: AI 연말정산 사전점검 인트로 랜딩페이지
  return <LandingIntro onExploreDemo={() => setExploreDemo(true)} />;
}
