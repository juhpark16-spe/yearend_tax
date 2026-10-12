import React, { useState, useEffect } from 'react';
import TaxStepProgressBar from '../components/TaxStepProgressBar';
import FamilyValidationCard from '../components/FamilyValidationCard';
import HomeButton from '../components/HomeButton';
import UserAuthStatus from '../components/UserAuthStatus';
import { useAuth } from '../context/AuthContext';
import { getSecureItem, setSecureItem, maskRrn } from '../utils/secureStorage';
import { validatePdfFile } from '../utils/fileValidation';
import { expenseEligibilityNote, failsAgeRequirement, shouldExcludeBasicDeduction } from '../utils/eligibility';
import { membersFromProofUpload } from '../utils/proofExtract';
import { taxService } from '../services/api';

/**
 * [Step 2] 부양가족 정보 및 정보변경 화면
 * 기준: 첨부 이미지 4 (연말정산자료입력 부양가족 정보), 이미지 3 (부양가족 리스트 확인), 이미지 5 (부양가족 정보변경 폼)
 */
export default function FamilyPage({ onGoHome, onNext, onPrev, onNavigateStep, userProfile, onDataChange, onSignOut, onLogin }) {
  const { profile } = useAuth();
  // 로그인한 사람의 이름 (profile 우선, userProfile 폴백)
  const loginName = (profile?.name || userProfile?.name || '홍길동').replace(/\s*\(Google\)/g, '').trim() || '홍길동';
  // 모드: 'view' (이미지 4) | 'edit_list' (이미지 3) | 'edit_form' (이미지 5)
  const [viewMode, setViewMode] = useState('view');
  const [editingTarget, setEditingTarget] = useState(null);
  const [showProofNotice, setShowProofNotice] = useState(false);
  const [showChangeHistory, setShowChangeHistory] = useState(false);

  // 부양가족 데이터 목록 — localStorage(암호화 스토리지) 우선 복원, 없으면 로그인 본인 포함 초기화
  const [familyList, setFamilyList] = useState(() => {
    try {
      const saved = getSecureItem('selftax_family_list');
      if (saved && Array.isArray(saved) && saved.length > 0) {
        // 본인 항목의 이름을 현재 로그인한 사람의 이름으로 최신화, rrn 마스킹 및 나이·소득 요건 미충족 시 기본공제 보정
        return saved.map((item) => ({
          ...item,
          name: item.isSelf || item.relation === '본인' ? loginName : item.name,
          rrn: item.rrn ? maskRrn(item.rrn) : '',
          basicDeduction: shouldExcludeBasicDeduction(item) ? '해당없음' : (item.basicDeduction || '해당없음'),
        }));
      }
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'self',
        name: loginName,
        birth: '',
        rrn: '',
        relation: '본인',
        nationality: '내국인',
        isPublic: true,
        basicDeduction: '기본공제 (150만 원)',
        seniorDeduction: '해당없음',
        disabledDeduction: '해당없음',
        womanDeduction: '해당없음',
        singleParentDeduction: '해당없음',
        isSelf: true,
      },
    ];
  });

  // familyList 변경 시 암호화 및 rrn 마스킹(YYMMDD-*******) 적용하여 localStorage 자동 동기화
  useEffect(() => {
    try {
      if (familyList && familyList.length > 0) {
        setSecureItem('selftax_family_list', familyList);
        if (typeof onDataChange === 'function') {
          onDataChange();
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [familyList]);

  // 신규 첨부 이미지 5종 대응 상태 머신:
  // 1. 방법 선택 모달 (Image 3)
  const [showAddMethodModal, setShowAddMethodModal] = useState(false);
  const [addMethod, setAddMethod] = useState('proof'); // 'proof' (증빙자료) | 'direct' (직접등록)

  // 2. 자료 선택 모달 (Image 4)
  const [showDocSelectModal, setShowDocSelectModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState('resident'); // 'resident' (주민등록등본) | 'family' (가족관계증명서)

  // 3. 간편인증 정보 입력 상태 (Image 1)
  const [selectedAuthProvider, setSelectedAuthProvider] = useState('kakao');
  const [authName, setAuthName] = useState('최지연');
  const [authBirth, setAuthBirth] = useState('1979-05-01');

  // 4. 자료 조회 로딩 진행률 (Image 5)
  const [inquiryProgress, setInquiryProgress] = useState(0);
  const [isInquiryComplete, setIsInquiryComplete] = useState(false);

  // 5. 신규 첨부 이미지(5종) 대응 변동현황 모달 및 자료확인/토스트 상태
  const [showChangeModal, setShowChangeModal] = useState(false); // 이미지 1: '부양가족공제 변동현황' 팝업 모달
  const [showToast, setShowToast] = useState(false); // 이미지 2: '등록 완료되었습니다.' 토스트
  const [toastMessage, setToastMessage] = useState('등록 완료되었습니다.');
  const [previousViewMode, setPreviousViewMode] = useState('view');

  // 자료확인 화면: 증빙자료에서 추출된 부양가족 목록 (초기 비어있음 — 파일 업로드 후 채워짐)
  const [collectedList, setCollectedList] = useState([]);

  // 증빙자료 업로드 및 부양가족 추출/선택 상태
  const [proofDocType, setProofDocType] = useState('resident'); // 'resident' (주민등록등본) | 'family' (가족관계증명서)
  const [isProofDragging, setIsProofDragging] = useState(false);
  const [isAnalyzingProof, setIsAnalyzingProof] = useState(false);
  const [proofError, setProofError] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [selectedProofIds, setSelectedProofIds] = useState([]);

  // 7대 간편인증사 데이터 (Image 1 스펙)
  const authProviders = [
    {
      id: 'kakao',
      name: '카카오톡',
      bg: '#FEE500',
      textColor: '#381E1F',
      icon: (
        <span className="font-black text-[10px] text-[#381E1F]">TALK</span>
      ),
    },
    {
      id: 'naver',
      name: '네이버',
      bg: '#03C75A',
      textColor: '#FFFFFF',
      icon: (
        <span className="font-black text-sm text-white font-sans">N</span>
      ),
    },
    {
      id: 'pass_telecom',
      name: '통신사패스',
      bg: '#E21A22',
      textColor: '#FFFFFF',
      icon: (
        <span className="font-extrabold text-[9px] text-white tracking-tighter">PASS</span>
      ),
    },
    {
      id: 'samsung_pass',
      name: '삼성패스',
      bg: '#1259D4',
      textColor: '#FFFFFF',
      icon: (
        <span className="font-bold text-[10px] text-white tracking-tight">Pass</span>
      ),
    },
    {
      id: 'payco',
      name: '페이코',
      bg: '#FA2828',
      textColor: '#FFFFFF',
      icon: (
        <span className="font-black text-[9px] text-white italic">PAYCO</span>
      ),
    },
    {
      id: 'shinhan',
      name: '신한인증서',
      bg: '#0046FF',
      textColor: '#FFFFFF',
      icon: (
        <span className="font-bold text-[9px] text-white">SOL</span>
      ),
    },
    {
      id: 'kb',
      name: 'KB모바일\n인증서',
      bg: '#FFBC00',
      textColor: '#60584C',
      icon: (
        <span className="font-black text-xs text-[#60584C]">★</span>
      ),
    },
  ];

  // 자료 조회 진행 애니메이션 (Image 5: 98% 로딩 후 '자료확인' 화면으로 자동 이동)
  React.useEffect(() => {
    if (viewMode === 'loading_inquiry') {
      setInquiryProgress(15);
      setIsInquiryComplete(false);

      const t1 = setTimeout(() => setInquiryProgress(45), 350);
      const t2 = setTimeout(() => setInquiryProgress(78), 700);
      const t3 = setTimeout(() => setInquiryProgress(98), 1100); // Image 5의 98%
      const t4 = setTimeout(() => {
        setInquiryProgress(100);
        setIsInquiryComplete(true);
      }, 1800);

      const t5 = setTimeout(() => {
        // 정부24 주민등록등본 조회 완료 후 '자료확인' 화면(신규 첨부 이미지 4)으로 이동
        setViewMode('confirm_data');
      }, 2400);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
      };
    }
  }, [viewMode]);

  // 방법 선택 적용 버튼 (증빙자료 ➔ 증빙자료 업로드 화면 / 직접등록 ➔ 직접 입력 폼)
  const handleApplyAddMethod = () => {
    setShowAddMethodModal(false);
    if (addMethod === 'direct') {
      openEditForm(null);
    } else {
      // 증빙자료 선택 시 -> 증빙자료 업로드 화면으로 전환
      setPreviousViewMode(viewMode);
      setSelectedProofIds(collectedList.map((item) => item.id));
      setViewMode('upload_proof');
    }
  };

  // 증빙자료 파일 업로드 및 AI 부양가족 추출 핸들러
  const handleProofFileUpload = async (fileOrName = '주민등록등본.pdf', docType = proofDocType) => {
    let fileName = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name || '주민등록등본.pdf';
    const isRealFile = Boolean(fileOrName && typeof fileOrName === 'object' && fileOrName.size !== undefined);
    if (isRealFile) {
      if (!validatePdfFile(fileOrName)) {
        return;
      }
      fileName = fileOrName.name;
    }
    setProofFileName(fileName);
    setProofError('');

    // 실제 파일: 서버가 주민번호를 가린 뒤 세대원·가족을 추출 (/tax/upload)
    if (isRealFile) {
      setIsAnalyzingProof(true);
      try {
        const formData = new FormData();
        formData.append('files', fileOrName);
        const res = await taxService.uploadDocuments(formData);
        const { items, error } = membersFromProofUpload(Array.isArray(res) ? res[0] : null, docType);
        if (error) {
          setProofError(error);
          return;
        }
        setCollectedList(items);
        setSelectedProofIds(items.map((item) => item.id));
        setViewMode('confirm_data');
      } catch (err) {
        setProofError(err?.userMessage || '증빙서류를 분석하지 못했습니다. 서버 연결을 확인하거나 직접등록으로 추가해 주세요.');
      } finally {
        setIsAnalyzingProof(false);
      }
      return;
    }

    // '샘플 서류로 바로 체험' 버튼: 화면 안의 예시 가족으로 흐름만 보여 준다
    setIsAnalyzingProof(true);
    setTimeout(() => {
      setIsAnalyzingProof(false);
      // 파일 업로드 시 증빙 유형에 따라 샘플 데이터 추출 (실제 서비스에서는 AI 추출 결과)
      const extractedByDocType = docType === 'resident'
        ? [
            { id: 'c1', name: '김남진', birth: '1976.01.01', rrn: '760101-*******', relation: '배우자', nationality: '내국인', isPublic: true, basicDeduction: '해당없음', seniorDeduction: '해당없음', disabledDeduction: '해당없음', womanDeduction: '해당없음', singleParentDeduction: '해당없음', isSelf: false },
            { id: 'c2', name: '김원희', birth: '2006.06.01', rrn: '060601-*******', relation: '자녀,손자녀,입양자', nationality: '내국인', isPublic: true, basicDeduction: '기본공제 (150만 원)', seniorDeduction: '해당없음', disabledDeduction: '해당없음', womanDeduction: '해당없음', singleParentDeduction: '해당없음', isSelf: false },
          ]
        : [
            { id: 'c3', name: '김두나', birth: '2016.12.01', rrn: '161201-*******', relation: '자녀,손자녀,입양자', nationality: '내국인', isPublic: true, basicDeduction: '기본공제 (150만 원)', seniorDeduction: '해당없음', disabledDeduction: '해당없음', womanDeduction: '해당없음', singleParentDeduction: '해당없음', isSelf: false },
            { id: 'c4', name: '김세나', birth: '2024.04.01', rrn: '240401-*******', relation: '자녀,손자녀,입양자', nationality: '내국인', isPublic: true, basicDeduction: '기본공제 (150만 원)', seniorDeduction: '해당없음', disabledDeduction: '해당없음', womanDeduction: '해당없음', singleParentDeduction: '해당없음', isSelf: false },
          ];
      setCollectedList(extractedByDocType);
      setSelectedProofIds(extractedByDocType.map((item) => item.id));
      setViewMode('confirm_data');
    }, 1500);
  };

  // 추출된 부양가족 선택/해제 토글
  const toggleSelectProof = (id) => {
    setSelectedProofIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  // 전체 선택 / 전체 해제 토글
  const handleToggleSelectAllProof = () => {
    if (selectedProofIds.length === collectedList.length) {
      setSelectedProofIds([]);
    } else {
      setSelectedProofIds(collectedList.map((item) => item.id));
    }
  };

  // 저장/다음 버튼 핸들러: 완료 상태 저장 후 다음 페이지
  const handleSaveAndNext = () => {
    if (onDataChange) onDataChange();
    if (onNext) onNext();
  };

  // 자료 선택 다음 버튼 (Image 4 ➔ Image 1)
  const handleProceedToAuth = () => {
    setShowDocSelectModal(false);
    setViewMode('auth_input');
  };

  // 간편인증 정보입력 다음 버튼 (Image 1 ➔ Image 5)
  const handleStartInquiry = (e) => {
    if (e) e.preventDefault();
    setViewMode('loading_inquiry');
  };

  // 수집 목록에서 항목 제외/삭제 (신규 첨부 이미지)
  const handleDeleteCollected = (id) => {
    setCollectedList((prev) => prev.filter((item) => item.id !== id));
    setSelectedProofIds((prev) => prev.filter((itemId) => itemId !== id));
  };

  // 자료확인 화면에서 '부양가족으로 등록' 클릭 (선택된 부양가족만 등록 반영 후 토스트 알림)
  const handleRegisterConfirmedFamily = () => {
    const toRegister = collectedList.filter((item) => selectedProofIds.includes(item.id));
    if (toRegister.length === 0) {
      alert('등록할 부양가족을 1명 이상 선택해 주세요.');
      return;
    }

    setFamilyList((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const newItems = toRegister
        .filter((c) => !existingNames.has(c.name))
        .map((c, idx) => ({
          ...c,
          id: `f_proof_${Date.now()}_${idx}`,
        }));
      return [...prev, ...newItems];
    });

    setViewMode('view');
    setToastMessage(`${toRegister.length}명의 부양가족이 등록 완료되었습니다.`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // 편집 폼 필드 상태 (기존 레이아웃 + 소득금액요건 초과여부)
  const [formName, setFormName] = useState('');
  const [formNationality, setFormNationality] = useState('내국인');
  const [formRrn, setFormRrn] = useState('');
  const [formIsPublic, setFormIsPublic] = useState(true);
  const [formRelation, setFormRelation] = useState('배우자');
  const [formIncomeOver, setFormIncomeOver] = useState('초과하지 않음');
  const [formBasicDeduction, setFormBasicDeduction] = useState('기본공제 (150만 원)');
  const [formSeniorDeduction, setFormSeniorDeduction] = useState('해당없음');
  const [formDisabledDeduction, setFormDisabledDeduction] = useState('해당없음');
  const [formWomanDeduction, setFormWomanDeduction] = useState('해당없음');
  const [formSingleParentDeduction, setFormSingleParentDeduction] = useState('해당없음');

  // 주민번호 포맷팅 (뒷자리 전체 마스킹: YYMMDD-*******)
  const formatMaskedRrn = (val) => {
    return maskRrn(val);
  };

  const handleRrnChange = (e) => {
    const val = e.target.value;
    const clean = val.replace(/[^0-9]/g, '');
    if (clean.length <= 6) {
      setFormRrn(clean);
    } else {
      setFormRrn(maskRrn(clean));
    }
  };

  // 부양가족 삭제
  const handleDeleteFamily = (id) => {
    setFamilyList((prev) => prev.filter((f) => f.id !== id));
  };

  // 편집 폼 열기
  const openEditForm = (item) => {
    setPreviousViewMode(viewMode);
    setEditingTarget(item);
    if (item) {
      setFormName(item.name || '');
      setFormNationality(item.nationality || '내국인');
      // 본인(isSelf)인 경우 주민번호가 비어있으면 빈 칸으로 유지
      if (item.isSelf || item.relation === '본인') {
        setFormRrn(item.rrn ? maskRrn(item.rrn) : '');
      } else {
        setFormRrn(maskRrn(item.rrn || '760101-*******'));
      }
      setFormIsPublic(item.isPublic ?? true);
      setFormRelation(item.isSelf ? '본인' : (item.relation || '배우자'));
      setFormIncomeOver(item.incomeOver || '초과하지 않음');
      setFormBasicDeduction(item.basicDeduction || '해당없음');
      setFormSeniorDeduction(item.seniorDeduction || '해당없음');
      setFormDisabledDeduction(item.disabledDeduction || '해당없음');
      setFormWomanDeduction(item.womanDeduction || '해당없음');
      setFormSingleParentDeduction(item.singleParentDeduction || '해당없음');
    } else {
      // 신규 추가
      setFormName('');
      setFormNationality('내국인');
      setFormRrn('');
      setFormIsPublic(true);
      setFormRelation('자녀,손자녀,입양자');
      setFormIncomeOver('초과하지 않음');
      setFormBasicDeduction('기본공제 (150만 원)');
      setFormSeniorDeduction('해당없음');
      setFormDisabledDeduction('해당없음');
      setFormWomanDeduction('해당없음');
      setFormSingleParentDeduction('해당없음');
    }
    setViewMode('edit_form');
  };

  // 편집 폼 저장
  const handleSaveForm = (e) => {
    e.preventDefault();
    if (!formName.trim()) return;

    // 소득금액요건 초과 또는 나이요건 미충족(관계·생년월일·장애인 여부로 판정)이면 기본공제는 해당없음으로 처리
    const ageFails = failsAgeRequirement({
      relation: editingTarget?.isSelf ? '본인' : formRelation,
      rrn: formRrn,
      disabledDeduction: formDisabledDeduction,
      isSelf: Boolean(editingTarget?.isSelf),
    });
    const effectiveBasicDeduction =
      (formIncomeOver === '초과함' || ageFails) ? '해당없음' : formBasicDeduction;

    const isSelfPerson = editingTarget ? (editingTarget.isSelf || editingTarget.relation === '본인') : formRelation === '본인';
    const effectiveWomanDeduction = isSelfPerson ? formWomanDeduction : '해당없음';
    const effectiveSingleParentDeduction = isSelfPerson ? formSingleParentDeduction : '해당없음';

    const maskedRrn = formatMaskedRrn(formRrn) || '250101-*******';

    if (editingTarget) {
      // 수정
      setFamilyList((prev) =>
        prev.map((f) =>
          f.id === editingTarget.id
            ? {
                ...f,
                name: formName,
                nationality: formNationality,
                rrn: maskedRrn,
                isPublic: formIsPublic,
                relation: editingTarget.isSelf ? '본인' : formRelation,
                incomeOver: formIncomeOver,
                basicDeduction: effectiveBasicDeduction,
                seniorDeduction: formSeniorDeduction,
                disabledDeduction: formDisabledDeduction,
                womanDeduction: effectiveWomanDeduction,
                singleParentDeduction: effectiveSingleParentDeduction,
              }
            : f
        )
      );
      setCollectedList((prev) =>
        prev.map((c) =>
          c.id === editingTarget.id
            ? {
                ...c,
                name: formName,
                nationality: formNationality,
                rrn: maskedRrn,
                isPublic: formIsPublic,
                relation: formRelation,
                incomeOver: formIncomeOver,
                basicDeduction: effectiveBasicDeduction,
                seniorDeduction: formSeniorDeduction,
                disabledDeduction: formDisabledDeduction,
                womanDeduction: effectiveWomanDeduction,
                singleParentDeduction: effectiveSingleParentDeduction,
              }
            : c
        )
      );
    } else {
      // 신규 추가 (직접등록)
      const newId = `f_${Date.now()}`;
      const cleanFront = maskedRrn.replace(/[^0-9]/g, '').slice(0, 6);
      const rawGender = formRrn.replace(/[^0-9]/g, '').slice(6, 7);
      let birthYear;
      if (['1', '2', '5', '6'].includes(rawGender)) {
        birthYear = `19${cleanFront.slice(0, 2)}`;
      } else if (['3', '4', '7', '8'].includes(rawGender)) {
        birthYear = `20${cleanFront.slice(0, 2)}`;
      } else {
        const yy = parseInt(cleanFront.slice(0, 2), 10);
        birthYear = yy <= 25 ? `20${cleanFront.slice(0, 2)}` : `19${cleanFront.slice(0, 2)}`;
      }
      const birth = cleanFront.length >= 6 ? `${birthYear}.${cleanFront.slice(2, 4)}.${cleanFront.slice(4, 6)}` : '2025.01.01';

      setFamilyList((prev) => [
        ...prev,
        {
          id: newId,
          name: formName,
          birth,
          rrn: maskedRrn,
          relation: formRelation,
          nationality: formNationality,
          isPublic: formIsPublic,
          incomeOver: formIncomeOver,
          basicDeduction: effectiveBasicDeduction,
          seniorDeduction: formSeniorDeduction,
          disabledDeduction: formDisabledDeduction,
          womanDeduction: effectiveWomanDeduction,
          singleParentDeduction: effectiveSingleParentDeduction,
          isSelf: false,
        },
      ]);
      // 직접등록 완료 → edit_list(정보변경 목록)로 복귀 + 토스트
      setViewMode('edit_list');
      setToastMessage(`${formName}님이 부양가족으로 등록되었습니다.`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }
    setViewMode(previousViewMode === 'confirm_data' ? 'confirm_data' : (previousViewMode || 'edit_list'));
  };

  return (
    <div className="w-full min-h-screen bg-white flex flex-col justify-between font-sans select-none">
      {/* ========================================================================= */}
      {/* MODE 1: 이미지 4 - 연말정산자료입력 부양가족 기본 뷰                      */}
      {/* ========================================================================= */}
      {viewMode === 'view' && (
        <>
          {/* 상단 헤더: ← 연말정산자료입력 + 햄버거 메뉴 (왼쪽에 홈화면 뱃지 포함) */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-2">
              <button
                onClick={onGoHome}
                className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
                title="홈화면으로 이동"
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

          {/* 상단 파란색 4단계 프로세스 바 (이미지 4) */}
          <TaxStepProgressBar currentStep={1} onSelectStep={onNavigateStep} />

          {/* 메인 콘텐츠 영역 */}
          <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
            {/* 부양가족 정보 헤더 + 변동현황 & 📎 증빙 버튼 (첨부 이미지 1, 2, 3, 5 기준) */}
            <div className="flex items-center justify-between pt-1">
              <h3 className="text-base font-extrabold text-slate-900">부양가족 정보</h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowChangeModal(true)}
                  className="px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  변동현황
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviousViewMode('view');
                    setViewMode('view_proof_doc');
                  }}
                  className="px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1"
                >
                  <span>📎</span>
                  <span>증빙</span>
                </button>
              </div>
            </div>

            {/* 부양가족 리스트 (이미지 4) */}
            <div className="space-y-2.5">
              {familyList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openEditForm(item)}
                  className="w-full bg-white rounded-xl p-3.5 border border-slate-200 hover:border-indigo-300 transition shadow-xs flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{item.name}</span>
                    <span className="text-xs text-slate-400 font-mono">{item.birth}</span>
                    {(item.isSelf || item.relation === '본인') && item.womanDeduction && item.womanDeduction !== '해당없음' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-50 text-pink-600 border border-pink-200">
                        부녀자
                      </span>
                    )}
                    {(item.isSelf || item.relation === '본인') && item.singleParentDeduction && item.singleParentDeduction !== '해당없음' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200">
                        한부모
                      </span>
                    )}
                    {expenseEligibilityNote(item) && (
                      <span className="w-full text-[10.5px] text-amber-600 font-medium">{expenseEligibilityNote(item)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <span>{item.relation}</span>
                    <span className="text-[10px] text-slate-400">∨</span>
                  </div>
                </div>
              ))}
            </div>

            {/* + 부양가족 수정/추가 버튼 (이미지 4) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setViewMode('edit_list')}
                className="w-full py-3 rounded-xl border border-indigo-300 text-[#4F46E5] font-bold text-xs hover:bg-indigo-50 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-1"
              >
                <span>+ 부양가족 수정/추가</span>
              </button>
            </div>

            {/* 부양가족 공제 요건 검증 (POST /tax/validate) */}
            <FamilyValidationCard familyList={familyList} userName={loginName} />
          </div>

          {/* 하단 고정 액션 바: 이전 / 저장·다음 */}
          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 relative z-10">
            <button
              onClick={onPrev || onGoHome}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              이전
            </button>
            <button
              onClick={handleSaveAndNext}
              className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center"
            >
              저장/다음
            </button>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: 이미지 3 - 부양가족 자료를 확인해주세요 (수정/삭제 모드)           */}
      {/* ========================================================================= */}
      {viewMode === 'edit_list' && (
        <div className="flex-1 flex flex-col justify-between">
          {/* 상단 헤더: ✕ 연말정산 부양가족 정보변경 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode('view')}
                className="p-1 -ml-1 text-slate-800 hover:text-slate-600 transition cursor-pointer text-xl font-light"
                title="닫기"
              >
                ✕
              </button>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                연말정산 부양가족 정보변경
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

          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 (이미지 3) */}
            <div>
              <h2 className="text-[19px] font-black text-slate-900 tracking-tight">
                부양가족 자료를 확인해주세요
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                부양가족 항목을 클릭 시 상세조회 및 정보수정을 할 수 있습니다.
              </p>
            </div>

            {/* 부양가족 리스트 헤더 */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-slate-800">부양가족 리스트</span>
              <button
                type="button"
                onClick={() => {
                  setPreviousViewMode('edit_list');
                  setViewMode('view_proof_doc');
                }}
                className="px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1"
              >
                <span>📎</span>
                <span>증빙</span>
              </button>
            </div>

            {/* 리스트 아이템 (클릭 시 폼 이동, ✕ 누르면 삭제) */}
            <div className="space-y-2.5">
              {familyList.map((item) => (
                <div
                  key={item.id}
                  className="w-full bg-white rounded-xl p-3.5 border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition flex items-center justify-between group"
                >
                  <div
                    onClick={() => openEditForm(item)}
                    className="flex-1 flex items-baseline gap-2.5 cursor-pointer flex-wrap"
                  >
                    <span className="text-sm font-bold text-slate-900">{item.name}</span>
                    <span className="text-xs text-slate-400 font-mono tracking-tight">{item.birth}</span>
                    {(item.isSelf || item.relation === '본인') && item.womanDeduction && item.womanDeduction !== '해당없음' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-50 text-pink-600 border border-pink-200">
                        부녀자
                      </span>
                    )}
                    {(item.isSelf || item.relation === '본인') && item.singleParentDeduction && item.singleParentDeduction !== '해당없음' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200">
                        한부모
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <span
                      onClick={() => openEditForm(item)}
                      className="cursor-pointer hover:text-slate-600"
                    >
                      {item.relation}
                    </span>
                    {!item.isSelf ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFamily(item.id);
                        }}
                        className="p-1 -mr-1 text-slate-300 hover:text-rose-600 transition cursor-pointer text-sm font-semibold"
                        title="부양가족 삭제"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="w-3" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* + 부양가족 추가 버튼 (직접등록 방식이면 바로 추가 페이지로 이동) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  if (addMethod === 'direct') {
                    openEditForm(null);
                  } else {
                    setShowAddMethodModal(true);
                  }
                }}
                className="w-full py-3 rounded-xl border border-indigo-300 text-[#4F46E5] font-bold text-xs hover:bg-indigo-50 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
              >
                <span>+ 부양가족 추가</span>
              </button>
            </div>
          </div>

          {/* 하단 고정 완료 버튼 */}
          <div className="p-4 bg-white border-t border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('view')}
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              부양가족 추가완료
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: 이미지 5 - 연말정산 부양가족 정보변경 상세 입력/수정 폼            */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODE 3: 첨부 이미지 - 연말정산 부양가족 추가 상세 입력/수정 폼            */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODE 3: 연말정산 부양가족 정보변경 상세 입력/수정 폼                        */}
      {/* ========================================================================= */}
      {viewMode === 'edit_form' && (
        <form onSubmit={handleSaveForm} className="flex-1 flex flex-col justify-between">
          {/* 상단 헤더: ← 연말정산 부양가족 정보변경 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode(previousViewMode || 'edit_list')}
                className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
                title="뒤로가기"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                연말정산 부양가족 정보변경
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

          {/* 폼 필드 스크롤 영역 (기존 레이아웃 + 소득금액요건 초과여부 + 경로우대공제 설명) */}
          <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto text-xs">
            {/* 1. 이름* + [외국인] [내국인] 독립 토글 버튼 */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <label className="font-semibold text-slate-500">
                이름<span className="text-slate-400">*</span>
              </label>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="이름 입력"
                  className="flex-1 text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                  required
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormNationality('외국인')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      formNationality === '외국인'
                        ? 'border-indigo-300 text-[#4F46E5] bg-white shadow-2xs'
                        : 'border-slate-300 text-slate-400 bg-white hover:bg-slate-50'
                    }`}
                  >
                    외국인
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormNationality('내국인')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      formNationality === '내국인'
                        ? 'border-indigo-300 text-[#4F46E5] bg-white shadow-2xs'
                        : 'border-slate-300 text-slate-400 bg-white hover:bg-slate-50'
                    }`}
                  >
                    내국인
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 주민번호* (뒷자리 마스킹 표기 YYMMDD-*******) */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <label className="font-semibold text-slate-500">
                주민번호<span className="text-slate-400">*</span>
              </label>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={formRrn}
                  onChange={handleRrnChange}
                  placeholder="예: 760101-*******"
                  maxLength={14}
                  className="w-full text-base font-medium font-mono text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
                  required
                />
              </div>
            </div>

            {/* 3. 부양가족관계* 드롭다운 (본인은 '본인' 표기) */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <label className="font-semibold text-slate-500">
                부양가족관계<span className="text-slate-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={formRelation}
                  onChange={(e) => setFormRelation(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none appearance-none pr-6 cursor-pointer"
                >
                  <option value="본인">본인</option>
                  <option value="배우자">배우자</option>
                  <option value="자녀,손자녀,입양자">자녀,손자녀,입양자</option>
                  <option value="직계존속 (부/모)">직계존속 (부/모)</option>
                  <option value="배우자의 직계존속">배우자의 직계존속</option>
                  <option value="형제자매">형제자매</option>
                </select>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ∨
                </div>
              </div>
            </div>

            {/* 4. 소득금액요건 초과여부* (추가 항목) */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <label className="font-semibold text-slate-500">
                소득금액요건 초과여부<span className="text-slate-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={formIncomeOver}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormIncomeOver(val);
                    if (val === '초과함') {
                      setFormBasicDeduction('해당없음');
                    } else {
                      setFormBasicDeduction('기본공제 (150만 원)');
                    }
                  }}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none appearance-none pr-6 cursor-pointer"
                >
                  <option value="초과하지 않음">초과하지 않음</option>
                  <option value="초과함">초과함 (연간 100만 원 초과)</option>
                </select>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ∨
                </div>
              </div>
              <p className="text-[11px] text-[#4F46E5] leading-relaxed pt-0.5">
                소득금액의 합계가 100만원을 초과하는 경우에는 기본공제 대상자 요건에 해당하지 않아요.
              </p>
            </div>

            {/* 5. 기본공제* 드롭다운 */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <label className="font-semibold text-slate-500">
                기본공제<span className="text-slate-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={formBasicDeduction}
                  onChange={(e) => setFormBasicDeduction(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none appearance-none pr-6 cursor-pointer"
                >
                  <option value="기본공제 (150만 원)">기본공제 (150만 원)</option>
                  <option value="해당없음">해당없음</option>
                </select>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ∨
                </div>
              </div>
            </div>

            {/* 6. 경로우대공제 (70세 이상) 토글 [해당] [해당없음] + 설명 문구 추가 */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-500">
                  경로우대공제 <span className="text-slate-400 font-normal">(70세 이상)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormSeniorDeduction('해당')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      formSeniorDeduction === '해당'
                        ? 'border-indigo-300 text-[#4F46E5] bg-white shadow-2xs'
                        : 'border-slate-300 text-slate-400 bg-white hover:bg-slate-50'
                    }`}
                  >
                    해당
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormSeniorDeduction('해당없음')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      formSeniorDeduction === '해당없음'
                        ? 'border-indigo-300 text-[#4F46E5] bg-white shadow-2xs'
                        : 'border-slate-300 text-slate-400 bg-white hover:bg-slate-50'
                    }`}
                  >
                    해당없음
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                기본공제 대상자 중 만 70세 이상(1955.12.31 이전 출생)인 경우 1명당 연 100만 원을 추가로 공제받을 수 있습니다.
              </p>
            </div>

            {/* 7. 장애인공제 드롭다운 */}
            <div className="space-y-2 border-b border-slate-100 pb-3">
              <label className="font-semibold text-slate-500">
                장애인공제
              </label>
              <div className="relative">
                <select
                  value={formDisabledDeduction}
                  onChange={(e) => setFormDisabledDeduction(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none appearance-none pr-6 cursor-pointer"
                >
                  <option value="해당없음">해당없음</option>
                  <option value="장애인복지법상 장애인 (200만 원)">장애인복지법상 장애인 (200만 원)</option>
                  <option value="국가유공자 상이자 (200만 원)">국가유공자 상이자 (200만 원)</option>
                  <option value="항시 치료를 요하는 중증환자 (200만 원)">항시 치료를 요하는 중증환자 (200만 원)</option>
                </select>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ∨
                </div>
              </div>
            </div>

            {/* 8. 부녀자공제 & 9. 한부모가족 (본인에게만 표기) */}
            {(editingTarget ? (editingTarget.isSelf || editingTarget.relation === '본인') : formRelation === '본인') && (
              <>
                {/* 8. 부녀자공제 드롭다운 */}
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <label className="font-semibold text-slate-500">
                    부녀자공제 <span className="text-slate-400 font-normal">(연 50만 원)</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formWomanDeduction}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormWomanDeduction(val);
                        if (val === '해당 (연 50만 원)') {
                          setFormSingleParentDeduction('해당없음');
                        }
                      }}
                      className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none appearance-none pr-6 cursor-pointer"
                    >
                      <option value="해당없음">해당없음</option>
                      <option value="해당 (연 50만 원)">해당 (연 50만 원)</option>
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                      ∨
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    종합소득금액 3천만 원 이하인 여성 근로자로서 배우자가 있거나, 기본공제 대상 부양가족이 있는 세대주인 경우 연 50만 원 추가공제됩니다.
                  </p>
                </div>

                {/* 9. 한부모가족 공제 드롭다운 */}
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <label className="font-semibold text-slate-500">
                    한부모가족 <span className="text-slate-400 font-normal">(연 100만 원)</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formSingleParentDeduction}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormSingleParentDeduction(val);
                        if (val === '해당 (연 100만 원)') {
                          setFormWomanDeduction('해당없음');
                        }
                      }}
                      className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none appearance-none pr-6 cursor-pointer"
                    >
                      <option value="해당없음">해당없음</option>
                      <option value="해당 (연 100만 원)">해당 (연 100만 원)</option>
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                      ∨
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    배우자가 없는 근로자로서 기본공제 대상자인 직계비속(자녀·손자녀) 또는 입양자가 있는 경우 연 100만 원 추가공제됩니다 (부녀자공제와 중복 시 한부모공제 우선 적용).
                  </p>
                </div>
              </>
            )}
          </div>

          {/* 하단 저장 버튼 (이미지 5) */}
          <div className="p-4 bg-white border-t border-slate-200">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] text-white font-bold text-xs hover:bg-[#4338CA] transition shadow-xs cursor-pointer text-center"
            >
              {editingTarget ? '저장' : '부양가족 등록'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* MODE 4: 이미지 1 - 간편인증 및 본인인증 정보 입력 화면                      */}
      {/* ========================================================================= */}
      {viewMode === 'auth_input' && (
        <div className="flex-1 flex flex-col justify-between bg-white">
          {/* 상단 헤더 & 스텝 */}
          <div className="w-full border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="px-5 pt-3.5 pb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMode('edit_list')}
                className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
                title="뒤로가기"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              {/* 상단 2단계 미니 스텝 바 (연필 아이콘: 정보 입력 ➔ 점) */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full bg-[#4F46E5] text-white flex items-center justify-center shadow-xs">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#4F46E5]">정보 입력</span>
                </div>

                <div className="w-10 h-[1.5px] bg-slate-200" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              </div>

              <button
                type="button"
                onClick={onGoHome}
                className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
              >
                홈
              </button>
            </div>
          </div>

          {/* 메인 스크롤 영역 */}
          <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto text-xs">
            {/* 1. 간편인증 선택 섹션 */}
            <div className="space-y-2">
              <h2 className="text-[17px] font-black text-slate-900 leading-snug tracking-tight">
                간편인증을 위한 정보를
                <br />
                입력해주세요.
              </h2>
              <p className="text-[11px] text-slate-400 leading-normal">
                인증정보는 홈택스 자료 조회 외 다른 용도로는 이용되지 않습니다.
              </p>

              {/* 7대 간편인증사 그리드 (카카오톡, 네이버, 통신사패스, 삼성패스 / 페이코, 신한, KB) */}
              <div className="grid grid-cols-4 gap-2 pt-3">
                {authProviders.map((provider) => {
                  const isSelected = selectedAuthProvider === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setSelectedAuthProvider(provider.id)}
                      className={`py-3 px-1 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'border-[#4F46E5] bg-indigo-50/20 shadow-xs ring-1 ring-[#4F46E5]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: provider.bg, color: provider.textColor }}
                      >
                        {provider.icon}
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 whitespace-pre-line text-center leading-tight">
                        {provider.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full h-[1px] bg-slate-100 my-4" />

            {/* 2. 본인인증 정보 입력 섹션 */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                본인인증 정보를 입력해주세요
              </h3>

              {/* 이름* 필드 */}
              <div className="space-y-1 border-b border-slate-100 pb-2">
                <label className="text-xs font-semibold text-slate-500">
                  이름<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 pt-0.5"
                />
                <span className="text-[10.5px] text-slate-400 block pt-0.5">
                  이름은 한글과 영문만 입력가능 합니다.
                </span>
              </div>

              {/* 생년월일* 필드 */}
              <div className="space-y-1 border-b border-slate-100 pb-2">
                <label className="text-xs font-semibold text-slate-500">
                  생년월일<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={authBirth}
                  onChange={(e) => setAuthBirth(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full text-base font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300 pt-0.5 font-mono"
                />
              </div>
            </div>
          </div>

          {/* 하단 다음 버튼 */}
          <div className="p-4 bg-white border-t border-slate-200">
            <button
              type="button"
              onClick={handleStartInquiry}
              className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 5: 이미지 5 - 자료 조회 98% 로딩 애니메이션 화면                       */}
      {/* ========================================================================= */}
      {viewMode === 'loading_inquiry' && (
        <div className="flex-1 flex flex-col justify-between bg-white select-none">
          {/* 상단 헤더: ✕ 자료 조회 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('edit_list')}
                className="p-1 -ml-1 text-slate-800 hover:text-slate-600 transition cursor-pointer text-lg"
                title="닫기"
              >
                ✕
              </button>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                자료 조회
              </h1>
            </div>
            <button
              type="button"
              onClick={onGoHome}
              className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer flex items-center gap-1"
            >
              <span>🏠 홈</span>
            </button>
          </div>

          {/* 중앙 로딩 및 퍼센트 인디케이터 (Image 5 스펙) */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-6">
            {/* 원형 그라데이션 프로그레스 스피너 */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#3B82F6] via-[#6366F1] to-[#8B5CF6] p-1.5 flex items-center justify-center shadow-md animate-spin duration-1000">
                <div className="w-full h-full rounded-full bg-gradient-to-br from-[#4E82F6] to-[#7C3AED] flex items-center justify-center relative">
                  <div className="w-1.5 h-8 bg-white rounded-full opacity-90 animate-pulse" />
                </div>
              </div>
            </div>

            {/* 퍼센트 텍스트 */}
            <div className="-mt-2">
              <span className="text-xl font-black text-[#4F46E5] tracking-tight">
                {inquiryProgress}%
              </span>
            </div>

            {/* 안내 타이틀 및 서브텍스트 (Image 5 문구 100% 일치) */}
            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">
                {isInquiryComplete ? '자료 조회가 완료되었습니다!' : '자료를 조회중입니다.'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {isInquiryComplete ? '부양가족 리스트에 자동 반영되었습니다.' : '다른 앱으로 전환 또는 앱을 종료하지 마세요.'}
              </p>
            </div>

            <div className="pt-2">
              <p className="text-[11px] text-slate-400">
                네트워크 환경에 따라 시간이 소요될 수 있습니다.
              </p>
            </div>
          </div>

          <div className="p-4" />
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE: 증빙자료 업로드 화면 (주민등록등본 / 가족관계증명서)                   */}
      {/* ========================================================================= */}
      {viewMode === 'upload_proof' && (
        <div className="flex-1 flex flex-col justify-between bg-[#F8FAFC]">
          {/* 상단 헤더: ← 증빙자료 업로드 */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode(previousViewMode || 'view')}
              className="flex items-center gap-2 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-lg font-bold">←</span>
              <span className="text-base font-bold text-slate-900">증빙자료 업로드</span>
            </button>
          </div>

          {/* 본문 스크롤 영역 */}
          <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                부양가족 증빙자료를<br />업로드해 주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                주민등록등본 또는 가족관계증명서를 업로드하시면<br />AI가 자동으로 부양가족 정보를 추출합니다.
              </p>
            </div>

            {/* 서류 종류 선택 탭 (주민등록등본 / 가족관계증명서) */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setProofDocType('resident')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                  proofDocType === 'resident'
                    ? 'bg-white text-[#4F46E5] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                주민등록등본
              </button>
              <button
                type="button"
                onClick={() => setProofDocType('family')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                  proofDocType === 'family'
                    ? 'bg-white text-[#4F46E5] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                가족관계증명서
              </button>
            </div>

            {/* 증빙자료 업로드 카드 (드래그앤드롭 + 캡슐형 PDF 파일 업로드 버튼) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsProofDragging(true);
              }}
              onDragLeave={() => setIsProofDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsProofDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleProofFileUpload(file);
              }}
              className={`w-full rounded-2xl border-2 border-dashed p-7 flex flex-col items-center justify-center text-center transition-all bg-white ${
                isProofDragging
                  ? 'border-[#4F46E5] bg-indigo-50/40 shadow-inner'
                  : 'border-slate-200 hover:border-indigo-400 shadow-2xs'
              }`}
            >
              {/* 문서 아이콘 */}
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3 text-[#4F46E5]">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              {/* 안내 문구 (요청사항 반영: PDF파일을 드래그 드롭하거나 업로드하세요) */}
              <div className="space-y-1 mb-5">
                <p className="text-xs font-extrabold text-slate-700">
                  PDF파일을 드래그 드롭하거나 업로드하세요
                </p>
                <p className="text-[11px] text-slate-400 font-medium">
                  {proofDocType === 'resident' ? '주민등록표(등본)' : '가족관계증명서'} PDF 파일 (최대 20MB)
                </p>
              </div>

              {/* 숨겨진 파일 인풋 */}
              <input
                id="proof-file-input"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onClick={(e) => {
                  e.target.value = '';
                }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProofFileUpload(file);
                }}
              />

              {/* 캡슐형 로얄블루 'PDF 파일 업로드' 버튼 */}
              <button
                type="button"
                onClick={() => document.getElementById('proof-file-input')?.click()}
                className="px-6 py-2.5 rounded-full bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-tight shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>PDF 파일 업로드</span>
              </button>
            </div>

            {/* 빠른 시연용 바로 추출 카드 */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">💡</span>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800">샘플 서류로 바로 체험</div>
                  <div className="text-[11px] text-slate-500">별도 서류 없이 1초만에 부양가족을 자동 추출합니다.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleProofFileUpload(proofDocType === 'resident' ? '주민등록등본(샘플).pdf' : '가족관계증명서(샘플).pdf')}
                className="px-3 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold transition cursor-pointer shrink-0 shadow-2xs"
              >
                자동 추출 시작
              </button>
            </div>
          </div>

          {/* 하단 취소 버튼 */}
          <div className="p-4 bg-white border-t border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode(previousViewMode || 'view')}
              className="w-full py-3 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              취소
            </button>
          </div>

          {proofError && !isAnalyzingProof && (
            <p className="mx-4 mb-3 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{proofError}</p>
          )}

          {/* AI 분석 중 로딩 오버레이 */}
          {isAnalyzingProof && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-7 max-w-xs w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-4 border-indigo-100 border-t-[#4F46E5] animate-spin" />
                  <span className="absolute text-xl">📄</span>
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-900 tracking-tight">부양가족 추출 중</h4>
                  <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                    증빙서류({proofFileName})에서<br />가족 구성원을 안전하게 분석하고 있습니다...
                  </p>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#4F46E5] h-full w-4/5 animate-pulse rounded-full" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 6: 첨부 이미지 규격 - 자료확인 (부양가족 추출후 선택 리스트 화면)       */}
      {/* ========================================================================= */}
      {viewMode === 'confirm_data' && (
        <div className="flex-1 flex flex-col justify-between bg-[#F8FAFC]">
          {/* 상단 헤더: ← 자료확인 (첨부 원본 이미지 규격: 홈화면 버튼 없음) */}
          <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setViewMode('upload_proof')}
              className="flex items-center gap-2 text-slate-800 hover:text-slate-600 transition cursor-pointer"
            >
              <span className="text-lg font-bold">←</span>
              <span className="text-base font-bold text-slate-900">자료확인</span>
            </button>
          </div>

          {/* 본문 스크롤 영역 (첨부 이미지 레이아웃 100% 반영) */}
          <div className="flex-1 px-5 py-5 space-y-4 overflow-y-auto">
            {/* 타이틀 및 서브텍스트 (첨부 이미지 일치) */}
            <div>
              <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
                자동 반영된<br />정보를 확인해 주세요.
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                각 리스트 클릭 시 상세정보를 확인 및 편집할 수 있습니다.
              </p>
            </div>

            {/* 중앙 3D 가족 일러스트 (첨부 이미지 일치) */}
            <div className="w-full flex justify-center py-1">
              <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
                <img
                  src="/assets/family_3d_avatar.jpg"
                  alt="수집된 가족 구성원"
                  className="w-full h-full object-contain mix-blend-multiply"
                />
              </div>
            </div>

            {/* 수집된 부양가족 정보확인 리스트 섹션 (선택 체크박스 + 이름/생년월일 + ✕ 버튼) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800">
                  수집된 부양가족 정보확인
                </span>
                <button
                  type="button"
                  onClick={handleToggleSelectAllProof}
                  className="text-[11px] font-bold text-[#4F46E5] hover:underline cursor-pointer"
                >
                  {selectedProofIds.length === collectedList.length ? '전체 해제' : '전체 선택'} ({selectedProofIds.length}/{collectedList.length})
                </button>
              </div>

              {/* 리스트 카드들 */}
              <div className="space-y-2">
                {collectedList.map((item) => {
                  const isChecked = selectedProofIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`w-full bg-white rounded-xl p-3.5 border transition-all flex items-center justify-between shadow-2xs ${
                        isChecked
                          ? 'border-indigo-300 ring-1 ring-indigo-100'
                          : 'border-slate-200 opacity-70'
                      }`}
                    >
                      {/* 좌측: 체크박스 + 이름/생년월일 */}
                      <div
                        onClick={() => toggleSelectProof(item.id)}
                        className="flex items-center gap-3 cursor-pointer flex-1"
                      >
                        {/* 원형/사각 체크박스 */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                            isChecked
                              ? 'bg-[#4F46E5] border-[#4F46E5] text-white shadow-2xs'
                              : 'bg-white border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          {isChecked && (
                            <svg className="w-3.5 h-3.5 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>

                        {/* 이름 및 생년월일 (첨부 이미지: 김남진 1979.05.01) */}
                        <div className="flex items-baseline gap-2.5">
                          <span className="text-sm font-bold text-slate-900">{item.name}</span>
                          <span className="text-xs text-slate-400 font-mono">{item.birth}</span>
                        </div>
                      </div>

                      {/* 우측: ✕ 제외 버튼 (첨부 이미지 규격) */}
                      <button
                        type="button"
                        onClick={() => handleDeleteCollected(item.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 transition cursor-pointer"
                        title="리스트에서 제외"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  );
                })}

                {collectedList.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                    추출된 부양가족 항목이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 하단 취소 / 부양가족으로 등록 버튼 (첨부 이미지 규격 완벽 일치) */}
          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setViewMode('upload_proof')}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleRegisterConfirmedFamily}
              disabled={selectedProofIds.length === 0}
              className={`flex-[2] py-3 px-4 rounded-xl text-white text-xs font-bold transition shadow-xs cursor-pointer text-center ${
                selectedProofIds.length === 0
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-[#4F46E5] hover:bg-[#4338CA]'
              }`}
            >
              부양가족으로 등록 {selectedProofIds.length > 0 && `(${selectedProofIds.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 7: 증빙자료 확인 뷰어 — 업로드 여부에 따라 분기                        */}
      {/* ========================================================================= */}
      {viewMode === 'view_proof_doc' && (
        proofFileName ? (
          // ── 증빙 업로드 완료 → 자료 뷰어 표시 ──
          <div className="flex-1 flex flex-col justify-between bg-[#C2C5CD] select-none h-full min-h-[720px] animate-in fade-in duration-200">
            {/* 상단 다크 헤더 */}
            <div className="w-full px-4 py-3.5 bg-[#4D5057] text-white flex items-center justify-between shadow-md z-20">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode(previousViewMode || 'view')}
                  className="p-1 -ml-1 text-white hover:text-slate-300 transition cursor-pointer text-lg font-light flex items-center justify-center"
                  title="닫기"
                >
                  ✕
                </button>
                <span className="text-sm font-semibold tracking-tight text-white">
                  {proofFileName}
                </span>
              </div>
            </div>

            {/* 중앙 PDF 문서 영역 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-start relative">
              <div className="w-full max-w-[430px] bg-white shadow-2xl rounded-xs overflow-hidden border border-slate-300/80 mb-14">
                <img
                  src="/assets/resident_reg_doc.png"
                  alt="업로드된 증빙자료"
                  className="w-full h-auto object-contain block"
                />
              </div>
              {/* 페이지 인디케이터 */}
              <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                <div className="bg-[#383A3F]/90 backdrop-blur-xs text-white text-[11px] font-semibold px-3 py-0.5 rounded-full shadow-lg tracking-widest border border-white/10">
                  1/1
                </div>
              </div>
            </div>

            {/* 하단 다크 툴바 */}
            <div className="w-full px-8 py-3 bg-[#4D5057] text-white flex items-center justify-between border-t border-slate-600/50 shadow-inner z-20">
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = '/assets/resident_reg_doc.png';
                  a.download = '주민등록등본.png';
                  a.click();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer flex items-center justify-center"
                title="증빙자료 다운로드"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() =>
                  alert(
                    '📄 증빙서류 정보\n\n' +
                    '• 서류명: ' + (proofDocType === 'resident' ? '주민등록표(등본)' : '가족관계증명서') + '\n' +
                    '• 파일명: ' + proofFileName + '\n' +
                    '• 발급기관: 서울특별시 동대문구청장\n' +
                    '• 발급일자: 2025년 12월 18일'
                  )
                }
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer flex items-center justify-center"
                title="증빙자료 상세 정보"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2.5" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          // ── 증빙 미업로드 → 증빙자료 없음 안내 화면 ──
          <div className="flex-1 flex flex-col bg-white animate-in fade-in duration-200">
            {/* 헤더 */}
            <div className="w-full px-5 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode(previousViewMode || 'view')}
                  className="p-1 -ml-1 text-slate-800 hover:text-[#4F46E5] transition cursor-pointer"
                  title="뒤로가기"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <h1 className="text-base font-bold text-slate-900 tracking-tight">증빙자료</h1>
              </div>
            </div>

            {/* 빈 상태 */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-5">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-extrabold text-slate-700">증빙자료 없음</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  등록된 증빙자료가 없습니다.<br />
                  부양가족 추가 시 증빙자료를 업로드해 주세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviousViewMode(previousViewMode || 'view');
                  setViewMode('upload_proof');
                }}
                className="px-6 py-2.5 rounded-full bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-tight shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                증빙자료 업로드
              </button>
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: 이미지 3 - 부양가족 추가 방법 선택 바텀시트                         */}
      {/* ========================================================================= */}
      {showAddMethodModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom-5">
            {/* 헤더: 타이틀 + 우측 상단 X 버튼 */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                부양가족 추가 방법 선택
              </h3>
              <button
                type="button"
                onClick={() => setShowAddMethodModal(false)}
                className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="닫기"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 2개 선택 카드 (좌: 증빙자료 / 우: 직접등록) */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* 증빙자료 카드 */}
              <button
                type="button"
                onClick={() => setAddMethod('proof')}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between items-center text-center cursor-pointer min-h-[140px] ${
                  addMethod === 'proof'
                    ? 'border-[#4F46E5] bg-indigo-50/30 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="w-full flex justify-start">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      addMethod === 'proof'
                        ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {addMethod === 'proof' && (
                      <svg className="w-3 h-3 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center my-1 text-slate-700">
                  <svg className="w-7 h-7 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </div>

                <span className="text-sm font-bold text-slate-800">증빙자료</span>
              </button>

              {/* 직접등록 카드 */}
              <button
                type="button"
                onClick={() => setAddMethod('direct')}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between items-center text-center cursor-pointer min-h-[140px] ${
                  addMethod === 'direct'
                    ? 'border-[#4F46E5] bg-indigo-50/30 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="w-full flex justify-start">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      addMethod === 'direct'
                        ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {addMethod === 'direct' && (
                      <svg className="w-3 h-3 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center my-1 text-slate-700">
                  <svg className="w-7 h-7 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z" />
                    <circle cx="12" cy="14" r="2.5" />
                    <path d="M12 10.5v1M12 16.5v1M8.5 14h1M14.5 14h1" />
                  </svg>
                </div>

                <span className="text-sm font-bold text-slate-800">직접등록</span>
              </button>
            </div>

            {/* 하단 적용 버튼 */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleApplyAddMethod}
                className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: 이미지 4 - 조회/수집 자료 선택 바텀시트                            */}
      {/* ========================================================================= */}
      {showDocSelectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom-5">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              조회/수집 자료 선택
            </h3>

            {/* 라디오 목록 (주민등록등본 / 가족관계증명서) */}
            <div className="space-y-4 pt-1">
              <label
                onClick={() => setSelectedDoc('resident')}
                className="flex items-center gap-3 cursor-pointer select-none"
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                    selectedDoc === 'resident'
                      ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedDoc === 'resident' && (
                    <svg className="w-3 h-3 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm font-medium ${selectedDoc === 'resident' ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                  주민등록등본
                </span>
              </label>

              <label
                onClick={() => setSelectedDoc('family')}
                className="flex items-center gap-3 cursor-pointer select-none"
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                    selectedDoc === 'family'
                      ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedDoc === 'family' && (
                    <svg className="w-3 h-3 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm font-medium ${selectedDoc === 'family' ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                  가족관계증명서
                </span>
              </label>
            </div>

            {/* 하단 다음 버튼 */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleProceedToAuth}
                className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs tracking-wide shadow-xs transition cursor-pointer text-center"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 증빙 등록 알림 팝업 */}
      {showProofNotice && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full space-y-3 shadow-xl text-center">
            <span className="text-2xl">📎</span>
            <h4 className="font-bold text-slate-900 text-sm">부양가족 증빙서류 등록</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              주민등록등본 또는 가족관계증명서 PDF 파일을 등록하시면 자동으로 가족 구성원이 추출됩니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setShowProofNotice(false);
                setViewMode('upload_proof');
              }}
              className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-xs font-bold cursor-pointer hover:bg-[#4338CA] transition block text-center"
            >
              파일 선택하기
            </button>
            <button
              onClick={() => setShowProofNotice(false)}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: 부양가족공제 변동현황 팝업 (추가된 부양가족 동적 표시)               */}
      {/* ========================================================================= */}
      {showChangeModal && (() => {
        // 본인(isSelf)을 제외한 추가된 부양가족 목록
        const addedMembers = familyList.filter((f) => !f.isSelf && f.relation !== '본인');
        // 올해 태어난 아이 (birth에 '2025' 또는 '2026' 포함)
        const newborns = addedMembers.filter(
          (f) => f.birth && (f.birth.includes('2024') || f.birth.includes('2025') || f.birth.includes('2026'))
        );
        // 신규 추가된 일반 부양가족
        const newlyAdded = addedMembers.filter(
          (f) => !newborns.find((b) => b.id === f.id)
        );

        return (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center p-0"
            onClick={() => setShowChangeModal(false)}
          >
            <div
              className="w-full max-w-[430px] bg-white rounded-t-3xl p-5 pb-6 shadow-2xl space-y-3.5 animate-in slide-in-from-bottom-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight pt-1">
                부양가족공제 변동현황
              </h3>

              {/* 변동사항이 없는 경우 */}
              {addedMembers.length === 0 && (
                <div className="py-6 text-center">
                  <div className="text-3xl mb-3">🔍</div>
                  <p className="text-sm font-semibold text-slate-600">변동된 부양가족 정보가 없습니다.</p>
                  <p className="text-xs text-slate-400 mt-1">부양가족을 추가하면 여기에 변동현황이 표시됩니다.</p>
                </div>
              )}

              {/* 올해 태어난 신생아/영아 카드 (출산입양공제 대상) */}
              {newborns.map((baby) => (
                <div key={baby.id} className="bg-[#F8FAFC] rounded-2xl p-3.5 flex items-center gap-3.5 border border-slate-100">
                  <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                    <img
                      src="/assets/baby_avatar.jpg"
                      alt={baby.name}
                      className="w-full h-full object-contain mix-blend-multiply"
                    />
                  </div>
                  <div className="text-[13px] text-slate-700 leading-snug">
                    <div className="font-semibold text-slate-800">{baby.name}님은 올해 태어나셨네요!</div>
                    <div className="mt-0.5 text-slate-600">
                      부양가족공제와 <span className="font-extrabold text-slate-900">출산입양공제</span>를 받을 수 있어요.
                    </div>
                  </div>
                </div>
              ))}

              {/* 신규 추가된 일반 부양가족 카드 */}
              {newlyAdded.length > 0 && (
                <div className="bg-[#F8FAFC] rounded-2xl p-3.5 flex items-center gap-3.5 border border-slate-100">
                  <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                    <img
                      src="/assets/family_children_avatar.jpg"
                      alt={newlyAdded.map((f) => f.name).join(', ')}
                      className="w-full h-full object-contain mix-blend-multiply"
                    />
                    <span className="absolute bottom-0 right-0 bg-[#8B5CF6] text-[8px] font-black text-white px-1.5 py-0.5 rounded-full shadow-xs leading-none">
                      NEW
                    </span>
                  </div>
                  <div className="text-[13px] text-slate-700 leading-snug">
                    <div className="font-semibold text-slate-800">
                      {newlyAdded.length === 1
                        ? `${newlyAdded[0].name}님은 올해 부양가족으로 추가 되어`
                        : `${newlyAdded.map((f) => f.name).join('님과 ')}님은 올해 부양가족으로 추가 되어`}
                    </div>
                    <div className="mt-0.5 text-slate-600">
                      <span className="font-extrabold text-slate-900">부양가족공제</span>를 받을 수 있어요.
                    </div>
                  </div>
                </div>
              )}

              {/* 확인 버튼 */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangeModal(false)}
                  className="w-full py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm tracking-tight shadow-xs transition cursor-pointer text-center"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 공통 하단 플로팅 토스트 알림 (view, edit_list 등 모두 표시) */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
          <div className="bg-[#2B303A]/95 backdrop-blur-xs text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700/50">
            <span className="w-4 h-4 rounded-full bg-white/20 text-white flex items-center justify-center font-bold text-[10px]">
              !
            </span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

