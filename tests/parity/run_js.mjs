// 화면 엔진(taxCalculator.js)으로 시나리오를 계산하고, 백엔드 입력(buildServerInputs)과 함께 JSON으로 출력
// 사용: node tests/parity/run_js.mjs <scenario.json>   (pytest test_engine_parity.py 가 호출)
import fs from 'fs';

const root = new URL('../../frontend/src/utils/', import.meta.url);
const tc = await import(new URL('taxCalculator.js', root).href);
const si = await import(new URL('serverInputs.js', root).href);

const sc = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const wh = sc.withholding;
const prev = sc.previousJobs || [];
const dd = sc.deductionData || {};
const fam = sc.familyList || [];
const userName = sc.userName || '본인';

const js = tc.calculateSettlementTax({
  userName, taxYear: '2025', withholdingData: wh, previousJobs: prev,
  deductionData: dd, hometaxData: null, familyList: fam,
});
const inputs = si.buildServerInputs({ jsResult: js, deductionData: dd, familyList: fam, withholdingData: wh, previousJobs: prev, userName });
process.stdout.write(JSON.stringify({ js, inputs }));
