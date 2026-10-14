import React, { useState, useMemo } from 'react';
import HomeButton from '../components/HomeButton';

/**
 * 2025년도 연말정산 공제항목별 구비서류 총람 페이지
 * 첨부 이미지의 표 내용 전체 반영 + 세법상 누락/보완 항목(인적공제, 연금계좌, 노란우산, 혼인세액, 중소기업감면 등) 100% 보강
 */
export default function RequiredDocsPage({ onGoHome, onPrev }) {
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');
  // 카테고리 탭: 'all' | 'family' | 'housing' | 'medical' | 'education' | 'donation' | 'pension' | 'etc'
  const [activeCategory, setActiveCategory] = useState('all');
  // 유형 필터: 'all' | 'manual' (직접 발급 필수) | 'hometax' (국세청 조회 가능)
  const [typeFilter, setTypeFilter] = useState('all');
  // 체크리스트(내가 챙긴 서류 ID 세트)
  const [checkedItems, setCheckedItems] = useState(new Set());

  // 체크 토글
  const toggleCheck = (itemId) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // 인터넷 주요 발급처 바로가기 데이터 (첨부 이미지 상단 발급기관 안내 100% 반영)
  const onlineIssuers = [
    {
      name: '정부24',
      url: 'https://www.gov.kr',
      docs: '주민등록등본, 병적증명서, 장애인증명서',
      fee: '무료',
      icon: '🏛️',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      name: '대법원 인터넷등기소',
      url: 'http://www.iros.go.kr',
      docs: '건물등기부등본(등기사항증명서)',
      fee: '열람 700원 / 발급 1,000원',
      icon: '🏢',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      name: '전자가족관계등록시스템',
      url: 'https://efamily.scourt.go.kr',
      docs: '가족관계증명서, 혼인관계증명서',
      fee: '무료',
      icon: '👨‍👩‍👧',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      name: '부동산공시가격알리미',
      url: 'https://www.realtyprice.kr',
      docs: '개별(공동)주택가격확인서(기준시가)',
      fee: '무료 조회',
      icon: '🏠',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      name: '국세청 홈택스',
      url: 'https://www.hometax.go.kr',
      docs: '연말정산 간소화 PDF 다운로드',
      fee: '무료',
      icon: '📑',
      color: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  ];

  // 발급기관 바로가기 링크 매핑 헬퍼
  const getIssuerLink = (issuer) => {
    if (!issuer) return null;
    if (issuer.includes('정부24') || issuer.includes('주민센터')) {
      return { name: '정부24', url: 'https://www.gov.kr' };
    }
    if (issuer.includes('전자가족관계') || issuer.includes('가족관계')) {
      return { name: '전자가족관계등록', url: 'https://efamily.scourt.go.kr' };
    }
    if (issuer.includes('인터넷등기소') || issuer.includes('등기소')) {
      return { name: '대법원 인터넷등기소', url: 'http://www.iros.go.kr' };
    }
    if (issuer.includes('부동산공시') || issuer.includes('주택가격')) {
      return { name: '부동산공시가격알리미', url: 'https://www.realtyprice.kr' };
    }
    if (issuer.includes('홈택스') || issuer.includes('국세청')) {
      return { name: '국세청 홈택스', url: 'https://www.hometax.go.kr' };
    }
    if (issuer.includes('장학재단')) {
      return { name: '한국장학재단', url: 'https://www.kosaf.go.kr' };
    }
    if (issuer.includes('노란우산') || issuer.includes('중소기업중앙회')) {
      return { name: '노란우산공제', url: 'https://www.8899.or.kr' };
    }
    if (issuer.includes('고향사랑')) {
      return { name: '고향사랑e음', url: 'https://ilovegohyang.go.kr' };
    }
    return null;
  };

  // 공제 파트별 2D 플랫 일러스트 매핑 헬퍼 (TaxTipsPage와 100% 톤앤매너 매칭)
  const getCategoryIllustration = (sectionId) => {
    switch (sectionId) {
      case 'sec_family_disabled':
        return '/assets/tips_medical_heavy_2d.jpg';
      case 'sec_family_basic':
        return '/assets/tips_parents_2d.jpg';
      case 'sec_housing_loan':
        return '/assets/forecast_housing_2d.jpg';
      case 'sec_mortgage':
        return '/assets/tips_housing_savings_2d.jpg';
      case 'sec_monthly_rent':
        return '/assets/tips_rent_2d.jpg';
      case 'sec_medical':
        return '/assets/tips_medical_couple_2d.jpg';
      case 'sec_education':
        return '/assets/forecast_children_2d.jpg';
      case 'sec_donation':
        return '/assets/tips_donation_2d.jpg';
      case 'sec_pension_savings':
        return '/assets/tips_pension_2d.jpg';
      case 'sec_etc':
      default:
        return '/assets/forecast_wedding_2d.jpg';
    }
  };

  // 카테고리 탭 목록
  const categoryTabs = [
    { id: 'all', name: '전체' },
    { id: 'family', name: '인적/가족' },
    { id: 'housing', name: '주택/월세' },
    { id: 'medical', name: '의료비' },
    { id: 'education', name: '교육비' },
    { id: 'donation', name: '기부금' },
    { id: 'pension', name: '연금/저축' },
    { id: 'etc', name: '기타/감면' },
  ];

  // 구비서류 전체 마스터 데이터
  const docSections = useMemo(
    () => [
      // 1. 인적공제 / 부양가족 / 장애인 (첨부 이미지 1번 장애인 + 필수 부양가족 보완)
      {
        id: 'sec_family_disabled',
        num: '01',
        icon: '👨‍🦽',
        category: 'family',
        title: '장애인 공제 (추가공제)',
        badge: '인적공제',
        badgeType: 'personal',
        desc: '장애인복지법상 장애인, 국가유공자 상이자, 중증환자 1인당 연 200만 원 추가공제',
        items: [
          {
            id: 'doc_dis_1',
            type: '장애인복지법상 장애인',
            docName: '장애인증명서 또는 장애인등록증(복지카드) 사본',
            issuer: '읍·면·동 주민센터 또는 정부24',
            isHometax: false,
            tip: '정부24에서 무료 즉시 발급 가능하며, 한번 제출 후 변동 없으면 다음 해부터 재제출 불필요합니다.',
          },
          {
            id: 'doc_dis_2',
            type: '국가유공자 상이자',
            docName: '상이자증명서 사본',
            issuer: '국가보훈부(구 국가보훈처)',
            isHometax: false,
            tip: '상이등급이 기재된 증명서 사본을 제출합니다.',
          },
          {
            id: 'doc_dis_3',
            type: '항시 치료를 요하는 중증환자',
            docName: '장애인증명서 (소득세법 시행규칙 별지 제38호 서식)',
            issuer: '치료받는 의료기관(병원)',
            isHometax: false,
            tip: '암, 치매, 중풍, 만성신부전 등 지병으로 항시 치료가 필요한 경우 의사 진단 및 직인이 찍힌 소득세법 서식으로 발급받아야 합니다.',
          },
          {
            id: 'doc_dis_4',
            type: '건강보험 산정특례자',
            docName: '산정특례 등록 확인서류 (장애인증명서 등)',
            issuer: '국민건강보험공단 또는 병원',
            isHometax: false,
            tip: '중증질환, 희귀난치질환, 결핵 등으로 건강보험 산정특례에 등록된 자임을 증명하는 서류입니다.',
          },
        ],
      },
      {
        id: 'sec_family_basic',
        num: '02',
        icon: '👨‍👩‍👧',
        category: 'family',
        title: '기본공제 및 기타 인적공제 증빙 (보완)',
        badge: '인적공제',
        badgeType: 'personal',
        desc: '주민등록표상 동거하지 않는 가족, 입양자, 혼인신고 등 인적공제 요건 증명',
        items: [
          {
            id: 'doc_fam_1',
            type: '주민등록 분리 부모님(직계존속)',
            docName: '가족관계증명서 (상세)',
            issuer: '대법원 전자가족관계등록시스템 또는 주민센터',
            isHometax: false,
            tip: '주민등록등본상 함께 살지 않는 부모님을 기본공제 대상자로 등록할 때 가족관계를 입증하기 위해 필수 제출합니다.',
          },
          {
            id: 'doc_fam_2',
            type: '입양자 공제',
            docName: '입양관계증명서 또는 친양자입양관계증명서',
            issuer: '대법원 전자가족관계등록시스템',
            isHometax: false,
            tip: '기본공제 대상인 입양자임을 확인할 수 있는 증명서입니다.',
          },
          {
            id: 'doc_fam_3',
            type: '한부모 / 부녀자 공제',
            docName: '가족관계증명서, 주민등록등본',
            issuer: '정부24, 전자가족관계등록시스템',
            isHometax: false,
            tip: '배우자 유무 및 부양가족 세대주 여부를 확인하기 위해 필요합니다.',
          },
        ],
      },

      // 2. 주택자금 & 월세액 (첨부 이미지 2번, 10번, 11번 일치)
      {
        id: 'sec_housing_loan',
        num: '03',
        icon: '🏠',
        category: 'housing',
        title: '주택임차자금 차입금 (전세대출 원리금 상환)',
        badge: '소득공제',
        badgeType: 'income',
        desc: '무주택 세대주가 국민주택규모(또는 기준시가 4억 이하) 주택 전세대출 원리금 상환 시 공제 (원리금상환액 40%, 연 400만 한도)',
        items: [
          {
            id: 'doc_hl_1',
            type: '금융기관 차입 전세대출',
            docName: '주택자금상환등증명서',
            issuer: '대출 금융회사',
            isHometax: true,
            tip: '국세청 홈택스 간소화 서비스에서 자동 조회되며, 조회되지 않는 경우 대출받은 은행에서 발급받습니다.',
          },
          {
            id: 'doc_hl_2',
            type: '금융기관 차입 전세대출',
            docName: '주민등록등본',
            issuer: '정부24 또는 주민센터',
            isHometax: false,
            tip: '대출 입금일 전후 3개월 이내에 전입신고가 완료되어 주소지가 일치하는지 확인합니다.',
          },
          {
            id: 'doc_hl_3',
            type: '개인간 차입 전세대출 (거주자간 차입)',
            docName: '주택자금상환등증명서 (대주 발행)',
            issuer: '대주(貸主, 대여자)',
            isHometax: false,
            tip: '돈을 빌려준 개인(대주)이 작성한 상환 증명 서류입니다.',
          },
          {
            id: 'doc_hl_4',
            type: '개인간 차입 전세대출',
            docName: '임대차계약서 사본, 금전소비대차계약서 사본',
            issuer: '본인 보관',
            isHometax: false,
            tip: '차입금 이자율이 연 1.2% 이상이어야 하며 계약서류 사본을 구비해야 합니다.',
          },
          {
            id: 'doc_hl_5',
            type: '개인간 차입 전세대출',
            docName: '원리금 상환 증명서류 (계좌이체영수증, 무통장입금증)',
            issuer: '거래 은행(인터넷뱅킹 이체확인증)',
            isHometax: false,
            tip: '차입일로부터 실제 원금과 이자를 상환한 내역을 증빙합니다.',
          },
          {
            id: 'doc_hl_6',
            type: '개인간 차입 전세대출',
            docName: '월세액·거주자간 주택임차자금 차입금 원리금 상환액 소득공제 명세서',
            issuer: '본인 작성',
            isHometax: false,
            tip: '국세청 소득공제신고서 부속명세서 서식으로 본인이 직접 작성합니다.',
          },
        ],
      },
      {
        id: 'sec_mortgage',
        num: '04',
        icon: '🏢',
        category: 'housing',
        title: '장기주택저당차입금 (주택담보대출 이자상환액)',
        badge: '소득공제',
        badgeType: 'income',
        desc: '무주택 또는 1주택 세대주가 취득당시 기준시가(5억/6억 이하) 주택 담보대출 이자 상환 시 최대 600~2,000만 원 공제',
        items: [
          {
            id: 'doc_mt_1',
            type: '장기주택저당차입금',
            docName: '장기주택저당차입금 이자상환증명서',
            issuer: '대출 금융회사',
            isHometax: true,
            tip: '국세청 홈택스 간소화 서비스에서 조회 가능합니다.',
          },
          {
            id: 'doc_mt_2',
            type: '장기주택저당차입금',
            docName: '개별(공동) 주택가격확인서',
            issuer: '국토교통부 부동산공시가격알리미 or 시·군·구청',
            isHometax: false,
            tip: '주택 취득 당시의 기준시가(공시가격)를 증명하는 서류로, 부동산공시가격알리미 사이트에서 무료 출력 가능합니다.',
          },
          {
            id: 'doc_mt_3',
            type: '장기주택저당차입금',
            docName: '건물등기부등본(등기사항증명서) 또는 분양계약서 사본',
            issuer: '대법원 인터넷등기소 or 본인 보관',
            isHometax: false,
            tip: '주택 소유권 이전등기일 및 근저당권 설정일, 대출 실행일을 대조 확인합니다.',
          },
          {
            id: 'doc_mt_4',
            type: '장기주택저당차입금',
            docName: '기존 및 신규차입금 대출계약서 사본 (대환·차환, 만기연장 시)',
            issuer: '금융회사 등',
            isHometax: false,
            tip: '기존 대출을 다른 금융회사로 대환하거나 상환기간을 연장한 경우 대출계약서를 제출합니다.',
          },
          {
            id: 'doc_mt_5',
            type: '주택자금 차입금 이자세액공제',
            docName: '미분양주택확인서 및 매매계약서, 등기부등본',
            issuer: '해당 지방자치단체 / 금융기관',
            isHometax: false,
            tip: '미분양주택 취득 차입금에 대한 세액공제 신청 시 필수입니다.',
          },
        ],
      },
      {
        id: 'sec_monthly_rent',
        num: '05',
        icon: '🔑',
        category: 'housing',
        title: '월세액 세액공제',
        badge: '세액공제',
        badgeType: 'tax',
        desc: '총급여 8,000만 원 이하 무주택 세대주가 국민주택규모 또는 기준시가 4억 이하 주택 월세 지급 시 15~17% 세액공제 (연 1,000만 원 한도)',
        items: [
          {
            id: 'doc_mr_1',
            type: '월세액 공제 공통',
            docName: '임대차계약서 사본',
            issuer: '본인 보관',
            isHometax: false,
            tip: '임대차계약서상 주소지와 주민등록등본상 주소지가 일치해야 하며, 확정일자는 받지 않아도 공제 가능합니다.',
          },
          {
            id: 'doc_mr_2',
            type: '월세액 공제 공통',
            docName: '주민등록등본',
            issuer: '정부24 또는 주민센터',
            isHometax: false,
            tip: '임대차계약 기간 중 전입신고가 완료되어 거주 중임을 확인하는 필수 증빙입니다.',
          },
          {
            id: 'doc_mr_3',
            type: '월세액 공제 공통',
            docName: '월세액 지급 증명서류 (계좌이체영수증, 무통장입금증, 현금영수증 등)',
            issuer: '은행 인터넷뱅킹 이체확인증 또는 홈택스',
            isHometax: false,
            tip: '임대인(집주인) 계좌로 실제 월세를 송금한 내역을 증빙합니다. 집주인이 홈택스 현금영수증을 발급해 준 경우 간소화에서 조회됩니다.',
          },
        ],
      },

      // 3. 의료비 세액공제 (첨부 이미지 7번 일치 + 세부안내)
      {
        id: 'sec_medical',
        num: '06',
        icon: '🏥',
        category: 'medical',
        title: '의료비 세액공제',
        badge: '세액공제',
        badgeType: 'tax',
        desc: '총급여 3% 초과 의료비 지출액의 15% (난임시술비 30%, 미숙아·선천성이상아 20%) 세액공제',
        items: [
          {
            id: 'doc_med_1',
            type: '난임시술비',
            docName: '진료비(약제비) 납입확인서',
            issuer: '병·의원, 약국',
            isHometax: false,
            tip: '국세청 간소화에서 일반의료비로 분류되어 30% 공제율이 누락될 수 있으므로, 의료기관에서 "난임시술비" 명기된 납입확인서를 발급받아 제출합니다.',
          },
          {
            id: 'doc_med_2',
            type: '시력보정용 안경·콘택트렌즈',
            docName: '사용자 성명 및 시력교정용임이 명시된 안경사 확인 영수증',
            issuer: '안경점',
            isHometax: true,
            tip: '1인당 연 50만 원 한도. 국세청 간소화에서 일부 안경원은 자동 조회되나, 누락된 경우 안경원에서 직접 영수증을 발급받아 제출해야 합니다.',
          },
          {
            id: 'doc_med_3',
            type: '보청기 및 장애인보장구',
            docName: '사용자 성명을 판매자가 확인한 영수증',
            issuer: '의료기기 구입처/판매점',
            isHometax: false,
            tip: '보청기, 휠체어, 목발 등 장애인보장구 구입비용은 간소화에 안 뜨므로 판매처에서 성명 표기된 영수증을 받아 제출합니다.',
          },
          {
            id: 'doc_med_4',
            type: '건강보험 산정특례 대상자',
            docName: '장애인증명서 등 산정특례 대상자 등록 증명서류',
            issuer: '의료기관 등',
            isHometax: false,
            tip: '산정특례자로 등록된 자를 증명하는 서류로, 의료비 전액 공제 혜택을 받기 위해 필수입니다.',
          },
          {
            id: 'doc_med_5',
            type: '산후조리원 비용',
            docName: '이용자의 성명과 이용대가를 확인한 영수증',
            issuer: '산후조리원',
            isHometax: true,
            tip: '출산 1회당 200만 원 한도. 홈택스 간소화에서 조회 가능하나, 누락된 경우 산후조리원에서 직접 영수증을 수집합니다.',
          },
        ],
      },

      // 4. 교육비 세액공제 (첨부 이미지 8번 일치)
      {
        id: 'sec_education',
        num: '07',
        icon: '🎓',
        category: 'education',
        title: '교육비 세액공제',
        badge: '세액공제',
        badgeType: 'tax',
        desc: '근로자 본인 및 부양가족의 교육비 지출액 15% 세액공제 (취학전/초중고 300만, 대학생 900만, 장애인특수교육 전액)',
        items: [
          {
            id: 'doc_edu_1',
            type: '수업료, 등록금 등',
            docName: '교육비납입증명서',
            issuer: '유치원·초·중·고·대학교 등 교육기관',
            isHometax: true,
            tip: '홈택스 간소화 서비스에서 대부분 자동 조회됩니다.',
          },
          {
            id: 'doc_edu_2',
            type: '취학 전 아동 학원비',
            docName: '교육비납입증명서',
            issuer: '학원 및 체육시설(태권도장, 수영장 등)',
            isHometax: false,
            tip: '초등학교 입학 전 아동의 주 1회 이상 월단위 학원비·체육시설 수강료는 국세청 조회가 안 되는 곳이 많으므로 학원에서 직접 발급받습니다.',
          },
          {
            id: 'doc_edu_3',
            type: '중·고등학생 교복구입비',
            docName: '교복구입비 영수증(교육비납입증명서)',
            issuer: '교복 판매점',
            isHometax: true,
            tip: '중·고등학생 1인당 연 50만 원 한도. 간소화에서 조회되지 않는 경우 교복판매점에서 학생 이름이 들어간 영수증을 받아 제출합니다.',
          },
          {
            id: 'doc_edu_4',
            type: '장애인 특수교육비',
            docName: '교육비납입증명서 및 특수교육시설 해당 입증서류',
            issuer: '사회복지시설, 발달재활서비스 제공기관',
            isHometax: false,
            tip: '장애인을 위해 지출한 특수교육비는 전액 공제 대상이며 시설 인가 서류 사본을 첨부합니다.',
          },
          {
            id: 'doc_edu_5',
            type: '학자금대출 상환액',
            docName: '교육비납입증명서 (학자금대출 원리금상환)',
            issuer: '한국장학재단 또는 금융회사',
            isHometax: true,
            tip: '한국장학재단 취업 후 상환 학자금대출 원리금 상환 내역은 홈택스에서 자동 조회됩니다.',
          },
          {
            id: 'doc_edu_6',
            type: '국외 교육비 (해외 유학)',
            docName: '교육비납입 증명서류, 재학증명서, 유학자격 입증서류',
            issuer: '국외 교육기관 및 교육부',
            isHometax: false,
            tip: '국외 교육기관의 교육비 영수증, 재학증명서, 국외유학인정서(중학생 이하) 또는 부모 해외근무 증빙서류 사본을 제출합니다.',
          },
        ],
      },

      // 5. 기부금 세액공제 (첨부 이미지 9번 일치)
      {
        id: 'sec_donation',
        num: '08',
        icon: '🤲',
        category: 'donation',
        title: '기부금 세액공제',
        badge: '세액공제',
        badgeType: 'tax',
        desc: '정치자금, 고향사랑, 특례기부금, 우리사주, 일반기부금(종교/종교외) 15~30% 세액공제',
        items: [
          {
            id: 'doc_don_1',
            type: '정치자금기부금',
            docName: '정치자금기부금 영수증',
            issuer: '중앙선거관리위원회 또는 정당/후원회',
            isHometax: true,
            tip: '중앙선관위 기탁금 또는 국회의원 후원회 기부금은 홈택스 간소화에서 자동 조회됩니다.',
          },
          {
            id: 'doc_don_2',
            type: '기부금 공통 (특례, 일반기부금)',
            docName: '기부금 영수증',
            issuer: '기부처 (복지재단, 종교단체, 학교 등)',
            isHometax: true,
            tip: '국세청 홈택스 간소화에 등록된 기부처는 자동 조회됩니다. 미등록 기부처(일부 종교단체 등)의 경우 기부처 발급 기부금영수증 및 법인설립허가증 사본을 수기 제출합니다.',
          },
          {
            id: 'doc_don_3',
            type: '고향사랑기부금 (보완)',
            docName: '고향사랑기부금 영수증',
            issuer: '고향사랑e음 또는 지자체',
            isHometax: true,
            tip: '10만 원까지 전액(100/110) 세액공제되며 홈택스 간소화에서 자동 조회됩니다.',
          },
        ],
      },

      // 6. 연금계좌 & 주택마련저축 (첨부 이미지 3, 4번 + 연금저축/IRP 보완)
      {
        id: 'sec_pension_savings',
        num: '09',
        icon: '🪙',
        category: 'pension',
        title: '연금계좌 및 주택마련저축',
        badge: '소득·세액공제',
        badgeType: 'combo',
        desc: '연금저축/IRP(최대 900만 원, 12~15% 세액공제), 청약저축(연 300만 원 40% 소득공제)',
        items: [
          {
            id: 'doc_pen_1',
            type: '개인연금저축 (2000.12.31 이전 가입)',
            docName: '개인연금저축납입증명서 또는 통장사본',
            issuer: '금융회사 등',
            isHometax: true,
            tip: '구 개인연금저축으로 연 72만 원 한도 소득공제 대상입니다.',
          },
          {
            id: 'doc_pen_2',
            type: '주택마련저축 (청약저축, 주택청약종합저축)',
            docName: '주택마련저축납입증명서 또는 통장사본',
            issuer: '금융회사 등',
            isHometax: true,
            tip: '총급여 7천만 원 이하 무주택 세대주 대상이며, 해당 은행에 무주택확인서가 사전 등록되어 있어야 국세청 간소화에 정상 조회됩니다.',
          },
          {
            id: 'doc_pen_3',
            type: '연금저축 / IRP 퇴직연금 (보완)',
            docName: '연금계좌 납입확인서',
            issuer: '은행, 증권사, 보험사',
            isHometax: true,
            tip: '홈택스 간소화에서 자동 조회되며, 누락 시 가입 금융기관 앱/홈페이지에서 즉시 발급 가능합니다.',
          },
        ],
      },

      // 7. 기타 공제 & 감면 (첨부 이미지 5, 6번 + 노란우산, 혼인세액공제, 중소기업감면 보완)
      {
        id: 'sec_etc',
        num: '10',
        icon: '💼',
        category: 'etc',
        title: '투자·출연 및 기타 공제·감면',
        badge: '소득·세액공제',
        badgeType: 'combo',
        desc: '벤처투자, 우리사주, 소기업소상공인, 혼인세액공제, 중소기업 감면 등',
        items: [
          {
            id: 'doc_etc_1',
            type: '벤처투자조합출자 공제',
            docName: '출자등 소득공제신청서, 출자(투자)확인서',
            issuer: '본인 작성 / 중소벤처기업부, 투자조합관리자',
            isHometax: false,
            tip: '개인투자조합 출자 또는 벤처기업 직접투자 시 투자확인서를 발급받아 신청서와 함께 제출합니다.',
          },
          {
            id: 'doc_etc_2',
            type: '우리사주조합출연금',
            docName: '우리사주조합출연금액확인서',
            issuer: '우리사주조합',
            isHometax: false,
            tip: '우리사주조합원이 조합에 출연한 금액에 대해 연 400만 원(벤처 1,500만 원) 한도 소득공제됩니다.',
          },
          {
            id: 'doc_etc_3',
            type: '소기업·소상공인 공제부금 (노란우산공제) [보완]',
            docName: '소기업소상공인공제부금 납입확인서',
            issuer: '중소기업중앙회 (노란우산 홈페이지)',
            isHometax: true,
            tip: '법인 대표자(총급여 7천 이하) 또는 사업소득자 공제. 국세청 간소화에서 조회 가능합니다.',
          },
          {
            id: 'doc_etc_4',
            type: '혼인세액공제 (2024~2026년 신설) [보완]',
            docName: '혼인관계증명서 (상세)',
            issuer: '대법원 전자가족관계등록시스템',
            isHometax: false,
            tip: '2024년 1월 1일 이후 혼인신고한 신혼부부 1인당 50만 원(부부 합산 최대 100만 원) 세액공제됩니다.',
          },
          {
            id: 'doc_etc_5',
            type: '중소기업 취업자 소득세 감면 [보완]',
            docName: '중소기업 취업자 소득세 감면신청서, 주민등록등본, 병적증명서(청년)',
            issuer: '정부24, 병무청 / 회사 제출',
            isHometax: false,
            tip: '청년(15~34세, 군복무 최대 6년 가산), 60세 이상, 장애인, 경력단절여성이 중소기업 취업 시 3~5년간 70~90%(연 최대 200만) 감면됩니다.',
          },
        ],
      },
    ],
    []
  );

  // 검색 및 필터링된 섹션 목록
  const filteredSections = useMemo(() => {
    return docSections
      .filter((section) => {
        if (activeCategory !== 'all' && section.category !== activeCategory) {
          return false;
        }
        return true;
      })
      .map((section) => {
        const filteredItems = section.items.filter((item) => {
          // 유형 필터
          if (typeFilter === 'manual' && item.isHometax) return false;
          if (typeFilter === 'hometax' && !item.isHometax) return false;

          // 검색어 필터
          if (!searchTerm.trim()) return true;
          const q = searchTerm.toLowerCase();
          return (
            item.docName.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q) ||
            item.issuer.toLowerCase().includes(q) ||
            item.tip.toLowerCase().includes(q) ||
            section.title.toLowerCase().includes(q)
          );
        });

        return {
          ...section,
          items: filteredItems,
        };
      })
      .filter((section) => section.items.length > 0);
  }, [docSections, activeCategory, typeFilter, searchTerm]);

  // 총 서류 개수 및 체크 개수 계산
  const totalItemCount = useMemo(() => {
    let count = 0;
    docSections.forEach((s) => {
      count += s.items.length;
    });
    return count;
  }, [docSections]);

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
              <span>연말정산 구비서류 총람</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                2025 귀속
              </span>
            </h1>
          </div>
        </div>

        <HomeButton onClick={onGoHome} />
      </div>

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="flex-1 px-4 sm:px-5 py-4 space-y-4 overflow-y-auto">
        {/* 상단 히어로 배너: 첨부 이미지 안내 사항 (국세청 조회 여부 및 직접 수집 안내) */}
        <div className="bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-4 sm:p-5 text-white shadow-md relative overflow-hidden">
          {/* 배경 은은한 워터마크 효과 */}
          <div className="absolute right-[-10px] bottom-[-15px] opacity-10 pointer-events-none">
            <svg className="w-40 h-40 fill-white" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-bold text-white tracking-wide">
                <span>💡 근로자 연말정산 서류 준비 가이드</span>
              </div>

              {/* 제목: '어떤 서류를 준비해야 할지 한눈에 확인하세요'를 한 줄로 표시 */}
              <div className="py-0.5">
                <h2 className="text-[15px] sm:text-[18px] md:text-xl font-black leading-snug tracking-tight text-white whitespace-nowrap">
                  어떤 서류를 준비해야 할지 한눈에 확인하세요
                </h2>
              </div>

              <div className="text-xs text-indigo-100/95 leading-relaxed pt-1 space-y-1">
                <p className="flex items-start gap-1.5">
                  <span className="font-bold text-white shrink-0">※ [국세청조회]</span>
                  <span>
                    홈택스 간소화에서 자동 제공되나, 발급기관이 국세청에 미제출한 경우 영수증 발급기관에서 <b>직접 수집</b>하셔야 합니다.
                  </span>
                </p>
                <p className="flex items-start gap-1.5">
                  <span className="font-bold text-amber-200 shrink-0">※ [직접제출]</span>
                  <span>
                    월세 이체내역, 안경 영수증, 취학전 학원비, 중증환자 장애인증명서 등은 근로자가 <b>회사에 직접 제출</b>해야 세금을 환급받습니다.
                  </span>
                </p>
              </div>
            </div>

            {/* 우측 전용 2D 서류 일러스트레이션 카드 (태블릿/PC 화면 대응) */}
            <div className="hidden sm:flex items-center justify-center shrink-0 w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-white/15 backdrop-blur-xs border border-white/25 shadow-inner p-2 hover:scale-105 transition-transform duration-300">
              <img
                src="/assets/docs_banner_2d.svg"
                alt="2D 구비서류 일러스트"
                className="w-full h-full object-contain filter drop-shadow-md"
              />
            </div>
          </div>
        </div>

        {/* 3. 인터넷을 이용한 주요 첨부서류 발급 바로가기 (첨부 이미지 상단 발급기관 100% 매칭) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 tracking-tight">
              <span className="p-1 rounded-lg bg-indigo-50 text-[#4F46E5] text-base leading-none">🌐</span>
              <span>인터넷 주요 서류 발급처 바로가기</span>
            </h3>
            <span className="text-xs font-bold text-[#4F46E5] bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100/80">
              클릭 시 이동 ↗
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {onlineIssuers.map((issuer, idx) => (
              <a
                key={idx}
                href={issuer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl border border-slate-100 bg-[#F8FAFC] hover:bg-white hover:border-indigo-300 hover:shadow-xs transition flex items-start gap-2.5 group cursor-pointer"
              >
                <span className="text-xl shrink-0 p-1.5 rounded-lg bg-white border border-slate-100 shadow-2xs group-hover:scale-105 transition">
                  {issuer.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition truncate">
                      {issuer.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 font-mono shrink-0">
                      {issuer.fee}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{issuer.docs}</p>
                  <span className="text-[10px] text-indigo-600 font-medium group-hover:underline inline-flex items-center gap-0.5 mt-1">
                    바로가기 ↗
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* 4. 검색창 및 스마트 필터 바 */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs space-y-3 sticky top-[57px] z-20">
          {/* 검색 입력창 */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="서류명, 공제항목, 발급기관 검색 (예: 안경, 월세, 주민등록등본, 난임, 중증환자)"
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

          {/* 카테고리 탭 (가로 스크롤 가능) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {categoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeCategory === tab.id
                    ? 'bg-[#4F46E5] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>

          {/* 서브 유형 필터 (전체 / 직접제출 필수 / 국세청 조회 가능) & 준비 진행 현황 */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">구분:</span>
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-[#4F46E5] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('manual')}
                className={`px-2 py-0.8 rounded text-[11px] font-semibold cursor-pointer flex items-center gap-1 ${
                  typeFilter === 'manual'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
                }`}
              >
                <span>⚡ 직접 발급 필수만</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('hometax')}
                className={`px-2 py-0.8 rounded text-[11px] font-semibold cursor-pointer flex items-center gap-1 ${
                  typeFilter === 'hometax'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/60'
                }`}
              >
                <span>✓ 국세청 조회 가능만</span>
              </button>
            </div>

            {/* 체크리스트 준비 현황 배지 */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">
                준비 완료: <b className="text-[#4F46E5]">{checkedItems.size}</b> / {totalItemCount}건
              </span>
              {checkedItems.size > 0 && (
                <button
                  type="button"
                  onClick={() => setCheckedItems(new Set())}
                  className="text-[10px] text-slate-400 hover:text-rose-500 underline cursor-pointer"
                >
                  초기화
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 5. 구비서류 목록 카드 섹션 */}
        <div className="space-y-4 sm:space-y-5">
          {filteredSections.map((section) => {
            // 뱃지 스타일 헬퍼
            const getBadgeClass = (type) => {
              switch (type) {
                case 'personal':
                  return 'bg-indigo-600 text-white border-indigo-700 shadow-2xs';
                case 'income':
                  return 'bg-[#4F46E5] text-white border-indigo-700 shadow-2xs';
                case 'tax':
                  return 'bg-emerald-600 text-white border-emerald-700 shadow-2xs';
                case 'combo':
                default:
                  return 'bg-amber-600 text-white border-amber-700 shadow-2xs';
              }
            };

            const getHeaderTheme = (type) => {
              switch (type) {
                case 'personal':
                  return 'border-l-indigo-500 bg-indigo-50/60 border-b border-indigo-100';
                case 'income':
                  return 'border-l-[#4F46E5] bg-indigo-50/60 border-b border-indigo-100';
                case 'tax':
                  return 'border-l-emerald-500 bg-emerald-50/60 border-b border-emerald-100';
                case 'combo':
                default:
                  return 'border-l-amber-500 bg-amber-50/60 border-b border-amber-100';
              }
            };

            return (
              <div
                key={section.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition hover:shadow-md hover:border-slate-300"
              >
                {/* 섹션 헤더 (큰제목): 번호 뱃지 + 제목 + 공제종류 뱃지 + 설명문 */}
                <div
                  className={`px-4 sm:px-5 py-3 sm:py-3.5 border-l-4 ${getHeaderTheme(
                    section.badgeType
                  )} flex items-center justify-between gap-3`}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
                    {/* 파트 순번 뱃지: 파랑색 표기 */}
                    <span className="w-6 h-6 rounded-lg bg-[#4F46E5] text-white text-xs font-black flex items-center justify-center font-mono shadow-2xs shrink-0 mt-0.5">
                      {section.num}
                    </span>

                    {/* 제목과 설명을 세로로 묶어, 설명의 시작점을 제목 시작점과 일치하도록 정렬 */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                        {/* 공제 파트 제목: 아이콘 없이 깔끔하고 굵은 폰트 */}
                        <h3 className="text-base sm:text-[17px] font-black text-slate-900 tracking-tight">
                          {section.title}
                        </h3>

                        {/* 공제 종류 뱃지 (선명한 색상) */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wide border ${getBadgeClass(
                            section.badgeType
                          )}`}
                        >
                          {section.badge}
                        </span>
                      </div>

                      {/* 공제 설명: 제목 시작 위치와 수직으로 칼같이 줄 맞춤 */}
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {section.desc}
                      </p>
                    </div>
                  </div>

                  {/* 우측 항목 수 배지 */}
                  <div className="shrink-0 flex items-center self-center pl-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-[#4F46E5]" />
                      총 <b className="text-[#4F46E5] font-mono text-sm">{section.items.length}</b>건 서류
                    </span>
                  </div>
                </div>

                {/* 섹션 내 개별 서류 리스트: 큰제목 아래 간결하고 심플한 리스트 형식 */}
                <div className="bg-white divide-y divide-slate-100 border-t border-slate-100">
                  {section.items.map((item, itemIndex) => {
                    const isChecked = checkedItems.has(item.id);
                    const issuerLink = getIssuerLink(item.issuer);
                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 sm:p-4.5 transition-colors ${
                          isChecked ? 'bg-indigo-50/20' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        {/* 좌측 번호와 우측 본문 분리: 번호 아래 글자가 번호 뒷쪽(우측)으로 깔끔하게 정렬 */}
                        <div className="flex items-start gap-3">
                          {/* 1. 번호 뱃지 (좌측 고정) */}
                          <span
                            className={`w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full text-[11px] font-bold flex items-center justify-center font-mono shrink-0 mt-0.5 ${
                              isChecked
                                ? 'bg-slate-100 text-slate-400'
                                : 'bg-indigo-50 text-[#4F46E5] border border-indigo-200/70'
                            }`}
                          >
                            {itemIndex + 1}
                          </span>

                          {/* 2. 번호 뒷쪽(우측) 콘텐츠 전체: 서류명, 태그, 발급기관, 설명이 일관되게 정렬 */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {/* 상단 라인: 서류명(주인공으로 선명하고 간결하게 강조) + 챙기기 버튼 */}
                            <div className="flex items-start justify-between gap-3">
                              <h4
                                className={`text-[14.5px] sm:text-[15.5px] font-bold leading-snug tracking-tight ${
                                  isChecked ? 'line-through text-slate-400 font-normal' : 'text-slate-900'
                                }`}
                              >
                                {item.docName}
                              </h4>

                              {/* 챙기기 토글 버튼 */}
                              <button
                                type="button"
                                onClick={() => toggleCheck(item.id)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer shrink-0 ${
                                  isChecked
                                    ? 'border-indigo-400 bg-indigo-50 text-[#4F46E5] font-bold'
                                    : 'border-slate-200 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100'
                                }`}
                                title={isChecked ? '챙김 완료 해제' : '구비서류 챙기기'}
                              >
                                <span>{isChecked ? '✓ 챙김 완료' : '○ 서류 챙기기'}</span>
                              </button>
                            </div>

                            {/* 중간 라인: 간결한 메타 정보 (구분 뱃지 + 발급방식 뱃지 + 발급처 + 바로가기 링크) */}
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              {item.type && (
                                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                                  {item.type}
                                </span>
                              )}

                              {item.isHometax ? (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                  국세청 간소화 자동조회
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/70">
                                  <span>⚡</span>
                                  직접 발급 필수 (수기제출)
                                </span>
                              )}

                              <span className="text-slate-300 font-light hidden sm:inline">|</span>

                              <div className="inline-flex items-center gap-1.5 flex-wrap text-[11.5px] text-slate-600">
                                <span>
                                  발급처: <b className="text-slate-800 font-semibold">{item.issuer}</b>
                                </span>

                                {issuerLink && (
                                  <a
                                    href={issuerLink.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-[#4F46E5] font-bold hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <span>{issuerLink.name} 바로가기</span>
                                    <span>↗</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* 하단 라인: 설명 안내문 (바탕색을 완전히 빼고 심플한 텍스트로 깔끔하게 표시) */}
                            {item.tip && (
                              <p className="text-xs text-slate-500 leading-relaxed pt-0.5 flex items-start gap-1.5">
                                <span className="text-indigo-500/70 shrink-0 font-bold">•</span>
                                <span>{item.tip}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredSections.length === 0 && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
              <span className="text-3xl">🔍</span>
              <p className="text-sm font-bold text-slate-700">검색 조건에 맞는 구비서류가 없습니다.</p>
              <p className="text-xs text-slate-400">다른 검색어를 입력하시거나 필터를 전체로 변경해 보세요.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setActiveCategory('all');
                  setTypeFilter('all');
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-indigo-50 text-[#4F46E5] font-bold text-xs hover:bg-indigo-100 transition cursor-pointer"
              >
                검색 필터 초기화
              </button>
            </div>
          )}
        </div>

        {/* 6. 하단 안내 및 다운로드 팁 박스 */}
        <div className="bg-slate-100/90 rounded-2xl p-4 border border-slate-200/80 text-xs text-slate-500 leading-relaxed space-y-1.5">
          <p className="font-bold text-slate-700 flex items-center gap-1.5">
            <span>📌 회사 제출 시 주의사항</span>
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
            <li>모든 증빙 서류는 <b>2025년 12월 31일 기준</b>으로 발급된 유효한 서류여야 합니다.</li>
            <li>주민등록등본 및 가족관계증명서는 <b>주민등록번호 뒷자리가 모두 표기</b>되거나 세법상 요구되는 형식으로 발급받아야 합니다.</li>
            <li>간소화 서비스 미제출 의료비는 1월 15일~17일 사이 국세청 홈택스 <b>의료비 신고센터</b>에 신고하면 1월 20일경 재반영될 수 있습니다.</li>
          </ul>
        </div>
      </div>

      {/* 하단 고정 액션 바: 목록 닫기 및 홈화면 이동 */}
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

