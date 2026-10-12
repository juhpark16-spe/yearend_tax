/**
 * 증빙서류(주민등록등본·가족관계증명서) 업로드 결과 → 부양가족 확인 목록
 * - 서버(/tax/upload)가 주민번호 뒷자리를 가린 뒤 뽑은 세대원·가족 목록을 부양가족 화면 항목 모양으로 바꾼다.
 * - 본인(세대주 본인)은 이미 목록에 있으므로 제외한다.
 * - 나이·소득 요건에 맞지 않으면 기본공제를 '해당없음'으로 둔다 (화면 판정과 같은 규칙).
 */
import { shouldExcludeBasicDeduction } from './eligibility.js';

const RELATION_LABEL = {
  SPOUSE: '배우자',
  CHILD: '자녀,손자녀,입양자',
  PARENT: '직계존속 (부/모)',
  SIBLING: '형제자매',
};

export const EXPECTED_DOC_TYPE = { resident: 'RESIDENT', family: 'FAMILY' };

/** @returns {{ items: Array, error: string|null }} */
export function membersFromProofUpload(uploaded = {}, docType = 'resident') {
  const expected = EXPECTED_DOC_TYPE[docType] || 'RESIDENT';
  const label = docType === 'family' ? '가족관계증명서' : '주민등록등본';
  if (!uploaded || uploaded.doc_type !== expected) {
    return { items: [], error: `올린 파일이 ${label}${docType === 'family' ? '로' : '으로'} 인식되지 않았습니다. ${label} PDF가 맞는지 확인해 주세요.` };
  }
  const pj = uploaded.parsed_json || {};
  const raw = expected === 'RESIDENT' ? pj.members : pj.family_members;
  const people = (Array.isArray(raw) ? raw : []).filter((m) => m && m.name && m.relation !== 'SELF');
  if (people.length === 0) {
    return { items: [], error: `${label}에서 본인 외 가족을 찾지 못했습니다. 직접등록으로 추가해 주세요.` };
  }
  const items = people.map((m, idx) => {
    const birth = String(m.birth_date || '');
    const six = String(m.masked_identifier || '').slice(0, 6).replace(/[^0-9]/g, '');
    const item = {
      id: `proof_${idx}`,
      name: m.name,
      birth: birth ? birth.replace(/-/g, '.') : '',
      rrn: six.length === 6 ? `${six}-*******` : '',
      relation: RELATION_LABEL[m.relation] || '형제자매',
      nationality: '내국인',
      isPublic: true,
      basicDeduction: '기본공제 (150만 원)',
      seniorDeduction: '해당없음',
      disabledDeduction: '해당없음',
      womanDeduction: '해당없음',
      singleParentDeduction: '해당없음',
      isSelf: false,
    };
    if (shouldExcludeBasicDeduction(item)) item.basicDeduction = '해당없음';
    return item;
  });
  return { items, error: null };
}
