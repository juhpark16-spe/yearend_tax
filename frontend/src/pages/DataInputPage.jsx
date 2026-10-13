import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import TaxStepProgressBar from '../components/TaxStepProgressBar';
import HomeButton from '../components/HomeButton';
import UserAuthStatus from '../components/UserAuthStatus';
import DesignAlertModal from '../components/DesignAlertModal';
import HousingLoanSection, { getMortgageLoanLimit } from '../components/tax_sections/HousingLoanSection';
import HousingSavingsSection from '../components/tax_sections/HousingSavingsSection';
import PensionSection, { calculatePensionDisplayMap } from '../components/tax_sections/PensionSection';
import SmallBizSection from '../components/tax_sections/SmallBizSection';
import LongInvestSection, { calculateLongInvestDeductible } from '../components/tax_sections/LongInvestSection';
import OtherDeductSection from '../components/tax_sections/OtherDeductSection';
import DonationCarryoverSection from '../components/tax_sections/DonationCarryoverSection';
import { getSecureItem, setSecureItem, maskLandlordId, maskRrn } from '../utils/secureStorage';
import { calculateEarnedIncomeDeduction, calculateSettlementTax } from '../utils/taxCalculator';
import { buildNtsHousingLoanItems, buildNtsHousingSavingsItems, buildNtsSmallBizItems, hasCurrentNtsItems, ntsSourceKey } from '../utils/ntsChecklistItems';
import { isIncomeExcessMember, isSelfOnlyDonationType, shouldExcludeBasicDeduction } from '../utils/eligibility';

/**
 * [Step 3] 공제자료 입력 & 의료비 관리 화면
 * 첨부 이미지 5종 완벽 대응:
 * 1. 이미지 5: 공제자료 입력 메인 화면 (Step 3 바, 안내문구, 7개 공제항목 목록, 작성완료 하기)
 * 2. 이미지 4: 의료비 조회 화면 (파란색 히어로 카드, 합계금액, 조회할 자료가 없습니다, + 자료입력)
 * 3. 이미지 1: 의료비 수정 화면 (✕ 의료비 수정, 기타자료, + 기타자료 추가)
 * 4. 이미지 2: 의료비 추가 폼 및 부양가족 선택 바텀시트 (✕ 의료비 추가, 성명*, 부양가족 바텀시트)
 */
// 공제항목별 안내 가이드 데이터 (알아보기, 절세팁, 구비서류 - 첨부 이미지 스펙 100% 일치)
const deductionGuideData = {
  education: {
    title: '교육비 공제',
    about: {
      question: '교육비에 대해 알아볼까요?',
      sections: [
        {
          title: '교육비 세액 공제란?',
          content: '본인,기본공제대상자 (나이 제한을 받지않음)를 위하여 교육비를 지급한 경우 15% 세액공제 받을 수 있습니다.',
        },
        {
          title: '교육비 공제대상',
          bullets: [
            '수업료, 입학금, 보육비 등',
            '학교등의 급식비(우유급식 포함)',
            '학교에서 구입한 교과서대금 (초중고등학생만 해당)',
            '교복(체육복)구입비용은 중고등학생만 해당되며 1명당 연 50만원 한도',
            '체험학습비는 초중고등학생 1인당 연 30만원 한도',
            '근로자(대출자)가 상환하는 학자금 대출의 원리금 (단, 기교육비 공제받은 경우 제외)',
            '근로소득자가 기본공제대상인 장애인 (소득의 제한을 받지 아니함)의 재활교육을 위하여 시설 등에 지급하는 교육비(특수교육비)',
          ],
        },
        {
          title: '교육비 공제한도',
          bullets: [
            '본인 교육비 (대학원포함) : 전액',
            '장애인특수교육비 : 전액',
            '기본공제대상자(직계존속 제외) 중 취학전 아동 , 초중고등학생 1명당 연 300만원',
            '대학생 : 1명당 연 900만원(대학원은 공제대상 아님)',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '근로자(대출자)가 상환하는 학자금 대출의 원리금도 교육비 공제를 받을 수 있습니다.' },
      { id: 'TIP 02', text: '초등학교에 입학한 자녀를 위해 입학전(1~2월)에 지출한 음악·미술·체육 등의 학원비(주1회 실시하는 월단위 과정) 도 교육비 세액공제를 받을 수 있습니다.' },
      { id: 'TIP 03', text: '취학전아동의 경우 영어유치원의 경우에도 교육비 세액공제를 받을 수 있습니다.' },
      { id: 'TIP 04', text: '육아휴직이나 기타 다른 휴직 중 지출한 교육비 모두 공제요건을 만족하면 세액공제를 받을 수 있습니다.' },
      { id: 'TIP 04', text: '고등학교 재학중 특차모집에 합격하여 납부한 대학등록금은 대학생이 된 연도에 공제 가능합니다.' },
      { id: 'TIP 05', text: '대학원 입학전에 납부한 본인 교육비는 대학원생이 된 연도에 공제받을 수 있습니다.' },
    ],
    notice: [
      '정규수업시간 외에 실시하는 실기지도비,학교버스이용료,기숙사비, 어학 연수비, 학습지 이용료 등은 교육비 세액공제를 받을 수 없습니다.',
      '유치원이나 어린이집의 방과후 과정 재료비, 현장학습비, 차량운행비 등은 교육비 세액공제 대상에서 제외됩니다.',
    ],
    documents: [
      {
        title: '수업료,등록금 등',
        file: '교육비 납입증명서',
        issuer: '교육기관',
        note: '국세청 제공 (간소화자료)',
      },
      {
        title: '취학전아동 학원비',
        file: '교육비 납입증명서',
        issuer: '학원',
      },
      {
        title: '학교 외 도서구입비',
        file: '방과 후 학교 수업용 도서 구입 증명서',
        issuer: '교육기관',
      },
      {
        title: '장애인 특수 교육비',
        file: '교육비 납입 증명서',
        issuer: '병의원',
      },
    ],
  },
  medical: {
    title: '의료비 공제',
    about: {
      question: '의료비에 대해 알아볼까요?',
      sections: [
        {
          title: '의료비 세액 공제란?',
          content: '근로자가 본인 및 기본공제대상자를 위해 지출한 의료비 중 총급여액의 3%를 초과하는 금액의 15%(난임 30%, 미숙아 20%)를 세액공제 받을 수 있습니다.',
        },
        {
          title: '의료비 공제대상',
          bullets: [
            '진찰·치료·질병예방을 위해 의료기관에 지급한 비용',
            '치료·요양을 위한 의약품(한약 포함) 구입비용',
            '시력보정용 안경·콘택트렌즈 구입비 (1명당 연 50만원 한도)',
            '보청기, 휠체어 등 장애인 보장구 구입·임차 비용',
            '산후조리원 비용 (출산 1회당 200만원 한도, 모든 근로자 적용)',
            '난임시술비 및 미숙아·선천성이상아 의료비',
          ],
        },
        {
          title: '의료비 공제한도',
          bullets: [
            '본인, 65세 이상, 장애인, 건강보험산정특례자: 전액(한도 없음)',
            '난임시술비, 미숙아·선천성이상아 의료비: 전액(한도 없음)',
            '그 외 부양가족: 연 700만원 한도',
            '2025년부터 6세 이하 부양가족 의료비 공제한도 폐지 (전액 공제)',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '부양가족의 나이나 소득 요건을 만족하지 않아 인적공제를 받지 못하는 가족이라도, 근로자가 직접 지출한 의료비는 세액공제 가능합니다.' },
      { id: 'TIP 02', text: '시력보정용 안경과 콘택트렌즈 구입비는 1인당 연 50만원까지 의료비 공제가 가능하며, 간소화에 누락된 경우 영수증을 제출하면 됩니다.' },
      { id: 'TIP 03', text: '2025년부터 소득제한 없이 모든 근로자가 산후조리원 비용을 출산 1회당 200만원까지 공제받을 수 있습니다.' },
      { id: 'TIP 04', text: '실손의료보험금으로 보전받은 의료비는 세액공제 대상에서 반드시 차감해야 합니다.' },
    ],
    notice: [
      '미용·성형수술 비용 및 건강증진을 위한 영양제·보약 구입비는 공제 대상에서 제외됩니다.',
      '보험회사로부터 수령한 실손의료보험금 수령액은 의료비 지출액에서 차감하여 신고해야 합니다.',
    ],
    documents: [
      {
        title: '병·의원 진료비 및 약제비',
        file: '진료비(약제비) 납입확인서',
        issuer: '병원, 의원, 약국',
        note: '국세청 제공 (간소화자료)',
      },
      {
        title: '시력보정용 안경·콘택트렌즈',
        file: '시력보정용 안경 구입 영수증',
        issuer: '안경점',
      },
      {
        title: '산후조리원 이용비용',
        file: '산후조리원 이용 영수증(산모성명 기재)',
        issuer: '산후조리원',
      },
      {
        title: '난임시술비',
        file: '난임시술 의료비 영수증(진단서)',
        issuer: '의료기관',
      },
    ],
  },
  rent: {
    title: '월세액 공제',
    about: {
      question: '월세액 세액공제에 대해 알아볼까요?',
      sections: [
        {
          title: '월세액 세액 공제란?',
          content: '무주택 세대의 세대주로서 총급여 8,000만원 이하 근로자가 국민주택규모(85㎡) 이하 또는 기준시가 4억원 이하 주택에 지출한 월세액의 15%~17%를 세액공제합니다.',
        },
        {
          title: '월세액 공제대상 주택',
          bullets: [
            '아파트, 단독주택, 다가구, 다세대/연립주택',
            '주거용 오피스텔, 고시원',
            '국민주택규모(전용 85㎡ 이하) 또는 기준시가 4억원 이하 주택',
            '임대차계약서상 주소지와 주민등록등본상 주소지가 일치(전입신고 필수)',
          ],
        },
        {
          title: '공제율 및 한도',
          bullets: [
            '연간 월세액 지출금액 중 최대 1,000만원 한도',
            '총급여 5,500만원 이하: 17% 세액공제 (최대 170만원)',
            '총급여 5,500만원 초과 8,000만원 이하: 15% 세액공제 (최대 150만원)',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '임대인의 동의가 없어도 임대차계약서와 계좌이체 영수증만으로 근로자 단독 신청이 가능합니다.' },
      { id: 'TIP 02', text: '반드시 주민등록등본상 전입신고가 완료되어 주소지가 일치하는 기간에 지출한 월세액만 공제받을 수 있습니다.' },
      { id: 'TIP 03', text: '기본공제대상자인 배우자가 계약을 체결한 경우에도 세액공제를 받을 수 있습니다.' },
    ],
    notice: [
      '월세액 세액공제를 받은 금액은 신용카드 등 사용금액 소득공제(현금영수증)와 중복 적용받을 수 없습니다.',
    ],
    documents: [
      {
        title: '임대차계약 증빙',
        file: '임대차계약서 사본',
        issuer: '본인(공인중개사)',
      },
      {
        title: '전입신고 확인',
        file: '주민등록표등본',
        issuer: '정부24, 주민센터',
      },
      {
        title: '월세 지급 증빙',
        file: '계좌이체 영수증, 무통장입금증 등',
        issuer: '거래 은행',
      },
    ],
  },
  insurance: {
    title: '보험료 공제',
    about: {
      question: '보험료 공제에 대해 알아볼까요?',
      sections: [
        {
          title: '보험료 세액 공제란?',
          content: '근로자가 본인 및 기본공제대상자를 피보험자로 하여 지출한 보장성보험료의 12%(장애인전용보장성보험은 15%)를 세액공제합니다.',
        },
        {
          title: '공제 한도 및 대상',
          bullets: [
            '일반 보장성 보험료: 연 100만원 한도 (12% 공제, 최대 12만원)',
            '장애인 전용 보장성 보험료: 연 100만원 한도 (15% 공제, 최대 15만원)',
            '만기에 환급되는 금액이 납입보험료를 초과하지 않는 순수 보장성 보험 대상',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '기본공제 대상자(나이 및 소득요건 충족)를 피보험자로 하고, 근로자가 계약자 및 납부자인 경우에만 공제됩니다.' },
      { id: 'TIP 02', text: '저축성 보험이나 변액보험 등은 보장성 보험료 세액공제 대상이 아닙니다.' },
    ],
    notice: [
      '피보험자가 기본공제대상자가 아닌 경우 보험료 공제를 받을 수 없습니다.',
    ],
    documents: [
      {
        title: '보장성보험료 납입영수증',
        file: '보험료 납입증명서',
        issuer: '해당 보험회사',
        note: '국세청 제공 (간소화자료)',
      },
    ],
  },
  donation: {
    title: '기부금 공제',
    about: {
      question: '기부금 공제에 대해 알아볼까요?',
      sections: [
        {
          title: '기부금 세액 공제란?',
          content: '근로자가 본인 및 기본공제대상자가 해당 연도에 지급한 공제대상 기부금의 15%(1천만원 초과분 30%, 정치자금 등 특례적용)를 종합소득산출세액에서 공제합니다.',
        },
        {
          title: '기부금 유형 및 공제 한도',
          bullets: [
            '정치자금기부금: 10만원 이하 100/110 세액공제, 10만원 초과분 15%(3천만원 초과 25%)',
            '법정기부금(특례기부금): 소득금액의 100% 한도 내 15%(1천만원 초과 30%)',
            '지정기부금: 종교단체 외 30%, 종교단체 10% 한도 내 15%(1천만원 초과 30%)',
            '우리사주조합기부금: 근로소득금액의 30% 한도 내 15%',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '기본공제대상자인 배우자 및 직계비속 등이 지출한 기부금도 근로자 본인이 공제받을 수 있습니다 (나이제한 없음, 소득제한 있음).' },
      { id: 'TIP 02', text: '정치자금기부금과 우리사주조합기부금은 근로자 본인이 지출한 기부금에 한해서만 세액공제 가능합니다.' },
      { id: 'TIP 03', text: '한도 초과로 당해연도에 공제받지 못한 법정·지정기부금은 10년간 이월공제가 가능합니다.' },
    ],
    notice: [
      '정치자금기부금은 본인 지출분만 가능하며, 부양가족 명의의 기부금은 공제 대상에서 제외됩니다.',
      '기부금 영수증 및 기부내역을 입증할 수 있는 서류(법인설립허가증 등)를 갖추어야 합니다.',
    ],
    documents: [
      {
        title: '기부금 영수증',
        file: '기부금 납입영수증 (법정/지정/종교)',
        issuer: '해당 기부처 (사찰, 교회, 모금회 등)',
        note: '국세청 간소화자료 제공분은 별도 제출 불필요',
      },
      {
        title: '기부처 확인 서류',
        file: '법인설립허가증, 고유번호증 사본',
        issuer: '주무관청 또는 세무서',
        note: '종교단체 등 지정기부금 단체 확인용',
      },
    ],
  },
  card: {
    title: '신용카드 등 소득공제',
    about: {
      question: '신용카드 등 사용금액 소득공제에 대해 알아볼까요?',
      sections: [
        {
          title: '신용카드 등 사용금액 소득공제란?',
          content: '근로자가 1년 동안 신용카드, 체크카드, 현금영수증 등으로 지출한 금액이 총급여액의 25%를 초과하는 경우, 초과분에 대해 일정 비율을 근로소득금액에서 공제하는 제도입니다.',
        },
        {
          title: '결제 수단별 공제율',
          bullets: [
            '신용카드: 15% (기본 공제율)',
            '직불·체크카드, 현금영수증: 30%',
            '도서, 공연, 박물관, 미술관, 영화관람료: 30% (총급여 7천만원 이하)',
            '전통시장 사용분: 40%',
            '대중교통 이용분: 40%',
          ],
        },
        {
          title: '공제 한도',
          bullets: [
            '총급여 7천만원 이하: 기본 300만원 + 추가(전통·교통·문화체육) 300만원 = 최대 600만원',
            '총급여 7천만원 초과: 기본 250만원 + 추가 200만원 = 최대 450만원',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '총급여 25%까지는 혜택이 많은 신용카드를 쓰고, 25% 초과분부터는 공제율이 2배(30%)인 체크카드나 현금영수증을 사용하는 것이 절세에 유리합니다.' },
      { id: 'TIP 02', text: '맞벌이 부부의 경우, 각자 사용한 금액을 합산하거나 한쪽으로 몰아서 공제받을 수 없습니다 (결제자 기준 공제).' },
      { id: 'TIP 03', text: '전통시장 및 대중교통 이용분은 40%의 높은 공제율과 추가 한도가 적용되므로 적극 활용하세요.' },
    ],
    notice: [
      '신차 구입비용, 제세공과금, 아파트 관리비, 고속도로 통행료, 상품권 구입비, 정규수업료 등은 신용카드 공제 대상에서 제외됩니다 (중고차 구입비의 10%는 공제 가능).',
      '형제자매가 사용한 신용카드 금액은 기본공제 대상자이더라도 공제받을 수 없습니다.',
    ],
    documents: [
      {
        title: '신용카드 등 사용금액 확인서',
        file: '신용카드/체크카드 사용금액 확인서',
        issuer: '해당 카드사 또는 은행',
        note: '국세청 간소화자료 제공분은 별도 제출 불필요',
      },
      {
        title: '현금영수증 발급확인서',
        file: '현금영수증 사용내역서',
        issuer: '국세청 홈택스',
        note: '간소화 서비스 미반영 시 발급 제출',
      },
    ],
  },
  housing_loan: {
    title: '주택자금 소득공제',
    about: {
      question: '주택자금 공제에 대해 알아볼까요?',
      sections: [
        {
          title: '주택자금 소득공제란?',
          content: '무주택 또는 1주택 세대주인 근로자가 주택을 임차하거나 취득하기 위해 차입한 자금의 원리금 상환액 및 이자 상환액에 대해 일정 금액을 근로소득금액에서 공제합니다.',
        },
        {
          title: '공제 대상 및 한도',
          bullets: [
            '주택임차차입금(전세대출) 원리금상환액: 상환액의 40% (주택마련저축과 합산하여 연 400만원 한도)',
            '장기주택저당차입금(주택담보) 이자상환액: 차입시기·상환기간·고정금리/비거치식 여부에 따라 연 300만원 ~ 최대 2,000만원 한도',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '전세자금대출(주택임차차입금)은 은행 대출뿐만 아니라 대부업을 경영하지 않는 개인(거주자)으로부터 차입한 금액도 요건 충족 시 40% 공제 가능합니다.' },
      { id: 'TIP 02', text: '장기주택저당차입금은 기준시가 요건(취득 당시 5억원/6억원 이하)을 충족해야 하며, 고정금리 및 비거치식 분할상환 조건일수록 공제 한도가 최대 2,000만원으로 높아집니다.' },
      { id: 'TIP 03', text: '세대주가 주택자금 공제를 받지 않은 경우 세대원도 일정 요건 하에 공제 가능합니다.' },
    ],
    notice: [
      '임대차계약서의 주소지와 주민등록표등본의 주소지가 일치해야 하며, 대출금이 임대인 계좌로 직접 입금되어야 합니다(대출기관 차입 시).',
      '세대 구성원이 보유한 주택 수를 합산하여 무주택 또는 1주택 요건을 엄격히 판정하므로 다주택자는 공제 대상에서 제외됩니다.',
    ],
    documents: [
      {
        title: '주택자금 상환 증명서',
        file: '주택임차차입금 원리금/장기주택저당차입금 이자 상환증명서',
        issuer: '대출 취급 금융기관',
        note: '국세청 간소화자료 제공분은 별도 제출 불필요',
      },
      {
        title: '임대차 및 주거 증빙',
        file: '임대차계약서 사본, 주민등록표등본',
        issuer: '본인 및 정부24',
      },
    ],
  },
  housing_savings: {
    title: '주택마련저축 소득공제',
    about: {
      question: '주택마련저축에 대해 알아볼까요?',
      sections: [
        {
          title: '주택마련저축 소득공제란?',
          content: '총급여액 7,000만원 이하인 무주택 세대의 세대주가 주택청약종합저축 등에 납입한 금액의 40%를 근로소득금액에서 공제하는 제도입니다.',
        },
        {
          title: '공제 대상 및 한도',
          bullets: [
            '주택청약종합저축, 청약저축: 연 납입액(연 300만원 한도)의 40% (최대 120만원 소득공제)',
            '주택임차차입금 원리금상환액 공제와 합산하여 연 400만원 한도 내에서 적용',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '2024년 납입분부터 주택청약종합저축 납입한도가 기존 연 240만원에서 연 300만원으로 상향되어, 최대 120만원(300만원의 40%)까지 공제받을 수 있습니다.' },
      { id: 'TIP 02', text: '공제를 받으려면 과세연도 다음 연도 2월 말까지 가입 금융기관(은행)에 반드시 [무주택확인서]를 제출해야 국세청 간소화에 자동 반영됩니다.' },
      { id: 'TIP 03', text: '세대주 본인 명의로 가입된 저축만 공제 가능하며, 배우자나 세대원 명의의 통장은 공제받을 수 없습니다.' },
    ],
    notice: [
      '과세연도 중 주택을 취득한 사실이 있거나, 세대원 중 주택을 소유한 자가 있는 경우 공제받을 수 없습니다.',
      '중도 해지하거나 국민주택규모 초과 주택에 당첨되어 해지하는 경우 추징세액이 발생할 수 있습니다.',
    ],
    documents: [
      {
        title: '주택마련저축 납입증명서',
        file: '주택마련저축 납입증명서',
        issuer: '가입 은행',
        note: '무주택확인서 기제출자는 간소화에서 자동 조회',
      },
      {
        title: '무주택 확인서',
        file: '무주택확인서 (은행 제출용)',
        issuer: '가입 은행 창구/앱',
      },
    ],
  },
  pension: {
    title: '연금저축/연금계좌 세액공제',
    about: {
      question: '연금계좌 세액공제에 대해 알아볼까요?',
      sections: [
        {
          title: '연금계좌 세액공제란?',
          content: '노후생활 안정을 지원하기 위해 근로자가 연금저축(신탁·펀드·보험) 및 퇴직연금(IRP, DC본인납입) 계좌에 납입한 금액에 대해 12%~15%의 세액공제를 적용합니다.',
        },
        {
          title: '공제율 및 세액공제 한도',
          bullets: [
            '세액공제 한도: 연금저축 최대 600만원, IRP 합산 시 최대 900만원',
            '총급여 5,500만원 이하: 15% (지방소득세 포함 16.5%) ➔ 최대 148.5만원 절세',
            '총급여 5,500만원 초과: 12% (지방소득세 포함 13.2%) ➔ 최대 118.8만원 절세',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '연금저축만 납입하면 600만원까지만 공제되지만, IRP에 추가로 납입하면 900만원까지 한도가 늘어나 절세 효과가 극대화됩니다.' },
      { id: 'TIP 02', text: '연말에 일시금으로 납입해도 전액 해당 연도 공제 대상이 되므로, 12월 말 납입을 적극 활용하세요.' },
      { id: 'TIP 03', text: 'ISA 만기 자금을 연금계좌로 전환 납입하면 전환금액의 10%(최대 300만원)까지 추가 세액공제 한도가 부여됩니다.' },
    ],
    notice: [
      '중도 해지하거나 연금 외 형태로 수령할 경우 기타소득세(16.5%)가 부과되어 공제받은 혜택이 환수될 수 있습니다.',
      '배우자 등 부양가족 명의의 연금계좌 납입액은 근로자가 대리 납입하더라도 공제받을 수 없습니다(본인 명의만 가능).',
    ],
    documents: [
      {
        title: '연금계좌 납입확인서',
        file: '연금저축/퇴직연금 납입증명서',
        issuer: '은행, 증권사, 보험사',
        note: '국세청 간소화자료 제공분은 별도 제출 불필요',
      },
    ],
  },
  small_biz: {
    title: '소기업소상공인 공제부금',
    about: {
      question: '소기업소상공인 공제(노란우산)에 대해 알아볼까요?',
      sections: [
        {
          title: '소기업·소상공인 공제부금이란?',
          content: '중소기업중앙회가 운영하는 노란우산공제에 납입한 부금에 대해 사업소득금액 또는 법인 대표자의 근로소득금액에서 최대 500만원까지 소득공제합니다.',
        },
        {
          title: '소득구간별 공제한도',
          bullets: [
            '사업소득/근로소득 4천만원 이하: 연 500만원 한도',
            '4천만원 초과 1억원 이하: 연 300만원 한도',
            '1억원 초과: 연 200만원 한도',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '법인 대표자로서 총급여액 7,000만원 이하인 경우 근로소득 연말정산 시 소기업소상공인 공제를 적용받을 수 있습니다.' },
      { id: 'TIP 02', text: '납입부금은 압류, 양도, 담보 제공이 법적으로 금지되어 안전한 노후 자금 및 폐업 대비 자금으로 보호됩니다.' },
      { id: 'TIP 03', text: '연간 최대 500만원 한도로 소득공제되어 과세표준 구간에 따라 최대 198만원의 절세 혜택을 누릴 수 있습니다.' },
    ],
    notice: [
      '법인 대표자 중 총급여액이 7,000만원을 초과하는 근로자는 근로소득에서 공제받을 수 없습니다.',
      '폐업 등 정당한 사유 없이 임의 해약할 경우 기타소득세(16.5%)가 원천징수됩니다.',
    ],
    documents: [
      {
        title: '소기업소상공인공제부금 납입증명서',
        file: '소기업·소상공인 공제부금 납입확인서',
        issuer: '중소기업중앙회 (노란우산)',
        note: '국세청 간소화자료 제공분은 별도 제출 불필요',
      },
      {
        title: '법인 대표자 확인서류',
        file: '사업자등록증, 원천징수영수증',
        issuer: '국세청 홈택스',
      },
    ],
  },
  long_invest: {
    title: '장기집합투자증권저축',
    about: {
      question: '장기집합증권 소득공제에 대해 알아볼까요?',
      sections: [
        {
          title: '장기집합투자증권저축이란?',
          content: '근로자가 가입한 청년형 장기집합투자증권저축 또는 장기집합투자증권저축(장기펀드)에 연간 납입한 금액의 40%를 근로소득금액에서 공제합니다.',
        },
        {
          title: '공제율 및 한도',
          bullets: [
            '연간 납입한도: 600만원',
            '공제율: 연 납입액의 40% (최대 연 240만원 소득공제)',
            '청년형: 만 19세~34세, 총급여 5천만원 이하(종합소득 3.8천만원 이하) 가입 대상',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '청년형 장기펀드는 연 최대 600만원 납입 시 40%인 240만원을 소득공제받을 수 있어 높은 절세율을 자랑합니다.' },
      { id: 'TIP 02', text: '복수의 펀드에 가입하더라도 모든 계좌 납입액을 합산하여 연 600만원 한도 내에서 40% 공제가 적용됩니다.' },
    ],
    notice: [
      '가입일로부터 3년(일반 5년) 이내에 중도 해지하거나 환매하는 경우 감면받은 세액이 추징될 수 있습니다.',
      '직전 과세연도 금융소득종합과세 대상자는 가입 및 공제 대상에서 제외됩니다.',
    ],
    documents: [
      {
        title: '장기집합투자증권저축 납입증명서',
        file: '장기집합투자증권저축 납입증명서',
        issuer: '가입 자산운용사 또는 판매 증권사/은행',
        note: '국세청 간소화자료 제공분은 별도 제출 불필요',
      },
    ],
  },
  other_deduct: {
    title: '기타공제 (혼인·납세조합)',
    about: {
      question: '기타공제(혼인세액공제/납세조합공제)에 대해 알아볼까요?',
      sections: [
        {
          title: '혼인세액공제란?',
          content: '청년층의 결혼을 지원하고 초기 주거·혼수 부담을 덜어주기 위해 2024년 1월 1일 이후 혼인신고한 신혼부부에게 1인당 50만원(부부 합산 최대 100만원)을 세액에서 직접 공제해 주는 제도입니다 (생애 1회 적용).',
        },
        {
          title: '납세조합 세액공제란?',
          content: '을종근로소득자(외국기관 또는 외국법인으로부터 지급받는 급여 등)가 납세조합을 결성하여 매월 급여 지급 시 소득세를 원천징수한 경우, 원천징수세액의 5%를 산출세액에서 공제해 주는 제도입니다.',
        },
        {
          title: '공제 요건 및 혜택',
          bullets: [
            '혼인세액공제: 2024년 1월 1일 ~ 2026년 12월 31일 혼인신고자 (혼인신고일이 속하는 과세연도에 적용)',
            '혼인세액공제 금액: 부부 각자 50만원씩 세액공제 (맞벌이 시 각자 50만원 총 100만원, 외벌이 시 근로자 50만원)',
            '납세조합공제: 납세조합을 통해 원천징수된 세액의 5% 세액공제',
          ],
        },
      ],
    },
    tips: [
      { id: 'TIP 01', text: '혼인세액공제는 2024년 이후 혼인신고한 경우 생애 1회에 한해 부부 각각 50만원(합계 최대 100만원)의 세액공제를 받을 수 있습니다.' },
      { id: 'TIP 02', text: '혼인신고일이 속하는 과세연도에 공제받지 못한 경우, 경정청구를 통해 소급하여 세액공제를 적용받을 수 있습니다.' },
      { id: 'TIP 03', text: '납세조합 공제는 을종근로소득 납세조합에 가입하여 매월 세금을 원천징수 납부한 근로소득자에게 5%의 세액공제 혜택이 주어집니다.' },
    ],
    notice: [
      '혼인세액공제는 사실혼은 인정되지 않으며, 가족관계등록부상 혼인신고가 완료된 법률혼에 한하여 적용됩니다.',
      '부부 중 1인이 이미 혼인세액공제를 적용받은 이력이 있는 재혼의 경우에도 신규 혼인신고에 대해 상대방은 공제 가능합니다.',
    ],
    documents: [
      {
        title: '혼인관계증명서',
        file: '혼인관계증명서(상세)',
        issuer: '대법원 전자가족관계등록시스템 또는 주민센터',
        note: '혼인신고일 확인용',
      },
      {
        title: '납세조합 원천징수영수증',
        file: '근로소득 원천징수영수증(납세조합용)',
        issuer: '가입 납세조합',
        note: '납세조합 세액공제 신청 시 필수',
      },
    ],
  },
};

/**
 * 장기집합증권 페이지 규격 매칭: 조회할 자료가 없을 때 표시되는 빈 상태 컴포넌트
 */
function EmptyDeductionState({ onAdd, message = '조회할 자료가 없습니다.', addText = '+ 자료입력' }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 space-y-3.5">
      <div className="relative w-32 h-32 rounded-full bg-[#EEF4FD] flex items-center justify-center shadow-inner">
        <div className="w-16 h-20 bg-white rounded-xl shadow-xs border border-slate-200/80 p-2.5 flex flex-col justify-between">
          <div className="w-full h-5 rounded-md bg-[#AECDFB]/60" />
          <div className="space-y-1.5 pb-1">
            <div className="w-full h-1.5 bg-slate-200/80 rounded" />
            <div className="w-4/5 h-1.5 bg-slate-200/80 rounded" />
          </div>
        </div>
        <div className="absolute bottom-5 right-7 w-6 h-6 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-sm font-bold shadow-md border-2 border-white">
          +
        </div>
      </div>

      <div className="text-[13px] font-semibold text-slate-500">
        {message}
      </div>

      {onAdd && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onAdd}
            className="px-5 py-2 rounded-lg border border-indigo-300 text-[#4F46E5] bg-white hover:bg-indigo-50/60 font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <span>{addText}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function DataInputPage({ onGoHome, onNext, onPrev, onNavigateStep, hometaxData, userProfile, onSignOut, onLogin, onDataChange }) {
  const { profile, user } = useAuth();
  // 로그인한 근로자 성명 기준 (Google 접미사 제거)
  const loggedInWorkerName = (profile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || '홍길동')
    .replace(/\s*\(Google\)/g, '')
    .trim() || '홍길동';

  // 첫 마운트 여부 추적 (단순 페이지 진입 시에는 상태를 변경하지 않고 사용자가 수정했을 때만 작성중으로 변경)
  const isFirstMountRef = useRef(true);

  // 근로소득원천징수영수증 및 종전근무지 데이터로부터 근로자 총급여액 산출 (암호화 스토리지 연동)
  const workerTotalSalary = useMemo(() => {
    try {
      const whData = getSecureItem('selftax_withholding_data');
      const primarySalary = Number(whData?.totalSalary || userProfile?.totalSalary || userProfile?.salary) || 0;

      const prevJobs = getSecureItem('selftax_previous_jobs', []);
      const prevSalaryTotal = Array.isArray(prevJobs)
        ? prevJobs.reduce((acc, job) => acc + (Number(job.salary) || 0), 0)
        : 0;

      return primarySalary + prevSalaryTotal;
    } catch {
      return Number(userProfile?.totalSalary || userProfile?.salary) || 0;
    }
  }, [userProfile]);

  // 디자인 알림창 상태
  const [designAlert, setDesignAlert] = useState({
    isOpen: false,
    title: '알림',
    message: '',
    onConfirm: null,
  });

  const showAlert = (message, title = '알림', onConfirm = null) => {
    setDesignAlert({ isOpen: true, title, message, onConfirm });
  };

  // 뷰 모드: 'list' | 'card_view' | 'card_edit' | 'card_add' | 'donation_view' | 'donation_edit' | 'donation_add' | 'insurance_view' | 'insurance_edit' | 'insurance_add' | 'edu_view' | 'edu_edit' | 'edu_add' | 'medical_view' | 'medical_edit' | 'medical_add' | 'rent_view' | 'rent_edit' | 'rent_checklist' | 'deduction_guide'
  const [viewMode, setViewMode] = useState('list');

  // 공제 가이드 상세 페이지 관련 상태 (첨부 이미지 1, 2, 4 스펙 100% 매칭)
  const [guideCategory, setGuideCategory] = useState('education'); // 'education' | 'medical' | 'rent' | 'insurance' | 'donation' | 'card'
  const [guideActiveTab, setGuideActiveTab] = useState('about'); // 'about' (알아보기) | 'tips' (절세팁) | 'documents' (구비서류)
  const [guideReturnMode, setGuideReturnMode] = useState('edu_view'); // 뒤로가기 시 복귀할 화면

  // 현재 선택된 공제 가이드 데이터
  const currentGuide = deductionGuideData[guideCategory] || deductionGuideData.education;

  // 의료비 목록 상태 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [medicalItems, setMedicalItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_medical');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 의료비 아코디언 상태 (인별 기준)
  const [expandedMedicalMembers, setExpandedMedicalMembers] = useState({});
  const [expandedOtherMedicalMembers, setExpandedOtherMedicalMembers] = useState({});
  const toggleMedicalMemberAccordion = (memberName) => {
    setExpandedMedicalMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };
  const toggleOtherMedicalMemberAccordion = (memberName) => {
    setExpandedOtherMedicalMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };

  // 첨부 이미지 1 규격 100% 매칭: 0원일 때 연한 하늘색/슬레이트(#9FB1C8) 색상 표기 (총급여 한도 초과 시 사유 뱃지 지원)
  const renderItemAmount = (amount, extraNote = null) => {
    const isZero = !amount || Number(amount) === 0;
    return (
      <div className="flex items-center gap-1.5 text-xs font-mono">
        {extraNote && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-sans font-semibold mr-0.5">
            {extraNote}
          </span>
        )}
        <span className={isZero ? "text-[#9FB1C8] font-normal" : "text-slate-900 font-bold"}>
          {Number(amount || 0).toLocaleString()}원
        </span>
        <span className={isZero ? "text-[#9FB1C8] text-sm font-normal" : "text-slate-300 group-hover:text-indigo-500 text-sm font-normal"}>
          ›
        </span>
      </div>
    );
  };

  // 국세청 간소화 PDF 데이터가 들어오면 각 항목에 자동 적용 (세법 규정 및 요구사항 1~9 정밀 반영)
  useEffect(() => {
    let currentData = hometaxData;
    if (currentData === undefined || currentData === null) {
      try {
        const saved = localStorage.getItem('hometax_extracted_data');
        if (saved) {
          currentData = JSON.parse(saved);
        }
      } catch {
        // ignore
      }
    }

    const hasPdfData = Boolean(currentData && (currentData.uploaded || currentData.hasData || currentData.fileName));

    if (!hasPdfData) {
      // PDF 업로드 전 or PDF 삭제 시: 국세청자료(isNts) 자동 삭제
      setMedicalItems((prev) => prev.filter((item) => !item.isNts));
      setInsuranceItems((prev) => prev.filter((item) => !item.isNts));
      setDonationItems((prev) => prev.filter((item) => !item.isNts));
      setCardItems((prev) => prev.filter((item) => !item.isNts));
      setEduItems((prev) => prev.filter((item) => !item.isNts));
      setPensionItems((prev) => prev.filter((item) => !item.isNts));
      setLongInvestItems((prev) => prev.filter((item) => !item.isNts));
      setOtherDeductItems((prev) => prev.filter((item) => !item.isNts));

      // 주택자금, 주택마련저축, 월세액, 소기업소상공인 4개 메뉴: 작성된 국세청 내용 삭제 (사용자 체크리스트 답변은 보존)
      setHousingLoanItems((prev) => prev.filter((item) => !item.isNts && item.source !== 'nts'));
      setHousingSavingsItems((prev) => prev.filter((item) => !item.isNts && item.source !== 'nts'));
      setRentItems((prev) => prev.filter((item) => !item.isNts && item.source !== 'nts'));
      setSmallBizItems((prev) => prev.filter((item) => !item.isNts && item.source !== 'nts'));
      return;
    }

    const persons = currentData.matchedPersons || currentData.persons || [];

    // 1. 의료비 자동 적용 (국세청자료 상호: 국세청간소화, 종류: 안경/산후조리원 분리 및 그 외 합산)
    setMedicalItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      if (Array.isArray(persons) && persons.length > 0) {
        const newNts = [];
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = p.relation || '본인';
          const indemnityAmt = Number(p.items?.indemnity_insurance) || 0;

          // 세부 의료비 지출처(medical_details)가 있는 경우
          if (Array.isArray(p.medical_details) && p.medical_details.length > 0) {
            let glassesAmt = 0;
            let postpartumAmt = 0;
            let otherAmt = 0;

            p.medical_details.forEach((md) => {
              const amt = Number(md.amount) || 0;
              const t = (md.type || '').trim();
              if (t.includes('안경') || t.includes('콘텍트렌즈') || t.includes('콘택트렌즈')) {
                glassesAmt += amt;
              } else if (t.includes('산후조리')) {
                postpartumAmt += amt;
              } else {
                otherAmt += amt;
              }
            });

            // 일반의료비 지출액(amount)은 실손의료보험금을 빼지 않은 금액(otherAmt 원본)을 작성
            if (otherAmt > 0) {
              newNts.push({
                id: `nts_med_${pName}_other_${idx}`,
                name: pName,
                relation: pRel,
                type: '일반의료비',
                hospital: '국세청간소화',
                bizNumber: '',
                proofCode: '국세청장 자료',
                count: '1',
                amount: otherAmt,
                insuranceAmount: indemnityAmt > 0 ? String(indemnityAmt) : '',
                date: '2025 귀속 국세청 간소화',
                isNts: true,
              });
            }

            if (glassesAmt > 0) {
              newNts.push({
                id: `nts_med_${pName}_glasses_${idx}`,
                name: pName,
                relation: pRel,
                type: '안경 또는 콘텍트렌즈 구입비용',
                hospital: '국세청간소화',
                bizNumber: '',
                proofCode: '국세청장 자료',
                count: '1',
                amount: glassesAmt,
                insuranceAmount: '',
                date: '2025 귀속 국세청 간소화',
                isNts: true,
              });
            }

            if (postpartumAmt > 0) {
              newNts.push({
                id: `nts_med_${pName}_postpartum_${idx}`,
                name: pName,
                relation: pRel,
                type: '산후조리원 비용',
                hospital: '국세청간소화',
                bizNumber: '',
                proofCode: '국세청장 자료',
                count: '1',
                amount: postpartumAmt,
                insuranceAmount: '',
                date: '2025 귀속 국세청 간소화',
                isNts: true,
              });
            }
          } else {
            // 인별 합계금액 기준
            const rawAmt = Number(p.items?.medical_general) || 0;
            if (rawAmt > 0) {
              newNts.push({
                id: `nts_med_${pName}_general_${idx}`,
                name: pName,
                relation: pRel,
                type: '일반의료비',
                hospital: '국세청간소화',
                bizNumber: '',
                proofCode: '국세청장 자료',
                count: '1',
                amount: rawAmt,
                insuranceAmount: indemnityAmt > 0 ? String(indemnityAmt) : '',
                date: '2025 귀속 국세청 간소화',
                isNts: true,
              });
            }
          }
        });
        if (newNts.length > 0) return [...others, ...newNts];
      }

      if (currentData.medical && currentData.medical > 0) {
        return [
          ...others,
          {
            id: 'nts_med_1',
            name: (loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim(),
            relation: '본인',
            type: '일반의료비',
            hospital: '국세청간소화',
            bizNumber: '',
            proofCode: '국세청장 자료',
            count: '1',
            amount: Number(currentData.medical) || 0,
            insuranceAmount: currentData.indemnity_insurance ? String(currentData.indemnity_insurance) : '',
            date: '2025 귀속 국세청 간소화',
            isNts: true,
          },
        ];
      }
      return others;
    });

    // 2. 보장성보험료 자동 적용 (보장성 -> 일반보장성보험, 장애인보장 -> 장애인전용보장성보험)
    // 계약자 명의로만 납입금액을 귀속하고, 주피보험자·종피보험자 중 기본공제대상자가 있는 계약만 반영한다.
    setInsuranceItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      if (Array.isArray(persons) && persons.length > 0) {
        const newNts = [];
        const findMember = (n) => {
          const c = String(n || '').replace(/\(.*?\)/g, '').trim();
          return familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === c);
        };
        const ntsIncomeExcess = new Set(
          persons.filter((pp) => pp.income_excess).map((pp) => String(pp.name || '').replace(/\(.*?\)/g, '').trim())
        );
        const isNotBasicTarget = (n) => {
          const c = String(n || '').replace(/\(.*?\)/g, '').trim();
          const m = findMember(c);
          return ntsIncomeExcess.has(c) || Boolean(m?.incomeExcess || m?.incomeOver === '초과함' || m?.basicDeduction === '해당없음');
        };
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = p.relation || '본인';
          const member = findMember(pName);
          const isSelfContractor = pRel === '본인' || member?.isSelf || member?.relation === '본인';

          // 계약자가 기본공제대상자가 아니면 납입금액에 적용하지 않음 (본인은 항상 대상)
          if (!isSelfContractor && isNotBasicTarget(pName)) return;

          const insDetails = Array.isArray(p.insurance_details) && p.insurance_details.length > 0
            ? p.insurance_details
            : (Array.isArray(p.items?.insurance_details) && p.items.insurance_details.length > 0 ? p.items.insurance_details : []);

          if (insDetails.length > 0) {
            insDetails.forEach((d, dIdx) => {
              // 계약자가 아닌 주피보험자나 종피보험자일 땐 납입금액에 적용하지 않기
              if (d.contractor && d.contractor.replace(/\(.*?\)/g, '').trim() !== pName) {
                return;
              }
              // 주피보험자 또는 종피보험자(수익자) 중 기본공제대상자가 1명 이상 있어야 공제 대상
              const mInsured = (d.main_insured || pName).replace(/\(.*?\)/g, '').trim();
              const subInsureds = Array.isArray(d.sub_insured) ? d.sub_insured : [];
              const insuredList = [mInsured, ...subInsureds];
              const hasEligibleInsured = insuredList.some((n) => {
                const c = String(n || '').replace(/\(.*?\)/g, '').trim();
                return c === pName ? (isSelfContractor || !isNotBasicTarget(c)) : !isNotBasicTarget(c);
              });
              if (!hasEligibleInsured) return;

              const rawKind = String(d.type || d.raw_type || d.종류 || '보장성');
              const mappedType = rawKind.includes('장애인') ? '장애인전용보장성보험' : '일반보장성보험';
              newNts.push({
                id: `nts_ins_${pName}_${dIdx}_${idx}`,
                name: pName,
                relation: pRel,
                type: mappedType,
                company: d.company || d.org_name || d.상호 || '보장성보험',
                policyName: d.policy_name || '',
                bizNumber: d.biz_number || '',
                amount: Number(d.amount || 0),
                isNts: true,
                source: 'nts',
              });
            });
          } else {
            const amt = Number(p.items?.insurance_guaranteed) || 0;
            if (amt > 0) {
              newNts.push({
                id: `nts_ins_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '일반보장성보험',
                company: `국세청 간소화 (${pName})`,
                bizNumber: '',
                amount: amt,
                isNts: true,
                source: 'nts',
              });
            }
          }
        });
        if (newNts.length > 0) return [...others, ...newNts];
      }
      if (currentData.insurance && currentData.insurance > 0) {
        return [
          ...others,
          {
            id: 'nts_ins_1',
            name: (loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim(),
            relation: '본인',
            type: '일반보장성보험',
            company: '국세청 간소화 (보장성보험)',
            bizNumber: '',
            amount: currentData.insurance,
            isNts: true,
            source: 'nts',
          },
        ];
      }
      return others;
    });

    // 3. 기부금 자동 적용 (요구사항 8: 기부유형, 단체명, 사업자번호, 기부대상액, 기부장려금신청액을 각 인별로 작성)
    setDonationItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      if (Array.isArray(persons) && persons.length > 0) {
        const newNts = [];
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = p.relation || '본인';
          // 기부금 공제요건: 부양가족은 소득요건(100만 원 이하)만 적용, 나이 요건 없음
          const donFam = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === pName);
          const isSelfDonor = pRel === '본인' || Boolean(donFam?.isSelf || donFam?.relation === '본인') || pName === loggedInWorkerName;
          if (!isSelfDonor && (p.income_excess || (donFam && isIncomeExcessMember(donFam)))) return;

          const donDetails = Array.isArray(p.donation_details) && p.donation_details.length > 0
            ? p.donation_details
            : (Array.isArray(p.items?.donation_details) && p.items.donation_details.length > 0 ? p.items.donation_details : []);

          if (donDetails.length > 0) {
            donDetails.forEach((d, dIdx) => {
              // 정치자금·고향사랑·우리사주조합 기부금은 본인 지출분만 공제
              if (!isSelfDonor && isSelfOnlyDonationType(d.type || d.donation_type || d.기부유형 || '')) return;
              const rawRew = d.reward_amount ?? d.rewardAmount ?? d.기부장려금신청금액 ?? d.기부장려금 ?? d.장려금 ?? 0;
              const cleanRew = String(rawRew).replace(/[^0-9]/g, '');
              const rewardNum = cleanRew ? parseInt(cleanRew, 10) : 0;
              const rawAmt = d.amount ?? d.total_amount ?? 0;
              const cleanAmt = String(rawAmt).replace(/[^0-9]/g, '');
              const amtNum = cleanAmt ? parseInt(cleanAmt, 10) : 0;

              newNts.push({
                id: `nts_don_${pName}_${dIdx}_${idx}`,
                name: pName,
                relation: pRel,
                type: d.type || d.donation_type || d.기부유형 || '특례(법정)기부금',
                company: d.company || d.org_name || d.단체명 || d.상호 || '기부처',
                bizNumber: d.biz_number || d.bizNumber || '',
                count: String(d.count || '1'),
                amount: amtNum,
                rewardAmount: rewardNum,
                isNts: true,
                source: 'nts',
              });
            });
          } else {
            const rawAmt = p.items?.donation_amount || 0;
            const cleanAmt = String(rawAmt).replace(/[^0-9]/g, '');
            const amt = cleanAmt ? parseInt(cleanAmt, 10) : 0;
            if (amt > 0) {
              newNts.push({
                id: `nts_don_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '특례(법정)기부금',
                company: '기부처',
                bizNumber: '',
                count: '1',
                amount: amt,
                rewardAmount: 0,
                isNts: true,
                source: 'nts',
              });
            }
          }
        });
        if (newNts.length > 0) return [...others, ...newNts];
      }
      if (currentData.donation && currentData.donation > 0) {
        return [
          ...others,
          {
            id: 'nts_don_1',
            name: loggedInWorkerName.replace(/\(.*?\)/g, '').trim(),
            relation: '본인',
            type: '특례(법정)기부금',
            company: '기부처',
            bizNumber: '',
            count: '1',
            amount: currentData.donation,
            rewardAmount: '0',
            isNts: true,
            source: 'nts',
          },
        ];
      }
      return others;
    });

    // 4. 신용카드 / 직불·체크카드 / 현금영수증 / 전통시장 / 대중교통 / 문화체육 자동 적용
    // (총급여 7천만원 초과 시: 문화체육 사용금액을 신용카드/직불카드/현금영수증 사용금액에 각각 합산하여 집계)
    setCardItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      const newNts = [];
      const isOver70m = Boolean(workerTotalSalary > 70000000);

      if (Array.isArray(persons) && persons.length > 0) {
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = p.relation || '본인';

          const matchedFam = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === pName);
          const effectiveRel = matchedFam?.relation || pRel;
          // 신용카드 등 소득공제 요건: 형제자매 제외
          if (effectiveRel.includes('형제') || effectiveRel.includes('자매')) return;
          // 소득금액 100만원 초과 부양가족의 카드 사용금액 제외 (나이 요건 제한 없음)
          if (!matchedFam?.isSelf && matchedFam && (matchedFam.incomeOver === '초과함' || matchedFam.incomeExcess)) return;

          // 각 카드별 일반 사용액 및 문화체육 사용액 추출
          const creditGen = Number(p.items?.credit_card_general ?? (p.card_details?.find((c) => c.type === '신용카드')?.general_amount ?? p.card_details?.find((c) => c.type === '신용카드')?.amount ?? 0));
          const debitGen = Number(p.items?.debit_card_cash ?? (p.card_details?.find((c) => c.type === '직불·체크카드' || c.type === '체크카드')?.general_amount ?? p.card_details?.find((c) => c.type === '직불·체크카드' || c.type === '체크카드')?.amount ?? 0));
          const cashGen = Number(p.items?.cash_receipt ?? (p.card_details?.find((c) => c.type === '현금영수증')?.general_amount ?? p.card_details?.find((c) => c.type === '현금영수증')?.amount ?? 0));
          const marketAmt = Number(p.items?.market_amount ?? (p.card_details?.find((c) => c.type === '전통시장')?.amount ?? 0));
          const transitAmt = Number(p.items?.transport_amount ?? (p.card_details?.find((c) => c.type === '대중교통')?.amount ?? 0));

          let creditCul = Number(p.items?.credit_card_culture ?? (p.card_details?.find((c) => c.type === '신용카드')?.culture_amount ?? 0));
          let debitCul = Number(p.items?.debit_card_culture ?? (p.card_details?.find((c) => c.type === '직불·체크카드' || c.type === '체크카드')?.culture_amount ?? 0));
          let cashCul = Number(p.items?.cash_receipt_culture ?? (p.card_details?.find((c) => c.type === '현금영수증')?.culture_amount ?? 0));
          const totalCul = Number(p.items?.culture_amount ?? (p.items?.culture_sports ?? (p.card_details?.find((c) => c.type === '문화체육')?.amount ?? 0)));

          // 만약 세부 문화비가 0이고 전체 문화비만 존재하는 경우(이전 파싱 데이터 호환 안분)
          if (creditCul === 0 && debitCul === 0 && cashCul === 0 && totalCul > 0) {
            const sumGen = creditGen + debitGen + cashGen;
            if (sumGen > 0) {
              creditCul = Math.round(totalCul * (creditGen / sumGen));
              debitCul = Math.round(totalCul * (debitGen / sumGen));
              cashCul = totalCul - creditCul - debitCul;
            } else {
              creditCul = totalCul;
            }
          }

          if (isOver70m) {
            // [총급여 7천만원 초과]: 문화체육 사용금액을 각각 신용카드, 직불카드, 현금영수증 사용금액에 합산하고 문화체육 항목은 따로 집계하지 않음
            const finalCredit = creditGen + creditCul;
            const finalDebit = debitGen + debitCul;
            const finalCash = cashGen + cashCul;

            if (finalCredit > 0) {
              newNts.push({
                id: `nts_card_credit_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '신용카드',
                company: `국세청 간소화 (${pName})`,
                amount: finalCredit,
                isNts: true,
                source: 'nts',
              });
            }
            if (finalDebit > 0) {
              newNts.push({
                id: `nts_card_debit_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '직불·체크카드',
                company: `국세청 간소화 (${pName})`,
                amount: finalDebit,
                isNts: true,
                source: 'nts',
              });
            }
            if (finalCash > 0) {
              newNts.push({
                id: `nts_card_cash_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '현금영수증',
                company: `국세청 간소화 (${pName})`,
                amount: finalCash,
                isNts: true,
                source: 'nts',
              });
            }
            if (marketAmt > 0) {
              newNts.push({
                id: `nts_card_market_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '전통시장',
                company: `국세청 간소화 (${pName})`,
                amount: marketAmt,
                isNts: true,
                source: 'nts',
              });
            }
            if (transitAmt > 0) {
              newNts.push({
                id: `nts_card_transit_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '대중교통',
                company: `국세청 간소화 (${pName})`,
                amount: transitAmt,
                isNts: true,
                source: 'nts',
              });
            }
            // 7천만원 초과 시 문화체육은 따로 집계하지 않음
          } else {
            // [총급여 7천만원 이하]: 기존과 동일하게 신용카드, 직불·체크카드, 현금영수증 일반 금액 및 문화체육 따로 집계
            if (creditGen > 0) {
              newNts.push({
                id: `nts_card_credit_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '신용카드',
                company: `국세청 간소화 (${pName})`,
                amount: creditGen,
                isNts: true,
                source: 'nts',
              });
            }
            if (debitGen > 0) {
              newNts.push({
                id: `nts_card_debit_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '직불·체크카드',
                company: `국세청 간소화 (${pName})`,
                amount: debitGen,
                isNts: true,
                source: 'nts',
              });
            }
            if (cashGen > 0) {
              newNts.push({
                id: `nts_card_cash_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '현금영수증',
                company: `국세청 간소화 (${pName})`,
                amount: cashGen,
                isNts: true,
                source: 'nts',
              });
            }
            if (marketAmt > 0) {
              newNts.push({
                id: `nts_card_market_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '전통시장',
                company: `국세청 간소화 (${pName})`,
                amount: marketAmt,
                isNts: true,
                source: 'nts',
              });
            }
            if (transitAmt > 0) {
              newNts.push({
                id: `nts_card_transit_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '대중교통',
                company: `국세청 간소화 (${pName})`,
                amount: transitAmt,
                isNts: true,
                source: 'nts',
              });
            }
            const cultureTotal = totalCul > 0 ? totalCul : (creditCul + debitCul + cashCul);
            if (cultureTotal > 0) {
              newNts.push({
                id: `nts_card_culture_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '문화체육',
                company: `국세청 간소화 (${pName})`,
                amount: cultureTotal,
                isNts: true,
                source: 'nts',
              });
            }
          }
        });
      }

      // fallback: persons가 없고 currentData root에만 있는 경우
      if (newNts.length === 0) {
        let cGen = Number(currentData.credit_card_general || currentData.credit || 0);
        let dGen = Number(currentData.debit_card_cash || currentData.debit || 0);
        let rGen = Number(currentData.cash_receipt || currentData.cash || 0);
        let cCul = Number(currentData.credit_card_culture || 0);
        let dCul = Number(currentData.debit_card_culture || 0);
        let rCul = Number(currentData.cash_receipt_culture || 0);
        const totalCul = Number(currentData.culture || currentData.culture_amount || currentData.culture_sports || 0);

        if (cCul === 0 && dCul === 0 && rCul === 0 && totalCul > 0) {
          const sumG = cGen + dGen + rGen;
          if (sumG > 0) {
            cCul = Math.round(totalCul * (cGen / sumG));
            dCul = Math.round(totalCul * (dGen / sumG));
            rCul = totalCul - cCul - dCul;
          } else {
            cCul = totalCul;
          }
        }

        if (isOver70m) {
          cGen += cCul;
          dGen += dCul;
          rGen += rCul;
        }

        if (cGen > 0) {
          newNts.push({
            id: 'nts_card_1',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '신용카드',
            company: '국세청 간소화',
            amount: cGen,
            isNts: true,
            source: 'nts',
          });
        }
        if (dGen > 0) {
          newNts.push({
            id: 'nts_card_2',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '직불·체크카드',
            company: '국세청 간소화',
            amount: dGen,
            isNts: true,
            source: 'nts',
          });
        }
        if (rGen > 0) {
          newNts.push({
            id: 'nts_card_3',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '현금영수증',
            company: '국세청 현금영수증',
            amount: rGen,
            isNts: true,
            source: 'nts',
          });
        }
        if (currentData.market && currentData.market > 0) {
          newNts.push({
            id: 'nts_card_4',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '전통시장',
            company: '국세청 간소화',
            amount: Number(currentData.market),
            isNts: true,
            source: 'nts',
          });
        }
        if (currentData.transport && currentData.transport > 0) {
          newNts.push({
            id: 'nts_card_5',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '대중교통',
            company: '국세청 간소화',
            amount: Number(currentData.transport),
            isNts: true,
            source: 'nts',
          });
        }
        if (!isOver70m && totalCul > 0) {
          newNts.push({
            id: 'nts_card_6',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '문화체육',
            company: '국세청 간소화',
            amount: totalCul,
            isNts: true,
            source: 'nts',
          });
        }
      }
      return [...others, ...newNts];
    });

    // 5. 연금계좌 자동 적용 (요구사항: 상세 은행명/계좌/계약시작일 인별 매핑)
    setPensionItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      if (Array.isArray(persons) && persons.length > 0) {
        const newNts = [];
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = p.relation || '본인';

          if (Array.isArray(p.pension_details) && p.pension_details.length > 0) {
            p.pension_details.forEach((pd, pIdx) => {
              let pType = pd.type || '연금저축';
              if (pType.includes('ISA퇴직연금') || (/isa/i.test(pType) && (pType.includes('퇴직') || pType.includes('IRP')))) {
                pType = 'ISA퇴직연금';
              } else if (pType.includes('ISA연금저축') || (/isa/i.test(pType) && pType.includes('연금저축'))) {
                pType = 'ISA연금저축';
              } else if (pType.includes('IRP') || pType.includes('퇴직')) {
                pType = '퇴직연금';
              } else if (pType.includes('개인연금')) {
                pType = '개인연금저축';
              } else {
                pType = '연금저축';
              }

              newNts.push({
                id: `nts_pension_${pName}_${pIdx}_${idx}`,
                name: pName,
                relation: pRel,
                type: pType,
                bank: pd.bank || '국세청 간소화',
                account: pd.account || '',
                startDate: pd.startDate || '',
                endDate: pd.endDate || '',
                rawAmount: Number(pd.raw_amount || pd.amount || 0),
                amount: Number(pd.amount || pd.raw_amount || 0),
                isNts: true,
                source: 'nts',
              });
            });
          } else {
            const amt = Number(p.items?.personal_pension_saving) || 0;
            if (amt > 0) {
              newNts.push({
                id: `nts_pension_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '개인연금저축',
                bank: `국세청 간소화 (${pName})`,
                account: '',
                startDate: '1998-07-23',
                rawAmount: amt,
                amount: amt,
                isNts: true,
                source: 'nts',
              });
            }
          }
        });
        if (newNts.length > 0) return [...others, ...newNts];
      }
      const fallbackPension = Number(currentData.pension_saving || currentData.pension || currentData.personal_pension_saving || 0);
      if (fallbackPension > 0) {
        return [
          ...others,
          {
            id: 'nts_pension_1',
            name: (loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim(),
            relation: '본인',
            type: '연금저축',
            bank: '국세청 간소화',
            account: '국세청 연금계좌',
            rawAmount: fallbackPension,
            amount: fallbackPension,
            isNts: true,
            source: 'nts',
          },
        ];
      }
      return others;
    });

    // 6. 교육비 자동 적용 (국세청 자료 자동 매핑: 원본 전체 금액 보존 및 구분 정규화)
    setEduItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      if (Array.isArray(persons) && persons.length > 0) {
        const newNts = [];
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = (p.relation || '').trim();

          // 1. 본인 여부 확인
          const isSelfPerson =
            p.isSelf ||
            pRel === '본인' ||
            pName === (loggedInWorkerName || '').replace(/\(.*?\)/g, '').trim() ||
            pName === '본인';

          // 부양가족 매칭 정보 확인 (부양가족 페이지에 등록된 대상자)
          const matchedFam = familyMembers.find(
            (f) => (f.name || '').replace(/\(.*?\)/g, '').trim() === pName
          );

          // 본인이 아니고 부양가족 목록에 매칭되지 않은 경우 교육비 적용 제외
          if (!isSelfPerson && !matchedFam) {
            return;
          }

          // 세법 요건 1: 직계존속(부모, 조부모 등)의 교육비는 장애인 특수교육비만 공제 가능 (일반 교육비 제외)
          const effectiveRel = matchedFam?.relation || pRel;
          const isAscendant = !isSelfPerson && (
            effectiveRel.includes('존속') || effectiveRel.includes('부모') || effectiveRel.includes('부/모') ||
            effectiveRel.includes('조부') || effectiveRel.includes('조모')
          );

          // 세법 요건 2: 소득요건 초과 여부 확인 (소득금액 100만 원 초과 시에만 교육비 제외 - 나이요건은 무관)
          const isFamDisabled = Boolean(
            (matchedFam?.isDisabled ||
              (matchedFam?.disabledDeduction && matchedFam?.disabledDeduction !== '해당없음') ||
              p.isDisabled)
          );
          const isIncomeExcess = Boolean(
            p.income_excess ||
            matchedFam?.incomeExcess ||
            matchedFam?.incomeOver === '초과함'
          );

          // 본인 외 부양가족이 소득요건을 초과하고 장애인특수교육비가 아니면 제외
          if (!isSelfPerson && isIncomeExcess && !isFamDisabled) {
            return;
          }

          // 2. 부양가족 나이 계산 (본인 이외 부양가족: 만 7~18세 초·중·고등학생, 만 0~6세 취학전아동, 만 19세 이상 대학생)
          const birthStr = p.birth || p.rrn || matchedFam?.birth || matchedFam?.rrn || '';
          let calculatedAge = null;
          const digits = String(birthStr).replace(/[^0-9]/g, '');
          if (digits.length >= 6) {
            let year = parseInt(digits.slice(0, 2), 10);
            if (digits.length === 8 && /^(19|20)/.test(digits)) {
              year = parseInt(digits.slice(0, 4), 10); // "1981.01.01" 형식
            } else if (digits.length >= 7) {
              const gender = digits[6];
              const century = ['3', '4', '7', '8'].includes(gender) ? 2000 : 1900;
              year += century;
            } else if (digits.length === 8) {
              year = parseInt(digits.slice(0, 4), 10);
            } else {
              year += year <= 25 ? 2000 : 1900;
            }
            calculatedAge = 2025 - year;
          }

          const KNOWN_EDU_CATS = ['본인', '대학생', '취학전아동', '초·중·고등학생', '초.중.고등학생(현장학습비)', '중.고등학생(교복구입비)', '장애인특수교육'];
          // 교육비 분류: 국세청 서식의 교육비구분을 반영한 백엔드 분류를 우선하고, 없을 때만 문구·나이로 추정
          const normalizeEduCat = (cat, edItem = {}) => {
            if (isSelfPerson) {
              return '본인';
            }
            const given = String(edItem.category || cat || '').trim();
            if (KNOWN_EDU_CATS.includes(given) && given !== '본인') {
              return given;
            }
            const combined = `${cat || ''} ${edItem.category || ''} ${edItem.type || ''} ${edItem.edu_type || ''} ${edItem.school || ''}`.trim();
            if (combined.includes('사회복지시설') || combined.includes('발달재활') || combined.includes('특수교육')) {
              return '장애인특수교육';
            }
            if (combined.includes('교복')) {
              return '중.고등학생(교복구입비)';
            }
            if (combined.includes('현장체험') || combined.includes('체험학습') || combined.includes('현장학습')) {
              return '초.중.고등학생(현장학습비)';
            }
            if (combined.includes('수능') || combined.includes('입학전형') || combined.includes('응시료')) {
              return '대학생';
            }
            if (combined.includes('전문대') || combined.includes('대학')) {
              return '대학생';
            }
            if (combined.includes('유치원') || combined.includes('어린이집') || combined.includes('학원') || combined.includes('취학전')) {
              return '취학전아동';
            }
            if (combined.includes('고등') || combined.includes('중학') || combined.includes('초등') || combined.includes('초중고')) {
              return '초·중·고등학생';
            }
            if (calculatedAge !== null) {
              if (calculatedAge < 7) {
                return '취학전아동';
              }
              if (calculatedAge <= 18) {
                return '초·중·고등학생';
              }
              return '대학생';
            }
            return '초·중·고등학생';
          };

          if (Array.isArray(p.education_details) && p.education_details.length > 0) {
            const pEduDetails = [...p.education_details];

            pEduDetails.forEach((ed, eIdx) => {
              const rawAmt = Number(ed.raw_amount || ed.amount || 0);
              const normCat = normalizeEduCat(ed.category, ed);
              // 검토 필요 항목: 장애인 특수교육비는 부양가족 단계에서 장애인으로 등록되면 자동 포함,
              // 학령·나이 불일치 등은 사용자가 '포함하기'를 눌러야 반영
              const eduItemId = `nts_edu_${pName}_${eIdx}_${idx}`;
              let userIncluded = false;
              try {
                userIncluded = JSON.parse(localStorage.getItem('selftax_edu_review_included') || '[]').includes(eduItemId);
              } catch {
                userIncluded = false;
              }
              const reviewResolved = userIncluded || (normCat === '장애인특수교육' && (isFamDisabled || isSelfPerson));
              const needsReview = Boolean(ed.needs_review) && !reviewResolved;
              const amt = needsReview ? 0 : rawAmt;

              // 세법 요건: 직계존속의 교육비는 장애인 특수교육비만 공제 가능 (일반 교육비 제외)
              if (isAscendant && normCat !== '장애인특수교육') return;

              // 세법 요건: 소득 100만 원 이하 부양가족만 일반 교육비 가능 (나이요건은 무관, 장애인특수교육비는 소득제한 없음)
              if (!isSelfPerson && isIncomeExcess && normCat !== '장애인특수교육') {
                return;
              }

              newNts.push({
                id: eduItemId,
                name: pName,
                category: normCat,
                school: ed.school || '',
                amount: amt,
                rawAmount: rawAmt,
                needsReview,
                reviewReason: needsReview ? (ed.review_reason || '확인이 필요한 교육비입니다') : '',
                specialAmount: 0,
                isNts: true,
                source: 'nts',
              });
            });
          } else {
            const rawAmt = Number(p.items?.education_child) || 0;
            if (rawAmt > 0) {
              const normCat = normalizeEduCat('', {});
              // 세법 요건: 직계존속의 교육비는 장애인 특수교육비만 공제 가능 (일반 교육비 제외)
              if (isAscendant && normCat !== '장애인특수교육') return;
              // 세법 요건: 소득 100만 원 이하 부양가족만 일반 교육비 가능 (나이요건은 무관, 장애인특수교육비는 소득제한 없음)
              if (!isSelfPerson && isIncomeExcess && normCat !== '장애인특수교육') {
                return;
              }

              newNts.push({
                id: `nts_edu_${pName}_${idx}`,
                name: pName,
                category: normCat,
                amount: rawAmt,
                specialAmount: 0,
                isNts: true,
                source: 'nts',
              });
            }
          }
        });

        if (newNts.length > 0) return [...others, ...newNts];
      }
      if (currentData.education && currentData.education > 0) {
        return [
          ...others,
          {
            id: 'nts_edu_1',
            name: (loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim(),
            category: '본인',
            amount: Number(currentData.education),
            specialAmount: 0,
            isNts: true,
            source: 'nts',
          },
        ];
      }
      return others;
    });

    // 7. 장기집합증권 자동 적용 (요구사항 9: 벤처투자조합 출자 포함 상세 매핑)
    setLongInvestItems((prev) => {
      const others = prev.filter((item) => !item.isNts);
      if (Array.isArray(persons) && persons.length > 0) {
        const newNts = [];
        persons.forEach((p, idx) => {
          const rawName = p.name || loggedInWorkerName || '본인';
          const pName = rawName.replace(/\(.*?\)/g, '').trim();
          const pRel = p.relation || '본인';

          if (Array.isArray(p.long_invest_details) && p.long_invest_details.length > 0) {
            p.long_invest_details.forEach((ld, lIdx) => {
              const ldType = ld.type || '장기집합투자증권저축';
              const rawAmt = Number(ld.raw_amount || ld.amount || 0);
              const dedAmt = calculateLongInvestDeductible({
                type: ldType,
                rawAmount: rawAmt,
                startDate: ld.startDate || '',
                payYear: ld.payYear || '',
                deductibleAmount: ld.deductible_amount !== undefined ? Number(ld.deductible_amount) : Number(ld.amount || 0),
                isNts: true,
              }, workerTotalSalary);

              newNts.push({
                id: `nts_long_${pName}_${lIdx}_${idx}`,
                name: pName,
                relation: pRel,
                type: ldType,
                bank: ld.company || ld.bank || '국세청 간소화',
                account: ld.account || '',
                accountNo: ld.accountNo || '',
                fundName: ld.fundName || '',
                startDate: ld.startDate || '',
                payYear: ld.payYear || '',
                rawAmount: rawAmt,
                deductibleAmount: ld.deductible_amount !== undefined ? Number(ld.deductible_amount) : dedAmt,
                amount: dedAmt,
                isNts: true,
                source: 'nts',
              });
            });
          } else {
            const amt = Number(p.items?.long_invest_amount) || 0;
            if (amt > 0) {
              newNts.push({
                id: `nts_long_${pName}_${idx}`,
                name: pName,
                relation: pRel,
                type: '청년형 장기집합투자증권저축',
                bank: `국세청 간소화 (${pName})`,
                account: '',
                amount: amt,
                isNts: true,
                source: 'nts',
              });
            }
          }
        });
        if (newNts.length > 0) return [...others, ...newNts];
      }
      const fallbackLong = Number(currentData.long_invest || currentData.long_invest_amount || 0);
      if (fallbackLong > 0) {
        return [
          ...others,
          {
            id: 'nts_long_1',
            name: loggedInWorkerName || '본인',
            relation: '본인',
            type: '청년형 장기집합투자증권저축',
            bank: '국세청 간소화',
            account: '',
            amount: fallbackLong,
            isNts: true,
            source: 'nts',
          },
        ];
      }
      return others;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hometaxData, workerTotalSalary]);

  // 바텀시트 / 모달 상태
  const [showFamilyBottomSheet, setShowFamilyBottomSheet] = useState(false);
  const [showMedicalTypeBottomSheet, setShowMedicalTypeBottomSheet] = useState(false);
  const [showProofCodeBottomSheet, setShowProofCodeBottomSheet] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showRentProofModal, setShowRentProofModal] = useState(false);
  const [showAiAnalysisModal, setShowAiAnalysisModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('저장되었습니다.');

  // 연말정산 자료 작성완료 모달 상태 (첨부 이미지 4 규격 100% 일치)
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeCheckAll, setCompleteCheckAll] = useState(false);
  const [completeCheck1, setCompleteCheck1] = useState(false);
  const [completeCheck2, setCompleteCheck2] = useState(false);

  const handleToggleCompleteCheckAll = () => {
    const nextVal = !completeCheckAll;
    setCompleteCheckAll(nextVal);
    setCompleteCheck1(nextVal);
    setCompleteCheck2(nextVal);
  };

  const handleToggleCompleteCheck1 = () => {
    const nextVal = !completeCheck1;
    setCompleteCheck1(nextVal);
    setCompleteCheckAll(nextVal && completeCheck2);
  };

  const handleToggleCompleteCheck2 = () => {
    const nextVal = !completeCheck2;
    setCompleteCheck2(nextVal);
    setCompleteCheckAll(completeCheck1 && nextVal);
  };

  // 주택자금 상태 (localStorage 영구 보존) - 월세액 공제 상호배제 연동을 위해 상단 선언
  const [housingLoanItems, setHousingLoanItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_housing_loan');
      if (saved) return JSON.parse(saved);
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.housingLoanItems && Array.isArray(parsed.housingLoanItems)) {
          return parsed.housingLoanItems;
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [housingLoanChecklistAnswer, setHousingLoanChecklistAnswer] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_housing_loan_checklist');
      if (saved) return saved;
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.housingLoanChecklistAnswer) return parsed.housingLoanChecklistAnswer;
      }
      return null;
    } catch {
      return null;
    }
  });
  const totalHousingLoan = housingLoanItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // 장기주택저당차입금 공제 적용 여부 판정 (유주택자 -> 월세액 세액공제 불가능)
  const hasMortgageLoanDeduction = useMemo(() => {
    return (
      housingLoanChecklistAnswer !== 'no' &&
      housingLoanItems.some(
        (i) => i.type && i.type.includes('장기주택저당차입금') && (Number(i.amount) || 0) > 0
      )
    );
  }, [housingLoanItems, housingLoanChecklistAnswer]);

  // 월세액 관련 상태 (처음 등록 시 공제금액 없음 / 체크리스트 미진행)
  const [showRentChecklistNoticeModal, setShowRentChecklistNoticeModal] = useState(false);
  const [rentChecklistAnswer, setRentChecklistAnswer] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_rent_checklist');
      if (saved) return saved;
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.rentChecklistAnswer) return parsed.rentChecklistAnswer;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [showRentIneligibleModal, setShowRentIneligibleModal] = useState(false);
  const [rentItems, setRentItems] = useState(() => {
    try {
      const saved = getSecureItem('selftax_other_rent');
      if (saved && Array.isArray(saved)) return saved;
      const dedSaved = getSecureItem('selftax_deduction_data');
      if (dedSaved?.rentItems && Array.isArray(dedSaved.rentItems)) {
        return dedSaved.rentItems;
      }
      return [];
    } catch {
      return [];
    }
  });
  const [showRentAddModal, setShowRentAddModal] = useState(false);
  const [editingRentItemId, setEditingRentItemId] = useState(null);
  const [rentLandlord, setRentLandlord] = useState('');
  const [rentLandlordId, setRentLandlordId] = useState('');
  const [rentHouseType, setRentHouseType] = useState('오피스텔');
  const [rentAddress, setRentAddress] = useState('');
  const [rentContractPeriod, setRentContractPeriod] = useState('2025.01.01 ~ 2025.12.31');
  const [rentArea, setRentArea] = useState('');
  const [rentFormAmount, setRentFormAmount] = useState('');
  const [rentExpandedIds, setRentExpandedIds] = useState({});
  const toggleRentAccordion = (id) => setRentExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  // 수정 중인 항목 ID (null이면 신규 추가)
  const [editingItemId, setEditingItemId] = useState(null);

  // 부양가족 명단 — Step 2(부양가족)에서 등록된 정보(암호화 localStorage) 우선 반영, 본인은 로그인 근로자명으로 매핑
  const familyMembers = useMemo(() => {
    try {
      const saved = getSecureItem('selftax_family_list');
      if (saved && Array.isArray(saved) && saved.length > 0) {
        const list = saved.map((f, idx) => {
          const rawName = f.isSelf || f.relation === '본인' ? loggedInWorkerName : f.name;
          const cleanN = (rawName || '').replace(/\(.*?\)/g, '').trim();
          const isDisabled = Boolean(
            f.isDisabled ||
            (f.disabledDeduction && f.disabledDeduction !== '해당없음')
          );
          return {
            ...f,
            id: f.id || `f_${idx}`,
            name: rawName,
            rrn: f.rrn ? maskRrn(f.rrn) : '',
            relation: f.relation || (f.isSelf ? '본인' : '부양가족'),
            isSelf: Boolean(f.isSelf || f.relation === '본인'),
            disabledDeduction: isDisabled ? (f.disabledDeduction && f.disabledDeduction !== '해당없음' ? f.disabledDeduction : '장애인복지법상 장애인 (200만 원)') : (f.disabledDeduction || '해당없음'),
            isDisabled,
            basicDeduction: shouldExcludeBasicDeduction({ ...f, isDisabled }) ? '해당없음' : (f.basicDeduction || '기본공제 (150만 원)'),
            incomeOver: f.incomeOver || '초과하지 않음',
          };
        });
        // 본인이 없으면 맨 앞에 추가
        if (!list.some((f) => f.isSelf || f.relation === '본인')) {
          list.unshift({ id: 'self', name: loggedInWorkerName, rrn: '', relation: '본인', isSelf: true });
        }
        // 본인이 항상 맨 앞에 오도록 정렬
        return list.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : 0));
      }
    } catch (e) {
      console.error(e);
    }
    return [
      { id: 'self', name: loggedInWorkerName, rrn: '', relation: '본인', isSelf: true, isDisabled: false },
    ];
  }, [loggedInWorkerName]);

  // 의료비 입력 폼 필드 상태 (성명: 로그인 근로자 기준, 본인/부양가족 표기 제거)
  const [formFamilyName, setFormFamilyName] = useState((loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim());
  const [formMedicalType, setFormMedicalType] = useState('일반의료비');
  const [formHospitalName, setFormHospitalName] = useState('');
  const [formBizNumber, setFormBizNumber] = useState('');
  const [formProofCode, setFormProofCode] = useState('기타');
  const [formCount, setFormCount] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formInsuranceAmount, setFormInsuranceAmount] = useState('');
  const [formReceiptFile, setFormReceiptFile] = useState(null);

  // 전체 의료비 지출 순 합계액 (실손보험금 차감 및 안경/산후조리원 한도 적용 후 전체 합계)
  const overallMedicalTotal = useMemo(() => {
    return medicalItems.reduce((acc, item) => {
      const rawAmt = Number(item.amount) || 0;
      const insAmt = Number(item.insuranceAmount) || 0;
      const t = (item.type || '').trim();
      let effectiveAmt = rawAmt;
      if (t.includes('안경') || t.includes('콘텍트렌즈') || t.includes('콘택트렌즈')) {
        effectiveAmt = Math.min(500000, rawAmt);
      } else if (t.includes('산후조리')) {
        effectiveAmt = Math.min(2000000, rawAmt);
      }
      return acc + (effectiveAmt - insAmt);
    }, 0);
  }, [medicalItems]);

  // 의료비 수정 리스트 표기 금액 계산
  // 인별 실손의료보험금이 의료비 지출액을 초과하더라도 전체 의료비 지출 합계액이 양수라면 음수로 금액표기. 음수라면 0원으로 표기
  const getMedicalItemDisplayAmount = (item) => {
    const rawAmt = Number(item.amount) || 0;
    const insAmt = Number(item.insuranceAmount) || 0;
    const t = (item.type || '').trim();
    let effectiveAmt = rawAmt;

    if (t.includes('안경') || t.includes('콘텍트렌즈') || t.includes('콘택트렌즈')) {
      effectiveAmt = Math.min(500000, rawAmt);
    } else if (t.includes('산후조리')) {
      effectiveAmt = Math.min(2000000, rawAmt);
    }

    const netAmt = effectiveAmt - insAmt;

    if (netAmt < 0) {
      // 전체 의료비 지출 합계액이 양수라면 음수로 금액표기. 음수(0 이하)라면 0원으로 표기
      return overallMedicalTotal > 0 ? netAmt : 0;
    }
    return netAmt;
  };

  // 의료비 인별 한도 적용 및 종류별 집계 헬퍼 (안경 인당 50만원, 산후조리원 회당 200만원 한도 적용)
  // 사용자 요구사항: 인별 세부항목은 계산된 내용대로 표기하고, 인별 합계금액이 음수일 때만 0원으로 표기
  const getMemberMedicalSummary = (items) => {
    let glassesSum = 0;
    let postpartumSum = 0;
    const typeMap = {};

    items.forEach((item) => {
      const rawAmt = Number(item.amount) || 0;
      const insAmt = Number(item.insuranceAmount) || 0;
      const netAmt = rawAmt - insAmt;
      const t = (item.type || '일반의료비').trim();

      if (t.includes('안경') || t.includes('콘텍트렌즈') || t.includes('콘택트렌즈')) {
        glassesSum += netAmt;
      } else if (t.includes('산후조리')) {
        const capped = Math.min(2000000, rawAmt);
        postpartumSum += (capped - insAmt);
      } else {
        const typeKey = (t === '간소화자료' || t === '일반' || t === '일반 의료비') ? '일반의료비' : t;
        typeMap[typeKey] = (typeMap[typeKey] || 0) + netAmt;
      }
    });

    if (glassesSum !== 0) {
      typeMap['안경 또는 콘텍트렌즈 구입비용'] = glassesSum > 0 ? Math.min(500000, glassesSum) : glassesSum;
    }
    if (postpartumSum !== 0) {
      typeMap['산후조리원 비용'] = postpartumSum;
    }

    // 인별 세부항목은 계산된 내용 그대로 유지 (0원으로 임의 강제 변환하지 않음)
    // 인별 합계금액은 세부항목들의 합계가 음수일 때만 0원으로 표기
    const rawMemberTotal = Object.values(typeMap).reduce((acc, val) => acc + val, 0);
    const memberTotal = Math.max(0, rawMemberTotal);

    return { typeMap, memberTotal };
  };

  // 총 의료비 계산 (조회 페이지 한도: 안경 인당 50만, 산후조리원 회당 200만 적용)
  const totalMedicalAmount = useMemo(() => {
    const allCleanNames = Array.from(new Set(medicalItems.map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())));
    let total = 0;
    allCleanNames.forEach((mName) => {
      const mItems = medicalItems.filter((i) => (i.name || '').replace(/\(.*?\)/g, '').trim() === mName);
      const { memberTotal } = getMemberMedicalSummary(mItems);
      total += memberTotal;
    });
    return Math.max(0, total);
  }, [medicalItems, overallMedicalTotal]);

  // 의료비 종류별 합계금액 (조회 페이지 합계금액 아래 표기용)
  const medicalTypeTotals = useMemo(() => {
    const allCleanNames = Array.from(new Set(medicalItems.map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())));
    const totals = {
      '일반의료비': 0,
      '안경 또는 콘텍트렌즈 구입비용': 0,
      '산후조리원 비용': 0,
    };

    allCleanNames.forEach((mName) => {
      const mItems = medicalItems.filter((i) => (i.name || '').replace(/\(.*?\)/g, '').trim() === mName);
      const { typeMap } = getMemberMedicalSummary(mItems);
      Object.entries(typeMap).forEach(([t, amt]) => {
        totals[t] = (totals[t] || 0) + amt;
      });
    });

    const standardOrder = ['일반의료비', '안경 또는 콘텍트렌즈 구입비용', '산후조리원 비용', '난임시술비'];
    return Object.entries(totals)
      .filter(([t, amt]) => {
        if (t === '일반의료비' || t === '안경 또는 콘텍트렌즈 구입비용' || t === '산후조리원 비용') {
          return true;
        }
        return amt !== 0 || medicalItems.some((i) => (i.type || '').trim() === t);
      })
      .sort((a, b) => {
        const idxA = standardOrder.indexOf(a[0]);
        const idxB = standardOrder.indexOf(b[0]);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a[0].localeCompare(b[0]);
      });
  }, [medicalItems, overallMedicalTotal]);

  // 소득세법 제59조의4 제2항 카테고리별 의료비 집계 (인별 안경 50만원 한도, 산후조리원 200만원 한도, 실손보험금 인별 차감 적용)
  const categorizedMedical = useMemo(() => {
    let self = 0;
    let special = 0;
    let general = 0;
    let premature = 0;
    let infertility = 0;

    // 인별로 의료비 항목 그룹화
    const memberMap = {};
    medicalItems.forEach((item) => {
      const pName = String(item.name || '').replace(/\(.*?\)/g, '').trim() || (loggedInWorkerName || '본인');
      if (!memberMap[pName]) memberMap[pName] = [];
      memberMap[pName].push(item);
    });

    Object.entries(memberMap).forEach(([pName, memberItems]) => {
      let mGeneral = 0;
      let mGlasses = 0;
      let mPostpartum = 0;
      let mInfer = 0;
      let mPrem = 0;
      let mInsTotal = 0;
      let mRel = memberItems[0]?.relation || '';

      memberItems.forEach((item) => {
        const rawAmt = Number(item.amount) || 0;
        const insAmt = Number(item.insuranceAmount) || 0;
        mInsTotal += insAmt;
        const t = String(item.type || '').trim();
        if (t.includes('난임')) {
          mInfer += rawAmt;
        } else if (t.includes('미숙아') || t.includes('선천성')) {
          mPrem += rawAmt;
        } else if (t.includes('안경') || t.includes('콘텍트렌즈') || t.includes('콘택트렌즈')) {
          mGlasses += rawAmt;
        } else if (t.includes('산후조리')) {
          mPostpartum += Math.min(2000000, rawAmt);
        } else {
          mGeneral += rawAmt;
        }
      });

      // 안경구입비 1인당 연 50만원 한도 적용
      const cappedGlasses = Math.min(500000, mGlasses);
      const totalEligible = mGeneral + cappedGlasses + mPostpartum + mInfer + mPrem;
      // 실손의료보험금 인별 차감
      let netEligible = Math.max(0, totalEligible - mInsTotal);
      if (netEligible <= 0) return;

      const fMember = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === pName);
      const isSelf = mRel.includes('본인') || pName === loggedInWorkerName || pName === '본인' || Boolean(fMember?.isSelf || fMember?.relation === '본인');
      const birthStr = String(fMember?.birth || fMember?.birthDate || '').trim();
      let bYear = null;
      if (birthStr.length >= 4) {
        const matchYear = birthStr.match(/^(19\d{2}|20\d{2})/);
        bYear = matchYear ? parseInt(matchYear[1], 10) : parseInt(birthStr.slice(0, 4), 10);
      } else if (fMember?.rrn) {
        const cleanR = String(fMember.rrn).replace(/[^0-9]/g, '');
        if (cleanR.length >= 6) {
          const fy = parseInt(cleanR.slice(0, 2), 10);
          bYear = fy <= 25 ? 2000 + fy : 1900 + fy;
        }
      }

      const isSenior = Boolean(
        fMember?.isSenior ||
        (fMember?.seniorDeduction && fMember.seniorDeduction !== '해당없음') ||
        (bYear !== null && bYear <= 1960) ||
        mRel.includes('경로우대') || mRel.includes('65세') || pName.includes('65세')
      );
      const isUnder6 = Boolean(
        (bYear !== null && bYear >= 2019) ||
        mRel.includes('6세') || pName.includes('6세')
      );
      const isDisabled = Boolean(
        fMember?.isDisabled ||
        (fMember?.disabledDeduction && fMember.disabledDeduction !== '해당없음') ||
        mRel.includes('장애인') || pName.includes('장애인')
      );
      const isSpecialIll = Boolean(
        fMember?.isSeverelyIll ||
        mRel.includes('산정특례') || pName.includes('산정특례') || mRel.includes('중증질환')
      );

      if (mInfer > 0) {
        infertility += Math.max(0, mInfer - mInsTotal);
        mInsTotal = Math.max(0, mInsTotal - mInfer);
      }
      if (mPrem > 0) {
        premature += Math.max(0, mPrem - mInsTotal);
        mInsTotal = Math.max(0, mInsTotal - mPrem);
      }

      if (isSelf) {
        self += netEligible;
      } else if (isSenior || isUnder6 || isDisabled || isSpecialIll) {
        special += netEligible;
      } else {
        general += netEligible;
      }
    });

    return { self, special, general, premature, infertility };
  }, [medicalItems, familyMembers, loggedInWorkerName]);

  // 총 월세액 지출금액 합계
  const totalRentAmount = rentItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // 월세액 세액공제 항목별 한도계산 맵 (연간 1,000만원 한도 순차 차감 적용, 총급여 8천만원 초과 또는 장기주택저당차입금 공제 적용 시 공제 제외)
  const rentLimitDisplayMap = useMemo(() => {
    // 세법 요건: 장기주택저당차입금 공제를 받은 경우(유주택자) 또는 총급여 8천만원 초과 시 월세액 세액공제 대상 제외 -> 0원 처리
    if (hasMortgageLoanDeduction || workerTotalSalary > 80000000) {
      const map = {};
      rentItems.forEach((item) => {
        map[item.id] = 0;
      });
      return map;
    }
    let remaining = 10000000; // 연간 공제대상 한도 1,000만원
    const map = {};
    rentItems.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const allowed = Math.min(raw, Math.max(0, remaining));
      map[item.id] = allowed;
      remaining -= allowed;
    });
    return map;
  }, [rentItems, workerTotalSalary, hasMortgageLoanDeduction]);

  // 한도 적용된 총 월세액 공제대상 금액 합계 (최대 1,000만원)
  const totalRentLimitAmount = useMemo(() => {
    return Object.values(rentLimitDisplayMap).reduce((sum, v) => sum + v, 0);
  }, [rentLimitDisplayMap]);

  // 월세액 인별 명단 추출 (국세청자료 / 기타자료)
  const rentNtsMembers = useMemo(() => {
    const names = new Set();
    rentItems
      .filter((i) => i.source === 'nts' || i.isNts)
      .forEach((i) => {
        const n = (i.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim();
        if (n) names.add(n);
      });
    if (names.size === 0 && rentItems.some((i) => i.source === 'nts' || i.isNts)) {
      names.add(loggedInWorkerName || '본인');
    }
    return Array.from(names);
  }, [rentItems, loggedInWorkerName]);

  const rentOtherMembers = useMemo(() => {
    const names = new Set();
    rentItems
      .filter((i) => i.source !== 'nts' && !i.isNts)
      .forEach((i) => {
        const n = (i.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim();
        if (n) names.add(n);
      });
    if (names.size === 0 && rentItems.some((i) => i.source !== 'nts' && !i.isNts)) {
      names.add(loggedInWorkerName || '본인');
    }
    return Array.from(names);
  }, [rentItems, loggedInWorkerName]);

  // 교육비 기타자료 목록 상태 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [eduItems, setEduItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_education');
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.map((item) => {
        const cleanN = (item.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
        return { ...item, name: cleanN };
      });
    } catch {
      return [];
    }
  });

  const [expandedEduMembers, setExpandedEduMembers] = useState({});
  const [expandedOtherEduMembers, setExpandedOtherEduMembers] = useState({});
  const toggleEduMemberAccordion = (memberName) => {
    setExpandedEduMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };
  const toggleOtherEduMemberAccordion = (memberName) => {
    setExpandedOtherEduMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };

  // 교육비 구분별 공제한도
  // - 본인 / 장애인특수교육: 무제한 (전액 공제)
  // - 대학생: 1인당 연 900만원
  // - 취학전아동 / 초·중·고등학생: 1인당 연 300만원
  // - 중.고등학생(교복구입비): 1인당 연 50만원
  // - 초.중.고등학생(현장학습비): 1인당 연 30만원
  const getEduLimit = (category, memberName = '') => {
    const cat = (category || '').trim();


    if (cat.includes('교복')) {
      return 500000;
    }
    if (cat.includes('현장학습') || cat.includes('체험학습')) {
      return 300000;
    }
    if (cat.includes('대학') && !cat.includes('초') && !cat.includes('중') && !cat.includes('고')) {
      return 9000000;
    }
    if (cat.includes('취학전') || cat.includes('유치원') || cat.includes('어린이집')) {
      return 3000000;
    }
    if (cat.includes('초') || cat.includes('중') || cat.includes('고')) {
      return 3000000;
    }
    if (cat.includes('본인') || cat.includes('장애인')) {
      return Infinity;
    }

    const isFamDisabled = Boolean(
      cleanN &&
        familyMembers.some((m) => {
          const mn = (m.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
          return mn === cleanN && (m.isDisabled || (m.disabledDeduction && m.disabledDeduction !== '해당없음'));
        })
    );
    if (isFamDisabled) {
      return Infinity; // 장애인공제 대상 부양가족은 특수교육비 전액 공제
    }

    return 3000000;
  };

  // 교육비 수정 리스트 표기 금액 계산 (공제한도 초과한 금액은 한도까지만 표기)
  const getEduItemDisplayAmount = (item) => {
    const rawAmt = Number(item.amount) || 0;
    const specialAmt = Number(item.specialAmount) || 0;
    const limit = getEduLimit(item.category, item.name);
    const capped = limit === Infinity ? rawAmt : Math.min(limit, rawAmt);
    return capped + specialAmt;
  };

  // 교육비 인별 한도 적용 및 종류별 집계 헬퍼 (국세청자료/기타자료 상세내역용)
  const getMemberEduSummary = (items) => {
    const typeMap = {};
    let specialTotal = 0;
    const memberName = items.length > 0 ? (items[0].name || '') : '';

    items.forEach((item) => {
      const cat = item.category || '본인';
      const rawAmt = Number(item.amount) || 0;
      const specialAmt = Number(item.specialAmount) || 0;
      typeMap[cat] = (typeMap[cat] || 0) + rawAmt;
      specialTotal += specialAmt;
    });

    // 구분별 한도 적용
    Object.keys(typeMap).forEach((cat) => {
      const limit = getEduLimit(cat, memberName);
      if (limit !== Infinity && typeMap[cat] > limit) {
        typeMap[cat] = limit;
      }
    });

    if (specialTotal > 0) {
      typeMap['장애인특수교육'] = (typeMap['장애인특수교육'] || 0) + specialTotal;
    }

    const memberTotal = Object.values(typeMap).reduce((acc, val) => acc + val, 0);
    return { typeMap, memberTotal };
  };

  // 총 교육비 계산 (인별 한도 적용 반영)
  const totalEduAmount = useMemo(() => {
    const allCleanNames = Array.from(new Set(eduItems.map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())));
    let total = 0;
    allCleanNames.forEach((mName) => {
      const mItems = eduItems.filter((i) => (i.name || '').replace(/\(.*?\)/g, '').trim() === mName);
      const { memberTotal } = getMemberEduSummary(mItems);
      total += memberTotal;
    });
    return total;
  }, [eduItems]);

  // 교육비 구분별 합계금액 (조회 페이지 합계금액 아래 표기용)
  const eduTypeTotals = useMemo(() => {
    const allCleanNames = Array.from(new Set(eduItems.map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())));
    const totals = {};

    allCleanNames.forEach((mName) => {
      const mItems = eduItems.filter((i) => (i.name || '').replace(/\(.*?\)/g, '').trim() === mName);
      const { typeMap } = getMemberEduSummary(mItems);
      Object.entries(typeMap).forEach(([t, amt]) => {
        totals[t] = (totals[t] || 0) + amt;
      });
    });

    const standardOrder = [
      '취학전아동',
      '초·중·고등학생',
      '중.고등학생(교복구입비)',
      '초.중.고등학생(현장학습비)',
      '중.고등학교 학생(교복구입비)',
      '초.중.고등학교 학생(현장학습비)',
      '중·고등학교 학생(교복구입비)',
      '초·중·고등학교 학생(현장학습비)',
      '대학생',
      '본인',
      '장애인특수교육',
    ];

    return Object.entries(totals)
      .filter(([t, amt]) => {
        return amt > 0 || eduItems.some((i) => (i.category || '').trim() === t);
      })
      .sort((a, b) => {
        const idxA = standardOrder.indexOf(a[0]);
        const idxB = standardOrder.indexOf(b[0]);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a[0].localeCompare(b[0]);
      });
  }, [eduItems]);

  // 교육비 폼 상태 (성명: 로그인 근로자 기준, 본인/부양가족 표기 제거)
  const [editingEduItemId, setEditingEduItemId] = useState(null);
  const [formEduName, setFormEduName] = useState((loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim());
  const [formEduCategory, setFormEduCategory] = useState('본인');
  const [formEduAmount, setFormEduAmount] = useState('0');
  const [formEduSpecialAmount, setFormEduSpecialAmount] = useState('');
  const [showEduProofModal, setShowEduProofModal] = useState(false);

  // 교육비 기타자료 영구 보존
  useEffect(() => {
    try {
      const others = eduItems.filter((i) => !i.isNts);
      localStorage.setItem('selftax_other_education', JSON.stringify(others));
    } catch (e) {
      console.error(e);
    }
  }, [eduItems]);

  // 교육비 신규 추가 폼 열기 (성명: 로그인 근로자 기준, 금액: 0원)
  const handleOpenAddEdu = () => {
    setEditingEduItemId(null);
    setFormEduName((loggedInWorkerName || '본인').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim());
    setFormEduCategory('본인');
    setFormEduAmount('0');
    setFormEduSpecialAmount('');
    setViewMode('edu_add');
  };

  // 교육비 폼에서 성명 변경 핸들러 (장애인공제 대상 부양가족은 장애인특수교육 기본 설정)
  const handleEduNameChange = (newName) => {
    const cleanN = (newName || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
    setFormEduName(cleanN);
    const isFamDisabled = Boolean(
      cleanN &&
        familyMembers.some((m) => {
          const mn = (m.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
          return mn === cleanN && (m.isDisabled || (m.disabledDeduction && m.disabledDeduction !== '해당없음'));
        })
    );
    if (isFamDisabled) {
      setFormEduCategory('장애인특수교육');
    } else {
      const member = familyMembers.find((m) => (m.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim() === cleanN);
      if (member?.isSelf || cleanN === loggedInWorkerName) {
        setFormEduCategory('본인');
      }
    }
  };

  // '확인 필요' 교육비를 사용자가 확인 후 포함 (선택은 브라우저에 보관되어 재업로드 시에도 유지)
  const includeReviewEduItem = (itemId) => {
    try {
      const saved = JSON.parse(localStorage.getItem('selftax_edu_review_included') || '[]');
      if (!saved.includes(itemId)) {
        localStorage.setItem('selftax_edu_review_included', JSON.stringify([...saved, itemId]));
      }
    } catch {
      // 저장 실패 시에도 현재 화면에는 반영
    }
    setEduItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, amount: Number(i.rawAmount || 0), needsReview: false, reviewReason: '' } : i
      )
    );
  };

  // 교육비 기존 항목 수정 폼 열기 (원본 전체 금액 표시)
  const handleEditEduItem = (item) => {
    setEditingEduItemId(item.id);
    const cleanName = (item.name || loggedInWorkerName || '본인').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
    setFormEduName(cleanName);
    const cat = item.category || '본인';
    setFormEduCategory(cat);
    setFormEduAmount(item.amount ? Number(item.amount).toLocaleString() : '0');
    setFormEduSpecialAmount(item.specialAmount ? Number(item.specialAmount).toLocaleString() : '');
    setViewMode('edu_add');
  };

  // 교육비 저장 및 수정 핸들러
  const handleSaveEduItem = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formEduAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanSpecial = parseInt(String(formEduSpecialAmount).replace(/[^0-9]/g, ''), 10) || 0;

    if (cleanAmount <= 0 && cleanSpecial <= 0) {
      showAlert('교육비 금액을 입력해주세요.');
      return;
    }

    const cleanName = (formEduName || loggedInWorkerName || '본인').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim();
    const member = familyMembers.find((m) => (m.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim() === cleanName);
    const isSelfPerson = Boolean(member?.isSelf || member?.relation === '본인' || cleanName === loggedInWorkerName);
    const effectiveRel = member?.relation || '본인';

    // 세법 요건: 직계존속의 교육비는 장애인 특수교육비만 세액공제 가능 (일반 교육비 제외)
    const isAscendant = !isSelfPerson && (
      effectiveRel.includes('존속') || effectiveRel.includes('부모') || effectiveRel.includes('부/모') ||
      effectiveRel.includes('조부') || effectiveRel.includes('조모')
    );
    if (isAscendant && formEduCategory !== '장애인특수교육' && cleanSpecial <= 0) {
      showAlert('직계존속의 교육비는 장애인 특수교육비만 세액공제 대상입니다. (일반 초·중·고, 대학교 교육비 등은 공제 제외)');
      return;
    }

    // 세법 요건: 일반 교육비는 소득금액 100만 원 이하 부양가족만 가능 (나이요건 없음, 장애인 특수교육비는 소득제한 없음)
    if (!isSelfPerson && member && (member.incomeOver === '초과함' || member.incomeExcess) && formEduCategory !== '장애인특수교육' && cleanSpecial <= 0) {
      showAlert('소득금액 요건(연간 100만 원)을 초과한 부양가족의 일반 교육비는 세액공제 대상에서 제외됩니다.');
      return;
    }

    const existingItem = eduItems.find((item) => item.id === editingEduItemId);
    const isNts = existingItem ? !!existingItem.isNts : false;

    if (editingEduItemId) {
      // 기존 항목 수정
      setEduItems((prev) =>
        prev.map((item) =>
          item.id === editingEduItemId
            ? {
                ...item,
                name: cleanName,
                category: formEduCategory,
                amount: cleanAmount,
                specialAmount: cleanSpecial,
                isNts,
                source: isNts ? 'nts' : 'other',
              }
            : item
        )
      );
      setViewMode('edu_edit');
      setToastMsg(`${cleanName}님의 교육비 자료가 수정되었습니다.`);
    } else {
      // 신규 항목 추가 (기타자료)
      const newItem = {
        id: `edu_${Date.now()}`,
        name: cleanName,
        category: formEduCategory,
        amount: cleanAmount,
        specialAmount: cleanSpecial,
        isNts: false,
        source: 'other',
      };

      setEduItems((prev) => [...prev, newItem]);
      setViewMode('edu_edit');
      setToastMsg(`${cleanName}님의 교육비가 등록되었습니다.`);
    }

    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 교육비 삭제 핸들러 (이미지 1의 ✕ 버튼)
  const handleDeleteEduItem = (id) => {
    setEduItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 보험료 상태 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [insuranceItems, setInsuranceItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_insurance');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [expandedInsuranceMembers, setExpandedInsuranceMembers] = useState({});
  const [expandedOtherInsuranceMembers, setExpandedOtherInsuranceMembers] = useState({});
  const toggleInsuranceMemberAccordion = (memberName) => {
    setExpandedInsuranceMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };
  const toggleOtherInsuranceMemberAccordion = (memberName) => {
    setExpandedOtherInsuranceMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };
  const [editingInsItemId, setEditingInsItemId] = useState(null);
  const [formInsName, setFormInsName] = useState((loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim());
  const [formInsType, setFormInsType] = useState('일반보장성보험');
  const [formInsCompany, setFormInsCompany] = useState('');
  const [formInsAmount, setFormInsAmount] = useState('');
  const [showInsuranceProofModal, setShowInsuranceProofModal] = useState(false);

  // 총 일반보장성 / 장애인보장성 / 전체 합계 계산
  const totalGeneralInsurance = insuranceItems
    .filter((item) => item.type === '일반보장성보험')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalDisabledInsurance = insuranceItems
    .filter((item) => item.type === '장애인보장성보험' || item.type === '장애인전용보장성보험')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalInsuranceAmount = totalGeneralInsurance + totalDisabledInsurance;

  // 보험료 신규 추가 폼 열기 (성명: 로그인 근로자 기준, 본인/부양가족 표기 제거)
  const handleOpenAddInsurance = () => {
    setEditingInsItemId(null);
    setFormInsName((loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim());
    setFormInsType('일반보장성보험');
    setFormInsCompany('');
    setFormInsAmount('');
    setViewMode('insurance_add');
  };

  // 보험료 기존 항목 수정 폼 열기 (연말정산 PDF 종류 매핑된 유형 유지)
  const handleEditInsuranceItem = (item) => {
    setEditingInsItemId(item.id);
    const cleanName = (item.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim();
    setFormInsName(cleanName);
    setFormInsType(item.type || '일반보장성보험');
    setFormInsCompany(item.company || '');
    setFormInsAmount(item.amount ? Number(item.amount).toLocaleString() : '');
    setViewMode('insurance_add');
  };

  // 보험료 저장 및 수정 핸들러
  const handleSaveInsuranceItem = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formInsAmount).replace(/[^0-9]/g, ''), 10) || 0;

    if (cleanAmount <= 0) {
      showAlert('보험료 금액을 입력해주세요.');
      return;
    }

    const cleanName = (formInsName || '').replace(/\(.*?\)/g, '').trim();
    const member = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === cleanName);
    const relation = member ? member.relation : '본인';

    if (editingInsItemId) {
      setInsuranceItems((prev) =>
        prev.map((item) =>
          item.id === editingInsItemId
            ? {
                ...item,
                name: cleanName,
                relation,
                type: formInsType,
                company: formInsCompany || (formInsType === '장애인전용보장성보험' ? '장애인전용보장성보험' : '일반보장성보험'),
                amount: cleanAmount,
              }
            : item
        )
      );
      setViewMode('insurance_edit');
      setToastMsg(`${cleanName}님의 보험료 자료가 수정되었습니다.`);
    } else {
      const newItem = {
        id: `ins_${Date.now()}`,
        name: cleanName,
        relation,
        type: formInsType,
        company: formInsCompany || (formInsType === '장애인전용보장성보험' ? '장애인전용보장성보험' : '보장성보험'),
        amount: cleanAmount,
        isNts: false,
        source: 'other',
      };
      setInsuranceItems((prev) => [...prev, newItem]);
      setViewMode('insurance_edit');
      setToastMsg(`${cleanName}님의 보험료가 등록되었습니다.`);
    }

    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 보험료 삭제 핸들러
  const handleDeleteInsuranceItem = (id) => {
    setInsuranceItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 기부금 상태 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [donationTab, setDonationTab] = useState('current');
  const [donationItems, setDonationItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_donation');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => {
        const cleanRew = String(item.rewardAmount ?? item.reward_amount ?? '').replace(/[^0-9]/g, '');
        const cleanAmt = String(item.amount ?? '').replace(/[^0-9]/g, '');
        return {
          ...item,
          amount: cleanAmt ? parseInt(cleanAmt, 10) : 0,
          rewardAmount: cleanRew ? parseInt(cleanRew, 10) : 0,
        };
      });
    } catch {
      return [];
    }
  });

  // 전년도 이월 기부금 (소득세법 제61조: 특례·일반기부금 10년 이월) — localStorage 보존
  const [donationCarryoverItems, setDonationCarryoverItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_donation_carryover');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('selftax_donation_carryover', JSON.stringify(donationCarryoverItems));
    } catch {
      /* 저장 실패 시 화면 상태만 유지 */
    }
  }, [donationCarryoverItems]);

  // 이월 기부금 공제·다음 해 이월 예상 (예상세액 계산과 같은 엔진으로 미리보기)
  const donationCarryoverPreview = useMemo(() => {
    if (!donationCarryoverItems.length) return null;
    try {
      const wh = getSecureItem('selftax_withholding_data');
      const saved = getSecureItem('selftax_deduction_data') || {};
      const r = calculateSettlementTax({
        userName: loggedInWorkerName,
        taxYear: '2025',
        withholdingData: wh ? { ...wh, totalSalary: Number(wh.totalSalary ?? wh.gross_salary ?? wh.salary ?? 0) } : null,
        previousJobs: getSecureItem('selftax_previous_jobs', []) || [],
        deductionData: { ...saved, donationItems, donationCarryoverItems },
        hometaxData: getSecureItem('hometax_extracted_data'),
        familyList: getSecureItem('selftax_family_list', []) || [],
      });
      return r?.taxCredits?.donationCarryoverNext || null;
    } catch {
      return null;
    }
  }, [donationCarryoverItems, donationItems, loggedInWorkerName]);

  // 아코디언 상태 (국세청자료 & 기타자료 인별 아코디언)
  const [expandedDonationMembers, setExpandedDonationMembers] = useState({});
  const [expandedOtherDonationMembers, setExpandedOtherDonationMembers] = useState({});
  const toggleOtherDonationMemberAccordion = (memberName) => {
    setExpandedOtherDonationMembers((prev) => ({ ...prev, [memberName]: !prev[memberName] }));
  };

  // 기부금 추가/수정 폼 상태 (성명: 로그인 근로자 기준, 본인/부양가족 표기 제거)
  const [editingDonItemId, setEditingDonItemId] = useState(null);
  const [formDonName, setFormDonName] = useState(loggedInWorkerName.replace(/\(.*?\)/g, '').trim());
  const [formDonType, setFormDonType] = useState('특례(법정)기부금');
  const [formDonCompany, setFormDonCompany] = useState('');
  const [formDonBizNumber, setFormDonBizNumber] = useState('');
  const [formDonCount, setFormDonCount] = useState('');
  const [formDonAmount, setFormDonAmount] = useState('');
  const [formDonRewardAmount, setFormDonRewardAmount] = useState('');
  const [showDonationProofModal, setShowDonationProofModal] = useState(false);

  // 유형별 기부금 합계 계산 (7대 기부금 유형)
  // 조세특례제한법: 정치자금기부금 및 우리사주조합기부금은 본인 지출분만 인정
  const totalPoliticalDonation = donationItems
    .filter((item) => {
      const isSelf = !item.relation || item.relation === '본인' || (item.name || '').includes(loggedInWorkerName);
      return item.type?.includes('정치자금') && isSelf;
    })
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalHometownDonation = donationItems
    .filter((item) => item.type?.includes('고향사랑') || item.type?.includes('고향'))
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalEmployeeStockDonation = donationItems
    .filter((item) => {
      const isSelf = !item.relation || item.relation === '본인' || (item.name || '').includes(loggedInWorkerName);
      return item.type?.includes('우리사주') && isSelf;
    })
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalSpecialDonation = donationItems
    .filter((item) => item.type?.includes('특례') || item.type?.includes('법정'))
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalGeneralNonReligiousDonation = donationItems
    .filter((item) => item.type?.includes('종교단체외') || (item.type?.includes('일반') && !item.type?.includes('종교단체일반') && !item.type?.includes('종교기부금') && !item.type?.includes('종교단체기부금')) || (item.type?.includes('지정') && !item.type?.includes('종교단체일반')))
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalGeneralReligiousDonation = donationItems
    .filter((item) => (item.type?.includes('종교단체일반') || item.type?.includes('종교기부금') || item.type?.includes('종교단체기부금') || (item.type?.includes('종교') && !item.type?.includes('종교단체외'))))
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalDonationAmount = donationItems.reduce(
    (acc, item) => acc + (Number(item.amount) || 0),
    0
  );

  // 기부금 아코디언 토글
  const toggleDonationMemberAccordion = (memberName) => {
    setExpandedDonationMembers((prev) => ({
      ...prev,
      [memberName]: !prev[memberName],
    }));
  };

  // 기부금 신규 추가 폼 열기 (성명: 로그인 근로자 기준, 본인/부양가족 텍스트 제거)
  const handleOpenAddDonation = () => {
    setEditingDonItemId(null);
    setFormDonName(loggedInWorkerName.replace(/\(.*?\)/g, '').trim());
    setFormDonType('특례(법정)기부금');
    setFormDonCompany('');
    setFormDonBizNumber('');
    setFormDonCount('');
    setFormDonAmount('');
    setFormDonRewardAmount('');
    setViewMode('donation_add');
  };

  // 기부금 기존 항목 수정 폼 열기 (PDF의 단체명과 기부유형 및 깔끔한 성명 pre-fill)
  const handleEditDonationItem = (item) => {
    setEditingDonItemId(item.id);
    const cleanName = (item.name || loggedInWorkerName).replace(/\(.*?\)/g, '').trim();
    setFormDonName(cleanName);
    setFormDonType(item.type || '특례(법정)기부금');
    setFormDonCompany(item.company || '');
    setFormDonBizNumber(item.bizNumber || '');
    setFormDonCount(item.count || '1');
    const cleanAmt = String(item.amount ?? '').replace(/[^0-9]/g, '');
    setFormDonAmount(cleanAmt ? Number(cleanAmt).toLocaleString() : '');
    const cleanReward = String(item.rewardAmount ?? item.reward_amount ?? '').replace(/[^0-9]/g, '');
    setFormDonRewardAmount(cleanReward ? Number(cleanReward).toLocaleString() : '');
    setViewMode('donation_add');
  };

  // 기부금 저장 및 수정 핸들러
  const handleSaveDonationItem = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formDonAmount || '').replace(/[^0-9]/g, ''), 10) || 0;
    const cleanRewardAmount = parseInt(String(formDonRewardAmount || '').replace(/[^0-9]/g, ''), 10) || 0;

    if (cleanAmount <= 0) {
      showAlert('기부대상액을 입력해주세요.');
      return;
    }

    const cleanName = formDonName.replace(/\(.*?\)/g, '').trim();
    const member = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === cleanName);
    const relation = member ? member.relation : '본인';
    const isSelf = relation === '본인' || cleanName === loggedInWorkerName.replace(/\(.*?\)/g, '').trim();

    // 조세특례제한법 공제요건 검증: 정치자금기부금 및 우리사주조합기부금은 본인 지출분만 가능
    if (!isSelf && (formDonType.includes('정치자금') || formDonType.includes('우리사주'))) {
      showAlert(
        '조세특례제한법에 따라 정치자금기부금과 우리사주조합기부금은 근로자 본인이 지급한 기부금에 한해 공제받을 수 있습니다.\n\n대상자를 본인으로 변경하거나 기부금 유형을 특례 또는 일반기부금으로 변경해 주세요.',
        '기부금 공제요건 안내'
      );
      return;
    }

    if (editingDonItemId) {
      setDonationItems((prev) =>
        prev.map((item) =>
          item.id === editingDonItemId
            ? {
                ...item,
                name: cleanName,
                relation,
                type: formDonType,
                company: formDonCompany || formDonType,
                bizNumber: formDonBizNumber,
                count: formDonCount || '1',
                amount: cleanAmount,
                rewardAmount: cleanRewardAmount,
              }
            : item
        )
      );
      setViewMode('donation_edit');
      setToastMsg(`${cleanName}님의 기부금 자료가 수정되었습니다.`);
    } else {
      const newItem = {
        id: `don_${Date.now()}`,
        name: cleanName,
        relation,
        type: formDonType,
        company: formDonCompany || formDonType,
        bizNumber: formDonBizNumber,
        count: formDonCount || '1',
        amount: cleanAmount,
        rewardAmount: cleanRewardAmount,
        isNts: false,
        source: 'other',
      };
      setDonationItems((prev) => [...prev, newItem]);
      setViewMode('donation_edit');
      setToastMsg(`${cleanName}님의 기부금이 등록되었습니다.`);
    }

    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 기부금 삭제 핸들러
  const handleDeleteDonationItem = (id) => {
    setDonationItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 신용카드 상태 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [cardItems, setCardItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_card');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 아코디언 상태 (기본값: 모두 닫힘)
  const [expandedCardMembers, setExpandedCardMembers] = useState({});

  // 메인 목록으로 복귀 시 모든 아코디언 상태를 닫힘({})으로 초기화
  useEffect(() => {
    if (viewMode === 'list') {
      setExpandedCardMembers({});
      setExpandedMedicalMembers({});
      setExpandedOtherMedicalMembers({});
      setExpandedEduMembers({});
      setExpandedOtherEduMembers({});
      setExpandedInsuranceMembers({});
      setExpandedOtherInsuranceMembers({});
      setExpandedDonationMembers({});
      setExpandedOtherDonationMembers({});
      setRentExpandedIds({});
    }
  }, [viewMode]);

  // 신용카드 추가/수정 폼 상태 및 증빙 모달 상태
  const [editingCardItemId, setEditingCardItemId] = useState(null);
  const [formCardName, setFormCardName] = useState((loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim());
  const [formCardType, setFormCardType] = useState('신용카드');
  const [formCardCompany, setFormCardCompany] = useState('');
  const [formCardAmount, setFormCardAmount] = useState('');
  const [showCardProofModal, setShowCardProofModal] = useState(false);

  // 유형별 신용카드 합계 계산
  const totalCreditCard = cardItems
    .filter((item) => item.type === '신용카드')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalDebitCard = cardItems
    .filter((item) => item.type === '직불·체크카드' || item.type === '체크카드')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalCashReceipt = cardItems
    .filter((item) => item.type === '현금영수증')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalMarketCard = cardItems
    .filter((item) => item.type === '전통시장')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalTransitCard = cardItems
    .filter((item) => item.type === '대중교통')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalCultureCard = cardItems
    .filter((item) => item.type === '문화체육' || item.type === '도서·공연·문화체육')
    .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const totalCardAmount = cardItems.reduce(
    (acc, item) => acc + (Number(item.amount) || 0),
    0
  );

  // 신용카드 아코디언 토글
  const toggleCardMemberAccordion = (key) => {
    setExpandedCardMembers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // 연말정산 PDF 자료에서 인별/유형별 사용금액(신용카드 '일반' 등) 조회 헬퍼
  const getHometaxCardAmountByType = (targetName, cardType) => {
    let currentData = hometaxData;
    if (!currentData) {
      try {
        const saved = localStorage.getItem('hometax_extracted_data');
        if (saved) currentData = JSON.parse(saved);
      } catch (e) {}
    }

    const cleanTarget = (targetName || '').replace(/\(.*?\)/g, '').trim();
    const cleanWorker = (loggedInWorkerName || '').replace(/\(.*?\)/g, '').trim();
    const isSelf = !cleanTarget || cleanTarget === cleanWorker || cleanTarget === '본인';
    const isOver70m = Boolean(workerTotalSalary > 70000000);

    if (currentData) {
      const persons = currentData.matchedPersons || currentData.persons || [];
      const matchedPerson = persons.find((p) => {
        const pName = (p.name || '').replace(/\(.*?\)/g, '').trim();
        if (pName === cleanTarget) return true;
        if (isSelf && (pName === '본인' || p.relation === '본인' || pName === cleanWorker)) return true;
        return false;
      });

      if (matchedPerson) {
        // 인별 문화체육 금액 추출
        let pCreditCul = Number(matchedPerson.items?.credit_card_culture ?? matchedPerson.card_details?.find((c) => c.type === '신용카드')?.culture_amount ?? 0);
        let pDebitCul = Number(matchedPerson.items?.debit_card_culture ?? matchedPerson.card_details?.find((c) => c.type === '직불·체크카드' || c.type === '체크카드')?.culture_amount ?? 0);
        let pCashCul = Number(matchedPerson.items?.cash_receipt_culture ?? matchedPerson.card_details?.find((c) => c.type === '현금영수증')?.culture_amount ?? 0);
        const pTotalCul = Number(matchedPerson.items?.culture_amount ?? matchedPerson.items?.culture_sports ?? matchedPerson.card_details?.find((c) => c.type === '문화체육')?.amount ?? 0);

        if (pCreditCul === 0 && pDebitCul === 0 && pCashCul === 0 && pTotalCul > 0) {
          const cG = Number(matchedPerson.items?.credit_card_general || 0);
          const dG = Number(matchedPerson.items?.debit_card_cash || 0);
          const rG = Number(matchedPerson.items?.cash_receipt || 0);
          const sumG = cG + dG + rG;
          if (sumG > 0) {
            pCreditCul = Math.round(pTotalCul * (cG / sumG));
            pDebitCul = Math.round(pTotalCul * (dG / sumG));
            pCashCul = pTotalCul - pCreditCul - pDebitCul;
          } else {
            pCreditCul = pTotalCul;
          }
        }

        if (cardType === '신용카드') {
          let val = 0;
          if (matchedPerson.items?.credit_card_general !== undefined && matchedPerson.items?.credit_card_general !== null) {
            val = Number(matchedPerson.items.credit_card_general);
          } else {
            const cd = matchedPerson.card_details?.find((c) => c.type === '신용카드');
            if (cd) val = Number(cd.general_amount ?? cd.amount ?? 0);
            else if (matchedPerson.credit_card_general) val = Number(matchedPerson.credit_card_general);
          }
          if (isOver70m) {
            val += pCreditCul;
          }
          if (val > 0) return val;
        }
        if (cardType === '직불·체크카드' || cardType === '체크카드') {
          let val = 0;
          if (matchedPerson.items?.debit_card_cash !== undefined && matchedPerson.items?.debit_card_cash !== null) {
            val = Number(matchedPerson.items.debit_card_cash);
          } else {
            const cd = matchedPerson.card_details?.find((c) => c.type === '직불·체크카드' || c.type === '체크카드');
            if (cd) val = Number(cd.general_amount ?? cd.amount ?? 0);
          }
          if (isOver70m) {
            val += pDebitCul;
          }
          if (val > 0) return val;
        }
        if (cardType === '현금영수증') {
          let val = 0;
          if (matchedPerson.items?.cash_receipt !== undefined && matchedPerson.items?.cash_receipt !== null) {
            val = Number(matchedPerson.items.cash_receipt);
          } else {
            const cd = matchedPerson.card_details?.find((c) => c.type === '현금영수증');
            if (cd) val = Number(cd.general_amount ?? cd.amount ?? 0);
          }
          if (isOver70m) {
            val += pCashCul;
          }
          if (val > 0) return val;
        }
        if (cardType === '전통시장') {
          if (matchedPerson.items?.market_amount !== undefined) return Number(matchedPerson.items.market_amount) || 0;
          const cd = matchedPerson.card_details?.find((c) => c.type === '전통시장');
          if (cd) return Number(cd.amount) || 0;
        }
        if (cardType === '대중교통') {
          if (matchedPerson.items?.transport_amount !== undefined) return Number(matchedPerson.items.transport_amount) || 0;
          const cd = matchedPerson.card_details?.find((c) => c.type === '대중교통');
          if (cd) return Number(cd.amount) || 0;
        }
        if (cardType === '문화체육') {
          if (isOver70m) return 0; // 7천만원 초과는 0
          if (matchedPerson.items?.culture_amount !== undefined) return Number(matchedPerson.items.culture_amount) || 0;
          if (matchedPerson.items?.culture_sports !== undefined) return Number(matchedPerson.items.culture_sports) || 0;
          const cd = matchedPerson.card_details?.find((c) => c.type === '문화체육');
          if (cd) return Number(cd.amount) || 0;
        }
      }

      // fallback: 본인일 때 root 속성 조회
      if (isSelf) {
        let rootCreditCul = Number(currentData.credit_card_culture || 0);
        let rootDebitCul = Number(currentData.debit_card_culture || 0);
        let rootCashCul = Number(currentData.cash_receipt_culture || 0);
        const rootTotalCul = Number(currentData.culture || currentData.culture_amount || 0);
        if (rootCreditCul === 0 && rootDebitCul === 0 && rootCashCul === 0 && rootTotalCul > 0) {
          const cG = Number(currentData.credit || 0);
          const dG = Number(currentData.debit || 0);
          const rG = Number(currentData.cash || 0);
          const sumG = cG + dG + rG;
          if (sumG > 0) {
            rootCreditCul = Math.round(rootTotalCul * (cG / sumG));
            rootDebitCul = Math.round(rootTotalCul * (dG / sumG));
            rootCashCul = rootTotalCul - rootCreditCul - rootDebitCul;
          } else {
            rootCreditCul = rootTotalCul;
          }
        }

        if (cardType === '신용카드') {
          const val = Number(currentData.credit_card_general || currentData.credit || 0) + (isOver70m ? rootCreditCul : 0);
          if (val > 0) return val;
        }
        if (cardType === '직불·체크카드' || cardType === '체크카드') {
          return Number(currentData.debit_card_cash || currentData.debit || 0) + (isOver70m ? rootDebitCul : 0);
        }
        if (cardType === '현금영수증') {
          return Number(currentData.cash_receipt || currentData.cash || 0) + (isOver70m ? rootCashCul : 0);
        }
        if (cardType === '전통시장') return Number(currentData.market_amount || currentData.market || 0);
        if (cardType === '대중교통') return Number(currentData.transport_amount || currentData.transport || 0);
        if (cardType === '문화체육') return isOver70m ? 0 : Number(currentData.culture_amount || currentData.culture || 0);
      }
    }

    // fallback: cardItems 상태의 국세청(NTS) 신용카드 자료에서 금액 조회
    const ntsCard = cardItems.find(
      (item) => item.isNts && item.type === cardType && (
        (item.name || '').replace(/\(.*?\)/g, '').trim() === cleanTarget ||
        (isSelf && ((item.name || '').includes('본인') || (item.name || '').replace(/\(.*?\)/g, '').trim() === cleanWorker))
      )
    );
    if (ntsCard && Number(ntsCard.amount) > 0) {
      return Number(ntsCard.amount);
    }

    return 0;
  };

  // 신용카드 폼에서 성명 변경 핸들러 (인별 카드 사용금액 자동 반영)
  const handleCardNameChange = (newName) => {
    setFormCardName(newName);
    const autoAmt = getHometaxCardAmountByType(newName, formCardType);
    setFormCardAmount(autoAmt > 0 ? autoAmt.toLocaleString() : '');
  };

  // 신용카드 폼에서 카드 유형 변경 핸들러 (카드 유형별 사용금액 자동 작성)
  const handleCardTypeChange = (newType) => {
    setFormCardType(newType);
    const autoAmt = getHometaxCardAmountByType(formCardName, newType);
    if (autoAmt > 0) {
      setFormCardAmount(autoAmt.toLocaleString());
    }
  };

  // 신용카드 신규 추가 폼 열기 (성명: 로그인 근로자 기준, 신용카드 선택 시 인별 일반 금액 자동 작성)
  const handleOpenAddCard = () => {
    setEditingCardItemId(null);
    const cleanWorkerName = (loggedInWorkerName || '').replace(/\(.*?\)/g, '').trim();
    setFormCardName(cleanWorkerName);
    setFormCardType('신용카드');
    setFormCardCompany('');
    const autoAmt = getHometaxCardAmountByType(cleanWorkerName, '신용카드');
    setFormCardAmount(autoAmt > 0 ? autoAmt.toLocaleString() : '');
    setViewMode('card_add');
  };

  // 신용카드 기존 항목 수정 폼 열기
  const handleEditCardItem = (item) => {
    setEditingCardItemId(item.id);
    const cleanName = (item.name || loggedInWorkerName || '').replace(/\(.*?\)/g, '').trim();
    setFormCardName(cleanName);
    const cType = item.type || '신용카드';
    setFormCardType(cType);
    setFormCardCompany(item.company || '');
    let amt = item.amount ? Number(item.amount) : 0;
    // 국세청 자료의 경우 해당 카드 유형에 맞는 최신 집계 금액(7천만원 초과 시 문화비 합산) 자동 반영
    if (item.isNts) {
      const pdfAmt = getHometaxCardAmountByType(cleanName, cType);
      if (pdfAmt > 0) {
        amt = pdfAmt;
      }
    } else if (cType === '신용카드') {
      const pdfGeneralAmt = getHometaxCardAmountByType(cleanName, '신용카드');
      if (pdfGeneralAmt > 0) {
        amt = pdfGeneralAmt;
      }
    }
    setFormCardAmount(amt > 0 ? amt.toLocaleString() : '');
    setViewMode('card_add');
  };

  // 신용카드 저장 및 수정 핸들러
  const handleSaveCardItem = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(formCardAmount).replace(/[^0-9]/g, ''), 10) || 0;

    if (cleanAmount <= 0) {
      showAlert('사용금액을 입력해주세요.');
      return;
    }

    const cleanFormName = (formCardName || '').replace(/\(.*?\)/g, '').trim();
    const member = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === cleanFormName);
    const relation = member ? member.relation : '본인';
    const isSelfPerson = Boolean(member?.isSelf || relation === '본인' || cleanFormName === loggedInWorkerName);

    // 세법 요건: 형제자매의 신용카드 등 사용금액은 소득공제 대상 제외
    if (!isSelfPerson && (relation.includes('형제') || relation.includes('자매'))) {
      showAlert('형제자매의 신용카드 등 사용금액은 소득공제 대상에서 제외됩니다.');
      return;
    }

    // 세법 요건: 소득금액 100만 원 초과 부양가족의 신용카드 사용금액 제외 (나이요건 제한 없음)
    if (!isSelfPerson && member && (member.incomeOver === '초과함' || member.incomeExcess)) {
      showAlert('소득금액 요건(연간 100만 원)을 초과한 부양가족의 신용카드 사용금액은 소득공제 대상에서 제외됩니다.');
      return;
    }

    if (editingCardItemId) {
      setCardItems((prev) =>
        prev.map((item) =>
          item.id === editingCardItemId
            ? {
                ...item,
                name: cleanFormName,
                relation,
                type: formCardType,
                company: formCardCompany || formCardType,
                amount: cleanAmount,
              }
            : item
        )
      );
      setViewMode('card_edit');
      setToastMsg(`${cleanFormName}님의 신용카드 자료가 수정되었습니다.`);
    } else {
      const newItem = {
        id: `card_${Date.now()}`,
        name: cleanFormName,
        relation,
        type: formCardType,
        company: formCardCompany || formCardType,
        amount: cleanAmount,
        isNts: false,
        source: 'other',
      };
      setCardItems((prev) => [...prev, newItem]);
      setViewMode('card_edit');
      setToastMsg(`${cleanFormName}님의 신용카드 자료가 등록되었습니다.`);
    }

    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 신용카드 삭제 핸들러
  const handleDeleteCardItem = (id) => {
    setCardItems((prev) => prev.filter((item) => item.id !== id));
  };

  // 월세액 신규 추가 페이지 열기
  const handleOpenAddRent = () => {
    setEditingRentItemId(null);
    setRentLandlord('');
    setRentLandlordId('');
    setRentHouseType('오피스텔');
    setRentArea('');
    setRentAddress('');
    setRentContractPeriod('2025.01.01 ~ 2025.12.31');
    setRentFormAmount('');
    setShowRentAddModal(false);
    setViewMode('rent_add');
  };

  // 기존 월세액 명세 수정 페이지 열기
  const handleEditRentItem = (item) => {
    setEditingRentItemId(item.id);
    setRentLandlord(item.landlord || '');
    setRentLandlordId(item.landlordId || '');
    setRentHouseType(item.houseType || '오피스텔');
    setRentArea(item.area || '');
    setRentAddress(item.address || '');
    setRentContractPeriod(item.contractPeriod || item.period || '');
    setRentFormAmount(item.amount ? Number(item.amount).toLocaleString() : '');
    setShowRentAddModal(false);
    setViewMode('rent_add');
  };

  // 월세액 저장 및 수정 핸들러
  const handleSaveRentItem = (e) => {
    if (e) e.preventDefault();
    const cleanAmount = parseInt(String(rentFormAmount).replace(/[^0-9]/g, ''), 10) || 0;
    if (!rentLandlord.trim()) {
      showAlert('임대인 성명을 입력해주세요.');
      return;
    }
    if (cleanAmount <= 0) {
      showAlert('연간 월세액 지출금액을 입력해주세요.');
      return;
    }

    const maskedLandlordId = maskLandlordId(rentLandlordId.trim());

    if (editingRentItemId) {
      // 기존 항목 수정: 목록, 명세자료, 연말정산 자료입력에 동시 반영
      setRentItems((prev) =>
        prev.map((item) =>
          item.id === editingRentItemId
            ? {
                ...item,
                landlord: rentLandlord.trim(),
                landlordId: maskedLandlordId,
                houseType: rentHouseType,
                area: rentArea.trim(),
                address: rentAddress.trim(),
                period: rentContractPeriod.trim(),
                contractPeriod: rentContractPeriod.trim(),
                amount: cleanAmount,
              }
            : item
        )
      );
      setShowRentAddModal(false);
      setViewMode('rent_edit');
      setToastMsg('월세액 세액공제 명세가 수정되었습니다.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } else {
      // 신규 항목 추가 (직접추가 = 기타자료)
      const newItem = {
        id: `rent_${Date.now()}`,
        landlord: rentLandlord.trim(),
        landlordId: maskedLandlordId,
        houseType: rentHouseType,
        area: rentArea.trim(),
        address: rentAddress.trim(),
        period: rentContractPeriod.trim(),
        amount: cleanAmount,
        source: 'custom', // 직접추가 = 기타자료
        isNts: false,
      };
      setRentItems((prev) => [...prev, newItem]);
      setShowRentAddModal(false);
      setViewMode('rent_edit');
      setToastMsg('월세액 세액공제 명세가 추가되었습니다.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    }
  };

  // 월세액 삭제 핸들러
  const handleDeleteRentItem = (id) => {
    setRentItems((prev) => prev.filter((item) => item.id !== id));
    setToastMsg('월세액 명세가 삭제되었습니다.');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 의료비 신규 추가 열기 (성명: 로그인 근로자 기준, 본인/부양가족 표기 제거)
  const handleOpenAdd = () => {
    setEditingItemId(null);
    setFormFamilyName((loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim());
    setFormMedicalType('일반의료비');
    setFormHospitalName('');
    setFormBizNumber('');
    setFormProofCode('기타');
    setFormCount('');
    setFormAmount('');
    setFormInsuranceAmount('');
    setViewMode('medical_add');
  };

  // 기존 항목 수정 열기 (연말정산 PDF 종류 및 국세청간소화 상호 매핑)
  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    const cleanName = (item.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim();
    setFormFamilyName(cleanName);

    let mappedType = item.type || '일반의료비';
    if (mappedType.includes('안경') || mappedType.includes('콘텍트렌즈') || mappedType.includes('콘택트렌즈')) {
      mappedType = '안경 또는 콘텍트렌즈 구입비용';
    } else if (mappedType.includes('산후조리')) {
      mappedType = '산후조리원 비용';
    } else if (mappedType === '간소화자료' || mappedType === '일반' || mappedType === '일반 의료비') {
      mappedType = '일반의료비';
    }
    setFormMedicalType(mappedType);
    setFormHospitalName(item.hospital || (item.isNts ? '국세청간소화' : ''));
    setFormBizNumber(item.bizNumber || '');
    setFormProofCode(item.proofCode || (item.isNts ? '국세청장 자료' : '기타'));
    setFormCount(item.count || '1');
    setFormAmount(Number(item.amount || 0).toLocaleString());
    setFormInsuranceAmount(item.insuranceAmount ? Number(item.insuranceAmount).toLocaleString() : '');
    setViewMode('medical_add');
  };

  // 의료비 저장 핸들러
  const handleSaveMedical = (e) => {
    if (e) e.preventDefault();
    if (!formFamilyName) {
      showAlert('성명을 선택해주세요.');
      return;
    }
    const cleanAmount = parseInt(String(formAmount).replace(/[^0-9]/g, ''), 10) || 0;
    const cleanInsurance = parseInt(String(formInsuranceAmount).replace(/[^0-9]/g, ''), 10) || 0;

    if (cleanAmount <= 0) {
      showAlert('의료비 지출액을 입력해주세요.');
      return;
    }

    const cleanName = (formFamilyName || '').replace(/\(.*?\)/g, '').trim();
    const existingItem = medicalItems.find((i) => i.id === editingItemId);
    const isNts = existingItem ? !!existingItem.isNts : false;
    const selectedMember = familyMembers.find((m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === cleanName);

    const itemData = {
      id: editingItemId || `med_${Date.now()}`,
      name: cleanName,
      relation: selectedMember?.relation || (cleanName === loggedInWorkerName ? '본인' : '부양가족'),
      type: formMedicalType || '일반의료비',
      hospital: formHospitalName || (isNts ? '국세청간소화' : '기타'),
      bizNumber: formBizNumber || '',
      proofCode: formProofCode || (isNts ? '국세청장 자료' : '기타'),
      count: formCount || '1',
      amount: cleanAmount,
      insuranceAmount: cleanInsurance,
      date: existingItem?.date || '2025.05.12',
      isNts,
    };

    if (editingItemId) {
      setMedicalItems((prev) => prev.map((item) => (item.id === editingItemId ? itemData : item)));
      setToastMsg(`${cleanName}님의 의료비 자료가 수정되었습니다.`);
    } else {
      setMedicalItems((prev) => [...prev, itemData]);
      setToastMsg(`${cleanName}님의 의료비 기타자료가 등록되었습니다.`);
    }

    setViewMode('medical_edit');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // 항목 삭제
  const handleDeleteMedicalItem = (id) => {
    setMedicalItems((prev) => prev.filter((item) => item.id !== id));
  };

  // =========================================================================
  // 5개 신규 공제항목 상태 및 금액 계산
  // =========================================================================
  // 1. 주택자금 (상단 선언 참조)

  // 2. 주택마련저축 (localStorage 영구 보존)
  const [housingSavingsItems, setHousingSavingsItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_housing_savings');
      if (saved) return JSON.parse(saved);
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.housingSavingsItems && Array.isArray(parsed.housingSavingsItems)) {
          return parsed.housingSavingsItems;
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [housingSavingsChecklistAnswer, setHousingSavingsChecklistAnswer] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_housing_savings_checklist');
      if (saved) return saved;
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.housingSavingsChecklistAnswer) return parsed.housingSavingsChecklistAnswer;
      }
      return null;
    } catch {
      return null;
    }
  });
  const totalHousingSavings = housingSavingsItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // 주택마련저축 공제대상 한도금액 계산 (세법 요건: 총급여 7,000만원 이하 무주택 세대주만 공제 가능, 청약/주택청약 연간 300만원 한도, 근로자주택 연간 180만원 한도, 중도해지 반영)
  const totalHousingSavingsLimitAmount = useMemo(() => {
    // 세법 요건: 총급여 7,000만 원 초과 시 주택마련저축 소득공제 배제
    if (workerTotalSalary > 70000000) {
      return 0;
    }
    let subRemaining = 3000000;
    let workerRemaining = 1800000;
    let totalAllowed = 0;

    housingSavingsItems.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const type = item.type || '주택청약종합저축';
      const isTerminated = !!item.isTerminated;
      const terminationReason = item.terminationReason || '';

      if (isTerminated && terminationReason !== '주택당첨') return;

      let allowed = 0;
      if (type === '근로자주택마련저축') {
        allowed = Math.min(raw, Math.max(0, workerRemaining));
        workerRemaining -= allowed;
      } else {
        allowed = Math.min(raw, Math.max(0, subRemaining));
        subRemaining -= allowed;
      }
      totalAllowed += allowed;
    });

    return totalAllowed;
  }, [housingSavingsItems, workerTotalSalary]);

  // 주택자금 공제한도 계산 (주택임차 원리금 40% + 장기주택저당 이자 100%, 주택마련저축 합산 한도 연동, 총급여 요건 반영)
  const totalHousingLoanLimitAmount = useMemo(() => {
    let savingsDeduction = 0;
    // 세법 요건: 총급여 7,000만 원 이하 무주택 세대주만 주택마련저축 소득공제 가능
    if (workerTotalSalary <= 70000000 && Array.isArray(housingSavingsItems) && housingSavingsItems.length > 0) {
      let subRemaining = 3000000;
      let workerRemaining = 1800000;
      const hasMortgage = housingLoanItems.some((i) => i.type && i.type.includes('장기주택저당차입금') && Number(i.amount) > 0);
      housingSavingsItems.forEach((it) => {
        if (it.isTerminated && it.terminationReason !== '주택당첨') return;
        if (it.submitProof === false) return; // 무주택확인서 미제출 제외
        const raw = Number(it.amount) || 0;
        const itType = it.type || '';
        if (hasMortgage && (itType.includes('청약저축') || itType.includes('주택청약종합저축') || itType.includes('주택청약'))) {
          return;
        }
        let allowed = 0;
        if (itType.includes('근로자주택')) {
          allowed = Math.min(raw, Math.max(0, workerRemaining));
          workerRemaining -= allowed;
        } else {
          allowed = Math.min(raw, Math.max(0, subRemaining));
          subRemaining -= allowed;
        }
        savingsDeduction += Math.floor(allowed * 0.4);
      });
      savingsDeduction = Math.min(4000000, savingsDeduction);
    }

    // 주택임차차입금 공제액 (상환액의 40%, 1+2 <= 연 400만원 한도)
    // 세법 요건: 대부업자 외 거주자(개인) 차입금은 총급여 5,000만 원 이하인 자만 가능
    let rentLoanCapacity = Math.max(0, 4000000 - savingsDeduction);
    const rentItems = housingLoanItems.filter((item) => {
      const isRent = !item.type || item.type.includes('주택임차차입금');
      if (!isRent) return false;
      if ((item.type?.includes('거주자') || item.type?.includes('개인차입')) && workerTotalSalary > 50000000) {
        return false;
      }
      return true;
    });
    const totalRentRaw = rentItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const totalRentLoanDeduction = Math.min(Math.round(totalRentRaw * 0.4), rentLoanCapacity);

    // 장기주택저당차입금 이자상환액 (국세청 서식 공식: 1 + 2 + [대출] <= [해당 대출한도])
    const combined1And2 = savingsDeduction + totalRentLoanDeduction;
    const mortgageItems = housingLoanItems.filter((i) => i.type && i.type.includes('장기주택저당차입금'));
    const maxMortgageCeiling = mortgageItems.reduce((max, it) => Math.max(max, getMortgageLoanLimit ? getMortgageLoanLimit(it.type) : 8000000), 0);
    let remainingOverallCapacity = Math.max(0, maxMortgageCeiling - combined1And2);
    let totalMortgageAllowed = 0;

    mortgageItems.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const itemMaxLimit = getMortgageLoanLimit ? getMortgageLoanLimit(item.type) : 8000000;
      const itemCapacity = Math.max(0, itemMaxLimit - combined1And2);
      const availableCap = Math.min(itemCapacity, remainingOverallCapacity);
      const allowed = Math.min(raw, availableCap);
      remainingOverallCapacity = Math.max(0, remainingOverallCapacity - allowed);
      totalMortgageAllowed += allowed;
    });

    return totalRentLoanDeduction + totalMortgageAllowed;
  }, [housingLoanItems, housingSavingsItems, workerTotalSalary]);

  // 3. 연금저축/연금계좌 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [pensionItems, setPensionItems] = useState(() => {
    try {
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (Array.isArray(parsed?.pensionItems) && parsed.pensionItems.length > 0) {
          return parsed.pensionItems;
        }
      }
      const saved = localStorage.getItem('selftax_other_pension');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const totalPensionAmount = useMemo(() => {
    const displayMap = calculatePensionDisplayMap(pensionItems);
    return Object.values(displayMap).reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [pensionItems]);

  // 4. 소기업소상공인 (노란우산공제 - localStorage 영구 보존)
  const [smallBizItems, setSmallBizItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_small_biz');
      if (saved) return JSON.parse(saved);
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.smallBizItems && Array.isArray(parsed.smallBizItems)) {
          return parsed.smallBizItems;
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [smallBizChecklistAnswer, setSmallBizChecklistAnswer] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_small_biz_checklist');
      if (saved) return saved;
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.smallBizChecklistAnswer) return parsed.smallBizChecklistAnswer;
      }
      return null;
    } catch {
      return null;
    }
  });
  const totalSmallBizAmount = smallBizItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  // 세법 요건: 개인사업자는 공제 가능, 법인대표자는 총급여 7,000만원 이하만 공제 가능 (사업(근로)소득금액별 500만/300만/200만원 한도 적용)
  const totalSmallBizLimitAmount = useMemo(() => {
    const isOverSalary = workerTotalSalary > 70000000;
    const earnedIncomeDeduction = calculateEarnedIncomeDeduction(workerTotalSalary);
    const earnedIncomeAmount = Math.max(0, workerTotalSalary - earnedIncomeDeduction);

    let statutoryLimit = 5000000;
    if (earnedIncomeAmount <= 40000000) {
      statutoryLimit = 5000000;
    } else if (earnedIncomeAmount <= 100000000) {
      statutoryLimit = 3000000;
    } else {
      statutoryLimit = 2000000;
    }

    let remaining = statutoryLimit;
    let totalDeductible = 0;

    smallBizItems.forEach((item) => {
      const raw = Number(item.amount) || 0;
      const bType = item.bizType || '법인대표자';
      const jPeriod = item.joinPeriod || '2016년 이후 가입';

      // 법인대표자이면서 총급여 7천만원 초과인 경우에만 공제 제외
      if (bType === '법인대표자' && isOverSalary) {
        return;
      }

      // 2015년 이전 가입은 종전 규정 한도 300만원
      const maxForThisItem = jPeriod === '2015년 이전 가입' ? Math.min(3000000, remaining) : remaining;

      // 개인사업자이거나 총급여 7천만원 이하인 법인대표자는 공제 가능
      const allowed = Math.min(raw, Math.max(0, maxForThisItem));
      totalDeductible += allowed;
      remaining -= allowed;
    });

    return totalDeductible;
  }, [smallBizItems, workerTotalSalary]);

  // 5. 장기집합증권 (기타자료 localStorage 영구 보존 - 요구사항 4)
  const [longInvestItems, setLongInvestItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_long_invest');
      if (saved) return JSON.parse(saved);
      return [];
    } catch {
      return [];
    }
  });
  // 세법 요건: 장기집합투자증권 및 청년형 장기집합투자증권은 당해 과세연도 총급여 8,000만원 초과 시 공제 배제
  const totalLongInvestAmount = useMemo(() => {
    return longInvestItems.reduce((acc, item) => acc + calculateLongInvestDeductible(item, workerTotalSalary), 0);
  }, [longInvestItems, workerTotalSalary]);

  // 6. 기타공제 (혼인세액공제, 납세조합공제 - localStorage 영구 보존)
  const [otherDeductItems, setOtherDeductItems] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_other_deduct');
      if (saved) return JSON.parse(saved);
      const dedSaved = localStorage.getItem('selftax_deduction_data');
      if (dedSaved) {
        const parsed = JSON.parse(dedSaved);
        if (parsed?.otherDeductItems && Array.isArray(parsed.otherDeductItems)) {
          return parsed.otherDeductItems;
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const totalOtherDeductAmount = otherDeductItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  // 요구사항 4: 기타자료 추가/수정/삭제 시 다른 페이지 이동 후 복원되도록 항목별 localStorage 실시간 동기화
  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_medical', JSON.stringify(medicalItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [medicalItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_insurance', JSON.stringify(insuranceItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [insuranceItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_education', JSON.stringify(eduItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [eduItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_donation', JSON.stringify(donationItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [donationItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_card', JSON.stringify(cardItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [cardItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_pension', JSON.stringify(pensionItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [pensionItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_long_invest', JSON.stringify(longInvestItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [longInvestItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_small_biz', JSON.stringify(smallBizItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [smallBizItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_deduct', JSON.stringify(otherDeductItems));
    } catch (e) {
      console.error(e);
    }
  }, [otherDeductItems]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_housing_loan', JSON.stringify(housingLoanItems.filter((i) => !i.isNts)));
    } catch (e) {
      console.error(e);
    }
  }, [housingLoanItems]);

  useEffect(() => {
    try {
      if (housingLoanChecklistAnswer) {
        localStorage.setItem('selftax_housing_loan_checklist', housingLoanChecklistAnswer);
      } else {
        localStorage.removeItem('selftax_housing_loan_checklist');
      }
    } catch (e) {
      console.error(e);
    }
  }, [housingLoanChecklistAnswer]);

  useEffect(() => {
    try {
      localStorage.setItem('selftax_other_housing_savings', JSON.stringify(housingSavingsItems.filter((i) => !i.isNts && i.source !== 'nts')));
    } catch (e) {
      console.error(e);
    }
  }, [housingSavingsItems]);

  useEffect(() => {
    try {
      if (housingSavingsChecklistAnswer) {
        localStorage.setItem('selftax_housing_savings_checklist', housingSavingsChecklistAnswer);
      } else {
        localStorage.removeItem('selftax_housing_savings_checklist');
      }
    } catch (e) {
      console.error(e);
    }
  }, [housingSavingsChecklistAnswer]);

  useEffect(() => {
    try {
      if (rentChecklistAnswer) {
        localStorage.setItem('selftax_rent_checklist', rentChecklistAnswer);
      } else {
        localStorage.removeItem('selftax_rent_checklist');
      }
    } catch (e) {
      console.error(e);
    }
  }, [rentChecklistAnswer]);

  useEffect(() => {
    try {
      setSecureItem('selftax_other_rent', rentItems.filter((i) => !i.isNts && i.source !== 'nts'));
    } catch (e) {
      console.error(e);
    }
  }, [rentItems]);

  useEffect(() => {
    try {
      if (smallBizChecklistAnswer) {
        localStorage.setItem('selftax_small_biz_checklist', smallBizChecklistAnswer);
      } else {
        localStorage.removeItem('selftax_small_biz_checklist');
      }
    } catch (e) {
      console.error(e);
    }
  }, [smallBizChecklistAnswer]);

  // =========================================================================
  // 요구사항 6 & 최신 요청: 주택자금, 주택마련저축, 월세액, 소기업소상공인 4개 메뉴는
  // 1) 연말정산 PDF가 존재하고 체크리스트 요건을 충족했을 때(checklistAnswer === 'yes') 국세청 내용이 자동으로 작성됨
  // 2) 국세청자료(PDF)가 삭제되었을 때는 작성된 내용도 삭제되고 체크필요(null)로 변경됨
  // =========================================================================
  useEffect(() => {
    // PDF 업로드 여부 확인
    let currentData = hometaxData;
    if (currentData === undefined || currentData === null) {
      try {
        const saved = localStorage.getItem('hometax_extracted_data');
        if (saved) currentData = JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    const hasPdf = Boolean(currentData && (currentData.uploaded || currentData.hasData || currentData.fileName));

    if (!hasPdf) {
      // 국세청자료가 없는 상태: 4개 메뉴의 국세청 내용(isNts, nts)만 제거 (체크리스트 답변은 보존하여 사용자가 예/아니오 체크 가능)
      setHousingLoanItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
      setHousingSavingsItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
      setRentItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
      setSmallBizItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
      return;
    }

    const ntsKey = ntsSourceKey(currentData);
    const cleanWorkerName = (loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim();

    // 1. 주택자금 자동 작성 (국세청 PDF 표에서 읽은 주택임차차입금·장기주택저당차입금 행)
    if (housingLoanChecklistAnswer === 'yes') {
      setHousingLoanItems((prev) => {
        const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
        const hasNts = hasCurrentNtsItems(prev, ntsKey); // 같은 PDF로 이미 만든 항목이면 유지(사용자 수정 보존)
        if (!hasNts) {
          const ntsHousingLoan = buildNtsHousingLoanItems(currentData, cleanWorkerName, ntsKey);
          return [...others, ...ntsHousingLoan];
        }
        return prev;
      });
    } else {
      setHousingLoanItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
    }

    // 2. 주택마련저축 자동 작성 (국세청 PDF 표에서 읽은 계좌별 납입금액)
    if (housingSavingsChecklistAnswer === 'yes') {
      setHousingSavingsItems((prev) => {
        const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
        const hasNts = hasCurrentNtsItems(prev, ntsKey); // 같은 PDF로 이미 만든 항목이면 유지(사용자 수정 보존)
        if (!hasNts) {
          const ntsSavings = buildNtsHousingSavingsItems(currentData, cleanWorkerName, ntsKey);
          return [...others, ...ntsSavings];
        }
        return prev;
      });
    } else {
      setHousingSavingsItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
    }

    // 3. 월세액 자동 작성 (국세청 자료: 연말정산 PDF 상세내용)
    if (rentChecklistAnswer === 'yes') {
      setRentItems((prev) => {
        const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
        const hasNts = hasCurrentNtsItems(prev, ntsKey); // 같은 PDF로 이미 만든 항목이면 유지(사용자 수정 보존)
        if (!hasNts) {
          let effData = currentData;
          if (!effData?.rent_details || effData.rent_details.length === 0) {
            try {
              const saved = localStorage.getItem('hometax_extracted_data');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.rent_details && parsed.rent_details.length > 0) {
                  effData = parsed;
                }
              }
            } catch {}
          }

          let pdfDetails = Array.isArray(effData?.rent_details) ? [...effData.rent_details] : [];
          if (pdfDetails.length === 0 && Array.isArray(effData?.persons)) {
            effData.persons.forEach((p) => {
              const pRent = p.rent_details || p.items?.rent_details;
              if (Array.isArray(pRent) && pRent.length > 0) {
                pdfDetails.push(...pRent);
              }
            });
          }

          if (pdfDetails.length > 0) {
            const ntsRent = pdfDetails.map((pd, idx) => ({
              id: pd.id || `nts_rent_${idx + 1}`,
              name: pd.name || pd.person_name || cleanWorkerName,
              relation: pd.relation || '본인',
              landlord: pd.landlord || '',
              landlordId: pd.landlordId || '',
              houseType: pd.houseType || '',
              area: pd.area ? String(pd.area) : '',
              address: pd.address || '',
              period: pd.period || pd.contractPeriod || '',
              contractPeriod: pd.contractPeriod || pd.period || '',
              amount: Number(pd.amount || 0),
              isNts: true,
              source: 'nts',
              ntsKey,
            }));
            return [...others, ...ntsRent];
          } else if (Number(effData?.monthly_rent_paid) > 0) {
            return [
              ...others,
              {
                id: 'nts_rent_1',
                name: cleanWorkerName,
                relation: '본인',
                landlord: '국세청 간소화 (월세액)',
                landlordId: '',
                houseType: '',
                area: '',
                address: '',
                period: '',
                contractPeriod: '',
                amount: Number(effData.monthly_rent_paid),
                isNts: true,
                source: 'nts',
                ntsKey,
              },
            ];
          }
        }
        return prev;
      });
    } else {
      setRentItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
    }

    // 4. 소기업소상공인 자동 작성 (국세청 자료: 중소기업중앙회 노란우산공제)
    if (smallBizChecklistAnswer === 'yes') {
      const hasHometaxPdf = (() => {
        if (hometaxData && (hometaxData.uploaded || hometaxData.hasData || hometaxData.fileName || (Array.isArray(hometaxData.persons) && hometaxData.persons.length > 0))) {
          return true;
        }
        try {
          const saved = localStorage.getItem('hometax_extracted_data');
          if (saved) {
            const parsed = JSON.parse(saved);
            return Boolean(parsed && (parsed.uploaded || parsed.hasData || parsed.fileName || (Array.isArray(parsed?.persons) && parsed.persons.length > 0)));
          }
        } catch {}
        return false;
      })();

      if (hasHometaxPdf) {
        setSmallBizItems((prev) => {
          const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
          const hasNts = hasCurrentNtsItems(prev, ntsKey); // 같은 PDF로 이미 만든 항목이면 유지(사용자 수정 보존)
          if (!hasNts) {
            // PDF에 소기업·소상공인 공제부금 자료가 있을 때만 작성 (임의 금액을 넣지 않음)
            const ntsSmallBiz = buildNtsSmallBizItems(hometaxData, cleanWorkerName, ntsKey);
            return [...others, ...ntsSmallBiz];
          }
          return prev;
        });
      }
    } else {
      setSmallBizItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
    }
  }, [
    housingLoanChecklistAnswer,
    housingSavingsChecklistAnswer,
    rentChecklistAnswer,
    smallBizChecklistAnswer,
    loggedInWorkerName,
    hometaxData,
  ]);

  // 모든 공제항목의 최신 합계 및 명세를 localStorage에 실시간 저장 (예상세액 페이지와 자동 연계)
  useEffect(() => {
    try {
      const deductionData = {
        insurance: totalInsuranceAmount,
        generalInsurance: totalGeneralInsurance,
        disabledInsurance: totalDisabledInsurance,
        medical: totalMedicalAmount,
        medicalSelf: categorizedMedical.self,
        medicalSpecial: categorizedMedical.special,
        medicalGeneral: categorizedMedical.general,
        medicalPremature: categorizedMedical.premature,
        medicalInfertility: categorizedMedical.infertility,
        education: totalEduAmount,
        card: totalCardAmount,
        creditCard: totalCreditCard,
        debitCard: totalDebitCard,
        cashReceipt: totalCashReceipt,
        marketCard: totalMarketCard,
        transitCard: totalTransitCard,
        cultureCard: totalCultureCard,
        rent: totalRentLimitAmount,
        rawRent: totalRentAmount,
        housingLoan: totalHousingLoanLimitAmount,
        rawHousingLoan: totalHousingLoan,
        housingSavings: totalHousingSavingsLimitAmount,
        rawHousingSavings: totalHousingSavings,
        pension: (() => {
          const displayMap = calculatePensionDisplayMap(pensionItems);
          return pensionItems
            .filter((i) => !(i.type || '').includes('개인연금'))
            .reduce((acc, i) => acc + (Number(displayMap[i.id]) || 0), 0);
        })(),
        personalPension: (() => {
          const displayMap = calculatePensionDisplayMap(pensionItems);
          return pensionItems
            .filter((i) => (i.type || '').includes('개인연금'))
            .reduce((acc, i) => acc + (Number(displayMap[i.id]) || 0), 0);
        })(),
        donation: donationItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0),
        smallBiz: totalSmallBizLimitAmount,
        longInvest: longInvestItems
          .filter((item) => {
            const t = (item.type || '').trim();
            return !t.includes('벤처') && !t.includes('투자조합') && !t.includes('신탁');
          })
          .reduce((acc, item) => acc + calculateLongInvestDeductible(item, workerTotalSalary), 0),
        ventureFund: longInvestItems
          .filter((item) => {
            const t = (item.type || '').trim();
            return t.includes('벤처') || t.includes('투자조합') || t.includes('신탁');
          })
          .reduce((acc, item) => acc + calculateLongInvestDeductible(item, workerTotalSalary), 0),
        otherDeduct: totalOtherDeductAmount,
        otherDeductItems,
        medicalItems,
        insuranceItems,
        cardItems,
        eduItems,
        rentItems,
        housingLoanItems,
        housingSavingsItems,
        pensionItems,
        donationItems,
        donationCarryoverItems,
        smallBizItems,
        longInvestItems,
        housingLoanChecklistAnswer,
        housingSavingsChecklistAnswer,
        rentChecklistAnswer,
        smallBizChecklistAnswer,
      };
      localStorage.setItem('selftax_deduction_data', JSON.stringify(deductionData));
      const hasAnyItems = Boolean(
        (medicalItems && medicalItems.length > 0) ||
        (insuranceItems && insuranceItems.length > 0) ||
        (cardItems && cardItems.length > 0) ||
        (eduItems && eduItems.length > 0) ||
        (rentItems && rentItems.length > 0) ||
        (housingLoanItems && housingLoanItems.length > 0) ||
        (housingSavingsItems && housingSavingsItems.length > 0) ||
        (pensionItems && pensionItems.length > 0) ||
        (donationItems && donationItems.length > 0) ||
        (donationCarryoverItems && donationCarryoverItems.length > 0) ||
        (smallBizItems && smallBizItems.length > 0) ||
        (longInvestItems && longInvestItems.length > 0) ||
        (otherDeductItems && otherDeductItems.length > 0)
      );
      if (!isFirstMountRef.current) {
        if (typeof onDataChange === 'function') {
          onDataChange(hasAnyItems);
        }
      } else {
        isFirstMountRef.current = false;
      }
    } catch (e) {
      console.error('Failed to sync selftax_deduction_data', e);
    }
  }, [
    totalInsuranceAmount,
    totalGeneralInsurance,
    totalDisabledInsurance,
    totalMedicalAmount,
    totalEduAmount,
    totalCardAmount,
    totalCreditCard,
    totalDebitCard,
    totalCashReceipt,
    totalMarketCard,
    totalTransitCard,
    totalCultureCard,
    totalRentAmount,
    totalRentLimitAmount,
    totalHousingLoan,
    totalHousingSavings,
    totalHousingSavingsLimitAmount,
    totalPensionAmount,
    donationItems,
    donationCarryoverItems,
    totalSmallBizAmount,
    totalSmallBizLimitAmount,
    totalLongInvestAmount,
    totalOtherDeductAmount,
    otherDeductItems,
    medicalItems,
    insuranceItems,
    cardItems,
    eduItems,
    rentItems,
    housingLoanItems,
    housingSavingsItems,
    pensionItems,
    smallBizItems,
    longInvestItems,
    housingLoanChecklistAnswer,
    housingSavingsChecklistAnswer,
    rentChecklistAnswer,
    smallBizChecklistAnswer,
  ]);

  return (
    <div className="w-full min-h-screen bg-white flex flex-col justify-between font-sans select-none relative">
      {/* ========================================================================= */}
      {/* 1. 공제자료 입력 메인 목록 화면 (첨부 이미지 1 & 2 스펙 100% 일치)            */}
      {/* ========================================================================= */}
      {viewMode === 'list' && (
        <div className="flex-1 flex flex-col justify-between">
          {/* 상단 헤더: ← 연말정산자료입력 + ≡ 햄버거 메뉴 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-2">
              <button
                onClick={onPrev || onGoHome}
                className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
                title="뒤로가기"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                연말정산자료입력
              </h1>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <UserAuthStatus
                userProfile={userProfile}
                onSignOut={onSignOut}
                onLogin={onLogin}
              />
              <HomeButton onClick={onGoHome} />
            </div>
          </div>

          {/* 상단 파란색 5단계 프로세스 바 (4. 공제자료 입력 활성화 - 첨부 이미지 스펙 100% 일치) */}
          <TaxStepProgressBar currentStep={4} onSelectStep={onNavigateStep} />

          {/* 메인 스크롤 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-3.5 overflow-y-auto">
            {/* 상단 안내 박스 (사용자 요청: '반드시 [작성완료하기]' 눈에 잘 띄게 강조) */}
            <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 text-xs text-slate-600 space-y-2 leading-relaxed">
              <div className="flex items-start gap-1.5">
                <span className="text-slate-400 mt-0.5 text-[11px]">•</span>
                <span className="text-[11.5px]">
                  각 자료 항목 클릭 시 연말정산 자료에 대해 상세조회 할 수 있으며, 추가 입력이 가능합니다.
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-rose-500 mt-0.5 text-xs font-bold shrink-0">⚠️</span>
                <span className="text-[11.5px] text-slate-700">
                  자료입력 완료 시 <span className="inline-flex items-center gap-1 font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 shadow-2xs">반드시 [작성완료하기]</span>를 클릭해 주세요.
                </span>
              </div>
            </div>

            {/* 12대 공제자료 항목 목록 (첨부 이미지 1 & 2 완벽 일치) */}
            <div className="space-y-2.5">
              {/* 1. 보험료 (첨부 이미지 스펙 - 클릭 시 보험료 조회 화면으로 이동!) */}
              <div
                onClick={() => setViewMode('insurance_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    📑
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">보험료</span>
                </div>
                {renderItemAmount(totalInsuranceAmount)}
              </div>

              {/* 2. 의료비 (클릭 시 의료비 조회 이동) */}
              <div
                onClick={() => setViewMode('medical_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    🏥
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">
                    의료비
                  </span>
                </div>
                {renderItemAmount(totalMedicalAmount)}
              </div>

              {/* 3. 교육비 (클릭 시 교육비 조회로 이동!) */}
              <div
                onClick={() => setViewMode('edu_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    🎓
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">
                    교육비
                  </span>
                </div>
                {renderItemAmount(totalEduAmount)}
              </div>

              {/* 4. 신용카드 (클릭 시 신용카드 조회 화면으로 이동!) */}
              <div
                onClick={() => setViewMode('card_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    💳
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">신용카드</span>
                </div>
                {workerTotalSalary > 70000000 && totalCultureCard > 0
                  ? renderItemAmount(totalCardAmount, '문화비 30%추가 제외')
                  : renderItemAmount(totalCardAmount)}
              </div>

              {/* 5. 주택자금 */}
              <div
                onClick={() => setViewMode(housingLoanChecklistAnswer === 'yes' ? 'housing_loan_view' : 'housing_loan_checklist')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    🏠
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">주택자금</span>
                  {housingLoanChecklistAnswer === 'yes' ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold">
                      체크완료
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200 text-[10px] font-bold">
                      체크필요
                    </span>
                  )}
                </div>
                {workerTotalSalary > 50000000 && housingLoanItems.some((i) => i.type?.includes('거주자') || i.type?.includes('개인차입'))
                  ? renderItemAmount(totalHousingLoanLimitAmount, '개인차입 제외')
                  : renderItemAmount(totalHousingLoanLimitAmount)}
              </div>

              {/* 6. 주택마련저축 */}
              <div
                onClick={() => setViewMode(housingSavingsChecklistAnswer === 'yes' ? 'housing_savings_view' : 'housing_savings_checklist')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    💰
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">주택마련저축</span>
                  {housingSavingsChecklistAnswer === 'yes' ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold">
                      체크완료
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200 text-[10px] font-bold">
                      체크필요
                    </span>
                  )}
                </div>
                {workerTotalSalary > 70000000 && totalHousingSavings > 0
                  ? renderItemAmount(totalHousingSavingsLimitAmount, '총급여 7천만원 초과 제외')
                  : renderItemAmount(totalHousingSavingsLimitAmount)}
              </div>

              {/* 7. 연금저축/연금계좌 */}
              <div
                onClick={() => setViewMode('pension_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    🪙
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">연금저축/연금계좌</span>
                </div>
                {renderItemAmount(totalPensionAmount)}
              </div>

              {/* 8. 기부금 (클릭 시 기부금 조회 이동) */}
              <div
                onClick={() => setViewMode('donation_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    🤲
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">기부금</span>
                </div>
                {renderItemAmount(totalDonationAmount)}
              </div>

              {/* 9. 월세액 (클릭 시 '월세액 조회'로 이동) */}
              <div
                onClick={() => setViewMode(rentChecklistAnswer === 'yes' ? 'rent_view' : 'rent_checklist')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    🗓️
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">
                    월세액
                  </span>
                  {rentChecklistAnswer === 'yes' ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold">
                      체크완료
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200 text-[10px] font-bold">
                      체크필요
                    </span>
                  )}
                </div>
                {workerTotalSalary > 80000000 && totalRentAmount > 0
                  ? renderItemAmount(totalRentLimitAmount, '총급여 8천만원 초과 제외')
                  : hasMortgageLoanDeduction && totalRentAmount > 0
                  ? renderItemAmount(totalRentLimitAmount, '장기주택저당차입금 적용 제외')
                  : renderItemAmount(totalRentLimitAmount)}
              </div>

              {/* 10. 소기업소상공인 */}
              <div
                onClick={() => setViewMode(smallBizChecklistAnswer === 'yes' ? 'small_biz_view' : 'small_biz_checklist')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    ☂️
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">소기업소상공인</span>
                  {smallBizChecklistAnswer === 'yes' ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold">
                      체크완료
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200 text-[10px] font-bold">
                      체크필요
                    </span>
                  )}
                </div>
                {totalSmallBizAmount > 0 && totalSmallBizLimitAmount === 0 && workerTotalSalary > 70000000 && smallBizItems.every((i) => (i.bizType || '법인대표자') === '법인대표자')
                  ? renderItemAmount(totalSmallBizLimitAmount, '법인대표 7천만원 초과 제외')
                  : renderItemAmount(totalSmallBizLimitAmount)}
              </div>

              {/* 11. 장기집합증권 */}
              <div
                onClick={() => setViewMode('long_invest_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    📑
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">장기집합증권</span>
                </div>
                {(() => {
                  if (workerTotalSalary > 80000000 && longInvestItems.some((i) => (i.type || '').includes('장기집합') || (i.type || '').includes('청년형'))) {
                    return renderItemAmount(totalLongInvestAmount, '총급여 8천만원 초과 제외');
                  }
                  if (longInvestItems.length > 0 && totalLongInvestAmount === 0) {
                    return renderItemAmount(0, '가입 요건 미달 제외');
                  }
                  return renderItemAmount(totalLongInvestAmount);
                })()}
              </div>

              {/* 12. 기타공제 (혼인세액공제, 납세조합공제) */}
              <div
                onClick={() => setViewMode('other_deduct_view')}
                className="w-full bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 flex items-center justify-between shadow-2xs hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-[#4F46E5] flex items-center justify-center text-sm group-hover:bg-[#4F46E5] group-hover:text-white transition">
                    📋
                  </div>
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-[#4F46E5] transition">
                    기타공제
                  </span>
                </div>
                {renderItemAmount(totalOtherDeductAmount)}
              </div>
            </div>
          </div>

          {/* 하단 고정 액션 바 (이전 / 작성완료 동일 크기) */}
          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onPrev}
              className="flex-1 py-3.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-[13px] font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setShowCompleteModal(true)}
              className="flex-1 py-3.5 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] active:scale-95 text-white text-xs sm:text-[13px] font-bold transition shadow-xs cursor-pointer text-center"
            >
              작성완료 하기
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 교육비 1. 교육비 조회 화면 (첨부 이미지 5 & 3 스펙 100% 일치)                */}
      {/* ========================================================================= */}
      {viewMode === 'edu_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 교육비 조회 + [AI+] 아이콘 버튼 + 도움말 아이콘 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">교육비 조회</span>
            </button>

            <div className="flex items-center gap-2">
              {/* AI 버튼 (클릭 시 절세팁/구비서류 가이드 화면 이동) */}
              <button
                type="button"
                onClick={() => {
                  setGuideCategory('education');
                  setGuideActiveTab('about');
                  setGuideReturnMode('edu_view');
                  setViewMode('deduction_guide');
                }}
                className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
                title="AI 공제 가이드 (절세팁·구비서류)"
              >
                <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
                <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
              </button>
            </div>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 파란색 그라데이션 히어로 카드 (첨부 이미지 5 & 3) */}
            <div className="w-full bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎓</span>
                  <span className="text-sm font-bold tracking-tight">교육비</span>
                </div>
                {/* 📎 증빙 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowEduProofModal(true)}
                  className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition cursor-pointer flex items-center gap-1 border border-white/30 shadow-2xs"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>

              {/* 합계금액 */}
              <div className="flex items-baseline justify-between pt-1 border-b border-white/20 pb-3">
                <span className="text-xs text-indigo-100 font-medium">합계금액</span>
                <span className="text-2xl font-black font-mono tracking-tight">
                  {totalEduAmount.toLocaleString()} <span className="text-base font-bold">원</span>
                </span>
              </div>

              {/* 교육비 구분별 합계금액 */}
              {eduTypeTotals.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {eduTypeTotals.map(([typeKey, amt]) => (
                    <div key={typeKey} className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>{typeKey}</span>
                      </div>
                      <span className="font-mono font-medium text-white">
                        {Number(amt).toLocaleString()}원
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 국세청자료/기타자료 또는 빈 상태 */}
            {eduItems.length === 0 ? (
              <EmptyDeductionState
                onAdd={handleOpenAddEdu}
                addText="+ 자료입력"
              />
            ) : (
              <>
                {/* 1. 국세청자료 섹션 */}
                {eduItems.filter((item) => item.isNts).length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          eduItems
                            .filter((i) => i.isNts)
                            .map((i) => (i.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName, memberIdx) => {
                        const memberItems = eduItems.filter(
                          (i) => i.isNts && (i.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const { typeMap, memberTotal } = getMemberEduSummary(memberItems);
                        const isExpanded = !!expandedEduMembers[memberName];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleEduMemberAccordion(memberName)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                                {memberItems.some((it) => it.needsReview) && (
                                  <span className="ml-2 align-middle text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
                                    확인 필요
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역 (교육비구분만 간단히 표기) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {Object.entries(typeMap).map(([typeKey, amt]) => (
                                  <div
                                    key={typeKey}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">{typeKey}</span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(amt).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                                {memberItems
                                  .filter((it) => it.needsReview)
                                  .map((it) => (
                                    <div key={it.id} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-amber-800">확인 필요 · {it.school || it.category}</span>
                                        <span className="font-mono text-amber-900 whitespace-nowrap">
                                          {Number(it.rawAmount || 0).toLocaleString()}원 (미반영)
                                        </span>
                                      </div>
                                      <p className="mt-1 text-amber-700 leading-relaxed">{it.reviewReason}</p>
                                      <button
                                        type="button"
                                        onClick={() => includeReviewEduItem(it.id)}
                                        className="mt-2 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 font-bold hover:bg-amber-100 transition"
                                      >
                                        확인했습니다 · 공제에 포함
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. 기타자료 섹션 */}
                {eduItems.some((item) => !item.isNts) && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-semibold text-slate-400">기타자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          eduItems
                            .filter((i) => !i.isNts)
                            .map((i) => (i.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName, memberIdx) => {
                        const memberItems = eduItems.filter(
                          (i) => !i.isNts && (i.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const { typeMap, memberTotal } = getMemberEduSummary(memberItems);
                        const isExpanded = !!expandedOtherEduMembers[memberName];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleOtherEduMemberAccordion(memberName)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역 (교육비구분만 간단히 표기) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {Object.entries(typeMap).map(([typeKey, amt]) => (
                                  <div
                                    key={typeKey}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">{typeKey}</span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(amt).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 하단 고정 액션 바: [ 목록보기 ] [ 자료 수정/추가 ] (동일한 크기 flex-1 적용) */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm tracking-wide shadow-2xs transition cursor-pointer text-center"
            >
              목록보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('edu_edit')}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              자료 수정/추가
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 교육비 2. 교육비 수정 화면 (첨부 이미지 1 스펙 100% 일치)                    */}
      {/* ========================================================================= */}
      {viewMode === 'edu_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 교육비 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('edu_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">교육비 수정</span>
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                교육비 자료를<br />
                추가 또는 변경해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 등록된 교육비 항목 리스트 */}
            <div className="space-y-4">
              {/* 국세청자료 */}
              {eduItems.some((item) => item.isNts) && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-800">국세청자료</div>
                  <div className="space-y-3">
                    {eduItems
                      .filter((item) => item.isNts)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {(item.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim()}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditEduItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-normal">
                              {item.category || '본인'}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                              {getEduItemDisplayAmount(item).toLocaleString()}원
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteEduItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 기타자료 */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-slate-800">기타자료</div>
                <div className="space-y-3">
                  {eduItems.filter((item) => !item.isNts).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      직접 등록한 기타자료가 없습니다. 아래 버튼으로 추가해주세요.
                    </div>
                  ) : (
                    eduItems
                      .filter((item) => !item.isNts)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-indigo-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {(item.name || '').replace(/\(부양가족\)/g, '').replace(/부양가족/g, '').replace(/\(.*?\)/g, '').trim()}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditEduItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-normal">
                              {item.category || '본인'}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                              {getEduItemDisplayAmount(item).toLocaleString()}원
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteEduItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

              {/* [ 수정/추가 완료 ] + [ 기타자료 추가 ] 버튼 */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('edu_view')}
                  className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
                >
                  수정/추가 완료
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddEdu()}
                  className="flex-1 py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>기타자료 추가</span>
                </button>
              </div>
            </div>

          <div className="p-4" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 교육비 3. 교육비 추가/수정 화면 (첨부 이미지 2 스펙 100% 일치)               */}
      {/* ========================================================================= */}
      {viewMode === 'edu_add' && (
        <form onSubmit={handleSaveEduItem} className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 교육비 추가 / 교육비 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('edu_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingEduItemId ? '교육비 수정' : '교육비 추가'}
              </span>
            </button>
          </div>

          {/* 본문 폼 스크롤 영역 (첨부 이미지 2 규격) */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                {editingEduItemId ? (
                  <>
                    교육비 기타자료를<br />
                    수정하세요.
                  </>
                ) : (
                  <>
                    교육비 기타자료를<br />
                    입력하세요.
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                {editingEduItemId ? (
                  '교육비 수정에 필요한 정보를 모두 입력해주세요.'
                ) : (
                  <>
                    교육비 추가에 필요한 정보를 모두 입력해주세요.<br />
                  </>
                )}
              </p>
            </div>

            {/* 입력 폼 필드 카드 (첨부 이미지 2 규격) */}
            <div className="space-y-4 pt-1">
              {/* 1. 성명* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  성명<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formEduName}
                    onChange={(e) => handleEduNameChange(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    {familyMembers.map((m) => {
                      const cleanMemberName = (m.name || '')
                        .replace(/\(부양가족\)/g, '')
                        .replace(/부양가족/g, '')
                        .replace(/\(.*?\)/g, '')
                        .trim();
                      const rel = m.relation || (m.isSelf ? '본인' : '');
                      const isAscendant = !m.isSelf && (
                        rel.includes('존속') || rel.includes('부모') || rel.includes('부/모') ||
                        rel.includes('조부') || rel.includes('조모')
                      );
                      let extraText = '';
                      if (m.isSelf || rel === '본인') {
                        extraText = '(본인)';
                      } else if (isAscendant) {
                        extraText = '(특수교육비만 가능)';
                      }
                      return (
                        <option key={m.id} value={cleanMemberName}>
                          {cleanMemberName}{extraText ? ` ${extraText}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 2. 교육비구분* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  교육비구분<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formEduCategory}
                    onChange={(e) => setFormEduCategory(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="취학전아동">취학전아동</option>
                    <option value="초·중·고등학생">초·중·고등학생</option>
                    <option value="중.고등학생(교복구입비)">중.고등학생(교복구입비)</option>
                    <option value="초.중.고등학생(현장학습비)">초.중.고등학생(현장학습비)</option>
                    <option value="대학생">대학생</option>
                    <option value="본인">본인</option>
                    <option value="장애인특수교육">장애인특수교육</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 3. 일반교육비 인풋 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  일반교육비
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={formEduAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setFormEduAmount(raw ? Number(raw).toLocaleString() : '0');
                    }}
                    placeholder="0"
                    className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                </div>
              </div>

              {/* 4. 장애인특수교육비 인풋 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  장애인특수교육비
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={formEduSpecialAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setFormEduSpecialAmount(raw ? Number(raw).toLocaleString() : '');
                    }}
                    placeholder="0"
                    className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                </div>
              </div>
            </div>
          </div>

          {/* 하단 고정 액션 바: [ 수정 ] 또는 [ 저장 ] (사용자 요청 반영) */}
          <div className="p-4 bg-white border-t border-slate-100">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              {editingEduItemId ? '수정' : '저장'}
            </button>
          </div>
        </form>
      )}

      {/* 교육비 증빙 모달 */}
      {showEduProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              📎
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">교육비 납입증명서 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                취학전아동 학원비·유치원비, 국외교육비, 교복구입비 등은 교육비 납입영수증을 첨부해야 공제가 인정됩니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 제출 대상: 간소화 자료에 없는 교육비를 공제받는 가족</div>
              <div>• 인정 서류: 교육비 납입증명서, 학원 영수증</div>
            </div>
            <button
              type="button"
              onClick={() => setShowEduProofModal(false)}
              className="w-full py-3 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-[#4338CA] transition"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 보험료 1. 보험료 조회 화면 (첨부 이미지 스펙 100% 일치)                    */}
      {/* ========================================================================= */}
      {viewMode === 'insurance_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 보험료조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">보험료조회</span>
            </button>

            <div className="flex items-center gap-2">
              {/* AI 버튼 (클릭 시 절세팁/구비서류 가이드 화면 이동) */}
              <button
                type="button"
                onClick={() => {
                  setGuideCategory('insurance');
                  setGuideActiveTab('about');
                  setGuideReturnMode('insurance_view');
                  setViewMode('deduction_guide');
                }}
                className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
                title="AI 공제 가이드 (절세팁·구비서류)"
              >
                <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
                <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
              </button>
            </div>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 파란색 그라데이션 히어로 카드 (첨부 이미지 완벽 일치) */}
            <div className="w-full bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tracking-tight">보험료 합계</span>
                  <span
                    onClick={() => {
                      setGuideCategory('insurance');
                      setGuideActiveTab('about');
                      setGuideReturnMode('insurance_view');
                      setViewMode('deduction_guide');
                    }}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="보험료 세액공제 안내"
                  >
                    ⓘ
                  </span>
                </div>
                {/* 📎 증빙 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowInsuranceProofModal(true)}
                  className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition cursor-pointer flex items-center gap-1 border border-white/30 shadow-2xs"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>

              {/* 가로 구분선 */}
              <div className="border-t border-white/20 pt-1" />

              {/* 금액 상세 목록 */}
              <div className="space-y-1.5">
                {/* ⨁ 보험료 합계 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white/90">⨁</span>
                    <span className="text-sm font-semibold tracking-tight">보험료 합계</span>
                  </div>
                  <span className="text-base font-bold font-mono tracking-tight">
                    {totalInsuranceAmount.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 일반보장성보험 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>일반보장성보험</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalGeneralInsurance.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 장애인보장성보험 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>장애인보장성보험</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalDisabledInsurance.toLocaleString()}원
                  </span>
                </div>
              </div>
            </div>

            {/* 국세청자료/기타자료 또는 빈 상태 */}
            {insuranceItems.length === 0 ? (
              <EmptyDeductionState
                onAdd={handleOpenAddInsurance}
                addText="+ 자료입력"
              />
            ) : (
              <>
                {/* 국세청자료 섹션 (인별 박스 카드 리스트) */}
                {insuranceItems.filter((item) => item.isNts).length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>

                    <div className="space-y-2.5">
                      {Array.from(new Set(insuranceItems.filter(i => i.isNts).map(i => (i.name || '').replace(/\(.*?\)/g, '').trim()))).map((memberName, memberIdx) => {
                        const memberItems = insuranceItems.filter(i => i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName);
                        const memberTotal = memberItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                        const isExpanded = !!expandedInsuranceMembers[memberName];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleInsuranceMemberAccordion(memberName)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역 (보험구분만 간단히 표기) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {(() => {
                                  const typeGroups = memberItems.reduce((acc, curr) => {
                                    const t = curr.type || '일반보장성보험';
                                    acc[t] = (acc[t] || 0) + (Number(curr.amount) || 0);
                                    return acc;
                                  }, {});

                                  return Object.entries(typeGroups).map(([insType, amt]) => (
                                    <div
                                      key={insType}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-slate-600">{insType}</span>
                                      <span className="font-bold font-mono text-slate-900 text-[13px]">
                                        {Number(amt).toLocaleString()}원
                                      </span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 기타자료 섹션 (요구사항 3: 클릭하면 펼쳐지게 표기되게 변경) */}
                {insuranceItems.some((item) => !item.isNts) && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-semibold text-slate-400">기타자료</div>
                    <div className="space-y-2.5">
                      {Array.from(new Set(insuranceItems.filter(i => !i.isNts).map(i => (i.name || '').replace(/\(.*?\)/g, '').trim()))).map((memberName, memberIdx) => {
                        const memberItems = insuranceItems.filter(i => !i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName);
                        const memberTotal = memberItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                        const isExpanded = !!expandedOtherInsuranceMembers[memberName];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleOtherInsuranceMemberAccordion(memberName)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역 (보험구분만 간단히 표기, 수정/삭제 버튼 삭제) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {(() => {
                                  const typeGroups = memberItems.reduce((acc, curr) => {
                                    const t = curr.type || '일반보장성보험';
                                    acc[t] = (acc[t] || 0) + (Number(curr.amount) || 0);
                                    return acc;
                                  }, {});

                                  return Object.entries(typeGroups).map(([insType, amt]) => (
                                    <div
                                      key={insType}
                                      className="flex items-center justify-between py-1.5 text-xs"
                                    >
                                      <span className="font-medium text-slate-600">{insType}</span>
                                      <span className="font-bold font-mono text-slate-900 text-[13px]">
                                        {Number(amt).toLocaleString()}원
                                      </span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 하단 고정 액션 바: [ 목록보기 ] [ 자료 수정/추가 ] (동일한 50:50 크기 flex-1 적용) */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm tracking-wide shadow-2xs transition cursor-pointer text-center"
            >
              목록보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('insurance_edit')}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              자료 수정/추가
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 보험료 2. 보험료 수정 화면 (교육비 수정 화면 패턴 100% 매칭)               */}
      {/* ========================================================================= */}
      {viewMode === 'insurance_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 보험료 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('insurance_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">보험료 수정</span>
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                보험료 자료를<br />
                추가 또는 변경해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 등록된 보험료 항목 리스트 */}
            <div className="space-y-4">
              {/* 국세청자료 */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-800">국세청자료</div>
                <div className="space-y-3">
                  {insuranceItems
                    .filter((item) => item.isNts)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-bold text-slate-900 leading-tight">
                              {(item.name || '').replace(/\(.*?\)/g, '').trim()}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEditInsuranceItem(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                              title="수정"
                            >
                              <span>수정</span>
                              <span className="text-[10px]">✎</span>
                            </button>
                          </div>
                          <div className="text-[13px] font-medium text-slate-600 leading-normal">
                            {item.type}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                            {Number(item.amount || 0).toLocaleString()}원
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteInsuranceItem(item.id)}
                            className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* 기타자료 */}
              {insuranceItems.some((item) => !item.isNts) && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-slate-800">기타자료</div>
                  <div className="space-y-3">
                    {insuranceItems
                      .filter((item) => !item.isNts)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-indigo-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {(item.name || '').replace(/\(.*?\)/g, '').trim()}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditInsuranceItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-normal">
                              {item.type}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                              {Number(item.amount || 0).toLocaleString()}원
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteInsuranceItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* [ 수정/추가 완료 ] + [ 기타자료 추가 ] 버튼 (동일한 50:50 크기 flex-1) */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('insurance_view')}
                  className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
                >
                  수정/추가 완료
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddInsurance()}
                  className="flex-1 py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>기타자료 추가</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-4" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 보험료 3. 보험료 추가/수정 화면 (교육비 추가 화면 패턴 100% 매칭)           */}
      {/* ========================================================================= */}
      {viewMode === 'insurance_add' && (
        <form onSubmit={handleSaveInsuranceItem} className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 보험료 추가 / 보험료 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('insurance_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingInsItemId ? '보험료 수정' : '보험료 추가'}
              </span>
            </button>
          </div>

          {/* 본문 폼 스크롤 영역 */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                {editingInsItemId ? (
                  <>
                    보험료 자료를<br />
                    수정하세요.
                  </>
                ) : (
                  <>
                    보험료 기타자료를<br />
                    입력하세요.
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                {editingInsItemId ? (
                  <>
                    보험료 수정에 필요한 정보를 모두 입력해주세요.
                  </>
                ) : (
                  <>
                    보험료 추가에 필요한 정보를 모두 입력해주세요.<br />
                  </>
                )}
              </p>
            </div>

            {/* 입력 폼 필드 카드 */}
            <div className="space-y-4 pt-1">
              {/* 1. 성명* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  성명<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formInsName}
                    onChange={(e) => setFormInsName(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    {familyMembers.map((m) => {
                      const cleanMemberName = (m.name || '').replace(/\(.*?\)/g, '').trim();
                      return (
                        <option key={m.id} value={cleanMemberName}>
                          {cleanMemberName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 2. 보험구분* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  보험구분<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formInsType}
                    onChange={(e) => setFormInsType(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="일반보장성보험">일반보장성보험</option>
                    <option value="장애인전용보장성보험">장애인전용보장성보험</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 3. 보험회사 / 상품명 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  보험회사 / 상품명
                </label>
                <input
                  type="text"
                  value={formInsCompany}
                  onChange={(e) => setFormInsCompany(e.target.value)}
                  placeholder="예: 교보생명 (무)교보종신보험"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 4. 납입금액* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  납입금액<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formInsAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setFormInsAmount(raw ? Number(raw).toLocaleString() : '');
                  }}
                  placeholder="예: 1,000,000"
                  className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 증빙 안내 박스 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-indigo-800 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <span>📎</span>
                  <span>증빙서류 제출 안내</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  국세청 홈택스 간소화 서비스 외 직접 추가하시는 보장성 보험료는 보험회사에서 발행하는 <strong>보험료 납입증명서</strong>를 첨부해야 공제가 인정됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* 하단 고정 액션 바: [ 수정 ] 또는 [ 저장 ] */}
          <div className="p-4 bg-white border-t border-slate-100">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              {editingInsItemId ? '수정' : '저장'}
            </button>
          </div>
        </form>
      )}

      {/* 보험료 증빙 안내 모달 */}
      {showInsuranceProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              📎
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">보험료 납입증명서 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                보장성보험료 세액공제를 받으려면 해당 보험회사에서 발행한 보장성보험료 납입증명서가 필요합니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 인정 서류: 보장성보험료 납입증명서, 보험증권 사본</div>
              <div>• 간소화자료: 국세청에서 제공하는 자료는 별도 영수증 제출 불필요</div>
              <div>• 공제한도: 일반 보장성 연 100만원, 장애인전용 연 100만원</div>
            </div>
            <button
              type="button"
              onClick={() => setShowInsuranceProofModal(false)}
              className="w-full py-3 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-[#4338CA] transition"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 기부금 1. 기부금 조회 화면 (첨부 이미지 스펙 100% 일치)                     */}
      {/* ========================================================================= */}
      {viewMode === 'donation_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 기부금 조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">기부금 조회</span>
            </button>

            <div className="flex items-center gap-2">
              {/* AI 버튼 (클릭 시 절세팁/구비서류 가이드 화면 이동) */}
              <button
                type="button"
                onClick={() => {
                  setGuideCategory('donation');
                  setGuideActiveTab('about');
                  setGuideReturnMode('donation_view');
                  setViewMode('deduction_guide');
                }}
                className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
                title="AI 공제 가이드 (절세팁·구비서류)"
              >
                <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
                <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
              </button>
            </div>
          </div>

          {/* 서브 탭: 당해년도기부금 | 전년도기부금 (첨부 이미지 1 & 2 규격) */}
          <div className="w-full bg-white border-b border-slate-100 flex items-center px-5">
            <button
              type="button"
              onClick={() => setDonationTab('current')}
              className={`flex-1 py-3 text-center text-sm transition relative cursor-pointer ${
                donationTab === 'current'
                  ? 'text-[#4F46E5] font-bold'
                  : 'text-slate-400 font-medium hover:text-slate-600'
              }`}
            >
              당해년도기부금
              {donationTab === 'current' && (
                <div className="absolute bottom-0 left-6 right-6 h-[2.5px] bg-[#4F46E5] rounded-t-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setDonationTab('previous')}
              className={`flex-1 py-3 text-center text-sm transition relative cursor-pointer ${
                donationTab === 'previous'
                  ? 'text-[#4F46E5] font-bold'
                  : 'text-slate-400 font-medium hover:text-slate-600'
              }`}
            >
              전년도기부금
              {donationTab === 'previous' && (
                <div className="absolute bottom-0 left-6 right-6 h-[2.5px] bg-[#4F46E5] rounded-t-full" />
              )}
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {donationTab === 'current' ? (
              <>
                {/* 상단 파란색 그라데이션 히어로 카드 (첨부 이미지 완벽 일치) */}
                <div className="w-full bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-bold tracking-tight">당해년도 기부금 합계</span>
                      <span
                        onClick={() => {
                          setGuideCategory('donation');
                          setGuideActiveTab('about');
                          setGuideReturnMode('donation_view');
                          setViewMode('deduction_guide');
                        }}
                        className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                        title="기부금 세액공제 안내"
                      >
                        ⓘ
                      </span>
                    </div>
                    {/* 📎 증빙 버튼 */}
                    <button
                      type="button"
                      onClick={() => setShowDonationProofModal(true)}
                      className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition cursor-pointer flex items-center gap-1 border border-white/30 shadow-2xs"
                    >
                      <span>📎</span>
                      <span>증빙</span>
                    </button>
                  </div>

                  {/* 가로 구분선 */}
                  <div className="border-t border-white/20 pt-1" />

                  {/* 금액 상세 목록 */}
                  <div className="space-y-1.5">
                    {/* 🤲 기부금 합계 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white/90">🤲</span>
                        <span className="text-sm font-semibold tracking-tight">기부금 합계</span>
                      </div>
                      <span className="text-base font-bold font-mono tracking-tight">
                        {totalDonationAmount.toLocaleString()}원
                      </span>
                    </div>

                    {/* ㄴ 정치자금기부금 */}
                    {totalPoliticalDonation > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>정치자금기부금</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalPoliticalDonation.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {/* ㄴ 고향사랑기부금 (항상 기부금 합계 내역에 표기) */}
                    <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-200">ㄴ</span>
                        <span>고향사랑기부금</span>
                      </div>
                      <span className="font-mono font-medium">
                        {totalHometownDonation.toLocaleString()}원
                      </span>
                    </div>

                    {/* ㄴ 우리사주조합기부금 */}
                    {totalEmployeeStockDonation > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>우리사주조합기부금</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalEmployeeStockDonation.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {/* ㄴ 특례(법정)기부금 */}
                    {totalSpecialDonation > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>특례(법정)기부금</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalSpecialDonation.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {/* ㄴ 종교단체외일반(지정)기부금 */}
                    {totalGeneralNonReligiousDonation > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>종교단체외일반(지정)기부금</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalGeneralNonReligiousDonation.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {/* ㄴ 종교단체일반(지정)기부금 */}
                    {totalGeneralReligiousDonation > 0 && (
                      <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-200">ㄴ</span>
                          <span>종교단체일반(지정)기부금</span>
                        </div>
                        <span className="font-mono font-medium">
                          {totalGeneralReligiousDonation.toLocaleString()}원
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 국세청자료/기타자료 또는 빈 상태 */}
                {donationItems.length === 0 ? (
                  <EmptyDeductionState
                    onAdd={handleOpenAddDonation}
                    addText="+ 자료입력"
                  />
                ) : (
                  <>
                    {/* 국세청자료 섹션 (부양가족별 아코디언 카드 - 첨부 이미지 완벽 일치) */}
                    <div className="space-y-2.5 pt-1">
                      <div className="text-xs font-semibold text-slate-400">국세청자료</div>

                      {/* 부양가족별 그룹핑 렌더링 */}
                      <div className="space-y-2.5">
                        {Array.from(new Set(donationItems.filter(i => i.isNts).map(i => (i.name || '').replace(/\(.*?\)/g, '').trim()))).map((memberName, memberIdx) => {
                          const memberItems = donationItems.filter(i => i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName);
                          const memberTotal = memberItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                          const isExpanded = !!expandedDonationMembers[memberName];

                          return (
                            <div
                              key={memberName}
                              className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                                isExpanded ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200/90 hover:border-indigo-300'
                              }`}
                            >
                              {/* 아코디언 헤더 */}
                              <button
                                type="button"
                                onClick={() => toggleDonationMemberAccordion(memberName)}
                                className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                              >
                                <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                  {memberName}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                    {memberTotal.toLocaleString()}원
                                  </span>
                                  <span
                                    className={`text-slate-400 text-xs transition-transform duration-200 ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                  >
                                    ∨
                                  </span>
                                </div>
                              </button>

                              {/* 아코디언 펼침 상세 내역 (기부금 종류별로만 구분하여 간단히 표기 - 회색 배경 및 바 표기 삭제) */}
                              {isExpanded && (
                                <div className="px-5 pb-4 pt-1 space-y-2">
                                  {(() => {
                                    const typeGroups = memberItems.reduce((acc, curr) => {
                                      const t = curr.type || '기부금';
                                      acc[t] = (acc[t] || 0) + (Number(curr.amount) || 0);
                                      return acc;
                                    }, {});

                                    return Object.entries(typeGroups).map(([donType, amt]) => (
                                      <div
                                        key={donType}
                                        className="flex items-center justify-between py-1.5 text-xs"
                                      >
                                        <span className="font-medium text-slate-600">{donType}</span>
                                        <span className="font-bold font-mono text-slate-900 text-[13px]">
                                          {Number(amt).toLocaleString()}원
                                        </span>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 기타자료 섹션 (인별로 박스 클릭하면 상세내역에 기부금 종류별로만 구분하여 간단히 표기, 수정,삭제 버튼 삭제) */}
                    {donationItems.some((item) => !item.isNts) && (
                      <div className="space-y-2.5 pt-2">
                        <div className="text-xs font-semibold text-slate-400">기타자료</div>
                        <div className="space-y-2.5">
                          {Array.from(new Set(donationItems.filter(i => !i.isNts).map(i => (i.name || '').replace(/\(.*?\)/g, '').trim()))).map((memberName, memberIdx) => {
                            const memberItems = donationItems.filter(i => !i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName);
                            const memberTotal = memberItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                            const isExpanded = !!expandedOtherDonationMembers[memberName];

                            return (
                              <div
                                key={memberName}
                                className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                                  isExpanded ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200/90 hover:border-indigo-300'
                                }`}
                              >
                                {/* 아코디언 헤더 */}
                                <button
                                  type="button"
                                  onClick={() => toggleOtherDonationMemberAccordion(memberName)}
                                  className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                                >
                                  <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                    {memberName}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                      {memberTotal.toLocaleString()}원
                                    </span>
                                    <span
                                      className={`text-slate-400 text-xs transition-transform duration-200 ${
                                        isExpanded ? 'rotate-180' : ''
                                      }`}
                                    >
                                      ∨
                                    </span>
                                  </div>
                                </button>

                                {/* 아코디언 펼침 상세 내역 (기부금 종류별로만 구분하여 간단히 표기 - 회색 배경 및 바 표기 삭제) */}
                                {isExpanded && (
                                  <div className="px-5 pb-4 pt-1 space-y-2">
                                    {(() => {
                                      const typeGroups = memberItems.reduce((acc, curr) => {
                                        const t = curr.type || '기부금';
                                        acc[t] = (acc[t] || 0) + (Number(curr.amount) || 0);
                                        return acc;
                                      }, {});

                                      return Object.entries(typeGroups).map(([donType, amt]) => (
                                        <div
                                          key={donType}
                                          className="flex items-center justify-between py-1.5 text-xs"
                                        >
                                          <span className="font-medium text-slate-600">{donType}</span>
                                          <span className="font-bold font-mono text-slate-900 text-[13px]">
                                            {Number(amt).toLocaleString()}원
                                          </span>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              /* 전년도 기부금 탭: 이월 기부금 입력 */
              <DonationCarryoverSection
                items={donationCarryoverItems}
                onChange={setDonationCarryoverItems}
                taxYear={2025}
                carryoverNext={donationCarryoverPreview}
              />
            )}
          </div>

          {/* 하단 고정 액션 바: [ 목록보기 ] [ 자료 수정/추가 ] (동일한 50:50 크기 flex-1 적용) */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm tracking-wide shadow-2xs transition cursor-pointer text-center"
            >
              목록보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('donation_edit')}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              자료 수정/추가
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 기부금 2. 기부금 수정 화면 (교육비 수정 패턴 100% 매칭)                     */}
      {/* ========================================================================= */}
      {viewMode === 'donation_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 기부금 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('donation_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">기부금 수정</span>
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                기부금 자료를<br />
                추가 또는 변경해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.<br />
              </p>
            </div>

            {/* 등록된 기부금 항목 리스트 */}
            <div className="space-y-4">
              {/* 국세청자료 */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-800">국세청자료</div>
                <div className="space-y-3">
                  {donationItems
                    .filter((item) => item.isNts)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-bold text-slate-900 leading-tight">
                              {(item.name || '').replace(/\(.*?\)/g, '').trim()}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEditDonationItem(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                              title="수정"
                            >
                              <span>수정</span>
                              <span className="text-[10px]">✎</span>
                            </button>
                          </div>
                          <div className="text-[13px] font-medium text-slate-600 leading-normal">
                            {item.type}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                            {Number(item.amount || 0).toLocaleString()}원
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteDonationItem(item.id)}
                            className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* 기타자료 */}
              {donationItems.some((item) => !item.isNts) && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-slate-800">기타자료</div>
                  <div className="space-y-3">
                    {donationItems
                      .filter((item) => !item.isNts)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-indigo-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {(item.name || '').replace(/\(.*?\)/g, '').trim()}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditDonationItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-normal">
                              {item.type}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                              {Number(item.amount || 0).toLocaleString()}원
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteDonationItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* [ 수정/추가 완료 ] + [ 기타자료 추가 ] 버튼 (동일한 50:50 크기 flex-1) */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('donation_view')}
                  className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
                >
                  수정/추가 완료
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddDonation()}
                  className="flex-1 py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>기타자료 추가</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-4" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 기부금 3. 기부금 추가/수정 화면 (첨부 이미지 3 & 4 스펙 100% 일치)           */}
      {/* ========================================================================= */}
      {viewMode === 'donation_add' && (
        <form onSubmit={handleSaveDonationItem} className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 기부금 추가 / 기부금 수정 + 우측 ⓘ 안내 아이콘 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('donation_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingDonItemId ? '기부금 수정' : '기부금 추가'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowDonationProofModal(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 text-sm border border-slate-200"
              title="기부금 안내"
            >
              ⓘ
            </button>
          </div>

          {/* 본문 폼 스크롤 영역 (첨부 이미지 3 & 4 규격 100% 매칭) */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                {editingDonItemId ? (
                  <>
                    기부금 기타자료를<br />
                    수정하세요.
                  </>
                ) : (
                  <>
                    기부금 기타자료를<br />
                    입력하세요.
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                {editingDonItemId ? (
                  <>
                    기부금 수정에 필요한 정보를 모두 입력해주세요.<br />
                  </>
                ) : (
                  <>
                    기부금 추가에 필요한 정보를 모두 입력해주세요.<br />
                  </>
                )}
              </p>
            </div>

            {/* 입력 폼 필드 카드 */}
            <div className="space-y-4 pt-1">
              {/* 1. 성명* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  성명<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formDonName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setFormDonName(newName);
                      const m = familyMembers.find((mem) => (mem.name || '').replace(/\(.*?\)/g, '').trim() === newName.replace(/\(.*?\)/g, '').trim());
                      const isSelf = !m || m.relation === '본인' || newName.replace(/\(.*?\)/g, '').trim() === loggedInWorkerName.replace(/\(.*?\)/g, '').trim();
                      if (!isSelf && (formDonType.includes('정치자금') || formDonType.includes('우리사주'))) {
                        setFormDonType('특례(법정)기부금');
                        showAlert(
                          '조세특례제한법에 따라 정치자금기부금 및 우리사주조합기부금은 근로자 본인 지출분만 공제 가능합니다.\n\n기부유형이 특례(법정)기부금으로 자동 변경되었습니다.',
                          '기부금 공제요건 안내'
                        );
                      }
                    }}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    {familyMembers.map((m) => {
                      const cleanMemberName = (m.name || '').replace(/\(.*?\)/g, '').trim();
                      return (
                        <option key={m.id} value={cleanMemberName}>
                          {cleanMemberName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 2. 기부금 유형* 드롭다운 */}
              {(() => {
                const selectedMember = familyMembers.find(
                  (m) => (m.name || '').replace(/\(.*?\)/g, '').trim() === formDonName.replace(/\(.*?\)/g, '').trim()
                );
                const isSelfSelected = !selectedMember || selectedMember.relation === '본인' || formDonName.replace(/\(.*?\)/g, '').trim() === loggedInWorkerName.replace(/\(.*?\)/g, '').trim();

                return (
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <label className="text-xs font-bold text-slate-500">
                      기부금 유형<span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={formDonType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          if (!isSelfSelected && (newType.includes('정치자금') || newType.includes('우리사주'))) {
                            showAlert(
                              '조세특례제한법에 따라 정치자금기부금과 우리사주조합기부금은 근로자 본인이 지급한 기부금에 한해 공제받을 수 있습니다.',
                              '공제 대상 제한'
                            );
                            return;
                          }
                          setFormDonType(newType);
                        }}
                        className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                      >
                        {formDonType && ![
                          '정치자금기부금',
                          '고향사랑기부금',
                          '고향사랑기부금(특별재난지역)',
                          '고향사랑기부금(일반)',
                          '우리사주조합기부금',
                          '우리사주조합 기부금',
                          '특례(법정)기부금',
                          '특례기부금',
                          '법정기부금',
                          '종교단체외일반(지정)기부금',
                          '일반기부금(종교단체외)',
                          '지정기부금',
                          '종교단체일반(지정)기부금',
                          '일반기부금(종교단체)',
                          '종교기부금',
                        ].includes(formDonType) && (
                          <option value={formDonType}>{formDonType}</option>
                        )}
                        <option value="정치자금기부금" disabled={!isSelfSelected}>
                          정치자금기부금 {!isSelfSelected ? '(본인 한정)' : ''}
                        </option>
                        <option value="고향사랑기부금">고향사랑기부금</option>
                        <option value="고향사랑기부금(특별재난지역)">고향사랑기부금(특별재난지역)</option>
                        <option value="우리사주조합기부금" disabled={!isSelfSelected}>
                          우리사주조합기부금 {!isSelfSelected ? '(본인 한정)' : ''}
                        </option>
                        <option value="특례(법정)기부금">특례(법정)기부금</option>
                        <option value="종교단체외일반(지정)기부금">종교단체외일반(지정)기부금</option>
                        <option value="종교단체일반(지정)기부금">종교단체일반(지정)기부금</option>
                      </select>
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                        ∨
                      </div>
                    </div>

                    {!isSelfSelected && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200/60 font-medium mt-1 leading-relaxed">
                        ※ <strong>{formDonName}</strong>님은 부양가족이므로 특례·일반(지정) 기부금만 선택 가능합니다. (정치자금·우리사주조합 기부금은 본인만 공제 가능)
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* 3. 기부처상호* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  기부처상호<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formDonCompany}
                  onChange={(e) => setFormDonCompany(e.target.value)}
                  placeholder="기부처 단체명을 입력해주세요."
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 4. 기부처 사업(주민) 번호* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  기부처 사업(주민) 번호<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formDonBizNumber}
                  onChange={(e) => setFormDonBizNumber(e.target.value)}
                  placeholder="입력해주세요."
                  className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 5. 기부건수* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  기부건수<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formDonCount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setFormDonCount(raw);
                  }}
                  placeholder="입력해주세요."
                  className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 6. 기부대상액* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  기부대상액<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formDonAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setFormDonAmount(raw ? Number(raw).toLocaleString() : '');
                  }}
                  placeholder="입력해주세요."
                  className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 7. 기부장려금신청액 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  기부장려금신청액
                </label>
                <input
                  type="text"
                  value={formDonRewardAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setFormDonRewardAmount(raw ? Number(raw).toLocaleString() : '');
                  }}
                  placeholder="입력해주세요."
                  className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>
            </div>

            {/* 기부금 공제 한도 안내 (소기업소상공인 수정페이지 하단 스타일) */}
            <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-600 space-y-1.5 mt-2">
              <div className="font-semibold text-[#4F46E5]">📌 기부금 공제 한도</div>
              <div className="space-y-1 text-slate-700 leading-relaxed">
                <div>1. 공제 대상 : 거주자 본인 및 기본공제 부양가족(나이의 제한을 받지 않음)의 기부금</div>
                <div>2. 본인한정 : 조특법상 '정치자금기부금'과 '우리사주조합기부금'은 본인 지출분만 공제 가능</div>
                <div className="text-[10.5px] text-slate-500 pt-0.5">※ 기부금은 근무기간과 관계없이 연간 기부금액을 기준으로 계산됩니다.</div>
              </div>
            </div>
          </div>

          {/* 하단 고정 액션 바: [ 저장 ] 또는 [ 수정 ] (첨부 이미지 3 & 4 스펙) */}
          <div className="p-4 bg-white border-t border-slate-100">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              {editingDonItemId ? '수정' : '저장'}
            </button>
          </div>
        </form>
      )}

      {/* 기부금 증빙 안내 모달 */}
      {showDonationProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              📎
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">기부금 납입증명서 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                법정·지정·정치자금·종교단체 기부금 세액공제를 받으려면 해당 기부처에서 발행한 기부금 영수증이 필요합니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• <strong>공제 대상</strong>: 근로자 본인 및 기본공제 부양가족(나이제한 없음)</div>
              <div>• <strong>본인 한정</strong>: 정치자금기부금 및 우리사주조합기부금은 본인 지출분만 가능</div>
              <div>• <strong>연간 기준</strong>: 근무기간과 관계없이 1년 전체 기부금액 세액공제 적용</div>
              <div>• <strong>인정 서류</strong>: 기부금 영수증, 기부처 법인설립허가증 또는 고유번호증 사본</div>
              <div>• <strong>간소화자료</strong>: 국세청 제공 간소화자료는 별도 영수증 제출 불필요</div>
              <div>• <strong>공제율</strong>: 1천만원 이하 15%, 1천만원 초과분 30% 세액공제</div>
            </div>
            <button
              type="button"
              onClick={() => setShowDonationProofModal(false)}
              className="w-full py-3 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-[#4338CA] transition"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 신용카드 1. 신용카드 조회 화면 (card_view)                                  */}
      {/* ========================================================================= */}
      {viewMode === 'card_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 신용카드등조회 + [AI✦] 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">신용카드등조회</span>
            </button>

            <div className="flex items-center gap-2">
              {/* AI 버튼 (클릭 시 신용카드 등 절세팁/구비서류 가이드 화면 이동) */}
              <button
                type="button"
                onClick={() => {
                  setGuideCategory('card');
                  setGuideActiveTab('about');
                  setGuideReturnMode('card_view');
                  setViewMode('deduction_guide');
                }}
                className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
                title="AI 공제 가이드 (절세팁·구비서류)"
              >
                <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
                <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
              </button>
            </div>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 파란색 그라데이션 히어로 카드 */}
            <div className="w-full bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tracking-tight">신용카드 등 합계</span>
                  <span
                    onClick={() => {
                      setGuideCategory('card');
                      setGuideActiveTab('about');
                      setGuideReturnMode('card_view');
                      setViewMode('deduction_guide');
                    }}
                    className="w-4 h-4 rounded-full border border-white/70 text-white/90 text-[10px] flex items-center justify-center cursor-pointer hover:bg-white/20 transition"
                    title="신용카드 등 소득공제 안내"
                  >
                    ⓘ
                  </span>
                </div>
                {/* 📎 증빙 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowCardProofModal(true)}
                  className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition cursor-pointer flex items-center gap-1 border border-white/30 shadow-2xs"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>

              {/* 가로 구분선 */}
              <div className="border-t border-white/20 pt-1" />

              {/* 금액 상세 목록 */}
              <div className="space-y-1.5">
                {/* 💳 신용카드 등 합계 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white/90">💳</span>
                    <span className="text-sm font-semibold tracking-tight">신용카드 등 합계</span>
                  </div>
                  <span className="text-base font-bold font-mono tracking-tight">
                    {totalCardAmount.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 신용카드 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>신용카드</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalCreditCard.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 직불·체크카드 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>직불·체크카드</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalDebitCard.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 현금영수증 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>현금영수증</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalCashReceipt.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 전통시장 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>전통시장</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalMarketCard.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 대중교통 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>대중교통</span>
                  </div>
                  <span className="font-mono font-medium">
                    {totalTransitCard.toLocaleString()}원
                  </span>
                </div>

                {/* ㄴ 문화체육 */}
                <div className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-indigo-200">ㄴ</span>
                    <span>문화체육</span>
                    {workerTotalSalary > 70000000 && (
                      <span className="text-[10px] text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded font-sans">
                        총급여 7천만원 초과 (각 결제수단에 합산)
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-medium">
                    {totalCultureCard.toLocaleString()}원
                  </span>
                </div>
              </div>
            </div>

            {/* 국세청자료/기타자료 또는 빈 상태 */}
            {cardItems.length === 0 ? (
              <EmptyDeductionState
                onAdd={handleOpenAddCard}
                addText="+ 자료입력"
              />
            ) : (
              <>
                {/* 국세청자료 섹션 (부양가족별 아코디언 카드) */}
                {cardItems.filter((i) => i.isNts).length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>

                    {/* 부양가족별 그룹핑 렌더링 */}
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          cardItems
                            .filter((i) => i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName) => {
                        const memberItems = cardItems.filter(
                          (i) => i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const memberTotal = memberItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                        const isExpanded = !!expandedCardMembers[`nts_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            {/* 아코디언 헤더 */}
                            <button
                              type="button"
                              onClick={() => toggleCardMemberAccordion(`nts_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역: 카드 유형만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((item, idx) => (
                                  <div
                                    key={item.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">
                                      {item.type || '신용카드'}
                                    </span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(item.amount || 0).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 기타자료 섹션 (부양가족별 아코디언 카드) */}
                {cardItems.filter((i) => !i.isNts).length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-semibold text-slate-400">기타자료</div>

                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          cardItems
                            .filter((i) => !i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName) => {
                        const memberItems = cardItems.filter(
                          (i) => !i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const memberTotal = memberItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                        const isExpanded = !!expandedCardMembers[`other_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-indigo-200/90 hover:border-indigo-300'
                            }`}
                          >
                            {/* 아코디언 헤더 */}
                            <button
                              type="button"
                              onClick={() => toggleCardMemberAccordion(`other_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {memberTotal.toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역: 카드 유형만 간단히 표기 (요구사항 2) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((item, idx) => (
                                  <div
                                    key={item.id || idx}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">
                                      {item.type || '신용카드'}
                                    </span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(item.amount || 0).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 하단 버튼 2종: 목록보기 / 자료 수정/추가 (동일한 50:50 크기 flex-1) */}
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="flex-1 py-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer text-center"
              >
                목록보기
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card_edit')}
                className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
              >
                자료 수정/추가
              </button>
            </div>
          </div>

          <div className="p-4" />
        </div>
      )}

            {/* ========================================================================= */}
      {/* 신용카드 2. 신용카드 수정 화면 (card_edit)                                  */}
      {/* ========================================================================= */}
      {viewMode === 'card_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ✕ 신용카드 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('card_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">신용카드 수정</span>
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                신용카드<br />
                자료를 수정하세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                신용카드 수정 및 추가에 필요한 정보를 확인하세요.
              </p>
              {workerTotalSalary > 70000000 && (
                <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <span className="text-amber-500 font-bold shrink-0">ℹ️</span>
                  <span className="leading-relaxed">
                    <strong>총급여 7천만원 초과자 안내:</strong> 연말정산간소화 자료의 문화체육 사용금액은 각각 신용카드, 직불·체크카드, 현금영수증 사용금액에 자동 합산되어 집계됩니다.
                  </span>
                </div>
              )}
            </div>

            {/* 항목 리스트 */}
            <div className="space-y-4 pt-1">
              {/* 국세청자료 */}
              {cardItems.filter((item) => item.isNts).length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-800">국세청자료</div>
                  <div className="space-y-3">
                    {cardItems
                      .filter((item) => item.isNts)
                      .map((item) => {
                        const cleanName = (item.name || '').replace(/\(.*?\)/g, '').trim();
                        return (
                          <div
                            key={item.id}
                            className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                          >
                            <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                  {cleanName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleEditCardItem(item)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                  title="수정"
                                >
                                  <span>수정</span>
                                  <span className="text-[10px]">✎</span>
                                </button>
                              </div>
                              {/* 인별 상세내용에 카드 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '신용카드'}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                {Number(item.amount || 0).toLocaleString()}원
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteCardItem(item.id)}
                                className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                                title="삭제"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 기타자료 */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-slate-800">기타자료</div>
                <div className="space-y-3">
                  {cardItems.filter((item) => !item.isNts).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      직접 등록한 기타자료가 없습니다. 아래 버튼으로 추가해주세요.
                    </div>
                  ) : (
                    cardItems
                      .filter((item) => !item.isNts)
                      .map((item) => {
                        const cleanName = (item.name || '').replace(/\(.*?\)/g, '').trim();
                        return (
                          <div
                            key={item.id}
                            className="w-full bg-white rounded-2xl border border-indigo-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                          >
                            <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                  {cleanName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleEditCardItem(item)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                  title="수정"
                                >
                                  <span>수정</span>
                                  <span className="text-[10px]">✎</span>
                                </button>
                              </div>
                              {/* 인별 상세내용에 카드 구분만 표기 (요구사항 3) */}
                              <div className="text-[13px] font-medium text-slate-600 leading-normal">
                                {item.type || '신용카드'}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                {Number(item.amount || 0).toLocaleString()}원
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteCardItem(item.id)}
                                className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                                title="삭제"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* [ 수정/추가 완료 ] + [ 기타자료 추가 ] 버튼 (동일한 50:50 크기 flex-1) */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('card_view')}
                  className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
                >
                  수정/추가 완료
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddCard()}
                  className="flex-1 py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>기타자료 추가</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-4" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 신용카드 3. 신용카드 추가/수정 화면 (card_add)                               */}
      {/* ========================================================================= */}
      {viewMode === 'card_add' && (
        <form onSubmit={handleSaveCardItem} className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 신용카드 추가 / 신용카드 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('card_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingCardItemId ? '신용카드 수정' : '신용카드 추가'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowCardProofModal(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 text-sm border border-slate-200"
              title="신용카드 안내"
            >
              ⓘ
            </button>
          </div>

          {/* 본문 폼 스크롤 영역 */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                {editingCardItemId ? (
                  <>
                    신용카드 자료를<br />
                    수정하세요.
                  </>
                ) : (
                  <>
                    신용카드 기타자료를<br />
                    입력하세요.
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                {editingCardItemId ? (
                  <>
                    신용카드 수정에 필요한 정보를 모두 입력해주세요.
                  </>
                ) : (
                  <>
                    신용카드 추가에 필요한 정보를 모두 입력해주세요.<br />
                  </>
                )}
              </p>
            </div>

            {/* 입력 폼 필드 카드 */}
            <div className="space-y-4 pt-1">
              {/* 1. 성명* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  성명<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formCardName}
                    onChange={(e) => handleCardNameChange(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    {familyMembers.map((m) => {
                      const cleanMemberName = (m.name || '').replace(/\(.*?\)/g, '').trim();
                      const rel = m.relation || (m.isSelf ? '본인' : '');
                      const isSibling = rel.includes('형제') || rel.includes('자매');
                      return (
                        <option key={m.id} value={cleanMemberName}>
                          {cleanMemberName} {rel ? `(${rel}${isSibling ? ' - 공제제외' : ''})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 2. 카드 유형* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  카드 유형<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formCardType}
                    onChange={(e) => handleCardTypeChange(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="신용카드">신용카드</option>
                    <option value="직불·체크카드">직불·체크카드</option>
                    <option value="현금영수증">현금영수증</option>
                    {workerTotalSalary <= 70000000 && (
                      <option value="문화체육">문화체육</option>
                    )}
                    <option value="전통시장">전통시장</option>
                    <option value="대중교통">대중교통</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 3. 카드사/발급처* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  카드사/발급처<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formCardCompany}
                  onChange={(e) => setFormCardCompany(e.target.value)}
                  placeholder="예: 현대카드, 신한카드, 국세청 등"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 4. 사용금액* */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  사용금액<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formCardAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setFormCardAmount(raw ? Number(raw).toLocaleString() : '');
                  }}
                  placeholder="0"
                  className="w-full text-base font-bold font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 안내 문구 박스 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed space-y-1">
                <div className="font-semibold text-slate-700">• 신용카드 등 공제 유의사항</div>
                <div>- 총급여의 25% 초과분에 대해 공제율(신용카드 15%, 체크카드·현금영수증 30%)이 적용됩니다.</div>
                <div>- 신차구입, 세금/공과금, 상품권 구입 등은 공제 대상에서 제외됩니다.</div>
              </div>
            </div>
          </div>

          {/* 하단 저장 버튼 */}
          <div className="p-5 border-t border-slate-100 bg-white sticky bottom-0">
            <button
              type="submit"
              className="w-full py-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-tight shadow-md transition cursor-pointer active:scale-[0.99]"
            >
              저장
            </button>
          </div>
        </form>
      )}

      {/* 신용카드 증빙 모달 */}
      {showCardProofModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] mx-auto flex items-center justify-center text-2xl">
              💳
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">신용카드 등 소득공제 증빙</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                국세청 연말정산 간소화 서비스에서 조회되지 않는 카드 사용내역은 해당 카드사에서 발급하는 '신용카드 등 사용금액 확인서'를 제출해야 합니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-left text-[11px] text-slate-600 space-y-1">
              <div>• 인정 서류: 신용카드·체크카드 등 사용금액 확인서</div>
              <div>• 간소화자료: 국세청 간소화 서비스 반영 내역은 별도 제출 불필요</div>
              <div>• 공제율: 신용카드 15%, 체크카드·현금영수증·문화체육 30%, 전통시장·대중교통 40%</div>
            </div>
            <button
              type="button"
              onClick={() => setShowCardProofModal(false)}
              className="w-full py-3 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-[#4338CA] transition"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 의료비 조회 화면 (첨부 이미지 3 & 4 스펙 100% 일치)                         */}
      {/* ========================================================================= */}
      {viewMode === 'medical_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 의료비 조회 + [AI+] 아이콘 버튼 + 도움말 아이콘 (이미지 3·4) */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">의료비 조회</span>
            </button>

            <div className="flex items-center gap-2">
              {/* AI 아이콘 버튼: 의료비 공제 가이드 이동 */}
              <button
                type="button"
                onClick={() => {
                  setGuideCategory('medical');
                  setGuideActiveTab('about');
                  setGuideReturnMode('medical_view');
                  setViewMode('deduction_guide');
                }}
                className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
                title="의료비 AI 공제 가이드 (절세팁·구비서류)"
              >
                <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
                <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
              </button>
            </div>
          </div>

          {/* 본문 콘텐츠 (이미지 3·4 레이아웃) */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 파란색 그라데이션 히어로 카드 (첨부 이미지 3·4 스펙) */}
            <div className="w-full bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] rounded-2xl p-5 text-white shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏥</span>
                  <span className="text-sm font-bold">의료비</span>
                </div>
                {/* 📎 증빙 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowProofModal(true)}
                  className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition cursor-pointer flex items-center gap-1 border border-white/30 shadow-2xs"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>

              {/* 합계금액 */}
              <div className="flex items-baseline justify-between pt-1 border-b border-white/20 pb-3">
                <span className="text-xs text-indigo-100 font-medium">합계금액</span>
                <span className="text-2xl font-black font-mono tracking-tight">
                   {totalMedicalAmount.toLocaleString()} <span className="text-base font-bold">{"원"}</span>
                </span>
              </div>

              {/* 의료비 종류별 합계금액 */}
              <div className="space-y-1.5 pt-1">
                {medicalTypeTotals.map(([typeKey, amt]) => (
                  <div key={typeKey} className="flex items-center justify-between text-indigo-100/90 text-xs pl-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-indigo-200">ㄴ</span>
                      <span>{typeKey}</span>
                    </div>
                    <span className="font-mono font-medium text-white">
                      {Number(amt).toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 국세청자료/기타자료 또는 빈 상태 */}
            {medicalItems.length === 0 ? (
              <EmptyDeductionState
                onAdd={handleOpenAdd}
                addText="+ 자료입력"
              />
            ) : (
              <div className="space-y-4 pt-1">
                {/* 1. 국세청자료 섹션 */}
                {medicalItems.filter((item) => item.isNts).length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          medicalItems
                            .filter((i) => i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName, memberIdx) => {
                        const memberItems = medicalItems.filter(
                          (i) => i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const { typeMap, memberTotal } = getMemberMedicalSummary(memberItems);
                        const isExpanded = !!expandedMedicalMembers[memberName];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleMedicalMemberAccordion(memberName)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {Math.max(0, memberTotal).toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역 (의료비 종류만 간단히 표기) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {Object.entries(typeMap).map(([typeKey, amt]) => (
                                  <div
                                    key={typeKey}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">{typeKey}</span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(amt).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. 기타자료 섹션 */}
                {medicalItems.some((item) => !item.isNts) && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-semibold text-slate-400">기타자료</div>
                    <div className="space-y-2.5">
                      {Array.from(
                        new Set(
                          medicalItems
                            .filter((i) => !i.isNts)
                            .map((i) => (i.name || '').replace(/\(.*?\)/g, '').trim())
                        )
                      ).map((memberName, memberIdx) => {
                        const memberItems = medicalItems.filter(
                          (i) => !i.isNts && (i.name || '').replace(/\(.*?\)/g, '').trim() === memberName
                        );
                        const { typeMap, memberTotal } = getMemberMedicalSummary(memberItems);
                        const isExpanded = !!expandedOtherMedicalMembers[memberName];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-indigo-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleOtherMedicalMemberAccordion(memberName)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                  {Math.max(0, memberTotal).toLocaleString()}원
                                </span>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 펼침 상세 내역 (의료비 종류만 간단히 표기, 수정/삭제 버튼 삭제) */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2">
                                {Object.entries(typeMap).map(([typeKey, amt]) => (
                                  <div
                                    key={typeKey}
                                    className="flex items-center justify-between py-1.5 text-xs"
                                  >
                                    <span className="font-medium text-slate-600">{typeKey}</span>
                                    <span className="font-bold font-mono text-slate-900 text-[13px]">
                                      {Number(amt).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 하단 고정 액션 바: [ 목록보기 ] [ 자료 수정/추가 ] (동일한 크기 flex-1 적용) */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm tracking-wide shadow-2xs transition cursor-pointer text-center"
            >
              목록보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('medical_edit')}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              자료 수정/추가
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. 의료비 수정 화면 (첨부 이미지 1 스펙 100% 일치)                               */}
      {/* ========================================================================= */}
      {viewMode === 'medical_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ✕ 의료비 수정 (이미지 1) */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('medical_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">의료비 수정</span>
            </button>
          </div>

          {/* 본문 콘텐츠 (첨부 이미지 1 스펙 100% 일치) */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                의료비 자료를<br />
                추가 또는 변경해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 등록된 의료비 항목 리스트 */}
            <div className="space-y-4">
              {/* 국세청자료 */}
              {medicalItems.some((item) => item.isNts) && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-800">국세청자료</div>
                  <div className="space-y-3">
                    {medicalItems
                      .filter((item) => item.isNts)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {(item.name || '').replace(/\(.*?\)/g, '').trim()}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-normal">
                              {item.type || '일반의료비'}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-base font-bold font-mono tracking-tight ${getMedicalItemDisplayAmount(item) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              {getMedicalItemDisplayAmount(item).toLocaleString()}원
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedicalItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 기타자료 */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-slate-800">기타자료</div>
                <div className="space-y-3">
                  {medicalItems.filter((item) => !item.isNts).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      직접 등록한 기타자료가 없습니다. 아래 버튼으로 추가해주세요.
                    </div>
                  ) : (
                    medicalItems
                      .filter((item) => !item.isNts)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="w-full bg-white rounded-2xl border border-indigo-200/90 p-5 flex items-center justify-between shadow-2xs hover:border-indigo-400 hover:shadow-xs transition group"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-bold text-slate-900 leading-tight">
                                {(item.name || '').replace(/\(.*?\)/g, '').trim()}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="수정"
                              >
                                <span>수정</span>
                                <span className="text-[10px]">✎</span>
                              </button>
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-normal">
                              {item.type || '일반의료비'}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-base font-bold font-mono tracking-tight ${getMedicalItemDisplayAmount(item) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              {getMedicalItemDisplayAmount(item).toLocaleString()}원
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedicalItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

              {/* [ 수정/추가 완료 ] + [ 기타자료 추가 ] 버튼 */}
              <div className="pt-1 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('medical_view')}
                  className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
                >
                  수정/추가 완료
                </button>
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="flex-1 py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>기타자료 추가</span>
                </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. 의료비 추가 및 수정 화면 (첨부 이미지 2, 3, 4, 5 스펙 100% 일치)            */}
      {/* ========================================================================= */}
      {viewMode === 'medical_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ✕ 의료비 추가 (이미지 2, 4) */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('medical_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingItemId ? '의료비 수정' : '의료비 추가'}
              </span>
            </button>
          </div>

          {/* 본문 콘텐츠 (첨부 이미지 3·4·5 레이아웃) */}
          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                의료비 기타자료를<br />
                입력하세요.
              </h2>
              <p className="text-[11.5px] text-slate-400 mt-2 font-medium leading-relaxed">
                의료비 추가에 필요한 정보를 모두 입력해주세요.<br />
                (안경 또는 콘텍트렌즈는 인당 50만원, 산후조리원 비용은 회당 200만원 한도로 적용됩니다.)<br />
              </p>
            </div>

            {/* 입력 폼 필드 카드 (이미지 3·4·5 스펙) */}
            <form onSubmit={handleSaveMedical} className="space-y-4 pt-1">
              {/* 1. 성명* 드롭다운 (본인/부양가족 표기 제거) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  성명<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formFamilyName}
                    onChange={(e) => setFormFamilyName(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    {familyMembers.map((m) => {
                      const cleanMemberName = (m.name || '').replace(/\(.*?\)/g, '').trim();
                      return (
                        <option key={m.id} value={cleanMemberName}>
                          {cleanMemberName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 2. 의료비 종류* 드롭다운 */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  의료비 종류<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formMedicalType}
                    onChange={(e) => setFormMedicalType(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="일반의료비">일반의료비 (700만원 한도)</option>
                    <option value="65세 이상·6세 이하·장애인·건강보험산정특례자 의료비">65세 이상·6세 이하·장애인·건강보험산정특례자 의료비 (한도 없음)</option>
                    <option value="미숙아·선천성이상아 의료비">미숙아·선천성이상아 의료비 (한도 없음)</option>
                    <option value="난임시술비">난임시술비 (한도 없음)</option>
                    <option value="안경 또는 콘텍트렌즈 구입비용">안경 또는 콘텍트렌즈 구입비용 (인당 50만원 한도)</option>
                    <option value="산후조리원 비용">산후조리원 비용 (회당 200만원 한도)</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 3. 의료기관 상호* (비워둠) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  의료기관 상호<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formHospitalName}
                  onChange={(e) => setFormHospitalName(e.target.value)}
                  placeholder=""
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                />
              </div>

              {/* 4. 의료기관 사업자번호(-)제외* (비워둠) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  의료기관 사업자번호(-)제외<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formBizNumber}
                  onChange={(e) => setFormBizNumber(e.target.value)}
                  placeholder=""
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                />
              </div>

              {/* 5. 의료증빙코드* 드롭다운 (보험료 추가 화면과 동일한 드롭다운 형식) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  의료증빙코드<span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formProofCode}
                    onChange={(e) => setFormProofCode(e.target.value)}
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none appearance-none pr-8 cursor-pointer"
                  >
                    <option value="기타">기타</option>
                    <option value="국세청장 자료">국세청장 자료</option>
                    <option value="진료비(약제비) 납입확인서">진료비(약제비) 납입확인서</option>
                    <option value="장기요양급여비용 명세서">장기요양급여비용 명세서</option>
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ∨
                  </div>
                </div>
              </div>

              {/* 6. 건수* (비워둠) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  건수<span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    value={formCount}
                    onChange={(e) => setFormCount(e.target.value)}
                    placeholder=""
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">건</span>
                </div>
              </div>

              {/* 7. 의료비 지출액* (비워둠) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  의료비 지출액<span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={formAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setFormAmount(val ? Number(val).toLocaleString() : '');
                    }}
                    placeholder=""
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                </div>
              </div>

              {/* 8. 실손의료보험금 (비워둠) */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500">
                  실손의료보험금
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={formInsuranceAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setFormInsuranceAmount(val ? Number(val).toLocaleString() : '');
                    }}
                    placeholder=""
                    className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 font-mono"
                  />
                  <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">원</span>
                </div>
              </div>

              {/* 저장 버튼 (유효성에 따라 파란색 활성화) */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={!formFamilyName || !formMedicalType || !formAmount}
                  className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition shadow-xs text-center ${
                    formFamilyName && formMedicalType && formAmount
                      ? 'bg-[#4F46E5] hover:bg-[#4338CA] text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  저장
                </button>
              </div>
            </form>
          </div>

          {/* ========================================================================= */}
          {/* MODAL: 부양가족 선택 바텀시트                                              */}
          {/* ========================================================================= */}
          {showFamilyBottomSheet && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0">
              <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    부양가족
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowFamilyBottomSheet(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* 부양가족 선택 리스트 */}
                <div className="space-y-1 pt-1 max-h-64 overflow-y-auto">
                  {familyMembers.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => {
                        setFormFamilyName(member.name);
                        setShowFamilyBottomSheet(false);
                      }}
                      className="w-full py-3 px-3 rounded-xl hover:bg-indigo-50 text-slate-800 text-sm font-semibold flex items-center justify-between cursor-pointer transition"
                    >
                      <span>{member.name}</span>
                      <span className="text-xs text-slate-400 font-medium">
                        {member.relation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODAL: 의료비 종류 바텀시트 (첨부 이미지 2 스펙 100% 일치)                     */}
          {/* ========================================================================= */}
          {showMedicalTypeBottomSheet && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0">
              <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    의료비 종류
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowMedicalTypeBottomSheet(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* 의료비 종류 4종 목록 (첨부 이미지 2 스펙 100% 일치) */}
                <div className="space-y-2 pt-1">
                  {/* 1. 일반 의료비 */}
                  <div
                    onClick={() => {
                      setFormMedicalType('일반 의료비');
                      setShowMedicalTypeBottomSheet(false);
                    }}
                    className="w-full py-3 px-3 rounded-xl hover:bg-indigo-50 text-[#4F46E5] text-sm font-bold flex items-center justify-between cursor-pointer transition"
                  >
                    <span>일반 의료비</span>
                  </div>

                  {/* 2. 시력보정용 안경·콘텍트렌즈 (인당 50만원 한도) */}
                  <div
                    onClick={() => {
                      setFormMedicalType('시력보정용 안경·콘텍트렌즈');
                      setShowMedicalTypeBottomSheet(false);
                    }}
                    className="w-full py-3 px-3 rounded-xl hover:bg-indigo-50 text-[#4F46E5] text-sm font-bold flex items-center justify-between cursor-pointer transition"
                  >
                    <span>시력보정용 안경·콘텍트렌즈</span>
                    <span className="text-[11px] font-semibold bg-[#F1F3F5] text-slate-500 px-2 py-0.5 rounded-md">
                      인당 50만원 한도
                    </span>
                  </div>

                  {/* 3. 산후조리원 (출산 1회당 200만원 한도) */}
                  <div
                    onClick={() => {
                      setFormMedicalType('산후조리원');
                      setShowMedicalTypeBottomSheet(false);
                    }}
                    className="w-full py-3 px-3 rounded-xl hover:bg-indigo-50 text-[#4F46E5] text-sm font-bold flex items-center justify-between cursor-pointer transition"
                  >
                    <span>산후조리원</span>
                    <span className="text-[11px] font-semibold bg-[#F1F3F5] text-slate-500 px-2 py-0.5 rounded-md">
                      출산 1회당 200만원 한도
                    </span>
                  </div>

                  {/* 4. 난임시술비 */}
                  <div
                    onClick={() => {
                      setFormMedicalType('난임시술비');
                      setShowMedicalTypeBottomSheet(false);
                    }}
                    className="w-full py-3 px-3 rounded-xl hover:bg-indigo-50 text-[#4F46E5] text-sm font-bold flex items-center justify-between cursor-pointer transition"
                  >
                    <span>난임시술비</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODAL: 의료증빙코드 바텀시트                                               */}
          {/* ========================================================================= */}
          {showProofCodeBottomSheet && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0">
              <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    의료증빙코드
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowProofCodeBottomSheet(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  {['기타', '국세청장 자료', '진료비(약제비) 납입확인서', '장기요양급여비용 명세서'].map((code) => (
                    <div
                      key={code}
                      onClick={() => {
                        setFormProofCode(code);
                        setShowProofCodeBottomSheet(false);
                      }}
                      className="w-full py-3 px-3 rounded-xl hover:bg-indigo-50 text-slate-800 text-sm font-semibold cursor-pointer transition flex items-center justify-between"
                    >
                      <span>{code}</span>
                      {formProofCode === code && <span className="text-[#4F46E5] font-bold">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. 월세액 조회 화면 (첨부 이미지 4 스펙 100% 일치)                           */}
      {/* ========================================================================= */}
      {viewMode === 'rent_view' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← 월세액 조회 + [AI+] 버튼 + 도움말 버튼 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">월세액 조회</span>
            </button>

            <div className="flex items-center gap-2">
              {/* AI 버튼: 월세액 공제 가이드 이동 */}
              <button
                type="button"
                onClick={() => {
                  setGuideCategory('rent');
                  setGuideActiveTab('about');
                  setGuideReturnMode('rent_view');
                  setViewMode('deduction_guide');
                }}
                className="w-8 h-8 rounded-xl border-2 border-slate-200 hover:border-indigo-400 bg-white flex items-center justify-center text-slate-700 hover:text-[#4F46E5] transition cursor-pointer shadow-2xs relative group"
                title="월세액 AI 공제 가이드 (절세팁·구비서류)"
              >
                <span className="text-[11px] font-black text-slate-800 group-hover:text-[#4F46E5]">AI</span>
                <span className="text-[8px] text-[#6366F1] -mt-2">✦</span>
              </button>
            </div>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 체크리스트 안내 배너 (첨부 이미지 1 스펙 100% 매칭) */}
            <div className="bg-[#EBF3FE] border border-indigo-100/80 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div>
                <div className="flex items-center gap-1.5">
                  {rentChecklistAnswer === 'yes' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      ✓
                    </span>
                  )}
                  <div className="font-bold text-[13px] text-slate-800 leading-snug">
                    {rentChecklistAnswer === 'yes' ? '월세액 세액공제 요건 충족' : '월세액공제를 받을 예정이신가요?'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('rent_checklist')}
                  className="mt-2 py-1 px-3 rounded-lg bg-white border border-[#A5CBFB] text-[#4F46E5] text-[11.5px] font-bold shadow-2xs hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1"
                >
                  <span>{rentChecklistAnswer === 'yes' ? '체크리스트 재확인' : '체크리스트 진행하기'}</span>
                  <span className="text-[10px]">›</span>
                </button>
              </div>
              {/* 첨부 이미지 1의 2D 집 & 문서 일러스트 */}
              <div className="w-16 h-14 flex items-center justify-center">
                <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
                  {/* 문서 (좌측) */}
                  <rect x="2" y="14" width="22" height="28" rx="2" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
                  <line x1="6" y1="20" x2="18" y2="20" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="6" y1="26" x2="16" y2="26" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="6" y1="31" x2="13" y2="31" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
                  {/* 파란 지붕 주택 (우측) */}
                  <path d="M25 21L45 6L63 21" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="#DBEAFE" />
                  <rect x="29" y="20" width="30" height="24" rx="2.5" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.2" />
                  <rect x="34" y="25" width="7" height="7" rx="1.5" fill="#93C5FD" />
                  <rect x="46" y="25" width="8" height="19" rx="1.5" fill="#2563EB" />
                  <circle cx="56" cy="40" r="3" fill="#10B981" />
                </svg>
              </div>
            </div>

            {/* 월세액 세액공제 명세 히어로 카드 (첨부 이미지 1 스펙 100% 매칭 - 좌우 충분한 패딩으로 글자 잘림 방지) */}
            <div className={`w-full ${totalRentAmount > 0 ? 'bg-gradient-to-r from-[#4338CA] via-[#4F46E5] to-[#7C3AED] p-5 space-y-4' : 'bg-[#4F46E5] px-5 py-4 flex items-center justify-between'} rounded-2xl text-white shadow-md transition-all`}>
              <div className="flex items-center justify-between w-full">
                <span className="text-[15px] font-bold tracking-tight">월세액 세액공제 명세</span>
                <button
                  type="button"
                  onClick={() => setShowRentProofModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#3D78E8] hover:bg-[#346EDD] text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>

              {totalRentAmount > 0 && (
                <>
                  <div className="flex items-baseline justify-between pt-1 border-b border-white/20 pb-4">
                    <div>
                      <span className="text-xs text-indigo-100 font-medium">공제대상금액(한도적용)</span>
                      {totalRentAmount > totalRentLimitAmount && (
                        <div className="text-[11px] text-amber-200 mt-0.5 font-normal">
                          {hasMortgageLoanDeduction
                            ? '(장기주택저당차입금 공제 적용으로 전액 공제 제외)'
                            : workerTotalSalary > 80000000
                            ? '(총급여 8,000만원 초과로 전액 공제 제외)'
                            : `(총 지출액 ${totalRentAmount.toLocaleString()}원 중 1,000만원 한도)`}
                        </div>
                      )}
                    </div>
                    <span className="text-2xl font-black font-mono tracking-tight">
                      {totalRentLimitAmount.toLocaleString()} <span className="text-base font-bold">원</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-center text-xs text-indigo-100 font-medium cursor-pointer hover:text-white transition">
                    <span>자세히보기</span>
                    <span className="text-[10px] ml-1">∨</span>
                  </div>
                </>
              )}
            </div>

            {/* 데이터 유무에 따른 분기: 등록된 자료 목록 vs 빈 상태 그래픽 (첨부 이미지 규격) */}
            {rentItems.length === 0 ? (
              <EmptyDeductionState
                onAdd={() => {
                  if (rentChecklistAnswer !== 'yes') {
                    setShowRentChecklistNoticeModal(true);
                  } else {
                    handleOpenAddRent();
                  }
                }}
                addText="+ 자료입력"
              />
            ) : (
              <div className="space-y-4 pt-1">
                {/* 국세청자료 인별 아코디언 목록 */}
                {rentNtsMembers.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold text-slate-400">국세청자료</div>
                    <div className="space-y-2.5">
                      {rentNtsMembers.map((memberName) => {
                        const memberItems = rentItems.filter(
                          (i) => (i.source === 'nts' || i.isNts) && ((i.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim() === memberName || rentNtsMembers.length === 1)
                        );
                        const memberLimitTotal = memberItems.reduce(
                          (acc, it) => acc + (rentLimitDisplayMap[it.id] ?? (Number(it.amount) || 0)),
                          0
                        );
                        const memberRawTotal = memberItems.reduce(
                          (acc, it) => acc + (Number(it.amount) || 0),
                          0
                        );
                        const isExpanded = !!rentExpandedIds[`view_nts_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleRentAccordion(`view_nts_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col items-end">
                                  <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                    {memberLimitTotal.toLocaleString()}원
                                  </span>
                                  {memberRawTotal > memberLimitTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      {workerTotalSalary > 80000000
                                        ? '(총급여 8천만원 초과 제외)'
                                        : `(지출 ${memberRawTotal.toLocaleString()}원)`}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 클릭 시 상세내역 없이 임대인만 간단히 표기 */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it) => (
                                  <div
                                    key={it.id}
                                    className="flex items-center justify-between py-1.5 text-xs text-slate-700 font-medium border-b border-slate-100/80 last:border-0"
                                  >
                                    <span className="font-semibold text-slate-800">
                                      {it.landlord || '임대인'}
                                    </span>
                                    <span className="font-mono font-bold text-slate-900">
                                      {(rentLimitDisplayMap[it.id] ?? (Number(it.amount) || 0)).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 기타자료 인별 아코디언 목록 */}
                {rentOtherMembers.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-semibold text-slate-400">기타자료</div>
                    <div className="space-y-2.5">
                      {rentOtherMembers.map((memberName) => {
                        const memberItems = rentItems.filter(
                          (i) => i.source !== 'nts' && !i.isNts && ((i.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim() === memberName || rentOtherMembers.length === 1)
                        );
                        const memberLimitTotal = memberItems.reduce(
                          (acc, it) => acc + (rentLimitDisplayMap[it.id] ?? (Number(it.amount) || 0)),
                          0
                        );
                        const memberRawTotal = memberItems.reduce(
                          (acc, it) => acc + (Number(it.amount) || 0),
                          0
                        );
                        const isExpanded = !!rentExpandedIds[`view_other_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleRentAccordion(`view_other_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col items-end">
                                  <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                    {memberLimitTotal.toLocaleString()}원
                                  </span>
                                  {memberRawTotal > memberLimitTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      (지출 {memberRawTotal.toLocaleString()}원)
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 클릭 시 상세내역 없이 임대인만 간단히 표기 */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((it) => (
                                  <div
                                    key={it.id}
                                    className="flex items-center justify-between py-1.5 text-xs text-slate-700 font-medium border-b border-slate-100/80 last:border-0"
                                  >
                                    <span className="font-semibold text-slate-800">
                                      {it.landlord || '임대인'}
                                    </span>
                                    <span className="font-mono font-bold text-slate-900">
                                      {(rentLimitDisplayMap[it.id] ?? (Number(it.amount) || 0)).toLocaleString()}원
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 하단 고정 액션 바: [ 목록보기 ] [ 자료 수정/추가 ] (동일한 크기 flex-1 적용) */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm tracking-wide shadow-2xs transition cursor-pointer text-center"
            >
              목록보기
            </button>
            <button
              type="button"
              onClick={() => {
                if (rentChecklistAnswer !== 'yes') {
                  setShowRentChecklistNoticeModal(true);
                } else {
                  setViewMode('rent_edit');
                }
              }}
              className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              자료 수정/추가
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. 월세액 수정 화면 (첨부 이미지 1 스펙 100% 일치)                           */}
      {/* ========================================================================= */}
      {viewMode === 'rent_edit' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 월세액 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('rent_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">월세액 수정</span>
            </button>
          </div>

          {/* 본문 콘텐츠 */}
          <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                월세액 자료를<br />
                변경 또는 추가해주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                각 항목을 클릭 시 편집모드로 변경됩니다.
              </p>
            </div>

            {/* 장기주택저당차입금 공제 적용 시 세액공제 불가능 뱃지 및 안내 배너 */}
            {hasMortgageLoanDeduction && (
              <div className="bg-rose-50 border border-rose-200/90 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
                <span className="bg-rose-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shrink-0 mt-0.5 tracking-tight shadow-xs">
                  세액공제 불가능
                </span>
                <div className="space-y-1">
                  <div className="text-[13px] font-bold text-rose-900 tracking-tight">
                    장기주택저당차입금 공제 적용으로 월세액 세액공제 대상 제외
                  </div>
                  <p className="text-xs text-rose-700/90 leading-relaxed font-medium">
                    장기주택저당차입금(주택담보대출) 공제를 받은 경우 주택을 보유한 유주택자에 해당하여, 과세기간 종료일(12.31) 기준 무주택자 요건을 충족하지 못하므로 월세액 세액공제를 받을 수 없습니다. (리스트 공제대상 금액 0원 처리)
                  </p>
                </div>
              </div>
            )}

            {/* 등록된 월세 목록이 있다면 인별 아코디언 박스 표시 (국세청자료 / 기타자료 구분 표기) */}
            {rentItems.length > 0 && (
              <div className="space-y-4">
                {/* 국세청자료 인별 아코디언 */}
                {rentNtsMembers.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-slate-800">국세청자료</div>
                    <div className="space-y-2.5">
                      {rentNtsMembers.map((memberName) => {
                        const memberItems = rentItems.filter(
                          (i) => (i.source === 'nts' || i.isNts) && ((i.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim() === memberName || rentNtsMembers.length === 1)
                        );
                        const memberLimitTotal = memberItems.reduce(
                          (acc, it) => acc + (rentLimitDisplayMap[it.id] ?? (Number(it.amount) || 0)),
                          0
                        );
                        const memberRawTotal = memberItems.reduce(
                          (acc, it) => acc + (Number(it.amount) || 0),
                          0
                        );
                        const isExpanded = !!rentExpandedIds[`edit_nts_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleRentAccordion(`edit_nts_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-1.5">
                                    {hasMortgageLoanDeduction && (
                                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-1.5 py-0.5 rounded">
                                        공제 불가
                                      </span>
                                    )}
                                    <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                      {memberLimitTotal.toLocaleString()}원
                                    </span>
                                  </div>
                                  {hasMortgageLoanDeduction ? (
                                    <span className="text-[10px] text-rose-600 font-medium">
                                      (장기주택저당차입금 적용 제외 / 지출 {memberRawTotal.toLocaleString()}원)
                                    </span>
                                  ) : memberRawTotal > memberLimitTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      {workerTotalSalary > 80000000
                                        ? '(총급여 8천만원 초과 제외)'
                                        : `(지출 ${memberRawTotal.toLocaleString()}원)`}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 클릭 시 상세내역 없이 임대인만 간단히 표기 + 수정/삭제 */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-2 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((item) => {
                                  const limitAmount = rentLimitDisplayMap[item.id] ?? (Number(item.amount) || 0);
                                  const rawAmount = Number(item.amount) || 0;
                                  return (
                                    <div
                                      key={item.id}
                                      className="w-full bg-white rounded-xl border border-indigo-100 p-3.5 flex items-center justify-between shadow-2xs hover:border-indigo-300 transition"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-900">
                                          {item.landlord || '임대인'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleEditRentItem(item)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                          title="수정"
                                        >
                                          <span>수정</span>
                                          <span className="text-[10px]">✎</span>
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0">
                                        <div className="flex flex-col items-end">
                                          <div className="flex items-center gap-1">
                                            {hasMortgageLoanDeduction && (
                                              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-1 rounded">
                                                공제 불가
                                              </span>
                                            )}
                                            <span className="text-sm font-bold text-slate-900 font-mono tracking-tight">
                                              {limitAmount.toLocaleString()}원
                                            </span>
                                          </div>
                                          {hasMortgageLoanDeduction ? (
                                            <span className="text-[10px] text-rose-600 font-medium">
                                              (지출 {rawAmount.toLocaleString()}원)
                                            </span>
                                          ) : rawAmount > limitAmount && (
                                            <span className="text-[10px] text-amber-600 font-medium">
                                              (지출 {rawAmount.toLocaleString()}원)
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteRentItem(item.id)}
                                          className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                                          title="삭제"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 기타자료 인별 아코디언 */}
                {rentOtherMembers.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-bold text-slate-800">기타자료</div>
                    <div className="space-y-2.5">
                      {rentOtherMembers.map((memberName) => {
                        const memberItems = rentItems.filter(
                          (i) => i.source !== 'nts' && !i.isNts && ((i.name || loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim() === memberName || rentOtherMembers.length === 1)
                        );
                        const memberLimitTotal = memberItems.reduce(
                          (acc, it) => acc + (rentLimitDisplayMap[it.id] ?? (Number(it.amount) || 0)),
                          0
                        );
                        const memberRawTotal = memberItems.reduce(
                          (acc, it) => acc + (Number(it.amount) || 0),
                          0
                        );
                        const isExpanded = !!rentExpandedIds[`edit_other_${memberName}`];

                        return (
                          <div
                            key={memberName}
                            className={`w-full bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                              isExpanded
                                ? 'border-indigo-400 ring-1 ring-indigo-100'
                                : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleRentAccordion(`edit_other_${memberName}`)}
                              className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/50 transition"
                            >
                              <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                                {memberName}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-1.5">
                                    {hasMortgageLoanDeduction && (
                                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-1.5 py-0.5 rounded">
                                        공제 불가
                                      </span>
                                    )}
                                    <span className="text-base font-bold text-slate-900 font-mono tracking-tight">
                                      {memberLimitTotal.toLocaleString()}원
                                    </span>
                                  </div>
                                  {hasMortgageLoanDeduction ? (
                                    <span className="text-[10px] text-rose-600 font-medium">
                                      (장기주택저당차입금 적용 제외 / 지출 {memberRawTotal.toLocaleString()}원)
                                    </span>
                                  ) : memberRawTotal > memberLimitTotal && (
                                    <span className="text-[10px] text-amber-600 font-medium">
                                      {workerTotalSalary > 80000000
                                        ? '(총급여 8천만원 초과 제외)'
                                        : `(지출 ${memberRawTotal.toLocaleString()}원)`}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-slate-400 text-xs transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ∨
                                </span>
                              </div>
                            </button>

                            {/* 아코디언 클릭 시 상세내역 없이 임대인만 간단히 표기 + 수정/삭제 */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-2 space-y-2 border-t border-slate-100 bg-slate-50/50">
                                {memberItems.map((item) => {
                                  const limitAmount = rentLimitDisplayMap[item.id] ?? (Number(item.amount) || 0);
                                  const rawAmount = Number(item.amount) || 0;
                                  return (
                                    <div
                                      key={item.id}
                                      className="w-full bg-white rounded-xl border border-indigo-100 p-3.5 flex items-center justify-between shadow-2xs hover:border-indigo-300 transition"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-900">
                                          {item.landlord || '임대인'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleEditRentItem(item)}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                          title="수정"
                                        >
                                          <span>수정</span>
                                          <span className="text-[10px]">✎</span>
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0">
                                        <div className="flex flex-col items-end">
                                          <div className="flex items-center gap-1">
                                            {hasMortgageLoanDeduction && (
                                              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-1 rounded">
                                                공제 불가
                                              </span>
                                            )}
                                            <span className="text-sm font-bold text-slate-900 font-mono tracking-tight">
                                              {limitAmount.toLocaleString()}원
                                            </span>
                                          </div>
                                          {hasMortgageLoanDeduction ? (
                                            <span className="text-[10px] text-rose-600 font-medium">
                                              (지출 {rawAmount.toLocaleString()}원)
                                            </span>
                                          ) : rawAmount > limitAmount && (
                                            <span className="text-[10px] text-amber-600 font-medium">
                                              (지출 {rawAmount.toLocaleString()}원)
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteRentItem(item.id)}
                                          className="text-slate-300 hover:text-rose-500 p-1 text-base font-normal leading-none cursor-pointer transition rounded-md hover:bg-rose-50 ml-1"
                                          title="삭제"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 하단 버튼: 첨부 이미지 2 스펙 (자료 없을 때는 + 월세액명세 추가 단독, 자료 있을 때는 2단) */}
            {rentItems.length === 0 ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (rentChecklistAnswer !== 'yes') {
                      setShowRentChecklistNoticeModal(true);
                    } else {
                      handleOpenAddRent();
                    }
                  }}
                  className="w-full py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>월세액명세 추가</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('rent_view')}
                  className="flex-1 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs sm:text-[13px] shadow-xs transition cursor-pointer text-center"
                >
                  수정/추가 완료
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (rentChecklistAnswer !== 'yes') {
                      setShowRentChecklistNoticeModal(true);
                    } else {
                      handleOpenAddRent();
                    }
                  }}
                  className="flex-1 py-3.5 rounded-xl border border-indigo-200 bg-white text-[#4F46E5] hover:bg-indigo-50/50 font-bold text-xs sm:text-[13px] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-medium">+</span>
                  <span>월세액명세 추가</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. 월세액 요건 체크리스트 화면 (첨부 이미지 2 & 5 스펙 100% 일치)            */}
      {/* ========================================================================= */}
      {viewMode === 'rent_checklist' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150 relative">
          {/* 상단 헤더: ✕ 월세액 요건 체크리스트 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('rent_view')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">월세액 요건 체크리스트</span>
            </button>
          </div>

          {/* 본문 콘텐츠 (체크1, 체크2, 체크3 - 이미지 2) */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 상단 안내 박스 (이미지 2) */}
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <div className="font-bold text-[#4F46E5] text-[12.5px]">
                ⓘ 월세에 대한 세액공제를 받으시나요?
              </div>
              <p className="text-[11.5px] text-slate-500">
                아래 요건을 모두 충족해야 공제가 가능해요.<br />
                한개라도 충족되지 않으면 아니오를 선택해주세요.
              </p>
            </div>

            {/* 3대 체크 카드 (첨부 이미지 3 스펙 100% 매칭) */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-5 text-xs">
              {/* 체크1 */}
              <div className="space-y-1.5">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크1
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  총급여액 8천만원(종합소득세 7천만원) 이하인 근로자로서<br />
                  근로자 본인이 임차인이고, 2025.12.31 기준 무주택 세대주여야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (단, 세대주가 주택자금 공제를 받지 않은 경우 세대원도 가능, 부양가족이 월세 계약을 체결한 경우도 공제 가능)
                </p>
              </div>

              {/* 체크2 */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크2
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  임차한 주택이 국민주택 규모(약 25.7평) 또는<br />
                  기준 시가 4억 원 이하 주택에 해당돼야 해요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  (주거용 오피스텔, 고시원 포함)
                </p>
              </div>

              {/* 체크3 */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크3
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  임대차 계약서의 주소지와<br />
                  주민등록상 주소지가 동일해야 해요.
                </p>
              </div>

              {/* 체크4 */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <span className="inline-block px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[10px] font-bold">
                  체크4
                </span>
                <p className="font-bold text-slate-900 leading-snug text-[12.5px]">
                  '월세액 세액공제'와 '신용카드등사용금액 소득공제'는<br />
                  중복하여 받을 수 없어요.
                </p>
                <p className="text-[11px] text-slate-400 leading-normal">
                  해당 월세액이 현금영수증 사용액에서 조회되는 경우 '신용카드등사용금액 소득공제' 대상금액에서 이를 차감하고 공제하여야 합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 하단 고정 설문 & 저장 버튼 섹션 (이미지 2 & 5) */}
          <div className="p-4 bg-white border-t border-slate-200 space-y-3">
            {/* 라디오 질문 박스 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">위 요건을 모두 충족하나요?</span>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setRentChecklistAnswer('yes')}
                    className="flex items-center gap-1.5 cursor-pointer text-slate-700 bg-transparent border-none p-0 outline-none"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        rentChecklistAnswer === 'yes' ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {rentChecklistAnswer === 'yes' && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>네</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRentChecklistAnswer('no')}
                    className="flex items-center gap-1.5 cursor-pointer text-slate-700 bg-transparent border-none p-0 outline-none"
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        rentChecklistAnswer === 'no' ? 'border-[#4F46E5] bg-[#4F46E5]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {rentChecklistAnswer === 'no' && <span className="text-[10px] text-white font-bold leading-none">✓</span>}
                    </div>
                    <span>아니오</span>
                  </button>
                </div>
              </div>

              {/* 상태별 피드백 메시지 (이미지 2: 주황, 이미지 5: 빨강) */}
              <div className="pt-0.5 text-[11px] font-semibold">
                {rentChecklistAnswer === null && (
                  <span className="text-amber-500">아직 체크리스트를 진행하지 않았어요.</span>
                )}
                {rentChecklistAnswer === 'yes' && (
                  <span className="text-emerald-600">공제요건을 모두 충족했어요.</span>
                )}
                {rentChecklistAnswer === 'no' && (
                  <span className="text-rose-500">공제요건을 충족하지 못했어요.</span>
                )}
              </div>
            </div>

            {/* 결과 저장하기 버튼 (이미지 5) */}
            <button
              type="button"
              onClick={() => {
                if (rentChecklistAnswer === 'no') {
                  setShowRentIneligibleModal(true);
                } else if (rentChecklistAnswer === 'yes') {
                  // 국세청 PDF 업로드 여부 판정
                  let effData = hometaxData?.summary || hometaxData || null;
                  let hasHometaxPdf = Boolean(hometaxData && (hometaxData.uploaded || hometaxData.hasData || hometaxData.fileName || (Array.isArray(hometaxData.persons) && hometaxData.persons.length > 0)));
                  if (!hasHometaxPdf) {
                    try {
                      const saved = localStorage.getItem('hometax_extracted_data');
                      if (saved) {
                        const parsed = JSON.parse(saved);
                        if (parsed && (parsed.uploaded || parsed.hasData || parsed.fileName || (Array.isArray(parsed?.persons) && parsed.persons.length > 0))) {
                          hasHometaxPdf = true;
                          effData = parsed;
                        }
                      }
                    } catch {}
                  }

                  if (hasHometaxPdf) {
                    // 연말정산 PDF 국세청 자료 즉시 동기화
                    const cleanWorkerName = (loggedInWorkerName || '본인').replace(/\(.*?\)/g, '').trim();
                    if (!effData?.rent_details || effData.rent_details.length === 0) {
                      try {
                        const saved = localStorage.getItem('hometax_extracted_data');
                        if (saved) {
                          const parsed = JSON.parse(saved);
                          if (parsed?.rent_details && parsed.rent_details.length > 0) {
                            effData = parsed;
                          } else if (Number(parsed?.monthly_rent_paid) > 0) {
                            effData = parsed;
                          }
                        }
                      } catch {}
                    }

                    let pdfDetails = Array.isArray(effData?.rent_details) ? [...effData.rent_details] : [];
                    if (pdfDetails.length === 0 && Array.isArray(effData?.persons)) {
                      effData.persons.forEach((p) => {
                        const pRent = p.rent_details || p.items?.rent_details;
                        if (Array.isArray(pRent) && pRent.length > 0) {
                          pdfDetails.push(...pRent);
                        }
                      });
                    }

                    setRentItems((prev) => {
                      const others = prev.filter((i) => !i.isNts && i.source !== 'nts');
                      if (pdfDetails.length > 0) {
                        const ntsRent = pdfDetails.map((pd, idx) => ({
                          id: pd.id || `nts_rent_${idx + 1}`,
                          name: pd.name || pd.person_name || cleanWorkerName,
                          relation: pd.relation || '본인',
                          landlord: pd.landlord || '',
                          landlordId: pd.landlordId || '',
                          houseType: pd.houseType || '',
                          area: pd.area ? String(pd.area) : '',
                          address: pd.address || '',
                          period: pd.period || pd.contractPeriod || '',
                          contractPeriod: pd.contractPeriod || pd.period || '',
                          amount: Number(pd.amount || 0),
                          isNts: true,
                          source: 'nts',
                        }));
                        return [...others, ...ntsRent];
                      } else if (Number(effData?.monthly_rent_paid) > 0) {
                        return [
                          ...others,
                          {
                            id: 'nts_rent_1',
                            name: cleanWorkerName,
                            relation: '본인',
                            landlord: '국세청 간소화 (월세액)',
                            landlordId: '',
                            houseType: '',
                            area: '',
                            address: '',
                            period: '',
                            contractPeriod: '',
                            amount: Number(effData.monthly_rent_paid),
                            isNts: true,
                            source: 'nts',
                          },
                        ];
                      }
                      return others;
                    });

                    // 인별 박스 기본 펼침으로 설정 (조회 및 수정 화면)
                    setRentExpandedIds((prev) => ({
                      ...prev,
                      [`nts_${cleanWorkerName}`]: true,
                      [`edit_nts_${cleanWorkerName}`]: true,
                      [`view_nts_${cleanWorkerName}`]: true,
                    }));

                    try {
                      localStorage.setItem('selftax_rent_checklist', 'yes');
                    } catch (e) {
                      console.error(e);
                    }

                    setRentChecklistAnswer('yes');
                    showAlert(
                      '요건을 충족하여 연말정산 간소화자료 PDF내용이 적용되었습니다.',
                      '알림',
                      () => {
                        setViewMode('rent_view');
                      }
                    );
                  } else {
                    // 국세청 PDF 자료를 삭제했거나 업로드 자료가 없을 경우: 국세청자료 미표시 및 기타자료 추가 페이지/모달로 바로 이동
                    setRentItems((prev) => prev.filter((i) => !i.isNts && i.source !== 'nts'));
                    try {
                      localStorage.setItem('selftax_rent_checklist', 'yes');
                    } catch (e) {
                      console.error(e);
                    }
                    setRentChecklistAnswer('yes');
                    setViewMode('rent_view');
                    handleOpenAddRent();
                  }
                } else {
                  showAlert('위 요건을 모두 충족하는지 네/아니오를 선택해주세요.');
                }
              }}
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              결과 저장하기
            </button>
          </div>

          {/* 공제불가 팝업 모달 (첨부 이미지 5 스펙 100% 일치) */}
          {showRentIneligibleModal && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="w-full max-w-[290px] bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
                {/* 빨간색 원형 ! 아이콘 */}
                <div className="w-14 h-14 rounded-full bg-[#FF4D4F] text-white flex items-center justify-center text-2xl font-black mx-auto shadow-md shrink-0">
                  !
                </div>

                <div>
                  <h4 className="text-base font-extrabold text-slate-900 leading-tight">
                    공제불가
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    공제 요건을 만족하지 않아요.<br />
                    공제 요건을 다시 한번 확인해주세요.
                  </p>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRentIneligibleModal(false);
                      setViewMode('rent_view');
                    }}
                    className="w-full py-3 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs transition shadow-xs cursor-pointer text-center"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. 월세액 명세 추가/수정 화면 (rent_add - 전체 페이지 화면)                   */}
      {/* ========================================================================= */}
      {viewMode === 'rent_add' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ✕ 월세액 명세 추가 / 수정 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('rent_edit')}
              className="flex items-center gap-2.5 text-slate-900 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-light leading-none">✕</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {editingRentItemId ? '월세액 명세 수정' : '월세액 명세 추가'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGuideCategory('rent');
                setGuideActiveTab('about');
                setGuideReturnMode('rent_add');
                setViewMode('deduction_guide');
              }}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              ⓘ
            </button>
          </div>

          {/* 본문 폼 입력 */}
          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            <div>
              <h2 className="text-[19px] font-extrabold text-slate-900 leading-snug tracking-tight">
                {editingRentItemId ? '월세액 명세를 수정해주세요.' : '월세액 명세를 입력해주세요.'}
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
                임대차계약서 및 계좌이체 영수증 내용과 동일하게 입력해주세요.
              </p>
            </div>

            <form onSubmit={handleSaveRentItem} className="space-y-4 pt-1">
              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <label className="text-[11.5px] font-semibold text-slate-500">
                  임대인 성명 (상호)<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={rentLandlord}
                  onChange={(e) => setRentLandlord(e.target.value)}
                  placeholder="임대인 성명 또는 상호"
                  className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>

              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <label className="text-[11.5px] font-semibold text-slate-500">
                  임대인 주민등록번호(사업자번호)<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={rentLandlordId}
                  onChange={(e) => {
                    const val = e.target.value;
                    const clean = val.replace(/[^0-9]/g, '');
                    if (clean.length === 13) {
                      setRentLandlordId(`${clean.slice(0, 6)}-*******`);
                    } else if (clean.length === 10) {
                      setRentLandlordId(`${clean.slice(0, 3)}-**-*****`);
                    } else {
                      setRentLandlordId(val);
                    }
                  }}
                  onBlur={(e) => setRentLandlordId(maskLandlordId(e.target.value))}
                  placeholder="800101-******* 또는 사업자번호"
                  className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <label className="text-[11.5px] font-semibold text-slate-500">
                  주택유형<span className="text-rose-500">*</span>
                </label>
                <select
                  value={rentHouseType}
                  onChange={(e) => setRentHouseType(e.target.value)}
                  className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="오피스텔">주거용 오피스텔</option>
                  <option value="아파트">아파트</option>
                  <option value="다세대/연립">다세대/연립</option>
                  <option value="단독/다가구">단독/다가구</option>
                  <option value="고시원">고시원</option>
                </select>
              </div>

              {/* 주택계약면적(㎡) */}
              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold text-slate-500">주택계약면적 (㎡)</label>
                  <span className="text-[10px] text-[#4F46E5] font-semibold">국민주택규모(85㎡ 이하) 또는 기준시가 4억 이하</span>
                </div>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={rentArea}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      setRentArea(val);
                    }}
                    placeholder="예: 84.5"
                    className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none font-mono"
                  />
                  <span className="text-xs font-bold text-slate-500 shrink-0 ml-2">㎡</span>
                </div>
              </div>

              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold text-slate-500">
                    임대차계약서상 주소지<span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-amber-600 font-medium">※ 등본 주소지와 일치 필수</span>
                </div>
                <input
                  type="text"
                  value={rentAddress}
                  onChange={(e) => setRentAddress(e.target.value)}
                  placeholder="주소지 입력 (등본상 전입 주소지와 동일)"
                  className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>

              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <label className="text-[11.5px] font-semibold text-slate-500">
                  계약기간<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={rentContractPeriod}
                  onChange={(e) => setRentContractPeriod(e.target.value)}
                  placeholder="예: 2025.01.01 ~ 2025.12.31"
                  className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1 border-b border-slate-200/80 pb-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold text-slate-500">
                    연간 월세액 지출금액<span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 font-semibold">연간 한도 1,000만원</span>
                </div>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={rentFormAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setRentFormAmount(val ? Number(val).toLocaleString() : '');
                    }}
                    placeholder="6,000,000"
                    className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none font-mono"
                  />
                  <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">원</span>
                </div>
                {Number(String(rentFormAmount).replace(/[^0-9]/g, '')) > 10000000 && (
                  <p className="text-[10.5px] text-amber-600 font-medium pt-1">
                    * 연간 한도 1,000만원 초과 지출액은 세액공제 시 1,000만원으로 한도 적용됩니다.
                  </p>
                )}
              </div>

              {/* 월세액 세액공제 요건 안내 카드 (첨부 이미지 규격 100% 일치) */}
              <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5 text-xs text-slate-700">
                <div className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
                  <span>📌</span>
                  <span>월세액 세액공제 요건 안내</span>
                </div>
                <div className="space-y-2.5 leading-relaxed text-[11px] text-slate-600">
                  <div>
                    <strong className="text-slate-800">1. 공제대상자 :</strong> 무주택 세대의 세대주(세대주가 월세액 세액공제, 주택마련저축, 주택임차차입금 원리금 상환액 및 장기주택저당차입금 이자상환액 공제를 받지 아니한 경우에는 세대의 구성원 중 근로소득자)로서 해당 과세기간의 총급여액의 8천만원(종합소득금액 7천만원) 이하인 근로자
                    <div className="text-slate-500 mt-0.5">※ 임대차계약서의 주소지와 주민등록표 등본의 주소지가 같아야 함</div>
                  </div>
                  <div>
                    <strong className="text-slate-800">2. 공제대상금액 :</strong> 과세기간 종료일 현재 무주택 세대주가 국민주택규모 또는 기준시가 4억원 이하인 주택을 임차하기 위하여 지급하는 월세액 중 연간 1,000만원 이하의 금액
                  </div>
                  <div>
                    <strong className="text-slate-800">3. 공제율 :</strong> 15%. 단, 총급여 5,500만원 이하자(종합소득금액 4천5백만원 초과자는 제외)는 17%
                  </div>
                  <div>
                    <strong className="text-slate-800">4. 중복공제 배제 :</strong> '월세액 세액공제'와 '신용카드등사용금액 소득공제'는 중복하여 받을 수 없습니다. 따라서 월세액 세액공제를 받고자 하는 근로자는 해당 월세액이 현금영수증 사용액에서 조회되는 경우 '신용카드등사용금액 소득공제' 대상금액에서 이를 차감하고 공제하여야 합니다.
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
                >
                  {editingRentItemId ? '수정' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 주택자금 화면 섹션 (housing_loan_*)                                         */}
      {/* ========================================================================= */}
      {viewMode.startsWith('housing_loan') && (
        <HousingLoanSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          onBack={() => setViewMode('list')}
          onOpenGuide={() => {
            setGuideCategory('housing_loan');
            setGuideActiveTab('about');
            setGuideReturnMode('housing_loan_view');
            setViewMode('deduction_guide');
          }}
          familyMembers={familyMembers}
          workerName={loggedInWorkerName}
          showAlert={showAlert}
          setToastMsg={setToastMsg}
          setShowToast={setShowToast}
          items={housingLoanItems}
          setItems={setHousingLoanItems}
          checklistAnswer={housingLoanChecklistAnswer}
          setChecklistAnswer={setHousingLoanChecklistAnswer}
          housingSavingsItems={housingSavingsItems}
          totalSalary={workerTotalSalary}
          hometaxData={hometaxData}
        />
      )}

      {/* ========================================================================= */}
      {/* 주택마련저축 화면 섹션 (housing_savings_*)                                   */}
      {/* ========================================================================= */}
      {viewMode.startsWith('housing_savings') && (
        <HousingSavingsSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          onBack={() => setViewMode('list')}
          onOpenGuide={() => {
            setGuideCategory('housing_savings');
            setGuideActiveTab('about');
            setGuideReturnMode('housing_savings_view');
            setViewMode('deduction_guide');
          }}
          familyMembers={familyMembers}
          workerName={loggedInWorkerName}
          showAlert={showAlert}
          setToastMsg={setToastMsg}
          setShowToast={setShowToast}
          items={housingSavingsItems}
          setItems={setHousingSavingsItems}
          checklistAnswer={housingSavingsChecklistAnswer}
          setChecklistAnswer={setHousingSavingsChecklistAnswer}
          housingLoanItems={housingLoanItems}
          totalSalary={workerTotalSalary}
          hometaxData={hometaxData}
        />
      )}

      {/* ========================================================================= */}
      {/* 연금저축/연금계좌 화면 섹션 (pension_*)                                     */}
      {/* ========================================================================= */}
      {viewMode.startsWith('pension') && (
        <PensionSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          onBack={() => setViewMode('list')}
          onOpenGuide={() => {
            setGuideCategory('pension');
            setGuideActiveTab('about');
            setGuideReturnMode('pension_view');
            setViewMode('deduction_guide');
          }}
          familyMembers={familyMembers}
          workerName={loggedInWorkerName}
          showAlert={showAlert}
          setToastMsg={setToastMsg}
          setShowToast={setShowToast}
          items={pensionItems}
          setItems={setPensionItems}
        />
      )}

      {/* ========================================================================= */}
      {/* 소기업소상공인공제 화면 섹션 (small_biz_*)                                  */}
      {/* ========================================================================= */}
      {viewMode.startsWith('small_biz') && (
        <SmallBizSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          onBack={() => setViewMode('list')}
          onOpenGuide={() => {
            setGuideCategory('small_biz');
            setGuideActiveTab('about');
            setGuideReturnMode('small_biz_view');
            setViewMode('deduction_guide');
          }}
          familyMembers={familyMembers}
          workerName={loggedInWorkerName}
          showAlert={showAlert}
          setToastMsg={setToastMsg}
          setShowToast={setShowToast}
          items={smallBizItems}
          setItems={setSmallBizItems}
          checklistAnswer={smallBizChecklistAnswer}
          setChecklistAnswer={setSmallBizChecklistAnswer}
          hometaxData={hometaxData}
          totalSalary={workerTotalSalary}
        />
      )}

      {/* ========================================================================= */}
      {/* 장기집합증권 화면 섹션 (long_invest_*)                                       */}
      {/* ========================================================================= */}
      {viewMode.startsWith('long_invest') && (
        <LongInvestSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          onBack={() => setViewMode('list')}
          onOpenGuide={() => {
            setGuideCategory('long_invest');
            setGuideActiveTab('about');
            setGuideReturnMode('long_invest_view');
            setViewMode('deduction_guide');
          }}
          familyMembers={familyMembers}
          workerName={loggedInWorkerName}
          showAlert={showAlert}
          setToastMsg={setToastMsg}
          setShowToast={setShowToast}
          items={longInvestItems}
          setItems={setLongInvestItems}
          totalSalary={workerTotalSalary}
        />
      )}

      {/* ========================================================================= */}
      {/* 기타공제 화면 섹션 (other_deduct_*)                                         */}
      {/* ========================================================================= */}
      {viewMode.startsWith('other_deduct') && (
        <OtherDeductSection
          viewMode={viewMode}
          setViewMode={setViewMode}
          onBack={() => setViewMode('list')}
          onOpenGuide={() => {
            setGuideCategory('other_deduct');
            setGuideActiveTab('about');
            setGuideReturnMode('other_deduct_view');
            setViewMode('deduction_guide');
          }}
          familyMembers={familyMembers}
          workerName={loggedInWorkerName}
          showAlert={showAlert}
          setToastMsg={setToastMsg}
          setShowToast={setShowToast}
          items={otherDeductItems}
          setItems={setOtherDeductItems}
        />
      )}

      {/* ========================================================================= */}
      {/* 6. 공제 가이드 상세 페이지 (첨부 이미지 1, 2, 4 스펙 100% 일치)            */}
      {/* 알아보기 / 절세팁 / 구비서류 3단 탭 전환                                     */}
      {/* ========================================================================= */}
      {viewMode === 'deduction_guide' && (
        <div className="flex-1 flex flex-col justify-between bg-white animate-in fade-in duration-150">
          {/* 상단 헤더: ← {공제명} 공제 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode(guideReturnMode || 'edu_view')}
              className="flex items-center gap-2.5 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-xl font-bold leading-none">←</span>
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {currentGuide.title}
              </span>
            </button>
            <div className="w-6" /> {/* 좌우 밸런스용 */}
          </div>

          {/* 상단 3단 서브 탭: [ 알아보기 ] | [ 절세팁 ] | [ 구비서류 ] (첨부 이미지 규격) */}
          <div className="w-full bg-white border-b border-slate-200/80 grid grid-cols-3 sticky top-[49px] z-10">
            <button
              type="button"
              onClick={() => setGuideActiveTab('about')}
              className={`py-3 text-center text-[14px] transition relative cursor-pointer ${
                guideActiveTab === 'about'
                  ? 'text-[#4F46E5] font-bold'
                  : 'text-[#8E95A3] font-medium hover:text-slate-700'
              }`}
            >
              알아보기
              {guideActiveTab === 'about' && (
                <div className="absolute bottom-0 left-4 right-4 h-[2.5px] bg-[#4F46E5] rounded-t-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setGuideActiveTab('tips')}
              className={`py-3 text-center text-[14px] transition relative cursor-pointer ${
                guideActiveTab === 'tips'
                  ? 'text-[#4F46E5] font-bold'
                  : 'text-[#8E95A3] font-medium hover:text-slate-700'
              }`}
            >
              절세팁
              {guideActiveTab === 'tips' && (
                <div className="absolute bottom-0 left-4 right-4 h-[2.5px] bg-[#4F46E5] rounded-t-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setGuideActiveTab('documents')}
              className={`py-3 text-center text-[14px] transition relative cursor-pointer ${
                guideActiveTab === 'documents'
                  ? 'text-[#4F46E5] font-bold'
                  : 'text-[#8E95A3] font-medium hover:text-slate-700'
              }`}
            >
              구비서류
              {guideActiveTab === 'documents' && (
                <div className="absolute bottom-0 left-4 right-4 h-[2.5px] bg-[#4F46E5] rounded-t-full" />
              )}
            </button>
          </div>

          {/* 메인 스크롤 콘텐츠 영역 */}
          <div className="flex-1 px-5 py-5 overflow-y-auto bg-slate-50/50">
            {/* ----------------------------------------------------------------- */}
            {/* 탭 1: 알아보기 (첨부 이미지 4번 디자인 100% 매칭)                    */}
            {/* ----------------------------------------------------------------- */}
            {guideActiveTab === 'about' && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                <h3 className="text-[14.5px] font-bold text-slate-900 px-1">
                  {currentGuide.about.question}
                </h3>

                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-5">
                  {currentGuide.about.sections.map((sec, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-start gap-1.5 text-[13px] font-bold text-slate-800">
                        <span className="text-slate-400 mt-0.5">•</span>
                        <span>{sec.title}</span>
                      </div>

                      {sec.content && (
                        <p className="text-[12px] text-slate-600 leading-relaxed pl-3 font-normal">
                          {sec.content}
                        </p>
                      )}

                      {sec.bullets && (
                        <div className="space-y-1.5 pl-3">
                          {sec.bullets.map((b, bIdx) => (
                            <div
                              key={bIdx}
                              className="flex items-start gap-1.5 text-[11.5px] text-slate-600 leading-relaxed font-normal"
                            >
                              <span className="text-slate-400 mt-0.5 shrink-0">-</span>
                              <span>{b}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* 탭 2: 절세팁 (첨부 이미지 2번 디자인 100% 매칭)                      */}
            {/* ----------------------------------------------------------------- */}
            {guideActiveTab === 'tips' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
                  {currentGuide.tips.map((tip, idx) => (
                    <div
                      key={idx}
                      className={`${idx === 0 ? 'pb-4' : 'py-4'} space-y-1.5`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center text-[10.5px]">
                          💡
                        </div>
                        <span className="text-[12px] font-extrabold text-slate-600 tracking-tight">
                          {tip.id}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-slate-800 leading-relaxed font-normal pl-0.5">
                        {tip.text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* 하단 유의사항 박스 (충분한 내부 여백과 테두리 간격 확보) */}
                {currentGuide.notice && (
                  <div className="bg-[#F8F9FA] rounded-2xl p-5 border border-slate-200/90 space-y-3 mt-4 shadow-2xs">
                    <h4 className="text-[13px] font-bold text-slate-800">유의사항</h4>
                    <div className="space-y-2.5 text-[12px] text-slate-600 leading-relaxed pl-1">
                      {currentGuide.notice.map((n, nIdx) => (
                        <div key={nIdx} className="flex items-start gap-2">
                          <span className="text-slate-400 mt-1 shrink-0 text-[10px]">•</span>
                          <span className="flex-1 leading-normal">{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* 탭 3: 구비서류 (첨부 이미지 1번 디자인 100% 매칭)                    */}
            {/* ----------------------------------------------------------------- */}
            {guideActiveTab === 'documents' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* 상단 안내사항 박스 (이미지 1 완벽 일치) */}
                <div className="bg-[#F0F6FF] border border-[#D0E2FF] rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#4F46E5]">
                    <span>ⓘ</span>
                    <span>안내사항</span>
                  </div>
                  <p className="text-[12px] text-slate-600 leading-relaxed">
                    <span className="text-[#4F46E5] font-bold">
                      비고란에 '국세청제공' 으로 표기된 항목은 홈택스 연말정산간소화에서 제공됩니다.
                    </span>{' '}
                    다만 영수증 발급기관에서 국세청에 자료를 제출하지 않은 경우 또는 홈택스 연말정산 간소화에서 조회되지 않는 증빙은 발급기관에서 수령하여 제출해야 합니다.
                  </p>
                </div>

                {/* 구비서류 그룹 목록 (구분선과 적절한 여백, 명확한 라벨 배치) */}
                <div className="space-y-4 pt-1">
                  {currentGuide.documents.map((doc, dIdx) => (
                    <div key={dIdx} className="space-y-1.5">
                      <h4 className="text-[13.5px] font-bold text-slate-900 px-1">
                        {doc.title}
                      </h4>
                      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
                        <div className="flex items-center justify-between text-xs gap-3 pb-2.5">
                          <span className="text-slate-500 font-semibold w-16 shrink-0">첨부서류</span>
                          <span className="text-slate-900 font-bold text-right flex-1 break-keep">{doc.file}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs gap-3 pt-2.5">
                          <span className="text-slate-500 font-semibold w-16 shrink-0">발급처</span>
                          <span className="text-slate-700 font-medium text-right flex-1 break-keep">{doc.issuer}</span>
                        </div>
                        {doc.note && (
                          <div className="flex items-center justify-between text-xs gap-3 pt-2.5">
                            <span className="text-slate-500 font-semibold w-16 shrink-0">비고</span>
                            <span className="text-[#4F46E5] font-medium text-right flex-1">{doc.note}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 중앙 알럿 모달: 공제요건 확인을 위해 체크리스트 작성이 필요해요 */}
      {showRentChecklistNoticeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[290px] bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            {/* 파란색 원형 ? 아이콘 */}
            <div className="w-14 h-14 rounded-full bg-[#4E88FF] text-white flex items-center justify-center text-2xl font-black mx-auto shadow-md shrink-0">
              ?
            </div>

            <div className="text-sm font-bold text-slate-800 leading-snug">
              공제요건 확인을 위해<br />
              체크리스트 작성이 필요해요.
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowRentChecklistNoticeModal(false);
                  setViewMode('rent_checklist');
                }}
                className="w-full py-3 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs transition shadow-xs cursor-pointer text-center"
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => setShowRentChecklistNoticeModal(false)}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition cursor-pointer text-center"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 의료비 증빙 팝업 */}
      {showProofModal && (
        <div
          onClick={() => setShowProofModal(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-5 max-w-xs w-full space-y-3 shadow-xl text-center animate-in zoom-in-95 duration-150"
          >
            <span className="text-2xl">📎</span>
            <h4 className="font-bold text-slate-900 text-sm">의료비 증빙자료 확인</h4>
            <p className="text-xs text-slate-500 leading-relaxed break-keep">
              안경·콘택트렌즈 구입 영수증 및 병의원 수기 납입증명서를 등록/확인할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setShowProofModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-xs font-bold cursor-pointer hover:bg-[#4338CA] transition shadow-xs"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 월세액 증빙 팝업 */}
      {showRentProofModal && (
        <div
          onClick={() => setShowRentProofModal(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-5 max-w-xs w-full space-y-3 shadow-xl text-center animate-in zoom-in-95 duration-150"
          >
            <span className="text-2xl">📎</span>
            <h4 className="font-bold text-slate-900 text-sm">월세액 증빙자료 확인</h4>
            <p className="text-xs text-slate-500 leading-relaxed break-keep">
              임대차계약서 사본, 주민등록표등본, 계좌이체 영수증(무통장입금증) 등 월세액 세액공제 증명서류를 등록/확인할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setShowRentProofModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-xs font-bold cursor-pointer hover:bg-[#4338CA] transition shadow-xs"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: AI 분석 안내 바텀시트 (첨부 이미지 5 스펙 100% 일치)                   */}
      {/* ========================================================================= */}
      {showAiAnalysisModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0">
          <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-5">
            {/* 상단 타이틀: AI 분석 안내 */}
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <div className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-[#6366F1] font-bold text-xs shadow-2xs">
                AI<span className="text-[8px] -mt-1 text-[#6366F1]">✦</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                AI 분석 안내
              </h3>
            </div>

            {/* 안내 카드 목록 (이미지 5 스펙 100% 일치) */}
            <div className="space-y-3 pt-1">
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-start gap-2.5">
                <span className="text-slate-400 text-xs shrink-0 mt-0.5">✦</span>
                <p className="text-[12px] text-slate-700 leading-relaxed font-normal">
                  2025년부터 산후조리원에 지급하는 비용은 공제 요건 없이 모든 근로자가 공제받을 수 있으니, 올해 자녀 출산으로 산후조리원 지급 비용이 있다면 공제 받으시기 바랍니다.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-start gap-2.5">
                <span className="text-slate-400 text-xs shrink-0 mt-0.5">✦</span>
                <p className="text-[12px] text-slate-700 leading-relaxed font-normal">
                  2025년부터 6세 이하 부양가족의 의료비 세액공제 한도가 폐지 되었으니, 해당하는 부양가족의 의료비를 확인하여 공제받으시기 바랍니다.
                </p>
              </div>
            </div>

            {/* 하단 확인 버튼 */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAiAnalysisModal(false)}
                className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-wide shadow-xs transition cursor-pointer text-center"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: 연말정산 자료 작성완료 중앙 팝업 (첨부 이미지 규격 100% 일치)           */}
      {/* ========================================================================= */}
      {showCompleteModal && (
        <div
          onClick={() => setShowCompleteModal(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] sm:max-w-[400px] bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            {/* 상단 타이틀 & 닫기 버튼 */}
            <div className="flex items-center justify-between pb-0.5">
              <h3 className="text-[17px] font-extrabold text-slate-900 tracking-tight">
                연말정산 자료 작성완료
              </h3>
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 text-base leading-none cursor-pointer"
                title="닫기"
              >
                ✕
              </button>
            </div>

            {/* 안내 텍스트 */}
            <div className="text-xs text-slate-600 leading-relaxed space-y-0.5">
              <p>
                연말정산 자료입력을 <span className="font-bold text-[#4F46E5]">작성완료</span>합니다.
              </p>
              <p>
                자료입력 기간 중에는 언제든지 내용을 다시 수정할 수 있습니다.
              </p>
            </div>

            {/* 3단계 동의/확인 체크박스 영역 (첨부 이미지 규격 완벽 일치) */}
            <div className="space-y-3 pt-2">
              {/* 1. 상기 내용에 대해 모두 확인하였습니다. */}
              <div
                onClick={handleToggleCompleteCheckAll}
                className="flex items-center gap-3 cursor-pointer select-none"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    completeCheckAll
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'border-2 border-[#CBD5E1] bg-white'
                  }`}
                >
                  {completeCheckAll && (
                    <svg className="w-3.5 h-3.5 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  상기 내용에 대해 모두 확인하였습니다.
                </span>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3.5">
                {/* 2. 작성한 연말정산 자료에 대한 모든 내용을... */}
                <div
                  onClick={handleToggleCompleteCheck1}
                  className="flex items-start gap-3 cursor-pointer select-none"
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                      completeCheck1
                        ? 'bg-[#4F46E5] text-white shadow-xs'
                        : 'border border-[#CBD5E1] bg-white'
                    }`}
                  >
                    {completeCheck1 && (
                      <svg className="w-3 h-3 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-slate-700 leading-relaxed font-medium">
                    작성한 연말정산 자료에 대한 모든 내용을<br />
                    근로자 본인이 충분히 검토하고 확인 하였습니다.
                  </span>
                </div>

                {/* 3. 작성한 연말정산 자료 내용을 기준으로... */}
                <div
                  onClick={handleToggleCompleteCheck2}
                  className="flex items-start gap-3 cursor-pointer select-none"
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                      completeCheck2
                        ? 'bg-[#4F46E5] text-white shadow-xs'
                        : 'border border-[#CBD5E1] bg-white'
                    }`}
                  >
                    {completeCheck2 && (
                      <svg className="w-3 h-3 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-slate-700 leading-relaxed font-medium">
                    작성한 연말정산 자료 내용을 기준으로<br />
                    근로자 소득공제신고서가 작성됨에 동의합니다.
                  </span>
                </div>
              </div>
            </div>

            {/* 하단 연말정산 자료 작성완료 버튼 (비활성: 연한 그레이블루, 활성: 블루) */}
            <div className="pt-2">
              <button
                type="button"
                disabled={!completeCheck1 || !completeCheck2}
                onClick={() => {
                  setShowCompleteModal(false);
                  if (onNext) onNext();
                }}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-tight transition text-center shadow-xs ${
                  completeCheck1 && completeCheck2
                    ? 'bg-[#4F46E5] hover:bg-[#4338CA] text-white cursor-pointer shadow-md'
                    : 'bg-[#E9EEF5] text-[#9AA5B8] cursor-not-allowed'
                }`}
              >
                연말정산 자료 작성완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성공 피드백 플로팅 토스트 */}
      {showToast && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
          <div className="bg-[#2B303A]/95 backdrop-blur-xs text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700/50">
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px]">
              ✓
            </span>
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* 프리미엄 디자인 알림창 (시스템 alert 완벽 대체) */}
      <DesignAlertModal
        isOpen={designAlert.isOpen}
        title={designAlert.title}
        message={designAlert.message}
        onClose={() => {
          const cb = designAlert.onConfirm;
          setDesignAlert({ isOpen: false, title: '알림', message: '', onConfirm: null });
          if (typeof cb === 'function') {
            cb();
          }
        }}
      />
    </div>
  );
}


