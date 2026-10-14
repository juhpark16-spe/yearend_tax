import React from 'react';
import HomeButton from '../components/HomeButton';

/**
 * 정산봄 서비스 소개 페이지 (v3)
 * - 히어로 배너, 핵심 기능, 이용대상/보안
 * - 연락처, 주소+지도, 사업자 정보
 */
export default function CompanyPage({ onGoHome, onPrev }) {

  const features = [
    {
      step: '01',
      emoji: '📄',
      title: '서류 자동 검증',
      desc: '국세청 간소화자료 PDF를 업로드하면 AI가 9대 공제 항목을 자동 추출·검증합니다. 누락·오류 없이 정확한 데이터를 확보합니다.',
      color: 'from-[#6366F1] to-[#818CF8]',
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
      icon: 'text-indigo-600',
    },
    {
      step: '02',
      emoji: '🧮',
      title: '환급액 정밀 산출',
      desc: '결정론적 세법 엔진이 총급여·인적공제·세액공제를 단계별로 계산해 최종 예상 환급액을 정확하게 도출합니다.',
      color: 'from-[#059669] to-[#34D399]',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      icon: 'text-emerald-600',
    },
    {
      step: '03',
      emoji: '💡',
      title: '절세 전략 제안',
      desc: '월세 세액공제, 청약저축, 체크카드 비중 확대 등 개인 맞춤 절세 포인트를 제안해 환급액을 최대화합니다.',
      color: 'from-[#F59E0B] to-[#FCD34D]',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      icon: 'text-amber-600',
    },
  ];

  return (
    <div className="w-full flex-1 bg-[#F8FAFC] flex flex-col font-sans select-none animate-in fade-in duration-200">

      {/* ── 상단 헤더 ── */}
      <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onPrev || onGoHome}
            className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
            title="뒤로가기"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#818CF8] flex items-center justify-center shadow-sm">
              <span className="text-sm">🌸</span>
            </span>
            <h1 className="text-base font-black text-slate-900 tracking-tight">서비스 소개</h1>
          </div>
        </div>
        <HomeButton onClick={onGoHome} />
      </div>

      {/* ── 메인 콘텐츠 ── */}
      <div className="flex-1 px-4 py-5 space-y-5 overflow-y-auto pb-10">

        {/* ① 히어로 배너 */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#312E81] via-[#4338CA] to-[#6366F1] text-white p-6 shadow-lg">
          <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-indigo-400/20 blur-2xl pointer-events-none" />
          <div className="absolute right-4 bottom-3 text-7xl opacity-15 select-none pointer-events-none">🌸</div>
          <div className="relative z-10 space-y-3.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 border border-white/25 text-[11px] font-bold tracking-wide backdrop-blur-xs">
              <span>🌸</span><span>정산봄 AI 연말정산 서비스</span>
            </div>
            <div>
              <h2 className="text-[22px] font-black tracking-tight leading-tight">내 연말정산 미리봄</h2>
              <p className="mt-1.5 text-sm text-indigo-200 font-semibold leading-snug">AI가 함께하는 스마트 연말정산 자가진단 서비스</p>
            </div>
            <p className="text-[12.5px] text-white/90 leading-relaxed border-t border-white/15 pt-3">
              근로자가 <strong className="text-white">AI의 도움을 받아 혼자 손쉽게</strong> 연말정산 서류를 검증하고,
              환급액을 산출해보도록 하고, 추가 공제 가능한 항목과 절세 전략까지 확인해
              <strong className="text-amber-300"> 환급액을 최대로 받을 수 있도록</strong> 도와주는 서비스입니다.
            </p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {[
                { label: '9대 공제항목', sub: '자동 추출' },
                { label: '100% 세법 엔진', sub: '정밀 계산' },
                { label: '맞춤 절세 전략', sub: 'AI 추천' },
              ].map((b) => (
                <div key={b.label} className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-white/15 border border-white/20 backdrop-blur-xs">
                  <span className="text-[11px] font-black text-white">{b.label}</span>
                  <span className="text-[10px] text-indigo-200">{b.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ② 핵심 기능 3단계 */}
        <div className="space-y-1.5">
          <h3 className="text-[13px] font-extrabold text-slate-800 px-0.5">✨ 서비스 핵심 기능</h3>
          <div className="space-y-3">
            {features.map((f) => (
              <div key={f.step} className={`bg-white rounded-2xl border ${f.border} shadow-2xs overflow-hidden flex items-stretch`}>
                <div className={`w-1.5 bg-gradient-to-b ${f.color} shrink-0 rounded-l-2xl`} />
                <div className="flex-1 p-4 flex items-start gap-3.5">
                  <div className={`w-11 h-11 rounded-2xl ${f.bg} ${f.border} border flex items-center justify-center text-xl shrink-0 shadow-2xs`}>{f.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black ${f.icon} opacity-70`}>STEP {f.step}</span>
                      <span className="text-[13px] font-extrabold text-slate-900">{f.title}</span>
                    </div>
                    <p className="text-[12px] text-slate-600 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ③ 이용 대상 & 보안 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-base shrink-0">👤</span>
              <span className="text-[13px] font-extrabold text-slate-900">이용 대상</span>
            </div>
            <p className="text-[11.5px] text-slate-500 leading-relaxed">연말정산 대상 모든 근로자 (급여소득자)</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-base shrink-0">🛡️</span>
              <span className="text-[13px] font-extrabold text-slate-900">보안 정책</span>
            </div>
            <p className="text-[11.5px] text-slate-500 leading-relaxed">주민번호 즉시 마스킹, 개인정보 서버 비저장</p>
          </div>
        </div>

        {/* ④ CONTACT US */}
        <h3 className="text-[13px] font-extrabold text-slate-800 px-0.5">✨ CONTACT US</h3>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden -mt-2">

          {/* 연락처 3행 */}
          <div className="divide-y divide-slate-50">
            {/* 전화 */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-sm shrink-0">📞</div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Phone</p>
                <p className="text-[13px] font-bold text-slate-800">02-1234-5678</p>
              </div>
            </div>
            {/* 이메일 */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-sm shrink-0">✉️</div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email</p>
                <p className="text-[13px] font-bold text-slate-800 truncate">contact@jeongsanbom.com</p>
              </div>
            </div>
            {/* 주소 */}
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-sm shrink-0 mt-0.5">📍</div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Address</p>
                <p className="text-[13px] font-bold text-slate-800 leading-snug">서울특별시 강남구 테헤란로 123</p>
                <p className="text-[11px] text-slate-500">정산봄빌딩 8층</p>
              </div>
            </div>
          </div>

          {/* 구글 지도 — 주소 핀 표시 */}
          <div className="px-4 pb-4 pt-1">
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-xs" style={{height: '180px'}}>
              <iframe
                title="정산봄 위치"
                src="https://maps.google.com/maps?q=서울특별시+강남구+테헤란로+123&t=&z=17&ie=UTF8&iwloc=&output=embed"
                width="100%"
                height="180"
                style={{border: 0}}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>

        {/* ⑤ 회사 정보 — 옅은 회색 그라데이션 */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 border border-slate-200 p-5 shadow-sm">
          <div className="space-y-2 text-[12.5px] text-slate-600 leading-relaxed">
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-slate-700">상호명</span>
                <span className="text-slate-400">·</span>
                <span>(주)정산봄</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-slate-700">대표이사</span>
                <span className="text-slate-400">·</span>
                <span>최봄</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-slate-700">사업자등록번호</span>
                <span className="text-slate-400">·</span>
                <span>214-88-20250</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-slate-700">통신판매업신고</span>
                <span className="text-slate-400">·</span>
                <span>제2025-서울강남-0125호</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-slate-700">개인정보보호책임자</span>
                <span className="text-slate-400">·</span>
                <span>김세무</span>
                <span className="text-slate-400 text-[11px]">(privacy@jeongsanbom.com)</span>
              </span>
            </div>
          </div>
          <p className="mt-3.5 pt-3 border-t border-slate-200 text-[11px] text-slate-400 font-medium">
            © 2025 JeongSanBom Co., Ltd. All rights reserved.
          </p>
        </div>

      </div>

      {/* ── 하단 버튼 ── */}
      <div className="sticky bottom-0 z-20 px-5 py-4 bg-white border-t border-slate-100">
        <button
          type="button"
          onClick={onGoHome}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#4338CA] to-[#6366F1] hover:from-[#3730A3] hover:to-[#4F46E5] text-white font-bold text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>홈 대시보드로 이동</span>
        </button>
      </div>
    </div>
  );
}
