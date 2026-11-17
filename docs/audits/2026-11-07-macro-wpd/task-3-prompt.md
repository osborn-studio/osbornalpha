You are Codex gpt-6-sol implementing ONE task of docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md in this worktree (branch claude/macro-wpd-cn, base = origin/main 68701c48 + the plan). READ FIRST: the "修订 A" section at the top of the plan (it overrides the task text where they conflict), the "仓库约定" section, and docs/audits/2026-11-07-macro-wpd/RECONCILE-2026-11-16.md. Rules: strict TDD (write the failing test, run it, implement, run again); this sandbox has no network and tests must never touch the network; do not edit any file listed in docs/audits/2026-11-07-macro-wpd/v2-closure.txt (formula-hash closure of macro_regime@v2 — includes types.ts, catalog.ts, regime.ts, decimal.ts); do not edit src/components, messages/*, or any page; do not commit (the commander commits); keep the compact code style of src/lib/macro; no banned words (概率, 置信度, probability, confidence). Fixtures: only the files in src/lib/macro/fixtures/cn-http/ (excerpts, see manifest.json) — the full raw responses are NOT in the repo and must not be fetched. Finish with: files changed, exact commands run with pass/fail counts, deviations from the task and why.

TASK: plan Task 3 (PBOC stock-table parser src/lib/macro/parsers/pboc-afre.ts + pboc-afre.test.ts). The plan text's code is an earlier draft; the REAL layout rules are plan amendment A3 — implement those, not the draft. Algorithm:
1. Decode by the file's own <meta charset=…> (first 2048 bytes as latin1; utf-8 → 'utf-8'; gb2312/gbk/gb18030 → 'gb18030'; missing/other/undecodable → PbocAfreParseError 'afre_bad_encoding'). Export afreDecoderLabel(bytes).
2. Use htmlTables() from ./html-table (cell-order reader). Select the single table whose first row's first cell, whitespace-stripped, equals 社会融资规模存量统计表; 0 or >1 → 'afre_title_missing'.
3. Header row = first row with a cell matching /^\d{4}\.(\d{1,2}|Q[1-4])$/ after stripping whitespace; header cells are cells 1..k that are non-empty; any empty cell BEFORE the last non-empty one → 'afre_bad_month'; any non-empty header cell not matching the pattern → 'afre_bad_month'; month in 1..12, year 2000..2100; Qn → month 3n (quarter-end month); duplicates → 'afre_bad_month'.
4. Sub-header row = the row right after the header row. Collect consecutive pairs (j, j+1) with cells (存量, 增速(%)) after whitespace stripping and full-width parentheses → ASCII; the first k pairs (in order) belong to the k header cells; fewer pairs than header cells, or a pair that is not (存量, 增速(%)) → 'afre_header_mismatch'. Do NOT assume the pair for header cell i sits at 2i-1/2i; use the pairs found.
5. Stock row = the single row whose first cell, normalized (strip whitespace, （）→()), matches /^社会融资规模存量(AFRE\(stock\))?$/ ; none → 'afre_row_missing'; more than one → 'afre_row_ambiguous'. Its index is NOT fixed (7 or 8 across years; a blank row may sit between sub-header and data). In the 2019 file the next row holds a lone 'AFRE(stock)' cell — ignore it.
6. For each header cell read the growth cell at its pair's growth index; '' or '-' → no point; else must match /^-?\d+(\.\d+)?$/ else 'afre_bad_value'; value text = canonical() from ../decimal; periodEnd via monthEnd(year, month) from ../periods; locator {kind:'html_cell', table:t.index, row:<stock row index in t.rows>, cell:<growth cell index>}. Points in header order.
Fixtures (src/lib/macro/fixtures/cn-http/, verify excerpt_sha256 from manifest.json in the test): CN_AFRE_STOCK-2015.htm (gb2312, quarterly: 2015-03=13.1, 2015-06=12, 2015-09=12.5, 2015-12=12.5), -2019.htm (utf-8: 2019-01=10.9 02=10.6 03=11.2 04=10.8 05=11 06=11.2 07=10.8 08=10.7 09=10.7 10=10.6 11=10.7 12=10.7), -2024.htm (2024-01=9.5 02=9 03=8.7 04=8.3 05=8.4 06=8.1 07=8.2 08=8.1 09=8 10=7.8 11=7.8 12=8), -2025.htm (12 points; 2025-07=9 and 2025-08=8.8 asserted via the cross-check below), -2026.htm (9 points 2026-01=8.2 02=8.2 03=7.9 04=7.8 05=7.7 06=7.4 07=7.4 08=7.2 09=7.1; months 10–12 empty → no point). Assert exact (periodEnd,valueText) lists for 2015, 2019, 2024, 2026, plus per file one point's locator re-read from the decoded bytes via htmlTables (text-exact with canonical(), never Number()).
Cross-check with main's article parser (do not duplicate its grammar): import parsePbcAfreStockArticle and use its fixtures ./fixtures/pbc-afre-stock-2025-07.html, -2025-08.html, -2026-09.html (see ./pbc-afre-stock.test.ts for receipts/urls: july https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/2025092212554883949/index.html, august https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html, september https://www.pbc.gov.cn/diaochatongjisi/116219/116225/2026101417073743604/index.html); assert the table value for 2025-07, 2025-08 and 2026-09 equals the article candidate's valueText for the same periodEnd.
Synthetic fail-closed cases (small tables you build as UTF-8 documents declaring utf-8): title missing / ambiguous, interior blank month header, bad month header, unsupported charset, undecodable bytes under the declared charset, no charset declaration, header mismatch (增速（%） replaced by 同比), bad value (8,2), duplicate stock row, missing stock row; one gb2312 round trip using the real 2024 excerpt bytes.
OPT-IN replay: describe.skipIf(!process.env.WPD_RAW_EVIDENCE_DIR): parse every CN_AFRE_STOCK-*.htm in that directory (full original files outside the repo); if WPD_AFRE_TRUTH names a JSON file {"<year>":{"points":[["YYYY-MM","value"],…]}} compare exact (periodEnd,value) lists (blank values excluded) else only assert ≥ 1 point per file. Skipped by default; report that it is skipped.
The parser is NOT registered in parsers/index.ts. Gates: npm test -- src/lib/macro/parsers ; npm run typecheck ; npm run lint.

PLAN TEXT OF THE TASK (adapt per the overrides above; the overrides win):
### Task 3: 社融存量同比解析器 `parsers/pboc-afre.ts`

**Files:**
- Create: `src/lib/macro/parsers/pboc-afre.ts`
- Test: `src/lib/macro/parsers/pboc-afre.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/macro/parsers/pboc-afre.test.ts
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {canonical} from '../decimal';
import {htmlTables} from './html-table';
import {PBOC_AFRE_PARSER_VERSION,PbocAfreParseError,afreDecoderLabel,parseAfreStockYoy} from './pboc-afre';

const FIX=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const manifest=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8')) as {files:{file:string;sha256:string}[]};
const bytesOf=(file:string)=>{const b=new Uint8Array(readFileSync(join(FIX,file)));expect(createHash('sha256').update(b).digest('hex')).toBe(manifest.files.find(f=>f.file===file)!.sha256);return b;};
const S={seriesId:'CN_AFRE_STOCK_YOY'};
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};
/** gb2312 bytes of a minimal Excel-export table shaped like the official one. */
const gb=(s:string)=>new Uint8Array(require('node:child_process').execFileSync('iconv',['-f','utf-8','-t','gb2312'],{input:s}));
const table=(months:string[],stockRow:string,extraRows='')=>gb(`<html><head><meta http-equiv=Content-Type content="text/html; charset=gb2312"></head><body><table>
<tr><td colspan=4>社会融资规模存量统计表</td></tr><tr><td colspan=4>Aggregate Financing to the Real Economy (Stock)</td></tr><tr><td colspan=2>单位：万亿元人民币</td></tr><tr><td colspan=2>Unit: Trillion Yuan</td></tr>
<tr><td></td>${months.map(m=>`<td colspan=2>${m}</td>`).join('')}<td></td></tr>
<tr><td>项目 Items</td>${months.map(()=>'<td>存量</td><td>增速（%）</td>').join('')}<td></td></tr>
<tr><td></td>${months.map(()=>'<td>Stock</td><td>Growth Rate(%)</td>').join('')}<td></td></tr>
<tr>${stockRow}</tr>${extraRows}</table></body></html>`);

describe('parseAfreStockYoy (real fixture bytes)',()=>{
 it('2025: twelve months of the official growth rate, month ends, html_cell locators into the one table',()=>{
  const pts=parseAfreStockYoy(bytesOf('CN_AFRE_STOCK-2025.htm'),S);
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2025-01-31','8'],['2025-02-28','8.2'],['2025-03-31','8.4'],['2025-04-30','8.7'],['2025-05-31','8.7'],['2025-06-30','8.9'],['2025-07-31','9'],['2025-08-31','8.8'],['2025-09-30','8.7'],['2025-10-31','8.5'],['2025-11-30','8.5'],['2025-12-31','8.3']]);
  expect(pts[11].locator).toEqual({kind:'html_cell',table:0,row:7,cell:24});
 });
 it('2026: nine months (January–September), later months empty → no point',()=>{
  const pts=parseAfreStockYoy(bytesOf('CN_AFRE_STOCK-2026.htm'),S);
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2026-01-31','8.2'],['2026-02-28','8.2'],['2026-03-31','7.9'],['2026-04-30','7.8'],['2026-05-31','7.7'],['2026-06-30','7.4'],['2026-07-31','7.4'],['2026-08-31','7.2'],['2026-09-30','7.1']]);
 });
 it('every yearly fixture 2015..2026 parses 12 points (the current year fewer), by its declared charset, and each locator re-reads the same cell text',()=>{
  for(const f of manifest.files.filter(f=>f.file.startsWith('CN_AFRE_STOCK-'))){
   const b=bytesOf(f.file);const pts=parseAfreStockYoy(b,S);
   const year=Number(f.file.slice(14,18));
   expect(pts.length,f.file).toBe(year<2026?12:9);
   expect(afreDecoderLabel(b),f.file).toBe(year<=2019?'utf-8':'gb18030');   // PBOC regenerated 2015–2019 as UTF-8 in 2025-11 (D0c)
   const tables=htmlTables(new TextDecoder(afreDecoderLabel(b)!).decode(b));
   for(const p of pts){const l=p.locator;if(l.kind!=='html_cell')throw new Error('locator');expect(canonical(tables[l.table].rows[l.row][l.cell].trim())).toBe(p.valueText);}   // text-exact, never Number()
  }
 });
});
describe('parseAfreStockYoy (synthetic)',()=>{
 it('reads the growth cell after each month\'s stock cell; "" and "-" mean no value',()=>{
  const pts=parseAfreStockYoy(table(['2026.1','2026.2','2026.3'],'<td>社会融资规模存量 AFRE(stock)</td><td>449.11</td><td>8.2</td><td>451.40</td><td>-</td><td></td><td></td><td></td>'),S);
  expect(pts).toEqual([{seriesId:'CN_AFRE_STOCK_YOY',periodEnd:'2026-01-31',valueText:'8.2',locator:{kind:'html_cell',table:0,row:7,cell:2}}]);
 });
 it('fails closed: no stock row, header mismatch, bad month, bad value, bad encoding, two stock rows',()=>{
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.1'],'<td>人民币贷款 RMB loans</td><td>1</td><td>2</td><td></td>'),S))).toBe('afre_row_missing');
  expect(codeOf(()=>parseAfreStockYoy(gb(new TextDecoder('gb18030').decode(table(['2026.1'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td>')).replace('增速（%）','同比')),S))).toBe('afre_header_mismatch');   // mutate the Unicode HTML, then re-encode
  expect(codeOf(()=>parseAfreStockYoy(gb('<table><tr><td>其他表</td></tr><tr><td></td><td colspan=2>2026.1</td><td></td></tr><tr><td>项目 Items</td><td>存量</td><td>增速（%）</td><td></td></tr><tr><td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td></tr></table>'),S))).toBe('afre_title_missing');
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.13'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td>'),S))).toBe('afre_bad_month');
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.1'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>8,2</td><td></td>'),S))).toBe('afre_bad_value');
  expect(codeOf(()=>parseAfreStockYoy(new Uint8Array([0xff,0xfe,0x81]),S))).toBe('afre_bad_encoding');           // no charset declaration
  expect(codeOf(()=>parseAfreStockYoy(new TextEncoder().encode('<meta charset=iso-8859-1><table></table>'),S))).toBe('afre_bad_encoding');   // unsupported charset
  expect(codeOf(()=>parseAfreStockYoy(new Uint8Array([...new TextEncoder().encode('<meta charset=utf-8>'),0xff,0xfe]),S))).toBe('afre_bad_encoding');   // undecodable under the declared charset
  // the same table declared as UTF-8 parses identically (2015–2019 files)
  const utf8=new TextEncoder().encode('<html><head><meta http-equiv=Content-Type content="text/html; charset=utf-8"></head><body><table><tr><td colspan=4>社会融资规模存量统计表</td></tr><tr><td></td><td colspan=2>2019.1</td><td></td></tr><tr><td>项目 Items</td><td>存量</td><td>增速（%）</td><td></td></tr><tr><td>社会融资规模存量 AFRE(stock)</td><td>200.75</td><td>10.4</td><td></td></tr></table></body></html>');
  expect(parseAfreStockYoy(utf8,S).map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-01-31','10.4']]);
  // an interior blank month header shifts nothing: positions are kept, the blank is refused (a value must never be assigned to the wrong period)
  expect(codeOf(()=>parseAfreStockYoy(gb('<table><tr><td colspan=4>社会融资规模存量统计表</td></tr><tr><td></td><td colspan=2>2026.1</td><td colspan=2></td><td colspan=2>2026.3</td><td></td></tr><tr><td>项目 Items</td><td>存量</td><td>增速（%）</td><td>存量</td><td>增速（%）</td><td>存量</td><td>增速（%）</td><td></td></tr><tr><td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>8.2</td><td>2</td><td>8.1</td><td>3</td><td>7.9</td><td></td></tr></table>'),S))).toBe('afre_bad_month');
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.1'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td>','<tr><td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>3</td><td></td></tr>'),S))).toBe('afre_row_ambiguous');
  expect(new PbocAfreParseError('x').name).toBe('PbocAfreParseError');expect(PBOC_AFRE_PARSER_VERSION).toBe('pboc-afre-stock/1');
 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/lib/macro/parsers/pboc-afre.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// src/lib/macro/parsers/pboc-afre.ts
// PBOC 调查统计司 "社会融资规模存量统计表" (one Excel-exported HTML file per year, charset gb2312) → ParsedPoint
// (plan WP-D Task 3; spec P5 §5.4). Verified structure (2026-11-07): a single <table>; row 4 = month headers
// "YYYY.M" (one cell per month, colspan 2); row 5 = "存量" / "增速（%）" alternating; row 7 = "社会融资规模存量 AFRE(stock)" with
// stock, growth, stock, growth … per month. Only the official growth column ("增速（%）" = 社会融资规模存量同比增长, %) is read;
// the stock level and the flow table are never used. The file is regenerated every month under a new name: an earlier month's
// value may change → the series is revisable (versions, never overwrite). "" / "-" = not yet published → no point.
// Locator: html_cell {table, row, cell} into the recorded bytes (html-table.ts numbering). Decoding: by the file's own
// <meta charset=…> (first 2 KB scanned as latin1): utf-8 → 'utf-8'; gb2312 / gbk / gb18030 → 'gb18030'; missing or other →
// afre_bad_encoding; undecodable bytes under the declared charset → afre_bad_encoding (never guessed: PBOC regenerated the
// 2015–2019 files as UTF-8 in 2025-11 while 2025/2026 are gb2312, verified 2026-11-07).
import {canonical} from '../decimal';
import {monthEnd} from '../periods';
import type {ParsedPoint} from '../types';
import {htmlTables} from './html-table';

export const PBOC_AFRE_PARSER_VERSION='pboc-afre-stock/1';
const MONTH=/^(\d{4})\.(\d{1,2})$/;
const PLAIN_DECIMAL=/^-?[0-9]+(\.[0-9]+)?$/;
const STOCK_ROW=/^社会融资规模存量\s*AFRE\s*\(stock\)$/;
const TITLE='社会融资规模存量统计表';
const GROWTH='增速（%）';
const norm=(s:string)=>s.replace(/[\s\u3000]+/g,'');
export class PbocAfreParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='PbocAfreParseError';this.code=code;}
}

const CHARSET_LABEL:Record<string,string>={'utf-8':'utf-8',utf8:'utf-8',gb2312:'gb18030',gbk:'gb18030',gb18030:'gb18030'};
/** The charset the file declares in its first 2 KB (latin1 scan), mapped to a TextDecoder label; null when missing or unsupported. */
export function afreDecoderLabel(bytes:Uint8Array):string|null{
 const head=new TextDecoder('latin1').decode(bytes.slice(0,2048));
 const m=/charset=["']?([\w-]+)/i.exec(head);
 return m?CHARSET_LABEL[m[1].toLowerCase()]??null:null;
}

export function parseAfreStockYoy(bytes:Uint8Array,opts:{seriesId:string}):ParsedPoint[]{
 const label=afreDecoderLabel(bytes);
 if(!label)throw new PbocAfreParseError('afre_bad_encoding','charset');
 let html:string;
 try{html=new TextDecoder(label,{fatal:true}).decode(bytes);}catch{throw new PbocAfreParseError('afre_bad_encoding',label);}
 // the one table whose first cell is the official title; anything else (0 or >1) is refused
 const tables=htmlTables(html).filter(t=>t.rows.length>0&&norm(t.rows[0][0]??'')===TITLE);
 if(tables.length!==1)throw new PbocAfreParseError('afre_title_missing',String(tables.length));
 const t=tables[0];
 const hi=t.rows.findIndex(r=>r.some(c=>MONTH.test(norm(c))));
 if(hi<0)throw new PbocAfreParseError('afre_bad_month','no month header');
 // positional: header cell i (i ≥ 1) ↔ data cells 2i−1 (stock) and 2i (growth); only trailing cells may be blank
 const hdr=t.rows[hi].map(norm);
 let last=hdr.length-1;while(last>=1&&hdr[last]==='')last--;
 const months:[number,string][]=[];
 for(let i=1;i<=last;i++){if(!MONTH.test(hdr[i]))throw new PbocAfreParseError('afre_bad_month',`header cell ${i}: ${hdr[i]}`);months.push([i,hdr[i]]);}
 if(months.length===0)throw new PbocAfreParseError('afre_bad_month','no months');
 const sub=(t.rows[hi+1]??[]).map(norm);
 const rows=t.rows.map((r,i)=>[r,i] as const).filter(([r])=>r.length>0&&STOCK_ROW.test(r[0]));
 if(rows.length===0)throw new PbocAfreParseError('afre_row_missing');
 if(rows.length>1)throw new PbocAfreParseError('afre_row_ambiguous');
 const [row,ri]=rows[0];
 const out:ParsedPoint[]=[];
 months.forEach(([i,m])=>{
  const cell=2*i;
  if(sub[cell]!==norm(GROWTH)||sub[cell-1]!=='存量')throw new PbocAfreParseError('afre_header_mismatch',`cell ${cell}: ${sub[cell-1]??''}/${sub[cell]??''}`);
  const [,y,mo]=MONTH.exec(m)!;
  const month=Number(mo);
  if(month<1||month>12||Number(y)<2000||Number(y)>2100)throw new PbocAfreParseError('afre_bad_month',m);
  const raw=norm(row[cell]??'');
  if(raw===''||raw==='-')return;
  if(!PLAIN_DECIMAL.test(raw))throw new PbocAfreParseError('afre_bad_value',`row ${ri} cell ${cell}`);
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new PbocAfreParseError('afre_bad_value',`row ${ri} cell ${cell}`);}
  out.push({seriesId:opts.seriesId,periodEnd:monthEnd(Number(y),month),valueText,locator:{kind:'html_cell',table:t.index,row:ri,cell}});
 });
 return out;
}
```

- [ ] **Step 4: 测试通过**

Run: `npm test -- src/lib/macro/parsers/pboc-afre.test.ts`
Expected: PASS（6 用例；2025 的第 12 点定位 `{table:0,row:7,cell:24}`，2026 共 9 点；内部空月头被拒）。负值同比是合法值（本解析器只读存量行；范围由 `quality.ts` 的 `liquidity_yoy` 档 −50…100 管）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro/parsers/pboc-afre.ts src/lib/macro/parsers/pboc-afre.test.ts
git commit -F - <<'EOF'
feat(macro): PBOC AFRE stock-table parser (official growth column only, gb2312, html_cell)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

