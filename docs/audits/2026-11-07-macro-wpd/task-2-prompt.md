You are Codex gpt-6-sol implementing ONE task of docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md in this worktree (branch claude/macro-wpd-cn, base = origin/main 68701c48 + the plan). READ FIRST: the "修订 A" section at the top of the plan (it overrides the task text where they conflict), the "仓库约定" section, and docs/audits/2026-11-07-macro-wpd/RECONCILE-2026-11-16.md. Rules: strict TDD (write the failing test, run it, implement, run again); this sandbox has no network and tests must never touch the network; do not edit any file listed in docs/audits/2026-11-07-macro-wpd/v2-closure.txt (formula-hash closure of macro_regime@v2 — includes types.ts, catalog.ts, regime.ts, decimal.ts); do not edit src/components, messages/*, or any page; do not commit (the commander commits); keep the compact code style of src/lib/macro; no banned words (概率, 置信度, probability, confidence). Fixtures: only the files in src/lib/macro/fixtures/cn-http/ (excerpts, see manifest.json) — the full raw responses are NOT in the repo and must not be fetched. Finish with: files changed, exact commands run with pass/fail counts, deviations from the task and why.

TASK: plan Task 2 (LPR parser src/lib/macro/parsers/chinamoney.ts + chinamoney.test.ts). Overrides:
- Test fixtures are the excerpt files, not full-year files. src/lib/macro/fixtures/cn-http/CN_LPR_Q-2019.json = 7 real rows newest first (2019-12-20 … 2019-08-20, then pre-reform 2019-08-16 and 2019-08-15 with 5Y "---"); CN_LPR_Q-2026.json = 3 rows (2026-10-20, 09-20, 08-20, all 1Y 3.00, 5Y 3.50). Verify each fixture's sha256 against manifest.json "excerpt_sha256" in the test. Expected 2019 1Y points: 2019-08-20 4.25, 2019-09-20 4.2, 2019-10-21 4.2, 2019-11-20 4.15, 2019-12-20 4.15 (locators /records/4/1Y … /records/0/1Y); 5Y: 4.85, 4.85, 4.85, 4.8, 4.8. 2026: three points valueText 3 (1Y) and 3.5 (5Y), locators /records/2/1Y, /records/1/1Y, /records/0/1Y. The pre-reform rows are excluded by firstPeriod 2019-08-20 and by "---".
- Drop the "every yearly fixture … re-reads" test over eight files; instead add an OPT-IN replay block: describe.skipIf(!process.env.WPD_RAW_EVIDENCE_DIR) that reads every CN_LPR_Q-*.json in that directory (full original responses kept outside the repo), parses with field 1Y and 5Y, and for every point re-reads the value at the json_pointer locator from the bytes with a small independent pointer reader and asserts text equality after canonical(); and asserts the number of points per file equals the count of records with showDateCN >= 2019-08-20 and a non-"---" value for that field. Skipped by default; report that it is skipped.
- Keep every synthetic fail-closed case from the plan text (window refused message, rep_code != 200, tenor missing, bad value, bad date, bad json, empty records, duplicate same/different value).
- The parser is NOT registered in parsers/index.ts (parserFor unchanged).
Gates: npm test -- src/lib/macro/parsers/chinamoney.test.ts ; npm run typecheck ; npm run lint.

PLAN TEXT OF THE TASK (adapt per the overrides above; the overrides win):
### Task 2: LPR 解析器 `parsers/chinamoney.ts`

**Files:**
- Create: `src/lib/macro/parsers/chinamoney.ts`
- Test: `src/lib/macro/parsers/chinamoney.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/macro/parsers/chinamoney.test.ts
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {ChinamoneyParseError,CHINAMONEY_PARSER_VERSION,parseLprHis} from './chinamoney';

const FIX=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const manifest=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8')) as {files:{file:string;sha256:string}[]};
const bytesOf=(file:string)=>{const b=new Uint8Array(readFileSync(join(FIX,file)));expect(createHash('sha256').update(b).digest('hex')).toBe(manifest.files.find(f=>f.file===file)!.sha256);return b;};
const enc=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));
const doc=(records:unknown[],data:Record<string,unknown>={})=>enc({head:{rep_code:'200'},data:{startDateCN:'2026-01-01',endDateCN:'2026-12-31',baseCurveCfgList:['1Y','5Y'],message:'',...data},records});
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};
const Q1={seriesId:'CN_LPR_1Y_Q',field:'1Y' as const,firstPeriod:'2019-08-20'};

describe('parseLprHis (real fixture bytes)',()=>{
 it('2019: five reform-era quotes, ascending, pre-2019-08-20 daily rows and "---" excluded',()=>{
  const pts=parseLprHis(bytesOf('CN_LPR_Q-2019.json'),Q1);
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-08-20','4.25'],['2019-09-20','4.2'],['2019-10-21','4.2'],['2019-11-20','4.15'],['2019-12-20','4.15']]);
  expect(pts[0].locator).toEqual({kind:'json_pointer',pointer:'/records/4/1Y'});   // records are newest first in the file
  const five=parseLprHis(bytesOf('CN_LPR_Q-2019.json'),{...Q1,seriesId:'CN_LPR_5Y_Q',field:'5Y'});
  expect(five.map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-08-20','4.85'],['2019-09-20','4.85'],['2019-10-21','4.85'],['2019-11-20','4.8'],['2019-12-20','4.8']]);
 });
 it('2026: ten quotes through October, every 1Y = 3 and 5Y = 3.5',()=>{
  const pts=parseLprHis(bytesOf('CN_LPR_Q-2026.json'),Q1);
  expect(pts.map(p=>p.periodEnd)).toEqual(['2026-01-20','2026-02-24','2026-03-20','2026-04-20','2026-05-20','2026-06-22','2026-07-20','2026-08-20','2026-09-20','2026-10-20']);
  expect(new Set(pts.map(p=>p.valueText))).toEqual(new Set(['3']));
  expect(new Set(parseLprHis(bytesOf('CN_LPR_Q-2026.json'),{...Q1,field:'5Y'}).map(p=>p.valueText))).toEqual(new Set(['3.5']));
 });
 it('every yearly fixture parses and the pointer re-reads the same text from the bytes',()=>{
  for(const f of manifest.files.filter(f=>f.file.startsWith('CN_LPR_Q-'))){
   const b=bytesOf(f.file);const d=JSON.parse(new TextDecoder().decode(b));
   for(const p of parseLprHis(b,Q1)){const [,,i,field]=p.locator.kind==='json_pointer'?p.locator.pointer.split('/'):[];expect(d.records[Number(i)][field]).toMatch(/^\d+\.\d+$/);expect(Number(d.records[Number(i)][field])).toBe(Number(p.valueText));}
  }
 });
});
describe('parseLprHis (synthetic)',()=>{
 it('keeps a duplicate date with the same value once and refuses conflicting values',()=>{
  const r=(d:string,v:string)=>({'1Y':v,'5Y':'3.50',showDateEN:'x',showDateCN:d});
  expect(parseLprHis(doc([r('2026-02-24','3.00'),r('2026-02-24','3.00'),r('2026-01-20','3.10')]),Q1).map(p=>[p.periodEnd,p.valueText])).toEqual([['2026-01-20','3.1'],['2026-02-24','3']]);
  expect(codeOf(()=>parseLprHis(doc([r('2026-02-24','3.00'),r('2026-02-24','3.05')]),Q1))).toBe('lpr_conflicting_rows');
 });
 it('fails closed: window refused, bad rep_code, missing tenor, bad value, bad date, bad json',()=>{
  expect(codeOf(()=>parseLprHis(doc([],{message:'只提供一年历史数据查询及下载'}),Q1))).toBe('lpr_window_refused');
  expect(codeOf(()=>parseLprHis(enc({head:{rep_code:'500'},data:{message:''},records:[]}),Q1))).toBe('lpr_unsuccessful');
  expect(codeOf(()=>parseLprHis(doc([],{baseCurveCfgList:['1Y']}),{...Q1,field:'5Y'}))).toBe('lpr_tenor_missing');
  expect(codeOf(()=>parseLprHis(doc([{'1Y':'3,0','5Y':'3.5',showDateCN:'2026-01-20'}]),Q1))).toBe('lpr_bad_value');
  expect(codeOf(()=>parseLprHis(doc([{'1Y':'3.0','5Y':'3.5',showDateCN:'20 Jan 2026'}]),Q1))).toBe('lpr_bad_date');
  expect(codeOf(()=>parseLprHis(new TextEncoder().encode('<html>'),Q1))).toBe('lpr_bad_json');
  expect(parseLprHis(doc([]),Q1)).toEqual([]);   // an empty year window is not an error (the recorder refuses it; the parser just reports no points)
  expect(new ChinamoneyParseError('x').name).toBe('ChinamoneyParseError');expect(CHINAMONEY_PARSER_VERSION).toBe('chinamoney-lprhis/1');
 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/lib/macro/parsers/chinamoney.test.ts`
Expected: FAIL（`Cannot find module './chinamoney'`）。

- [ ] **Step 3: 实现**

```ts
// src/lib/macro/parsers/chinamoney.ts
// CFETS (chinamoney.org.cn) LPR history JSON → ParsedPoint (plan WP-D Task 2; spec P5 §5.3). Evidence = exact bytes of
// GET /ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate=…&strEndDate=…&pageNum=1&pageSize=50 (one calendar-year window;
// a wider window answers records:[] with data.message "只提供一年历史数据查询及下载" → lpr_window_refused, never "no data").
// records[] are newest first: {"1Y":"3.00","5Y":"3.50","showDateCN":"2026-10-20",…}; "---" = no quote for that tenor (the 5Y
// tenor starts 2019-08-20). Series definition: quotes on or after firstPeriod (2019-08-20, the reform mechanism); the daily
// pre-reform rows (1Y 4.31) are a different instrument and are excluded, not interpolated. Row key = showDateCN; the same date
// twice with the same text is one point; different texts → lpr_conflicting_rows (the whole page is refused). Locator:
// json_pointer /records/<index>/<field> into the recorded bytes. Values keep their text (canonical decimal, never Number()).
import {canonical} from '../decimal';
import {isIsoDate} from '../periods';
import type {ParsedPoint} from '../types';

export const CHINAMONEY_PARSER_VERSION='chinamoney-lprhis/1';
const PLAIN_DECIMAL=/^-?[0-9]+(\.[0-9]+)?$/;
export class ChinamoneyParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='ChinamoneyParseError';this.code=code;}
}
interface LprDoc{head?:{rep_code?:unknown};data?:{message?:unknown;baseCurveCfgList?:unknown};records?:unknown}

export function parseLprHis(bytes:Uint8Array,opts:{seriesId:string;field:'1Y'|'5Y';firstPeriod:string}):ParsedPoint[]{
 let doc:LprDoc;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ChinamoneyParseError('lpr_bad_json');}
 if(!doc||typeof doc!=='object'||doc.head?.rep_code!=='200')throw new ChinamoneyParseError('lpr_unsuccessful');
 const message=doc.data?.message;
 if(typeof message==='string'&&message!=='')throw new ChinamoneyParseError('lpr_window_refused',message);
 const tenors=doc.data?.baseCurveCfgList;
 if(!Array.isArray(tenors)||!tenors.includes(opts.field))throw new ChinamoneyParseError('lpr_tenor_missing',opts.field);
 if(!Array.isArray(doc.records))throw new ChinamoneyParseError('lpr_bad_json','records');
 const byDate=new Map<string,ParsedPoint>();
 doc.records.forEach((rec,i)=>{
  if(!rec||typeof rec!=='object')throw new ChinamoneyParseError('lpr_bad_row',`records/${i}`);
  const r=rec as Record<string,unknown>;
  const date=r.showDateCN;
  if(typeof date!=='string'||!isIsoDate(date))throw new ChinamoneyParseError('lpr_bad_date',`records/${i}`);
  if(date<opts.firstPeriod)return;
  const raw=r[opts.field];
  if(raw===undefined||raw===null||raw==='---'||raw==='')return;
  if(typeof raw!=='string'||!PLAIN_DECIMAL.test(raw))throw new ChinamoneyParseError('lpr_bad_value',`records/${i}/${opts.field}`);
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new ChinamoneyParseError('lpr_bad_value',`records/${i}/${opts.field}`);}
  const prev=byDate.get(date);
  if(prev){if(prev.valueText!==valueText)throw new ChinamoneyParseError('lpr_conflicting_rows',date);return;}
  byDate.set(date,{seriesId:opts.seriesId,periodEnd:date,valueText,locator:{kind:'json_pointer',pointer:`/records/${i}/${opts.field}`}});
 });
 return [...byDate.values()].sort((a,b)=>a.periodEnd<b.periodEnd?-1:1);
}
```

- [ ] **Step 4: 测试通过**

Run: `npm test -- src/lib/macro/parsers/chinamoney.test.ts`
Expected: PASS（7 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro/parsers/chinamoney.ts src/lib/macro/parsers/chinamoney.test.ts
git commit -F - <<'EOF'
feat(macro): chinamoney LprHis parser (json_pointer, reform-era quotes only, conflicting rows refused)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

