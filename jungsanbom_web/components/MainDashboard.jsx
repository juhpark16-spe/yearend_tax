'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function MainDashboard({ onBackToIntro }) {
  const { profile, signOut } = useAuth();
  const [selectedTab, setSelectedTab] = useState('overview');

  const steps = [
    { id: 1, title: '부양가족 검토', desc: '기본공제 및 추가공제 대상자 판별', status: '진행대기', icon: '👨‍👩‍👧' },
    { id: 2, title: '원천징수영수증', desc: '총급여 및 기납부세액 확인', status: '진행대기', icon: '📄' },
    { id: 3, title: '국세청 간소화 등록', desc: 'PDF 자동 업로드 및 항목별 파싱', status: '진행대기', icon: '📑' },
    { id: 4, title: '추가 영수증 입력', desc: '월세액, 기부금 등 수기 증빙', status: '진행대기', icon: '✍️' },
    { id: 5, title: 'AI 세액 시뮬레이션', desc: '예상 환급액 및 누락 공제 진단', status: '진행대기', icon: '✨' },
  ];

  return (
    <div className="min-h-screen bg-[#F0F4FA] text-slate-800 flex flex-col justify-between font-sans selection:bg-indigo-500 selection:text-white">
      {/* 1. 상단 네비게이션 헤더 */}
      <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToIntro}
              className="p-1.5 -ml-1 text-slate-600 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
              title="소개 페이지로 이동"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>

            {/* 정산봄 로고 */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white text-sm shadow-sm">
                🌸
              </div>
              <span className="font-extrabold text-slate-900 text-lg tracking-tight">정산봄</span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                2025 사전점검
              </span>
            </div>
          </div>

          {/* 우측 사용자 프로필 & 로그아웃 버튼 */}
          <div className="flex items-center gap-3">
            {profile && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/90 border border-slate-200/90 shadow-2xs">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="w-6 h-6 rounded-full object-cover ring-2 ring-white"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                    {profile.name ? profile.name.charAt(0) : 'U'}
                  </div>
                )}
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {profile.name} <span className="font-normal text-slate-500 hidden sm:inline">님</span>
                </span>
                <button
                  onClick={signOut}
                  className="ml-1 px-2 py-0.5 rounded-md text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            )}

            {/* 정산봄 로고와 정산봄 글자만 표기 */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200/90 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 via-blue-600 to-violet-500 text-white flex items-center justify-center text-[11px] shadow-xs">
                🌸
              </span>
              <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                정산봄
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. 대시보드 메인 콘텐츠 */}
      <main className="max-w-6xl w-full mx-auto px-5 py-8 flex-1">
        {/* 상단 웰컴 카드 */}
        <div className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-500/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-bold mb-3 backdrop-blur-xs">
              <span>🌸</span>
              <span>2025 귀속 연말정산 사전점검 서비스</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
              반갑습니다, {profile?.name || '근로자'}님!
            </h2>
            <p className="text-sm sm:text-base text-indigo-100 max-w-xl leading-relaxed">
              국세청 간소화 자료 제출 전, AI 사전점검을 통해 누락된 공제 항목을 찾고
              예상 세액을 확인해 보세요.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
            <button className="py-3 px-5 rounded-2xl bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-sm shadow-sm transition active:scale-95 text-center">
              사전점검 시작하기 →
            </button>
          </div>
        </div>

        {/* 5단계 사전점검 워크플로우 카드 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">
              연말정산 5단계 사전점검 로드맵
            </h3>
            <span className="text-xs text-slate-500">진행률 0% (0/5 완료)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {steps.map((step) => (
              <div
                key={step.id}
                className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:border-indigo-300 hover:shadow-sm transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{step.icon}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      STEP {step.id}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    {step.title}
                  </h4>
                  <p className="text-xs text-slate-500 leading-snug">
                    {step.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">{step.status}</span>
                  <span className="text-indigo-600 font-bold">진입 →</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 3개 퀵 메뉴 (절세꿀팁, 구비서류, 이용가이드) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0">
              💡
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">2025 최신 절세 꿀팁</h4>
              <p className="text-xs text-slate-500 mt-0.5">신용카드/체크카드 황금비율 및 맞춤 공제 가이드</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">
              📁
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">필수 구비서류 안내</h4>
              <p className="text-xs text-slate-500 mt-0.5">홈택스 미제공 수기 제출 서류 발급처 및 목록</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg shrink-0">
              🛡️
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">과다공제 사전 방지</h4>
              <p className="text-xs text-slate-500 mt-0.5">중복 부양가족 및 소득기준 초과 가산세 방지 점검</p>
            </div>
          </div>
        </div>
      </main>

      {/* 3. 하단 푸터 */}
      <footer className="w-full bg-white border-t border-slate-200/60 py-6 text-center text-xs text-slate-400">
        <p>© 2025 (주)정산봄 · AI 기반 스마트 셀프 연말정산 사전점검 시스템</p>
      </footer>
    </div>
  );
}
