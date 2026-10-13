// 체크리스트 항목(주택자금·주택마련저축·소기업) 국세청 자료 → 입력 항목: PDF에 있는 행만 (node tests/ntsChecklist.test.mjs)
import assert from 'node:assert/strict';
import { buildNtsHousingLoanItems, buildNtsHousingSavingsItems, buildNtsSmallBizItems, classifyMortgageType, hasCurrentNtsItems, ntsSourceKey } from '../src/utils/ntsChecklistItems.js';

globalThis.localStorage = { getItem: () => null };

// PDF에 해당 자료가 없으면 아무것도 만들지 않는다 (예전에는 샘플 금액이 들어갔음)
const empty = { uploaded: true, fileName: 'a.pdf', size: '1 MB', persons: [{ name: '박주현' }] };
assert.deepEqual(buildNtsHousingLoanItems(empty, '박주현'), []);
assert.deepEqual(buildNtsHousingSavingsItems(empty, '박주현'), []);
assert.deepEqual(buildNtsSmallBizItems(empty, '박주현'), []);

const data = {
  uploaded: true, fileName: 'b.pdf', size: '2 MB',
  housing_loan_details: [
    { kind: 'rent_loan', bank: '(주)우리은행', bizNumber: '201-81-02819', account: '1320400123456', startDate: '2013-05-31', amount: 1515720 },
    { kind: 'mortgage', bank: '은행A', bizNumber: '104-86-39742', product: '주택자금대출', startDate: '2016-05-15', endDate: '2036-05-15', periodYears: 20, fixedRateAmount: 0, nonGraceAmount: 0, amount: 7167652 },
  ],
  housing_savings_details: [{ bank: '은행B', account: '123', type: '청약저축', joinDate: '1983-05-28', amount: 1200000 }],
};
const loans = buildNtsHousingLoanItems(data, '박주현(본인)');
assert.equal(loans.length, 2);
assert.equal(loans[0].type, '주택임차차입금(대출기관)');
assert.equal(loans[1].type, '장기주택저당차입금(2012이후 15년이상 기타)');
assert.equal(loans[1].name, '박주현');
assert.equal(loans[1].ntsKey, ntsSourceKey(data));
assert.equal(buildNtsHousingSavingsItems(data, '박주현')[0].amount, 1200000);

assert.equal(classifyMortgageType({ startDate: '2020-08-31', periodYears: 20, nonGraceAmount: 25000000 }), '장기주택저당차입금(2012이후 15년이상 고정OR비거치)');
assert.equal(classifyMortgageType({ startDate: '2010-01-01', periodYears: 30 }), '장기주택저당차입금(2011이전 30년이상)');

// 다른 PDF로 만든 기존 항목은 '현재 PDF 항목'이 아니다 → 새로 만든다
assert.equal(hasCurrentNtsItems([{ isNts: true, ntsKey: 'old.pdf|1 MB' }], ntsSourceKey(data)), false);
assert.equal(hasCurrentNtsItems([{ isNts: true }], ntsSourceKey(data)), false);
assert.equal(hasCurrentNtsItems(loans, ntsSourceKey(data)), true);
console.log('ntsChecklist tests ok');
