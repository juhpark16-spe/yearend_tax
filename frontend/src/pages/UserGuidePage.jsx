import React, { useState } from 'react';
import HomeButton from '../components/HomeButton';

/**
 * 2025년도 연말정산 이용가이드 상세페이지
 * - 근로자가 이해하기 쉽게 4단계 프로세스, 자주 묻는 질문(FAQ), 주요 일정 캘린더, 세무 용어사전 제공
 * - 2D 플랫 일러스트를 조화롭게 배치하여 가독성과 사용자 경험 극대화
 */
export default function UserGuidePage({ onGoHome, onNavigate, onPrev }) {
  // 서브 탭: 'process' (4단계 프로세스) | 'faq' (자주 묻는 질문) | 'timeline' (일정 캘린더) | 'terms' (쉬운 용어사전)
  const [activeTab, setActiveTab] = useState('process');

  // FAQ 아코디언 열림 상태 (기본 1번 오픈)
  const [openFaqIndex, setOpenFaqIndex] = useState(0);

  // FAQ 토글 핸들러
  const toggleFaq = (index) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  // 4단계 프로세스 상세 데이터
  const processSteps = [
    {
      step: 'STEP 01',
      title: '부양가족 인적공제 점검',
      subtitle: '1인당 150만 원 기본공제 + 추가공제 혜택',
      image: '/assets/forecast_family_2d.jpg',
      badge: 'Step 1',
      badgeColor: 'bg-indigo-100 text-indigo-700',
      description:
        '근로자 본인 및 생계를 같이하는 가족의 소득과 나이를 확인하고 등록합니다. 주민등록번호는 뒷자리가 안전하게 마스킹 처리되어 개인정보를 보호합니다.',
      targetScreen: 'family',
      targetLabel: '부양가족 확인/등록하기',
      checklist: [
        '주민등록등본상 함께 살지 않는 부모님도 만 60세 이상, 연 소득 100만 원 이하면 공제 가능',
        '암·치매·중풍 등 항시 치료를 요하는 중증환자는 1인당 200만 원 추가 장애인공제',
        '본인 근로자의 부녀자공제(50만 원) 및 한부모공제(100만 원) 요건 체크',
      ],
      tip: '💡 형제자매 간 부모님을 중복으로 기본공제 신청하면 추후 가산세가 부과되므로 사전에 미리 상의하세요!',
    },
    {
      step: 'STEP 02',
      title: '근로소득원천징수자료 및 종전근무지',
      subtitle: '연도 중 이직했다면 종전근무지 소득 합산 필수',
      image: '/assets/report_banner_2d.jpg',
      badge: 'Step 2',
      badgeColor: 'bg-emerald-100 text-emerald-700',
      description:
        '올해 회사에서 받은 근로소득원천징수영수증을 확인합니다. 2025년도 중 회사를 이직한 경우 이전 직장의 원천징수영수증을 함께 합산해야 5월 종합소득세 수정신고 번거로움을 피할 수 있습니다.',
      targetScreen: 'withholding',
      targetLabel: '원천징수자료 확인하기',
      checklist: [
        '현 직장 원천징수영수증 드래그 앤 드롭 업로드 및 AI 파싱 요약',
        '연도 중 이직자의 종전근무지(전 직장) 총급여 및 기납부세액 합산 등록',
        '원천징수영수증이 발급되지 않는 경우 홈택스 [MY홈택스 > 지급명세서]에서 직접 조회',
      ],
      tip: '💡 전 직장에서 퇴사 시 원천징수영수증을 받지 못했다면 이전 직장 인사팀에 요청하거나 홈택스에서 조회할 수 있어요.',
    },
    {
      step: 'STEP 03',
      title: '국세청 연말정산간소화 자료 등록',
      subtitle: '홈택스에서 받은 PDF 클릭 한 번으로 자동 분석',
      image: '/assets/guide_step_2d.jpg',
      badge: 'Step 3',
      badgeColor: 'bg-indigo-100 text-indigo-700',
      description:
        '1월 15일 오픈되는 국세청 홈택스 [연말정산간소화] 서비스에서 내려받은 공제 증명자료 PDF를 업로드합니다. 신용카드, 보험료, 의료비, 교육비, 주택자금 등 14개 항목이 실시간으로 자동 분석됩니다.',
      targetScreen: 'hometax',
      targetLabel: '국세청 간소화 등록하기',
      checklist: [
        '국세청 홈택스 접속 > [연말정산 간소화] > 14개 항목 전체 선택 후 [한번에 내려받기] PDF 다운로드',
        '본 시스템에 PDF 업로드 시 공제 대상 항목 및 금액 자동 추출',
        '부양가족이 자료제공에 동의했는지 홈택스에서 사전 확인',
      ],
      tip: '💡 1월 15~17일은 병원 미제출 자료가 보완되는 기간이므로, 최종 확정 자료는 1월 20일 이후에 내려받는 것이 가장 정확합니다.',
    },
    {
      step: 'STEP 04',
      title: '추가 수기 공제자료 입력 & 예상세액 조회',
      subtitle: '간소화 누락 영수증 챙기고 13월의 월급 확인',
      image: '/assets/report_refund_2d.jpg',
      badge: 'Step 4',
      badgeColor: 'bg-amber-100 text-amber-800',
      description:
        '국세청 간소화에서 조회되지 않는 월세 계좌이체 내역, 시력보정용 안경 영수증, 취학 전 아동 학원비 등을 직접 입력하고, 최종 환급액(또는 추가 납부액)과 AI 절세 리포트를 즉시 확인합니다.',
      targetScreen: 'input_data',
      targetLabel: '추가자료 입력 바로가기',
      checklist: [
        '월세액 세액공제 (임대차계약서, 주민등록등본, 이체증 증빙)',
        '안경/콘택트렌즈 구입비 (1인당 연 50만 원 영수증)',
        '취학 전 아동 학원비·체육시설 수강료 납입증명서',
        '결과 조회에서 예상 환급금 및 항목별 절세 진단 리포트 확인',
      ],
      tip: '💡 추가 서류를 모두 입력한 후 [연말정산 결과조회]를 누르면 내가 돌려받을 환급금을 1원 단위까지 미리 볼 수 있어요!',
    },
  ];

  // 자주 묻는 질문 (FAQ) 데이터
  const faqList = [
    {
      question: '연도 중에 이직했는데 연말정산은 어떻게 해야 하나요?',
      answer:
        '현재 근무 중인 회사(최종 근무지)에서 이전 직장의 소득을 합산하여 연말정산을 진행해야 합니다. 이전 직장에서 발급받은 [근로소득원천징수영수증] 사본을 현재 회사에 제출하시면 합산 처리됩니다. 만약 제출하지 못했다면 올해 5월에 홈택스에서 근로자 본인이 직접 종합소득세 신고를 통해 두 소득을 합산해야 가산세가 발생하지 않습니다.',
      category: '이직/퇴사',
    },
    {
      question: '중도 입사자나 퇴사자의 공제 대상 기간은 언제인가요?',
      answer:
        '근로기간(입사일~퇴사일) 중에 지출한 금액만 공제되는 항목과, 1년 전체(1.1~12.31) 지출액이 공제되는 항목이 다릅니다.\n\n• 근로기간 지출액만 공제: 보험료, 의료비, 교육비, 주택자금, 월세액, 신용카드 등\n• 연간 전체 지출액 공제: 연금저축/IRP, 기부금, 국민연금 보험료, 개인연금저축',
      category: '이직/퇴사',
    },
    {
      question: '맞벌이 부부는 부양가족과 의료비를 누구 앞으로 몰아야 유리한가요?',
      answer:
        '일반적으로 다음과 같이 배분하는 것이 가장 유리합니다:\n\n1. 부양가족 기본공제: 한계세율이 높아 세금을 더 많이 내는 고소득 배우자에게 몰아주는 것이 유리합니다.\n2. 의료비 세액공제: 총급여의 3%를 초과해야 공제가 시작되므로, 문턱 금액이 낮은 저소득 배우자에게 몰아주는 것이 유리합니다.\n3. 신용카드: 총급여의 25% 초과분부터 공제되므로, 25% 문턱을 넘기기 쉬운 저소득 배우자 카드나 고소득 배우자 카드의 상황에 맞게 시뮬레이션 후 결정합니다.',
      category: '맞벌이',
    },
    {
      question: '월세 세액공제는 집주인의 동의를 꼭 받아야 하나요?',
      answer:
        '전혀 필요 없습니다! 집주인의 동의나 확정일자 유무와 무관하게 근로자 본인(또는 기본공제대상자) 명의로 계약하고 주민등록등본상 전입신고가 완료되어 있다면, [임대차계약서 사본, 주민등록등본, 계좌이체 영수증]만 제출하면 최대 170만 원까지 전액 세액공제를 받을 수 있습니다.',
      category: '주택/월세',
    },
    {
      question: '부모님이나 자녀의 연간 소득금액 100만 원 이하 기준이 무엇인가요?',
      answer:
        '소득 종류에 따라 계산 방식이 다릅니다:\n\n• 근로소득만 있는 경우: 총급여 500만 원 이하 (근로소득공제 400만 원 차감 후 소득금액 100만 원)\n• 사업소득/부동산임대: 총수입에서 필요경비를 뺀 순소득이 100만 원 이하\n• 공적연금(국민연금 등): 연간 총 연금수령액 약 516만 원 이하 (연금소득공제 후 100만 원)\n• 금융소득(이자/배당): 2,000만 원 이하인 경우 분리과세되어 기본공제 가능',
      category: '부양가족',
    },
    {
      question: '연말정산 기간에 깜빡 잊고 빠뜨린 서류는 어떻게 환급받나요?',
      answer:
        '걱정하지 마세요! 두 가지 방법으로 100% 돌려받을 수 있습니다:\n\n1. 5월 종합소득세 신고 기간: 매년 5월 1일~31일 사이에 홈택스 [종합소득세 신고] 메뉴에서 누락된 서류를 반영하여 무료로 확정신고하면 6월 말~7월 초에 환급금이 계좌로 입금됩니다.\n2. 지난 5년간 경정청구: 5년 이내의 과거 연말정산 누락분은 홈택스 [경정청구] 서비스를 통해 언제든지 소급 환급 신청이 가능합니다.',
      category: '누락/환급',
    },
    {
      question: '실손보험금으로 돌려받은 의료비는 왜 차감해야 하나요?',
      answer:
        '의료비 세액공제는 근로자가 실제로 직접 부담한 의료비에 대해서만 세제 혜택을 주는 제도입니다. 보험회사로부터 실손의료보험금으로 보전받은 금액은 본인이 최종 부담한 것이 아니므로, 해당 지출액만큼 반드시 차감하고 신고해야 가산세(과초신고 가산세 10% 등)를 피할 수 있습니다.',
      category: '의료비',
    },
  ];

  // 연말정산 주요 일정 캘린더 데이터
  const timelineEvents = [
    {
      date: '1월 15일',
      title: '국세청 홈택스 간소화 서비스 1차 개통',
      desc: '의료비, 신용카드, 보험료, 교육비 등 간소화 서비스 개통 (조회 가능)',
      status: '완료',
      dotColor: 'bg-[#4F46E5]',
    },
    {
      date: '1월 15일 ~ 1월 17일',
      title: '의료비 신고센터 운영 기간',
      desc: '병원·약국에서 누락된 의료비 영수증을 국세청에 신고 및 접수하는 기간',
      status: '중요',
      dotColor: 'bg-amber-500',
    },
    {
      date: '1월 20일',
      title: '연말정산 간소화 최종 확정자료 제공',
      desc: '미제출 의료비 및 추가 자료가 보완된 최종 확정 PDF 자료 오픈',
      status: '추천',
      dotColor: 'bg-emerald-500',
    },
    {
      date: '1월 하순 ~ 2월 초',
      title: '소득·세액공제 신고서 및 증빙 제출',
      desc: '회사별 안내 일정에 따라 본 시스템을 통해 공제신고서 및 구비서류 최종 제출',
      status: '진행중',
      dotColor: 'bg-indigo-500',
    },
    {
      date: '2월 급여일 (또는 3월)',
      title: '13월의 월급! 연말정산 세액 환급 또는 징수',
      desc: '회사 2월분 급여 지급 시 연말정산 결과(차감징수세액)가 급여통장에 자동 반영',
      status: '환급',
      dotColor: 'bg-rose-500',
    },
    {
      date: '5월 1일 ~ 5월 31일',
      title: '종합소득세 확정신고 (누락분 추가 환급)',
      desc: '회사에 제출하지 못했거나 누락된 공제 항목을 홈택스에서 근로자가 직접 신고 및 환급',
      status: '추가기회',
      dotColor: 'bg-purple-500',
    },
  ];

  // 초보자를 위한 핵심 세무 용어사전
  const taxTerms = [
    {
      term: '총급여액',
      desc: '1년 동안 받은 전체 급여·상여금에서 식대(월 20만 원), 자가운전보조금(월 20만 원) 등 비과세 소득을 제외한 금액입니다. 신용카드 25%, 의료비 3% 등 모든 공제 문턱의 기준이 됩니다.',
    },
    {
      term: '소득공제 vs 세액공제',
      desc: '• 소득공제: 세금을 매기는 기준이 되는 소득금액(과세표준) 자체를 깎아주는 공제 (예: 인적공제, 신용카드, 주택청약)\n• 세액공제: 계산된 세금에서 해당 금액만큼을 직접 깎아주는 공제 (예: 연금계좌, 의료비, 월세, 기부금)',
    },
    {
      term: '결정세액',
      desc: '각종 소득공제와 세액공제를 모두 반영한 후 근로자가 2025년도에 최종적으로 내야 하는 1년간의 진짜 세금입니다.',
    },
    {
      term: '기납부세액 (원천징수세액)',
      desc: '매월 월급을 받을 때 회사에서 대략 계산하여 미리 떼어 국세청에 납부해 둔 세금의 총합계입니다.',
    },
    {
      term: '차감징수세액 (환급 vs 추가납부)',
      desc: '결정세액에서 기납부세액을 뺀 금액입니다.\n• 마이너스(-) 금액: 미리 낸 세금이 진짜 세금보다 많아서 통장으로 돌려받는 "환급금"\n• 플러스(+) 금액: 미리 낸 세금이 부족하여 추가로 더 내야 하는 "추가 납부액"',
    },
  ];

  return (
    <div className="w-full flex-1 bg-[#F6F7FB] flex flex-col justify-between font-sans select-none pb-10">
      {/* 1. 상단 고정 헤더: ← 뒤로가기 + 타이틀 + 홈화면 버튼 */}
      <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-200/80 bg-white sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onPrev || onGoHome}
            className="p-1 -ml-1 text-slate-800 hover:text-indigo-600 transition cursor-pointer"
            title="뒤로가기"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>연말정산 이용가이드</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                초보자 필독
              </span>
            </h1>
          </div>
        </div>

        <HomeButton onClick={onGoHome} />
      </div>

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="flex-1 px-4 sm:px-5 py-4 space-y-4 overflow-y-auto">
        {/* 상단 2D 플랫 일러스트 히어로 배너 (인트로 인디고-바이올렛 그라데이션) */}
        <div className="bg-gradient-to-br from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative z-10 space-y-2 flex-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-bold text-indigo-100 tracking-wide">
              <span>📖 AI 셀프 연말정산 완전정복 가이드</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black leading-snug tracking-tight">
              순서대로 따라 하면 끝!<br />
              <span className="text-amber-300">10분 만에 끝내는 연말정산</span>
            </h2>
            <p className="text-xs text-indigo-100/90 leading-relaxed pt-0.5">
              처음이어도 걱정 마세요. 4단계 입력 절차부터 필수 Q&A까지 알기 쉽게 정리해 드립니다.
            </p>
          </div>

          {/* 우측 2D 플랫 일러스트 캐릭터 이미지 */}
          <div className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 relative flex items-center justify-center">
            <div className="w-full h-full rounded-2xl bg-white/10 backdrop-blur-xs p-1 border border-white/20 shadow-inner flex items-center justify-center overflow-hidden">
              <img
                src="/assets/guide_step_2d.jpg"
                alt="연말정산 이용가이드 일러스트"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* 3. 4대 서브 탭 네비게이션 (스티키 바) */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200 shadow-2xs grid grid-cols-4 gap-1 sticky top-[57px] z-20">
          <button
            type="button"
            onClick={() => setActiveTab('process')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate cursor-pointer ${
              activeTab === 'process'
                ? 'bg-[#4F46E5] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            4단계 프로세스
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate cursor-pointer ${
              activeTab === 'faq'
                ? 'bg-[#4F46E5] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            자주 묻는 질문
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-[#4F46E5] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            일정 캘린더
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center truncate cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-[#4F46E5] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            쉬운 세무용어
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: 4단계 프로세스 상세 가이드                                        */}
        {/* ========================================================================= */}
        {activeTab === 'process' && (
          <div className="space-y-4">
            {/* 연말정산 4단계 한눈에 보기 — 플로우차트 이미지 포함 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    연말정산 4단계 한눈에 보기
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    1단계부터 차례대로 정보를 확인하고 진행하시면 됩니다.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg shrink-0">
                  총 4단계
                </span>
              </div>

              {/* 플로우차트 이미지 */}
              <div className="rounded-xl overflow-hidden border border-indigo-100/80">
               </div>
               {/* 단계 클릭 바로가기 */}
              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('family')}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition cursor-pointer"
                >
                  <span className="text-[10px] font-black text-indigo-600 font-mono">01</span>
                  <span className="text-[10px] text-slate-600 font-semibold leading-tight text-center">부양가족</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('withholding')}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition cursor-pointer"
                >
                  <span className="text-[10px] font-black text-emerald-700 font-mono">02</span>
                  <span className="text-[10px] text-slate-600 font-semibold leading-tight text-center">원천징수</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('hometax')}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition cursor-pointer"
                >
                  <span className="text-[10px] font-black text-indigo-600 font-mono">03</span>
                  <span className="text-[10px] text-slate-600 font-semibold leading-tight text-center">국세청PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('input_data')}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-100 transition cursor-pointer"
                >
                  <span className="text-[10px] font-black text-amber-700 font-mono">04</span>
                  <span className="text-[10px] text-slate-600 font-semibold leading-tight text-center">수기·환급</span>
                </button>
              </div>
            </div>

            {/* 단계별 카드 리스트 */}
            {processSteps.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden hover:border-indigo-300 transition-all"
              >
                <div className="p-4 sm:p-5 space-y-3.5">
                  {/* 카드 상단: 스텝 뱃지 + 타이틀 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black font-mono bg-[#4F46E5] text-white">
                        {item.step}
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        {item.subtitle}
                      </span>
                    </div>

                    {item.targetScreen && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate(item.targetScreen)}
                        className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <span>{item.targetLabel}</span>
                        <span>→</span>
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {item.title}
                  </h3>

                  {/* 2D 이미지 + 본문 설명 레이아웃 */}
                  <div className="flex flex-col sm:flex-row items-start gap-4 pt-1">
                    {item.image && (
                      <div className="w-full sm:w-32 h-32 shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover mix-blend-multiply"
                        />
                      </div>
                    )}

                    <div className="flex-1 space-y-2.5">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {item.description}
                      </p>

                      {/* 체크리스트 박스 */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-800 block">
                          📋 이 단계에서 확인할 내용
                        </span>
                        <ul className="space-y-1 text-[11px] text-slate-600">
                          {item.checklist.map((cItem, cIdx) => (
                            <li key={cIdx} className="flex items-start gap-1.5 leading-relaxed">
                              <span className="text-emerald-500 font-bold shrink-0">✓</span>
                              <span>{cItem}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* 절세 팁 한 줄 */}
                      {item.tip && (
                        <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900 leading-relaxed">
                          {item.tip}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 자주 묻는 질문 (FAQ) 아코디언                                      */}
        {/* ========================================================================= */}
        {activeTab === 'faq' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-extrabold text-slate-900">
                근로자가 가장 많이 묻는 질문 TOP 7
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                궁금한 항목을 클릭하시면 상세한 세무 안내를 확인하실 수 있습니다.
              </p>
            </div>

            <div className="space-y-2">
              {faqList.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full p-4 text-left flex items-start justify-between gap-3 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-50 text-[#4F46E5] text-xs font-black flex items-center justify-center shrink-0 font-mono mt-0.5">
                          Q
                        </span>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {faq.category}
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 mt-1 leading-snug">
                            {faq.question}
                          </h4>
                        </div>
                      </div>
                      <span className={`text-slate-400 text-xs font-bold transition-transform duration-200 shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`}>
                        ∨
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-[#F8FAFC]">
                        <div className="flex items-start gap-2.5 pt-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-black flex items-center justify-center shrink-0 font-mono mt-0.5">
                            A
                          </span>
                          <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-line flex-1">
                            {faq.answer}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 연말정산 주요 일정 캘린더 (타임라인)                                 */}
        {/* ========================================================================= */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-extrabold text-slate-900">
                2025 귀속 연말정산 공식 일정
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                놓치지 말고 주요 일정을 확인해 환급 혜택을 챙기세요.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timelineEvents.map((event, eIdx) => (
                  <div key={eIdx} className="relative group">
                    {/* 타임라인 원형 닷 */}
                    <div className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ${event.dotColor} shadow-xs`} />

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 font-mono">
                          {event.date}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {event.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-800 leading-snug">
                        {event.title}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {event.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 초보자를 위한 쉬운 세무용어사전                                     */}
        {/* ========================================================================= */}
        {activeTab === 'terms' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-extrabold text-slate-900">
                알아두면 유익한 연말정산 필수 용어
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                매년 헷갈리는 세무 단어들을 쉽게 풀어 설명해 드립니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {taxTerms.map((t, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#4F46E5] bg-indigo-50 px-2 py-0.5 rounded">
                      0{idx + 1}
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900">
                      {t.term}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line pl-1">
                    {t.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 하단 공통 문의 및 도움말 배너 */}
        <div className="bg-slate-100/90 rounded-2xl p-4 border border-slate-200 text-xs text-slate-500 leading-relaxed space-y-1">
          <p className="font-bold text-slate-700 flex items-center gap-1.5">
            <span>📞 세무 상담 및 문의처 안내</span>
          </p>
          <p className="text-[11px] text-slate-600">
            • 국세청 세미래 콜센터: <b>국번없이 126</b> (평일 09:00 ~ 18:00)
          </p>
          <p className="text-[11px] text-slate-600">
            • 홈택스 홈페이지: <b>www.hometax.go.kr</b> (연말정산간소화 및 편리한 연말정산)
          </p>
        </div>
      </div>

      {/* 하단 고정 액션 바 */}
      <div className="w-full px-5 py-3 bg-white border-t border-slate-200 sticky bottom-0 z-30 flex items-center justify-between gap-3 shadow-lg">
        <button
          type="button"
          onClick={onGoHome}
          className="flex-1 py-3 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-indigo-700 shadow-xs transition cursor-pointer text-center"
        >
          홈 대시보드로 이동
        </button>
      </div>
    </div>
  );
}

