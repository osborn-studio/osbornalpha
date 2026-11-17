You are Codex gpt-6-sol implementing Task 6 and Task 7 of the WP-D plan in this worktree (branch claude/macro-wpd-fed, PR-2 "Fed liquidity"). Follow each task's steps literally (TDD). Task 6: you cannot reach the network — implement the `--codes`/`--ids` option of scripts/macro/record-fred-fixtures.ts (merge with the existing manifest, dedupe by code, keep the sort) and write the new fred-csv.test.ts describe block; the three fixture CSVs will be recorded by the commander afterwards, so that describe block may fail for now (do not fake fixtures). Task 7: full TDD, all tests green (`npm test -- src/lib/macro/providers src/app/api/cron/macro-sync`), typecheck + lint green. Do NOT touch any file listed in docs/audits/2026-11-07-macro-wpd/v2-closure.txt (the formula-hash closure of macro_regime@v2). Commit each task separately with the exact commit messages given in the plan (use `git commit -F - <<'EOF' … EOF`, never a `-n` token on the git commit line). Report: files changed, test results, deviations.

## 仓库约定（动手前必读；每个 Codex 任务提示都附本节）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/prod-bringup-3d24d3`。分支：PR-1 `claude/macro-wpd-cn`（从 `origin/main` `0764bfae`）；PR-2 `claude/macro-wpd-fed`（从 `origin/main`）；PR-3 `claude/macro-wpd-catalog-v3`（从 **#129 `claude/integ-regime-drift` 合并后的 main**；#129 注册 `macro_regime@v2`，本计划的升级是 v3）。不要 `cd` 出去；不用裸 `git stash`（栈与其他工作树共享）。只改本任务 **Files** 列出的文件。
- **文件归属**：本计划拥有 `src/lib/macro/catalog.ts`、`src/lib/macro/{types,snapshots,freshness,cn-series,derive,events,series-extras,cycles,quality,ingest}.ts`、`src/lib/macro/providers/**`、`src/lib/macro/parsers/**`、`src/lib/macro/fixtures/**`、`scripts/macro/**`、`src/app/api/macro/ingest/**`、`src/app/api/cron/macro-sync/**`、`supabase/migrations/20261121*`、`src/lib/judgments/methodologies/macro-regime.v3.ts`、`src/lib/judgments/macro-inputs.ts`、`src/lib/judgments/registry.ts`、`src/lib/judgments/compensate.ts`（版本常量）、`src/lib/macro/strategy/{playbooks,deviations}.ts`（版本常量）、`docs/methodologies/macro_regime/v3.md`、`docs/runbooks/macro-sync.md`。**不改** `src/components/macro/**`、`src/app/**/macro/**` 页面、策略 UI、时钟 UI、`messages/*`（macro-p5 会话负责；需要它们改的点在 §交接 列出）。
- **F4 哈希红线（机器可检）**：`docs/audits/2026-11-07-macro-wpd/v2-closure.txt` = `macro_regime@v2`（#129）的 import 闭包（含类型导入与 `src/lib/research/ingest/pa-v1/json.js`）+ `deps`（`judgments/resolvers/macro.ts`、`macro/{read-api,snapshots,freshness,db}.ts`、`dq/freshness.ts`）+ 方法文档 `docs/methodologies/macro_regime/v2.md`。PR-1 / PR-2 的每个提交门禁：`git diff --name-only origin/main...HEAD | grep -xF -f docs/audits/2026-11-07-macro-wpd/v2-closure.txt` 输出必须为空（Task 5 / Task 8 的门禁步骤）。PR-3 合并前再用 `npx tsx -e "import('./src/lib/judgments/formula-hash').then(m=>console.log(m.importClosure(process.cwd(),'src/lib/judgments/methodologies/macro-regime.v2.ts').join('\n')))"` 重算一次核对清单仍准确（#129 若在此期间变动，更新清单）。
- **审计处置**：`docs/audits/2026-11-07-macro-wpd/03-plan-audit-disposition.md`（第 1 轮 Codex 13 项 / mmx 71 项的接受 / 拒绝与理由）；被拒绝的项不再在任务审计中重提，除非有新证据。
- **迁移**：只用 `20261121HHMMSS_*`；本计划只建 `20261121090000_macro_wpd_catalog.sql`（Task 9）；可重放；`supabase/migrations.lock.json` 追加 `{file, sha256}`（`shasum -a 256`）；`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移晚于已锁最新（现 `20261118093000`；foreign research 持 `20261119*`，#121/#126 锁到 `20261118`）。
- **数据库测试**：`process.env.S4_TEST_STATE` → `adminUrl`，`describe.skipIf(!enabled)`；命令 `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db -- <path>`；`test:migrations` 同前缀。**绝不** `pkill -f "postgres -D"`。
- **采集器**：`scripts/macro/.venv/bin/python`（akshare 1.20.35、requests 2.34.2 已装）；`python -m pytest scripts/macro/test_collect.py`；真实夹具用 `--record-fixtures DIR`（Task 4 之后 http 序列也走它）；录制不需要 ingest 密钥。
- **提交**：`git commit` 单独一条命令，同一命令行不能出现 `-n` 记号（用 `git commit -F - <<'EOF'`），不用 `--no-verify`；信息末尾 `Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>`。
- **代码风格**：沿用 `src/lib/macro` 紧凑风格（单空格缩进、文件顶部职责注释含规格条目）；Python 沿用 `collect.py`。
- **测试命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）。
- **禁用词**：代码 / 注释 / 文案不得出现 概率 / 置信度 / 胜率 / probability / confidence。
- **秘密**：永不打印 `TUSHARE_TOKEN`、`MACRO_INGEST_SECRET`；本计划不部署、不设 Vercel 环境变量。



## 共享契约（各任务逐字一致）

```ts
// src/lib/macro/types.ts（Task 10 才改；前面的任务只能"假定"这些形状存在于测试用的本地类型里）
export type Adapter='fred_csv'|'akshare'|'official_http';
export type NativeFrequency='daily'|'weekly'|'monthly'|'quarterly'|'event';
export interface MacroSeriesDef{ …; /** first period of this series' definition (inclusive, ISO date): FRED cosd floor; LPR excludes pre-reform daily quotes */ firstPeriod?:string; }
```

```ts
// src/lib/macro/cn-series.ts（Task 10）
export type CnFunction='macro_china_nbs_nation'|'bond_china_yield'|'currency_boc_safe'|'http_json'|'http_html';
export interface CnSeriesSpec{ …既有…;
 /** http_json / http_html: URL template; {start}/{end} = ISO dates of a window; evidence_path_match 'exact'|'prefix' */
 url?:string;evidence_path_match?:'exact'|'prefix';
 /** http_json: JSON pointer to the records array and the record field; tenor column name */
 pointer?:string;field?:string;
 /** http_html (pboc-afre): list discovery pages {year, url} newest first; daily mode fetches only the first */
 pages?:{year:number;url:string}[];
 /** window rule for http_json: 'calendar_year' (one call per year from first_period to today) */
 windows?:'calendar_year';first_period?:string;
}
export const CN_SPEC_VERSION='cn-series/2';
```

seriesKey 约定（目录 → `cnSpecOf`）：
- `http_json|/ags/ms/cm-u-bk-currency/LprHis|1Y`（host `www.chinamoney.org.cn`）→ `function:'http_json'`, `url:'https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate={start}&strEndDate={end}&pageNum=1&pageSize=50'`, `evidence_path:'/ags/ms/cm-u-bk-currency/LprHis'`, `evidence_path_match:'exact'`, `pointer:'/records'`, `field:'1Y'`, `column:'1Y'`, `windows:'calendar_year'`, `first_period:'2019-08-20'`, `period:'day'`。
- `http_html|/diaochatongjisi/attachDir/|社会融资规模存量`（host `www.pbc.gov.cn`）→ `function:'http_html'`, `evidence_path:'/diaochatongjisi/'`, `evidence_path_match:'prefix'`, `column:'增速（%）'`, `pages:AFRE_PAGES`（下表，Task 10 写死；每年 1 月 owner 按 runbook §14 追加新年份页，**不是**目录键的一部分所以不改 `CATALOG_VERSION`——`pages` 在 `cn-series.ts` 常量里，不在 `catalog.ts`）。

```ts
// src/lib/macro/cn-series.ts（Task 10）— verified 2026-11-07 (D0c)
export const AFRE_PAGES:{year:number;url:string}[]=[
 {year:2026,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/shrzgm/index.html'},
 {year:2025,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5570903/5570885/index.html'},
 {year:2024,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5225358/5225359/index.html'},
 {year:2023,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4780803/4780804/index.html'},
 {year:2022,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4458449/4458450/index.html'},
 {year:2021,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4184109/4184110/index.html'},
 {year:2020,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3959050/3959051/index.html'},
 {year:2019,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3750274/3750282/index.html'},
 {year:2018,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3471721/3471757/index.html'},
 {year:2017,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3245697/3245811/index.html'},
 {year:2016,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3013637/3013639/index.html'},
 {year:2015,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2161324/2161336/index.html'},
];
```
（全部 12 个子页 URL 已于 2026-11-07 实测；Task 1 的录制器从年份页重新发现并打印子页 URL，若与上表不同以录制器为准并更新上表。每年 1 月 owner 追加新年份页（runbook §14）。）

```ts
// 解析器签名（Task 2 / Task 3；Task 10 的 parserFor 按 function 分派）
export function parseLprHis(bytes:Uint8Array,opts:{seriesId:string;field:'1Y'|'5Y';firstPeriod:string}):ParsedPoint[];   // locator json_pointer `/records/<i>/<field>`
export function parseAfreStockYoy(bytes:Uint8Array,opts:{seriesId:string}):ParsedPoint[];                               // locator html_cell {table,row,cell}
```

```ts
// 报价事件（Task 5）— US PolicyEvent 类型与 derivePolicyEvents 原样不动
export interface RateQuoteEvent{kind:'policy_rate_quote_change';region:'CN';series_id:string;effective_date:string;from:string;to:string;change_bp:string;source:'derived';evidence:[string,string];version:string}
export function deriveRateQuoteEvents(seriesId:string,quotes:readonly EventInput[]):RateQuoteEvent[];
export const EVENTS_VERSION='macro-events/2';
// series-extras.ts：SeriesExtras 增 `quoteEvents:RateQuoteEvent[]`（US 为 []）；`events` 字段含义不变
```



### Task 6: FRED 夹具与解析回归（PR-2 起点）

**Files:**
- Modify: `scripts/macro/record-fred-fixtures.ts`（`--codes A,B,C` 可选参数：给定时只录这些 code，`series_id` 取 `--ids` 或与 code 同名）
- Create: `src/lib/macro/fixtures/fred/{WALCL,RRPONTSYD,WTREGEN}.csv`；Modify `manifest.json`（追加三条，保持按 code 排序）
- Test: `src/lib/macro/parsers/fred-csv.test.ts`

- [ ] **Step 1: 录制**

Run: `npx tsx scripts/macro/record-fred-fixtures.ts --codes WALCL,RRPONTSYD,WTREGEN --ids US_WALCL_W,US_RRPONTSYD_D,US_WTREGEN_W`
Expected: 三行 `<CODE>\t<bytes> bytes`；manifest 共 13 条。实现：`--codes` 存在时 `defs` 改为 `codes.map((code,i)=>({id:ids[i]??code,source:{seriesKey:code}}))` 的最小对象，其余逻辑不变；读取现有 manifest 合并去重后写回。

- [ ] **Step 2: 失败测试**

```ts
// fred-csv.test.ts 追加
describe('weekly and sparse daily FRED series (WP-D fixtures)',()=>{
 const fx=(code:string)=>new Uint8Array(readFileSync(join(process.cwd(),'src/lib/macro/fixtures/fred',`${code}.csv`)));
 it('WALCL: weekly Wednesday levels parse with period day; first and last rows match the bytes',()=>{
  const pts=parseFredCsv(fx('WALCL'),{seriesId:'US_WALCL_W',code:'WALCL',period:'day'});
  expect(pts[0]).toEqual({seriesId:'US_WALCL_W',periodEnd:'2015-01-07',valueText:expect.stringMatching(/^\d+$/),locator:{kind:'csv_row',line:2,column:1}});
  for(const p of pts)expect(new Date(`${p.periodEnd}T00:00:00Z`).getUTCDay(),p.periodEnd).toBe(3);   // every period_end is a Wednesday
 });
 it('WTREGEN: weekly week-average levels, Wednesdays only',()=>{
  for(const p of parseFredCsv(fx('WTREGEN'),{seriesId:'US_WTREGEN_W',code:'WTREGEN',period:'day'}))expect(new Date(`${p.periodEnd}T00:00:00Z`).getUTCDay()).toBe(3);
 });
 it('RRPONTSYD: empty values (no operation that day) produce no point; values keep decimal text',()=>{
  const text=new TextDecoder().decode(fx('RRPONTSYD'));const empty=text.split('\n').filter(l=>/^\d{4}-\d{2}-\d{2},$/.test(l)).length;
  const pts=parseFredCsv(fx('RRPONTSYD'),{seriesId:'US_RRPONTSYD_D',code:'RRPONTSYD',period:'day'});
  expect(empty).toBeGreaterThan(0);expect(pts.length+empty).toBe(text.trimEnd().split('\n').length-1);
  expect(pts.every(p=>/^-?\d+(\.\d+)?$/.test(p.valueText))).toBe(true);
 });
});
```
（录制用 `cosd=2015-01-01`，首行 2015-01-07 是周三。）

- [ ] **Step 3: 跑测试** — Run: `npm test -- src/lib/macro/parsers/fred-csv.test.ts` → PASS（解析器无需改动；本步只证明周频 / 空值已被覆盖）。

- [ ] **Step 4: 提交**

```bash
git add scripts/macro/record-fred-fixtures.ts src/lib/macro/fixtures/fred src/lib/macro/parsers/fred-csv.test.ts
git commit -F - <<'EOF'
test(macro): record WALCL / RRPONTSYD / WTREGEN fixtures; weekly and sparse-daily parser regressions

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```


### Task 7: `fredCosdFor(…, firstPeriod)` 与按首期判定回填完成

**Files:**
- Modify: `src/lib/macro/providers/fred.ts`、`src/lib/macro/providers/fred.test.ts`
- Modify: `src/app/api/cron/macro-sync/route.ts`、`src/app/api/cron/macro-sync/route.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// fred.test.ts 追加
it('fredCosdFor floors the full window at firstPeriod and ignores it once backfilled',()=>{
 expect(fredCosdFor('day',false,'2026-11-06','2002-12-18')).toBe('2002-12-18');
 expect(fredCosdFor('day',false,'2026-11-06','1999-01-01')).toBe('2000-01-01');
 expect(fredCosdFor('day',true,'2026-11-06','2002-12-18')).toBe('2025-10-02');
 expect(fredCosdFor('day',false,'2026-11-06')).toBe('2000-01-01');
});
it('fredBackfillDoneBy: 105 days after the series start, never before FRED_BACKFILL_DONE_BY',()=>{
 expect(fredBackfillDoneBy()).toBe('2000-04-15');
 expect(fredBackfillDoneBy('2002-12-18')).toBe('2003-04-02');
 expect(fredBackfillDoneBy('1999-06-01')).toBe('2000-04-15');
});
```
`route.test.ts` 加一例：一条 `firstPeriod:'2002-12-18'` 的测试目录行（route 测试已有注入目录的办法；若没有，用 `vi.mock('@/lib/macro/catalog')` 注入），数据库里已有 2003-01 的 eligible 行 → 第二次运行取 `cosd=` 400 天窗口而非 `2000-01-01`。

- [ ] **Step 2: 确认失败** — Run: `npm test -- src/lib/macro/providers/fred.test.ts` → FAIL。

- [ ] **Step 3: 实现**

```ts
// fred.ts
export function fredCosdFor(period:PeriodKind,backfilled:boolean,today:string,firstPeriod?:string):string{
 if(!backfilled)return firstPeriod&&firstPeriod>FRED_COSD?firstPeriod:FRED_COSD;
 …既有…
}
/** The date by which a series' persisted history must reach back for its backfill to count as complete: FRED_BACKFILL_DONE_BY,
 *  or 105 days after a later firstPeriod (covers a quarterly first period). */
export function fredBackfillDoneBy(firstPeriod?:string):string{
 if(!firstPeriod||firstPeriod<=FRED_COSD)return FRED_BACKFILL_DONE_BY;
 const d=new Date(`${firstPeriod}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+105);return d.toISOString().slice(0,10);
}
```
`route.ts`：`backfillComplete(deps,def)` 改查 `{from:fredCosdFor(def.period,false,today,def.firstPeriod),to:fredBackfillDoneBy(def.firstPeriod)}`；调用 `fredCosdFor(def.period,await backfillComplete(deps,def),today,def.firstPeriod)`。`def.firstPeriod` 在 PR-2 时类型上尚不存在 → 用 `(def as {firstPeriod?:string}).firstPeriod`（Task 10 删掉断言）。

- [ ] **Step 4: 通过** — Run: `npm test -- src/lib/macro/providers src/app/api/cron/macro-sync` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro/providers/fred.ts src/lib/macro/providers/fred.test.ts src/app/api/cron/macro-sync/route.ts src/app/api/cron/macro-sync/route.test.ts
git commit -F - <<'EOF'
feat(macro): FRED full-window floor and backfill-complete check honour a series' firstPeriod

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

