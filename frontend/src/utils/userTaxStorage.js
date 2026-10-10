/**
 * userTaxStorage.js
 * 로그인 사용자별 연말정산 입력 및 PDF 업로드 자료 영구 보존 및 복원 유틸리티
 * 
 * 기능:
 * 1. 로그인 사용자가 입력한 내용과 업로드한 PDF 자료(국세청 간소화, 원천징수영수증, 종전근무지 등)를
 *    사용자 고유 계정(User ID)별 영구 저장소에 실시간 백업 및 보존합니다.
 * 2. 사용자가 로그아웃했다가 다시 로그인했을 때, 기존에 입력/업로드했던 모든 자료를 100% 복원(Hydrate)합니다.
 * 3. 여러 계정 간의 데이터 격리를 보장하여, 계정 전환 시 다른 사용자의 데이터와 섞이지 않도록 보호합니다.
 */

import { getSecureItem, setSecureItem, removeSecureItem } from './secureStorage.js';

export const PERSISTENT_TAX_KEYS = [
  'hometax_extracted_data',
  'selftax_family_list',
  'selftax_withholding_data',
  'selftax_previous_jobs',
  'selftax_deduction_data',
  'selftax_housing_loan_checklist',
  'selftax_housing_savings_checklist',
  'selftax_rent_checklist',
  'selftax_small_biz_checklist',
  'selftax_other_medical',
  'selftax_other_insurance',
  'selftax_other_education',
  'selftax_other_donation',
  'selftax_other_card',
  'selftax_other_pension',
  'selftax_other_long_invest',
  'selftax_other_small_biz',
  'selftax_other_deduct',
  'selftax_other_housing_loan',
  'selftax_other_housing_savings',
  'selftax_other_rent',
  'selftax_ai_report_data',
];

// 각 페이지가 setSecureItem(암호화)으로 저장하는 키 목록 (그 외는 평문 localStorage 형식 유지)
// ※ selftax_deduction_data 등은 DataInputPage가 평문 JSON으로 읽으므로 반드시 평문으로 복원해야 함
export const SECURE_TAX_KEYS = new Set([
  'selftax_family_list',
  'selftax_withholding_data',
  'selftax_previous_jobs',
  'selftax_other_rent',
]);

/**
 * 사용자별 영구 스토리지 키 생성
 */
export function getUserBundleKey(userId) {
  const effectiveId = userId || 'guest';
  const sanitized = String(effectiveId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `selftax_user_bundle_${sanitized}`;
}

/**
 * 특정 세무 데이터 키 영구 완전 삭제 헬퍼 (영구 번들 및 브라우저 스토리지 즉시 동기화 삭제)
 */
export function removeUserTaxDataKey(userId, key) {
  const effectiveId = userId || 'guest';
  try {
    const bundleKey = getUserBundleKey(effectiveId);
    const existingBundle = getSecureItem(bundleKey, null) || {};
    delete existingBundle[key];
    setSecureItem(bundleKey, existingBundle);

    try {
      removeSecureItem(key);
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (e) {
      // ignore
    }

    try {
      const backupRaw = sessionStorage.getItem(`selftax_session_backup_${effectiveId}`);
      if (backupRaw) {
        const backup = JSON.parse(backupRaw);
        delete backup[key];
        sessionStorage.setItem(`selftax_session_backup_${effectiveId}`, JSON.stringify(backup));
      }
      const generalBackupRaw = sessionStorage.getItem('selftax_session_backup');
      if (generalBackupRaw) {
        const gBackup = JSON.parse(generalBackupRaw);
        delete gBackup[key];
        sessionStorage.setItem('selftax_session_backup', JSON.stringify(gBackup));
      }
    } catch (e) {
      // ignore
    }

    return true;
  } catch (err) {
    console.error('removeUserTaxDataKey failed:', err);
    return false;
  }
}

/**
 * 공제자료 입력 페이지(자료 입력 메뉴)에 유의미한 자료가 존재하는지 검증하는 헬퍼
 * - 국세청 간소화 데이터(hometax_extracted_data)가 존재하거나
 * - 수기 등록된 기타영수증 자료(12개 카테고리)가 1건이라도 존재하면 true 반환
 * - 모두 비어있으면 false 반환
 */
export function checkHasInputData(userId) {
  const effectiveId = userId || 'guest';

  // 1) 국세청 간소화 데이터가 유효한지 체크
  try {
    const rawHometax = localStorage.getItem('hometax_extracted_data');
    if (rawHometax) {
      const hometaxData = JSON.parse(rawHometax);
      if (
        hometaxData &&
        (hometaxData.uploaded ||
          hometaxData.fileName ||
          (Array.isArray(hometaxData.persons) && hometaxData.persons.length > 0))
      ) {
        return true;
      }
    }
  } catch (e) {
    // ignore
  }

  // 2) 사용자 영구 번들(로그인 상태)에서 hometax 데이터 체크
  try {
    const bundleKey = getUserBundleKey(effectiveId);
    const bundle = getSecureItem(bundleKey, null);
    if (bundle && bundle.hometax_extracted_data) {
      const bH = bundle.hometax_extracted_data;
      if (bH.uploaded || bH.fileName || (Array.isArray(bH.persons) && bH.persons.length > 0)) {
        return true;
      }
    }
  } catch (e) {
    // ignore
  }

  // 3) 수기 기타영수증 12개 카테고리 로컬스토리지 확인
  const otherKeys = [
    'selftax_other_medical',
    'selftax_other_insurance',
    'selftax_other_education',
    'selftax_other_donation',
    'selftax_other_card',
    'selftax_other_pension',
    'selftax_other_long_invest',
    'selftax_other_small_biz',
    'selftax_other_deduct',
    'selftax_other_housing_loan',
    'selftax_other_housing_savings',
  ];

  for (const key of otherKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return true;
      }
    } catch (e) {
      // ignore
    }
  }

  // 암호화 저장소 대상 월세액 수기자료 등 확인
  try {
    const rentOther = getSecureItem('selftax_other_rent', null);
    if (Array.isArray(rentOther) && rentOther.length > 0) return true;
  } catch (e) {
    // ignore
  }

  // 4) selftax_deduction_data 내에 국세청 외(수기) 데이터가 존재하는지 확인
  try {
    const rawDed = localStorage.getItem('selftax_deduction_data');
    if (rawDed) {
      const ded = JSON.parse(rawDed);
      const listKeys = [
        'medicalItems',
        'insuranceItems',
        'cardItems',
        'eduItems',
        'rentItems',
        'housingLoanItems',
        'housingSavingsItems',
        'pensionItems',
        'donationItems',
        'smallBizItems',
        'longInvestItems',
        'otherDeductItems',
      ];
      for (const lk of listKeys) {
        const arr = ded[lk];
        if (Array.isArray(arr)) {
          const manualItems = arr.filter((item) => !item.isNts && item.source !== 'nts');
          if (manualItems.length > 0) return true;
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return false;
}

/**
 * 원천징수영수증 자료(withholding)가 실제로 업로드/입력되어 있는지 검증하는 헬퍼
 */
export function checkHasWithholdingData(userId) {
  const effectiveId = userId || 'guest';
  try {
    const wh = getSecureItem('selftax_withholding_data');
    if (wh && (wh.uploaded || wh.fileName || Number(wh.totalSalary) > 0)) {
      return true;
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem('selftax_withholding_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.uploaded || parsed.fileName || Number(parsed.totalSalary) > 0)) {
        return true;
      }
    }
  } catch (e) {}

  try {
    const bundleKey = getUserBundleKey(effectiveId);
    const bundle = getSecureItem(bundleKey, null);
    if (bundle && bundle.selftax_withholding_data) {
      const bWh = bundle.selftax_withholding_data;
      if (bWh && (bWh.uploaded || bWh.fileName || Number(bWh.totalSalary) > 0)) {
        return true;
      }
    }
  } catch (e) {}

  return false;
}

/**
 * 현재 활성 작업 공간의 모든 연말정산 자료를 사용자별 세션/영구 저장소에 백업/저장
 * @param {string} userId - 로그인 사용자 식별자 (없을 시 guest 기본)
 * @param {object} extraData - 컴포넌트 state에만 있는 추가 데이터
 */
export function saveUserData(userId, extraData = {}) {
  const effectiveId = userId || 'guest';
  try {
    const bundleKey = getUserBundleKey(effectiveId);
    if (!bundleKey) return false;

    // 0. 기존 저장된 사용자 번들 로드 (기존 입력 내용 보존용 안전 머지)
    const existingBundle = getSecureItem(bundleKey, null) || {};

    // 1. 현재 저장된 각 키의 최신 값을 수집 (secureStorage 및 일반 localStorage 호환)
    const bundle = { ...existingBundle };

    PERSISTENT_TAX_KEYS.forEach((key) => {
      // extraData에 직접 전달된 값이 있으면 최우선 적용
      if (extraData[key] !== undefined) {
        if (extraData[key] !== null) {
          bundle[key] = extraData[key];
        } else {
          // 명시적으로 null을 전달한 경우 영구 번들과 스토리지 전체에서 완전 삭제
          delete bundle[key];
          delete existingBundle[key];
          try {
            removeSecureItem(key);
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
          } catch (e) {}
        }
        return;
      }
      if (key === 'hometax_extracted_data' && extraData.hometaxExtractedData !== undefined) {
        if (extraData.hometaxExtractedData !== null) {
          bundle[key] = extraData.hometaxExtractedData;
        } else {
          delete bundle[key];
          delete existingBundle[key];
          try {
            removeSecureItem(key);
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
          } catch (e) {}
        }
        return;
      }
      if (key === 'selftax_ai_report_data' && extraData.aiReportData !== undefined) {
        if (extraData.aiReportData !== null) {
          bundle[key] = extraData.aiReportData;
        } else {
          delete bundle[key];
          delete existingBundle[key];
          try {
            removeSecureItem(key);
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
          } catch (e) {}
        }
        return;
      }

      // secureStorage 우선 조회 후 일반 localStorage fallback
      const securedVal = getSecureItem(key, null);
      if (securedVal !== null && securedVal !== undefined) {
        bundle[key] = securedVal;
      } else {
        const rawVal = localStorage.getItem(key);
        if (rawVal !== null && rawVal !== undefined) {
          try {
            bundle[key] = JSON.parse(rawVal);
          } catch {
            bundle[key] = rawVal;
          }
        } else {
          // localStorage에 없지만 기존 번들에 이미 저장된 내용이 있으면 보존 (로그아웃/화면전환 시 유실 방지)
          if (existingBundle[key] !== undefined && existingBundle[key] !== null) {
            bundle[key] = existingBundle[key];
          }
        }
      }
    });

    // 2. 진행 단계 및 완료 메뉴 수집
    let finalProgress = 1;
    if (extraData.taxProgress !== undefined && extraData.taxProgress !== null) {
      finalProgress = Number(extraData.taxProgress);
    } else {
      const rawProgress = localStorage.getItem(`taxProgress_${effectiveId}`);
      if (rawProgress !== null) {
        finalProgress = parseInt(rawProgress, 10) || 1;
      } else if (existingBundle.taxProgress !== undefined) {
        finalProgress = Number(existingBundle.taxProgress) || 1;
      }
    }
    bundle.taxProgress = finalProgress;

    const rawMenus = localStorage.getItem(`completedMenus_${effectiveId}`);
    let parsedRawMenus = [];
    if (rawMenus) {
      try {
        parsedRawMenus = JSON.parse(rawMenus);
      } catch {
        parsedRawMenus = [];
      }
    }
    let finalMenus;
    if (extraData.completedMenus !== undefined) {
      finalMenus = Array.from(extraData.completedMenus);
    } else if (rawMenus !== null) {
      finalMenus = parsedRawMenus;
    } else {
      const prevMenus = Array.isArray(existingBundle.completedMenus) ? existingBundle.completedMenus : [];
      finalMenus = prevMenus;
    }
    bundle.completedMenus = finalMenus;

    bundle.updatedAt = new Date().toISOString();

    // 3. 사용자 고유 스토리지에 암호화하여 영구 저장
    setSecureItem(bundleKey, bundle);

    // 4. 브라우저 세션 스토리지(sessionStorage)에도 동기화 저장
    try {
      sessionStorage.setItem(`selftax_session_backup_${effectiveId}`, JSON.stringify(bundle));
      sessionStorage.setItem('selftax_session_backup', JSON.stringify(bundle));
      sessionStorage.setItem('selftax_session_user_id', String(effectiveId));
    } catch {
      // ignore
    }

    return true;
  } catch (err) {
    console.error('saveUserData failed for userId:', effectiveId, err);
    return false;
  }
}

/**
 * 로그인한 사용자의 영구 저장소에서 데이터를 읽어와 활성 작업 공간으로 복원(Hydrate)
 * @param {string} userId - 로그인 사용자 식별자 (없을 시 guest 기본)
 * @returns {object|null} 복원된 데이터 요약 객체
 */
export function loadUserData(userId) {
  const effectiveId = userId || 'guest';
  try {
    const bundleKey = getUserBundleKey(effectiveId);
    if (!bundleKey) return null;

    let bundle = getSecureItem(bundleKey, null);

    // localStorage에 없으면 sessionStorage 백업 확인
    if (!bundle || typeof bundle !== 'object') {
      try {
        const sessionKeyRaw = sessionStorage.getItem(`selftax_session_backup_${effectiveId}`);
        const sessionRaw = sessionKeyRaw || sessionStorage.getItem('selftax_session_backup');
        const sessionUid = sessionStorage.getItem('selftax_session_user_id');
        if (sessionRaw && (!sessionUid || sessionUid === String(effectiveId))) {
          bundle = JSON.parse(sessionRaw);
        }
      } catch {
        // ignore
      }
    }

    if (!bundle || typeof bundle !== 'object') {
      return null;
    }

    // 실제로 유의미한 저장 데이터가 있는지 검증
    const hasActualData = Boolean(
      (bundle.selftax_family_list && Array.isArray(bundle.selftax_family_list) && bundle.selftax_family_list.length > 0) ||
      bundle.hometax_extracted_data ||
      bundle.selftax_deduction_data ||
      bundle.selftax_withholding_data ||
      (bundle.selftax_previous_jobs && bundle.selftax_previous_jobs.length > 0) ||
      bundle.selftax_other_medical ||
      bundle.selftax_other_insurance ||
      bundle.selftax_other_education ||
      bundle.selftax_other_donation ||
      bundle.selftax_other_card ||
      bundle.selftax_other_rent ||
      bundle.selftax_other_housing_loan ||
      bundle.selftax_other_housing_savings ||
      (bundle.taxProgress && bundle.taxProgress > 1) ||
      (bundle.completedMenus && bundle.completedMenus.length > 0)
    );

    if (!hasActualData) {
      return null;
    }

    // 0. 다른 계정의 잔여 활성 데이터가 섞이지 않도록 먼저 비움 (번들에 없는 키는 빈 상태가 정상)
    clearActiveTaxData();

    // 1. 번들에 저장된 각 키를 현재 활성 로컬스토리지에 정확히 복원
    PERSISTENT_TAX_KEYS.forEach((key) => {
      const val = bundle[key];
      if (val !== undefined && val !== null) {
        if (SECURE_TAX_KEYS.has(key)) {
          // 보안 저장 대상 (암호화)
          setSecureItem(key, val);
        } else {
          // 일반 저장 대상 (JSON 또는 문자열)
          if (typeof val === 'object') {
            try {
              localStorage.setItem(key, JSON.stringify(val));
            } catch {
              // ignore
            }
          } else {
            localStorage.setItem(key, String(val));
          }
        }
      }
    });

    // 2. 진행 단계 및 완료 메뉴 복원
    if (bundle.taxProgress !== undefined) {
      localStorage.setItem(`taxProgress_${effectiveId}`, String(bundle.taxProgress));
    }
    if (bundle.completedMenus && Array.isArray(bundle.completedMenus)) {
      localStorage.setItem(`completedMenus_${effectiveId}`, JSON.stringify(bundle.completedMenus));
    }

    // 3. 컴포넌트 State에 즉시 반영할 수 있는 복원 객체 반환
    return {
      hometaxData: bundle.hometax_extracted_data || null,
      familyList: bundle.selftax_family_list || [],
      withholdingData: bundle.selftax_withholding_data || null,
      previousJobs: bundle.selftax_previous_jobs || [],
      deductionData: bundle.selftax_deduction_data || null,
      taxProgress: bundle.taxProgress || 1,
      completedMenus: bundle.completedMenus || [],
      aiReportData: bundle.selftax_ai_report_data || null,
      hasData: true,
    };
  } catch (err) {
    console.error('loadUserData failed for userId:', effectiveId, err);
    return null;
  }
}

/**
 * 활성 작업 공간(현재 화면)에 로드된 연말정산 자료 초기화
 * (로그아웃 시 다음 사용자를 위해 현재 작업화면을 비우는 용도 - 사용자별 영구 백업본은 삭제하지 않음)
 */
export function clearActiveTaxData() {
  try {
    PERSISTENT_TAX_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch (err) {
    console.error('clearActiveTaxData error:', err);
  }
}
