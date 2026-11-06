## Part B — 纯函数模块（versions / behavior / schema / locate / typed / tickers / merge / rules / disclosure / overlap / grounding）

本部分全部是纯模块：不连数据库、不联网；`resolveTargets` 只经注入的 `TableClient`（单测用 `src/lib/db/memory-table-client.ts::memoryTableClient`）。所有代码已在隔离镜像中以 vitest 4 + `tsc --strict` 实跑通过（Part B 共 11 个测试文件、145 个用例；`tsc --strict` 0 错误；eslint `--max-warnings=0` 通过）；实施时按 TDD 先落测试、看到失败、再落实现。

**Part B 新增、计划文件结构未列出的文件**（均在本模块目录内）：`src/lib/broker-research/decimal.ts`（B1；定标 BigInt 十进制运算，B1/B4/B5 共用）、`fixtures/synthetic-pages.json`、`fixtures/synthetic-extraction.json`（B1）。R1 所需的产物读取类型 `PageText={page:number;text:string}[]` 与 `sliceText(pages,page,start,end)` 定义在 `extract/locate.ts`（B1），`rules.ts` 与核验 cron（E1）从那里 import；F3 产物到 `PageText` 的映射由 C4 适配。

**执行顺序约束**：B1 在 A4 之前执行，此时 `types.ts`/`hash.ts`/`effective.ts` 尚不存在——B1 的 `typed.ts` 用本地类型别名，B2 第 1 步改为 `import type … from '../types'`（B2 Files 列出该修改）；`behavior.ts` 直接用 `node:crypto`，不依赖 `hash.ts`。B2–B5 依赖 A4 落地的 `types.ts`（`FieldName/TypedValue/FieldRow/TargetRow/RatingScaleRow/ReportRow/RuleResult/CandidateFieldInput/DisclosureCheck/GroundingResult/GroundingAssertion/ValueUnit`）、`hash.ts`（`canonicalJson/sha256Hex`）、`effective.ts`（`effectiveValue`）。

### Task B1: versions / decimal / behavior / extract schema / locate / typed + 合成夹具

**Files:**
- Create: `src/lib/broker-research/versions.ts`
- Create: `src/lib/broker-research/decimal.ts`
- Create: `src/lib/broker-research/behavior.ts`
- Create: `src/lib/broker-research/extract/schema.ts`
- Create: `src/lib/broker-research/extract/locate.ts`
- Create: `src/lib/broker-research/extract/typed.ts`
- Create: `src/lib/broker-research/fixtures/synthetic-pages.json`
- Create: `src/lib/broker-research/fixtures/synthetic-extraction.json`
- Test: `src/lib/broker-research/decimal.test.ts`
- Test: `src/lib/broker-research/behavior.test.ts`
- Test: `src/lib/broker-research/extract/schema.test.ts`
- Test: `src/lib/broker-research/extract/locate.test.ts`
- Test: `src/lib/broker-research/extract/typed.test.ts`

- [ ] **Step 1: 写合成夹具**（虚构机构 / 虚构证券 `NWND US` / `9999 HK`，标注 SYNTHETIC；第 2 页含一个代理对字符 🚀 用于偏移测试；`US$120/96−1=0.25`、`HK$936/748.80−1=0.25`）

`src/lib/broker-research/fixtures/synthetic-pages.json`:
```json
[
 {
  "page": 1,
  "text": "SYNTHETIC FIXTURE - not a real report\nSynthetic Broker Ltd\nNorthwind Holdings: Initiate at Overweight\nNorthwind Holdings (NWND US / 9999 HK)\nRating: Overweight; target price US$120.00\n5 November 2026\nAnalysts: Jane Roe, CFA; 李明\n"
 },
 {
  "page": 2,
  "text": "Valuation: DCF, WACC 9.5%, terminal growth 3.0%.\nSector: Internet 🚀 platforms\nPrice (4 Nov 2026): US$96.00. Upside 25.0% on a 12-month horizon.\nHK line: target price HK$936.00; price HK$748.80 as of 2026-11-04.\n"
 }
]
```

`src/lib/broker-research/fixtures/synthetic-extraction.json`:
```json
{
 "scope": "single_issuer",
 "institution": {
  "value": "Synthetic Broker Ltd",
  "page": 1,
  "quote": "Synthetic Broker Ltd",
  "confidence": 0.95
 },
 "analysts": [
  {
   "value": "Jane Roe",
   "page": 1,
   "quote": "Jane Roe",
   "confidence": 0.95
  },
  {
   "value": "李明",
   "page": 1,
   "quote": "李明",
   "confidence": 0.95
  }
 ],
 "published_date": {
  "value": "5 November 2026",
  "page": 1,
  "quote": "5 November 2026",
  "confidence": 0.95
 },
 "title": {
  "value": "Northwind Holdings: Initiate at Overweight",
  "page": 1,
  "quote": "Northwind Holdings: Initiate at Overweight",
  "confidence": 0.95
 },
 "sector": {
  "value": "Internet 🚀 platforms",
  "page": 2,
  "quote": "Internet 🚀 platforms",
  "confidence": 0.95
 },
 "valuation_method": {
  "value": "DCF",
  "page": 2,
  "quote": "DCF",
  "confidence": 0.95
 },
 "wacc": {
  "value": "9.5%",
  "page": 2,
  "quote": "9.5%",
  "confidence": 0.95
 },
 "terminal_growth": {
  "value": "3.0%",
  "page": 2,
  "quote": "3.0%",
  "confidence": 0.95
 },
 "targets": [
  {
   "ticker": {
    "value": "NWND US",
    "page": 1,
    "quote": "NWND US",
    "confidence": 0.95
   },
   "rating": {
    "value": "Overweight",
    "page": 1,
    "quote": "Overweight",
    "confidence": 0.95
   },
   "target_price": {
    "value": "US$120.00",
    "page": 1,
    "quote": "US$120.00",
    "confidence": 0.95
   },
   "target_currency": {
    "value": "USD",
    "page": 1,
    "quote": "US$",
    "confidence": 0.95
   },
   "target_horizon_months": {
    "value": "12-month",
    "page": 2,
    "quote": "12-month",
    "confidence": 0.95
   },
   "price_at_report": {
    "value": "US$96.00",
    "page": 2,
    "quote": "US$96.00",
    "confidence": 0.95
   },
   "price_currency": {
    "value": "USD",
    "page": 2,
    "quote": "US$",
    "confidence": 0.95
   },
   "price_as_of_date": {
    "value": "4 Nov 2026",
    "page": 2,
    "quote": "4 Nov 2026",
    "confidence": 0.95
   },
   "upside_stated": {
    "value": "25.0%",
    "page": 2,
    "quote": "25.0%",
    "confidence": 0.95
   }
  },
  {
   "ticker": {
    "value": "9999 HK",
    "page": 1,
    "quote": "9999 HK",
    "confidence": 0.95
   },
   "exchange_hint": "HKEX",
   "target_price": {
    "value": "HK$936.00",
    "page": 2,
    "quote": "HK$936.00",
    "confidence": 0.95
   },
   "target_currency": {
    "value": "HKD",
    "page": 2,
    "quote": "HK$",
    "confidence": 0.95
   },
   "price_at_report": {
    "value": "HK$748.80",
    "page": 2,
    "quote": "HK$748.80",
    "confidence": 0.95
   },
   "price_currency": {
    "value": "HKD",
    "page": 2,
    "quote": "HK$",
    "confidence": 0.95
   },
   "price_as_of_date": {
    "value": "2026-11-04",
    "page": 2,
    "quote": "2026-11-04",
    "confidence": 0.95
   }
  }
 ]
}
```

- [ ] **Step 2: 写失败测试**

`src/lib/broker-research/decimal.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {dec,decAdd,decCmp,decDiv,decMul,decRound,decShift,decString,decSub,round1} from './decimal';

describe('decimal',()=>{
 it('parses and prints canonical decimals without Number',()=>{
  expect(decString(dec('120.00'))).toBe('120');
  expect(decString(dec('-0.0'))).toBe('0');
  expect(decString(dec('1e-3'))).toBe('0.001');
  expect(decString(dec('12345678901234567890.123456789'))).toBe('12345678901234567890.123456789');
  expect(()=>dec('1,000')).toThrow('invalid_decimal');
 });
 it('adds, subtracts, multiplies and compares exactly',()=>{
  expect(decString(decAdd(dec('0.1'),dec('0.2')))).toBe('0.3');
  expect(decString(decSub(dec('120'),dec('96.5')))).toBe('23.5');
  expect(decString(decMul(dec('0.25'),dec('96')))).toBe('24');
  expect(decCmp(dec('0.30'),dec('0.3'))).toBe(0);
  expect(decCmp(dec('-1'),dec('0.5'))).toBe(-1);
 });
 it('shifts by powers of ten',()=>{
  expect(decString(decShift(dec('12.5'),-2))).toBe('0.125');
  expect(decString(decShift(dec('0.125'),2))).toBe('12.5');
  expect(decString(decShift(dec('3'),3))).toBe('3000');
 });
 it('rounds half away from zero',()=>{
  expect(round1('25.25')).toBe('25.3');
  expect(round1('25.24')).toBe('25.2');
  expect(round1('-25.25')).toBe('-25.3');
  expect(round1('0.05')).toBe('0.1');
  expect(round1('7')).toBe('7');
  expect(decString(decRound(dec('1.995'),2))).toBe('2');
 });
 it('divides for display with rounding',()=>{
  expect(decString(decDiv(dec('120'),dec('96'),6))).toBe('1.25');
  expect(decString(decDiv(dec('1'),dec('3'),4))).toBe('0.3333');
  expect(decString(decDiv(dec('-2'),dec('3'),2))).toBe('-0.67');
  expect(()=>decDiv(dec('1'),dec('0'),2)).toThrow('division_by_zero');
 });
});
```

`src/lib/broker-research/behavior.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {BEHAVIOR_DIGEST_INPUTS,behaviorDigest,behaviorDigestValues} from './behavior';
import * as V from './versions';

const base={extractorVersion:'f3/1',modelId:'model-a',registryHash:'r'.repeat(64),promptVersion:V.EXTRACT_PROMPT_VERSION,schemaVersion:V.SCHEMA_VERSION};

describe('behavior digest (spec §4.3)',()=>{
 it('lists exactly the spec §4.3 inputs in order',()=>{
  expect(BEHAVIOR_DIGEST_INPUTS).toEqual(['extractor_version','model_id','registry_hash','prompt_version','schema_version','typed_version','merge_version','locate_version','ticker_version','currency_marks_version']);
  expect(behaviorDigestValues(base)).toEqual(['f3/1','model-a','r'.repeat(64),'broker-extract/1','extract-schema/1','typed/1','merge/1','locate/1','parseBrokerTicker/1','currency-marks/1']);
 });
 it('is sha256 of the JSON string array and deterministic',()=>{
  const want=createHash('sha256').update(JSON.stringify(behaviorDigestValues(base)),'utf8').digest('hex');
  expect(behaviorDigest(base)).toBe(want);
  expect(behaviorDigest({...base})).toBe(want);
  expect(want).toMatch(/^[0-9a-f]{64}$/);
 });
 it('changes when any run input changes',()=>{
  const d=behaviorDigest(base);
  for(const k of Object.keys(base) as (keyof typeof base)[])expect(behaviorDigest({...base,[k]:`${base[k]}x`})).not.toBe(d);
 });
 it('rejects missing inputs',()=>{
  expect(()=>behaviorDigest({...base,modelId:''})).toThrow('behavior_input_missing:model_id');
  expect(()=>behaviorDigest({...base,registryHash:' '})).toThrow('behavior_input_missing:registry_hash');
 });
 it('pins the version constants the digest and SQL depend on',()=>{
  expect(V).toMatchObject({TYPED_VERSION:'typed/1',MERGE_VERSION:'merge/1',LOCATE_VERSION:'locate/1',TICKER_VERSION:'parseBrokerTicker/1',CURRENCY_MARKS_VERSION:'currency-marks/1',RULES_VERSION:'broker-rules/1',DISCLOSURE_VERSION:'disclosure/1',GROUNDING_VERSION:'grounding/1',OVERLAP_VERSION:'overlap/1',SCHEMA_VERSION:'extract-schema/1',EXTRACT_PROMPT_VERSION:'broker-extract/1',SUMMARY_PROMPT_VERSION:'independent-summary/1',UPSIDE_FORMULA_VERSION:'upside/1',CLAIM_METHODOLOGY_VERSION:'broker-claim/1'});
 });
});
```

`src/lib/broker-research/extract/schema.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {QUOTE_MAX_CHARS,validateExtraction} from './schema';
import fixture from '../fixtures/synthetic-extraction.json';

const clone=()=>structuredClone(fixture) as Record<string,any>;

describe('extract-schema/1 (spec §5.2)',()=>{
 it('accepts the synthetic fixture',()=>{
  const r=validateExtraction(clone());
  expect(r.ok).toBe(true);
 });
 it('accepts a minimal sector report with no targets and no analysts',()=>{
  const e={value:'x',page:1,quote:'x',confidence:0};
  expect(validateExtraction({scope:'sector',institution:e,analysts:[],published_date:e,title:e,targets:[]}).ok).toBe(true);
 });
 it('rejects additional properties at every level',()=>{
  const top=clone();top.extra=1;
  const ev=clone();ev.institution.note='x';
  const tg=clone();tg.targets[0].latest_price={value:'1',page:1,quote:'1',confidence:1};
  for(const v of [top,ev,tg]){const r=validateExtraction(v);expect(r.ok).toBe(false);if(!r.ok)expect(r.errors.join(';')).toContain('must NOT have additional properties');}
 });
 it('requires the top-level and target keys',()=>{
  for(const k of ['scope','institution','analysts','published_date','title','targets']){const v=clone();delete v[k];expect(validateExtraction(v).ok).toBe(false);}
  const v=clone();delete v.targets[0].ticker;expect(validateExtraction(v).ok).toBe(false);
 });
 it('enforces Evidence bounds: page ≥ 1 integer, confidence 0..1, non-empty quote ≤ 400',()=>{
  const bad=[(v:any)=>{v.title.page=0;},(v:any)=>{v.title.page=1.5;},(v:any)=>{v.title.confidence=1.01;},(v:any)=>{v.title.confidence=-0.1;},
   (v:any)=>{v.title.quote='';},(v:any)=>{v.title.quote='a'.repeat(QUOTE_MAX_CHARS+1);},(v:any)=>{v.title.value='';},(v:any)=>{v.scope='company';},
   (v:any)=>{v.analysts=[{value:'x',page:1,quote:'x'}];},(v:any)=>{v.targets[0].exchange_hint='';}];
  for(const f of bad){const v=clone();f(v);expect(validateExtraction(v).ok).toBe(false);}
  const ok=clone();ok.title.quote='字'.repeat(QUOTE_MAX_CHARS);expect(validateExtraction(ok).ok).toBe(true);
 });
 it('counts the quote cap in code points (an astral char is one)',()=>{
  const v=clone();v.title.quote='🚀'.repeat(QUOTE_MAX_CHARS);expect(validateExtraction(v).ok).toBe(true);
 });
 it('reports error paths',()=>{
  const v=clone();v.targets[1].target_price.page='2';
  const r=validateExtraction(v);
  expect(r.ok).toBe(false);if(!r.ok)expect(r.errors).toContain('/targets/1/target_price/page must be integer');
  const root=validateExtraction(null);expect(root.ok).toBe(false);if(!root.ok)expect(root.errors[0]).toMatch(/^\/ /);
 });
});
```

`src/lib/broker-research/extract/locate.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {locateQuote,pageText,sliceText,type PageText} from './locate';
import pages from '../fixtures/synthetic-pages.json';

const P:PageText=pages;

describe('locateQuote (spec §5.2, UTF-16 code units)',()=>{
 it('locates a quote and the span slices back verbatim',()=>{
  const r=locateQuote(P,1,'US$120.00');
  expect(r).toMatchObject({status:'located',page:1,multiple_hits:null,version:'locate/1'});
  if(r.status==='located')expect(sliceText(P,1,r.char_start,r.char_end)).toBe('US$120.00');
 });
 it('counts an astral character before the quote as two code units',()=>{
  const r=locateQuote(P,2,'platforms');
  const text=pageText(P,2)!;
  expect(r.status).toBe('located');
  if(r.status==='located'){
   expect(r.char_start).toBe(text.indexOf('platforms'));
   expect(text.indexOf('platforms')-text.indexOf('🚀')).toBe(3);   // 2 units for the emoji + 1 space
   expect(sliceText(P,2,r.char_start,r.char_end)).toBe('platforms');
  }
 });
 it('locates a quote containing a surrogate pair',()=>{
  const r=locateQuote(P,2,'Internet 🚀 platforms');
  expect(r.status).toBe('located');
  if(r.status==='located')expect(r.char_end-r.char_start).toBe('Internet 🚀 platforms'.length);
 });
 it('never reports a hit that splits a surrogate pair',()=>{
  const low='🚀'.charAt(1),high='🚀'.charAt(0);
  expect(locateQuote(P,2,`${low} platforms`)).toMatchObject({status:'unverified',reason:'splits_surrogate_pair'});
  expect(locateQuote(P,2,`Internet ${high}`)).toMatchObject({status:'unverified',reason:'splits_surrogate_pair'});
 });
 it('reports every hit (overlapping ones too) and uses the first',()=>{
  const r=locateQuote(P,1,'Overweight');
  const text=pageText(P,1)!;
  expect(r).toMatchObject({status:'located',char_start:text.indexOf('Overweight'),multiple_hits:[text.indexOf('Overweight'),text.lastIndexOf('Overweight')]});
  expect(locateQuote([{page:1,text:'aaa'}],1,'aa')).toMatchObject({char_start:0,multiple_hits:[0,1]});
 });
 it('a quote that differs by one space is unverified (acceptance sample 2)',()=>{
  expect(locateQuote(P,1,'US$ 120.00')).toMatchObject({status:'unverified',reason:'not_found'});
  expect(locateQuote(P,1,'target price  US$120.00')).toMatchObject({status:'unverified',reason:'not_found'});
 });
 it('does not search other pages, normalize case or width',()=>{
  expect(locateQuote(P,2,'US$120.00').status).toBe('unverified');
  expect(locateQuote(P,1,'us$120.00').status).toBe('unverified');
  expect(locateQuote(P,1,'ＵＳ$120.00').status).toBe('unverified');
 });
 it('missing page and empty quote',()=>{
  expect(locateQuote(P,9,'x')).toMatchObject({status:'unverified',reason:'page_missing',page:9});
  expect(locateQuote(P,1,'')).toMatchObject({status:'unverified',reason:'empty_quote'});
 });
 it('rejects duplicate page numbers in an artifact',()=>{
  expect(()=>locateQuote([{page:1,text:'a'},{page:1,text:'b'}],1,'a')).toThrow('duplicate_page:1');
 });
});

describe('sliceText',()=>{
 const T:PageText=[{page:1,text:'ab🚀cd'}];
 it('slices by code units and fails closed on bad spans',()=>{
  expect(sliceText(T,1,2,4)).toBe('🚀');
  expect(sliceText(T,1,0,0)).toBe('');
  expect(sliceText(T,1,3,4)).toBeNull();      // starts inside the pair
  expect(sliceText(T,1,2,3)).toBeNull();      // ends inside the pair
  expect(sliceText(T,1,-1,2)).toBeNull();
  expect(sliceText(T,1,3,2)).toBeNull();
  expect(sliceText(T,1,0,7)).toBeNull();
  expect(sliceText(T,1,0.5,2)).toBeNull();
  expect(sliceText(T,2,0,1)).toBeNull();
 });
});
```

`src/lib/broker-research/extract/typed.test.ts`（§5.3 表逐行一个用例）:
```ts
import {describe,it,expect} from 'vitest';
import {CURRENCY_MARKS,currencyMarksIn,toTyped} from './typed';

const v=(value_text:string,o:{num?:string;cur?:string;unit?:'pct'|'months'|'price';date?:string}={})=>({value:{value_text,value_num:o.num??null,value_currency:o.cur??null,value_unit:o.unit??null,value_date:o.date??null},failure:null});

describe('toTyped — spec §5.3 table, one block per row',()=>{
 it('row 1: target_price / price_at_report → canonical number string, value_num, unit price, no currency',()=>{
  for(const f of ['target_price','price_at_report'] as const){
   expect(toTyped(f,'US$120.00')).toEqual(v('120',{num:'120',unit:'price'}));
   expect(toTyped(f,'HK$ 1,234.50')).toEqual(v('1234.5',{num:'1234.5',unit:'price'}));
   expect(toTyped(f,'Rmb1,800')).toEqual(v('1800',{num:'1800',unit:'price'}));
   expect(toTyped(f,'1800元')).toEqual(v('1800',{num:'1800',unit:'price'}));
   expect(toTyped(f,'１２０．５')).toEqual(v('120.5',{num:'120.5',unit:'price'}));
   expect(toTyped(f,'n/a')).toEqual({value:{value_text:'n/a',value_num:null,value_currency:null,value_unit:null,value_date:null},failure:'not_a_number'});
   expect(toTyped(f,'120-130').failure).toBe('not_a_number');
   expect(toTyped(f,'1,23').failure).toBe('not_a_number');
  }
 });
 it('row 2: target_currency / price_currency → ISO code in value_text and value_currency',()=>{
  for(const f of ['target_currency','price_currency'] as const){
   expect(toTyped(f,'USD','US$')).toEqual(v('USD',{cur:'USD'}));
   expect(toTyped(f,'hkd','HK$')).toEqual(v('HKD',{cur:'HKD'}));
   expect(toTyped(f,'CNY','Rmb')).toEqual(v('CNY',{cur:'CNY'}));
   expect(toTyped(f,'CNY','人民币')).toEqual(v('CNY',{cur:'CNY'}));
   expect(toTyped(f,'US$')).toEqual(v('USD',{cur:'USD'}));          // a mark as value maps to ISO
   expect(toTyped(f,'港元')).toEqual(v('HKD',{cur:'HKD'}));
   expect(toTyped(f,'EUR','€')).toMatchObject({failure:'unknown_currency',value:{value_currency:null}});
   expect(toTyped(f,'$')).toMatchObject({failure:'unknown_currency'});
   expect(toTyped(f,'USD','HK$')).toMatchObject({failure:'currency_mark_mismatch',value:{value_text:'USD',value_currency:null}});
   expect(toTyped(f,'USD','price')).toMatchObject({failure:'currency_mark_mismatch'});
   expect(toTyped(f,'USD','US$ / HK$')).toMatchObject({failure:'currency_mark_mismatch'});
  }
 });
 it('row 3: upside_stated / wacc / terminal_growth / terminal_value_share → original text, decimal, unit pct',()=>{
  for(const f of ['upside_stated','wacc','terminal_growth','terminal_value_share'] as const){
   expect(toTyped(f,'12.5%')).toEqual(v('12.5%',{num:'0.125',unit:'pct'}));
   expect(toTyped(f,'+25.0 %')).toEqual(v('+25.0 %',{num:'0.25',unit:'pct'}));
   expect(toTyped(f,'−8%')).toEqual(v('−8%',{num:'-0.08',unit:'pct'}));
   expect(toTyped(f,'３％')).toEqual(v('３％',{num:'0.03',unit:'pct'}));
   expect(toTyped(f,'0.125')).toMatchObject({failure:'not_a_percentage',value:{value_text:'0.125',value_num:null,value_unit:null}});
   expect(toTyped(f,'n/a').failure).toBe('not_a_percentage');
  }
 });
 it('row 4: target_horizon → original text, months, unit months',()=>{
  expect(toTyped('target_horizon','12-month')).toEqual(v('12-month',{num:'12',unit:'months'}));
  expect(toTyped('target_horizon','12 months')).toEqual(v('12 months',{num:'12',unit:'months'}));
  expect(toTyped('target_horizon','18个月')).toEqual(v('18个月',{num:'18',unit:'months'}));
  expect(toTyped('target_horizon','1 year')).toEqual(v('1 year',{num:'12',unit:'months'}));
  expect(toTyped('target_horizon','2-year')).toEqual(v('2-year',{num:'24',unit:'months'}));
  expect(toTyped('target_horizon','一年')).toEqual(v('一年',{num:'12',unit:'months'}));
  expect(toTyped('target_horizon','半年')).toEqual(v('半年',{num:'6',unit:'months'}));
  expect(toTyped('target_horizon','12-18 months').failure).toBe('not_months');
  expect(toTyped('target_horizon','12M').failure).toBe('not_months');
 });
 it('row 5: published_date / price_as_of_date → original text, ISO date',()=>{
  for(const f of ['published_date','price_as_of_date'] as const){
   expect(toTyped(f,'2026-11-05')).toEqual(v('2026-11-05',{date:'2026-11-05'}));
   expect(toTyped(f,'2026/11/5')).toEqual(v('2026/11/5',{date:'2026-11-05'}));
   expect(toTyped(f,'2026年11月5日')).toEqual(v('2026年11月5日',{date:'2026-11-05'}));
   expect(toTyped(f,'5 November 2026')).toEqual(v('5 November 2026',{date:'2026-11-05'}));
   expect(toTyped(f,'4 Nov 2026')).toEqual(v('4 Nov 2026',{date:'2026-11-04'}));
   expect(toTyped(f,'Nov. 5, 2026')).toEqual(v('Nov. 5, 2026',{date:'2026-11-05'}));
   expect(toTyped(f,'5th Sept 2026')).toEqual(v('5th Sept 2026',{date:'2026-09-05'}));
   expect(toTyped(f,'05/11/2026').failure).toBe('not_a_date');    // D/M vs M/D ambiguous
   expect(toTyped(f,'2026-02-30').failure).toBe('not_a_date');
   expect(toTyped(f,'5 Novem 2026').failure).toBe('not_a_date');
  }
 });
 it('row 6: every other field keeps the original string only',()=>{
  for(const f of ['institution','analyst','ticker','rating','valuation_method','sector','title'] as const){
   expect(toTyped(f,' Overweight 120 ')).toEqual(v(' Overweight 120 '));
  }
 });
});

describe('CURRENCY_MARKS (currency-marks/1)',()=>{
 it('maps only CNY/HKD/USD marks and excludes ambiguous ones',()=>{
  expect(new Set(Object.values(CURRENCY_MARKS))).toEqual(new Set(['CNY','HKD','USD']));
  for(const k of ['$','¥','元'])expect(CURRENCY_MARKS[k]).toBeUndefined();
  expect(Object.isFrozen(CURRENCY_MARKS)).toBe(true);
 });
 it('finds marks longest-first and case-insensitively',()=>{
  expect(currencyMarksIn('target price HK$936')).toEqual(new Set(['HKD']));
  expect(currencyMarksIn('Rmb')).toEqual(new Set(['CNY']));
  expect(currencyMarksIn('US$ and HKD')).toEqual(new Set(['USD','HKD']));
  expect(currencyMarksIn('$120')).toEqual(new Set());
 });
});
```

- [ ] **Step 3: 运行，确认失败**

```bash
npm test -- src/lib/broker-research/decimal.test.ts src/lib/broker-research/behavior.test.ts src/lib/broker-research/extract
```
Expected: FAIL（模块不存在：`Failed to resolve import "./decimal"` 等）

- [ ] **Step 4: 实现**

`src/lib/broker-research/versions.ts`:
```ts
// src/lib/broker-research/versions.ts
// Version constants of every behavior-affecting component of the foreign broker research module
// (plan 2026-11-06 §仓库约定 版本常量; spec §4.3, §5.2–§5.4, §6.2, §6.4, §7.1, §4.11).
// A change in what a component computes requires a new version string here. The SQL strings
// 'upside/1' and 'broker-rules/1' must equal UPSIDE_FORMULA_VERSION / RULES_VERSION (asserted by
// the integration suite).
export const TYPED_VERSION='typed/1';
export const MERGE_VERSION='merge/1';
export const LOCATE_VERSION='locate/1';
export const TICKER_VERSION='parseBrokerTicker/1';
export const CURRENCY_MARKS_VERSION='currency-marks/1';
export const RULES_VERSION='broker-rules/1';
export const DISCLOSURE_VERSION='disclosure/1';
export const GROUNDING_VERSION='grounding/1';
export const OVERLAP_VERSION='overlap/1';
export const SCHEMA_VERSION='extract-schema/1';
export const EXTRACT_PROMPT_VERSION='broker-extract/1';
export const SUMMARY_PROMPT_VERSION='independent-summary/1';
export const UPSIDE_FORMULA_VERSION='upside/1';
export const CLAIM_METHODOLOGY_VERSION='broker-claim/1';
```

`src/lib/broker-research/decimal.ts`:
```ts
// src/lib/broker-research/decimal.ts
// Exact decimal arithmetic on decimal strings for rules and text checks (plan §契约补充 数值;
// spec §5.3, §7.1 R2/R6, §4.11, §6.4). Values never pass through Number: a decimal is a scaled
// BigInt (units / 10^scale) parsed from canonicalDecimal. Rounding is half away from zero.
import {canonicalDecimal} from '../facts/json-numbers';

export interface Dec{units:bigint;scale:number}
const pow10=(n:number)=>10n**BigInt(n);
/** Parses any decimal literal accepted by canonicalDecimal (throws invalid_decimal otherwise). */
export function dec(raw:string):Dec{
 const c=canonicalDecimal(raw);
 const neg=c.startsWith('-');
 const [i,f='']=(neg?c.slice(1):c).split('.');
 const units=BigInt(i+f);
 return {units:neg?-units:units,scale:f.length};
}
export function decString(d:Dec):string{
 const neg=d.units<0n;
 let digits=(neg?-d.units:d.units).toString();
 if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}
 return canonicalDecimal(`${neg?'-':''}${digits}`);
}
const align=(a:Dec,b:Dec):[bigint,bigint,number]=>{const s=Math.max(a.scale,b.scale);return [a.units*pow10(s-a.scale),b.units*pow10(s-b.scale),s];};
export const decAdd=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {units:x+y,scale:s};};
export const decSub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {units:x-y,scale:s};};
export const decMul=(a:Dec,b:Dec):Dec=>({units:a.units*b.units,scale:a.scale+b.scale});
export const decCmp=(a:Dec,b:Dec):-1|0|1=>{const [x,y]=align(a,b);return x<y?-1:x>y?1:0;};
export const decAbs=(a:Dec):Dec=>({units:a.units<0n?-a.units:a.units,scale:a.scale});
export const decNeg=(a:Dec):Dec=>({units:-a.units,scale:a.scale});
export const decSign=(a:Dec):-1|0|1=>a.units<0n?-1:a.units>0n?1:0;
/** a × 10^k (k may be negative). */
export function decShift(a:Dec,k:number):Dec{
 if(k<=0)return {units:a.units,scale:a.scale-k};
 return a.scale>=k?{units:a.units,scale:a.scale-k}:{units:a.units*pow10(k-a.scale),scale:0};
}
/** Rounds half away from zero to `dp` decimal places. */
export function decRound(a:Dec,dp:number):Dec{
 if(a.scale<=dp)return a;
 const drop=pow10(a.scale-dp);
 const neg=a.units<0n,abs=neg?-a.units:a.units;
 let q=abs/drop;
 if((abs%drop)*2n>=drop)q+=1n;
 return {units:neg?-q:q,scale:dp};
}
/** a / b rounded half away from zero to `dp` places; throws division_by_zero. Display only. */
export function decDiv(a:Dec,b:Dec,dp:number):Dec{
 if(b.units===0n)throw new Error('division_by_zero');
 // a/b = (a.units·10^b.scale)/(b.units·10^a.scale); scale numerator by 10^(dp+1) for rounding
 const num=a.units*pow10(b.scale+dp+1),den=b.units*pow10(a.scale);
 const neg=(num<0n)!==(den<0n);
 const q=(num<0n?-num:num)/(den<0n?-den:den);
 const r=q%10n>=5n?q/10n+1n:q/10n;
 return {units:neg?-r:r,scale:dp};
}
/** Canonical decimal string rounded to one decimal place (spec §4.11, §6.4 comparisons). */
export const round1=(raw:string):string=>decString(decRound(dec(raw),1));
export const decimalCompare=(a:string,b:string)=>decCmp(dec(a),dec(b));
```

`src/lib/broker-research/behavior.ts`:
```ts
// src/lib/broker-research/behavior.ts
// Extraction behavior digest (spec §4.3 broker_report_runs.behavior_digest, §4.10 eval receipts,
// §4.4 blocker 13). The digest identifies everything that changes extraction output and nothing
// else: it is independent of the deployment code_version, so an unrelated deploy does not
// invalidate a gold evaluation receipt. Changing the list below requires a new version string.
// Hash = sha256 hex of the UTF-8 bytes of JSON.stringify(<ordered string array>); for an array of
// strings this is byte-identical to canonicalJson (hash.ts, Task A4).
import {createHash} from 'node:crypto';
import {CURRENCY_MARKS_VERSION,LOCATE_VERSION,MERGE_VERSION,TICKER_VERSION,TYPED_VERSION} from './versions';

/** Ordered names of the digest inputs (spec §4.3; asserted verbatim by behavior.test.ts). */
export const BEHAVIOR_DIGEST_INPUTS=['extractor_version','model_id','registry_hash','prompt_version','schema_version','typed_version','merge_version','locate_version','ticker_version','currency_marks_version'] as const;
export interface BehaviorInputs{extractorVersion:string;modelId:string;registryHash:string;promptVersion:string;schemaVersion:string}

/** Input values in BEHAVIOR_DIGEST_INPUTS order; run-supplied values first, module constants after. */
export function behaviorDigestValues(i:BehaviorInputs):string[]{
 const run=[i.extractorVersion,i.modelId,i.registryHash,i.promptVersion,i.schemaVersion];
 run.forEach((v,k)=>{if(typeof v!=='string'||v.trim()==='')throw new Error(`behavior_input_missing:${BEHAVIOR_DIGEST_INPUTS[k]}`);});
 return [...run,TYPED_VERSION,MERGE_VERSION,LOCATE_VERSION,TICKER_VERSION,CURRENCY_MARKS_VERSION];
}
export function behaviorDigest(i:BehaviorInputs):string{
 return createHash('sha256').update(JSON.stringify(behaviorDigestValues(i)),'utf8').digest('hex');
}
```

`src/lib/broker-research/extract/schema.ts`:
```ts
// src/lib/broker-research/extract/schema.ts
// Extraction schema extract-schema/1 (spec §5.2) compiled with ajv (strict, all errors). One
// Evidence = {value, page ≥ 1, quote ≤ QUOTE_MAX_CHARS, confidence 0..1}; currencies are their own
// Evidence whose quote is the mark on the page and whose value is the ISO code. Every object is
// additionalProperties:false. The retry-once policy on failure lives in extract/run.ts (Task C5).
import Ajv from 'ajv';
import {SCHEMA_VERSION} from '../versions';

/** Spec §15.3 proposal (D7): quote cap in characters (ajv counts Unicode code points). */
export const QUOTE_MAX_CHARS=400;
export type ExtractionScope='single_issuer'|'multi_issuer'|'sector'|'macro_strategy';
export interface Evidence{value:string;page:number;quote:string;confidence:number}
export interface TargetExtraction{
 ticker:Evidence;exchange_hint?:string;rating?:Evidence;target_price?:Evidence;target_currency?:Evidence;target_horizon_months?:Evidence;
 price_at_report?:Evidence;price_currency?:Evidence;price_as_of_date?:Evidence;upside_stated?:Evidence;
}
export interface DocumentExtraction{
 scope:ExtractionScope;institution:Evidence;analysts:Evidence[];published_date:Evidence;title:Evidence;
 sector?:Evidence;valuation_method?:Evidence;wacc?:Evidence;terminal_growth?:Evidence;terminal_value_share?:Evidence;
 targets:TargetExtraction[];
}

const evidence={type:'object',additionalProperties:false,required:['value','page','quote','confidence'],properties:{
 value:{type:'string',minLength:1},page:{type:'integer',minimum:1},
 quote:{type:'string',minLength:1,maxLength:QUOTE_MAX_CHARS},confidence:{type:'number',minimum:0,maximum:1},
}};
const ev={$ref:'#/$defs/evidence'};
/** JSON Schema of one chunk's extraction; also the schema sent to the LLM (Task C5). */
export const EXTRACT_SCHEMA={
 $id:SCHEMA_VERSION,$defs:{evidence},
 type:'object',additionalProperties:false,required:['scope','institution','analysts','published_date','title','targets'],
 properties:{
  scope:{enum:['single_issuer','multi_issuer','sector','macro_strategy']},
  institution:ev,analysts:{type:'array',items:ev},published_date:ev,title:ev,
  sector:ev,valuation_method:ev,wacc:ev,terminal_growth:ev,terminal_value_share:ev,
  targets:{type:'array',items:{type:'object',additionalProperties:false,required:['ticker'],properties:{
   ticker:ev,exchange_hint:{type:'string',minLength:1,maxLength:40},rating:ev,target_price:ev,target_currency:ev,
   target_horizon_months:ev,price_at_report:ev,price_currency:ev,price_as_of_date:ev,upside_stated:ev,
  }}},
 },
} as const;

const validate=new Ajv({strict:true,allErrors:true}).compile(EXTRACT_SCHEMA);
export type ValidationResult={ok:true;value:DocumentExtraction}|{ok:false;errors:string[]};
/** Validates one parsed LLM response; errors are `<instancePath> <message>` strings (empty path = root). */
export function validateExtraction(json:unknown):ValidationResult{
 if(validate(json))return {ok:true,value:json as unknown as DocumentExtraction};
 return {ok:false,errors:(validate.errors??[]).map(e=>`${e.instancePath||'/'} ${e.message??'invalid'}`)};
}
```

`src/lib/broker-research/extract/locate.ts`:
```ts
// src/lib/broker-research/extract/locate.ts
// Quote location in parsed page text (spec §5.2 定位, §4.6 offsets, §7.1 R1). Offsets are UTF-16
// code units of the page string exactly as stored in the parse artifact (JavaScript string
// indices). A hit may not start or end inside a surrogate pair. First hit wins; more than one hit
// is reported as multiple_hits (all start offsets, overlapping hits included). No normalization of
// any kind: a quote that differs by one space is not found → 'unverified'.
// PageText is the minimal artifact reader shape shared with rules.ts (R1) and the verify cron;
// the F3 artifact adapter (Task C4) maps the artifact JSON onto it.
import {LOCATE_VERSION} from '../versions';

export type PageText={page:number;text:string}[];
export type LocateResult=
 |{version:string;status:'located';page:number;char_start:number;char_end:number;multiple_hits:number[]|null}
 |{version:string;status:'unverified';page:number;reason:'page_missing'|'empty_quote'|'not_found'|'splits_surrogate_pair'};

const isHigh=(c:number)=>c>=0xd800&&c<=0xdbff;
const isLow=(c:number)=>c>=0xdc00&&c<=0xdfff;
/** True when offset `i` falls between the two halves of a surrogate pair. */
const insidePair=(t:string,i:number)=>i>0&&i<t.length&&isHigh(t.charCodeAt(i-1))&&isLow(t.charCodeAt(i));

/** Text of one page; null when the page is absent. Duplicate page numbers are an artifact error. */
export function pageText(pages:PageText,page:number):string|null{
 const hits=pages.filter(p=>p.page===page);
 if(hits.length>1)throw new Error(`duplicate_page:${page}`);
 return hits[0]?.text??null;
}

export function locateQuote(pages:PageText,page:number,quote:string):LocateResult{
 const miss=(reason:'page_missing'|'empty_quote'|'not_found'|'splits_surrogate_pair'):LocateResult=>({version:LOCATE_VERSION,status:'unverified',page,reason});
 if(quote.length===0)return miss('empty_quote');
 const text=pageText(pages,page);
 if(text===null)return miss('page_missing');
 const hits:number[]=[];let raw=0;
 for(let i=text.indexOf(quote);i!==-1;i=text.indexOf(quote,i+1)){
  raw++;
  if(!insidePair(text,i)&&!insidePair(text,i+quote.length))hits.push(i);
 }
 if(hits.length===0)return miss(raw>0?'splits_surrogate_pair':'not_found');
 return {version:LOCATE_VERSION,status:'located',page,char_start:hits[0],char_end:hits[0]+quote.length,multiple_hits:hits.length>1?hits:null};
}

/** The artifact text at (page, [start, end)); null for a missing page, out-of-range, non-integer or pair-splitting span (fails closed for R1). */
export function sliceText(pages:PageText,page:number,start:number,end:number):string|null{
 const text=pageText(pages,page);
 if(text===null||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>text.length)return null;
 if(insidePair(text,start)||insidePair(text,end))return null;
 return text.slice(start,end);
}
```

`src/lib/broker-research/extract/typed.ts`（B1 版：本地类型别名，B2 第 1 步替换）:
```ts
// src/lib/broker-research/extract/typed.ts
// Typed conversion of an evidence value (spec §5.3 table, TYPED_VERSION) and the versioned
// currency-mark table (spec §5.2, CURRENCY_MARKS_VERSION). A failed conversion never throws:
// value_num/value_date/value_currency stay null, value_unit is null, value_text keeps the
// original string, and `failure` names why (the field can still be confirmed; materialization
// then produces no number, spec §5.3). Numbers are canonical decimal strings, never JS numbers.
// Price rows carry no currency: it comes from the same target's *_currency field at
// materialization (spec §5.3).
import {canonicalDecimal} from '../../facts/json-numbers';
import {dec,decShift,decString} from '../decimal';
// Local aliases until Task A4 lands types.ts; Task B2 replaces them with `import type … from '../types'`.
type FieldName='institution'|'analyst'|'published_date'|'price_as_of_date'|'ticker'|'rating'|'target_price'|'target_currency'|'target_horizon'|'price_at_report'|'price_currency'|'upside_stated'|'wacc'|'terminal_growth'|'terminal_value_share'|'valuation_method'|'sector'|'title';
interface TypedValue{value_text:string;value_num:string|null;value_currency:string|null;value_unit:'pct'|'ratio'|'months'|'price'|null;value_date:string|null}

/** Page marks → ISO 4217 (currency-marks/1). Keys are matched after ASCII upper-casing. Bare '$', '¥', '元' are ambiguous and deliberately absent. */
export const CURRENCY_MARKS:Readonly<Record<string,string>>=Object.freeze({
 'US$':'USD','USD':'USD','美元':'USD','美金':'USD',
 'HK$':'HKD','HKD':'HKD','港元':'HKD','港币':'HKD','港幣':'HKD',
 'RMB':'CNY','CNY':'CNY','CN¥':'CNY','人民币':'CNY','人民幣':'CNY',
});
const KNOWN_ISO=new Set(Object.values(CURRENCY_MARKS));
const MARKS_LONGEST_FIRST=Object.keys(CURRENCY_MARKS).sort((a,b)=>b.length-a.length);
export type TypedFailure='not_a_number'|'not_a_percentage'|'not_months'|'not_a_date'|'unknown_currency'|'currency_mark_mismatch';
export interface TypedResult{value:TypedValue;failure:TypedFailure|null}

const PRICE_FIELDS:readonly FieldName[]=['target_price','price_at_report'];
const CURRENCY_FIELDS:readonly FieldName[]=['target_currency','price_currency'];
const PCT_FIELDS:readonly FieldName[]=['upside_stated','wacc','terminal_growth','terminal_value_share'];
const DATE_FIELDS:readonly FieldName[]=['published_date','price_as_of_date'];

const upperAscii=(s:string)=>s.replace(/[a-z]/g,c=>c.toUpperCase());
/** NFKC (full-width digits, '％', 'ＨＫ＄'), U+2212 minus → '-', trimmed. */
const clean=(s:string)=>s.normalize('NFKC').replace(/−/g,'-').trim();
const plain=(value_text:string,failure:TypedFailure|null=null):TypedResult=>({value:{value_text,value_num:null,value_currency:null,value_unit:null,value_date:null},failure});

/** ISO codes of every currency mark occurring in `s`, longest mark first at each position. */
export function currencyMarksIn(s:string):Set<string>{
 const t=upperAscii(clean(s));const out=new Set<string>();
 for(let i=0;i<t.length;){
  const m=MARKS_LONGEST_FIRST.find(k=>t.startsWith(k,i));
  if(m){out.add(CURRENCY_MARKS[m]);i+=m.length;}else i++;
 }
 return out;
}
const NUMBER=/^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/;
/** Canonical decimal of a plain number with optional sign, thousands commas and decimals; null otherwise. */
function parseNumber(s:string):string|null{
 const m=NUMBER.exec(s);
 return m?canonicalDecimal(`${m[1]==='-'?'-':''}${m[2].replace(/,/g,'')}${m[3]??''}`):null;
}
/** A price string: currency marks, '$', '¥', '元' and whitespace removed around one plain number. */
function parsePrice(s:string):string|null{
 let t=upperAscii(clean(s));
 for(const m of MARKS_LONGEST_FIRST)t=t.split(m).join('');
 return parseNumber(t.replace(/[$¥元]/g,'').replace(/\s+/g,''));
}
function parsePct(s:string):string|null{
 const m=/^(.*?)\s*%$/.exec(clean(s));
 const n=m?parseNumber(m[1].replace(/\s+/g,'')):null;
 return n===null?null:decString(decShift(dec(n),-2));
}
const CN_HORIZON:Readonly<Record<string,number>>={'半年':6,'一年':12,'两年':24,'二年':24,'兩年':24};
function parseMonths(s:string):string|null{
 const t=clean(s);
 if(CN_HORIZON[t]!==undefined)return String(CN_HORIZON[t]);
 const mo=/^(\d{1,3})\s*-?\s*(?:months?|mos?|个月|個月)$/i.exec(t);
 if(mo)return canonicalDecimal(mo[1]);
 const yr=/^(\d{1,2})\s*-?\s*(?:years?|yrs?|年)$/i.exec(t);
 return yr?String(Number(yr[1])*12):null;
}
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function monthIndex(name:string):number|null{
 const n=name.toLowerCase().replace(/\.$/,'');
 const i=MONTHS.indexOf(n.slice(0,3));
 if(i<0)return null;
 const full=['january','february','march','april','may','june','july','august','september','october','november','december'][i];
 return n.length===3||n===full||(i===8&&n==='sept')?i+1:null;
}
function isoDate(y:number,m:number,d:number):string|null{
 const iso=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const ms=Date.parse(`${iso}T00:00:00Z`);
 return Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==iso?null:iso;
}
/** Unambiguous date forms only; D/M/Y vs M/D/Y numeric forms (e.g. 05/11/2026) are rejected. */
function parseDate(s:string):string|null{
 const t=clean(s).replace(/\s+/g,' ');
 let m=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)??/^(\d{4}) ?年 ?(\d{1,2}) ?月 ?(\d{1,2}) ?日$/.exec(t);
 if(m)return isoDate(Number(m[1]),Number(m[2]),Number(m[3]));
 m=/^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+\.?),? (\d{4})$/.exec(t);
 if(m){const mi=monthIndex(m[2]);return mi?isoDate(Number(m[3]),mi,Number(m[1])):null;}
 m=/^([A-Za-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(t);
 if(m){const mi=monthIndex(m[1]);return mi?isoDate(Number(m[3]),mi,Number(m[2])):null;}
 return null;
}

/**
 * Spec §5.3 conversion. `quote` is used only for currency fields: the page mark it contains must
 * map to exactly the ISO code of the value (spec §5.2), otherwise currency_mark_mismatch.
 */
export function toTyped(field:FieldName,valueText:string,quote?:string):TypedResult{
 if(PRICE_FIELDS.includes(field)){
  const n=parsePrice(valueText);
  return n===null?plain(valueText,'not_a_number'):{value:{value_text:n,value_num:n,value_currency:null,value_unit:'price',value_date:null},failure:null};
 }
 if(CURRENCY_FIELDS.includes(field)){
  const v=upperAscii(clean(valueText));
  const iso=/^[A-Z]{3}$/.test(v)?v:CURRENCY_MARKS[v];
  if(!iso||!KNOWN_ISO.has(iso))return plain(valueText,'unknown_currency');
  if(quote!==undefined){const marks=currencyMarksIn(quote);if(marks.size!==1||!marks.has(iso))return plain(valueText,'currency_mark_mismatch');}
  return {value:{value_text:iso,value_num:null,value_currency:iso,value_unit:null,value_date:null},failure:null};
 }
 if(PCT_FIELDS.includes(field)){
  const n=parsePct(valueText);
  return n===null?plain(valueText,'not_a_percentage'):{value:{value_text:valueText,value_num:n,value_currency:null,value_unit:'pct',value_date:null},failure:null};
 }
 if(field==='target_horizon'){
  const n=parseMonths(valueText);
  return n===null?plain(valueText,'not_months'):{value:{value_text:valueText,value_num:n,value_currency:null,value_unit:'months',value_date:null},failure:null};
 }
 if(DATE_FIELDS.includes(field)){
  const d=parseDate(valueText);
  return d===null?plain(valueText,'not_a_date'):{value:{value_text:valueText,value_num:null,value_currency:null,value_unit:null,value_date:d},failure:null};
 }
 return plain(valueText);
}
```

- [ ] **Step 5: 运行，确认通过**

```bash
npm test -- src/lib/broker-research/decimal.test.ts src/lib/broker-research/behavior.test.ts src/lib/broker-research/extract
```
Expected: 5 files passed，0 failed

- [ ] **Step 6: 类型与 lint**

```bash
npm run typecheck && npm run lint
```
Expected: 两者退出码 0，无 warning

- [ ] **Step 7: 提交**

```bash
git add -A src/lib/broker-research
```
```bash
git commit -m "feat(broker-research): versions, decimal, behavior digest, extract schema, locate, typed + synthetic fixtures (B1)" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Run `git commit` as its own command; replace `<model>` with the implementing agent's model name.)

### Task B2: tickers（parseBrokerTicker + resolveTargets）

**Files:**
- Create: `src/lib/broker-research/tickers.ts`
- Test: `src/lib/broker-research/tickers.test.ts`
- Modify: `src/lib/broker-research/extract/typed.ts`（本地类型别名 → `import type` from `../types`；A4 已落地）

- [ ] **Step 1: `typed.ts` 改用共享契约类型**（A4 已落地 `types.ts`）。删除这三行：

```ts
// Local aliases until Task A4 lands types.ts; Task B2 replaces them with `import type … from '../types'`.
type FieldName='institution'|'analyst'|'published_date'|'price_as_of_date'|'ticker'|'rating'|'target_price'|'target_currency'|'target_horizon'|'price_at_report'|'price_currency'|'upside_stated'|'wacc'|'terminal_growth'|'terminal_value_share'|'valuation_method'|'sector'|'title';
interface TypedValue{value_text:string;value_num:string|null;value_currency:string|null;value_unit:'pct'|'ratio'|'months'|'price'|null;value_date:string|null}
```

在 `import {dec,decShift,decString} from '../decimal';` 之后加：

```ts
import type {FieldName,TypedValue} from '../types';
```

```bash
npm test -- src/lib/broker-research/extract/typed.test.ts && npm run typecheck
```
Expected: typed 测试仍全绿；typecheck 0 错误（证明本地别名与契约一致）

- [ ] **Step 2: 写失败测试**（§5.4 列举的全部写法 + 规范化变体 + 回退；`resolveTargets` 用内存 `TableClient`：双上市同发行人、未知 / 无法解析 / 过期、候选不同发行人与 `ambiguous_owner` 冲突、`today` 取 `uploaded_at` 的 **UTC** 日期、合并重定向、同 `target_key` 共享查找）

`src/lib/broker-research/tickers.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {parseBrokerTicker,resolveTargets,uploadedAtToday} from './tickers';

describe('parseBrokerTicker (spec §5.4)',()=>{
 const cases:[string,string|undefined,string,string|null,string[]][]=[
  ['BABA US',undefined,'BABA','US',['BABA']],
  ['BABA UN',undefined,'BABA','US',['BABA']],
  ['BABA.N',undefined,'BABA','US',['BABA']],
  ['NVDA UW',undefined,'NVDA','US',['NVDA']],
  ['NVDA.O',undefined,'NVDA','US',['NVDA']],
  ['NVDA.OQ',undefined,'NVDA','US',['NVDA']],
  ['AAPL UQ',undefined,'AAPL','US',['AAPL']],
  ['BRK/B US',undefined,'BRK.B','US',['BRK.B']],
  ['BRK.B',undefined,'BRK.B','US',['BRK.B']],
  ['BRK.A',undefined,'BRK.A','US',['BRK.A','BRK']],
  ['9988 HK',undefined,'9988.HK','HK',['09988.HK']],
  ['9988.HK',undefined,'9988.HK','HK',['09988.HK']],
  ['0700 HK',undefined,'0700.HK','HK',['00700.HK']],
  ['700 HK',undefined,'0700.HK','HK',['00700.HK']],
  ['00700.HK',undefined,'0700.HK','HK',['00700.HK']],
  ['600519 CH',undefined,'600519.SH','A',['600519.SH']],
  ['000858 CH',undefined,'000858.SZ','A',['000858.SZ']],
  ['600519 SS',undefined,'600519.SH','A',['600519.SH']],
  ['600519.SS',undefined,'600519.SH','A',['600519.SH']],
  ['600519 C1',undefined,'600519.SH','A',['600519.SH']],
  ['000858 C2',undefined,'000858.SZ','A',['000858.SZ']],
  ['000858.SZ',undefined,'000858.SZ','A',['000858.SZ']],
  ['SH600519',undefined,'600519.SH','A',['600519.SH']],
  ['(NYSE: BABA)',undefined,'BABA','US',['BABA']],
  ['NASDAQ:NVDA',undefined,'NVDA','US',['NVDA']],
  ['HKEX: 9988',undefined,'9988.HK','HK',['09988.HK']],
  ['baba us',undefined,'BABA','US',['BABA']],
  ['  9988   HK ',undefined,'9988.HK','HK',['09988.HK']],
  ['９９８８ ＨＫ',undefined,'9988.HK','HK',['09988.HK']],
  ['BABA',undefined,'BABA','US',['BABA']],
  ['BABA','NYSE','BABA','US',['BABA']],
  ['600519',undefined,'600519.SH','A',['600519.SH']],
  ['600519','SSE','600519.SH','A',['600519.SH']],
  ['9988','HKEX','9988.HK','HK',['09988.HK']],
  ['9988',undefined,'9988.HK','HK',['09988.HK']],
 ];
 it.each(cases)('%s (hint %s) → %s',(stated,hint,key,market,cands)=>{
  const p=parseBrokerTicker(stated,hint);
  expect(p).toEqual({method:'parseBrokerTicker/1',stated,targetKey:key,market:market===null?null:market==='US'?'US':market==='HK'?'HK':'A',candidates:cands});
 });
 it('falls back to a verbatim stated: key with no candidates',()=>{
  for(const [s,h] of [['7203 JT',undefined],['BABA','HKEX'],['9988','NYSE'],['600519','TSE'],['Alibaba Group',undefined],['BABA LN',undefined]] as const){
   expect(parseBrokerTicker(s,h)).toEqual({method:'parseBrokerTicker/1',stated:s,targetKey:`stated:${s}`,market:null,candidates:[]});
  }
 });
 it('an explicit suffix wins over the hint; empty input throws',()=>{
  expect(parseBrokerTicker('9988 HK','NYSE').targetKey).toBe('9988.HK');
  expect(()=>parseBrokerTicker('  ')).toThrow('empty_ticker');
 });
});

describe('uploadedAtToday',()=>{
 it('uses the UTC calendar date',()=>{
  expect(uploadedAtToday('2026-11-05T23:30:00-05:00')).toBe('2026-11-06');
  expect(uploadedAtToday('2026-11-06T07:59:59+08:00')).toBe('2026-11-05');
  expect(()=>uploadedAtToday('yesterday')).toThrow('invalid_uploaded_at');
 });
});

async function seed(){
 const c=memoryTableClient();
 const issuer=(id:string,extra:Record<string,unknown>={})=>c.insert('issuers',{issuer_id:id,canonical_name_en:id,canonical_name_zh:null,cik:null,lei:null,usci:null,status:'active',merged_into:null,...extra});
 const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>c.insert('issuer_securities',{issuer_id,ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from,valid_to,source:'test'});
 await issuer('ali');await issuer('mt');await issuer('xa');await issuer('x');await issuer('d1');await issuer('d2');await issuer('new');
 await issuer('old',{status:'merged',merged_into:'ali'});
 await sec('ali','BABA','2014-09-19');await sec('ali','09988.HK','2019-11-26');
 await sec('mt','600519.SH','2001-08-27');
 await sec('xa','XYZ.A','2020-01-01');await sec('x','XYZ','2020-01-01');
 await sec('d1','DUP','2020-01-01');await sec('d2','DUP','2021-01-01');
 await sec('new','NEWC','2026-11-06');
 await sec('ali','GONE','2010-01-01','2026-11-05');
 await sec('old','OLDT','2010-01-01');
 return c;
}

describe('resolveTargets (spec §5.4, §4.5)',()=>{
 const AT='2026-11-05T10:00:00Z';
 it('resolves a dual listing to one issuer with a snapshot of the issuer_securities row',async()=>{
  const r=await resolveTargets(await seed(),[{tickerAsStated:'BABA US'},{tickerAsStated:'9988 HK',exchangeHint:'HKEX'}],AT);
  expect(r.map(x=>[x.targetKey,x.outcome,x.issuerId,x.securityTicker,x.reasonCode])).toEqual([['BABA','resolved','ali','BABA',null],['9988.HK','resolved','ali','09988.HK',null]]);
  expect(r[1].resolution).toEqual({method:'parseBrokerTicker/1',candidates:['09988.HK'],resolver:'resolveIssuer',today:'2026-11-05',outcome:'resolved',
   issuer_securities_row:{issuer_id:'ali',ticker:'09988.HK',valid_from:'2019-11-26',valid_to:null},lookups:[{ticker:'09988.HK',issuer_id:'ali',row:{issuer_id:'ali',ticker:'09988.HK',valid_from:'2019-11-26',valid_to:null}}]});
 });
 it('unresolved: unknown code, unparseable code, expired row',async()=>{
  const r=await resolveTargets(await seed(),[{tickerAsStated:'ZZZZ US'},{tickerAsStated:'7203 JT'},{tickerAsStated:'GONE US'}],AT);
  expect(r.map(x=>[x.targetKey,x.outcome,x.issuerId,x.reasonCode])).toEqual([['ZZZZ','unresolved',null,'unresolved_ticker'],['stated:7203 JT','unresolved',null,'unresolved_ticker'],['GONE','unresolved',null,'unresolved_ticker']]);
  expect(r[1].resolution).toMatchObject({candidates:[],lookups:[],issuer_securities_row:null});
 });
 it('conflict: candidates resolving to different issuers, and an ambiguous owner',async()=>{
  const r=await resolveTargets(await seed(),[{tickerAsStated:'XYZ.A'},{tickerAsStated:'DUP US'}],AT);
  expect(r.map(x=>[x.targetKey,x.outcome,x.issuerId,x.securityTicker,x.reasonCode])).toEqual([['XYZ.A','conflict',null,null,'ticker_issuer_conflict'],['DUP','conflict',null,null,'ticker_issuer_conflict']]);
  expect(r[0].resolution.lookups).toEqual([{ticker:'XYZ.A',issuer_id:'xa',row:{issuer_id:'xa',ticker:'XYZ.A',valid_from:'2020-01-01',valid_to:null}},{ticker:'XYZ',issuer_id:'x',row:{issuer_id:'x',ticker:'XYZ',valid_from:'2020-01-01',valid_to:null}}]);
  expect(r[1].resolution.lookups).toEqual([{ticker:'DUP',issuer_id:null,error:'ambiguous_owner',row:null}]);
 });
 it('today is the UTC date of uploaded_at, not the local date',async()=>{
  const c=await seed();
  expect((await resolveTargets(c,[{tickerAsStated:'NEWC US'}],'2026-11-05T23:30:00-05:00'))[0]).toMatchObject({outcome:'resolved',issuerId:'new',resolution:{today:'2026-11-06'}});
  expect((await resolveTargets(c,[{tickerAsStated:'NEWC US'}],'2026-11-06T07:00:00+08:00'))[0]).toMatchObject({outcome:'unresolved',resolution:{today:'2026-11-05'}});
 });
 it('a merged issuer redirect resolves but records no security row of the survivor',async()=>{
  const [r]=await resolveTargets(await seed(),[{tickerAsStated:'OLDT US'}],AT);
  expect(r).toMatchObject({outcome:'resolved',issuerId:'ali',securityTicker:'OLDT',resolution:{issuer_securities_row:null,lookups:[{ticker:'OLDT',issuer_id:'ali',redirected_from:'old',row:null}]}});
 });
 it('shares one lookup per target_key and keeps each stated form',async()=>{
  const c=await seed();let selects=0;
  const counting={...c,select:(...a:Parameters<typeof c.select>)=>{selects++;return c.select(...a);}};
  const r=await resolveTargets(counting,[{tickerAsStated:'BABA US'},{tickerAsStated:'BABA.N'}],AT);
  expect(r.map(x=>[x.targetKey,x.tickerAsStated,x.outcome])).toEqual([['BABA','BABA US','resolved'],['BABA','BABA.N','resolved']]);
  const once=selects;selects=0;
  await resolveTargets(counting,[{tickerAsStated:'BABA US'}],AT);
  expect(once).toBe(selects);
 });
 it('rejects an invalid uploaded_at',async()=>{
  await expect(resolveTargets(await seed(),[{tickerAsStated:'BABA US'}],'n/a')).rejects.toThrow('invalid_uploaded_at');
 });
});
```

- [ ] **Step 3: 运行，确认失败**

```bash
npm test -- src/lib/broker-research/tickers.test.ts
```
Expected: FAIL（`./tickers` 不存在）

- [ ] **Step 4: 实现**

说明：`target_key` 的 HK 形式按规格示例 `9988.HK`（去前导零后补足 4 位：`0700.HK`），宇宙候选为 5 位 `09988.HK`（`issuer_securities` 的存储形式）；`BRK.A` 这类 `.A` 既可能是 NYSE American 后缀也可能是 A 类股，两个候选都查，指向不同发行人即冲突。`resolveIssuer` 抛 `ambiguous_owner` 记为冲突，其他异常上抛。

`src/lib/broker-research/tickers.ts`:
```ts
// src/lib/broker-research/tickers.ts
// Broker ticker parsing and issuer resolution (spec §5.4 parseBrokerTicker/1, §4.5 resolution
// snapshot, §7.1 R9). parseBrokerTicker turns the stated code (Bloomberg `BABA US`, `9988 HK`,
// `600519 CH`; Reuters `BABA.N`, `NVDA.O`; Yahoo `600519.SS`; `SH600519`; `NYSE: BABA`) into a
// stable target_key plus universe-form candidates. Unparseable → target_key `stated:<verbatim>`,
// no candidates. target_key forms: A `600519.SH`; HK ≥4-digit `9988.HK` / `0700.HK` (broker
// convention; the universe candidate is the 5-digit `09988.HK`); US the bare symbol (`BABA`,
// class shares `BRK.B`). resolveTargets resolves each candidate with resolveIssuer at today =
// UTC date of the document's uploaded_at and records the snapshot written to targets.resolution.
import type {TableClient} from '../db/table-client';
import {resolveIssuer} from '../entities/resolve';
import {normalizeSecurityTicker} from '../securities/ticker';
import {TICKER_VERSION} from './versions';

export type TickerMarket='A'|'HK'|'US';
export interface ParsedTicker{method:string;stated:string;targetKey:string;market:TickerMarket|null;candidates:string[]}

const BBG_US=new Set(['US','UN','UW','UQ','UA','UR','UP','UV']);
const BBG_A:Readonly<Record<string,'SH'|'SZ'|'BJ'|'CH'>>={SS:'SH',SH:'SH',CG:'SH',C1:'SH',SZ:'SZ',CS:'SZ',C2:'SZ',BJ:'BJ',CH:'CH'};
const HINTS:Readonly<Record<string,{market:TickerMarket;exchange?:'SH'|'SZ'|'BJ'}>>={
 NYSE:{market:'US'},NASDAQ:{market:'US'},'NYSE AMERICAN':{market:'US'},AMEX:{market:'US'},'NYSE ARCA':{market:'US'},NYSEARCA:{market:'US'},US:{market:'US'},
 HKEX:{market:'HK'},SEHK:{market:'HK'},HKSE:{market:'HK'},HK:{market:'HK'},
 SSE:{market:'A',exchange:'SH'},SH:{market:'A',exchange:'SH'},SHANGHAI:{market:'A',exchange:'SH'},
 SZSE:{market:'A',exchange:'SZ'},SZ:{market:'A',exchange:'SZ'},SHENZHEN:{market:'A',exchange:'SZ'},
 BSE:{market:'A',exchange:'BJ'},BJ:{market:'A',exchange:'BJ'},
};
const PREFIX=/^(NYSE AMERICAN|NYSE ARCA|NYSEARCA|NYSE|NASDAQ|AMEX|HKEX|SEHK|HKSE|SSE|SZSE|BSE) ?[:：] ?(.+)$/;

const norm=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase().replace(/^\((.*)\)$/,'$1').trim();
const aShare=(code:string,ex:'SH'|'SZ'|'BJ'|'CH')=>ex==='CH'?normalizeSecurityTicker(code,'A'):`${code}.${ex}`;
const hk=(code:string,stated:string):ParsedTicker=>{
 const digits=code.replace(/^0+(?=\d)/,'');
 return {method:TICKER_VERSION,stated,targetKey:`${digits.padStart(4,'0')}.HK`,market:'HK',candidates:[`${digits.padStart(5,'0')}.HK`]};
};
const us=(stated:string,...cands:string[]):ParsedTicker=>({method:TICKER_VERSION,stated,targetKey:cands[0],market:'US',candidates:cands});
const a=(stated:string,t:string|null):ParsedTicker|null=>t?{method:TICKER_VERSION,stated,targetKey:t,market:'A',candidates:[t]}:null;

function parse(s:string,stated:string,hint:{market:TickerMarket;exchange?:'SH'|'SZ'|'BJ'}|null|'unknown'):ParsedTicker|null{
 let m:RegExpExecArray|null;
 // explicit exchange suffix or prefix: the hint is not needed
 if((m=/^(\d{1,5})[ .]HK$/.exec(s)))return hk(m[1],stated);
 if((m=/^(\d{6})[ .](SS|SH|CG|C1|SZ|CS|C2|BJ|CH)$/.exec(s)))return a(stated,aShare(m[1],BBG_A[m[2]]));
 if((m=/^(SH|SZ|BJ)(\d{6})$/.exec(s)))return a(stated,`${m[2]}.${m[1]}`);
 if((m=/^([A-Z][A-Z0-9]{0,5})(?:[./]([A-Z]))? (US|UN|UW|UQ|UA|UR|UP|UV)$/.exec(s))&&BBG_US.has(m[3]))return us(stated,m[2]?`${m[1]}.${m[2]}`:m[1]);
 if((m=/^([A-Z][A-Z0-9]{0,5})\.(N|O|OQ|K)$/.exec(s)))return us(stated,m[1]);
 // `.A` is both the Reuters NYSE American suffix and a class-A share: exact form first
 if((m=/^([A-Z][A-Z0-9]{0,5})\.A$/.exec(s)))return us(stated,`${m[1]}.A`,m[1]);
 if((m=/^([A-Z][A-Z0-9]{0,5})[./]([B-Z])$/.exec(s)))return us(stated,`${m[1]}.${m[2]}`);
 // bare codes: market from the hint; an unrecognized hint never guesses
 if(hint==='unknown')return null;
 if(/^\d{6}$/.test(s)){
  if(hint&&hint.market!=='A')return null;
  return a(stated,hint?.exchange?`${s}.${hint.exchange}`:normalizeSecurityTicker(s,'A'));
 }
 if(/^\d{1,5}$/.test(s))return !hint||hint.market==='HK'?hk(s,stated):null;
 if(/^[A-Z][A-Z0-9]{0,5}$/.test(s))return !hint||hint.market==='US'?us(stated,s):null;
 return null;
}

/** spec §5.4. `stated` is kept verbatim in the `stated:` fallback key. */
export function parseBrokerTicker(stated:string,exchangeHint?:string|null):ParsedTicker{
 if(stated.trim()==='')throw new Error('empty_ticker');
 let s=norm(stated);
 const h=exchangeHint?.trim()?norm(exchangeHint):null;
 let hint:{market:TickerMarket;exchange?:'SH'|'SZ'|'BJ'}|null|'unknown'=h===null?null:HINTS[h]??'unknown';
 const p=PREFIX.exec(s);
 if(p){hint=HINTS[p[1]]??'unknown';s=p[2].trim();}
 return parse(s,stated,hint)??{method:TICKER_VERSION,stated,targetKey:`stated:${stated}`,market:null,candidates:[]};
}

export type ResolutionOutcome='resolved'|'unresolved'|'conflict';
export interface TargetResolution{
 targetKey:string;tickerAsStated:string;outcome:ResolutionOutcome;issuerId:string|null;securityTicker:string|null;
 /** Quarantine reason for R9 (spec §5.4): null when resolved. */
 reasonCode:'unresolved_ticker'|'ticker_issuer_conflict'|null;
 /** Snapshot written to broker_report_targets.resolution (spec §4.5). */
 resolution:Record<string,unknown>;
}
interface Lookup{ticker:string;issuer_id:string|null;redirected_from?:string;error?:string;row:{issuer_id:string;ticker:string;valid_from:string;valid_to:string|null}|null}

/** UTC calendar date of an ISO timestamp (spec §5.4: today = uploaded_at UTC date, exchange-agnostic). */
export function uploadedAtToday(uploadedAt:string):string{
 const ms=Date.parse(uploadedAt);
 if(Number.isNaN(ms))throw new Error('invalid_uploaded_at');
 return new Date(ms).toISOString().slice(0,10);
}

/**
 * Resolves every stated ticker. All candidates are looked up; zero issuers → unresolved,
 * two or more distinct issuers (or an ambiguous owner) → conflict; never a silent pick.
 * Inputs mapping to the same target_key share one lookup.
 */
export async function resolveTargets(client:TableClient,stated:{tickerAsStated:string;exchangeHint?:string|null}[],uploadedAt:string):Promise<TargetResolution[]>{
 const today=uploadedAtToday(uploadedAt);
 const cache=new Map<string,Promise<Lookup[]>>();
 const lookupAll=(p:ParsedTicker)=>Promise.all(p.candidates.map(async(ticker):Promise<Lookup>=>{
  try{
   const r=await resolveIssuer(client,{ticker},{today});
   if(!r)return {ticker,issuer_id:null,row:null};
   const sec=r.securities.find(x=>x.ticker===ticker);
   return {ticker,issuer_id:r.issuer_id,...(r.redirected_from?{redirected_from:r.redirected_from}:{}),row:sec?{issuer_id:r.issuer_id,ticker:sec.ticker,valid_from:sec.valid_from,valid_to:sec.valid_to}:null};
  }catch(e){
   if(e instanceof Error&&e.message==='ambiguous_owner')return {ticker,issuer_id:null,error:'ambiguous_owner',row:null};
   throw e;
  }
 }));
 const out:TargetResolution[]=[];
 for(const s of stated){
  const p=parseBrokerTicker(s.tickerAsStated,s.exchangeHint);
  if(!cache.has(p.targetKey))cache.set(p.targetKey,lookupAll(p));
  const lookups=await cache.get(p.targetKey)!;
  const issuers=[...new Set(lookups.map(l=>l.issuer_id).filter((v):v is string=>v!==null))];
  const conflict=issuers.length>1||lookups.some(l=>l.error==='ambiguous_owner');
  const outcome:ResolutionOutcome=conflict?'conflict':issuers.length===1?'resolved':'unresolved';
  const hit=outcome==='resolved'?lookups.find(l=>l.issuer_id!==null)!:null;
  out.push({
   targetKey:p.targetKey,tickerAsStated:s.tickerAsStated,outcome,
   issuerId:hit?.issuer_id??null,securityTicker:hit?.ticker??null,
   reasonCode:outcome==='resolved'?null:outcome==='conflict'?'ticker_issuer_conflict':'unresolved_ticker',
   resolution:{method:p.method,candidates:p.candidates,resolver:'resolveIssuer',today,outcome,issuer_securities_row:hit?.row??null,lookups},
  });
 }
 return out;
}
```

- [ ] **Step 5: 运行，确认通过**

```bash
npm test -- src/lib/broker-research/tickers.test.ts src/lib/broker-research/extract/typed.test.ts
```
Expected: 全部通过

- [ ] **Step 6: 类型与 lint**

```bash
npm run typecheck && npm run lint
```
Expected: 退出码 0

- [ ] **Step 7: 提交**

```bash
git add -A src/lib/broker-research
```
```bash
git commit -m "feat(broker-research): parseBrokerTicker/1 and resolveTargets with resolution snapshot (B2)" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Run `git commit` as its own command; replace `<model>` with the implementing agent's model name.)

### Task B3: 分块合并 merge（冲突组、不自动选择）+ 候选行组装

**Files:**
- Create: `src/lib/broker-research/extract/merge.ts`
- Test: `src/lib/broker-research/extract/merge.test.ts`

- [ ] **Step 1: 写失败测试**（单块全字段；同一分析师跨块大小写 / 空白变体合一、最小页、`merged_from`；同 `target_key` 下按陈述值分配 ticker occurrence；类型化等值合一；不同值全部保留同一 `conflict_group` 且 confidence 不参与；报告级冲突与 scope 不一致；输入顺序无关；`buildCandidateRows`：定位 + 类型化 + 解析快照、**差一个空格 → unverified 且无跨度**（验收样例 2）、类型化失败与币种标记不符不丢行）

`src/lib/broker-research/extract/merge.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {buildCandidateRows,conflictGroupId,mergeChunks,normalizedValue,type ChunkExtraction} from './merge';
import type {DocumentExtraction,Evidence} from './schema';
import type {PageText} from './locate';
import fixture from '../fixtures/synthetic-extraction.json';
import pages from '../fixtures/synthetic-pages.json';

const FIX=fixture as DocumentExtraction;
const ev=(value:string,page:number,quote=value,confidence=0.9):Evidence=>({value,page,quote,confidence});
const doc=(o:Partial<DocumentExtraction>):DocumentExtraction=>({scope:'single_issuer',institution:ev('Synthetic Broker Ltd',1),analysts:[],published_date:ev('5 November 2026',1),title:ev('T',1),targets:[],...o});
const pick=(r:ReturnType<typeof mergeChunks>,tk:string|null,f:string)=>r.candidates.filter(c=>c.target_key===tk&&c.field===f);

describe('mergeChunks (spec §6.2)',()=>{
 it('a single chunk yields one candidate per evidence with targets keyed by parseBrokerTicker',()=>{
  const r=mergeChunks([{chunk:0,extraction:FIX}]);
  expect(r).toMatchObject({version:'merge/1',scope:'single_issuer',scopes:['single_issuer']});
  expect(r.targets).toEqual([{target_key:'NWND',tickers_as_stated:['NWND US'],exchange_hint:null},{target_key:'9999.HK',tickers_as_stated:['9999 HK'],exchange_hint:'HKEX'}]);
  expect(r.candidates.every(c=>c.conflict_group===null&&c.occurrence>=1)).toBe(true);
  expect(pick(r,null,'analyst').map(c=>[c.evidence.value,c.occurrence])).toEqual([['Jane Roe',1],['李明',2]]);
  expect(pick(r,'NWND','target_horizon')[0].evidence.value).toBe('12-month');
  expect(r.candidates).toHaveLength(7+2+9+6);
 });
 it('same analyst across chunks (case/space variants) is one occurrence: smallest page, merged_from',()=>{
  const r=mergeChunks([{chunk:1,extraction:doc({analysts:[ev('JANE  ROE',4)]})},{chunk:0,extraction:doc({analysts:[ev('Jane Roe',3),ev('John Doe',3)]})},{chunk:2,extraction:doc({analysts:[ev('jane roe',2)]})}]);
  expect(pick(r,null,'analyst').map(c=>[c.evidence.value,c.occurrence,c.evidence.page,c.merged_from,c.conflict_group])).toEqual([['jane roe',1,2,[0,1,2],null],['John Doe',2,3,[0],null]]);
 });
 it('ticker occurrences are by stated value inside one target_key',()=>{
  const r=mergeChunks([{chunk:0,extraction:doc({targets:[{ticker:ev('BABA US',1)}]})},{chunk:1,extraction:doc({targets:[{ticker:ev('BABA.N',5)},{ticker:ev('baba us',6)}]})}]);
  expect(r.targets).toEqual([{target_key:'BABA',tickers_as_stated:['BABA US','BABA.N','baba us'],exchange_hint:null}]);
  expect(pick(r,'BABA','ticker').map(c=>[c.evidence.value,c.occurrence,c.merged_from])).toEqual([['BABA US',1,[0,1]],['BABA.N',2,[1]]]);
 });
 it('equal typed values across chunks collapse (120.00 = US$120)',()=>{
  const r=mergeChunks([{chunk:0,extraction:doc({targets:[{ticker:ev('NWND US',1),target_price:ev('US$120.00',5)}]})},{chunk:1,extraction:doc({targets:[{ticker:ev('NWND US',9),target_price:ev('120',2)}]})}]);
  expect(pick(r,'NWND','target_price').map(c=>[c.evidence.value,c.evidence.page,c.merged_from,c.conflict_group])).toEqual([['120',2,[0,1],null]]);
 });
 it('different values keep every candidate in one conflict group and select none (confidence ignored)',()=>{
  const r=mergeChunks([
   {chunk:0,extraction:doc({targets:[{ticker:ev('NWND US',1),target_price:ev('120',2,'120',0.99)}]})},
   {chunk:1,extraction:doc({targets:[{ticker:ev('NWND US',9),target_price:ev('125',9,'125',0.10)}]})},
   {chunk:2,extraction:doc({targets:[{ticker:ev('NWND US',12),target_price:ev('US$120.00',12)}]})},
  ]);
  const tp=pick(r,'NWND','target_price');
  expect(tp.map(c=>[c.evidence.value,c.occurrence,c.merged_from,c.conflict_group])).toEqual([['120',1,[0,2],'conflict:NWND:target_price:1'],['125',1,[1],'conflict:NWND:target_price:1']]);
  expect(conflictGroupId(null,'title',1)).toBe('conflict:-:title:1');
 });
 it('report-level conflicts (published_date) and differing scopes',()=>{
  const r=mergeChunks([{chunk:0,extraction:doc({})},{chunk:1,extraction:doc({scope:'multi_issuer',published_date:ev('2026-11-06',8)})}]);
  expect(pick(r,null,'published_date').map(c=>c.conflict_group)).toEqual(['conflict:-:published_date:1','conflict:-:published_date:1']);
  expect(pick(r,null,'institution')).toHaveLength(1);
  expect(r).toMatchObject({scope:null,scopes:['single_issuer','multi_issuer']});
 });
 it('is independent of input order and rejects duplicate chunk ids',()=>{
  const a:ChunkExtraction={chunk:0,extraction:doc({analysts:[ev('A',1)]})},b:ChunkExtraction={chunk:1,extraction:doc({analysts:[ev('B',2)]})};
  expect(mergeChunks([b,a])).toEqual(mergeChunks([a,b]));
  expect(()=>mergeChunks([a,a])).toThrow('duplicate_chunk');
 });
 it('normalizedValue: typed where possible, squashed text otherwise',()=>{
  expect(normalizedValue('target_price','US$ 120.0')).toBe(normalizedValue('target_price','120'));
  expect(normalizedValue('published_date','5 Nov 2026')).toBe(normalizedValue('published_date','2026-11-05'));
  expect(normalizedValue('rating','Over weight')).toBe(normalizedValue('rating','overweight'));
  expect(normalizedValue('target_price','n/a')).toBe('text:n/a');
 });
});

describe('buildCandidateRows (spec §5.2, §5.3)',()=>{
 const P:PageText=pages;
 it('locates and types every fixture candidate; ticker rows carry the resolution snapshot',()=>{
  const res=new Map([['NWND',{outcome:'unresolved'}]]);
  const rows=buildCandidateRows(mergeChunks([{chunk:0,extraction:FIX}]),{pages:P,extractor:'llm:model-a@abc',resolutions:res});
  expect(rows.every(r=>r.status==='extracted')).toBe(true);
  const tp=rows.find(r=>r.target_key==='NWND'&&r.field==='target_price')!;
  expect(tp).toMatchObject({value_text:'120',value_num:'120',value_unit:'price',value_currency:null,page:1,value_source_text:'US$120.00',extractor:'llm:model-a@abc',extractor_confidence:0.95,conflict_group:null,status:'extracted'});
  expect(P[0].text.slice(tp.char_start!,tp.char_end!)).toBe('US$120.00');
  expect(rows.find(r=>r.field==='target_currency'&&r.target_key==='9999.HK')).toMatchObject({value_text:'HKD',value_currency:'HKD',value_source_text:'HK$'});
  expect(rows.find(r=>r.field==='upside_stated')).toMatchObject({value_num:'0.25',value_unit:'pct'});
  expect(rows.find(r=>r.field==='ticker'&&r.target_key==='NWND')!.resolution).toEqual({outcome:'unresolved'});
  expect(rows.find(r=>r.field==='ticker'&&r.target_key==='9999.HK')!.resolution).toBeUndefined();
  expect(rows.find(r=>r.field==='rating')!.detail).toMatchObject({merge:'merge/1',locate:'locate/1',typed:'typed/1',merged_from:[0],multiple_hits:[expect.any(Number),expect.any(Number)]});
 });
 it('a quote that differs by one space becomes unverified with no span (acceptance sample 2)',()=>{
  const x=structuredClone(FIX);x.targets[0].target_price={value:'US$120.00',page:1,quote:'US$ 120.00',confidence:0.9};
  const row=buildCandidateRows(mergeChunks([{chunk:0,extraction:x}]),{pages:P,extractor:'llm:m@h'}).find(r=>r.target_key==='NWND'&&r.field==='target_price')!;
  expect(row).toMatchObject({status:'unverified',page:1,char_start:null,char_end:null,value_source_text:null,value_num:'120',detail:{locate_failure:'not_found',quote:'US$ 120.00'}});
 });
 it('records typed failures and currency-mark mismatches without dropping the row',()=>{
  const x=structuredClone(FIX);x.targets[0].target_currency={value:'HKD',page:1,quote:'US$',confidence:0.9};x.wacc={value:'n/a',page:2,quote:'DCF',confidence:0.5};
  const rows=buildCandidateRows(mergeChunks([{chunk:0,extraction:x}]),{pages:P,extractor:'llm:m@h'});
  expect(rows.find(r=>r.field==='target_currency'&&r.target_key==='NWND')).toMatchObject({status:'extracted',value_currency:null,detail:{typed_failure:'currency_mark_mismatch'}});
  expect(rows.find(r=>r.field==='wacc')).toMatchObject({status:'extracted',value_num:null,detail:{typed_failure:'not_a_percentage'}});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

```bash
npm test -- src/lib/broker-research/extract/merge.test.ts
```
Expected: FAIL（`./merge` 不存在）

- [ ] **Step 3: 实现**

`buildCandidateRows` 的输出直接是 `CandidateFieldInput[]`（`extractCommit` 的入参）；未定位行 `value_source_text=null`，LLM 引文存 `detail.quote` 供复核页显示；`resolution` 只挂在 `ticker` 行（C5 用 `resolveTargets` 的结果建 Map）。

`src/lib/broker-research/extract/merge.ts`:
```ts
// src/lib/broker-research/extract/merge.ts
// Chunk merge (spec §6.2 分块合并, MERGE_VERSION) and candidate-row assembly for
// broker_extract_commit. Candidate identity = (target_key, field, occurrence); target_key comes
// from each chunk's ticker Evidence via parseBrokerTicker. analyst / ticker: occurrence by
// normalized value (NFKC, whitespace removed, case-insensitive) in first-appearance order; the
// same value across chunks is one row (smallest page, then earliest chunk; detail.merged_from).
// Every other field: equal normalized values collapse the same way; two or more DIFFERENT values
// for one identity are all kept under one conflict_group and none is selected — confidence is
// display only. The admin confirms one (the review RPC rejects the rest).
import type {CandidateFieldInput,FieldName} from '../types';
import {parseBrokerTicker} from '../tickers';
import {LOCATE_VERSION,MERGE_VERSION,TYPED_VERSION} from '../versions';
import {locateQuote,type PageText} from './locate';
import type {DocumentExtraction,Evidence,ExtractionScope,TargetExtraction} from './schema';
import {toTyped} from './typed';

export interface ChunkExtraction{chunk:number;extraction:DocumentExtraction}
export interface MergedCandidate{target_key:string|null;field:FieldName;occurrence:number;evidence:Evidence;merged_from:number[];conflict_group:string|null;normalized:string}
export interface MergedTarget{target_key:string;tickers_as_stated:string[];exchange_hint:string|null}
export interface MergeResult{version:string;scope:ExtractionScope|null;scopes:ExtractionScope[];targets:MergedTarget[];candidates:MergedCandidate[]}

const REPORT_FIELDS:readonly [Exclude<keyof DocumentExtraction,'scope'|'analysts'|'targets'>,FieldName][]=[['institution','institution'],['published_date','published_date'],['title','title'],['sector','sector'],['valuation_method','valuation_method'],['wacc','wacc'],['terminal_growth','terminal_growth'],['terminal_value_share','terminal_value_share']];
const TARGET_FIELDS:readonly [Exclude<keyof TargetExtraction,'ticker'|'exchange_hint'>,FieldName][]=[['rating','rating'],['target_price','target_price'],['target_currency','target_currency'],['target_horizon_months','target_horizon'],['price_at_report','price_at_report'],['price_currency','price_currency'],['price_as_of_date','price_as_of_date'],['upside_stated','upside_stated']];
const CURRENCY_FIELDS:readonly FieldName[]=['target_currency','price_currency'];
const BY_VALUE:readonly FieldName[]=['analyst','ticker'];

const squash=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
/** Comparison key of a value: typed components when the conversion succeeds, else the squashed text. */
export function normalizedValue(field:FieldName,value:string):string{
 if(BY_VALUE.includes(field))return squash(value);
 const t=toTyped(field,value);
 if(t.failure!==null||(t.value.value_num===null&&t.value.value_date===null&&t.value.value_currency===null))return `text:${squash(value)}`;
 return `typed:${t.value.value_num??''}|${t.value.value_date??''}|${t.value.value_currency??''}|${t.value.value_unit??''}`;
}
export const conflictGroupId=(targetKey:string|null,field:FieldName,occurrence:number)=>`conflict:${targetKey??'-'}:${field}:${occurrence}`;

interface Entry{target_key:string|null;field:FieldName;evidence:Evidence;chunk:number;seq:number}

export function mergeChunks(chunks:ChunkExtraction[]):MergeResult{
 const ordered=[...chunks].sort((x,y)=>x.chunk-y.chunk);
 if(new Set(ordered.map(c=>c.chunk)).size!==ordered.length)throw new Error('duplicate_chunk');
 const entries:Entry[]=[];const targets=new Map<string,MergedTarget>();const scopes:ExtractionScope[]=[];
 let seq=0;
 const add=(target_key:string|null,field:FieldName,evidence:Evidence|undefined,chunk:number)=>{if(evidence)entries.push({target_key,field,evidence,chunk,seq:seq++});};
 for(const {chunk,extraction:x} of ordered){
  if(!scopes.includes(x.scope))scopes.push(x.scope);
  for(const [k,f] of REPORT_FIELDS)add(null,f,x[k],chunk);
  for(const a of x.analysts)add(null,'analyst',a,chunk);
  for(const t of x.targets){
   const key=parseBrokerTicker(t.ticker.value,t.exchange_hint).targetKey;
   const mt=targets.get(key)??{target_key:key,tickers_as_stated:[],exchange_hint:null};
   if(!mt.tickers_as_stated.includes(t.ticker.value))mt.tickers_as_stated.push(t.ticker.value);
   if(mt.exchange_hint===null&&t.exchange_hint)mt.exchange_hint=t.exchange_hint;
   targets.set(key,mt);
   add(key,'ticker',t.ticker,chunk);
   for(const [k,f] of TARGET_FIELDS)add(key,f,t[k],chunk);
  }
 }
 // group by (target_key, field) keeping first-appearance order, then by normalized value
 const groups=new Map<string,Map<string,Entry[]>>();
 for(const e of entries){
  const gk=JSON.stringify([e.target_key,e.field]);
  const g=groups.get(gk)??new Map<string,Entry[]>();
  const nk=normalizedValue(e.field,e.evidence.value);
  g.set(nk,[...(g.get(nk)??[]),e]);
  groups.set(gk,g);
 }
 const candidates:MergedCandidate[]=[];
 for(const g of groups.values()){
  const values=[...g.entries()];
  const conflicted=values.length>1&&!BY_VALUE.includes(values[0][1][0].field);
  values.forEach(([normalized,list],i)=>{
   const best=[...list].sort((x,y)=>x.evidence.page-y.evidence.page||x.chunk-y.chunk||x.seq-y.seq)[0];
   const occurrence=conflicted?1:BY_VALUE.includes(best.field)?i+1:1;
   candidates.push({target_key:best.target_key,field:best.field,occurrence,evidence:best.evidence,
    merged_from:[...new Set(list.map(e=>e.chunk))].sort((x,y)=>x-y),
    conflict_group:conflicted?conflictGroupId(best.target_key,best.field,1):null,normalized});
  });
 }
 return {version:MERGE_VERSION,scope:scopes.length===1?scopes[0]:null,scopes,targets:[...targets.values()],candidates};
}

export interface CandidateRowOptions{pages:PageText;extractor:string;resolutions?:ReadonlyMap<string,Record<string,unknown>>}
/**
 * Locates and types each merged candidate (spec §5.2, §5.3): located → 'extracted' with the span
 * and value_source_text = quote; not located → 'unverified' with no span, the quote kept in
 * detail.quote for the reviewer. Ticker rows carry the target's resolution snapshot.
 */
export function buildCandidateRows(merge:MergeResult,opts:CandidateRowOptions):CandidateFieldInput[]{
 return merge.candidates.map(c=>{
  const ev=c.evidence;
  const loc=locateQuote(opts.pages,ev.page,ev.quote);
  const typed=toTyped(c.field,ev.value,CURRENCY_FIELDS.includes(c.field)?ev.quote:undefined);
  const located=loc.status==='located';
  const detail:Record<string,unknown>={merge:MERGE_VERSION,locate:LOCATE_VERSION,typed:TYPED_VERSION,merged_from:c.merged_from};
  if(loc.status==='located'&&loc.multiple_hits)detail.multiple_hits=loc.multiple_hits;
  if(loc.status==='unverified'){detail.locate_failure=loc.reason;detail.quote=ev.quote;}
  if(typed.failure)detail.typed_failure=typed.failure;
  const resolution=c.field==='ticker'&&c.target_key!==null?opts.resolutions?.get(c.target_key):undefined;
  return {
   target_key:c.target_key,field:c.field,occurrence:c.occurrence,...typed.value,
   page:ev.page,char_start:located?loc.char_start:null,char_end:located?loc.char_end:null,value_source_text:located?ev.quote:null,
   extractor:opts.extractor,extractor_confidence:ev.confidence,conflict_group:c.conflict_group,detail,
   status:located?'extracted':'unverified',...(resolution?{resolution}:{}),
  };
 });
}
```

- [ ] **Step 4: 运行，确认通过**

```bash
npm test -- src/lib/broker-research/extract
```
Expected: schema / locate / typed / merge 全部通过

- [ ] **Step 5: 类型与 lint**

```bash
npm run typecheck && npm run lint
```
Expected: 退出码 0

- [ ] **Step 6: 提交**

```bash
git add -A src/lib/broker-research
```
```bash
git commit -m "feat(broker-research): chunk merge with conflict groups and candidate row assembly (B3)" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Run `git commit` as its own command; replace `<model>` with the implementing agent's model name.)

### Task B4: 规则 R1–R10 + 隔离项

**Files:**
- Create: `src/lib/broker-research/rules.ts`
- Test: `src/lib/broker-research/rules.test.ts`

- [ ] **Step 1: 写失败测试**（每条规则：通过、失败、跳过；R1 逐字（代理对后的码元偏移）、差一个空格、缺产物、越界、已取代 / 已拒绝 / absent 行不检；R2 容差两端与刚超出、Number 会失真的值、修正值优先、冲突候选不用；R3 市场币种表；R4 等号通过与 UTC 日期；R5 未知 / 他机构 / 未生效 / 已关闭 / 歧义；R6 0 与负数；R7 七天 + Jaccard ≥ 0.8、已取代前任排除；R8 只报告；R9 未解析 / 冲突；R10 信息码不隔离；阻断标志与 `BLOCKING_REASONS` 集合）

`src/lib/broker-research/rules.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {BLOCKING_REASONS,RULES_PARAMS,evaluateRules,jaccardAtLeast,marketCurrency,titleTokens,type RulesInput} from './rules';
import type {FieldRow,RatingScaleRow,TargetRow} from './types';
import type {PageText} from './extract/locate';

const SHA='a'.repeat(64);
const PAGES:PageText=[{page:1,text:'Rating: Overweight; target price US$120.00'},{page:2,text:'Upside 25.0% 🚀 x'}];
let n=0;
function field(o:Partial<FieldRow>&Pick<FieldRow,'field'>):FieldRow{
 n++;
 return {field_id:`f${String(n).padStart(3,'0')}`,report_id:'r1',parse_run_id:'p1',run_id:'x1',superseded_by_run_id:null,target_key:'NWND',occurrence:1,
  page:null,char_start:null,char_end:null,value_source_text:null,extractor:'llm:m@h',extractor_confidence:0.9,status:'confirmed',corrected:null,conflict_group:null,
  detail:{},reviewed_by:null,reviewed_at:null,created_at:'2026-11-05T00:00:00Z',value_text:'',value_num:null,value_currency:null,value_unit:null,value_date:null,...o};
}
function target(o:Partial<TargetRow>={}):TargetRow{
 return {report_id:'r1',target_key:'NWND',basis:'effective',ticker_as_stated:'NWND US',security_ticker:'NWND',issuer_id:'i1',resolution:{outcome:'resolved',candidates:['NWND']},
  rating_raw:'Overweight',rating_normalized:'overweight',scale_id:'s1',target_price:'120.00',target_currency:'USD',target_horizon_months:12,
  price_at_report:'96',price_currency:'USD',price_as_of_date:'2026-11-04',upside_pct:'0.25',upside_formula_version:'upside/1',input_hash:'h',...o};
}
const scale=(o:Partial<RatingScaleRow>={}):RatingScaleRow=>({scale_id:'s1',institution_id:'inst',raw_label:'Overweight',normalized:'overweight',source_url:'https://example.invalid/scale',valid_from:'2020-01-01',valid_to:null,created_by:'u',created_at:'2020-01-01T00:00:00Z',closed_by:null,closed_at:null,...o});
const upside=(num:string|null,o:Partial<FieldRow>={})=>field({field:'upside_stated',value_text:'25.0%',value_num:num,value_unit:'pct',page:2,char_start:7,char_end:12,value_source_text:'25.0%',...o});
function input(o:Partial<RulesInput>={}):RulesInput{
 return {report:{report_id:'r1',institution_id:'inst',published_date:'2026-11-05',title_original:'Northwind: Initiate at Overweight',supersedes_report_id:null},
  documentSha256:SHA,uploadedAt:'2026-11-05T10:00:00Z',fields:[upside('0.25')],targets:[target()],ratingScales:[scale()],artifacts:new Map([['p1',PAGES]]),...o};
}
const res=(out:ReturnType<typeof evaluateRules>,rule:string,tk:string|null='NWND')=>out.results.filter(r=>r.rule===rule&&r.target_key===tk);

describe('evaluateRules — happy path',()=>{
 it('all rules pass, nothing quarantined, versioned',()=>{
  const out=evaluateRules(input({peers:[]}));
  expect(out.version).toBe('broker-rules/1');
  expect(out.results.filter(r=>!r.passed)).toEqual([]);
  expect(out.quarantines).toEqual([]);
  expect(out.unverifiedFieldIds).toEqual([]);
  expect(out.infoCodes).toEqual([]);
  expect(new Set(out.results.map(r=>r.rule))).toEqual(new Set(['span_verbatim','upside_identity','currency_market','date_order','rating_scale_unique','positive_prices','ticker_resolution','horizon_present_with_target','possible_version']));
 });
 it('blocking flags follow spec §7.1',()=>{
  const out=evaluateRules(input({peers:[],texts:[{kind:'summary',id:'s',status:'approved',checks:[{name:'summary_overlap',passed:true}]}]}));
  const flags=Object.fromEntries(out.results.map(r=>[r.rule,r.blocking]));
  expect(flags).toEqual({span_verbatim:true,upside_identity:true,currency_market:true,date_order:true,rating_scale_unique:true,positive_prices:true,ticker_resolution:true,horizon_present_with_target:false,possible_version:false,text_checks:false});
 });
 it('exports the blocking reason set and parameters',()=>{
  expect([...BLOCKING_REASONS].sort()).toEqual(['ambiguous_rating_label','currency_mismatch','date_order','nonpositive_price','ticker_issuer_conflict','unknown_rating_label','unresolved_ticker','upside_mismatch']);
  expect(RULES_PARAMS).toEqual({upsideTolerance:'0.005',versionWindowDays:7,versionJaccard:{num:4,den:5}});
 });
});

describe('R1 span_verbatim',()=>{
 it('passes on a verbatim slice (UTF-16 offsets after an astral char)',()=>{
  const f=field({field:'rating',value_text:'x',page:2,char_start:16,char_end:17,value_source_text:'x'});
  expect(PAGES[1].text.slice(16,17)).toBe('x');
  expect(res(evaluateRules(input({fields:[f]})),'span_verbatim')[0]).toMatchObject({passed:true,detail:{field_id:f.field_id}});
 });
 it('a mismatch (one space) marks confirmed/extracted rows unverified, blocking, no quarantine',()=>{
  const a=field({field:'target_price',page:1,char_start:33,char_end:42,value_source_text:'US$ 120.0',status:'confirmed'});
  const b=field({field:'rating',page:1,char_start:8,char_end:18,value_source_text:'Overweight',status:'extracted'});
  const out=evaluateRules(input({fields:[a,b]}));
  expect(res(out,'span_verbatim').map(r=>[r.detail.field_id,r.passed,r.reason_code])).toEqual([[a.field_id,false,'span_mismatch'],[b.field_id,true,null]]);
  expect(out.unverifiedFieldIds).toEqual([a.field_id]);
  expect(out.quarantines.filter(q=>q.rule==='span_verbatim')).toEqual([]);
 });
 it('missing span, missing artifact, out-of-range span, superseded/rejected/absent rows',()=>{
  const noSpan=field({field:'rating',status:'unverified'});
  const noArt=field({field:'rating',parse_run_id:'p9',page:1,char_start:0,char_end:6,value_source_text:'Rating'});
  const range=field({field:'rating',page:1,char_start:0,char_end:999,value_source_text:'Rating'});
  const sup=field({field:'rating',superseded_by_run_id:'x2',page:1,char_start:0,char_end:1,value_source_text:'nope'});
  const rej=field({field:'rating',status:'rejected',page:1,char_start:0,char_end:1,value_source_text:'nope'});
  const abs=field({field:'target_horizon',status:'absent',value_text:'ABSENT',page:1,extractor:'human:u'});
  const out=evaluateRules(input({fields:[noSpan,noArt,range,sup,rej,abs]}));
  expect(res(out,'span_verbatim').map(r=>[r.detail.field_id,r.reason_code])).toEqual([[noSpan.field_id,'span_missing'],[noArt.field_id,'artifact_unavailable'],[range.field_id,'span_mismatch']]);
  expect(out.unverifiedFieldIds).toEqual([noArt.field_id,range.field_id]);
 });
});

describe('R2 upside_identity (tolerance 0.005, exact decimals)',()=>{
 const run=(stated:string|null,t:Partial<TargetRow>={})=>evaluateRules(input({fields:stated===null?[]:[upside(stated)],targets:[target(t)]}));
 it('passes within tolerance at both edges and fails just outside',()=>{
  expect(res(run('0.25'),'upside_identity')[0]).toMatchObject({passed:true,detail:{computed:'0.25'}});
  expect(res(run('0.255'),'upside_identity')[0].passed).toBe(true);
  expect(res(run('0.245'),'upside_identity')[0].passed).toBe(true);
  const out=run('0.2551');
  expect(res(out,'upside_identity')[0]).toMatchObject({passed:false,blocking:true,reason_code:'upside_mismatch'});
  expect(out.quarantines).toEqual([{naturalKey:`${SHA}:upside_identity:NWND`,rule:'upside_identity',reasonCode:'upside_mismatch',targetKey:'NWND',payload:{target_key:'NWND',upside_stated:'0.2551',target_price:'120.00',price_at_report:'96',page:2}}]);
 });
 it('handles values a double would round (no Number)',()=>{
  expect(res(run('0.1',{target_price:'0.3',price_at_report:'0.2727272727272727272727'}),'upside_identity')[0].passed).toBe(true);
  expect(res(run('0',{target_price:'12345678901234567890.12',price_at_report:'12345678901234567890.12'}),'upside_identity')[0].passed).toBe(true);
 });
 it('skips without a stated upside, without prices, with different currencies or nonpositive price',()=>{
  expect(res(run(null),'upside_identity')[0]).toMatchObject({passed:true,detail:{skipped:'upside_stated_missing'}});
  expect(res(run('0.25',{price_at_report:null}),'upside_identity')[0].detail).toEqual({skipped:'price_missing'});
  expect(res(run('0.25',{price_currency:'HKD'}),'upside_identity')[0].detail).toEqual({skipped:'currency_differs'});
  expect(res(run('0.25',{price_at_report:'0'}),'upside_identity')[0].detail).toEqual({skipped:'nonpositive_price'});
 });
 it('uses the corrected value of an effective row over candidates; conflicted candidates are not used',()=>{
  const corrected=upside('0.9',{status:'corrected',corrected:{value_text:'25%',value_num:'0.25'}});
  expect(res(evaluateRules(input({fields:[corrected]})),'upside_identity')[0].passed).toBe(true);
  const c1=upside('0.9',{status:'extracted',conflict_group:'g'}),c2=upside('0.25',{status:'extracted',conflict_group:'g'});
  expect(res(evaluateRules(input({fields:[c1,c2]})),'upside_identity')[0].detail).toEqual({skipped:'upside_stated_missing'});
  const single=upside('0.9',{status:'extracted'});
  expect(res(evaluateRules(input({fields:[single]})),'upside_identity')[0].passed).toBe(false);
 });
});

describe('R3 currency_market',()=>{
 it.each([['600519.SH','CNY'],['000858.SZ','CNY'],['430047.BJ','CNY'],['09988.HK','HKD'],['BABA','USD'],['BRK.B','USD']])('%s → %s',(t,c)=>expect(marketCurrency(t)).toBe(c));
 it('fails when either currency is outside the market; skips without security_ticker',()=>{
  const out=evaluateRules(input({targets:[target({security_ticker:'09988.HK',target_currency:'HKD',price_currency:'USD'})],fields:[]}));
  expect(res(out,'currency_market')[0]).toMatchObject({passed:false,reason_code:'currency_mismatch',detail:{allowed:'HKD',offending:[{price_currency:'USD'}]}});
  expect(out.quarantines.map(q=>q.naturalKey)).toContain(`${SHA}:currency_market:NWND`);
  expect(res(evaluateRules(input({targets:[target({security_ticker:null,issuer_id:null})]})),'currency_market')[0].detail).toEqual({skipped:'security_ticker_missing'});
 });
});

describe('R4 date_order',()=>{
 it('price_as_of ≤ published ≤ uploaded UTC date; equality passes',()=>{
  expect(evaluateRules(input({targets:[target({price_as_of_date:'2026-11-05'})]})).results.filter(r=>r.rule==='date_order').every(r=>r.passed)).toBe(true);
  const late=evaluateRules(input({targets:[target({price_as_of_date:'2026-11-06'})]}));
  expect(res(late,'date_order')[0]).toMatchObject({passed:false,reason_code:'date_order'});
  const future=evaluateRules(input({report:{report_id:'r1',institution_id:'inst',published_date:'2026-11-06',title_original:'t',supersedes_report_id:null},uploadedAt:'2026-11-06T07:00:00+08:00',targets:[]}));
  expect(res(future,'date_order',null)[0]).toMatchObject({passed:false,detail:{uploaded_date:'2026-11-05'}});
  expect(future.quarantines.map(q=>q.naturalKey)).toEqual([`${SHA}:date_order:-`]);
 });
 it('skips missing dates and rejects an invalid uploaded_at',()=>{
  const out=evaluateRules(input({report:{report_id:'r1',institution_id:'inst',published_date:null,title_original:'t',supersedes_report_id:null}}));
  expect(res(out,'date_order',null)[0].detail).toEqual({skipped:'published_date_missing'});
  expect(res(out,'date_order')[0].detail).toEqual({skipped:'date_missing'});
  expect(()=>evaluateRules(input({uploadedAt:'x'}))).toThrow('invalid_uploaded_at');
 });
});

describe('R5 rating_scale_unique',()=>{
 it('exactly one row valid on published_date (case/space-insensitive label)',()=>{
  expect(res(evaluateRules(input({targets:[target({rating_raw:' OVERWEIGHT '})]})),'rating_scale_unique')[0]).toMatchObject({passed:true,detail:{matches:['s1']}});
 });
 it('unknown (none, other institution, not yet valid, closed) and ambiguous',()=>{
  const cases:[RatingScaleRow[],string][]=[[[],'unknown_rating_label'],[[scale({institution_id:'other'})],'unknown_rating_label'],[[scale({valid_from:'2026-11-06'})],'unknown_rating_label'],
   [[scale({valid_to:'2026-11-05'})],'unknown_rating_label'],[[scale(),scale({scale_id:'s2',valid_from:'2021-01-01'})],'ambiguous_rating_label']];
  for(const [rows,code] of cases){
   const out=evaluateRules(input({ratingScales:rows}));
   expect(res(out,'rating_scale_unique')[0]).toMatchObject({passed:false,reason_code:code});
   expect(out.quarantines.find(q=>q.rule==='rating_scale_unique')).toMatchObject({reasonCode:code,payload:{rating_raw:'Overweight',published_date:'2026-11-05'}});
  }
  expect(res(evaluateRules(input({ratingScales:[scale({valid_to:'2026-11-06'})]})),'rating_scale_unique')[0].passed).toBe(true);
 });
 it('skips without a rating or without institution/date',()=>{
  expect(res(evaluateRules(input({targets:[target({rating_raw:null})]})),'rating_scale_unique')[0].detail).toEqual({skipped:'rating_missing'});
  expect(res(evaluateRules(input({report:{report_id:'r1',institution_id:null,published_date:'2026-11-05',title_original:'t',supersedes_report_id:null}})),'rating_scale_unique')[0].detail).toEqual({skipped:'institution_or_date_missing'});
 });
});

describe('R6 positive_prices',()=>{
 it('zero and negative prices fail; missing prices skip',()=>{
  expect(res(evaluateRules(input({targets:[target({target_price:'0'})],fields:[]})),'positive_prices')[0]).toMatchObject({passed:false,reason_code:'nonpositive_price',detail:{offending:['target_price']}});
  expect(res(evaluateRules(input({targets:[target({price_at_report:'-0.01'})],fields:[]})),'positive_prices')[0].detail).toEqual({offending:['price_at_report']});
  expect(res(evaluateRules(input({targets:[target({target_price:'0.0001'})],fields:[]})),'positive_prices')[0].passed).toBe(true);
  expect(res(evaluateRules(input({targets:[target({target_price:null,price_at_report:null})],fields:[]})),'positive_prices')[0].detail).toEqual({skipped:'prices_missing'});
 });
});

describe('R7 possible_version (non-blocking)',()=>{
 const peer=(o:Record<string,unknown>={})=>({report_id:'r0',institution_id:'inst',published_date:'2026-10-30',title_original:'Northwind: Initiate at Overweight',security_tickers:['NWND'],...o});
 it('same institution + security, ≤ 7 days, Jaccard ≥ 0.8 → quarantined, not blocking',()=>{
  const out=evaluateRules(input({peers:[peer(),peer({report_id:'r2',published_date:'2026-10-28'}),peer({report_id:'r3',institution_id:'x'}),peer({report_id:'r4',security_tickers:['OTHER']}),peer({report_id:'r5',title_original:'Completely different note'}),peer({report_id:'r1'})]}));
  expect(res(out,'possible_version',null)[0]).toMatchObject({passed:false,blocking:false,reason_code:'possible_version',detail:{peers:['r0']}});
  expect(out.quarantines.find(q=>q.rule==='possible_version')).toEqual({naturalKey:`${SHA}:possible_version:-`,rule:'possible_version',reasonCode:'possible_version',targetKey:null,payload:{peers:['r0'],published_date:'2026-11-05'}});
 });
 it('an already-superseded predecessor is not reported; missing inputs skip',()=>{
  const out=evaluateRules(input({report:{report_id:'r1',institution_id:'inst',published_date:'2026-11-05',title_original:'Northwind: Initiate at Overweight',supersedes_report_id:'r0'},peers:[peer()]}));
  expect(res(out,'possible_version',null)[0].passed).toBe(true);
  expect(res(evaluateRules(input()),'possible_version',null)[0].detail).toEqual({skipped:'peers_not_supplied'});
 });
 it('title tokens and Jaccard',()=>{
  expect(titleTokens('贵州茅台: Initiate at OW')).toEqual(new Set(['贵','州','茅','台','initiate','at','ow']));
  expect(jaccardAtLeast(new Set(['a','b','c','d']),new Set(['a','b','c','d','e']),4,5)).toBe(true);
  expect(jaccardAtLeast(new Set(['a','b','c']),new Set(['a','b','c','d']),4,5)).toBe(false);
  expect(jaccardAtLeast(new Set(),new Set(),4,5)).toBe(false);
 });
});

describe('R8 text checks (reported only)',()=>{
 it('reports the first failing stored check without blocking or quarantine',()=>{
  const out=evaluateRules(input({texts:[{kind:'snippet',id:'n1',status:'draft',checks:[{name:'disclosure',passed:true},{name:'restricted_value',passed:false}]}]}));
  expect(res(out,'text_checks',null)[0]).toMatchObject({passed:false,blocking:false,reason_code:'restricted_value',detail:{kind:'snippet',id:'n1'}});
  expect(out.quarantines.filter(q=>q.rule==='text_checks')).toEqual([]);
 });
});

describe('R9 ticker_resolution',()=>{
 it('unresolved and conflict quarantine with blocking reasons',()=>{
  const out=evaluateRules(input({targets:[target({target_key:'ZZZZ',issuer_id:null,security_ticker:null,resolution:{outcome:'unresolved',candidates:['ZZZZ']}}),target({target_key:'XYZ.A',issuer_id:null,security_ticker:null,resolution:{outcome:'conflict',candidates:['XYZ.A','XYZ']}})],fields:[]}));
  expect(res(out,'ticker_resolution','ZZZZ')[0]).toMatchObject({passed:false,blocking:true,reason_code:'unresolved_ticker'});
  expect(res(out,'ticker_resolution','XYZ.A')[0].reason_code).toBe('ticker_issuer_conflict');
  expect(out.quarantines.filter(q=>q.rule==='ticker_resolution').map(q=>[q.naturalKey,q.reasonCode,q.payload.candidates])).toEqual([[`${SHA}:ticker_resolution:XYZ.A`,'ticker_issuer_conflict',['XYZ.A','XYZ']],[`${SHA}:ticker_resolution:ZZZZ`,'unresolved_ticker',['ZZZZ']]]);
 });
});

describe('R10 horizon_present_with_target',()=>{
 it('warns (info code, no quarantine) when a target price has no horizon and no absent row',()=>{
  const out=evaluateRules(input({targets:[target({target_horizon_months:null})]}));
  expect(res(out,'horizon_present_with_target')[0]).toMatchObject({passed:false,blocking:false,reason_code:'horizon_missing'});
  expect(out.infoCodes).toEqual(['rule_warning_summary']);
  expect(out.quarantines.filter(q=>q.rule==='horizon_present_with_target')).toEqual([]);
 });
 it('an absent(target_horizon) row or no target price satisfies it',()=>{
  const abs=field({field:'target_horizon',status:'absent',value_text:'ABSENT',page:1,extractor:'human:u'});
  expect(res(evaluateRules(input({targets:[target({target_horizon_months:null})],fields:[abs]})),'horizon_present_with_target')[0].passed).toBe(true);
  expect(res(evaluateRules(input({targets:[target({target_price:null,target_horizon_months:null})]})),'horizon_present_with_target')[0].detail).toEqual({skipped:'no_target_price'});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

```bash
npm test -- src/lib/broker-research/rules.test.ts
```
Expected: FAIL（`./rules` 不存在）

- [ ] **Step 3: 实现**

要点：输入是物化后的 `targets` 与非取代证据行；`upside_stated` 取生效行（`effectiveValue`）否则取唯一无冲突候选（与物化的候选基准一致）；R2 用 `|stated·p − (t − p)| ≤ 0.005·p` 全程定标 BigInt；回执的 `input_hash` 由调用方原样填读到的 `rules_input_hash`，本模块不算哈希；`naturalKey = ${sha256}:${rule}:${target_key ?? '-'}`，`payload` 只含值与页码。

`src/lib/broker-research/rules.ts`:
```ts
// src/lib/broker-research/rules.ts
// Report rules R1–R10 (spec §7.1, RULES_VERSION) and quarantine items (spec §7.2). Pure: the
// caller (extract/review services, Tasks C5/C6) supplies the materialized targets, the
// non-superseded evidence rows, the institution's rating-scale rows, the parse artifacts as
// PageText (extract/locate.ts) keyed by parse_run_id, and optional R7/R8 inputs; it writes the
// receipt (input_hash = reports.rules_input_hash as read, never recomputed in TS) and calls
// quarantine() for each item. Decimal math via decimal.ts — never Number. Every rule emits a
// RuleResult per subject; a rule that cannot apply emits passed:true with detail.skipped.
// R1 failures mark fields unverified (no quarantine); R10 only yields the info code
// rule_warning_summary; R7 quarantines but does not block; R8 (overlap/grounding/disclosure) is
// an approval condition enforced by summary/snippet services and triggers — here it only
// reports the stored checks of the texts passed in.
import type {FieldRow,RatingScaleRow,ReportRow,RuleResult,TargetRow,TypedValue} from './types';
import {effectiveValue} from './effective';
import {dec,decAbs,decCmp,decDiv,decMul,decString,decSub} from './decimal';
import {sliceText,type PageText} from './extract/locate';
import {RULES_VERSION} from './versions';

export const RULES_PARAMS=Object.freeze({upsideTolerance:'0.005',versionWindowDays:7,versionJaccard:{num:4,den:5}});
/** dq reason codes that block publication (spec §4.4 blocker 10); must equal the SQL set. */
export const BLOCKING_REASONS=['upside_mismatch','currency_mismatch','date_order','nonpositive_price','unknown_rating_label','ambiguous_rating_label','ticker_issuer_conflict','unresolved_ticker'] as const;
export const RULE_IDS=Object.freeze({R1:'span_verbatim',R2:'upside_identity',R3:'currency_market',R4:'date_order',R5:'rating_scale_unique',R6:'positive_prices',R7:'possible_version',R8:'text_checks',R9:'ticker_resolution',R10:'horizon_present_with_target'});
export const QUARANTINE_DATASET='broker_research';
export const QUARANTINE_TABLE='broker_research_reports';

export interface QuarantineItem{naturalKey:string;rule:string;reasonCode:string;targetKey:string|null;payload:Record<string,unknown>}
export interface VersionPeer{report_id:string;institution_id:string|null;published_date:string|null;title_original:string|null;security_tickers:string[]}
export interface TextCheckRecord{kind:'snippet'|'summary';id:string;status:'draft'|'approved'|'rejected';checks:{name:string;passed:boolean}[]}
export interface RulesInput{
 report:Pick<ReportRow,'report_id'|'institution_id'|'published_date'|'title_original'|'supersedes_report_id'>;
 documentSha256:string;uploadedAt:string;fields:FieldRow[];targets:TargetRow[];ratingScales:RatingScaleRow[];
 artifacts:ReadonlyMap<string,PageText>;peers?:VersionPeer[];texts?:TextCheckRecord[];
}
export interface RulesOutput{version:string;results:RuleResult[];quarantines:QuarantineItem[];unverifiedFieldIds:string[];infoCodes:string[]}

const BLOCKING:Readonly<Record<string,boolean>>={span_verbatim:true,upside_identity:true,currency_market:true,date_order:true,rating_scale_unique:true,positive_prices:true,possible_version:false,text_checks:false,ticker_resolution:true,horizon_present_with_target:false};
const EFFECTIVE=new Set(['confirmed','corrected','absent']);
const CANDIDATE=new Set(['extracted','unverified']);
/** Market currency of a universe ticker (spec §7.1 R3). */
export function marketCurrency(securityTicker:string):'CNY'|'HKD'|'USD'{
 return /\.(SH|SZ|BJ)$/.test(securityTicker)?'CNY':/\.HK$/.test(securityTicker)?'HKD':'USD';
}
/** Rating label comparison key; the SQL selector must use lower(btrim(label)) (see 契约修订建议). */
export const ratingKey=(s:string)=>s.trim().toLowerCase();
const utcDate=(iso:string)=>{const ms=Date.parse(iso);if(Number.isNaN(ms))throw new Error('invalid_uploaded_at');return new Date(ms).toISOString().slice(0,10);};
const dayDiff=(a:string,b:string)=>Math.abs(Date.parse(`${a}T00:00:00Z`)-Date.parse(`${b}T00:00:00Z`))/86400000;
/** Title tokens for R7: each Han character is a token; other letter/digit runs are tokens. */
export function titleTokens(s:string):Set<string>{
 return new Set([...s.normalize('NFKC').toLowerCase().matchAll(/\p{Script=Han}|(?:(?!\p{Script=Han})[\p{L}\p{N}])+/gu)].map(m=>m[0]));
}
/** Jaccard(a,b) ≥ num/den without floating point. */
export function jaccardAtLeast(a:Set<string>,b:Set<string>,num:number,den:number):boolean{
 const inter=[...a].filter(x=>b.has(x)).length,union=new Set([...a,...b]).size;
 return union>0&&inter*den>=num*union;
}

type Picked={kind:'value';value:TypedValue;row:FieldRow}|{kind:'absent';row:FieldRow}|{kind:'none'};
/** Value of (target_key, field): an effective row wins; else the single unconflicted candidate (materialize's candidate basis). */
function pickValue(fields:FieldRow[],targetKey:string|null,field:string):Picked{
 const same=fields.filter(f=>f.target_key===targetKey&&f.field===field).sort((x,y)=>x.occurrence-y.occurrence);
 const eff=same.filter(f=>EFFECTIVE.has(f.status));
 if(eff.length)return eff[0].status==='absent'?{kind:'absent',row:eff[0]}:{kind:'value',value:effectiveValue(eff[0]),row:eff[0]};
 const cand=same.filter(f=>CANDIDATE.has(f.status));
 return cand.length===1&&cand[0].conflict_group===null?{kind:'value',value:cand[0],row:cand[0]}:{kind:'none'};
}

export function evaluateRules(input:RulesInput):RulesOutput{
 const results:RuleResult[]=[];const quarantines:QuarantineItem[]=[];const unverified:string[]=[];const info=new Set<string>();
 const fields=input.fields.filter(f=>f.superseded_by_run_id===null&&f.status!=='rejected');
 const targets=[...input.targets].sort((x,y)=>x.target_key<y.target_key?-1:x.target_key>y.target_key?1:0);
 const {report}=input;
 const push=(rule:string,target_key:string|null,passed:boolean,reason_code:string|null,detail:Record<string,unknown>,quarantine?:Record<string,unknown>)=>{
  results.push({rule,passed,blocking:BLOCKING[rule],target_key,reason_code:passed?null:reason_code,detail});
  if(!passed&&quarantine&&reason_code)quarantines.push({naturalKey:`${input.documentSha256}:${rule}:${target_key??'-'}`,rule,reasonCode:reason_code,targetKey:target_key,payload:quarantine});
 };
 const skip=(rule:string,target_key:string|null,why:string)=>push(rule,target_key,true,null,{skipped:why});

 // R1 span_verbatim — every row with a span (absent rows have none by constraint)
 for(const f of [...fields].sort((x,y)=>x.field_id<y.field_id?-1:1)){
  if(f.status==='absent')continue;
  const d={field_id:f.field_id,field:f.field,page:f.page};
  if(f.page===null||f.char_start===null||f.char_end===null||f.value_source_text===null||f.parse_run_id===null){
   push('span_verbatim',f.target_key,false,'span_missing',d);
   if(f.status!=='unverified')unverified.push(f.field_id);
   continue;
  }
  const art=input.artifacts.get(f.parse_run_id);
  const slice=art?sliceText(art,f.page,f.char_start,f.char_end):null;
  const ok=slice!==null&&slice===f.value_source_text;
  push('span_verbatim',f.target_key,ok,art?'span_mismatch':'artifact_unavailable',d);
  if(!ok&&f.status!=='unverified')unverified.push(f.field_id);
 }

 const uploaded=utcDate(input.uploadedAt);
 // R4 report level: published_date ≤ uploaded_at::date
 if(report.published_date===null)skip('date_order',null,'published_date_missing');
 else{const ok=report.published_date<=uploaded;push('date_order',null,ok,'date_order',{published_date:report.published_date,uploaded_date:uploaded},{published_date:report.published_date,uploaded_date:uploaded});}

 for(const t of targets){
  const tk=t.target_key;
  // R2 upside_identity: |stated·p − (t − p)| ≤ tol·p  ⇔  |stated − (t/p − 1)| ≤ tol
  const up=pickValue(fields,tk,'upside_stated');
  if(up.kind!=='value'||up.value.value_num===null)skip('upside_identity',tk,'upside_stated_missing');
  else if(t.target_price===null||t.price_at_report===null)skip('upside_identity',tk,'price_missing');
  else if(t.target_currency===null||t.target_currency!==t.price_currency)skip('upside_identity',tk,'currency_differs');
  else if(decCmp(dec(t.price_at_report),dec('0'))<=0)skip('upside_identity',tk,'nonpositive_price');
  else{
   const s=dec(up.value.value_num),tp=dec(t.target_price),p=dec(t.price_at_report);
   const ok=decCmp(decAbs(decSub(decMul(s,p),decSub(tp,p))),decMul(dec(RULES_PARAMS.upsideTolerance),p))<=0;
   const computed=decString(decSub(decDiv(tp,p,8),dec('1')));
   push('upside_identity',tk,ok,'upside_mismatch',{upside_stated:up.value.value_num,computed,tolerance:RULES_PARAMS.upsideTolerance},
    {target_key:tk,upside_stated:up.value.value_num,target_price:t.target_price,price_at_report:t.price_at_report,page:up.row.page});
  }
  // R3 currency_market
  if(t.security_ticker===null)skip('currency_market',tk,'security_ticker_missing');
  else{
   const allowed=marketCurrency(t.security_ticker);
   const bad=[['target_currency',t.target_currency],['price_currency',t.price_currency]].filter(([,c])=>c!==null&&c!==allowed).map(([k,c])=>({[k as string]:c}));
   push('currency_market',tk,bad.length===0,'currency_mismatch',{security_ticker:t.security_ticker,allowed,offending:bad},{target_key:tk,security_ticker:t.security_ticker,target_currency:t.target_currency,price_currency:t.price_currency});
  }
  // R4 target level: price_as_of_date ≤ published_date
  if(t.price_as_of_date===null||report.published_date===null)skip('date_order',tk,'date_missing');
  else{const ok=t.price_as_of_date<=report.published_date;push('date_order',tk,ok,'date_order',{price_as_of_date:t.price_as_of_date,published_date:report.published_date},{target_key:tk,price_as_of_date:t.price_as_of_date,published_date:report.published_date});}
  // R5 rating_scale_unique
  if(t.rating_raw===null)skip('rating_scale_unique',tk,'rating_missing');
  else if(report.institution_id===null||report.published_date===null)skip('rating_scale_unique',tk,'institution_or_date_missing');
  else{
   const pd=report.published_date,key=ratingKey(t.rating_raw);
   const rows=input.ratingScales.filter(s=>s.institution_id===report.institution_id&&ratingKey(s.raw_label)===key&&s.valid_from<=pd&&(s.valid_to===null||pd<s.valid_to));
   push('rating_scale_unique',tk,rows.length===1,rows.length===0?'unknown_rating_label':'ambiguous_rating_label',{rating_raw:t.rating_raw,matches:rows.map(r=>r.scale_id)},{target_key:tk,rating_raw:t.rating_raw,published_date:pd});
  }
  // R6 positive_prices
  const nonpos=[['target_price',t.target_price],['price_at_report',t.price_at_report]].filter(([,v])=>v!==null&&decCmp(dec(v as string),dec('0'))<=0);
  if(t.target_price===null&&t.price_at_report===null)skip('positive_prices',tk,'prices_missing');
  else push('positive_prices',tk,nonpos.length===0,'nonpositive_price',{offending:nonpos.map(([k])=>k)},{target_key:tk,target_price:t.target_price,price_at_report:t.price_at_report});
  // R9 ticker_resolution
  const outcome=(t.resolution as {outcome?:unknown}).outcome;
  const reason=outcome==='conflict'?'ticker_issuer_conflict':'unresolved_ticker';
  push('ticker_resolution',tk,t.issuer_id!==null,reason,{issuer_id:t.issuer_id,outcome:outcome??null},{target_key:tk,ticker_as_stated:t.ticker_as_stated,candidates:(t.resolution as {candidates?:unknown}).candidates??[]});
  // R10 horizon_present_with_target
  if(t.target_price===null)skip('horizon_present_with_target',tk,'no_target_price');
  else{
   const ok=t.target_horizon_months!==null||pickValue(fields,tk,'target_horizon').kind==='absent';
   push('horizon_present_with_target',tk,ok,'horizon_missing',{});
   if(!ok)info.add('rule_warning_summary');
  }
 }

 // R7 possible_version (non-blocking)
 if(input.peers===undefined)skip('possible_version',null,'peers_not_supplied');
 else if(report.institution_id===null||report.published_date===null||report.title_original===null)skip('possible_version',null,'report_incomplete');
 else{
  const mine=new Set(targets.map(t=>t.security_ticker).filter((v):v is string=>v!==null));
  const tokens=titleTokens(report.title_original);
  const {num,den}=RULES_PARAMS.versionJaccard;
  const hits=input.peers.filter(p=>p.report_id!==report.report_id&&p.report_id!==report.supersedes_report_id&&p.institution_id===report.institution_id
   &&p.published_date!==null&&p.title_original!==null&&p.security_tickers.some(s=>mine.has(s))
   &&dayDiff(p.published_date,report.published_date!)<=RULES_PARAMS.versionWindowDays&&jaccardAtLeast(tokens,titleTokens(p.title_original),num,den)).map(p=>p.report_id).sort();
  push('possible_version',null,hits.length===0,'possible_version',{peers:hits},{peers:hits,published_date:report.published_date});
 }
 // R8 text checks (reported only)
 for(const t of input.texts??[]){
  const failed=t.checks.find(c=>!c.passed);
  push('text_checks',null,!failed,failed?.name??null,{kind:t.kind,id:t.id,status:t.status});
 }
 return {version:RULES_VERSION,results,quarantines,unverifiedFieldIds:[...new Set(unverified)],infoCodes:[...info]};
}
```

- [ ] **Step 4: 运行，确认通过**

```bash
npm test -- src/lib/broker-research/rules.test.ts
```
Expected: 30 tests passed

- [ ] **Step 5: 类型与 lint**

```bash
npm run typecheck && npm run lint
```
Expected: 退出码 0

- [ ] **Step 6: 提交**

```bash
git add -A src/lib/broker-research
```
```bash
git commit -m "feat(broker-research): rules R1-R10 with quarantine items and exact decimal math (B4)" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Run `git commit` as its own command; replace `<model>` with the implementing agent's model name.)

### Task B5: 内容级披露检查 disclosure + 摘要逐字重叠 overlap + 数值落地 grounding

**Files:**
- Create: `src/lib/broker-research/disclosure.ts`
- Create: `src/lib/broker-research/summary/overlap.ts`
- Create: `src/lib/broker-research/summary/grounding.ts`
- Test: `src/lib/broker-research/disclosure.test.ts`
- Test: `src/lib/broker-research/summary/overlap.test.ts`
- Test: `src/lib/broker-research/summary/grounding.test.ts`

- [ ] **Step 1: 写失败测试**（披露：目标价各种格式变体、`|upside|` 百分数 / 小数两写法与 1 位小数、许可允许时放行、分析师名大小写 / 空白 / 变体 / CJK 子串、`public_display=true` 放行、输入哈希覆盖每个输入——验收样例 3 的片段面；重叠：代码点计、空白折叠与 NFKC、与暴力 LCS 随机对拍、30 万字源线性；落地：**验收样例 4「营收 100」→ `no_keyword`**、一句两数 → `multiple_numbers`、标识符中的数字不算数（`9999.HK`、`09999.HK`、`9999 HK`；裸 `9999` 算数）、百分数 / 小数、单位不符、月数、报告级 `wacc`、币种不符、多标的必须点名恰一个、下行空间、缺字段、最近关键词、逐句下标）

`src/lib/broker-research/disclosure.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {checkDisclosure,disclosureInputsHash,numberTokens,type DisclosureInput} from './disclosure';

const base:DisclosureInput={allowsPublicTargetPrice:false,targets:[{target_key:'9999.HK',target_price:'936.00',upside_pct:'0.25'},{target_key:'NWND',target_price:'120.42',upside_pct:'-0.0834'}],
 analysts:[{analyst_id:'a1',display_name:'Jane Roe',name_variants:['J. Roe'],public_display:false},{analyst_id:'a2',display_name:'李明',name_variants:[],public_display:false},{analyst_id:'a3',display_name:'Pub Lic',name_variants:[],public_display:true}]};
const kinds=(t:string,i:DisclosureInput=base)=>checkDisclosure(t,i).hits.map(h=>[h.kind,h.token,h.target_key??h.analyst_id]);

describe('numberTokens',()=>{
 it('strips thousands separators and percent; NFKC full-width',()=>{
  expect(numberTokens('HK$1,234.50 and 25 % and ２５％ and Rmb120').map(t=>[t.value,t.percent])).toEqual([['1234.5',false],['25',true],['25',true],['120',false]]);
 });
});

describe('checkDisclosure (spec §4.11)',()=>{
 it('restricted target price in every format variant (acceptance sample 3)',()=>{
  for(const t of ['目标价 HK$936','target 936.00','HK$936.0 target','price of 936','９３６港元','we see 120.4 fair','120.42'])expect(checkDisclosure(t,base).passed).toBe(false);
  expect(kinds('目标价 HK$936')).toEqual([['restricted_value:target','936','9999.HK']]);
  expect(kinds('估值 1,936')).toEqual([]);
 });
 it('restricted |upside| in percent and decimal writing, rounded to one decimal',()=>{
  expect(kinds('upside of 25%')).toEqual([['restricted_value:target','25%','9999.HK']]);
  expect(kinds('upside 25.0 %')).toEqual([['restricted_value:target','25.0 %','9999.HK']]);
  expect(kinds('a ratio of 0.25')).toEqual([['restricted_value:target','0.25','9999.HK']]);
  expect(kinds('downside 8.3%')).toEqual([['restricted_value:target','8.3%','NWND']]);
  expect(kinds('downside 8.34%')).toEqual([['restricted_value:target','8.34%','NWND']]);
  expect(kinds('growth 26%')).toEqual([]);
 });
 it('passes numbers when the licence allows public target prices',()=>{
  expect(checkDisclosure('目标价 HK$936，空间 25%',{...base,allowsPublicTargetPrice:true}).passed).toBe(true);
 });
 it('restricted analyst names: case-insensitive, whitespace-collapsed, variants, CJK substring; public names pass',()=>{
  expect(kinds('by JANE   ROE')).toEqual([['restricted_name','Jane Roe','a1']]);
  expect(kinds('per j. roe')).toEqual([['restricted_name','J. Roe','a1']]);
  expect(kinds('分析师李明认为')).toEqual([['restricted_name','李明','a2']]);
  expect(kinds('Pub Lic says')).toEqual([]);
  expect(checkDisclosure('nothing here',base)).toMatchObject({version:'disclosure/1',passed:true,hits:[]});
 });
 it('dedupes hits and hashes every input',()=>{
  expect(kinds('936 and 936')).toHaveLength(1);
  const h=disclosureInputsHash('x',base);
  expect(checkDisclosure('x',base).inputs_hash).toBe(h);
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(disclosureInputsHash('x',{...base,targets:[...base.targets].reverse()})).toBe(h);
  expect(disclosureInputsHash('y',base)).not.toBe(h);
  expect(disclosureInputsHash('x',{...base,allowsPublicTargetPrice:true})).not.toBe(h);
  expect(disclosureInputsHash('x',{...base,analysts:[{...base.analysts[0],public_display:true},...base.analysts.slice(1)]})).not.toBe(h);
 });
});
```

`src/lib/broker-research/summary/overlap.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {maxVerbatimOverlap} from './overlap';

const brute=(a:string,b:string)=>{const x=Array.from(a),y=Array.from(b);let best=0;
 for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++){let k=0;while(i+k<x.length&&j+k<y.length&&x[i+k]===y[j+k])k++;if(k>best)best=k;}return best;};

describe('maxVerbatimOverlap (spec §6.4 (a))',()=>{
 it('measures the longest copied run in code points',()=>{
  const src='The company reported strong growth in cloud revenue this quarter.';
  expect(maxVerbatimOverlap('We note strong growth in cloud demand.',src)).toBe(' strong growth in cloud '.length);
  expect(maxVerbatimOverlap('完全不同',src)).toBe(0);
  expect(maxVerbatimOverlap('',src)).toBe(0);
  expect(maxVerbatimOverlap('🚀🚀x','a🚀🚀xb')).toBe(3);
 });
 it('collapses whitespace and applies NFKC so line breaks do not hide copying',()=>{
  expect(maxVerbatimOverlap('strong growth in cloud','strong\n  growth in\tcloud')).toBe('strong growth in cloud'.length);
  expect(maxVerbatimOverlap('ＡＢＣ','ABC')).toBe(3);
 });
 it('matches a brute-force LCS on pseudo-random strings',()=>{
  let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  const gen=(n:number)=>Array.from({length:n},()=>'abc 中'[Math.floor(rnd()*5)]).join('').replace(/\s+/g,' ');
  for(let i=0;i<200;i++){const a=gen(1+Math.floor(rnd()*30)),b=gen(1+Math.floor(rnd()*60));expect(maxVerbatimOverlap(a,b)).toBe(brute(a,b));}
 });
 it('runs linearly on a long source',()=>{
  const src='x'.repeat(300000)+'needle in a haystack';
  const t=Date.now();expect(maxVerbatimOverlap('a needle in a hay',src)).toBe('needle in a hay'.length);expect(Date.now()-t).toBeLessThan(2000);
 });
});
```

`src/lib/broker-research/summary/grounding.test.ts`:
```ts
import {describe,it,expect} from 'vitest';
import {GROUNDING_KEYWORDS,checkGrounding,identifierVariants,splitSentences,type GroundingInput} from './grounding';

const one:GroundingInput={targets:[{target_key:'9999.HK',ticker_as_stated:'9999 HK',security_ticker:'09999.HK'}],fields:[
 {field_id:'tp',target_key:'9999.HK',field:'target_price',value_num:'100',value_unit:'price',currency:'HKD'},
 {field_id:'up',target_key:'9999.HK',field:'upside_stated',value_num:'0.2534',value_unit:'pct',currency:null},
 {field_id:'hz',target_key:'9999.HK',field:'target_horizon',value_num:'12',value_unit:'months',currency:null},
 {field_id:'wacc',target_key:null,field:'wacc',value_num:'0.095',value_unit:'pct',currency:null},
]};
const two:GroundingInput={targets:[...one.targets,{target_key:'NWND',ticker_as_stated:'NWND US',security_ticker:'NWND'}],fields:[...one.fields,
 {field_id:'tp2',target_key:'NWND',field:'target_price',value_num:'120',value_unit:'price',currency:'USD'},
 {field_id:'dn',target_key:'NWND',field:'upside_stated',value_num:'-0.1',value_unit:'pct',currency:null}]};
const g=(s:string,i:GroundingInput=one)=>checkGrounding(s,i);
const reasons=(s:string,i:GroundingInput=one)=>g(s,i).failures.map(f=>f.reason);

describe('checkGrounding (spec §6.4 (b))',()=>{
 it('grounds a templated sentence and records the assertion',()=>{
  expect(g('9999.HK 的目标价 100 港元。')).toEqual({version:'grounding/1',passed:true,failures:[],assertions:[{sentence_idx:0,target_key:'9999.HK',field:'target_price',value:'100',unit:'price',field_id:'tp'}]});
 });
 it('acceptance sample 4: 营收 100 with only a target price 100 → ungrounded (keyword)',()=>{
  expect(g('营收 100 港元。')).toMatchObject({passed:false,failures:[{sentence_idx:0,reason:'no_keyword'}]});
 });
 it('a second number in the sentence fails even if one assertion matches',()=>{
  expect(reasons('目标价 100 港元与营收 100。')).toEqual(['multiple_numbers']);
  expect(reasons('目标价 100 港元，12 个月。')).toEqual(['multiple_numbers']);
 });
 it('identifier digits are not numbers (9988.HK style codes)',()=>{
  expect(g('9999.HK 的目标价 100 港元').passed).toBe(true);
  expect(g('09999.HK 目标价 HK$100').passed).toBe(true);
  expect(g('9999 HK 目标价 100 港元').passed).toBe(true);
  expect(reasons('9999 的目标价 100 港元')).toEqual(['multiple_numbers']);   // a bare code is a number
 });
 it('percent and decimal writings, rounded to one decimal; units must match',()=>{
  expect(g('上涨空间 25.3%').passed).toBe(true);
  expect(g('Upside of 25.34%.').passed).toBe(true);
  expect(g('上涨空间 0.2534').passed).toBe(true);
  expect(reasons('上涨空间 26%')).toEqual(['value_mismatch']);
  expect(reasons('上涨空间 25.3 港元')).toEqual(['unit_mismatch']);
  expect(reasons('目标价 100')).toEqual(['unit_mismatch']);
  expect(reasons('目标价 100%')).toEqual(['unit_mismatch']);
 });
 it('months and report-level pct fields',()=>{
  expect(g('目标期限 12 个月').passed).toBe(true);
  expect(g('Time horizon 12 months.').passed).toBe(true);
  expect(g('WACC 9.5%').passed).toBe(true);
  expect(reasons('目标期限 18 个月')).toEqual(['value_mismatch']);
 });
 it('price currency must match the target currency when the mark is known',()=>{
  expect(reasons('目标价 100 美元')).toEqual(['currency_mismatch']);
  expect(g('target price HK$100.0').passed).toBe(true);
  expect(g('目标价 100 元').passed).toBe(true);
 });
 it('multiple targets: the sentence must name exactly one; report-level fields need none',()=>{
  expect(reasons('目标价 100 港元',two)).toEqual(['target_missing']);
  expect(g('NWND 的目标价 US$120',two).assertions[0]).toMatchObject({target_key:'NWND',field_id:'tp2'});
  expect(g('9999.HK 的目标价 100 港元',two).passed).toBe(true);
  expect(reasons('NWND 与 9999.HK 的目标价 100 港元',two)).toEqual(['target_ambiguous']);
  expect(reasons('NWND 的目标价 100 港元',two)).toEqual(['currency_mismatch']);
  expect(g('WACC 9.5%',two).passed).toBe(true);
 });
 it('downside phrasing needs a negative stated value',()=>{
  expect(g('NWND 下行空间 10%',two).passed).toBe(true);
  expect(reasons('9999.HK 下行空间 25.3%',two)).toEqual(['value_mismatch']);
 });
 it('fields absent from the report and keyword nearest the number',()=>{
  expect(reasons('永续增长率 3%')).toEqual(['field_missing']);
  expect(g('目标价对应的上涨空间 25.3%').assertions[0].field).toBe('upside_stated');
  expect(reasons('目标股价 100 港元')).toEqual([]);
 });
 it('sentences without numbers pass; per-sentence indices',()=>{
  const r=g('公司前景稳健。目标价 100 港元。营收 100 港元。\n- 风险：竞争加剧');
  expect(r.passed).toBe(false);
  expect(r.assertions.map(a=>a.sentence_idx)).toEqual([1]);
  expect(r.failures).toEqual([{sentence_idx:2,reason:'no_keyword'}]);
  expect(g('')).toEqual({version:'grounding/1',passed:true,assertions:[],failures:[]});
 });
});

describe('helpers',()=>{
 it('splits sentences (NFKC: full-width ；→;) without breaking decimals or codes',()=>{
  expect(splitSentences('Target price HK$100.5. Upside 25.3%! 9999.HK 稳健；next\nline')).toEqual(['Target price HK$100.5.','Upside 25.3%!','9999.HK 稳健;','next','line']);
 });
 it('identifier variants contain a letter and cover HK / A spellings',()=>{
  expect(identifierVariants({target_key:'9999.HK',ticker_as_stated:'9999 HK',security_ticker:'09999.HK'})).toEqual(expect.arrayContaining(['9999.HK','09999.HK','9999 HK']));
  expect(identifierVariants({target_key:'600519.SH',ticker_as_stated:'600519',security_ticker:'600519.SH'})).toEqual(['600519.SH','600519 CH','600519.SS']);
  expect(identifierVariants({target_key:'stated:7203 JT',ticker_as_stated:'7203 JT',security_ticker:null})).toEqual(['7203 JT']);
 });
 it('every groundable field has zh and en keywords',()=>{
  for(const list of Object.values(GROUNDING_KEYWORDS)){expect(list.some(k=>/\p{Script=Han}/u.test(k))).toBe(true);expect(list.some(k=>/[a-z]/i.test(k))).toBe(true);}
 });
});
```

- [ ] **Step 2: 运行，确认失败**

```bash
npm test -- src/lib/broker-research/disclosure.test.ts src/lib/broker-research/summary
```
Expected: FAIL（三个模块不存在）

- [ ] **Step 3: 实现**

要点：`checkDisclosure` 返回契约的 `DisclosureCheck`（`inputs_hash` 用 A4 的 `canonicalJson/sha256Hex`，含文本 sha256）；`upside_pct` 按比值（0.25 = 25%）解释。`checkGrounding` 的 `GroundingField.currency` 由调用方（C7）从 targets 的生效币种填入（§5.3：价格证据行本身不带币种）；只传生效值（`effectiveValue`）且 `value_num` 非空的行。`maxVerbatimOverlap` 对两侧 NFKC + 空白折叠后按代码点计长。

`src/lib/broker-research/disclosure.ts`:
```ts
// src/lib/broker-research/disclosure.ts
// Content-level disclosure check (spec §4.11 内容级披露检查, DISCLOSURE_VERSION). Applied to
// title_original / title_public / title_zh / title_en, each snippet and each summary.
// (1) allows_public_target_price=false: any number token in T (thousands separators, currency
//     marks and '%' removed) equal to a target's target_price, or to |upside_pct| in percent or
//     decimal writing, compared exactly and after rounding to one decimal → restricted_value:target.
//     upside_pct is the ratio target/price − 1 (0.25 = 25 %). Rounding is applied to target
//     prices too (stricter than the spec's literal reading: "120.4" leaks 120.42).
// (2) public_display=false analysts: T contains display_name or any name_variant
//     (NFKC, case-insensitive, whitespace-collapsed substring; CJK direct substring) → restricted_name.
// The result stores the inputs hash (canonicalJson over version, text hash and every input).
import type {DisclosureCheck} from './types';
import {canonicalJson,sha256Hex} from './hash';
import {canonicalDecimal} from '../facts/json-numbers';
import {dec,decAbs,decShift,decString,round1} from './decimal';
import {DISCLOSURE_VERSION} from './versions';

export interface DisclosureTarget{target_key:string;target_price:string|null;upside_pct:string|null}
export interface DisclosureAnalyst{analyst_id:string;display_name:string;name_variants:string[];public_display:boolean}
export interface DisclosureInput{allowsPublicTargetPrice:boolean;targets:DisclosureTarget[];analysts:DisclosureAnalyst[]}
export interface NumberToken{raw:string;value:string;percent:boolean}

/** Every number in T (sign dropped): `1,234.5`, `120`, `25%`, `25.0 %`; full-width forms via NFKC. */
export function numberTokens(text:string):NumberToken[]{
 const t=text.normalize('NFKC');
 return [...t.matchAll(/(?<![\d.])(?<!\d,)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\d])(\s?%)?/g)].map(m=>({raw:m[0],value:canonicalDecimal(`${m[1].replace(/,/g,'')}${m[2]??''}`),percent:m[3]!==undefined}));
}
const nameKey=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const byKey=<T>(k:(x:T)=>string)=>(a:T,b:T)=>k(a)<k(b)?-1:k(a)>k(b)?1:0;

export function disclosureInputsHash(text:string,input:DisclosureInput):string{
 return sha256Hex(canonicalJson({version:DISCLOSURE_VERSION,text_sha256:sha256Hex(text),allows_public_target_price:input.allowsPublicTargetPrice,
  targets:[...input.targets].sort(byKey(t=>t.target_key)).map(t=>({target_key:t.target_key,target_price:t.target_price,upside_pct:t.upside_pct})),
  analysts:[...input.analysts].sort(byKey(a=>a.analyst_id)).map(a=>({analyst_id:a.analyst_id,display_name:a.display_name,name_variants:[...a.name_variants],public_display:a.public_display}))}));
}

export function checkDisclosure(text:string,input:DisclosureInput):DisclosureCheck{
 const hits:DisclosureCheck['hits']=[];const seen=new Set<string>();
 const hit=(h:DisclosureCheck['hits'][number])=>{const k=JSON.stringify(h);if(!seen.has(k)){seen.add(k);hits.push(h);}};
 if(!input.allowsPublicTargetPrice){
  const tokens=numberTokens(text);
  for(const t of input.targets){
   const tp=t.target_price===null?null:canonicalDecimal(t.target_price);
   const pct=t.upside_pct===null?null:decString(decShift(decAbs(dec(t.upside_pct)),2));   // |u| × 100
   for(const k of tokens){
    const asDecimalPct=decString(decShift(dec(k.value),2));
    const priceHit=tp!==null&&!k.percent&&(k.value===tp||round1(k.value)===round1(tp));
    const upsideHit=pct!==null&&(k.value===pct||round1(k.value)===round1(pct)||(!k.percent&&round1(asDecimalPct)===round1(pct)));
    if(priceHit||upsideHit)hit({kind:'restricted_value:target',token:k.raw.trim(),target_key:t.target_key});
   }
  }
 }
 const hay=nameKey(text);
 for(const a of input.analysts){
  if(a.public_display)continue;
  for(const name of [a.display_name,...a.name_variants]){
   const n=nameKey(name);
   if(n!==''&&hay.includes(n))hit({kind:'restricted_name',token:name,analyst_id:a.analyst_id});
  }
 }
 return {version:DISCLOSURE_VERSION,inputs_hash:disclosureInputsHash(text,input),passed:hits.length===0,hits};
}
```

`src/lib/broker-research/summary/overlap.ts`:
```ts
// src/lib/broker-research/summary/overlap.ts
// Longest verbatim overlap between a summary and its source text (spec §6.4 check (a), §4.7
// approval condition max_verbatim_overlap ≤ N, OVERLAP_VERSION). Both sides are NFKC-normalized
// and whitespace runs collapse to one space (a PDF line break must not hide copying); the result
// is a length in Unicode code points. Algorithm: suffix automaton over the (short) summary, then
// one pass over the (long) source — O(|summary| + |source|).
export {OVERLAP_VERSION} from '../versions';

const prep=(s:string)=>Array.from(s.normalize('NFKC').replace(/\s+/g,' ')).map(c=>c.codePointAt(0)!);

export function maxVerbatimOverlap(summary:string,source:string):number{
 const a=prep(summary),b=prep(source);
 if(a.length===0||b.length===0)return 0;
 const len=[0],link=[-1],next:Map<number,number>[]=[new Map()];let last=0;
 for(const c of a){
  const cur=len.length;len.push(len[last]+1);link.push(0);next.push(new Map());
  let p=last;
  while(p!==-1&&!next[p].has(c)){next[p].set(c,cur);p=link[p];}
  if(p!==-1){
   const q=next[p].get(c)!;
   if(len[p]+1===len[q])link[cur]=q;
   else{
    const clone=len.length;len.push(len[p]+1);link.push(link[q]);next.push(new Map(next[q]));
    while(p!==-1&&next[p].get(c)===q){next[p].set(c,clone);p=link[p];}
    link[q]=clone;link[cur]=clone;
   }
  }
  last=cur;
 }
 let v=0,l=0,best=0;
 for(const c of b){
  while(v!==-1&&!next[v].has(c))v=link[v];
  if(v===-1){v=0;l=0;continue;}
  l=Math.min(l,len[v])+1;v=next[v].get(c)!;
  if(l>best)best=l;
 }
 return best;
}
```

`src/lib/broker-research/summary/grounding.ts`:
```ts
// src/lib/broker-research/summary/grounding.ts
// Numeric grounding of an independent summary (spec §6.4 check (b), GROUNDING_VERSION).
// Per sentence: (0) identifier spans of known targets (target_key, ticker_as_stated,
// security_ticker and HK/A spelling variants — only forms containing a letter, so a bare
// number is never masked) are tokenized first; digits inside them only identify the target.
// (1) A sentence containing a number must contain EXACTLY ONE number token outside identifiers
// (every other digit would be an ungrounded number). (2) The nearest field keyword before it
// (GROUNDING_KEYWORDS, longest at equal end) picks the field. (3) With several targets the
// sentence must name exactly one target (report-level fields such as wacc excepted); with one
// target the code may be omitted. (4) Unit and value must equal the effective value: pct as
// percent ("25%") or decimal ("0.25"), price with a currency mark (ISO must match when known),
// months with a month unit; values compared after rounding to one decimal. Any failure →
// passed=false (caller rejects the summary as summary_ungrounded).
import type {FieldName,GroundingAssertion,GroundingResult,ValueUnit} from '../types';
import {CURRENCY_MARKS} from '../extract/typed';
import {canonicalDecimal} from '../../facts/json-numbers';
import {dec,decAbs,decShift,decSign,decString,round1} from '../decimal';
import {GROUNDING_VERSION} from '../versions';

export type GroundableField='target_price'|'price_at_report'|'upside_stated'|'target_horizon'|'wacc'|'terminal_growth'|'terminal_value_share';
/** Field keywords (zh + en), grounding/1. Matching: NFKC, case-insensitive; ASCII keywords need word boundaries. */
export const GROUNDING_KEYWORDS:Readonly<Record<GroundableField,readonly string[]>>=Object.freeze({
 target_price:['目标价','目标价格','目标股价','目標價','target price','price target'],
 price_at_report:['报告时价格','报告日价格','报告日收盘价','收盘价','股价','reference price','closing price','share price','price at report'],
 upside_stated:['上涨空间','上行空间','潜在涨幅','涨幅空间','upside','implied upside','potential upside'],
 target_horizon:['目标期限','投资期限','期限','time horizon','target horizon','horizon'],
 wacc:['wacc','加权平均资本成本'],
 terminal_growth:['永续增长率','终值增长率','长期增长率','terminal growth rate','terminal growth','perpetual growth'],
 terminal_value_share:['终值占比','终值贡献占比','terminal value share','share of terminal value'],
});
/** Downside phrasing grounds upside_stated with the sign flipped (value must be negative). */
export const DOWNSIDE_KEYWORDS:readonly string[]=Object.freeze(['下跌空间','下行空间','潜在跌幅','downside','implied downside']);
const UNIT_OF:Readonly<Record<GroundableField,ValueUnit>>={target_price:'price',price_at_report:'price',upside_stated:'pct',target_horizon:'months',wacc:'pct',terminal_growth:'pct',terminal_value_share:'pct'};

export interface GroundingTarget{target_key:string;ticker_as_stated:string;security_ticker:string|null}
/** Effective field value; `currency` = the target's effective currency for price fields (from targets), else null. */
export interface GroundingField{field_id:string;target_key:string|null;field:FieldName;value_num:string;value_unit:ValueUnit;currency:string|null}
export interface GroundingInput{targets:GroundingTarget[];fields:GroundingField[]}

const N=(s:string)=>s.normalize('NFKC');
const lower=(s:string)=>N(s).toLowerCase();
const isWord=(c:string|undefined)=>c!==undefined&&/[a-z0-9]/i.test(c);

/** Sentences split on 。！？；!?; newlines, and '.' followed by whitespace or end (decimals and 9988.HK stay whole). */
export function splitSentences(text:string):string[]{
 const t=N(text);const out:string[]=[];let cur='';
 for(let i=0;i<t.length;i++){
  const c=t[i];
  if(c==='\n'||'。！？；!?;'.includes(c)||(c==='.'&&(i+1===t.length||/\s/.test(t[i+1])))){if(c!=='\n')cur+=c;if(cur.trim())out.push(cur.trim());cur='';}
  else cur+=c;
 }
 if(cur.trim())out.push(cur.trim());
 return out;
}
/** Spellings of a target identifier that contain a letter (bare digits are never identifiers). */
export function identifierVariants(t:GroundingTarget):string[]{
 const v=new Set<string>();
 for(const s of [t.target_key.startsWith('stated:')?null:t.target_key,t.ticker_as_stated,t.security_ticker]){
  if(!s)continue;const u=N(s).trim().toUpperCase();v.add(u);
  const hk=/^0*(\d{1,5})\.HK$/.exec(u);
  if(hk){const d=hk[1];for(const x of [d,d.padStart(4,'0'),d.padStart(5,'0')]){v.add(`${x}.HK`);v.add(`${x} HK`);}}
  const a=/^(\d{6})\.(SH|SZ|BJ)$/.exec(u);
  if(a){v.add(`${a[1]} CH`);if(a[2]==='SH')v.add(`${a[1]}.SS`);}
 }
 return [...v].filter(x=>/[A-Z]/.test(x)).sort((x,y)=>y.length-x.length);
}
interface Span{start:number;end:number}
function findAll(hay:string,needle:string,wordBounded:boolean):Span[]{
 const out:Span[]=[];
 for(let i=hay.indexOf(needle);i!==-1;i=hay.indexOf(needle,i+1)){
  const end=i+needle.length;
  if(wordBounded&&(isWord(hay[i-1])&&isWord(needle[0])||isWord(hay[end])&&isWord(needle[needle.length-1])))continue;
  out.push({start:i,end});
 }
 return out;
}
const MARKS=[...Object.keys(CURRENCY_MARKS),'元'].sort((a,b)=>b.length-a.length);
const MONTH_UNITS=['个月','個月','-months','-month','months','month','mos'];
type Unit={unit:ValueUnit|null;iso:string|null};
function unitAround(s:string,start:number,end:number):Unit{
 const after=s.slice(end).replace(/^\s+/,'');const afterU=after.toUpperCase();
 if(after.startsWith('%'))return {unit:'pct',iso:null};
 for(const m of MONTH_UNITS)if(after.toLowerCase().startsWith(m)&&!isWord(after[m.length]))return {unit:'months',iso:null};
 for(const m of MARKS)if(afterU.startsWith(m))return {unit:'price',iso:CURRENCY_MARKS[m]??null};
 const before=s.slice(0,start).replace(/\s+$/,'').toUpperCase();
 for(const m of MARKS)if(before.endsWith(m))return {unit:'price',iso:CURRENCY_MARKS[m]??null};
 return {unit:null,iso:null};
}

export function checkGrounding(summary:string,input:GroundingInput):GroundingResult{
 const assertions:GroundingAssertion[]=[];const failures:{sentence_idx:number;reason:string}[]=[];
 const multi=input.targets.length>1;
 const kw=(Object.entries(GROUNDING_KEYWORDS) as [GroundableField,readonly string[]][]).flatMap(([field,list])=>list.map(k=>({k:lower(k),field,down:false})))
  .concat(DOWNSIDE_KEYWORDS.map(k=>({k:lower(k),field:'upside_stated' as GroundableField,down:true})));
 splitSentences(summary).forEach((sentence,idx)=>{
  const fail=(reason:string)=>failures.push({sentence_idx:idx,reason});
  // (0) identifier spans
  const upper=sentence.toUpperCase();let masked=sentence;const named=new Set<string>();
  for(const t of input.targets)for(const v of identifierVariants(t))for(const sp of findAll(upper,v,true)){
   if(/^\s*$/.test(masked.slice(sp.start,sp.end)))continue;
   named.add(t.target_key);masked=masked.slice(0,sp.start)+' '.repeat(sp.end-sp.start)+masked.slice(sp.end);
  }
  // (1) number tokens outside identifiers
  const nums=[...masked.matchAll(/(?<![\d.])(?<!\d,)([-+−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\d])/g)];
  if(nums.length===0)return;
  if(nums.length>1)return fail('multiple_numbers');
  const m=nums[0],start=m.index!,end=start+m[0].length;
  const value=canonicalDecimal(`${m[1]==='-'||m[1]==='−'?'-':''}${m[2].replace(/,/g,'')}${m[3]??''}`);
  // (2) nearest keyword before the number
  const low=masked.toLowerCase();let best:{end:number;len:number;field:GroundableField;down:boolean}|null=null;
  for(const {k,field,down} of kw)for(const sp of findAll(low,k,/[a-z]/.test(k)))if(sp.end<=start&&(!best||sp.end>best.end||(sp.end===best.end&&k.length>best.len)))best={end:sp.end,len:k.length,field,down};
  if(!best)return fail('no_keyword');
  const field=best.field;
  // (3) target identity
  const pool=input.fields.filter(f=>f.field===field&&f.value_unit===UNIT_OF[field]);
  if(pool.length===0)return fail('field_missing');
  const reportLevel=pool.filter(f=>f.target_key===null);
  if(named.size>1)return fail('target_ambiguous');
  const tk=named.size===1?[...named][0]:multi?null:input.targets[0]?.target_key??null;
  const candidates=named.size===0&&reportLevel.length?reportLevel:pool.filter(f=>f.target_key===tk||f.target_key===null);
  if(named.size===0&&multi&&reportLevel.length===0)return fail('target_missing');
  if(candidates.length===0)return fail('field_missing');
  // (4) unit and value
  const u=unitAround(masked,start,end);const want=UNIT_OF[field];
  if(!(u.unit===want||(want==='pct'&&u.unit===null)))return fail('unit_mismatch');
  const down=best.down;
  const match=candidates.find(f=>{
   if(want==='pct'){
    const pct=decShift(dec(f.value_num),2);
    const written=u.unit==='pct'?dec(value):decShift(dec(value),2);
    if(down)return decSign(pct)<0&&round1(decString(decAbs(written)))===round1(decString(decAbs(pct)));
    return round1(decString(written))===round1(decString(pct));
   }
   if(want==='price'&&u.iso!==null&&f.currency!==null&&u.iso!==f.currency)return false;
   return round1(value)===round1(f.value_num);
  });
  if(!match){
   const cur=want==='price'&&u.iso!==null&&candidates.every(f=>f.currency!==null&&f.currency!==u.iso);
   return fail(cur?'currency_mismatch':'value_mismatch');
  }
  assertions.push({sentence_idx:idx,target_key:match.target_key??tk??'',field,value,unit:want,field_id:match.field_id});
 });
 return {version:GROUNDING_VERSION,passed:failures.length===0,assertions,failures};
}
```

- [ ] **Step 4: 运行，确认通过**

```bash
npm test -- src/lib/broker-research/disclosure.test.ts src/lib/broker-research/summary
```
Expected: 3 files passed

- [ ] **Step 5: Part B 全量回归 + 类型与 lint**

```bash
npm test -- src/lib/broker-research/
```
Expected: Part B 的 11 个测试文件全绿（另含 A4 及之后任务的测试）

```bash
npm run typecheck && npm run lint
```
Expected: 退出码 0

- [ ] **Step 6: 提交**

```bash
git add -A src/lib/broker-research
```
```bash
git commit -m "feat(broker-research): disclosure check, verbatim overlap and numeric grounding (B5)" -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Run `git commit` as its own command; replace `<model>` with the implementing agent's model name.)

### Part B 契约修订建议

1. **`types.ts` 的落地时点**：B1（序 2）早于 A4（序 5），而 B1 的 `typed.ts` 需要 `FieldName/TypedValue`。本部分的处理是 B1 用本地别名、B2 第 1 步改为 import（typecheck 证明二者一致）。更干净的做法：把 `types.ts` 的落地提前到 A1（或 B1 之前的独立任务），同时 `BrokerDeps` 里对 `./storage`、`./ports/f3`、`./ports/llm` 的 `import()` 类型在 C1/C4 之前会让 typecheck 失败——建议 A4 把 `BrokerDeps` 挪到 C4 新建的 `deps.ts`，或 A4 先建这三个文件的接口桩。
2. **`decimal.ts` 新文件**加入文件结构（B1 创建；B4/B5 共用；`dq/rules.ts` 的 `identityRule` 走 `Number`，不满足契约"数值不经 Number"，故不复用）。
3. **`PageText` / `sliceText`** 定义在 `extract/locate.ts`；C4 的 F3 产物适配器与 E1 核验 cron 必须把产物映射为 `PageText`，并保证页文本是 F3 产物里的原样字符串（偏移即 JS 字符串下标）。
4. **HK `target_key` 形式**：按规格示例为 `9988.HK`（去前导零后补足 4 位，`700 HK` → `0700.HK`），宇宙候选与 `security_ticker` 为 5 位 `09988.HK`。A2 物化与 A3 视图若按 `target_key` 关联宇宙代码会错——它们应只用 `security_ticker`。请 A 部分确认。
5. **`upside_pct` 的单位**：本部分按比值（`target/price − 1`，0.25 = 25%）解释（披露检查 ×100 比较）。列名带 `pct` 易误解；A2 的物化必须写比值，并在 A4 契约注释写明。
6. **评级映射比较键**：R5 用 `lower(trim(label))`；A2 物化选映射行时必须用同一键 `lower(btrim(raw_label)) = lower(btrim(rating_raw))`，否则 TS 规则与 SQL 选中结果分歧（R5 通过但 `scale_id` 为空）。
7. **`canonicalJson` 对字符串数组的输出须与 `JSON.stringify` 相同**（`behavior.ts` 直接用后者以避免依赖 A4）；建议 A4 的 hash 单测加一条断言：`canonicalJson(['a','é']) === JSON.stringify(['a','é'])`。
8. **`RuleResult.rule`** 用规格名（`span_verbatim` … `horizon_present_with_target`），`naturalKey` 中的 `<rule>` 段同名；`RULE_IDS` 提供 R 编号映射。阻断集 `BLOCKING_REASONS` 必须与 A2 `publish_blockers` 第 10 条的 SQL 集合相等（建议 A2 集成测试 import 断言）。
9. **`GroundingField.currency`**：落地检查需要价格的币种，而价格证据行不带币种（§5.3）；C7 组装输入时从 targets 取。
10. **`CandidateFieldInput.detail`** 在未定位时含 `quote`（LLM 原引文，私有表）；`resolution` 只挂在 `ticker` 行——请 A2 的 `broker_extract_commit` 按 `target_key` 从 ticker 行取 `resolution` 写 targets。

### Part B 未决风险

- **落地检查很严**：一句只允许一个数字；日期、季度（`Q3`）、年份（`FY26`）、裸代码都算数字 → 摘要被拒。提示词（C7 `independent-summary.v1.md`）必须明确禁止这些写法并给出逐句模板；否则摘要拒绝率高。
- **披露检查有误报**：任何等于目标价 / 空间（1 位小数）的数字都命中（如「25 位分析师」）。按规格是保守失败，需要管理员改写文本。
- **`parseBrokerTicker/1` 覆盖面**：只覆盖 A / HK / US 与常见 Bloomberg / Reuters / Yahoo 写法；其他市场（`7203 JT`、`BABA LN`）落为 `stated:` → `unresolved_ticker` 隔离，经覆盖表处理。裸 1–5 位数字无提示时默认 HK。
- **R3 币种表**是规格的固定映射（HK → HKD）；港股人民币柜台、美元计价目标价会被隔离为 `currency_mismatch`，需要人工处理。
- **日期解析拒绝 `05/11/2026`** 这类 D/M/Y 与 M/D/Y 有歧义的写法 → `value_date=null`，`published_date` 必填时阻断 `required_field_missing`，需复核人工修正。
- **合并的规范化键**用 `toTyped`：同值不同写法（`120` 与 `US$120.00`）合为一条；但 `Overweight` 与 `OW` 不同值会进冲突组（正确但会增加复核量）。
- 隔离镜像验证时 A4 的 `hash.ts`/`effective.ts` 是按契约写的桩；若 A4 实际签名不同（如 `canonicalJson` 名称或 `effectiveValue` 入参），B4/B5 需相应调整 import。
