import React, { useState, useEffect } from 'react';
import TaxStepProgressBar from '../components/TaxStepProgressBar';
import HomeButton from '../components/HomeButton';
import UserAuthStatus from '../components/UserAuthStatus';
import UploadProgressBar from '../components/UploadProgressBar';
import { taxService } from '../services/api';
import { getSecureItem } from '../utils/secureStorage';
import { validatePdfFile } from '../utils/fileValidation';
import { isIncomeExcessMember } from '../utils/eligibility';
import { removeUserTaxDataKey } from '../utils/userTaxStorage';

/**
 * [Step 3] 국세청 연말정산 간소화 자료 화면
 * 사용자 요구사항:
 * 1. 샘플 간소화자료 추출 칸 삭제
 * 2. PDF 업로드 파일 라인은 원천징수자료 페이지의 PDF 업로드 파일 라인과 같은 형식으로 통일
 *    (파일명 바로 옆 '서류보기 🔍', 우측 끝 삭제 '✕', 파일크기/등록시간 삭제)
 *    업로드 박스 및 버튼도 원천징수자료 페이지와 동일한 #4F46E5 인디고 컬러 적용
 * 3. 업로드된 PDF의 추출된 내용은 공제자료 입력부분에 자동 적용되고,
 *    PDF 삭제('✕') 시 공제자료입력의 국세청자료 부분은 자동으로 삭제(0원/초기화)
 */
export default function HometaxPage({
  onGoHome,
  onNext,
  onPrev,
  onGoInputData,
  onNavigateStep,
  onSaveData,
  onDataChange,
  onRemoveFile,
  userProfile,
  onSignOut,
  onLogin,
  initialData,
}) {
  // 연말정산간소화자료 업로드된 파일 상태 (localStorage 영속화)
  const [hometaxFile, setHometaxFile] = useState(() => {
    try {
      const dataSrc = initialData || (() => {
        const saved = localStorage.getItem('hometax_extracted_data');
        return saved ? JSON.parse(saved) : null;
      })();
      if (dataSrc && (dataSrc.uploaded || dataSrc.fileName)) {
        return {
          name: dataSrc.fileName,
          size: dataSrc.size || '',
        };
      }
    } catch {
      // ignore
    }
    return null;
  });

  // 추출된 간소화 데이터 상태
  const [extractedData, setExtractedData] = useState(() => {
    try {
      const dataSrc = initialData || (() => {
        const saved = localStorage.getItem('hometax_extracted_data');
        return saved ? JSON.parse(saved) : null;
      })();
      if (dataSrc) {
        const rowGuaranteed = Number(dataSrc.insurance_guaranteed || dataSrc.insurance || 0);
        return {
          ...dataSrc,
          insurance: rowGuaranteed,
        };
      }
      return null;
    } catch {
      // ignore
    }
    return null;
  });

  // initialData가 외부(App 복원)에서 갱신될 때 동기화
  useEffect(() => {
    if (initialData && (initialData.uploaded || initialData.fileName)) {
      const rowGuaranteed = Number(initialData.insurance_guaranteed || initialData.insurance || 0);
      setExtractedData({
        ...initialData,
        insurance: rowGuaranteed,
      });
      setHometaxFile({
        name: initialData.fileName,
        size: initialData.size || '',
      });
    }
  }, [initialData]);

  // 업로드한 실제 파일의 Object URL (문서 미리보기용)
  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  // 증빙 문서 확인 뷰어 열림 상태
  const [showDocViewer, setShowDocViewer] = useState(false);

  // 드래그 오버 및 AI 분석 로딩 상태
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [isUploadComplete, setIsUploadComplete] = useState(false);

  // 연말정산간소화자료 파일 업로드 핸들러
  const handleFileUpload = async (file) => {
    if (!file) return;

    // PDF 확장자 및 Content-Type 검증 + 20MB 이하 크기 제한 검증
    if (!validatePdfFile(file)) {
      return;
    }

    const fileName = file.name;
    const fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    try {
      const blobUrl = URL.createObjectURL(file);
      setFileBlobUrl(blobUrl);
    } catch (err) {
      console.error('Blob URL creation failed', err);
    }

    setUploadingFile({ name: fileName, size: fileSize });
    setIsAnalyzing(true);
    setIsUploadComplete(false);

    let parsedResult = null;
    let parseError = null;
    try {
      const formData = new FormData();
      formData.append('files', file);
      const res = await taxService.uploadDocuments(formData);
      if (res && res.length > 0 && res[0].parsed_json) {
        parsedResult = res[0].parsed_json;
      } else {
        parseError = 'PDF 파일에서 유효한 국세청 연말정산 간소화 자료 서식 및 텍스트를 추출하지 못했습니다.';
      }
    } catch (err) {
      console.error('Backend hometax upload/parse error:', err);
      parseError = '백엔드 서버 통신 장애가 발생했거나 파일 형식을 분석할 수 없습니다.';
    }

    setTimeout(() => {
      // 파싱 실패 또는 자료 누락 시 실패 원인 안내 (원천징수영수증 화면과 같은 방식)
      if (parseError || !parsedResult) {
        alert(
          `[국세청 간소화 자료 분석 안내]\n\n실패 원인: ${parseError || '데이터 파싱 실패'}\n\n서버 장애 또는 PDF 인식 실패로 인해 공제 자료를 불러오지 못했습니다. 홈택스에서 내려받은 원본 PDF로 재시도하시거나 공제자료 화면에서 수기로 입력해 주세요.`
        );
      } else if (!Array.isArray(parsedResult.persons) || parsedResult.persons.length === 0) {
        alert(
          `[국세청 간소화 자료 일부 누락 안내]\n\n업로드된 PDF에서 인별 공제 자료(보험료·의료비·교육비·카드 등)를 찾지 못했습니다. 홈택스 '연말정산 간소화' 자료 PDF가 맞는지 확인하시거나 수기로 입력해 주세요.`
        );
      }

      const isOcr = Boolean(parsedResult?.is_ocr_fallback);
      setHometaxFile({
        name: fileName,
        size: fileSize,
        isOcr: isOcr,
      });

      // 1. 등록된 부양가족 목록(본인 포함) 로드
      let familyList = [];
      try {
        familyList = getSecureItem('selftax_family_list', []);
      } catch (e) {
        console.warn('Failed to parse family list', e);
      }

      const rawPersons = Array.isArray(parsedResult?.persons) ? parsedResult.persons : [];

      // 2. 부양가족 매칭 (이름과 주민번호/생년월일 매칭)
      let matchedPersons = [];
      if (rawPersons.length > 0 && familyList.length > 0) {
        matchedPersons = rawPersons.filter((p) => {
          return familyList.some((fam) => {
            const famBirth = (fam.birth || fam.rrn || '').replace(/[^0-9]/g, '').slice(0, 6);
            const pBirth = (p.birth || p.rrn || '').replace(/[^0-9]/g, '').slice(0, 6);
            const birthMatch = famBirth && pBirth && famBirth === pBirth;

            const famName = (fam.name || '').trim();
            const pName = (p.name || '').trim();
            let nameMatch = famName === pName;
            if (!nameMatch && pName.includes('*')) {
              const pPrefix = pName.replace(/\*/g, '');
              nameMatch = pPrefix && famName.startsWith(pPrefix);
            }

            if (famBirth && pBirth && famName && pName) {
              return birthMatch && nameMatch;
            }
            return birthMatch || nameMatch;
          });
        }).map((p) => {
          // 가족 관계 속성 매핑
          const matchedFam = familyList.find((fam) => {
            const famBirth = (fam.birth || fam.rrn || '').replace(/[^0-9]/g, '').slice(0, 6);
            const pBirth = (p.birth || p.rrn || '').replace(/[^0-9]/g, '').slice(0, 6);
            const famName = (fam.name || '').trim();
            const pName = (p.name || '').trim();
            return (famBirth && pBirth && famBirth === pBirth) || (famName && pName && famName === pName);
          });
          return {
            ...p,
            relation: matchedFam?.relation || (matchedFam?.isSelf ? '본인' : '부양가족'),
            familyId: matchedFam?.id,
          };
        });
      }

      // 만약 등록된 부양가족 목록이 아직 없거나 매칭 결과가 비어있는 경우 전체 persons를 기본 채택
      if (matchedPersons.length === 0 && rawPersons.length > 0) {
        matchedPersons = rawPersons.map((p, idx) => ({
          ...p,
          relation: (p.name === '본인' || idx === 0) ? '본인' : '부양가족',
        }));
      }

      // 3. 매칭된 사람들의 항목별 합계 계산 (요구사항 2: 매칭된 사람들의 항목별 합계금액 표기)
      let health = 0, pension = 0, employment = 0, insurance = 0, medical = 0;
      let generalInsurance = 0, disabledInsurance = 0;
      let education = 0, credit = 0, debit = 0, cash = 0, donation = 0;
      let pension_saving = 0, long_invest = 0;
      let market = 0, transport = 0, culture = 0;
      let credit_card_culture = 0, debit_card_culture = 0, cash_receipt_culture = 0;

      if (matchedPersons.length > 0) {
        matchedPersons.forEach((mp) => {
          const items = mp.items || {};
          health = Math.max(health, Number(items.health_insurance) || 0);
          pension = Math.max(pension, Number(items.national_pension) || 0);
          employment = Math.max(employment, Number(items.employment_insurance) || 0);
          const pName = (mp.name || '').replace(/\(.*?\)/g, '').trim();
          const famForIncome = familyList.find((fam) => (fam.name || '').replace(/\(.*?\)/g, '').trim() === pName);
          const isIncomeExcess = Boolean(mp.income_excess || (famForIncome && isIncomeExcessMember(famForIncome)));

          let personGenIns = 0;
          let personDisIns = 0;
          const insList = Array.isArray(mp.insurance_details)
            ? mp.insurance_details
            : (Array.isArray(items.insurance_details) ? items.insurance_details : []);

          if (insList.length > 0) {
            insList.forEach((ins) => {
              const amt = Number(ins.amount) || 0;
              const typeStr = String(ins.type || ins.raw_type || '');
              if (typeStr.includes('장애인')) {
                personDisIns += amt;
              } else {
                personGenIns += amt;
              }
            });
          } else {
            personGenIns = Number(items.insurance_guaranteed || items.insurance) || 0;
          }

          if (!isIncomeExcess) {
            generalInsurance += personGenIns;
            disabledInsurance += personDisIns;
            insurance += (personGenIns + personDisIns);
          }
          medical += Number(items.medical_general) || 0;
          education += Number(items.education_child) || 0;
          credit += Number(items.credit_card_total ?? items.credit_card_general) || 0;
          debit += Number(items.debit_card_total ?? items.debit_card_cash) || 0;
          cash += Number(items.cash_receipt_total ?? items.cash_receipt) || 0;
          donation += Number(items.donation_amount) || 0;
          pension_saving += Number(items.personal_pension_saving || items.pension_saving) || 0;
          long_invest += Number(items.long_invest_amount || items.long_invest) || 0;
          market += Number(items.market_amount) || 0;
          transport += Number(items.transport_amount) || 0;
          culture += Number(items.culture_amount ?? items.culture_sports) || 0;
          credit_card_culture += Number(items.credit_card_culture) || 0;
          debit_card_culture += Number(items.debit_card_culture) || 0;
          cash_receipt_culture += Number(items.cash_receipt_culture) || 0;
        });
      } else {
        health = Number(parsedResult?.health_insurance) || 0;
        pension = Number(parsedResult?.national_pension) || 0;
        employment = Number(parsedResult?.employment_insurance) || 0;

        const insList = Array.isArray(parsedResult?.insurance_details) ? parsedResult.insurance_details : [];
        if (insList.length > 0) {
          insList.forEach((ins) => {
            const amt = Number(ins.amount) || 0;
            const typeStr = String(ins.type || ins.raw_type || '');
            if (typeStr.includes('장애인')) {
              disabledInsurance += amt;
            } else {
              generalInsurance += amt;
            }
          });
          insurance = generalInsurance + disabledInsurance;
        } else {
          generalInsurance = Number(parsedResult?.insurance_guaranteed || parsedResult?.insurance) || 0;
          disabledInsurance = Number(parsedResult?.insurance_disabled || parsedResult?.disabled_insurance) || 0;
          insurance = generalInsurance + disabledInsurance;
        }

        medical = Number(parsedResult?.medical_general || parsedResult?.medical) || 0;
        education = Number(parsedResult?.education_child || parsedResult?.education) || 0;
        credit = Number(parsedResult?.credit_card_total || parsedResult?.credit_card_general || parsedResult?.credit_card) || 0;
        debit = Number(parsedResult?.debit_card_total || parsedResult?.debit_card_cash || parsedResult?.debit_card) || 0;
        cash = Number(parsedResult?.cash_receipt_total || parsedResult?.cash_receipt || parsedResult?.cash) || 0;
        donation = Number(parsedResult?.donation_amount || parsedResult?.donation) || 0;
        pension_saving = Number(parsedResult?.personal_pension_saving || parsedResult?.pension_saving) || 0;
        long_invest = Number(parsedResult?.long_invest_amount || parsedResult?.long_invest) || 0;
        market = Number(parsedResult?.market_amount) || 0;
        transport = Number(parsedResult?.transport_amount) || 0;
        culture = Number(parsedResult?.culture_amount ?? parsedResult?.culture_sports) || 0;
        credit_card_culture = Number(parsedResult?.credit_card_culture) || 0;
        debit_card_culture = Number(parsedResult?.debit_card_culture) || 0;
        cash_receipt_culture = Number(parsedResult?.cash_receipt_culture) || 0;
      }

      // 국세청자료 페이지에서 보장성보험료 금액은 해당줄의 납입금액 계의 금액을 작성
      const rowGuaranteed = Number(parsedResult?.insurance_guaranteed || parsedResult?.insurance || 0);
      if (rowGuaranteed > 0) {
        insurance = rowGuaranteed;
      }

      const data = {
        ...(parsedResult || {}),
        uploaded: true,
        fileName: fileName,
        size: fileSize,
        isOcr: isOcr,
        health,
        pension,
        employment,
        insurance: rowGuaranteed > 0 ? rowGuaranteed : insurance,
        insurance_guaranteed: rowGuaranteed > 0 ? rowGuaranteed : insurance,
        generalInsurance,
        disabledInsurance,
        medical,
        education,
        credit,
        debit,
        cash,
        market,
        transport,
        culture,
        credit_card_culture,
        debit_card_culture,
        cash_receipt_culture,
        donation,
        pension_saving,
        long_invest,
        monthly_rent_paid: Number(parsedResult?.monthly_rent_paid || 0),
        rent_details: parsedResult?.rent_details || [],
        housing_rent_loan: Number(parsedResult?.housing_rent_loan || 0),
        matchedPersons: matchedPersons.length > 0 ? matchedPersons : rawPersons,
        persons: rawPersons,
      };

      setExtractedData(data);

      try {
        localStorage.setItem('hometax_extracted_data', JSON.stringify(data));
      } catch (e) {
        console.error('Failed to save hometax data', e);
      }

      // 공제자료 입력 부분에 즉시 적용
      if (onSaveData) {
        onSaveData(data);
      }

      if (onDataChange) {
        onDataChange(data);
      }

      // 파싱 및 데이터 반영 완료 -> 프로그레스 바 100% 가속 신호
      setIsUploadComplete(true);
    }, 400);
  };

  // 등록된 파일 삭제 (공제자료입력의 국세청자료 자동 삭제 연동)
  const handleRemoveFile = () => {
    setHometaxFile(null);
    setExtractedData(null);
    setFileBlobUrl(null);
    setShowDocViewer(false);

    try {
      localStorage.removeItem('hometax_extracted_data');
      localStorage.removeItem('selftax_housing_loan_checklist');
      localStorage.removeItem('selftax_housing_savings_checklist');
      localStorage.removeItem('selftax_rent_checklist');
      localStorage.removeItem('selftax_small_biz_checklist');
      const effId = userProfile?.id || 'guest';
      removeUserTaxDataKey(effId, 'hometax_extracted_data');

      // selftax_deduction_data가 존재하면 국세청(isNts, nts) 항목들을 필터링하여 제거
      const rawDed = localStorage.getItem('selftax_deduction_data');
      if (rawDed) {
        const ded = JSON.parse(rawDed);
        const listKeys = [
          'medicalItems', 'insuranceItems', 'cardItems', 'eduItems',
          'rentItems', 'housingLoanItems', 'housingSavingsItems',
          'pensionItems', 'donationItems', 'smallBizItems', 'longInvestItems', 'otherDeductItems'
        ];
        let hasAnyManual = false;
        listKeys.forEach((lk) => {
          if (Array.isArray(ded[lk])) {
            ded[lk] = ded[lk].filter((item) => !item.isNts && item.source !== 'nts');
            if (ded[lk].length > 0) hasAnyManual = true;
          }
        });
        if (hasAnyManual) {
          localStorage.setItem('selftax_deduction_data', JSON.stringify(ded));
        } else {
          localStorage.removeItem('selftax_deduction_data');
        }
      }
    } catch (e) {
      console.error(e);
    }

    // 요구사항: PDF 삭제 시 공제자료입력의 국세청자료 부분 자동 삭제 (null 전달)
    if (onSaveData) {
      onSaveData(null);
    }
    if (onDataChange) {
      onDataChange(null);
    }
    if (onRemoveFile) {
      onRemoveFile();
    }
  };

  // 다음 단계 이동 처리 (공제자료 입력으로 이동)
  const handleProceedNext = () => {
    if (hometaxFile && extractedData) {
      if (onSaveData) onSaveData(extractedData);
    } else {
      if (onSaveData) onSaveData(null);
    }

    if (onNext) {
      onNext();
    } else if (onGoInputData) {
      onGoInputData();
    }
  };

  // 공제항목 표시 목록 (더미값 제거 - 실제 추출 금액 표기)
  const summaryItems = [
    {
      id: 'health',
      name: '건강보험',
      amount: `${Number(extractedData?.health || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100/60 text-[#4F46E5] flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
        </div>
      ),
    },
    {
      id: 'pension',
      name: '국민연금',
      amount: `${Number(extractedData?.pension || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100/60 text-purple-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </div>
      ),
    },
    {
      id: 'employment',
      name: '고용보험',
      amount: `${Number(extractedData?.employment || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-100/60 text-sky-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
      ),
    },
    {
      id: 'insurance',
      name: '보장성보험료',
      amount: `${Number(extractedData?.insurance_guaranteed || extractedData?.insurance || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100/60 text-indigo-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
      ),
    },
    {
      id: 'medical',
      name: '의료비',
      amount: `${Number(extractedData?.medical || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100/60 text-rose-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="15" rx="3" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M12 11v6" />
            <path d="M9 14h6" />
          </svg>
        </div>
      ),
    },
    {
      id: 'education',
      name: '교육비',
      amount: `${Number(extractedData?.education || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100/60 text-emerald-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
      ),
    },
    {
      id: 'credit',
      name: '신용카드',
      amount: `${Number(extractedData?.credit || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>
      ),
    },
    {
      id: 'debit',
      name: '직불·체크카드',
      amount: `${Number(extractedData?.debit || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <circle cx="8" cy="15" r="1.5" />
            <line x1="13" y1="15" x2="18" y2="15" />
          </svg>
        </div>
      ),
    },
    {
      id: 'cash',
      name: '현금영수증',
      amount: `${Number(extractedData?.cash || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100/60 text-indigo-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a9 9 0 0 0-9 9c0 1.5.5 3 1.5 4.5L12 22l7.5-6.5c1-1.5 1.5-3 1.5-4.5a9 9 0 0 0-9-9z" />
          </svg>
        </div>
      ),
    },
    {
      id: 'donation',
      name: '기부금',
      amount: `${Number(extractedData?.donation || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100/60 text-amber-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </div>
      ),
    },
    {
      id: 'pension_saving',
      name: '연금저축',
      amount: `${Number(extractedData?.pension_saving || extractedData?.personal_pension_saving || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100/60 text-teal-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
      ),
    },
    {
      id: 'long_invest',
      name: '장기집합증권',
      amount: `${Number(extractedData?.long_invest || extractedData?.long_invest_amount || 0).toLocaleString()}원`,
      icon: (
        <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100/60 text-purple-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full min-h-screen bg-white flex flex-col justify-between font-sans select-none">
      {/* 1. 상단 헤더: ← 연말정산자료입력 + 캡슐형 홈화면 버튼 */}
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

      {/* 상단 파란색 5단계 프로세스 바 (Step 3: 국세청자료 활성화) */}
      <TaxStepProgressBar currentStep={3} onSelectStep={onNavigateStep} />

      {/* 2. 메인 스크롤 콘텐츠 */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        {/* 타이틀 및 서브텍스트 */}
        <div className="pt-1">
          <h2 className="text-[20px] font-extrabold text-slate-900 leading-snug tracking-tight">
            국세청 연말정산<br />
            간소화 자료를 반영해주세요.
          </h2>
          <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
            국세청 홈택스에서 내려받은 연말정산간소화자료(PDF)를 등록하시면 보험료, 의료비, 교육비, 신용카드 등 공제자료가 자동으로 정확하게 추출됩니다.
          </p>
        </div>

        {/* 1) 국세청 연말정산간소화자료 업로드 란 (원천징수자료 페이지와 동일한 인디고 테마 및 버튼) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className={`border-2 rounded-2xl p-5 bg-white flex flex-col items-center justify-between min-h-[190px] transition-all text-center relative ${
            isDragging
              ? 'border-[#4F46E5] bg-indigo-50/70 scale-[1.01] shadow-md ring-2 ring-[#4F46E5]/40'
              : hometaxFile
              ? 'border-[#4F46E5] bg-indigo-50/20 shadow-2xs'
              : 'border-[#4F46E5] hover:border-[#4338CA] shadow-2xs'
          }`}
        >
          {/* 상단 아이콘 및 안내 문구 */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 my-2">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center text-[#4F46E5] shadow-2xs">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-bold text-slate-800">
                연말정산간소화자료 (PDF) 업로드
              </div>
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                {isDragging ? '여기에 PDF 파일을 놓으세요!' : 'PDF파일을 드래그 드롭하거나 업로드하세요'}
              </p>
            </div>
          </div>

          {/* 업로드 버튼 (원천징수자료 페이지와 동일한 #4F46E5 인디고 버튼) */}
          <div className="w-full pt-2">
            <label
              className="w-full py-3.5 px-6 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.99] text-white font-bold text-[14px] transition cursor-pointer text-center flex items-center justify-center gap-2.5 shadow-sm"
            >
              <svg className="w-5 h-5 stroke-white" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>PDF 파일 업로드</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onClick={(e) => {
                  e.target.value = '';
                }}
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>

        {/* AI 분석 중 실시간 고성능 프로그레스 바 */}
        {isAnalyzing && (
          <UploadProgressBar
            isAnalyzing={isAnalyzing}
            fileName={uploadingFile?.name}
            fileSize={uploadingFile?.size}
            title="국세청 연말정산간소화 PDF 분석 중"
            isComplete={isUploadComplete}
            onComplete={() => {
              setIsAnalyzing(false);
              setIsUploadComplete(false);
            }}
          />
        )}

        {/* ========================================================================= */}
        {/* 업로드 완료 시: 파일 표기(원천징수자료 페이지와 동일한 형식) 및 공제자료 목록 */}
        {/* ========================================================================= */}
        {hometaxFile && !isAnalyzing && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* 1. 업로드된 PDF 파일 정보 카드 (파일명 바로 옆 '서류보기', 우측 삭제 'X') */}
            <div className="p-3 px-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/90 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200/70 text-red-600 flex flex-col items-center justify-center font-black text-[8.5px] shrink-0 shadow-2xs">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="-mt-0.5">PDF</span>
                </div>
                <span className="font-bold text-slate-800 text-[13px] truncate max-w-[170px] sm:max-w-[280px]">
                  {hometaxFile.name}
                </span>

                {hometaxFile.isOcr && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-extrabold text-[10px] border border-violet-200 shrink-0 flex items-center gap-1 shadow-2xs">
                    <span>✨</span>
                    <span>스캔본 AI 비전 추출</span>
                  </span>
                )}

                {/* 서류보기: 파일명 바로 옆에 배치 */}
                <button
                  type="button"
                  onClick={() => setShowDocViewer(true)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] font-bold text-[11px] border border-indigo-200/80 transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
                  title="업로드한 간소화자료 원본 서류 열람"
                >
                  <span>서류보기</span>
                  <span>🔍</span>
                </button>
              </div>

              {/* 우측 삭제 'X' 버튼 (클릭 시 공제자료입력 국세청자료 자동 삭제 연동) */}
              <button
                type="button"
                onClick={handleRemoveFile}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition cursor-pointer flex items-center justify-center font-bold text-sm shrink-0"
                title="삭제하고 다시 업로드"
              >
                ✕
              </button>
            </div>

            {/* 2. 국세청 PDF자료 항목 리스트 카드 */}
            <div className="bg-white rounded-2xl p-5 shadow-2xs border border-slate-200/90 space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    국세청 PDF자료 항목
                  </h3>
                </div>
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                  공제자료 자동 반영
                </span>
              </div>

              {/* 부양가족 매칭 적용 현황 (요구사항 2: 매칭된 사람들의 합계금액 표기 상태 표시) */}
              {extractedData?.matchedPersons && extractedData.matchedPersons.length > 0 && (
                <div className="p-2.5 px-3 rounded-xl bg-indigo-50/70 border border-indigo-100/90 text-[12px] flex flex-wrap items-center gap-1.5">
                  <span className="font-extrabold text-[#4F46E5] flex items-center gap-1">
                    <span>👥</span>
                    <span>부양가족 매칭 적용 ({extractedData.matchedPersons.length}명):</span>
                  </span>
                  {extractedData.matchedPersons.map((mp, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200/80 font-bold text-slate-700 text-[11px] shadow-2xs"
                    >
                      {mp.name} {mp.relation ? `(${mp.relation})` : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* 추출된 금액이 모두 0원인 경우(예: 스캔본 이미지 PDF) 친절한 안내 배너 표시 */}
              {summaryItems.every((item) => item.amount === '0원') && (
                <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-xl text-amber-900 text-xs leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <span>⚠️</span>
                    <span>문서에서 텍스트가 감지되지 않았습니다</span>
                  </div>
                  <p className="text-[11.5px] text-amber-700 font-medium">
                    업로드하신 파일이 <strong>스캔본(이미지)</strong>이거나 글자를 복사할 수 없는 보안 PDF인 경우 자동으로 금액을 읽을 수 없습니다. 국세청 홈택스에서 <strong>'전자문서(PDF)로 한번에 내려받기'</strong>한 원본 파일을 업로드해주시거나 [저장/다음] 버튼을 눌러 다음 단계에서 직접 수기로 입력해 주세요.
                  </p>
                </div>
              )}

              {/* 국세청 PDF자료 항목 리스트 */}
              <div className="space-y-2">
                {summaryItems.map((item) => (
                  <div
                    key={item.id}
                    className="w-full bg-[#F8FAFC] rounded-xl px-3.5 py-2.5 border border-slate-100 hover:border-indigo-200 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      {item.icon}
                      <span className="text-[13.5px] font-bold text-slate-800">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-[14px] font-extrabold text-slate-900 font-mono">
                      {item.amount}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3) 국세청 간소화자료 안내 및 유의사항 카드 (PDF 업로드 전후 항상 하단에 표기) */}
        {!isAnalyzing && (
          <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/40 via-white to-white p-5 space-y-4 text-xs text-slate-700 shadow-2xs">
            <div className="font-extrabold flex items-center justify-between pb-2.5 border-b border-indigo-100 text-[13.5px]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-2xs">
                  ⓘ
                </span>
                <span className="tracking-tight text-red-600 font-extrabold">국세청 간소화자료 안내 및 유의사항</span>
              </div>
              <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200/60 font-bold">
                필독
              </span>
            </div>

            {/* 항목 1 */}
            <div className="space-y-1.5">
              <div className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-[#4F46E5] flex items-center justify-center text-[10px] font-black shrink-0">
                  1
                </span>
                <span>국세청 홈택스 간소화자료 내려받기</span>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed pl-5.5">
                국세청 홈택스(<a href="https://www.hometax.go.kr" target="_blank" rel="noreferrer" className="text-[#4F46E5] underline font-semibold">www.hometax.go.kr</a>)에 접속 후 [연말정산간소화] 메뉴에서 각 공제항목을 조회하신 후, <strong className="text-[#4F46E5] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 font-extrabold">‘한번에 내려받기’</strong>를 통해 전자문서(PDF)를 다운로드하세요.
              </p>
            </div>

            {/* 항목 2 */}
            <div className="space-y-1.5 pt-0.5">
              <div className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-[#4F46E5] flex items-center justify-center text-[10px] font-black shrink-0">
                  2
                </span>
                <span>PDF 파일 비밀번호 설정 안내</span>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed pl-5.5">
                홈택스에서 PDF 파일 내려받기 시 <strong className="text-[#4F46E5] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 font-extrabold">‘비밀번호 설정’을 해제</strong>하고 내려받아야 시스템에서 자동으로 분석할 수 있습니다.
              </p>
            </div>

            {/* 항목 3 */}
            <div className="space-y-1.5 pt-0.5">
              <div className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-[#4F46E5] flex items-center justify-center text-[10px] font-black shrink-0">
                  3
                </span>
                <span>체크리스트 작성 필수 공제항목 안내</span>
              </div>
              <p className="text-[12px] text-slate-600 leading-relaxed pl-5.5">
                체크리스트 작성이 필요한 <strong className="text-[#4F46E5] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 font-extrabold">주택자금, 주택마련저축, 월세액, 소기업소상공인</strong> 내역은 연말정산 간소화 자료에 항목내용이 있더라도 자료가 추출되지 않습니다. 공제자료 입력에서 직접 입력해주세요.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. 하단 네비게이션 액션 바 */}
      <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer text-center"
        >
          이전
        </button>
        <button
          type="button"
          onClick={handleProceedNext}
          className="flex-1 py-3 px-4 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold transition shadow-xs cursor-pointer text-center flex items-center justify-center gap-1"
        >
          저장/다음
        </button>
      </div>

      {/* 4. 간소화 서류 원본 확인 뷰어 모달 */}
      {showDocViewer && hometaxFile && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#C2C5CD] select-none animate-in fade-in duration-200">
          {/* 상단 다크 헤더 */}
          <div className="w-full px-4 py-3.5 bg-[#4D5057] text-white flex items-center justify-between shadow-md z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDocViewer(false)}
                className="p-1 -ml-1 text-white hover:text-slate-300 transition cursor-pointer text-lg font-light flex items-center justify-center"
                title="닫기"
              >
                ✕
              </button>
              <span className="text-sm font-semibold tracking-tight text-white truncate max-w-[280px]">
                {hometaxFile.name}
              </span>
            </div>
          </div>

          {/* 중앙 PDF/문서 서류 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-start relative">
            <div className="w-full max-w-[440px] bg-white shadow-2xl rounded-xs overflow-hidden border border-slate-300/80 mb-14">
              {fileBlobUrl ? (
                <iframe
                  src={fileBlobUrl}
                  className="w-full h-[650px] border-0"
                  title="국세청 연말정산간소화 서류 미리보기"
                />
              ) : (
                <div className="p-6 text-slate-800 text-xs leading-relaxed font-sans bg-white space-y-4">
                  <div className="text-center pb-3 border-b-2 border-slate-800">
                    <h3 className="text-base font-extrabold text-slate-900 tracking-wider">
                      소득·세액공제 증명서
                    </h3>
                    <div className="text-[11px] text-slate-500 mt-1">
                      (국세청 연말정산 간소화 서비스 전자문서)
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] space-y-1">
                    <div><strong>성명:</strong> {userProfile?.name || '근로자'}</div>
                    <div><strong>귀속연도:</strong> 2025년도</div>
                    <div><strong>발급기관:</strong> 국세청 홈택스</div>
                  </div>
                  <div className="space-y-1.5 pt-2">
                    <div className="font-bold text-slate-700 text-xs mb-2">항목별 공제 증빙 내역</div>
                    {summaryItems.map((item) => (
                      <div key={item.id} className="flex justify-between py-1 border-b border-slate-100 text-[11.5px]">
                        <span className="text-slate-600">{item.name}</span>
                        <span className="font-bold text-slate-900 font-mono">{item.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 하단 다크 툴바 */}
          <div className="w-full px-8 py-3 bg-[#4D5057] text-white flex items-center justify-between border-t border-slate-600/50 shadow-inner z-20">
            <button
              type="button"
              onClick={() => {
                if (fileBlobUrl) {
                  const a = document.createElement('a');
                  a.href = fileBlobUrl;
                  a.download = hometaxFile.name;
                  a.click();
                } else {
                  alert('💾 간소화 서류 다운로드가 완료되었습니다.');
                }
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer flex items-center justify-center"
              title="증빙서류 다운로드"
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
                  '• 서류명: 소득·세액공제 증명서\n' +
                  '• 파일명: ' + hometaxFile.name + '\n' +
                  '• 발급기관: 국세청 홈택스\n' +
                  '• 귀속연도: 2025년도'
                )
              }
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition cursor-pointer flex items-center justify-center"
              title="증빙서류 상세 정보"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2.5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
