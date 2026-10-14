import React, { useState, useMemo } from 'react';
import HomeButton from '../components/HomeButton';

/**
 * 2025년도 연말정산 핵심 절세꿀팁 총람 페이지
 * 근로자가 놓치기 쉬운 세법 공제 노하우를 시각적 일러스트 카드와 함께 깔끔하고 직관적으로 제공
 */
export default function TaxTipsPage({ onGoHome, onNavigate, onPrev }) {
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');
  // 카테고리 탭: 'all' | 'family' | 'housing' | 'pension' | 'cards' | 'medical' | 'special'
  const [activeCategory, setActiveCategory] = useState('all');
  // 스크랩(북마크)한 꿀팁 ID 세트
  const [savedTips, setSavedTips] = useState(new Set());

  // 북마크 토글
  const toggleSaveTip = (tipId) => {
    setSavedTips((prev) => {
      const next = new Set(prev);
      if (next.has(tipId)) {
        next.delete(tipId);
      } else {
        next.add(tipId);
      }
      return next;
    });
  };

  // 카테고리 탭 정의
  const categories = [
    { id: 'all', name: '전체 꿀팁' },
    { id: 'family', name: '부양가족' },
    { id: 'housing', name: '주택/월세' },
    { id: 'pension', name: '연금/저축' },
    { id: 'cards', name: '신용카드' },
    { id: 'medical', name: '의료/교육' },
    { id: 'special', name: '신혼/기부금' },
  ];

  // 꿀팁 마스터 데이터
  const tipsList = useMemo(
    () => [
      // 1. 부양가족 / 인적공제
      {
        id: 'tip_fam_1',
        category: 'family',
        badge: '부양가족',
        title: '따로 사는 부모님도 150만 원 기본공제 가능!',
        highlight: '주거 형편상 따로 살아도 만 60세 이상 & 연 소득 100만 원 이하면 OK',
        image: '/assets/tips_parents_2d.jpg',
        description:
          '부모님과 주민등록상 함께 살지 않아도 실제로 부양하고 있다면 기본공제 150만 원 대상입니다. 단, 다른 형제자매가 중복으로 공제받지 않도록 사전에 협의해야 합니다.',
        targetScreen: 'family',
        targetLabel: '부양가족 확인하기',
        keyPoints: [
          '연령 요건: 만 60세 이상 (1965.12.31 이전 출생)',
          '소득 요건: 연간 소득금액 100만 원 이하 (근로소득만 있는 경우 총급여 500만 원 이하)',
          '제출 서류: 가족관계증명서 (상세)',
        ],
        tags: ['#부모님공제', '#인적공제', '#가족관계증명서'],
      },
      {
        id: 'tip_fam_2',
        category: 'family',
        badge: '부양가족',
        title: '소득세법상 "중증환자"는 200만 원 추가 장애인공제!',
        highlight: '암·치매·만성신부전 등 지병 치료 중이라면 병원에서 장애인증명서 발급',
        image: '/assets/tips_medical_heavy_2d.jpg',
        description:
          '복지카드(장애인등록증)가 없더라도 암, 중풍, 만성신부전, 백혈병, 치매 등 항시 치료를 요하는 중증환자는 소득세법상 장애인에 해당하여 1인당 200만 원 추가공제 및 의료비 전액 공제가 가능합니다.',
        targetScreen: 'family',
        targetLabel: '장애인 공제 확인',
        keyPoints: [
          '공제 혜택: 1인당 200만 원 추가 소득공제 + 의료비 공제한도(700만 원) 무제한 적용',
          '발급 방법: 담당 의사에게 소득세법 서식 "장애인증명서" 발급 요청',
          '영구/비영구 구분: 5년 등 치료기간 명시 시 기간 내 매년 자동 인정',
        ],
        tags: ['#중증환자', '#장애인공제', '#200만원추가공제'],
      },

      // 2. 주택 / 월세
      {
        id: 'tip_house_1',
        category: 'housing',
        badge: '주택/월세',
        title: '집주인 동의 없이 최대 170만 원! 월세액 세액공제',
        highlight: '총급여 8,000만 원 이하 무주택자라면 월세의 15~17% 세액공제',
        image: '/assets/tips_rent_2d.jpg',
        description:
          '확정일자가 없어도 임대차계약서상 주소지로 전입신고만 되어 있다면 집주인 동의 없이 홈택스 또는 회사 제출로 월세 세액공제를 받을 수 있습니다. (연 1,000만 원 한도)',
        targetScreen: 'input_data',
        targetLabel: '월세액 입력 바로가기',
        keyPoints: [
          '공제율: 총급여 5,500만 원 이하 17% (최대 170만 원) / 8,000만 원 이하 15% (최대 150만 원)',
          '대상 주택: 국민주택규모(85㎡ 이하) 또는 기준시가 4억 원 이하 주택(오피스텔, 고시원 포함)',
          '준비 서류: 임대차계약서 사본, 주민등록등본, 계좌이체영수증',
        ],
        tags: ['#월세공제', '#최대170만원', '#집주인동의불필요'],
      },
      {
        id: 'tip_house_2',
        category: 'housing',
        badge: '주택/월세',
        title: '주택청약저축 납입한도 300만 원으로 대폭 상향!',
        highlight: '연 300만 원 납입 시 40%인 최대 120만 원 소득공제',
        image: '/assets/tips_housing_savings_2d.jpg',
        description:
          '총급여 7,000만 원 이하 무주택 세대주라면 주택청약종합저축 납입금액에 대해 소득공제를 받을 수 있습니다. 기존 연 240만 원에서 300만 원으로 상향되어 절세 폭이 대폭 확대되었습니다.',
        targetScreen: 'input_data',
        targetLabel: '주택마련저축 확인',
        keyPoints: [
          '공제율 및 한도: 납입액의 40% (연 납입한도 300만 원, 최대 120만 원 소득공제)',
          '필수 사전 절차: 가입 은행에 1회 "무주택확인서" 제출 완료 필수',
          '세대주 요건: 12월 31일 기준 무주택 세대주',
        ],
        tags: ['#주택청약', '#납입한도300만', '#무주택확인서'],
      },

      // 3. 연금 / 저축
      {
        id: 'tip_pen_1',
        category: 'pension',
        badge: '연금/저축',
        title: '연금저축 + IRP 900만 원 납입 시 최대 148.5만 원 즉시 환급!',
        highlight: '연말정산 최고의 환급 치트키! 12월 31일 전 계좌 입금 완료 필수',
        image: '/assets/tips_pension_2d.jpg',
        description:
          '연금저축(최대 600만 원)과 IRP(퇴직연금 합산 최대 900만 원)를 채우면 총급여 5,500만 원 이하는 16.5%(최대 148만 5천 원), 초과는 13.2%(최대 118만 8천 원)를 세금에서 바로 깎아줍니다.',
        targetScreen: 'input_data',
        targetLabel: '연금계좌 입력하기',
        keyPoints: [
          '세액공제 한도: 연금저축 단독 600만 원 / IRP 합산 900만 원',
          '공제율: 총급여 5,500만 원 이하 16.5% / 5,500만 원 초과 13.2%',
          '주의사항: 중도해지 시 기타소득세(16.5%)가 부과되므로 노후자금 목적으로 운용 권장',
        ],
        tags: ['#연금저축', '#IRP', '#최대148만원환급'],
      },
      {
        id: 'tip_pen_2',
        category: 'pension',
        badge: '연금/저축',
        title: 'ISA 만기 자금 연금계좌로 전환 시 300만 원 추가 공제!',
        highlight: 'ISA 만기 자금을 연금계좌로 넣으면 전환금액의 10% 추가 세액공제',
        image: '/assets/tips_isa_2d.jpg',
        description:
          '3년 만기가 된 개인종합자산관리계좌(ISA) 만기 금액을 연금저축/IRP로 전환 입금하면, 전환금액의 10%(최대 300만 원 한도)에 대해 추가 세액공제(최대 49.5만 원)를 받을 수 있습니다.',
        targetScreen: 'input_data',
        targetLabel: '공제자료 확인',
        keyPoints: [
          '추가 공제 한도: 전환금액의 10% (최대 300만 원)',
          '기존 연금계좌 900만 원 한도와 별도로 추가 적용되어 최대 1,200만 원까지 세액공제 가능',
        ],
        tags: ['#ISA만기전환', '#추가300만원', '#절세부스터'],
      },

      // 4. 신용카드 / 소비
      {
        id: 'tip_card_1',
        category: 'cards',
        badge: '신용카드',
        title: '신용카드 vs 체크카드 최적의 황금비율 공략법!',
        highlight: '총급여 25%까지는 신용카드 혜택, 25% 초과분은 체크카드 집중!',
        image: '/assets/tips_cards_2d.jpg',
        description:
          '신용카드 소득공제는 총급여의 25%를 초과하는 금액부터 적용됩니다. 25%까지는 포인트와 할인 혜택이 많은 신용카드를 쓰고, 초과분부터는 공제율이 2배 높은 체크카드(30%)나 전통시장(40~80%)을 쓰는 것이 가장 유리합니다.',
        targetScreen: 'input_data',
        targetLabel: '신용카드 입력하기',
        keyPoints: [
          '공제율 비교: 신용카드 15% vs 체크카드·현금영수증 30% vs 도서공연·문화체육 30% vs 전통시장 40~80%',
          '맞벌이 부부 전략: 부부 중 소득이 적은 사람에게 몰아주면 25% 문턱을 더 쉽게 넘습니다.',
        ],
        tags: ['#신용카드공제', '#체크카드30%', '#소비황금비율'],
      },

      // 5. 의료비 / 교육비
      {
        id: 'tip_med_1',
        category: 'medical',
        badge: '의료/교육',
        title: '맞벌이 부부 의료비는 "소득이 적은 사람"에게 몰아주기!',
        highlight: '총급여 3% 문턱이 낮아져 공제받는 의료비 금액이 훨씬 커집니다',
        image: '/assets/tips_medical_couple_2d.jpg',
        description:
          '의료비는 총급여액의 3%를 초과해야만 공제가 시작됩니다. 연봉 7,000만 원 근로자는 210만 원을 초과해야 하지만, 연봉 3,000만 원 배우자는 90만 원만 넘겨도 바로 15% 공제를 받으므로 소득이 적은 쪽에 몰아주는 것이 유리합니다.',
        targetScreen: 'input_data',
        targetLabel: '의료비 조회/입력',
        keyPoints: [
          '나이·소득 불문: 부양가족의 나이와 소득이 기준을 초과해 인적공제가 안 돼도 내가 낸 의료비는 공제 가능',
          '시력보정용 안경·렌즈: 1인당 연 50만 원 영수증 필수 챙기기',
          '산후조리원비: 소득제한 없이 출산 1회당 200만 원 전액 공제 대상',
        ],
        tags: ['#의료비몰아주기', '#총급여3%문턱', '#안경렌즈50만'],
      },
      {
        id: 'tip_edu_1',
        category: 'medical',
        badge: '의료/교육',
        title: '취학 전 아동 학원비 & 초등 입학 전 1~2월 학원비 공제!',
        highlight: '미취학 자녀의 태권도장, 수영장, 음악·미술학원비 15% 세액공제',
        image: '/assets/forecast_children_2d.jpg',
        description:
          '초·중·고등학생의 학원비는 공제되지 않지만, 미취학 아동의 주 1회 이상 월단위 학원 및 체육시설 수강료는 연 300만 원 한도로 15% 세액공제됩니다. 올해 초등학교에 입학한 자녀의 1~2월 입학 전 학원비도 포함됩니다.',
        targetScreen: 'input_data',
        targetLabel: '교육비 조회/입력',
        keyPoints: [
          '공제 한도: 1명당 연 300만 원 (15%인 45만 원 세액공제)',
          '간소화 누락 주의: 학원에서 교육비납입증명서를 수기 발급받아 제출해야 하는 경우가 많음',
          '중·고생 교복구입비: 1인당 50만 원 한도 세액공제 가능',
        ],
        tags: ['#취학전학원비', '#태권도장', '#교복구입비50만'],
      },

      // 6. 신혼 / 기부금 / 특수
      {
        id: 'tip_wed_1',
        category: 'special',
        badge: '신혼/기부금',
        title: '2024~2026년 결혼했다면 신혼부부 최대 100만 원 혼인세액공제!',
        highlight: '생애 1회, 신랑 50만 원 + 신부 50만 원 = 총 100만 원 세액공제 신설',
        image: '/assets/forecast_wedding_2d.jpg',
        description:
          '2024년 1월 1일부터 2026년 12월 31일 사이에 혼인신고를 마친 신혼부부 근로자라면 본인과 배우자 각각 50만 원씩 최대 100만 원의 세액공제 혜택을 받을 수 있습니다.',
        targetScreen: 'input_data',
        targetLabel: '기타공제 확인하기',
        keyPoints: [
          '적용 시기: 2024년 1월 1일 ~ 2026년 12월 31일 중 혼인신고한 해의 연말정산',
          '공제 금액: 1인당 50만 원 (맞벌이 부부 합산 100만 원)',
          '준비 서류: 혼인관계증명서 (상세)',
        ],
        tags: ['#혼인세액공제', '#신혼부부100만', '#2024신설'],
      },
      {
        id: 'tip_don_1',
        category: 'special',
        badge: '신혼/기부금',
        title: '고향사랑기부금: 10만 원 기부하고 13만 원 혜택 받기!',
        highlight: '10만 원까지 100% 전액 세액공제 + 3만 원 상당의 지역 특산품 답례품',
        image: '/assets/tips_donation_2d.jpg',
        description:
          '자신의 주민등록상 거주지 외 지자체에 기부하는 고향사랑기부금은 10만 원까지 전액(100/110 세액공제 + 지방소득세 10/110) 세금으로 환급되며, 기부액의 30%인 3만 원 상당의 지역 답례품을 무료로 받습니다.',
        targetScreen: 'input_data',
        targetLabel: '기부금 입력 바로가기',
        keyPoints: [
          '세액공제: 10만 원 이하 100% 전액 공제 / 10만 원 초과분 16.5% 공제',
          '답례품: 기부금액의 30% 한도 내에서 한우, 쌀, 지역사랑상품권 등 수령',
          '국세청 연동: 고향사랑e음에서 기부 시 홈택스 간소화에서 자동 조회',
        ],
        tags: ['#고향사랑기부', '#10만원전액환급', '#3만원답례품'],
      },
    ],
    []
  );

  // 필터링된 꿀팁 목록
  const filteredTips = useMemo(() => {
    return tipsList.filter((tip) => {
      // 카테고리 필터
      if (activeCategory !== 'all' && tip.category !== activeCategory) {
        return false;
      }
      // 검색어 필터
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        tip.title.toLowerCase().includes(q) ||
        tip.highlight.toLowerCase().includes(q) ||
        tip.description.toLowerCase().includes(q) ||
        tip.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [tipsList, activeCategory, searchTerm]);

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
              <span>연말정산 절세 꿀팁</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                TOP 10
              </span>
            </h1>
          </div>
        </div>

        <HomeButton onClick={onGoHome} />
      </div>

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="flex-1 px-4 sm:px-5 py-4 space-y-4 overflow-y-auto">
        {/* 상단 비주얼 히어로 배너 */}
        <div className="bg-gradient-to-br from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative z-10 space-y-2 flex-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-bold text-amber-200 tracking-wide">
              <span>💰 13월의 월급을 극대화하는 노하우</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black leading-snug tracking-tight">
              놓치면 손해보는<br />
              <span className="text-amber-300">2025 실전 절세 꿀팁</span>
            </h2>
            <p className="text-xs text-indigo-100/90 leading-relaxed pt-0.5">
              조금만 신경 써도 수십만~수백만 원 세금을 아낄 수 있는 근로자 맞춤형 절세 포인트를 정리했습니다.
            </p>
          </div>

          {/* 우측 비주얼 캐릭터/일러스트 이미지 */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 relative flex items-center justify-center">
            <div className="w-full h-full rounded-2xl bg-white/10 backdrop-blur-xs p-1.5 border border-white/20 shadow-inner flex items-center justify-center overflow-hidden">
              <img
                src="/assets/tips_hero_2d.jpg"
                alt="절세 꿀팁 환급 2D 일러스트"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* 3. 검색창 및 카테고리 탭 (스티키 헤더) */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs space-y-3 sticky top-[57px] z-20">
          {/* 검색바 */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="꿀팁 검색 (예: 부모님, 월세, 연금저축, 안경, 혼인, 신용카드...)"
              className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* 카테고리 필터 탭 */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-[#4F46E5] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* 결과 요약 및 북마크 카운트 */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5 border-t border-slate-100">
            <span>
              총 <b className="text-slate-800">{filteredTips.length}</b>개의 절세 꿀팁
            </span>
            {savedTips.size > 0 && (
              <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <span>⭐ 보관함:</span>
                <b>{savedTips.size}개 저장됨</b>
              </span>
            )}
          </div>
        </div>

        {/* 4. 절세 꿀팁 카드 목록 */}
        <div className="space-y-4">
          {filteredTips.map((tip, index) => {
            const isSaved = savedTips.has(tip.id);
            return (
              <div
                key={tip.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all overflow-hidden"
              >
                <div className="p-4 sm:p-5 space-y-3.5">
                  {/* 카드 헤더: 뱃지 + 번호 + 북마크 버튼 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-50 text-[#4F46E5] text-[11px] font-black flex items-center justify-center font-mono">
                        {index + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-100/70 text-indigo-700">
                        {tip.badge}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSaveTip(tip.id)}
                      className={`text-xs font-semibold px-2 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                        isSaved
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-slate-200 text-slate-400 hover:text-slate-600 bg-slate-50'
                      }`}
                      title={isSaved ? '북마크 해제' : '꿀팁 보관하기'}
                    >
                      <span>{isSaved ? '★ 보관됨' : '☆ 꿀팁 보관'}</span>
                    </button>
                  </div>

                  {/* 메인 타이틀 & 핵심 강조 문구 */}
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900 leading-snug tracking-tight">
                      {tip.title}
                    </h3>
                    <p className="text-xs font-bold text-[#4F46E5] flex items-center gap-1">
                      <span>⚡</span>
                      <span>{tip.highlight}</span>
                    </p>
                  </div>

                  {/* 카드 본문: 이미지 + 설명 레이아웃 */}
                  <div className="flex flex-col sm:flex-row items-start gap-3.5 pt-1">
                    {tip.image && (
                      <div className="w-full sm:w-28 h-28 shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                        <img
                          src={tip.image}
                          alt={tip.title}
                          className="w-full h-full object-cover mix-blend-multiply"
                        />
                      </div>
                    )}

                    <div className="flex-1 space-y-2">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {tip.description}
                      </p>

                      {/* 핵심 요약 포인트 박스 */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100/80 space-y-1">
                        <span className="text-[11px] font-bold text-slate-700 block">
                          📌 꼭 체크할 핵심 포인트
                        </span>
                        <ul className="space-y-0.5 text-[11px] text-slate-600">
                          {tip.keyPoints.map((point, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-1.5 leading-relaxed">
                              <span className="text-indigo-500 font-bold shrink-0">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* 하단 태그 & 바로가기 버튼 */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tip.tags.map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          className="text-[10px] font-medium text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {tip.targetScreen && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate(tip.targetScreen)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>{tip.targetLabel}</span>
                        <span>→</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredTips.length === 0 && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
              <span className="text-3xl">🔍</span>
              <p className="text-sm font-bold text-slate-700">검색 조건에 맞는 절세 꿀팁이 없습니다.</p>
              <p className="text-xs text-slate-400">다른 검색어를 입력하시거나 카테고리를 전체로 변경해 보세요.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setActiveCategory('all');
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-indigo-50 text-[#4F46E5] font-bold text-xs hover:bg-indigo-100 transition cursor-pointer"
              >
                검색 조건 초기화
              </button>
            </div>
          )}
        </div>

        {/* 5. 하단 공통 주의사항 박스 */}
        <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200/60 text-xs text-amber-900 leading-relaxed space-y-1.5">
          <p className="font-extrabold flex items-center gap-1.5 text-amber-950">
            <span>⚠️ 과다공제 주의 안내</span>
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800/90">
            <li>
              형제자매 간 부모님 이중 공제, 연간 소득금액 100만 원 초과 부양가족의 기본공제 신청은 가산세가 부과될 수 있으니 주의하세요.
            </li>
            <li>
              실손의료보험금으로 보전받은 의료비는 연말정산 의료비 세액공제 대상에서 반드시 차감해야 합니다.
            </li>
          </ul>
        </div>
      </div>

      {/* 6. 하단 고정 액션 바 */}
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
