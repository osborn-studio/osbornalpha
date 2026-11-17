## Part D：公开 DTO、公开路由、公开页面、管理员页面 / Part E：cron、存储检查、runbook、实施记录

### 依赖的 A/B/C 导出（本 Part 假定的签名；与实际不符时只改调用点，不改语义）

| 来源 | 导出 | 假定签名 / 形状 |
|---|---|---|
| A4 `types.ts` | 共享契约全部类型 | 原样（骨架 §共享契约） |
| A4 `db.ts` | `supabaseBrokerResearchDb` | `(client: SupabaseClient<any>) => BrokerResearchDb`；anon 客户端构造时只用 `publicReports/publicReport/publicInstitutions/ratingHistory` |
| A4 `db.ts` | `publicReports(filter)` | 按 `published_date desc, report_id desc` 排序；`cursor` 为严格"之后"；`issuerId` 过滤 = 任一 target `issuer_id` 相等；bundle 的 `report/targets/institution` 为 §4.11 视图行（snake_case 列名同 §4.11） |
| A4 `db.ts` | `publicReport(id)` | 视图行；`citations` 行含 `extractor_kind ∈ {'llm','human'}`；`summaries` 行含 `model_id/prompt_version/generated_at` |
| A4 `effective.ts` | `effectiveValue(row: FieldRow): TypedValue` | 原样 |
| B1 `versions.ts` | `UPSIDE_FORMULA_VERSION`、`RULES_VERSION`、`CLAIM_METHODOLOGY_VERSION` | 字符串常量 |
| C1 `storage.ts` | `BrokerStorage.download(path)`、`supabaseBrokerStorage(client)` | `download(path: string): Promise<Uint8Array>`，对象不存在时抛错（或返回 null，两者都按"不可读"处理） |
| C1 `admin-route.ts` | `guardPost`、`jsonNoStore`、`errorJson` | `guardPost(req: NextRequest): Promise<{ user: { id: string } } \| NextResponse>`（含 415/403 origin/401/403）；`jsonNoStore(body: unknown, status?: number): NextResponse`；`errorJson(code: string, message: string, status: number): NextResponse` |
| C4 `ports/f3.ts` | `sliceText` | `sliceText(artifact: unknown, loc: { page: number; char_start: number; char_end: number }): string \| null`（纯函数，不受 `BROKER_RESEARCH_F3_ENABLED` 影响） |
| C2–C7 管理员路由 | 路径同规格 §8.2，前缀 `/api/admin/broker-research` | 成功体与错误体见下表；错误体一律 `{error:{code,message,...}}` |
| Plan 1 | `startBatch/finishBatch`（`dq/batches.ts`）、`quarantine/listOpenQuarantine`（`dq/quarantine.ts`）、`recordAttempt`（`dq/freshness.ts`）、`selectAll/supabaseTableClient`（`db/table-client.ts`）、`memoryTableClient`（`db/memory-table-client.ts`）、`resolveIssuer`（`entities/resolve.ts`）、`resolveCodeVersion`（`facts/deps.ts`）、`public-route.ts` 助手 | 现有签名 |

管理员路由响应（D4/D5 页面依赖；C 的实现若不同，只改 `_shared/admin-fetch.ts` 与 `review-model.ts::normalizeReviewPayload`）：

| 路由 | 成功体（假定） |
|---|---|
| `POST licences`、`PATCH licences/[id]` | `{ licence: LicenceRow }` |
| `POST licences/[id]/confirm {version}` | `{ result: 'confirmed' }`；`409 version_mismatch` |
| `POST settings/public {enabled}` | `{ settings: SettingsRow }` |
| `POST documents/intent` | `{ intentId, uploadUrl, token }`；`409 duplicate_document`，`error.documentId` 或 `error.detail.document_id` 带既有 id |
| `POST documents/commit {intentId}` | `{ documentId }` |
| ★ `GET documents/[id]/url` | `{ url, expiresIn }` |
| `POST documents/[id]/parse`、`extract`、`reports/[id]/summary {lang}`、`reports/[id]/translate` | `{ runId, status }` |
| `POST documents/[id]/withdraw {reason, purge?}`、`documents/[id]/purge` | `{ steps: PurgeStepRow[] }`（withdraw 可只回 `{ ok: true }`） |
| ★ `GET reports/[id]` | `ReviewPayload`（见 D5 `review-model.ts`） |
| ★ `GET documents/[id]/pages/[n]` | `{ page, pageCount, text, parseRunId }` |
| `POST reports/[id]/fields/[fieldId] {action, payload}` | `{ receipt: MaterializeReceipt }`；`correct` 的 `payload = { corrected: CorrectedValue, span?: {page,char_start,char_end,value_source_text} }` |
| `POST reports/[id]/fields`、`fields/absent`、`bind`、`overrides`、`snippets`、`snippets/[id]`、`summaries/[id]`、`review` | `{ ok: true, ... }`（页面只看 HTTP 状态与 `error.code`，随后重新拉取 ★ 复核数据） |
| `GET reports/[id]/publish-blockers` | `{ blockers: string[] }` |
| `POST reports/[id]/publish` | `{ publicationId }`；`409` 时 `error.code` 以 `publish_blocked` 开头（页面随后重新拉取阻断列表，不解析原因串） |
| `POST reports/[id]/unpublish {reason}` | `{ ok: true }` |
| `GET publications/[id]` | `{ publication: PublicationRow }` |

---
### Task D1: 公开 DTO 白名单序列化 + 公开读加载器 + 五条公开路由

**Files:**
- Create: `src/lib/broker-research/public-dto.ts`
- Create: `src/lib/broker-research/public-dto.test.ts`
- Create: `src/lib/broker-research/public-read.ts`
- Create: `src/lib/broker-research/public-read.test.ts`
- Create: `src/app/api/broker-research/reports/route.ts`
- Create: `src/app/api/broker-research/reports/[reportId]/route.ts`
- Create: `src/app/api/broker-research/institutions/route.ts`
- Create: `src/app/api/broker-research/history/route.ts`
- Create: `src/app/api/broker-research/by-ticker/[ticker]/route.ts`
- Create: `src/app/api/broker-research/routes.test.ts`

设计要点（实施前读完）：
- DTO 每个输出键都在 `public-dto.ts` 里逐个写出，**从不展开（spread）视图行**；视图新增列不会泄露。纵深防御：`target_price_public !== true` 时目标价 / 币种 / 期限 / 空间值一律丢弃（即使行里有值），目标价类引用行丢弃；片段长于许可 N（或 N 未知）丢弃；`summary_public !== true` 时摘要丢弃。
- 数值列输出十进制字符串（PostgREST 可能给 JSON number；指数形式视为畸形 → `null`，绝不猜值）。
- `public-read.ts` 是路由与服务端页面共用的加载器；页面不经 HTTP 调自己的 API。
- ticker 经 `resolveIssuer`（按今天的归属；**不**用 facts 的 `resolvePublicIssuer`，因为它拒绝 HK，而本模块覆盖港股）。
- 列表：无任何筛选参数（`limit` 除外）且 0 行 → `404 not_found`（对外开关关闭与空馆藏对匿名用户不可区分，这是视图的设计）；有筛选 0 行 → `200 {reports:[]}`。其余路由 0 行 / 不存在 → 404。全部响应 `Cache-Control: no-store`，`dynamic='force-dynamic'`。
- 响应在规格 §8.1 字段之外只多出 `targets[].publicationId`（来源抽屉要显示发布快照 id，来自 `broker_report_targets_public_v.publication_id`）与 `primaryTargetKey`；记入 §17。

- [ ] **Step 1: 写 DTO 的失败测试**

```ts
// src/lib/broker-research/public-dto.test.ts
import {describe,expect,it} from 'vitest';
import {dec,toPublicHistoryRow,toPublicInstitution,toPublicReport,toPublicReportDetail} from './public-dto';
import type {PublicReportBundle,PublicReportDetail} from './types';

const RID='11111111-1111-4111-8111-111111111111',IID='22222222-2222-4222-8222-222222222222',PID='33333333-3333-4333-8333-333333333333';
function bundle(over:{report?:Record<string,unknown>;target?:Record<string,unknown>}={}):PublicReportBundle{
 return {
  report:{report_id:RID,revision:2,scope:'single_issuer',institution_id:IID,title:'Synthetic title',title_is_rewritten:false,title_zh:'合成标题',title_en:null,title_is_translation:true,
   published_date:'2026-10-01',price_as_of_date:'2026-09-30',report_type:'company',sector_as_stated:'Consumer',primary_target_key:'600000.SH',available_at:'2026-10-02T01:00:00+00:00',
   code_version:'abc1234',published_at:'2026-10-03T00:00:00+00:00',supersedes_report_id:null,page_count:12,snippet_max_chars:40,target_price_public:true,summary_public:true,...over.report},
  targets:[{report_id:RID,publication_id:PID,target_key:'600000.SH',ticker_as_stated:'600000 CH',security_ticker:'600000.SH',issuer_id:'iss-1',rating_raw:'Overweight',rating_normalized:'overweight',scale_id:'sc-1',
   target_price:'12.50',target_currency:'CNY',target_horizon_months:12,upside_pct:'0.25',target_price_public:true,price_at_report:10,price_currency:'CNY',price_as_of_date:'2026-09-30',upside_formula_version:'upside/1',...over.target}],
  hasSummary:{zh:true,en:false},snippetCount:1,
  institution:{institution_id:IID,name_en:'Synthetic Securities',name_zh:'合成证券',aliases:['SynSec',3],kind:'broker',rating_disclosure_url:'javascript:alert(1)'},
 };
}
function detail(over:{report?:Record<string,unknown>;target?:Record<string,unknown>}={}):PublicReportDetail{
 return {...bundle(over),
  citations:[
   {report_id:RID,target_key:'600000.SH',field:'target_price',occurrence:1,page:1,value_text:'12.50',value_num:'12.50',value_currency:'CNY',value_unit:'price',value_date:null,status:'confirmed',extractor_kind:'llm'},
   {report_id:RID,target_key:'600000.SH',field:'rating',occurrence:1,page:1,value_text:'Overweight',value_num:null,value_currency:null,value_unit:null,value_date:null,status:'corrected',extractor_kind:'llm'},
   {report_id:RID,target_key:null,field:'not_a_field',occurrence:1,page:1,value_text:'x',status:'confirmed',extractor_kind:'llm'},
  ],
  snippets:[
   {snippet_id:'s1',report_id:RID,target_key:'600000.SH',purpose:'rating',page:2,text:'a'.repeat(40),field_id:'f1'},
   {snippet_id:'s2',report_id:RID,target_key:null,purpose:'risk',page:3,text:'b'.repeat(41),field_id:null},
  ],
  summaries:[{summary_id:'m1',report_id:RID,lang:'zh',kind:'independent_summary',model_id:'model-x',registry_hash:'reg-SECRET',prompt_version:'independent-summary/1',input_hash:'in-SECRET',summary_md:'摘要正文',generated_at:'2026-10-02T02:00:00+00:00'}],
  analysts:[{report_id:RID,analyst_id:'a1',display_name:'Analyst One',institution_id:IID,role:'lead'}],
 };
}

describe('dec',()=>{
 it('keeps decimal strings, prints numbers, rejects exponent and junk',()=>{
  expect(dec('1980.00')).toBe('1980.00');expect(dec(1980)).toBe('1980');expect(dec(-0.5)).toBe('-0.5');
  expect(dec(1e21)).toBeNull();expect(dec('1e3')).toBeNull();expect(dec('12,5')).toBeNull();expect(dec(null)).toBeNull();expect(dec(Number.NaN)).toBeNull();
 });
});

describe('toPublicReport',()=>{
 it('emits exactly the whitelisted keys',()=>{
  const r=toPublicReport(bundle())!;
  expect(Object.keys(r).sort()).toEqual(['availableAt','codeVersion','hasSummary','institution','primaryTargetKey','publishedDate','reportId','reportType','revision','scope','sectorAsStated','snippetCount','targetPricePublic','targets','title']);
  expect(Object.keys(r.targets[0]).sort()).toEqual(['issuerId','priceAtReport','publicationId','rating','securityTicker','target','targetKey','tickerAsStated','upsideFormulaVersion','upsidePct']);
  expect(r.targets[0]).toMatchObject({target:{price:'12.50',currency:'CNY',horizonMonths:12},priceAtReport:{value:'10',currency:'CNY',asOf:'2026-09-30'},upsidePct:'0.25',rating:{raw:'Overweight',normalized:'overweight',scaleId:'sc-1'}});
  expect(r.title).toEqual({text:'Synthetic title',isRewritten:false,zh:'合成标题',en:null,isTranslation:true});
  expect(r.institution).toEqual({id:IID,nameEn:'Synthetic Securities',nameZh:'合成证券'});
 });
 it('never carries private columns that reach a bundle by mistake',()=>{
  const b=bundle({report:{storage_path:'reports/SECRET.pdf',sha256:'SHA-SECRET',lease_token:'LEASE-SECRET',effective_hash:'EFF-SECRET'},target:{resolution:{candidates:['RES-SECRET']},input_hash:'IH-SECRET'}});
  const json=JSON.stringify(toPublicReport(b));
  for(const s of ['SECRET','storage_path','sha256','lease_token','effective_hash','resolution','input_hash'])expect(json).not.toContain(s);
 });
 it('drops target-price values when the licence does not allow them, even if a value leaks into the row',()=>{
  for(const over of [{report:{target_price_public:false}},{target:{target_price_public:false}}]){
   const r=toPublicReport(bundle(over))!;
   expect(r.targets[0].target).toBeNull();expect(r.targets[0].upsidePct).toBeNull();
   expect(JSON.stringify(r)).not.toContain('12.50');expect(JSON.stringify(r)).not.toContain('0.25');
  }
  expect(toPublicReport(bundle({report:{target_price_public:false}}))!.targetPricePublic).toBe(false);
 });
 it('maps unknown enum values to null and rejects rows without id or title',()=>{
  const r=toPublicReport(bundle({report:{scope:'weird'},target:{rating_normalized:'strong_buy'}}))!;
  expect(r.scope).toBeNull();expect(r.targets[0].rating.normalized).toBeNull();
  expect(toPublicReport(bundle({report:{report_id:null}}))).toBeNull();
  expect(toPublicReport(bundle({report:{title:''}}))).toBeNull();
 });
});

describe('toPublicReportDetail',()=>{
 it('whitelists citations, snippets, summaries and analysts',()=>{
  const d=toPublicReportDetail(detail())!;
  expect(d.citations).toHaveLength(2);
  expect(Object.keys(d.citations[0]).sort()).toEqual(['extractorKind','field','occurrence','page','status','targetKey','valueCurrency','valueDate','valueNum','valueText','valueUnit']);
  expect(d.snippets.map(s=>s.snippetId)).toEqual(['s1']);                       // 41 > N=40 is dropped
  expect(d.summaries.zh).toEqual({summaryId:'m1',lang:'zh',label:'independent_summary',modelId:'model-x',promptVersion:'independent-summary/1',generatedAt:'2026-10-02T02:00:00+00:00',markdown:'摘要正文'});
  expect(d.summaries.en).toBeNull();
  expect(d.analysts).toEqual([{analystId:'a1',displayName:'Analyst One',role:'lead'}]);
  expect(d.licence).toEqual({snippetMaxChars:40,targetPricePublic:true,summaryPublic:true});
  expect(d.settlement).toBeNull();
  const json=JSON.stringify(d);
  for(const s of ['reg-SECRET','in-SECRET','field_id','registry_hash','input_hash'])expect(json).not.toContain(s);
 });
 it('drops target-price citations and fails closed on unknown N or summary flag',()=>{
  const d=toPublicReportDetail(detail({report:{target_price_public:false,snippet_max_chars:null,summary_public:false}}))!;
  expect(d.citations.map(c=>c.field)).toEqual(['rating']);
  expect(d.snippets).toEqual([]);expect(d.summaries).toEqual({zh:null,en:null});
  expect(d.hasSummary).toEqual({zh:false,en:false});
 });
});

describe('toPublicInstitution / toPublicHistoryRow',()=>{
 it('filters aliases and non-http disclosure urls',()=>{
  expect(toPublicInstitution(bundle().institution)).toEqual({id:IID,nameEn:'Synthetic Securities',nameZh:'合成证券',aliases:['SynSec'],kind:'broker',ratingDisclosureUrl:null});
  expect(toPublicInstitution({institution_id:IID})).toBeNull();
 });
 it('history keeps the documented columns only',()=>{
  const h=toPublicHistoryRow({report_id:RID,prev_report_id:null,institution_id:IID,security_ticker:'600000.SH',issuer_id:'iss-1',published_date:'2026-10-01',prev_published_date:null,rating_normalized:'buy',prev_rating_normalized:null,scale_id:'sc',prev_scale_id:null,target_price:12.5,prev_target_price:null,target_currency:'CNY',upside_formula_version:'upside/1',prev_upside_formula_version:null,code_version:'c',prev_code_version:null,available_at:'2026-10-02T00:00:00+00:00',prev_available_at:null,input_hash:'IH-SECRET'})!;
  expect(h.targetPrice).toBe('12.5');expect(JSON.stringify(h)).not.toContain('SECRET');
  expect(Object.keys(h)).toHaveLength(20);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/broker-research/public-dto.test.ts`
Expected: FAIL（`Cannot find module './public-dto'`）

- [ ] **Step 3: 实现 `public-dto.ts`**

```ts
// src/lib/broker-research/public-dto.ts
// Whitelist serializers for the public read API and pages (spec §8.1, §12.1 "dto"). Every output key
// is written here explicitly — view rows are never spread — so a column added to a §4.11 view, or a
// private column reaching a bundle by mistake, cannot leak. Defence in depth on top of the views:
// target-price values (and citations of target-price fields) are dropped whenever
// target_price_public is not true; snippets longer than the licence N, or with N unknown, are
// dropped; summaries are dropped unless summary_public is true. Numeric columns become decimal
// strings; malformed or exponent forms become null (never a guessed value).
import type {FieldName,NormalizedRating,PublicReportBundle,PublicReportDetail,ReportScope,SnippetPurpose,ValueUnit} from './types';

type Row=Record<string,unknown>;
export const PUBLIC_RATINGS:readonly NormalizedRating[]=['buy','overweight','neutral','underweight','sell','not_rated'];
export const PUBLIC_SCOPES:readonly ReportScope[]=['single_issuer','multi_issuer','sector','macro_strategy'];
export const SNIPPET_PURPOSES:readonly SnippetPurpose[]=['rating','target','thesis','risk','method','other'];
const UNITS:readonly ValueUnit[]=['pct','ratio','months','price'];
const FIELDS:readonly FieldName[]=['institution','analyst','published_date','price_as_of_date','ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method','sector','title'];
export const TARGET_PRICE_FIELDS:ReadonlySet<string>=new Set(['target_price','target_currency','target_horizon','upside_stated']);
const DEC=/^-?\d+(?:\.\d+)?$/;
const CITATION_STATUSES=['confirmed','corrected','absent'] as const;
const EXTRACTOR_KINDS=['llm','human'] as const;

const str=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;
const oneOf=<T extends string>(v:unknown,all:readonly T[]):T|null=>typeof v==='string'&&(all as readonly string[]).includes(v)?v as T:null;
const int=(v:unknown):number|null=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'&&/^-?\d{1,9}$/.test(v)?Number(v):null;
const day=(v:unknown):string|null=>{const s=str(v);return s!==null&&/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null;};
const instant=(v:unknown):string|null=>{const s=str(v);return s!==null&&Number.isFinite(Date.parse(s))?s:null;};
export const notNull=<T>(v:T|null|undefined):v is T=>v!==null&&v!==undefined;
/** numeric column → decimal string, or null. */
export function dec(v:unknown):string|null{
 const s=typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):null;
 return s!==null&&DEC.test(s)?s:null;
}

export interface PublicInstitutionDto{id:string;nameEn:string;nameZh:string|null;aliases:string[];kind:string|null;ratingDisclosureUrl:string|null}
export type PublicInstitutionRef=Pick<PublicInstitutionDto,'id'|'nameEn'|'nameZh'>;
export interface PublicTargetDto{
 targetKey:string;tickerAsStated:string;securityTicker:string|null;issuerId:string|null;publicationId:string|null;
 rating:{raw:string|null;normalized:NormalizedRating|null;scaleId:string|null};
 target:{price:string;currency:string|null;horizonMonths:number|null}|null;
 priceAtReport:{value:string;currency:string|null;asOf:string|null}|null;
 upsidePct:string|null;upsideFormulaVersion:string|null;
}
export interface PublicTitleDto{text:string;isRewritten:boolean;zh:string|null;en:string|null;isTranslation:boolean}
export interface PublicReportDto{
 reportId:string;revision:number;scope:ReportScope|null;institution:PublicInstitutionRef|null;targets:PublicTargetDto[];primaryTargetKey:string|null;
 title:PublicTitleDto;publishedDate:string|null;reportType:string|null;sectorAsStated:string|null;availableAt:string|null;codeVersion:string|null;
 hasSummary:{zh:boolean;en:boolean};snippetCount:number;targetPricePublic:boolean;
}
export interface PublicCitationDto{targetKey:string|null;field:FieldName;occurrence:number;page:number|null;valueText:string;valueNum:string|null;valueCurrency:string|null;valueUnit:ValueUnit|null;valueDate:string|null;status:typeof CITATION_STATUSES[number];extractorKind:typeof EXTRACTOR_KINDS[number]|null}
export interface PublicSnippetDto{snippetId:string;targetKey:string|null;purpose:SnippetPurpose;page:number|null;text:string}
export interface PublicSummaryDto{summaryId:string;lang:'zh'|'en';label:'independent_summary';modelId:string|null;promptVersion:string|null;generatedAt:string|null;markdown:string}
export interface PublicAnalystDto{analystId:string;displayName:string;role:string|null}
export interface PublicReportDetailDto extends PublicReportDto{
 citations:PublicCitationDto[];snippets:PublicSnippetDto[];summaries:{zh:PublicSummaryDto|null;en:PublicSummaryDto|null};analysts:PublicAnalystDto[];
 licence:{snippetMaxChars:number|null;targetPricePublic:boolean;summaryPublic:boolean};settlement:null;
}
export interface PublicHistoryRowDto{
 reportId:string;prevReportId:string|null;institutionId:string|null;securityTicker:string;issuerId:string|null;publishedDate:string|null;prevPublishedDate:string|null;
 ratingNormalized:NormalizedRating|null;prevRatingNormalized:NormalizedRating|null;scaleId:string|null;prevScaleId:string|null;targetPrice:string|null;prevTargetPrice:string|null;
 targetCurrency:string|null;upsideFormulaVersion:string|null;prevUpsideFormulaVersion:string|null;codeVersion:string|null;prevCodeVersion:string|null;availableAt:string|null;prevAvailableAt:string|null;
}

export function toPublicInstitution(row:Row|null|undefined):PublicInstitutionDto|null{
 if(!row)return null;
 const id=str(row.institution_id),nameEn=str(row.name_en);if(!id||!nameEn)return null;
 const aliases=Array.isArray(row.aliases)?row.aliases.filter((a):a is string=>typeof a==='string'&&a.length>0):[];
 const url=str(row.rating_disclosure_url);
 return {id,nameEn,nameZh:str(row.name_zh),aliases,kind:str(row.kind),ratingDisclosureUrl:url!==null&&/^https?:\/\//i.test(url)?url:null};
}

export function toPublicTarget(row:Row,targetPricePublic:boolean):PublicTargetDto|null{
 const targetKey=str(row.target_key);if(!targetKey)return null;
 const allowed=targetPricePublic&&row.target_price_public===true;
 const price=allowed?dec(row.target_price):null,par=dec(row.price_at_report);
 return {
  targetKey,tickerAsStated:str(row.ticker_as_stated)??targetKey,securityTicker:str(row.security_ticker),issuerId:str(row.issuer_id),publicationId:str(row.publication_id),
  rating:{raw:str(row.rating_raw),normalized:oneOf(row.rating_normalized,PUBLIC_RATINGS),scaleId:str(row.scale_id)},
  target:price===null?null:{price,currency:str(row.target_currency),horizonMonths:int(row.target_horizon_months)},
  priceAtReport:par===null?null:{value:par,currency:str(row.price_currency),asOf:day(row.price_as_of_date)},
  upsidePct:allowed?dec(row.upside_pct):null,upsideFormulaVersion:str(row.upside_formula_version),
 };
}

export function toPublicReport(b:PublicReportBundle):PublicReportDto|null{
 const r=b.report;const reportId=str(r.report_id),text=str(r.title);if(!reportId||!text)return null;
 const tpp=r.target_price_public===true;
 const inst=toPublicInstitution(b.institution);
 const snippetCount=typeof b.snippetCount==='number'&&Number.isSafeInteger(b.snippetCount)&&b.snippetCount>0?b.snippetCount:0;
 return {
  reportId,revision:int(r.revision)??1,scope:oneOf(r.scope,PUBLIC_SCOPES),institution:inst?{id:inst.id,nameEn:inst.nameEn,nameZh:inst.nameZh}:null,
  targets:b.targets.map(t=>toPublicTarget(t,tpp)).filter(notNull),primaryTargetKey:str(r.primary_target_key),
  title:{text,isRewritten:r.title_is_rewritten===true,zh:str(r.title_zh),en:str(r.title_en),isTranslation:r.title_is_translation===true},
  publishedDate:day(r.published_date),reportType:str(r.report_type),sectorAsStated:str(r.sector_as_stated),availableAt:instant(r.available_at),codeVersion:str(r.code_version),
  hasSummary:{zh:b.hasSummary?.zh===true,en:b.hasSummary?.en===true},snippetCount,targetPricePublic:tpp,
 };
}

function toCitation(row:Row,tpp:boolean):PublicCitationDto|null{
 const field=oneOf(row.field,FIELDS),status=oneOf(row.status,CITATION_STATUSES),valueText=str(row.value_text);
 if(!field||!status||valueText===null)return null;
 if(!tpp&&TARGET_PRICE_FIELDS.has(field))return null;
 return {targetKey:str(row.target_key),field,occurrence:int(row.occurrence)??1,page:int(row.page),valueText,valueNum:dec(row.value_num),valueCurrency:str(row.value_currency),
  valueUnit:oneOf(row.value_unit,UNITS),valueDate:day(row.value_date),status,extractorKind:oneOf(row.extractor_kind,EXTRACTOR_KINDS)};
}
function toSnippet(row:Row,max:number|null):PublicSnippetDto|null{
 const snippetId=str(row.snippet_id),text=str(row.text),purpose=oneOf(row.purpose,SNIPPET_PURPOSES);
 if(!snippetId||text===null||!purpose||max===null||text.length>max)return null;
 return {snippetId,targetKey:str(row.target_key),purpose,page:int(row.page),text};
}
function toSummary(row:Row):PublicSummaryDto|null{
 const summaryId=str(row.summary_id),lang=oneOf(row.lang,['zh','en'] as const),markdown=str(row.summary_md);
 if(!summaryId||!lang||markdown===null||row.kind!=='independent_summary')return null;
 return {summaryId,lang,label:'independent_summary',modelId:str(row.model_id),promptVersion:str(row.prompt_version),generatedAt:instant(row.generated_at),markdown};
}

export function toPublicReportDetail(d:PublicReportDetail):PublicReportDetailDto|null{
 const base=toPublicReport(d);if(!base)return null;
 const r=d.report,tpp=base.targetPricePublic,summaryPublic=r.summary_public===true,max=int(r.snippet_max_chars);
 const summaries:{zh:PublicSummaryDto|null;en:PublicSummaryDto|null}={zh:null,en:null};
 if(summaryPublic)for(const s of d.summaries.map(toSummary).filter(notNull))if(summaries[s.lang]===null)summaries[s.lang]=s;
 const snippets=d.snippets.map(s=>toSnippet(s,max)).filter(notNull);
 return {
  ...base,   // base is our own whitelisted DTO, not a view row
  hasSummary:{zh:summaries.zh!==null,en:summaries.en!==null},snippetCount:snippets.length,
  citations:d.citations.map(c=>toCitation(c,tpp)).filter(notNull),snippets,summaries,
  analysts:d.analysts.map(a=>{const analystId=str(a.analyst_id),displayName=str(a.display_name);return analystId&&displayName?{analystId,displayName,role:str(a.role)}:null;}).filter(notNull),
  licence:{snippetMaxChars:max,targetPricePublic:tpp,summaryPublic},settlement:null,
 };
}

export function toPublicHistoryRow(row:Row):PublicHistoryRowDto|null{
 const reportId=str(row.report_id),securityTicker=str(row.security_ticker);if(!reportId||!securityTicker)return null;
 return {
  reportId,prevReportId:str(row.prev_report_id),institutionId:str(row.institution_id),securityTicker,issuerId:str(row.issuer_id),
  publishedDate:day(row.published_date),prevPublishedDate:day(row.prev_published_date),
  ratingNormalized:oneOf(row.rating_normalized,PUBLIC_RATINGS),prevRatingNormalized:oneOf(row.prev_rating_normalized,PUBLIC_RATINGS),
  scaleId:str(row.scale_id),prevScaleId:str(row.prev_scale_id),targetPrice:dec(row.target_price),prevTargetPrice:dec(row.prev_target_price),targetCurrency:str(row.target_currency),
  upsideFormulaVersion:str(row.upside_formula_version),prevUpsideFormulaVersion:str(row.prev_upside_formula_version),codeVersion:str(row.code_version),prevCodeVersion:str(row.prev_code_version),
  availableAt:instant(row.available_at),prevAvailableAt:instant(row.prev_available_at),
 };
}
```

- [ ] **Step 4: 运行 DTO 测试，确认通过**

Run: `npm test -- src/lib/broker-research/public-dto.test.ts`
Expected: PASS（8 个用例）

- [ ] **Step 5: 写加载器的失败测试**

```ts
// src/lib/broker-research/public-read.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({resolveIssuer:vi.fn()}));
vi.mock('@/lib/entities/resolve',async(orig)=>({...await orig<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolveIssuer}));
import {decodeCursor,encodeCursor,institutionPageData,libraryStats,listPublicReports,monthsBefore,publicSpread,reportPageData,resolveTicker} from './public-read';
import type {PublicReadDeps} from './public-read';
import type {BrokerResearchDb,PublicReportBundle} from './types';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function b(n:number,o:{inst?:number;date?:string;ticker?:string;currency?:string|null;price?:string|null;summary?:boolean;public?:boolean}={}):PublicReportBundle{
 const inst=uuid(900+(o.inst??1));
 return {report:{report_id:uuid(n),title:`T${n}`,published_date:o.date??'2026-10-01',available_at:`${o.date??'2026-10-01'}T08:00:00+00:00`,primary_target_key:o.ticker??'600000.SH',target_price_public:o.public??true,snippet_max_chars:100,summary_public:true},
  targets:[{target_key:o.ticker??'600000.SH',security_ticker:o.ticker??'600000.SH',issuer_id:'iss-1',target_price:o.price===undefined?'10':o.price,target_currency:o.currency===undefined?'CNY':o.currency,price_at_report:'8',price_currency:'CNY',target_price_public:o.public??true,publication_id:uuid(500+n)}],
  hasSummary:{zh:o.summary??false,en:false},snippetCount:0,institution:{institution_id:inst,name_en:`Inst ${o.inst??1}`}};
}
function deps(db:Partial<BrokerResearchDb>):PublicReadDeps{return {db:db as BrokerResearchDb,tables:{} as PublicReadDeps['tables']};}

beforeEach(()=>vi.clearAllMocks());

describe('cursor',()=>{
 it('round-trips and rejects junk',()=>{
  const c={publishedDate:'2026-10-01',reportId:uuid(1)};
  expect(decodeCursor(encodeCursor(c))).toEqual(c);
  for(const s of ['','!!!',Buffer.from('2026-10-01|nope').toString('base64url'),Buffer.from(`2026-1-01|${uuid(1)}`).toString('base64url')])expect(decodeCursor(s)).toBeNull();
 });
});

describe('listPublicReports',()=>{
 it('passes the filter, emits nextCursor only for a full page, filters summaryOnly after paging',async()=>{
  const publicReports=vi.fn().mockResolvedValue([b(1,{summary:true}),b(2,{date:'2026-09-01'})]);
  const page=await listPublicReports(deps({publicReports}),{limit:2,rating:'buy',summaryOnly:true});
  expect(publicReports).toHaveBeenCalledWith(expect.objectContaining({limit:2,rating:'buy'}));
  expect(page.reports.map(r=>r.reportId)).toEqual([uuid(1)]);
  expect(decodeCursor(page.nextCursor!)).toEqual({publishedDate:'2026-09-01',reportId:uuid(2)});
  publicReports.mockResolvedValue([b(3)]);
  expect((await listPublicReports(deps({publicReports}),{limit:2})).nextCursor).toBeNull();
 });
});

describe('libraryStats',()=>{
 it('pages through the library and counts per institution',async()=>{
  const pages=[Array.from({length:200},(_,i)=>b(i+1,{inst:i%2,date:'2026-10-01'})),[b(1000,{inst:5,date:'2026-11-01'})]];
  const publicReports=vi.fn().mockImplementation(async(f:{cursor?:unknown})=>f.cursor?pages[1]:pages[0]);
  const s=await libraryStats(deps({publicReports}));
  expect(s.totals).toEqual({reports:201,institutions:3,lastAvailableAt:'2026-11-01T08:00:00+00:00',truncated:false});
  expect(s.byInstitution.get(uuid(905))).toEqual({count:1,lastPublishedDate:'2026-11-01'});
 });
 it('stops after STATS_MAX_PAGES and marks truncated',async()=>{
  const full=Array.from({length:200},(_,i)=>b(i+1));
  const s=await libraryStats(deps({publicReports:vi.fn().mockResolvedValue(full)}));
  expect(s.totals.truncated).toBe(true);
 });
});

describe('resolveTicker',()=>{
 it('returns null for unknown, prefers the exact then the normalised security',async()=>{
  mocks.resolveIssuer.mockResolvedValueOnce(null);
  expect(await resolveTicker({} as never,'zzzz','2026-11-06')).toBeNull();
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-1',securities:[{ticker:'09988.HK',is_primary:true},{ticker:'BABA',is_primary:false}]});
  expect(await resolveTicker({} as never,'baba','2026-11-06')).toEqual({issuerId:'iss-1',securityTicker:'BABA'});
  expect(await resolveTicker({} as never,'9988','2026-11-06')).toEqual({issuerId:'iss-1',securityTicker:'09988.HK'});
  expect(mocks.resolveIssuer).toHaveBeenLastCalledWith({},{ticker:'9988'},{today:'2026-11-06'});
 });
});

describe('spread, report page, institution page',()=>{
 it('monthsBefore is calendar arithmetic in UTC',()=>{expect(monthsBefore('2026-11-06',12)).toBe('2025-11-06');});
 it('keeps the newest report per institution with the same security and currency',async()=>{
  const publicReports=vi.fn().mockResolvedValue([b(1,{inst:1,date:'2026-09-01'}),b(2,{inst:1,date:'2026-10-01'}),b(3,{inst:2,currency:'USD'}),b(4,{inst:3,public:false,currency:null})]);
  const rows=await publicSpread(deps({publicReports}),{issuerId:'iss-1',securityTicker:'600000.SH',currency:'CNY',today:'2026-11-06'});
  expect(publicReports).toHaveBeenCalledWith(expect.objectContaining({issuerId:'iss-1',from:'2025-11-06'}));
  // same date → newest-first by report_id desc; inst 3's target is hidden → its currency comes from price_currency
  expect(rows.map(r=>r.reportId)).toEqual([uuid(4),uuid(2)]);
  expect(rows[0]).toMatchObject({targetPricePublic:false,target:null});
 });
 it('reportPageData returns null when not public and filters history by the target currency',async()=>{
  expect(await reportPageData(deps({publicReport:vi.fn().mockResolvedValue(null)}),uuid(1),'2026-11-06')).toBeNull();
  const detail={...b(1),citations:[],snippets:[],summaries:[],analysts:[]};
  const ratingHistory=vi.fn().mockResolvedValue([{report_id:uuid(1),security_ticker:'600000.SH',target_currency:'CNY'},{report_id:uuid(7),security_ticker:'600000.SH',target_currency:'USD'}]);
  const data=(await reportPageData(deps({publicReport:vi.fn().mockResolvedValue(detail),ratingHistory,publicReports:vi.fn().mockResolvedValue([b(1)])}),uuid(1),'2026-11-06'))!;
  expect(ratingHistory).toHaveBeenCalledWith({securityTicker:'600000.SH',institutionId:uuid(901),currency:'CNY',limit:200});
  expect(data.history.map(h=>h.reportId)).toEqual([uuid(1)]);
  expect(data.spread).toHaveLength(1);expect(data.focusTargetKey).toBe('600000.SH');
 });
 it('institutionPageData is null for an institution that is not public',async()=>{
  const db={publicInstitutions:vi.fn().mockResolvedValue([{institution_id:uuid(901),name_en:'Inst 1'}]),publicReports:vi.fn().mockResolvedValue([b(1),b(2,{ticker:'AAPL'})])};
  expect(await institutionPageData(deps(db),uuid(999))).toBeNull();
  expect(await institutionPageData(deps(db),uuid(901))).toMatchObject({securities:2,lastPublishedDate:'2026-10-01',truncated:false});
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/broker-research/public-read.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 7: 实现 `public-read.ts`**

```ts
// src/lib/broker-research/public-read.ts
// Public read loaders shared by the /api/broker-research/* routes and the /intel/foreign-research
// server pages (spec §8.1, §9.2–9.3). Anon client over the §4.11 views only; whitelist DTOs from
// public-dto.ts; ticker → issuer via resolveIssuer by today's ownership (HK included — unlike the
// facts layer there is no market restriction); opaque base64url cursors; rating history and the
// cross-institution spread (same security + currency, newest report per institution, 12 months).
import {getAnonSupabase} from '../supabase/anon';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {resolveIssuer} from '../entities/resolve';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {supabaseBrokerResearchDb} from './db';
import type {BrokerResearchDb,NormalizedRating,PublicReportBundle,ReportScope} from './types';
import {notNull,toPublicHistoryRow,toPublicInstitution,toPublicReport,toPublicReportDetail} from './public-dto';
import type {PublicHistoryRowDto,PublicInstitutionDto,PublicInstitutionRef,PublicReportDetailDto,PublicReportDto,PublicTargetDto} from './public-dto';

export const LIST_DEFAULT_LIMIT=50,LIST_MAX_LIMIT=200,BY_TICKER_DEFAULT_LIMIT=5,BY_TICKER_MAX_LIMIT=20;
export const HISTORY_DEFAULT_LIMIT=50,HISTORY_MAX_LIMIT=200,SPREAD_WINDOW_MONTHS=12,STATS_MAX_PAGES=10;

export interface PublicReadDeps{db:BrokerResearchDb;tables:TableClient}
export function anonPublicDeps():PublicReadDeps{const sb=getAnonSupabase();return {db:supabaseBrokerResearchDb(sb),tables:supabaseTableClient(sb)};}

export interface ReportCursor{publishedDate:string;reportId:string}
const CURSOR_RE=/^(\d{4}-\d{2}-\d{2})\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const encodeCursor=(c:ReportCursor)=>Buffer.from(`${c.publishedDate}|${c.reportId}`,'utf8').toString('base64url');
export function decodeCursor(s:string):ReportCursor|null{
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(s))return null;
 const m=CURSOR_RE.exec(Buffer.from(s,'base64url').toString('utf8'));
 return m?{publishedDate:m[1],reportId:m[2].toLowerCase()}:null;
}
const cursorOf=(b:PublicReportBundle):string|null=>{
 const d=b.report.published_date,id=b.report.report_id;
 return typeof d==='string'&&typeof id==='string'?encodeCursor({publishedDate:d.slice(0,10),reportId:id}):null;
};

export interface ListQuery{institutionId?:string;issuerId?:string;rating?:NormalizedRating;scope?:ReportScope;from?:string;to?:string;limit:number;cursor?:ReportCursor;summaryOnly?:boolean}
export interface ReportPage{reports:PublicReportDto[];nextCursor:string|null;count:number}
/** One view page. summaryOnly filters after paging, so a page may hold fewer than `limit` rows; nextCursor follows the last FETCHED row. */
export async function listPublicReports(deps:PublicReadDeps,q:ListQuery):Promise<ReportPage>{
 const bundles=await deps.db.publicReports({institutionId:q.institutionId,issuerId:q.issuerId,rating:q.rating,scope:q.scope,from:q.from,to:q.to,limit:q.limit,cursor:q.cursor});
 const last=bundles.at(-1);
 let reports=bundles.map(x=>toPublicReport(x)).filter(notNull);
 if(q.summaryOnly)reports=reports.filter(r=>r.hasSummary.zh||r.hasSummary.en);
 return {reports,nextCursor:bundles.length>=q.limit&&last?cursorOf(last):null,count:reports.length};
}

export interface LibraryTotals{reports:number;institutions:number;lastAvailableAt:string|null;truncated:boolean}
export async function libraryStats(deps:PublicReadDeps):Promise<{totals:LibraryTotals;byInstitution:Map<string,{count:number;lastPublishedDate:string|null}>}>{
 const by=new Map<string,{count:number;lastPublishedDate:string|null}>();
 let reports=0,last:string|null=null,cursor:ReportCursor|undefined,truncated=false;
 for(let page=0;;page++){
  if(page===STATS_MAX_PAGES){truncated=true;break;}
  const res=await listPublicReports(deps,{limit:LIST_MAX_LIMIT,cursor});
  for(const r of res.reports){
   reports++;
   if(r.availableAt&&(last===null||r.availableAt>last))last=r.availableAt;
   if(!r.institution)continue;
   const s=by.get(r.institution.id)??{count:0,lastPublishedDate:null};
   s.count++;if(r.publishedDate&&(s.lastPublishedDate===null||r.publishedDate>s.lastPublishedDate))s.lastPublishedDate=r.publishedDate;
   by.set(r.institution.id,s);
  }
  const next=res.nextCursor?decodeCursor(res.nextCursor):null;
  if(!next)break;cursor=next;
 }
 return {totals:{reports,institutions:by.size,lastAvailableAt:last,truncated},byInstitution:by};
}

export interface PublicInstitutionListDto extends PublicInstitutionDto{reportCount:number;lastPublishedDate:string|null}
export async function listPublicInstitutions(deps:PublicReadDeps):Promise<{institutions:PublicInstitutionListDto[];totals:LibraryTotals}>{
 const [rows,stats]=await Promise.all([deps.db.publicInstitutions(),libraryStats(deps)]);
 const institutions=rows.map(r=>toPublicInstitution(r)).filter(notNull)
  .map(i=>({...i,reportCount:stats.byInstitution.get(i.id)?.count??0,lastPublishedDate:stats.byInstitution.get(i.id)?.lastPublishedDate??null}))
  .sort((a,b)=>b.reportCount-a.reportCount||a.nameEn.localeCompare(b.nameEn));
 return {institutions,totals:{...stats.totals,institutions:institutions.length}};
}

/** Universe ticker → issuer (today's owner) and the security row the caller meant (exact, then normalised, then primary). */
export async function resolveTicker(tables:TableClient,raw:string,today:string):Promise<{issuerId:string;securityTicker:string}|null>{
 const given=raw.trim().toUpperCase().replace(/\//g,'.');
 const r=await resolveIssuer(tables,{ticker:given},{today});
 if(!r)return null;
 const core=inferCoreMarket(given),norm=core?normalizeSecurityTicker(given,core):null;
 const sec=r.securities.find(s=>s.ticker.toUpperCase()===given)??(norm?r.securities.find(s=>s.ticker.toUpperCase()===norm):undefined)??r.securities.find(s=>s.is_primary)??r.securities[0];
 return {issuerId:r.issuer_id,securityTicker:sec?.ticker??norm??given};
}

export async function getPublicReport(deps:PublicReadDeps,reportId:string):Promise<PublicReportDetailDto|null>{
 const d=await deps.db.publicReport(reportId);return d?toPublicReportDetail(d):null;
}
export async function publicHistory(deps:PublicReadDeps,q:{securityTicker:string;institutionId?:string;currency?:string;limit:number}):Promise<PublicHistoryRowDto[]>{
 return (await deps.db.ratingHistory(q)).map(r=>toPublicHistoryRow(r)).filter(notNull);
}

export function monthsBefore(today:string,months:number):string{
 const d=new Date(`${today}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()-months);return d.toISOString().slice(0,10);
}
export const currencyOf=(t:PublicTargetDto):string|null=>t.target?.currency??t.priceAtReport?.currency??null;
export const focusTarget=(r:PublicReportDto):PublicTargetDto|null=>r.targets.find(t=>t.targetKey===r.primaryTargetKey)??r.targets[0]??null;
const newestFirst=(a:PublicReportDto,b:PublicReportDto)=>(b.publishedDate??'').localeCompare(a.publishedDate??'')||b.reportId.localeCompare(a.reportId);

export interface PublicSpreadRowDto{reportId:string;institution:PublicInstitutionRef;publishedDate:string|null;rating:{raw:string|null;normalized:NormalizedRating|null};targetPricePublic:boolean;target:{price:string;currency:string|null}|null;priceAtReport:{value:string;currency:string|null}|null;upsidePct:string|null}
export async function publicSpread(deps:PublicReadDeps,q:{issuerId:string;securityTicker:string;currency:string|null;today:string;windowMonths?:number}):Promise<PublicSpreadRowDto[]>{
 const page=await listPublicReports(deps,{issuerId:q.issuerId,from:monthsBefore(q.today,q.windowMonths??SPREAD_WINDOW_MONTHS),limit:LIST_MAX_LIMIT});
 const latest=new Map<string,PublicSpreadRowDto>();
 for(const r of [...page.reports].sort(newestFirst)){
  if(!r.institution||latest.has(r.institution.id))continue;
  const t=r.targets.find(x=>x.securityTicker===q.securityTicker&&currencyOf(x)===q.currency);
  if(!t)continue;
  latest.set(r.institution.id,{reportId:r.reportId,institution:r.institution,publishedDate:r.publishedDate,rating:{raw:t.rating.raw,normalized:t.rating.normalized},targetPricePublic:r.targetPricePublic,
   target:t.target?{price:t.target.price,currency:t.target.currency}:null,priceAtReport:t.priceAtReport?{value:t.priceAtReport.value,currency:t.priceAtReport.currency}:null,upsidePct:t.upsidePct});
 }
 return [...latest.values()];
}

export interface ReportPageData{report:PublicReportDetailDto;history:PublicHistoryRowDto[];spread:PublicSpreadRowDto[];focusTargetKey:string|null}
export async function reportPageData(deps:PublicReadDeps,reportId:string,today:string):Promise<ReportPageData|null>{
 const report=await getPublicReport(deps,reportId);if(!report)return null;
 const t=focusTarget(report);
 if(!t||!t.securityTicker)return {report,history:[],spread:[],focusTargetKey:t?.targetKey??null};
 const sec=t.securityTicker,histCurrency=t.target?.currency??null;
 const [history,spread]=await Promise.all([
  report.institution?publicHistory(deps,{securityTicker:sec,institutionId:report.institution.id,currency:histCurrency??undefined,limit:HISTORY_MAX_LIMIT}):Promise.resolve([] as PublicHistoryRowDto[]),
  t.issuerId?publicSpread(deps,{issuerId:t.issuerId,securityTicker:sec,currency:currencyOf(t),today}):Promise.resolve([] as PublicSpreadRowDto[]),
 ]);
 return {report,history:history.filter(h=>h.targetCurrency===histCurrency),spread,focusTargetKey:t.targetKey};
}

export interface InstitutionPageData{institution:PublicInstitutionDto;reports:PublicReportDto[];securities:number;lastPublishedDate:string|null;truncated:boolean}
export async function institutionPageData(deps:PublicReadDeps,institutionId:string):Promise<InstitutionPageData|null>{
 const institution=(await deps.db.publicInstitutions()).map(r=>toPublicInstitution(r)).filter(notNull).find(i=>i.id===institutionId);
 if(!institution)return null;
 const page=await listPublicReports(deps,{institutionId,limit:LIST_MAX_LIMIT});
 const securities=new Set(page.reports.flatMap(r=>r.targets.map(t=>t.securityTicker??t.tickerAsStated)));
 const dates=page.reports.map(r=>r.publishedDate).filter(notNull).sort();
 return {institution,reports:page.reports,securities:securities.size,lastPublishedDate:dates.at(-1)??null,truncated:page.nextCursor!==null};
}
```

- [ ] **Step 8: 运行加载器测试，确认通过**

Run: `npm test -- src/lib/broker-research/public-read.test.ts`
Expected: PASS

- [ ] **Step 9: 写路由的失败测试**

```ts
// src/app/api/broker-research/routes.test.ts
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({db:{publicReports:vi.fn(),publicReport:vi.fn(),publicInstitutions:vi.fn(),ratingHistory:vi.fn()},resolveIssuer:vi.fn()}));
vi.mock('@/lib/broker-research/public-read',async(orig)=>({...await orig<typeof import('@/lib/broker-research/public-read')>(),anonPublicDeps:()=>({db:mocks.db,tables:{}})}));
vi.mock('@/lib/entities/resolve',async(orig)=>({...await orig<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolveIssuer}));

import {GET as listGET} from './reports/route';
import {GET as detailGET} from './reports/[reportId]/route';
import {GET as instGET} from './institutions/route';
import {GET as histGET} from './history/route';
import {GET as tickerGET} from './by-ticker/[ticker]/route';

const RID='11111111-1111-4111-8111-111111111111';
const req=(path:string)=>new Request(`http://localhost/api/broker-research${path}`);
const bundle=(n=1)=>({report:{report_id:`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,title:'T',published_date:'2026-10-01',target_price_public:true,snippet_max_chars:50,summary_public:true},targets:[],hasSummary:{zh:false,en:false},snippetCount:0,institution:null});
async function expectError(res:Response,status:number,code:string){
 expect(res.status).toBe(status);expect(res.headers.get('Cache-Control')).toBe('no-store');expect((await res.json()).error.code).toBe(code);
}
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(console,'error').mockImplementation(()=>{});for(const f of Object.values(mocks.db))f.mockResolvedValue([]);mocks.db.publicReport.mockResolvedValue(null);});

describe('route modules',()=>{
 it('all five are force-dynamic',()=>{
  for(const rel of ['reports/route.ts','reports/[reportId]/route.ts','institutions/route.ts','history/route.ts','by-ticker/[ticker]/route.ts'])
   expect(readFileSync(join(process.cwd(),'src/app/api/broker-research',rel),'utf8'),rel).toMatch(/export const dynamic='force-dynamic'/);
 });
});

describe('GET /reports',()=>{
 it('400 on bad parameters, before any read',async()=>{
  for(const [qs,code] of [['?institution=x','institution'],['?rating=strong_buy','rating'],['?scope=x','scope'],['?from=2026-13-01','from'],['?from=2026-10-02&to=2026-10-01','to'],['?limit=0','limit'],['?limit=201','limit'],['?cursor=%21','cursor'],['?summary=yes','summary'],['?rating=buy&rating=sell','rating'],['?ticker=a%20b','ticker']])
   await expectError(await listGET(req(`/reports${qs}`)),400,`invalid_parameter:${code}`);
  expect(mocks.db.publicReports).not.toHaveBeenCalled();
 });
 it('404 not_found when the unfiltered library is empty (also what anon sees with the switch off); 200 [] when filtered',async()=>{
  await expectError(await listGET(req('/reports')),404,'not_found');
  await expectError(await listGET(req('/reports?limit=10')),404,'not_found');
  const res=await listGET(req('/reports?rating=buy'));
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(await res.json()).toEqual({reports:[],nextCursor:null,count:0});
 });
 it('ticker: 404 unknown_ticker, 409 ambiguous_ticker, else filters by issuer',async()=>{
  mocks.resolveIssuer.mockResolvedValueOnce(null);
  await expectError(await listGET(req('/reports?ticker=ZZZZ')),404,'unknown_ticker');
  mocks.resolveIssuer.mockRejectedValueOnce(new Error('ambiguous_owner'));
  await expectError(await listGET(req('/reports?ticker=AAPL')),409,'ambiguous_ticker');
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-9',securities:[{ticker:'AAPL',is_primary:true}]});
  mocks.db.publicReports.mockResolvedValue([bundle()]);
  const res=await listGET(req('/reports?ticker=aapl&limit=1'));
  expect(res.status).toBe(200);
  expect(mocks.db.publicReports).toHaveBeenCalledWith(expect.objectContaining({issuerId:'iss-9',limit:1}));
  expect((await res.json()).nextCursor).toEqual(expect.any(String));
 });
 it('500 internal with no-store when the view read fails',async()=>{
  mocks.db.publicReports.mockRejectedValue(new Error('boom'));
  await expectError(await listGET(req('/reports')),500,'internal');
 });
});

describe('GET /reports/[reportId]',()=>{
 const call=(id:string)=>detailGET(req(`/reports/${id}`),{params:Promise.resolve({reportId:id})});
 it('400 / 404 / 200 flat whitelisted body',async()=>{
  await expectError(await call('nope'),400,'invalid_parameter:reportId');
  await expectError(await call(RID),404,'not_found');
  mocks.db.publicReport.mockResolvedValue({...bundle(),citations:[],snippets:[],summaries:[],analysts:[]});
  const res=await call(RID);
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');
  const body=await res.json();expect(body.settlement).toBeNull();expect(body.licence).toEqual({snippetMaxChars:50,targetPricePublic:true,summaryPublic:true});
 });
});

describe('GET /institutions',()=>{
 it('404 when none are public, 200 with totals otherwise',async()=>{
  await expectError(await instGET(req('/institutions')),404,'not_found');
  mocks.db.publicInstitutions.mockResolvedValue([{institution_id:'22222222-2222-4222-8222-222222222222',name_en:'Inst'}]);
  const res=await instGET(req('/institutions'));
  expect(res.status).toBe(200);expect((await res.json()).totals).toMatchObject({institutions:1,reports:0});
 });
});

describe('GET /history',()=>{
 it('validates, resolves the ticker, 404 when empty',async()=>{
  await expectError(await histGET(req('/history')),400,'invalid_parameter:ticker');
  await expectError(await histGET(req('/history?ticker=AAPL&currency=usd')),400,'invalid_parameter:currency');
  mocks.resolveIssuer.mockResolvedValueOnce(null);
  await expectError(await histGET(req('/history?ticker=ZZZZ')),404,'unknown_ticker');
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-9',securities:[{ticker:'AAPL',is_primary:true}]});
  await expectError(await histGET(req('/history?ticker=AAPL')),404,'not_found');
  mocks.db.ratingHistory.mockResolvedValue([{report_id:RID,security_ticker:'AAPL'}]);
  const res=await histGET(req('/history?ticker=AAPL&currency=USD&limit=10'));
  expect(res.status).toBe(200);
  expect(mocks.db.ratingHistory).toHaveBeenCalledWith({securityTicker:'AAPL',institutionId:undefined,currency:'USD',limit:10});
  expect((await res.json()).count).toBe(1);
 });
});

describe('GET /by-ticker/[ticker]',()=>{
 const call=(t:string,qs='')=>tickerGET(req(`/by-ticker/${t}${qs}`),{params:Promise.resolve({ticker:t})});
 it('defaults to 5, 404 when nothing is public for the issuer',async()=>{
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-9',securities:[{ticker:'600000.SH',is_primary:true}]});
  await expectError(await call('600000.SH'),404,'not_found');
  expect(mocks.db.publicReports).toHaveBeenCalledWith(expect.objectContaining({issuerId:'iss-9',limit:5}));
  await expectError(await call('600000.SH','?limit=21'),400,'invalid_parameter:limit');
  mocks.db.publicReports.mockResolvedValue([bundle()]);
  const res=await call('600000.SH');
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ticker:'600000.SH',issuerId:'iss-9',count:1});
 });
});
```

- [ ] **Step 10: 运行，确认失败**

Run: `npm test -- src/app/api/broker-research/routes.test.ts`
Expected: FAIL（路由模块不存在）

- [ ] **Step 11: 实现五条路由**

```ts
// src/app/api/broker-research/reports/route.ts
// GET /api/broker-research/reports (spec §8.1): anon views only, whitelist DTO, no-store. An
// unfiltered empty library is 404 not_found (anon cannot tell "switch off" from "empty" — by design);
// a filtered empty page is 200 []. ticker resolves through resolveIssuer (404 unknown_ticker).
import {NextResponse} from 'next/server';
import {QueryError,TICKER_RE,UUID_RE,dateParam,errorResponse,failureResponse,flagParam,intParam,paramErrorResponse,readParams,utcDate} from '@/lib/facts/public-route';
import {LIST_DEFAULT_LIMIT,LIST_MAX_LIMIT,anonPublicDeps,decodeCursor,listPublicReports,resolveTicker} from '@/lib/broker-research/public-read';
import type {ListQuery} from '@/lib/broker-research/public-read';
import {PUBLIC_RATINGS,PUBLIC_SCOPES} from '@/lib/broker-research/public-dto';
import type {NormalizedRating,ReportScope} from '@/lib/broker-research/types';

export const dynamic='force-dynamic';
const PARAMS=['institution','ticker','rating','scope','from','to','limit','cursor','summary'] as const;

export async function GET(req:Request){
 const today=utcDate(new Date());
 let q:ListQuery,ticker:string|undefined,filtered:boolean;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const institution=p.get('institution');if(institution!==undefined&&!UUID_RE.test(institution))throw new QueryError('institution');
  ticker=p.get('ticker');if(ticker!==undefined&&!TICKER_RE.test(ticker))throw new QueryError('ticker');
  const rating=p.get('rating');if(rating!==undefined&&!(PUBLIC_RATINGS as readonly string[]).includes(rating))throw new QueryError('rating');
  const scope=p.get('scope');if(scope!==undefined&&!(PUBLIC_SCOPES as readonly string[]).includes(scope))throw new QueryError('scope');
  const from=dateParam(p,'from'),to=dateParam(p,'to');if(from!==undefined&&to!==undefined&&from>to)throw new QueryError('to');
  const c=p.get('cursor'),cursor=c===undefined?undefined:decodeCursor(c);if(cursor===null)throw new QueryError('cursor');
  const limit=intParam(p,'limit',LIST_DEFAULT_LIMIT,LIST_MAX_LIMIT);
  q={institutionId:institution?.toLowerCase(),rating:rating as NormalizedRating|undefined,scope:scope as ReportScope|undefined,from,to,limit,cursor,summaryOnly:flagParam(p,'summary')};
  filtered=[...p.keys()].some(k=>k!=='limit');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=anonPublicDeps();
  if(ticker!==undefined){
   const t=await resolveTicker(deps.tables,ticker,today);
   if(!t)return errorResponse('unknown_ticker','no issuer for ticker',404);
   q.issuerId=t.issuerId;
  }
  const page=await listPublicReports(deps,q);
  if(!filtered&&page.reports.length===0)return errorResponse('not_found','no public reports',404);
  return NextResponse.json(page,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/reports','reports unavailable');}
}
```

```ts
// src/app/api/broker-research/reports/[reportId]/route.ts
// GET /api/broker-research/reports/[reportId] (spec §8.1): one public report with citations, snippets,
// summaries, public analysts, licence flags and settlement (null until F4). Not public → 404.
import {NextResponse} from 'next/server';
import {UUID_RE,errorResponse,failureResponse} from '@/lib/facts/public-route';
import {anonPublicDeps,getPublicReport} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!UUID_RE.test(reportId))return errorResponse('invalid_parameter:reportId','invalid reportId',400);
 try{
  const report=await getPublicReport(anonPublicDeps(),reportId.toLowerCase());
  if(!report)return errorResponse('not_found','report not found',404);
  return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/report','report unavailable');}
}
```

```ts
// src/app/api/broker-research/institutions/route.ts
// GET /api/broker-research/institutions (spec §8.1): institutions with at least one visible report,
// per-institution counts and library totals (computed by paging the reports view; ≤ 10 pages, then
// totals.truncated=true). None → 404 not_found.
import {NextResponse} from 'next/server';
import {errorResponse,failureResponse} from '@/lib/facts/public-route';
import {anonPublicDeps,listPublicInstitutions} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const body=await listPublicInstitutions(anonPublicDeps());
  if(body.institutions.length===0)return errorResponse('not_found','no public institutions',404);
  return NextResponse.json(body,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/institutions','institutions unavailable');}
}
```

```ts
// src/app/api/broker-research/history/route.ts
// GET /api/broker-research/history (spec §8.1): broker_rating_history_v rows for one security
// (ticker required, resolved like the list route), optional institution and currency. Empty → 404.
import {NextResponse} from 'next/server';
import {QueryError,TICKER_RE,UUID_RE,errorResponse,failureResponse,intParam,paramErrorResponse,readParams,utcDate} from '@/lib/facts/public-route';
import {HISTORY_DEFAULT_LIMIT,HISTORY_MAX_LIMIT,anonPublicDeps,publicHistory,resolveTicker} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';
const PARAMS=['ticker','institution','currency','limit'] as const;

export async function GET(req:Request){
 const today=utcDate(new Date());
 let ticker:string,institutionId:string|undefined,currency:string|undefined,limit:number;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const t=p.get('ticker');if(t===undefined||!TICKER_RE.test(t))throw new QueryError('ticker');ticker=t;
  institutionId=p.get('institution');if(institutionId!==undefined&&!UUID_RE.test(institutionId))throw new QueryError('institution');
  currency=p.get('currency');if(currency!==undefined&&!/^[A-Z]{3}$/.test(currency))throw new QueryError('currency');
  limit=intParam(p,'limit',HISTORY_DEFAULT_LIMIT,HISTORY_MAX_LIMIT);
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=anonPublicDeps();
  const sec=await resolveTicker(deps.tables,ticker,today);
  if(!sec)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const rows=await publicHistory(deps,{securityTicker:sec.securityTicker,institutionId:institutionId?.toLowerCase(),currency,limit});
  if(rows.length===0)return errorResponse('not_found','no public history',404);
  return NextResponse.json({ticker:sec.securityTicker,rows,count:rows.length},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/history','history unavailable');}
}
```

```ts
// src/app/api/broker-research/by-ticker/[ticker]/route.ts
// GET /api/broker-research/by-ticker/[ticker] (spec §8.1, §9.4): the newest public reports whose
// targets resolve to the ticker's issuer (default 5, max 20) for the /stock "馆藏研报（n）" block.
// Nothing public → 404 (the block hides itself).
import {NextResponse} from 'next/server';
import {TICKER_RE,decodeTicker,errorResponse,failureResponse,intParam,paramErrorResponse,readParams,utcDate} from '@/lib/facts/public-route';
import {BY_TICKER_DEFAULT_LIMIT,BY_TICKER_MAX_LIMIT,anonPublicDeps,listPublicReports,resolveTicker} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const today=utcDate(new Date());
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let limit:number;
 try{limit=intParam(readParams(new URL(req.url),['limit']),'limit',BY_TICKER_DEFAULT_LIMIT,BY_TICKER_MAX_LIMIT);}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=anonPublicDeps();
  const sec=await resolveTicker(deps.tables,ticker,today);
  if(!sec)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const page=await listPublicReports(deps,{issuerId:sec.issuerId,limit});
  if(page.reports.length===0)return errorResponse('not_found','no public reports for ticker',404);
  return NextResponse.json({ticker:sec.securityTicker,issuerId:sec.issuerId,reports:page.reports,count:page.count},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/by-ticker','reports unavailable');}
}
```

- [ ] **Step 12: 运行全部 D1 测试 + 类型检查 + lint**

Run: `npm test -- src/lib/broker-research/public-dto.test.ts src/lib/broker-research/public-read.test.ts src/app/api/broker-research/routes.test.ts && npm run typecheck && npm run lint`
Expected: PASS；typecheck / lint 无输出错误

- [ ] **Step 13: 实施记录 + 提交**

在 `docs/audits/2026-11-06-foreign-research/10-implementation-log.md` 追加一行：`D1 | public-dto 白名单 + public-read + 5 条公开路由 | 偏差：列表无筛选空 → 404；targets 多 publicationId、报告多 primaryTargetKey`。

```bash
git add src/lib/broker-research/public-dto.ts src/lib/broker-research/public-dto.test.ts src/lib/broker-research/public-read.ts src/lib/broker-research/public-read.test.ts src/app/api/broker-research docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): public DTO whitelist, public read loaders and routes (D1)"
```

---
### Task D2: i18n 域 + 公开列表 / 详情 / 机构页 + 图表组件

**Files:**
- Create: `messages/zh/foreign-research.json`、`messages/en/foreign-research.json`
- Modify: `src/i18n/request.ts`（`MESSAGE_DOMAINS` 末尾 `// FOREIGN ↓ … ↑` 围栏内追加 `'foreign-research'`）
- Create: `src/app/(app)/intel/foreign-research/messages-parity.test.ts`
- Create: `src/app/(app)/intel/foreign-research/components/ui.ts`
- Create: `src/app/(app)/intel/foreign-research/components/format.ts`、`format.test.ts`
- Create: `src/app/(app)/intel/foreign-research/components/list-query.ts`、`list-query.test.ts`
- Create: `src/app/(app)/intel/foreign-research/components/RatingBadge.tsx`、`TargetValue.tsx`、`ReportsTable.tsx`、`ListClient.tsx`、`ReportView.tsx`、`FactsSection.tsx`、`SourceDrawer.tsx`、`SummarySection.tsx`、`SnippetsSection.tsx`、`HistoryBlock.tsx`、`SpreadBlock.tsx`、`SettlementCallout.tsx`、`InstitutionView.tsx`、`NotFoundCallout.tsx`
- Create: `src/app/(app)/intel/foreign-research/components/components.test.ts`
- Create: `src/app/(app)/intel/foreign-research/page.tsx`、`[reportId]/page.tsx`、`[reportId]/not-found.tsx`、`institutions/[institutionId]/page.tsx`、`institutions/[institutionId]/not-found.tsx`
- Create: `src/app/(app)/intel/foreign-research/pages.test.ts`

设计要点：
- 画板 → 实现映射：Main / ListStates / M-List（列表）、Detail / Drawer / M-Detail / Charts（详情）、Institution（机构）、Bilingual（文案）。画板的 `.card/.chip/.src/.callout` 等类是画布私有的；实现只用 `globals.css` tokens 经 Tailwind 颜色名（`bg-bg-card`、`border-border`、`text-text-dim`、`text-accent`…），类串集中在 `components/ui.ts`。三级文字色用既有 `text-text-muted`（画布 `#8b8b94` 偏差待 owner）。黄铜唯一强调色；评级徽标中性。
- **F4 标注**（F4 规格 §12.3 与 §3 表"监控 / 外资研报"行）：评级、目标价、空间、历史、分歧在 F4 登记前一律带"第三方判断（未结算）"标签，不以事实样式展示；报告时价格与方法论参数标"第三方假设 · 文件所载"。因此事实区标题改为"报告所载 Stated in report"（画板为"事实"），记入 §17 偏差。
- 页面：列表是服务端壳 + 客户端 `ListClient`（筛选、分页、加载 / 空 / 无结果 / 失败重试四态，失败**不回退 mock**）；详情与机构页是服务端组件，直接调 `public-read.ts` 加载器（anon 客户端），不存在 / 不公开 → `notFound()`。三页都 `export const dynamic='force-dynamic'`（`(app)` 布局读 cookies；见 `src/app/(app)/dynamic-rendering.test.ts` 的说明）。
- 共享组件全部是客户端组件（`'use client'`，`useTranslations('foreign-research.*')`），只接受可序列化 DTO 属性，因此 D5 预览页能用 service-role 数据渲染**同一组件**。
- 移动端：表格 `< sm` 改卡片（M-List）；事实区 `< sm` 改两列行（M-Detail）；来源抽屉 `< sm` 为底部抽屉、`≥ sm` 为右侧抽屉；历史 `< 640px` 默认表格视图、不渲染轨迹图（M-Detail 注）。
- 图表：内联 SVG + 表格切换；坐标几何在纯函数 `format.ts::stepChart/spreadChart` 里（用 `Number` 只为画图坐标；显示数值一律是 DTO 的十进制字符串，空间与变化率用 BigInt 定标计算，不经浮点）。
- 示例数值不进代码：测试夹具用明显合成值（`Synthetic Securities`、`600000.SH`、`10`）。
- 摘要正文按纯文本段落渲染（不渲染 Markdown HTML，杜绝注入）；画板里摘要数字可点开 → 需要 DTO 带落地断言，规格 §8.1 未列，本期不做（契约修订建议 3）。

- [ ] **Step 1: 写纯函数的失败测试**

```ts
// src/app/(app)/intel/foreign-research/components/format.test.ts
import {describe,expect,it} from 'vitest';
import {citationFor,displayTitle,fmtNum,fmtPct,groupSnippets,groupThousands,provenanceKey,relChange,shortId,spreadChart,stepChart} from './format';
import type {PublicCitationDto,PublicSnippetDto} from '@/lib/broker-research/public-dto';

const cit=(o:Partial<PublicCitationDto>):PublicCitationDto=>({targetKey:'600000.SH',field:'target_price',occurrence:1,page:1,valueText:'10',valueNum:'10',valueCurrency:'CNY',valueUnit:'price',valueDate:null,status:'confirmed',extractorKind:'llm',...o});

describe('numbers',()=>{
 it('groups thousands on the digits, keeps the decimals verbatim',()=>{
  expect(groupThousands('1234567.890')).toBe('1,234,567.890');expect(groupThousands('-1234')).toBe('−1,234');expect(groupThousands('12')).toBe('12');
  expect(fmtNum(null)).toBe('—');
 });
 it('formats fractions as percent with one decimal, half away from zero, without floats',()=>{
  expect(fmtPct('0.3487',{signed:true})).toBe('+34.9%');expect(fmtPct('-0.093',{signed:true})).toBe('−9.3%');
  expect(fmtPct('0.00049',{signed:true})).toBe('0.0%');expect(fmtPct('0.082')).toBe('8.2%');expect(fmtPct('1.5',{signed:true})).toBe('+150.0%');
  expect(fmtPct('0.34850')).toBe('34.9%');expect(fmtPct(null)).toBe('—');expect(fmtPct('abc')).toBe('—');
 });
 it('relative change in fixed point',()=>{
  expect(relChange('20','21')).toBe('0.050000');expect(relChange('3','2')).toBe('-0.333334');expect(relChange('0','1')).toBeNull();expect(relChange(null,'1')).toBeNull();
 });
 it('shortId',()=>{expect(shortId('11111111-2222-4333-8444-555555555555')).toBe('1111…5555');});
});

describe('titles, provenance, lookup',()=>{
 it('uses the locale translation only when it is marked as one',()=>{
  const title={text:'Original',isRewritten:true,zh:'译名',en:null,isTranslation:true};
  expect(displayTitle(title,'zh')).toEqual({text:'译名',translated:true,rewritten:false});
  expect(displayTitle(title,'en')).toEqual({text:'Original',translated:false,rewritten:true});
  expect(displayTitle({...title,isTranslation:false},'zh')).toEqual({text:'Original',translated:false,rewritten:true});
 });
 it('derives the provenance label from extractor kind and status',()=>{
  expect(provenanceKey(cit({}))).toBe('llmConfirmed');expect(provenanceKey(cit({status:'corrected'}))).toBe('llmCorrected');
  expect(provenanceKey(cit({extractorKind:'human'}))).toBe('humanAdded');expect(provenanceKey(cit({status:'absent',extractorKind:'human'}))).toBe('absent');
  expect(provenanceKey(cit({extractorKind:null}))).toBe('unknown');
 });
 it('citationFor picks the lowest occurrence for the target and field',()=>{
  const list=[cit({occurrence:2,page:5}),cit({occurrence:1,page:3}),cit({targetKey:'AAPL',page:9})];
  expect(citationFor(list,'600000.SH','target_price')?.page).toBe(3);expect(citationFor(list,'600000.SH','wacc')).toBeNull();
 });
 it('groups snippets by purpose in fixed order',()=>{
  const s=(id:string,purpose:PublicSnippetDto['purpose']):PublicSnippetDto=>({snippetId:id,targetKey:null,purpose,page:1,text:id});
  expect(groupSnippets([s('a','risk'),s('b','rating'),s('c','risk')]).map(([p,l])=>[p,l.map(x=>x.snippetId)])).toEqual([['rating',['b']],['risk',['a','c']]]);
 });
});

describe('charts',()=>{
 const box={width:1000,height:200,left:60,right:20,top:20,bottom:30};
 it('step chart: one dot per priced report, H/V path, ticks',()=>{
  const c=stepChart([{date:'2026-01-01',value:'10',label:'buy',reportId:'a'},{date:'2026-07-01',value:null,label:'neutral',reportId:'b'},{date:'2026-12-31',value:'12',label:'buy',reportId:'c'}],box)!;
  expect(c.dots.map(d=>d.reportId)).toEqual(['a','c']);
  expect(c.path).toMatch(/^M60 \d+(\.\d)? H980 V\d+(\.\d)?$/);
  expect(c.dots[0].cy).toBeGreaterThan(c.dots[1].cy);                     // higher price → higher on screen
  expect(c.yTicks).toHaveLength(3);expect(c.xTicks.map(x=>x.label)).toEqual(['2026-01','2026-12']);
  expect(stepChart([{date:'2026-01-01',value:null,label:'',reportId:'a'}],box)).toBeNull();
 });
 it('spread chart: shared x scale, missing target stays null',()=>{
  const c=spreadChart([{key:'a',priceAtReport:'8',target:'10'},{key:'b',priceAtReport:'9',target:null}],box,40)!;
  expect(c.rows[0].targetX).toBeGreaterThan(c.rows[0].priceX!);expect(c.rows[1].targetX).toBeNull();expect(c.rows[1].y).toBeGreaterThan(c.rows[0].y);
  expect(spreadChart([{key:'a',priceAtReport:null,target:null}],box,40)).toBeNull();
 });
});
```

```ts
// src/app/(app)/intel/foreign-research/components/list-query.test.ts
import {describe,expect,it} from 'vitest';
import {apiQuery,classifyListResponse,filtersToParams,isFiltered,parseListFilters} from './list-query';

const res=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

describe('list query',()=>{
 it('round-trips filters and drops empties',()=>{
  const f=parseListFilters(new URLSearchParams('ticker=%20AAPL%20&rating=buy&summary=1&junk=1'));
  expect(f).toEqual({ticker:' AAPL ',institution:'',rating:'buy',from:'',to:'',summary:true});
  expect(filtersToParams(f).toString()).toBe('ticker=AAPL&rating=buy&summary=1');
  expect(isFiltered(parseListFilters(new URLSearchParams('')))).toBe(false);
  expect(apiQuery(f,'CUR',50)).toBe('ticker=AAPL&rating=buy&summary=1&limit=50&cursor=CUR');
 });
 it('classifies responses into the four list states',async()=>{
  expect(await classifyListResponse(res(404,{error:{code:'not_found'}}),false,false)).toEqual({kind:'empty'});
  expect(await classifyListResponse(res(404,{error:{code:'unknown_ticker'}}),true,false)).toEqual({kind:'noResults',unknownTicker:true});
  expect(await classifyListResponse(res(200,{reports:[],nextCursor:null,count:0}),true,false)).toEqual({kind:'noResults',unknownTicker:false});
  expect((await classifyListResponse(res(200,{reports:[],nextCursor:null,count:0}),false,true)).kind).toBe('ok');   // past the last full page
  expect(await classifyListResponse(res(500,{}),false,false)).toEqual({kind:'error'});
  expect(await classifyListResponse(res(200,{nope:1}),false,false)).toEqual({kind:'error'});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- "src/app/(app)/intel/foreign-research/components/format.test.ts" "src/app/(app)/intel/foreign-research/components/list-query.test.ts"`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `ui.ts`、`format.ts`、`list-query.ts`**

```ts
// src/app/(app)/intel/foreign-research/components/ui.ts
// Class strings for the foreign-research pages (public and admin). Only globals.css tokens through the
// Tailwind colour names; Tailwind 3 cannot alpha-modify var() colours, so washes use color-mix like
// src/components/ui/variants.ts. Brass is the only accent; rating chips are neutral (spec §9 约定).
export const CARD='rounded-lg border border-border bg-bg-card p-4';
export const CARD_FLUSH='rounded-lg border border-border bg-bg-card';
export const CHIP='inline-flex items-center whitespace-nowrap rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-dim';
export const CHIP_ACCENT='inline-flex items-center whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] px-1.5 py-0.5 text-[11px] text-accent';
export const CHIP_WARN='inline-flex items-center whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] px-1.5 py-0.5 text-[11px] text-warn';
export const CHIP_DANGER='inline-flex items-center whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] px-1.5 py-0.5 text-[11px] text-danger';
export const TAG='inline-flex items-center whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-[10px] leading-tight text-text-dim';
export const SRC_BTN='font-mono tabular-nums text-text underline decoration-dotted decoration-[color-mix(in_srgb,var(--accent)_60%,transparent)] underline-offset-4 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
export const CALLOUT='rounded-md border border-border bg-bg-elevated p-6 text-sm text-text-dim';
export const ERROR_BAR='flex items-center gap-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-xs text-danger';
export const SEG='inline-flex flex-wrap rounded-md border border-border p-0.5';
export const segBtn=(on:boolean)=>`min-h-8 rounded px-2.5 text-xs ${on?'bg-[var(--accent-wash)] text-accent':'text-text-dim hover:text-text'}`;
export const BTN='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 text-xs text-text hover:border-[var(--border-active)] disabled:pointer-events-none disabled:opacity-40';
export const BTN_PRIMARY='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-bg hover:bg-accent-dim disabled:pointer-events-none disabled:opacity-40';
export const BTN_GHOST='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs text-text-dim hover:bg-[var(--accent-wash)] hover:text-text disabled:pointer-events-none disabled:opacity-40';
export const INPUT='min-h-9 w-full rounded-md border border-border bg-bg-card px-2.5 text-sm text-text';
export const FIELD_LABEL='mb-1.5 block text-xs font-medium text-text-dim';
export const TH='whitespace-nowrap px-2 py-2 text-left text-[11px] font-medium text-text-dim';
export const TD='px-2 py-2 align-top';
export const H1='text-xl font-semibold tracking-tight sm:text-2xl';
export const H2='text-base font-semibold';
export const H3='text-sm font-semibold';
export const EN='ml-2 text-xs font-normal text-text-muted';
export const MICRO='text-[11px] text-text-dim';
export const TINY='text-[11px] text-text-muted';
export const SKELETON='h-5 animate-pulse rounded bg-bg-elevated';
export const DOT=(tone:'ok'|'warn'|'err')=>`inline-block h-2 w-2 shrink-0 rounded-full ${tone==='ok'?'bg-text-dim':tone==='warn'?'bg-warn':'bg-danger'}`;
```

```ts
// src/app/(app)/intel/foreign-research/components/format.ts
// Pure display helpers for the foreign-research pages (no React; unit-tested in node). Values arrive
// as decimal strings from the DTO; percentages and changes are computed on scaled BigInts, never on
// floats. Number() is used only for SVG coordinates and axis tick labels.
import type {FieldName,SnippetPurpose} from '@/lib/broker-research/types';
import type {PublicCitationDto,PublicReportDto,PublicSnippetDto,PublicTargetDto,PublicTitleDto} from '@/lib/broker-research/public-dto';

const DEC=/^-?\d+(?:\.\d+)?$/;
export const MINUS='−';
export function groupThousands(s:string):string{
 const neg=s.startsWith('-'),[i,f]=(neg?s.slice(1):s).split('.');
 return `${neg?MINUS:''}${i.replace(/\B(?=(\d{3})+(?!\d))/g,',')}${f!==undefined?`.${f}`:''}`;
}
export const fmtNum=(s:string|null|undefined)=>s===null||s===undefined||!DEC.test(s)?'—':groupThousands(s);
/** Fraction decimal string → percent with one decimal, rounded half away from zero ('0.3487' → '34.9%'). */
export function fmtPct(s:string|null|undefined,opts:{signed?:boolean}={}):string{
 if(s===null||s===undefined||!DEC.test(s))return '—';
 const neg=s.startsWith('-'),[i,f='']=(neg?s.slice(1):s).split('.');
 const n=BigInt(i+(f+'0000').slice(0,4));            // |v| × 10^4 (truncated past the 4th decimal)
 const tenths=n/10n+(n%10n>=5n?1n:0n);               // percent × 10, rounded on the 4th decimal
 const zero=tenths===0n,sign=zero?'':neg?MINUS:opts.signed?'+':'';
 return `${sign}${tenths/10n}.${tenths%10n}%`;
}
const SCALE=6,ONE=10n**BigInt(SCALE);
const scaled=(s:string)=>{const neg=s.startsWith('-'),[i,f='']=(neg?s.slice(1):s).split('.');const v=BigInt(i+(f+'0'.repeat(SCALE)).slice(0,SCALE));return neg?-v:v;};
const unscaled=(v:bigint)=>{const neg=v<0n,a=(neg?-v:v).toString().padStart(SCALE+1,'0');return `${neg?'-':''}${a.slice(0,-SCALE)}.${a.slice(-SCALE)}`;};
/** cur / prev − 1 as a 6-decimal fraction string (the ratio is truncated toward zero before subtracting 1); null when not computable. */
export function relChange(prev:string|null,cur:string|null):string|null{
 if(prev===null||cur===null||!DEC.test(prev)||!DEC.test(cur))return null;
 const p=scaled(prev);if(p===0n)return null;
 return unscaled(scaled(cur)*ONE/p-ONE);
}
export const shortId=(id:string|null|undefined)=>!id?'—':id.length<=10?id:`${id.slice(0,4)}…${id.slice(-4)}`;
export const fmtDay=(s:string|null|undefined)=>s?s.slice(0,10):'—';
export function fmtInstant(s:string|null|undefined,locale:string):string{
 if(!s)return '—';const d=new Date(s);if(Number.isNaN(d.getTime()))return '—';
 return d.toLocaleString(locale==='zh'?'zh-CN':'en-US',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
}

export const primaryTarget=(r:Pick<PublicReportDto,'targets'|'primaryTargetKey'>):PublicTargetDto|null=>r.targets.find(t=>t.targetKey===r.primaryTargetKey)??r.targets[0]??null;
export function displayTitle(t:PublicTitleDto,locale:string):{text:string;translated:boolean;rewritten:boolean}{
 const tr=locale==='zh'?t.zh:locale==='en'?t.en:null;
 return t.isTranslation&&tr?{text:tr,translated:true,rewritten:false}:{text:t.text,translated:false,rewritten:t.isRewritten};
}
export type ProvenanceKey='llmConfirmed'|'llmCorrected'|'humanAdded'|'absent'|'unknown';
export function provenanceKey(c:PublicCitationDto):ProvenanceKey{
 if(c.status==='absent')return 'absent';
 if(c.extractorKind==='llm')return c.status==='corrected'?'llmCorrected':'llmConfirmed';
 return c.extractorKind==='human'?'humanAdded':'unknown';
}
export function citationFor(list:PublicCitationDto[],targetKey:string|null,field:FieldName):PublicCitationDto|null{
 return list.filter(c=>c.targetKey===targetKey&&c.field===field).sort((a,b)=>a.occurrence-b.occurrence)[0]??null;
}
export const SNIPPET_PURPOSE_FOR_FIELD:Partial<Record<FieldName,SnippetPurpose>>={rating:'rating',target_price:'target',target_currency:'target',target_horizon:'target',upside_stated:'target',wacc:'method',terminal_growth:'method',terminal_value_share:'method',valuation_method:'method'};
const PURPOSE_ORDER:SnippetPurpose[]=['rating','target','thesis','risk','method','other'];
export function groupSnippets(list:PublicSnippetDto[]):[SnippetPurpose,PublicSnippetDto[]][]{
 return PURPOSE_ORDER.map(p=>[p,list.filter(s=>s.purpose===p)] as [SnippetPurpose,PublicSnippetDto[]]).filter(([,l])=>l.length>0);
}

export interface ChartBox{width:number;height:number;left:number;right:number;top:number;bottom:number}
export interface StepPoint{date:string;value:string|null;label:string;reportId:string}
export interface StepChart{path:string;dots:{cx:number;cy:number;label:string;date:string;value:string;reportId:string}[];yTicks:{y:number;label:string}[];xTicks:{x:number;label:string}[]}
const r1=(n:number)=>Math.round(n*10)/10;
const tick=(v:number)=>Math.abs(v)>=100?groupThousands(String(Math.round(v))):v.toFixed(2);
/** Step line of target prices: flat between reports, vertical at each new report (Detail/Charts artboards). */
export function stepChart(points:StepPoint[],box:ChartBox):StepChart|null{
 const pts=points.filter((p):p is StepPoint&{value:string}=>p.value!==null&&DEC.test(p.value)).sort((a,b)=>a.date.localeCompare(b.date)||a.reportId.localeCompare(b.reportId));
 if(pts.length===0)return null;
 const ts=pts.map(p=>Date.parse(`${p.date}T00:00:00Z`)),vs=pts.map(p=>Number(p.value));
 const tMin=Math.min(...ts),tMax=Math.max(...ts),vMin=Math.min(...vs),vMax=Math.max(...vs);
 const pad=vMax>vMin?(vMax-vMin)*0.15:Math.max(Math.abs(vMax)*0.1,1);
 const lo=vMin-pad,hi=vMax+pad,iw=box.width-box.left-box.right,ih=box.height-box.top-box.bottom;
 const x=(t:number)=>r1(tMax===tMin?box.left+iw/2:box.left+(t-tMin)/(tMax-tMin)*iw);
 const y=(v:number)=>r1(box.top+(hi-v)/(hi-lo)*ih);
 const dots=pts.map((p,i)=>({cx:x(ts[i]),cy:y(vs[i]),label:p.label,date:p.date,value:p.value,reportId:p.reportId}));
 const path=dots.map((d,i)=>i===0?`M${d.cx} ${d.cy}`:`H${d.cx} V${d.cy}`).join(' ');
 const yTicks=(vMax>vMin?[vMax,(vMax+vMin)/2,vMin]:[vMax]).map(v=>({y:y(v),label:tick(v)}));
 const idx=dots.length>2?[0,Math.floor((dots.length-1)/2),dots.length-1]:dots.length===2?[0,1]:[0];
 return {path,dots,yTicks,xTicks:idx.map(i=>({x:dots[i].cx,label:dots[i].date.slice(0,7)}))};
}
export interface SpreadPoint{key:string;priceAtReport:string|null;target:string|null}
export function spreadChart(rows:SpreadPoint[],box:ChartBox,rowHeight:number){
 const num=(v:string|null)=>v!==null&&DEC.test(v)?Number(v):null;
 const vals=rows.flatMap(r=>[num(r.priceAtReport),num(r.target)]).filter((v):v is number=>v!==null);
 if(vals.length===0)return null;
 const min=Math.min(...vals),max=Math.max(...vals),pad=max>min?(max-min)*0.1:Math.max(Math.abs(max)*0.1,1);
 const lo=min-pad,hi=max+pad,iw=box.width-box.left-box.right;
 const x=(v:number)=>r1(box.left+(v-lo)/(hi-lo)*iw);
 return {
  rows:rows.map((r,i)=>{const p=num(r.priceAtReport),t=num(r.target);return {key:r.key,y:r1(box.top+rowHeight*(i+0.5)),priceX:p===null?null:x(p),targetX:t===null?null:x(t)};}),
  ticks:[{x:x(min),label:tick(min)},{x:x(max),label:tick(max)}],height:box.top+rowHeight*rows.length+box.bottom,
 };
}
```

```ts
// src/app/(app)/intel/foreign-research/components/list-query.ts
// URL ⇄ filter state for the public list, and the mapping of /api/broker-research/reports responses
// to the four list states of spec §9.2 (normal / empty library / no results / load failed — the
// failure state never falls back to mock data).
import type {ReportPage} from '@/lib/broker-research/public-read';

export interface ListFilters{ticker:string;institution:string;rating:string;from:string;to:string;summary:boolean}
export const EMPTY_FILTERS:ListFilters={ticker:'',institution:'',rating:'',from:'',to:'',summary:false};
export function parseListFilters(sp:URLSearchParams):ListFilters{
 return {ticker:sp.get('ticker')??'',institution:sp.get('institution')??'',rating:sp.get('rating')??'',from:sp.get('from')??'',to:sp.get('to')??'',summary:sp.get('summary')==='1'};
}
export function filtersToParams(f:ListFilters):URLSearchParams{
 const p=new URLSearchParams();
 if(f.ticker.trim())p.set('ticker',f.ticker.trim());
 for(const k of ['institution','rating','from','to'] as const)if(f[k])p.set(k,f[k]);
 if(f.summary)p.set('summary','1');
 return p;
}
export const isFiltered=(f:ListFilters)=>filtersToParams(f).toString()!=='';
export function apiQuery(f:ListFilters,cursor:string|null,limit:number):string{
 const p=filtersToParams(f);p.set('limit',String(limit));if(cursor)p.set('cursor',cursor);return p.toString();
}
export type ListOutcome={kind:'ok';page:ReportPage}|{kind:'empty'}|{kind:'noResults';unknownTicker:boolean}|{kind:'error'};
export async function classifyListResponse(res:Response,filtered:boolean,paging:boolean):Promise<ListOutcome>{
 if(res.status===404){
  const body=await res.json().catch(()=>null) as {error?:{code?:string}}|null;
  if(body?.error?.code==='unknown_ticker')return {kind:'noResults',unknownTicker:true};
  return filtered?{kind:'noResults',unknownTicker:false}:{kind:'empty'};
 }
 if(!res.ok)return {kind:'error'};
 const page=await res.json().catch(()=>null) as ReportPage|null;
 if(!page||!Array.isArray(page.reports))return {kind:'error'};
 if(page.reports.length===0&&!paging)return filtered?{kind:'noResults',unknownTicker:false}:{kind:'empty'};
 return {kind:'ok',page};
}
```

- [ ] **Step 4: 运行纯函数测试，确认通过**

Run: `npm test -- "src/app/(app)/intel/foreign-research/components/format.test.ts" "src/app/(app)/intel/foreign-research/components/list-query.test.ts"`
Expected: PASS

- [ ] **Step 5: 实现展示组件（全部 `'use client'`，只收 DTO 属性）**

```tsx
// src/app/(app)/intel/foreign-research/components/RatingBadge.tsx
'use client';
// Neutral normalized-rating chip (spec §9 约定: no red/green for ratings).
import {useTranslations} from 'next-intl';
import type {NormalizedRating} from '@/lib/broker-research/types';
import {CHIP} from './ui';

export function RatingBadge({value}:{value:NormalizedRating|null}){
 const t=useTranslations('foreign-research.rating');
 return <span className={CHIP}>{t(value??'unmapped')}</span>;
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/TargetValue.tsx
'use client';
// Target price cell: "not public under licence" vs "report gives none" are different states (spec §9.2).
import {useTranslations} from 'next-intl';
import {fmtNum} from './format';
import {SRC_BTN} from './ui';

export function TargetValue({target,targetPricePublic,onOpen,currencyFirst}:{target:{price:string;currency:string|null}|null;targetPricePublic:boolean;onOpen?:()=>void;currencyFirst?:boolean}){
 const t=useTranslations('foreign-research.public');
 if(!targetPricePublic)return <span className="text-text-muted">{t('target.notPublic')}</span>;
 if(!target)return <span className="text-text-muted">{t('target.absent')}</span>;
 const cur=target.currency??'';
 const text=(currencyFirst?`${cur} ${fmtNum(target.price)}`:`${fmtNum(target.price)} ${cur}`).trim();
 return onOpen?<button type="button" onClick={onOpen} className={SRC_BTN}>{text}</button>:<span className="font-mono tabular-nums">{text}</span>;
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/ReportsTable.tsx
'use client';
// Report list: table at ≥ sm (Main artboard), stacked cards below sm (M-List artboard).
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {PublicReportDto} from '@/lib/broker-research/public-dto';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {displayTitle,fmtPct,primaryTarget} from './format';
import {CHIP,TAG,TD,TH} from './ui';

export const reportHref=(id:string)=>`/intel/foreign-research/${id}`;
export const institutionHref=(id:string)=>`/intel/foreign-research/institutions/${id}`;

export function ReportsTable({reports,hideInstitution}:{reports:PublicReportDto[];hideInstitution?:boolean}){
 const t=useTranslations('foreign-research.public');
 const locale=useLocale();
 const rows=reports.map(r=>({r,pt:primaryTarget(r),title:displayTitle(r.title,locale),summary:r.hasSummary.zh||r.hasSummary.en}));
 const tags=(x:{translated:boolean;rewritten:boolean})=><>
  {x.translated?<span className={`${TAG} ml-1.5`}>{t('title.translated')}</span>:null}
  {x.rewritten?<span className={`${TAG} ml-1.5`}>{t('title.rewritten')}</span>:null}
 </>;
 return (<>
  <div className="hidden overflow-x-auto sm:block">
   <table className="w-full min-w-[880px] text-sm">
    <thead className="border-b border-border"><tr>
     {hideInstitution?null:<th scope="col" className={`${TH} pl-4`}>{t('list.columns.institution')}</th>}
     <th scope="col" className={`${TH} ${hideInstitution?'pl-4':''}`}>{t('list.columns.security')}</th>
     <th scope="col" className={TH}>{t('list.columns.title')}</th>
     <th scope="col" className={TH}>{t('list.columns.published')}</th>
     <th scope="col" className={TH}>{t('list.columns.rating')}</th>
     <th scope="col" className={`${TH} text-right`}>{t('list.columns.target')}</th>
     <th scope="col" className={`${TH} text-right`}>{t('list.columns.upside')}</th>
     <th scope="col" className={`${TH} pr-4`}>{t('list.columns.summary')}</th>
    </tr></thead>
    <tbody className="divide-y divide-border">
     {rows.map(({r,pt,title,summary})=>(
      <tr key={r.reportId} className="hover:bg-bg-elevated">
       {hideInstitution?null:<td className={`${TD} pl-4`}>{r.institution?<Link href={institutionHref(r.institution.id)} title={r.institution.nameZh??undefined} className="text-text hover:text-accent">{r.institution.nameEn}</Link>:<span className="text-text-muted">—</span>}</td>}
       <td className={`${TD} whitespace-nowrap ${hideInstitution?'pl-4':''}`}>{pt?<><span className="font-mono">{pt.securityTicker??pt.tickerAsStated}</span>{r.targets.length>1?<span className="ml-1 text-[11px] text-text-muted">+{r.targets.length-1}</span>:null}</>:<span className="text-text-muted">—</span>}</td>
       <td className={`${TD} max-w-[360px]`}><Link href={reportHref(r.reportId)} className="text-text hover:text-accent">{title.text}</Link>{tags(title)}</td>
       <td className={`${TD} whitespace-nowrap font-mono text-text-dim`}>{r.publishedDate??'—'}</td>
       <td className={`${TD} whitespace-nowrap`}>{pt?<><span className="mr-1.5 text-xs text-text-dim">{pt.rating.raw??'—'}</span><RatingBadge value={pt.rating.normalized}/></>:'—'}</td>
       <td className={`${TD} whitespace-nowrap text-right`}>{pt?<TargetValue target={pt.target} targetPricePublic={r.targetPricePublic} currencyFirst/>:'—'}</td>
       <td className={`${TD} whitespace-nowrap text-right font-mono text-text-dim`}>{pt&&r.targetPricePublic?fmtPct(pt.upsidePct,{signed:true}):'—'}</td>
       <td className={`${TD} pr-4`}>{summary?<span className={CHIP}>{t('list.hasSummary')}</span>:<span className="text-text-muted">—</span>}</td>
      </tr>
     ))}
    </tbody>
   </table>
  </div>
  <ul className="divide-y divide-border sm:hidden">
   {rows.map(({r,pt,title,summary})=>(
    <li key={r.reportId}>
     <Link href={reportHref(r.reportId)} className="flex flex-col gap-1.5 px-4 py-3 text-text hover:bg-bg-elevated hover:no-underline">
      <div className="flex items-center gap-2 text-xs"><span className="text-text-dim">{hideInstitution?'':r.institution?.nameEn??'—'}</span><span className="ml-auto font-mono text-text-muted">{r.publishedDate??'—'}</span></div>
      <div className="font-semibold">{title.text}{tags(title)}</div>
      {pt?<div className="flex flex-wrap items-center gap-2 text-xs"><span className={`${CHIP} font-mono`}>{pt.securityTicker??pt.tickerAsStated}</span><span className="text-text-dim">{pt.rating.raw??'—'}</span><RatingBadge value={pt.rating.normalized}/></div>:null}
      <div className="flex flex-wrap items-center gap-2 text-xs">
       {pt?<TargetValue target={pt.target} targetPricePublic={r.targetPricePublic} currencyFirst/>:null}
       {pt&&r.targetPricePublic&&pt.upsidePct?<span className="text-text-muted">{t('list.upsideDerived',{value:fmtPct(pt.upsidePct,{signed:true})})}</span>:null}
       {summary?<span className={`${CHIP} ml-auto`}>{t('list.summaryShort')}</span>:null}
      </div>
     </Link>
    </li>
   ))}
  </ul>
 </>);
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/NotFoundCallout.tsx
'use client';
// One 404 wording for withdrawn / unpublished / switch off (ListStates artboard: never reveal which).
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {BTN,CALLOUT} from './ui';

export function NotFoundCallout({kind}:{kind:'report'|'institution'}){
 const t=useTranslations('foreign-research.public.notFound');
 return (
  <section className={`${CALLOUT} mx-auto mt-8 flex max-w-xl flex-col items-start gap-3`}>
   <h1 className="text-lg font-semibold text-text">{t(`${kind}.title`)}</h1>
   <p>{t(`${kind}.body`)}</p>
   <Link href="/intel/foreign-research" className={BTN}>{t('back')}</Link>
  </section>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/ListClient.tsx
'use client';
// Public list (spec §9.2; Main, ListStates, M-List artboards): filter bar in the URL, cursor paging,
// library totals from /institutions, and the four states. A failed load shows an error bar with retry
// and never falls back to sample data.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {PUBLIC_RATINGS} from '@/lib/broker-research/public-dto';
import type {LibraryTotals,PublicInstitutionListDto} from '@/lib/broker-research/public-read';
import {ReportsTable} from './ReportsTable';
import {apiQuery,classifyListResponse,EMPTY_FILTERS,filtersToParams,parseListFilters} from './list-query';
import type {ListFilters,ListOutcome} from './list-query';
import {BTN,BTN_PRIMARY,CALLOUT,CARD,CARD_FLUSH,CHIP_ACCENT,EN,ERROR_BAR,FIELD_LABEL,H1,INPUT,SEG,SKELETON,TINY,segBtn} from './ui';

const PAGE_SIZE=50;
interface InstitutionsJson{institutions:PublicInstitutionListDto[];totals:LibraryTotals}

export function ListClient(){
 const t=useTranslations('foreign-research.public');
 const tr=useTranslations('foreign-research.rating');
 const router=useRouter(),pathname=usePathname(),sp=useSearchParams();
 const key=filtersToParams(parseListFilters(new URLSearchParams(sp.toString()))).toString();
 const filters=parseListFilters(new URLSearchParams(key));
 const [draft,setDraft]=useState<ListFilters>(filters);
 const [cursors,setCursors]=useState<string[]>([]);
 const [outcome,setOutcome]=useState<ListOutcome|null>(null);
 const [stats,setStats]=useState<InstitutionsJson|null>(null);
 const [tick,setTick]=useState(0);
 const cursor=cursors.at(-1)??null;

 useEffect(()=>{setDraft(parseListFilters(new URLSearchParams(key)));setCursors([]);},[key]);
 useEffect(()=>{
  const ctrl=new AbortController();setOutcome(null);
  fetch(`/api/broker-research/reports?${apiQuery(parseListFilters(new URLSearchParams(key)),cursor,PAGE_SIZE)}`,{cache:'no-store',signal:ctrl.signal})
   .then(r=>classifyListResponse(r,key!=='',cursor!==null)).then(setOutcome)
   .catch(e=>{if(!(e instanceof Error&&e.name==='AbortError'))setOutcome({kind:'error'});});
  return ()=>ctrl.abort();
 },[key,cursor,tick]);
 useEffect(()=>{
  const ctrl=new AbortController();
  fetch('/api/broker-research/institutions',{cache:'no-store',signal:ctrl.signal})
   .then(r=>r.ok?r.json() as Promise<InstitutionsJson>:null).then(setStats).catch(()=>{});
  return ()=>ctrl.abort();
 },[tick]);

 const apply=(f:ListFilters)=>{const qs=filtersToParams(f).toString();router.replace(qs?`${pathname}?${qs}`:pathname);};
 const totals=stats?.totals;
 const activeChips:[keyof ListFilters,string][]=[];
 if(filters.ticker)activeChips.push(['ticker',`${t('list.filters.security')}：${filters.ticker}`]);
 if(filters.institution)activeChips.push(['institution',`${t('list.filters.institution')}：${stats?.institutions.find(i=>i.id===filters.institution)?.nameEn??filters.institution}`]);
 if(filters.rating)activeChips.push(['rating',`${t('list.filters.rating')}：${tr(filters.rating)}`]);
 if(filters.from||filters.to)activeChips.push(['from',`${t('list.filters.published')}：${filters.from||'…'} → ${filters.to||'…'}`]);
 if(filters.summary)activeChips.push(['summary',t('list.filters.summaryOnly')]);

 return (
  <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
   <nav className={TINY}><Link href="/intel">{t('breadcrumb.research')}</Link> / {t('breadcrumb.list')}</nav>
   <header className="flex flex-wrap items-end gap-5">
    <div>
     <h1 className={H1}>{t('list.title')}<span className={EN}>{t('list.titleEn')}</span></h1>
     <p className="mt-1.5 max-w-[70ch] text-xs text-text-dim">{t('list.intro')}</p>
    </div>
    <dl className="ml-auto flex gap-5">
     {([['reports',totals?`${totals.truncated?'≥':''}${totals.reports}`:'—'],['institutions',totals?String(totals.institutions):'—'],['lastAdded',totals?.lastAvailableAt?totals.lastAvailableAt.slice(0,10):'—']] as const).map(([k,v])=>(
      <div key={k}><dt className="text-[11px] text-text-dim">{t(`list.stats.${k}`)}</dt><dd className="font-mono text-xl tabular-nums">{v}</dd></div>
     ))}
    </dl>
   </header>

   <form className={`${CARD} flex flex-wrap items-end gap-3`} onSubmit={e=>{e.preventDefault();apply(draft);}}>
    <div className="w-full sm:w-56"><label htmlFor="fr-ticker" className={FIELD_LABEL}>{t('list.filters.security')}</label>
     <input id="fr-ticker" className={INPUT} value={draft.ticker} placeholder={t('list.filters.securityPlaceholder')} onChange={e=>setDraft({...draft,ticker:e.target.value})}/></div>
    <div className="w-full sm:w-56"><label htmlFor="fr-inst" className={FIELD_LABEL}>{t('list.filters.institution')}</label>
     <select id="fr-inst" className={INPUT} value={draft.institution} onChange={e=>{const f={...draft,institution:e.target.value};setDraft(f);apply(f);}}>
      <option value="">{t('list.filters.all')}</option>
      {(stats?.institutions??[]).map(i=><option key={i.id} value={i.id}>{i.nameEn}</option>)}
     </select></div>
    <div><span className={FIELD_LABEL}>{t('list.filters.rating')}</span>
     <div className={SEG} role="group" aria-label={t('list.filters.rating')}>
      {['',...PUBLIC_RATINGS].map(r=><button key={r||'all'} type="button" aria-pressed={draft.rating===r} className={segBtn(draft.rating===r)} onClick={()=>{const f={...draft,rating:r};setDraft(f);apply(f);}}>{r?tr(r):t('list.filters.all')}</button>)}
     </div></div>
    <div><span className={FIELD_LABEL}>{t('list.filters.published')}</span>
     <div className="flex items-center gap-1.5">
      <input type="date" aria-label={t('list.filters.from')} className={`${INPUT} w-40 font-mono`} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/>
      <span className="text-text-muted">→</span>
      <input type="date" aria-label={t('list.filters.to')} className={`${INPUT} w-40 font-mono`} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/>
     </div></div>
    <label className="flex min-h-9 items-center gap-2 text-xs text-text-dim">
     <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={draft.summary} onChange={e=>{const f={...draft,summary:e.target.checked};setDraft(f);apply(f);}}/>{t('list.filters.summaryOnly')}
    </label>
    <div className="flex gap-2"><button type="submit" className={BTN_PRIMARY}>{t('list.filters.apply')}</button>{key?<button type="button" className={BTN} onClick={()=>apply(EMPTY_FILTERS)}>{t('list.filters.clear')}</button>:null}</div>
   </form>

   {activeChips.length?<div className="flex flex-wrap gap-2">{activeChips.map(([k,label])=>(
    <button key={k} type="button" className={CHIP_ACCENT} onClick={()=>apply({...filters,[k]:k==='summary'?false:'',...(k==='from'?{to:''}:{})})}>{label} ×</button>
   ))}</div>:null}

   {outcome===null?(
    <div className={`${CARD} flex flex-col gap-2`} aria-busy="true" aria-label={t('list.loading')}>{[100,92,96,88,94].map(w=><div key={w} className={SKELETON} style={{width:`${w}%`}}/>)}</div>
   ):outcome.kind==='error'?(
    <div role="alert" className={ERROR_BAR}><span>{t('list.error.body')}</span><button type="button" className={`${BTN} ml-auto`} onClick={()=>setTick(n=>n+1)}>{t('list.error.retry')}</button></div>
   ):outcome.kind==='empty'?(
    <section className={`${CALLOUT} flex flex-col gap-1.5`}><h2 className="text-sm font-semibold text-text">{t('list.empty.title')}</h2><p>{t('list.empty.body')}</p></section>
   ):outcome.kind==='noResults'?(
    <section className={`${CALLOUT} flex flex-col items-start gap-2.5`}><h2 className="text-sm font-semibold text-text">{outcome.unknownTicker?t('list.noResults.unknownTicker'):t('list.noResults.title')}</h2><button type="button" className={BTN} onClick={()=>apply(EMPTY_FILTERS)}>{t('list.noResults.clear')}</button></section>
   ):(
    <section className={CARD_FLUSH}>
     <ReportsTable reports={outcome.page.reports}/>
     <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
      <span className={TINY}>{t('list.upsideNote')}</span>
      <div className="ml-auto flex gap-2">
       <button type="button" className={BTN} disabled={cursors.length===0} onClick={()=>setCursors(c=>c.slice(0,-1))}>{t('list.prev')}</button>
       <button type="button" className={BTN} disabled={!outcome.page.nextCursor} onClick={()=>{const n=outcome.page.nextCursor;if(n)setCursors(c=>[...c,n]);}}>{t('list.next')}</button>
      </div>
     </div>
    </section>
   )}
  </div>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/SourceDrawer.tsx
'use client';
// Source drawer (spec §9.3; Drawer + M-Detail artboards): private library notice, page, extraction
// method, available_at, code version, publication snapshot id, optional public snippet. Right-side
// panel at ≥ sm, bottom sheet below. Escape and the close button dismiss it; focus moves to close.
import {useEffect,useRef} from 'react';
import type {ReactNode} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import type {PublicCitationDto,PublicSnippetDto} from '@/lib/broker-research/public-dto';
import {fmtInstant,provenanceKey,shortId} from './format';
import {CHIP,TAG,TINY} from './ui';

export interface DrawerSubject{label:string;targetKey:string|null;value:string;citation:PublicCitationDto|null;snippets:PublicSnippetDto[];judgment:boolean}
export function SourceDrawer({subject,availableAt,codeVersion,publicationId,onClose}:{subject:DrawerSubject|null;availableAt:string|null;codeVersion:string|null;publicationId:string|null;onClose:()=>void}){
 const t=useTranslations('foreign-research.public.drawer');
 const tp=useTranslations('foreign-research.public.provenance');
 const locale=useLocale();
 const closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!subject)return;
  closeRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
  window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);
 },[subject,onClose]);
 if(!subject)return null;
 const c=subject.citation;
 const rows:[string,ReactNode][]=[
  [t('page'),c?.page?<span className="font-mono">{t('pageValue',{page:c.page})}</span>:'—'],
  [t('method'),c?tp(provenanceKey(c)):'—'],
  [t('availableAt'),<span key="a" className="font-mono">{fmtInstant(availableAt,locale)}</span>],
  [t('codeVersion'),<span key="c" className="font-mono">{codeVersion??'—'}</span>],
  [t('publication'),<span key="p" className="font-mono text-text-dim" title={publicationId??undefined}>{shortId(publicationId)}</span>],
 ];
 return (
  <div className="fixed inset-0 z-50" role="presentation">
   <button type="button" aria-label={t('close')} tabIndex={-1} className="absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]" onClick={onClose}/>
   <aside role="dialog" aria-modal="true" aria-label={t('title',{field:subject.label})}
    className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-lg border border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0">
    <div className="mx-auto mt-2 h-1 w-10 rounded bg-border sm:hidden" aria-hidden="true"/>
    <div className="flex gap-2 border-b border-border p-4">
     <div className="min-w-0 flex-1">
      <div className={TINY}>{c?tp(provenanceKey(c)):t('derived')}</div>
      <div className="mt-1.5 text-sm font-semibold">{subject.label}{subject.targetKey?<span className="ml-1.5 font-mono text-text-dim">· {subject.targetKey}</span>:null}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums">{subject.value}</div>
      {subject.judgment?<span className={`${TAG} mt-2`}>{t('judgment')}</span>:null}
     </div>
     <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')} className="flex h-8 w-8 items-center justify-center rounded text-text-dim hover:bg-[var(--accent-wash)]">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
     </button>
    </div>
    <div className="flex flex-col gap-3.5 p-4">
     <div className={`${CHIP} self-start text-text`}>{t('privateLibrary')}</div>
     <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
      {rows.map(([k,v])=><div key={k} className="contents"><dt className="text-text-dim">{k}</dt><dd>{v}</dd></div>)}
     </dl>
     {subject.snippets.length?<div><div className="mb-1.5 text-[11px] text-text-dim">{t('snippet')}</div>
      {subject.snippets.map(s=><blockquote key={s.snippetId} className="mb-2 rounded-md border border-border px-3 py-2.5 text-xs text-text-dim">“{s.text}” <span className={TINY}>— p.{s.page??'—'}</span></blockquote>)}
     </div>:null}
    </div>
   </aside>
  </div>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/FactsSection.tsx
'use client';
// Per-target fact table (spec §9.3; Detail / M-Detail artboards). Rating, target and upside carry the
// F4 label "第三方判断（未结算）" (F4 spec §12.3: third-party judgments must not be styled as facts
// until registered); price-at-report and method parameters are "third-party assumptions · stated".
// Absent target → "report gives no target price"; method rows render only when the report states them.
import type {ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import type {FieldName} from '@/lib/broker-research/types';
import type {PublicCitationDto,PublicReportDetailDto,PublicSnippetDto,PublicTargetDto} from '@/lib/broker-research/public-dto';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import type {DrawerSubject} from './SourceDrawer';
import {SNIPPET_PURPOSE_FOR_FIELD,citationFor,fmtNum,fmtPct,provenanceKey} from './format';
import {CARD,CHIP,EN,H2,SRC_BTN,TAG,TD,TH,TINY} from './ui';

type Kind='judgment'|'assumption'|'derivedJudgment';
interface FactRow{key:string;label:string;value:ReactNode;kind:Kind;kindArg?:string;provenance:string}

export function FactsSection({report,target,onOpen}:{report:PublicReportDetailDto;target:PublicTargetDto;onOpen:(s:DrawerSubject)=>void}){
 const t=useTranslations('foreign-research.public.facts');
 const tf=useTranslations('foreign-research.fields');
 const tp=useTranslations('foreign-research.public.provenance');
 const cit=(f:FieldName)=>citationFor(report.citations,target.targetKey,f);
 const snips=(f:FieldName):PublicSnippetDto[]=>{const p=SNIPPET_PURPOSE_FOR_FIELD[f];return p?report.snippets.filter(s=>s.purpose===p&&(s.targetKey===null||s.targetKey===target.targetKey)):[];};
 const open=(f:FieldName,label:string,value:string,judgment:boolean)=>()=>onOpen({label,targetKey:target.targetKey,value,citation:cit(f),snippets:snips(f),judgment});
 const prov=(c:PublicCitationDto|null)=>c?`${c.page?t('page',{page:c.page})+' · ':''}${tp(provenanceKey(c))}`:'—';
 const absentTarget=cit('target_price')?.status==='absent';
 const rows:FactRow[]=[];
 const ratingText=target.rating.raw??'—';
 rows.push({key:'rating',label:t('rows.rating'),kind:'judgment',provenance:prov(cit('rating')),value:<span className="inline-flex flex-wrap items-center gap-1.5">
  {target.rating.raw?<button type="button" className={`${SRC_BTN} font-sans`} onClick={open('rating',t('rows.rating'),ratingText,true)}>{ratingText}</button>:'—'}<span className="text-text-muted">→</span><RatingBadge value={target.rating.normalized}/></span>});
 const tgtText=target.target?`${fmtNum(target.target.price)} ${target.target.currency??''}`.trim():'';
 rows.push({key:'target',label:t('rows.target'),kind:'judgment',provenance:prov(cit('target_price')),value:!report.targetPricePublic?<TargetValue target={null} targetPricePublic={false}/>:
  absentTarget||!target.target?<span className="text-text-muted">{t('absentTarget')}</span>:
  <span className="inline-flex flex-wrap items-center gap-1.5"><TargetValue target={target.target} targetPricePublic onOpen={open('target_price',t('rows.target'),tgtText,true)}/>{target.target.horizonMonths!==null?<span className="font-mono text-text-dim">· {t('months',{n:target.target.horizonMonths})}</span>:null}</span>});
 if(target.priceAtReport){const p=target.priceAtReport,text=`${fmtNum(p.value)} ${p.currency??''}`.trim();
  rows.push({key:'par',label:t('rows.priceAtReport'),kind:'assumption',provenance:prov(cit('price_at_report')),value:<span className="inline-flex flex-wrap items-center gap-1.5"><button type="button" className={SRC_BTN} onClick={open('price_at_report',t('rows.priceAtReport'),text,false)}>{text}</button>{p.asOf?<span className="font-mono text-text-dim">· {p.asOf}</span>:null}</span>});}
 if(report.targetPricePublic&&target.upsidePct!==null){const text=fmtPct(target.upsidePct,{signed:true});
  rows.push({key:'upside',label:t('rows.upside'),kind:'derivedJudgment',kindArg:target.upsideFormulaVersion??'—',provenance:t('upsideFormula'),value:<button type="button" className={SRC_BTN} onClick={()=>onOpen({label:t('rows.upside'),targetKey:target.targetKey,value:text,citation:null,snippets:[],judgment:true})}>{text}</button>});}
 const method=(['valuation_method','wacc','terminal_growth','terminal_value_share'] as const).map(f=>[f,cit(f)] as const).filter(([,c])=>c&&c.status!=='absent');
 if(method.length)rows.push({key:'method',label:t('rows.method'),kind:'assumption',provenance:method.map(([,c])=>c?.page?t('page',{page:c.page}):'').filter(Boolean).join(' · ')||'—',
  value:<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-text-dim">{method.map(([f,c])=>{const text=f==='valuation_method'?c!.valueText:fmtPct(c!.valueNum);
   return <span key={f}>{f==='valuation_method'?text:<>{tf(f)} <button type="button" className={SRC_BTN} onClick={open(f,tf(f),text,false)}>{text}</button></>}</span>;})}</span>});
 const kindLabel=(r:FactRow)=>r.kind==='judgment'?t('kind.judgment'):r.kind==='assumption'?t('kind.assumption'):t('kind.derivedJudgment',{version:r.kindArg??'—'});

 return (
  <section className={CARD} aria-label={t('title')}>
   <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2><span className={`${CHIP} font-mono`}>{target.securityTicker??target.tickerAsStated}</span><span className={`${TINY} sm:ml-auto`}>{t('hint')}</span></div>
   <div className="hidden overflow-x-auto sm:block">
    <table className="w-full text-sm">
     <thead className="border-b border-border"><tr><th scope="col" className={`${TH} pl-0`}>{t('columns.field')}</th><th scope="col" className={TH}>{t('columns.value')}</th><th scope="col" className={TH}>{t('columns.kind')}</th><th scope="col" className={TH}>{t('columns.provenance')}</th></tr></thead>
     <tbody className="divide-y divide-border">{rows.map(r=><tr key={r.key}><td className={`${TD} pl-0 text-text-dim`}>{r.label}</td><td className={TD}>{r.value}</td><td className={TD}><span className={TAG}>{kindLabel(r)}</span></td><td className={`${TD} ${TINY}`}>{r.provenance}</td></tr>)}</tbody>
    </table>
   </div>
   <dl className="flex flex-col gap-2.5 sm:hidden">{rows.map(r=><div key={r.key} className="flex items-start justify-between gap-3 text-sm"><dt className="text-xs text-text-dim">{r.label}<span className={`${TAG} ml-1.5`}>{kindLabel(r)}</span></dt><dd className="text-right">{r.value}</dd></div>)}</dl>
   <p className={`${TINY} mt-2.5`}>{t('noLatestPrice')}</p>
  </section>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/SummarySection.tsx
'use client';
// Independent summary (spec §9.3): fixed label "OsbornAlpha 独立摘要 · AI 生成（模型 id）· 非机构原文 ·
// 生成日期". The text is rendered as plain paragraphs (no Markdown HTML). Falls back to the other
// language with a note when only one exists.
import {useLocale,useTranslations} from 'next-intl';
import type {PublicReportDetailDto} from '@/lib/broker-research/public-dto';
import {CARD,EN,H2,TAG,TINY} from './ui';

export function SummarySection({summaries}:{summaries:PublicReportDetailDto['summaries']}){
 const t=useTranslations('foreign-research.public.summary');
 const locale=useLocale()==='en'?'en':'zh';
 const s=summaries[locale]??summaries[locale==='zh'?'en':'zh'];
 return (
  <section className={`${CARD} flex flex-col gap-2.5`} aria-label={t('title')}>
   <h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2>
   {!s?<p className="text-sm text-text-muted">{t('none')}</p>:<>
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><span className={TAG}>AI</span><span className="text-xs text-text">{t('label',{model:s.modelId??'—',date:s.generatedAt?s.generatedAt.slice(0,10):'—'})}</span></div>
    {s.lang!==locale?<p className={TINY}>{t('otherLanguage')}</p>:null}
    <div className="flex max-w-[72ch] flex-col gap-2 text-sm leading-relaxed" lang={s.lang==='zh'?'zh-CN':'en'}>{s.markdown.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div>
   </>}
  </section>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/SnippetsSection.tsx
'use client';
// Public snippets grouped by purpose (spec §9.3), each with its page.
import {useTranslations} from 'next-intl';
import type {PublicSnippetDto} from '@/lib/broker-research/public-dto';
import {groupSnippets} from './format';
import {CARD,EN,H2,TINY} from './ui';

export function SnippetsSection({snippets,maxChars}:{snippets:PublicSnippetDto[];maxChars:number|null}){
 const t=useTranslations('foreign-research.public.snippets');
 const groups=groupSnippets(snippets);
 return (
  <section className={`${CARD} flex flex-col gap-3`} aria-label={t('title')}>
   <h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn',{n:maxChars??'—'})}</span></h2>
   {groups.length===0?<p className="text-sm text-text-muted">{t('none')}</p>:groups.map(([p,list])=>(
    <div key={p}><div className="mb-1.5 text-[11px] text-text-dim">{t(`purpose.${p}`)}</div>
     {list.map(s=><blockquote key={s.snippetId} className="mb-2 rounded-md border border-border px-3.5 py-2.5 text-sm text-text-dim">“{s.text}” <span className={TINY}>— {t('page',{page:s.page??'—'})}</span></blockquote>)}
    </div>
   ))}
  </section>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/HistoryBlock.tsx
'use client';
// Rating & target-price history (spec §9.3; Detail, Charts, M-Detail artboards): same institution,
// security and currency; step-line SVG with a table toggle (the table holds both report ids,
// available_at and formula/code versions). Below 640 px the table is the default and the chart is not
// rendered. Values are third-party judgments (F4 label).
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import type {PublicHistoryRowDto} from '@/lib/broker-research/public-dto';
import {fmtDay,fmtNum,fmtPct,relChange,shortId,stepChart} from './format';
import {CARD,EN,H2,SEG,TAG,TD,TH,TINY,segBtn} from './ui';

const BOX={width:1300,height:220,left:64,right:24,top:30,bottom:30};
export function useNarrow(){const [n,setN]=useState(false);useEffect(()=>{setN(window.matchMedia('(max-width: 639px)').matches);},[]);return n;}

export function HistoryBlock({rows,institutionName,securityTicker,currency}:{rows:PublicHistoryRowDto[];institutionName:string;securityTicker:string;currency:string|null}){
 const t=useTranslations('foreign-research.public.history');
 const tr=useTranslations('foreign-research.rating');
 const narrow=useNarrow();
 const [view,setView]=useState<'chart'|'table'>('chart');
 useEffect(()=>{if(narrow)setView('table');},[narrow]);
 const sorted=[...rows].sort((a,b)=>(a.publishedDate??'').localeCompare(b.publishedDate??'')||a.reportId.localeCompare(b.reportId));
 const chart=stepChart(sorted.map(r=>({date:r.publishedDate??'',value:r.targetPrice,label:r.ratingNormalized?tr(r.ratingNormalized):'—',reportId:r.reportId})),BOX);
 const showChart=view==='chart'&&chart!==null&&!narrow;
 return (
  <section className={`${CARD} flex flex-col gap-3`} aria-label={t('title')}>
   <div className="flex flex-wrap items-center gap-2">
    <h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2>
    <span className={TINY}>{t('scope')}</span><span className={TAG}>{t('judgment')}</span>
    {chart&&!narrow?<div className={`${SEG} ml-auto`} role="group" aria-label={t('viewToggle')}>
     <button type="button" aria-pressed={view==='chart'} className={segBtn(view==='chart')} onClick={()=>setView('chart')}>{t('chart')}</button>
     <button type="button" aria-pressed={view==='table'} className={segBtn(view==='table')} onClick={()=>setView('table')}>{t('table')}</button>
    </div>:null}
   </div>
   {rows.length===0?<p className="text-sm text-text-muted">{t('none')}</p>:showChart&&chart?(<>
    <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} width="100%" role="img" aria-label={t('chartLabel',{institution:institutionName,ticker:securityTicker,n:chart.dots.length})}>
     <g stroke="var(--border)">{chart.yTicks.map(k=><line key={k.y} x1={BOX.left} y1={k.y} x2={BOX.width-BOX.right} y2={k.y}/>)}</g>
     <g fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">
      {chart.yTicks.map(k=><text key={k.y} x={BOX.left-8} y={k.y+4} textAnchor="end">{k.label}</text>)}
      {chart.xTicks.map(k=><text key={k.x} x={k.x} y={BOX.height-8} textAnchor="middle">{k.label}</text>)}
     </g>
     <path d={chart.path} fill="none" stroke="var(--accent)" strokeWidth="2"/>
     <g fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth="2">{chart.dots.map(d=><circle key={d.reportId} cx={d.cx} cy={d.cy} r="5"><title>{`${d.date} · ${d.label} · ${fmtNum(d.value)} ${currency??''}`}</title></circle>)}</g>
     <g fill="var(--text-dim)" fontSize="11">{chart.dots.map(d=><text key={d.reportId} x={d.cx} y={d.cy-12} textAnchor="middle">{d.label}</text>)}</g>
    </svg>
    <p className={TINY}>{t('stepNote')}</p>
   </>):(
    <div className="overflow-x-auto">
     <table className="w-full min-w-[720px] text-sm">
      <thead className="border-b border-border"><tr>{(['range','rating','target','change','reportIds','availableAt','versions'] as const).map(c=><th key={c} scope="col" className={`${TH} ${c==='target'||c==='change'?'text-right':''}`}>{t(`columns.${c}`,{currency:currency??'—'})}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{[...sorted].reverse().map(r=>{const ch=relChange(r.prevTargetPrice,r.targetPrice);return (
       <tr key={r.reportId}>
        <td className={`${TD} whitespace-nowrap font-mono`}>{r.prevPublishedDate?`${fmtDay(r.prevPublishedDate)} → `:''}{fmtDay(r.publishedDate)}</td>
        <td className={`${TD} whitespace-nowrap`}>{r.prevReportId?`${r.prevRatingNormalized?tr(r.prevRatingNormalized):'—'} → `:''}{r.ratingNormalized?tr(r.ratingNormalized):'—'}</td>
        <td className={`${TD} whitespace-nowrap text-right font-mono`}>{r.prevReportId?`${fmtNum(r.prevTargetPrice)} → `:''}{fmtNum(r.targetPrice)}</td>
        <td className={`${TD} whitespace-nowrap text-right font-mono text-text-dim`}>{ch===null?'—':fmtPct(ch,{signed:true})}</td>
        <td className={`${TD} whitespace-nowrap font-mono text-[11px] text-text-dim`}>{r.prevReportId?`${shortId(r.prevReportId)} → `:''}{shortId(r.reportId)}</td>
        <td className={`${TD} whitespace-nowrap font-mono text-[11px] text-text-dim`}>{r.prevAvailableAt?`${fmtDay(r.prevAvailableAt)} · `:''}{fmtDay(r.availableAt)}</td>
        <td className={`${TD} whitespace-nowrap font-mono text-[11px] text-text-dim`}>{r.upsideFormulaVersion??'—'} · {r.codeVersion??'—'}</td>
       </tr>);})}</tbody>
     </table>
    </div>
   )}
  </section>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/SpreadBlock.tsx
'use client';
// Cross-institution spread (spec §9.3; Detail, Charts artboards): same security and currency, newest
// report per institution within 12 months. Dot chart (price at report = hollow, target = brass) with a
// table toggle; no latest price; a hidden target is labelled, never estimated.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {PublicSpreadRowDto} from '@/lib/broker-research/public-read';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {reportHref} from './ReportsTable';
import {useNarrow} from './HistoryBlock';
import {fmtNum,fmtPct,shortId,spreadChart} from './format';
import {CARD,EN,H2,SEG,TAG,TD,TH,TINY,segBtn} from './ui';

const BOX={width:1340,height:0,left:200,right:40,top:20,bottom:30};
export function SpreadBlock({rows,securityTicker,currency,windowMonths}:{rows:PublicSpreadRowDto[];securityTicker:string;currency:string|null;windowMonths:number}){
 const t=useTranslations('foreign-research.public.spread');
 const narrow=useNarrow();
 const [view,setView]=useState<'chart'|'table'>('table');
 useEffect(()=>{if(narrow)setView('table');},[narrow]);
 const chart=spreadChart(rows.map(r=>({key:r.reportId,priceAtReport:r.priceAtReport?.value??null,target:r.target?.price??null})),BOX,60);
 return (
  <section className={`${CARD} flex flex-col gap-2.5`} aria-label={t('title')}>
   <div className="flex flex-wrap items-center gap-2">
    <h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2>
    <span className={TINY}>{t('scope',{ticker:securityTicker,currency:currency??'—',months:windowMonths})}</span><span className={TAG}>{t('judgment')}</span>
    {chart&&!narrow&&rows.length>0?<div className={`${SEG} ml-auto`} role="group" aria-label={t('viewToggle')}>
     <button type="button" aria-pressed={view==='chart'} className={segBtn(view==='chart')} onClick={()=>setView('chart')}>{t('chart')}</button>
     <button type="button" aria-pressed={view==='table'} className={segBtn(view==='table')} onClick={()=>setView('table')}>{t('table')}</button>
    </div>:null}
   </div>
   {rows.length===0?<p className="text-sm text-text-muted">{t('none')}</p>:view==='chart'&&chart&&!narrow?(<>
    <svg viewBox={`0 0 ${BOX.width} ${chart.height}`} width="100%" role="img" aria-label={t('chartLabel',{ticker:securityTicker,currency:currency??'—',n:rows.length})}>
     <g fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">{chart.ticks.map(k=><text key={k.x} x={k.x} y={chart.height-8} textAnchor="middle">{k.label}</text>)}</g>
     {chart.rows.map((c,i)=>{const r=rows[i];return (
      <g key={c.key}>
       <text x={BOX.left-16} y={c.y+4} textAnchor="end" fill="var(--text-dim)" fontSize="12">{r.institution.nameEn}</text>
       <line x1={BOX.left} y1={c.y} x2={BOX.width-BOX.right} y2={c.y} stroke="var(--border)"/>
       {c.priceX!==null?<circle cx={c.priceX} cy={c.y} r="5" fill="var(--bg-elevated)" stroke="var(--text-dim)" strokeWidth="2"><title>{`${t('legendPrice')} ${fmtNum(r.priceAtReport?.value)}`}</title></circle>:null}
       {c.targetX!==null?<circle cx={c.targetX} cy={c.y} r="7" fill="var(--accent)"><title>{`${t('legendTarget')} ${fmtNum(r.target?.price)}`}</title></circle>:
        <text x={(c.priceX??BOX.left)+20} y={c.y+4} fill="var(--text-muted)" fontSize="12">{r.targetPricePublic?t('noTarget'):t('targetHidden')}</text>}
      </g>);})}
    </svg>
    <div className={`${TINY} flex flex-wrap items-center gap-4`}>
     <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="var(--bg-elevated)" stroke="var(--text-dim)" strokeWidth="2"/></svg>{t('legendPrice')}</span>
     <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--accent)"/></svg>{t('legendTarget')}</span>
     <span>{t('legendNote')}</span>
    </div>
   </>):(
    <div className="overflow-x-auto">
     <table className="w-full min-w-[640px] text-sm">
      <thead className="border-b border-border"><tr>{(['institution','report','date','rating','priceAtReport','target','upside'] as const).map(c=><th key={c} scope="col" className={`${TH} ${['priceAtReport','target','upside'].includes(c)?'text-right':''}`}>{t(`columns.${c}`)}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{rows.map(r=>(
       <tr key={r.reportId}>
        <td className={TD}>{r.institution.nameEn}</td>
        <td className={`${TD} font-mono text-[11px]`}><Link href={reportHref(r.reportId)}>{shortId(r.reportId)}</Link></td>
        <td className={`${TD} whitespace-nowrap font-mono text-text-dim`}>{r.publishedDate??'—'}</td>
        <td className={TD}><RatingBadge value={r.rating.normalized}/></td>
        <td className={`${TD} text-right font-mono`}>{fmtNum(r.priceAtReport?.value)}</td>
        <td className={`${TD} text-right`}><TargetValue target={r.target} targetPricePublic={r.targetPricePublic}/></td>
        <td className={`${TD} text-right font-mono text-text-dim`}>{r.targetPricePublic?fmtPct(r.upsidePct,{signed:true}):'—'}</td>
       </tr>))}</tbody>
     </table>
    </div>
   )}
  </section>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/SettlementCallout.tsx
'use client';
// F4 placeholder (spec §9.3 "F4 后加'结算（判断）'"; Detail artboard): no hit rates before F4 settles claims.
import {useTranslations} from 'next-intl';
import {CALLOUT} from './ui';

export function SettlementCallout(){
 const t=useTranslations('foreign-research.public.settlement');
 return <section className={CALLOUT} aria-label={t('title')}><strong className="text-text">{t('title')}</strong> · {t('body')}</section>;
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/ReportView.tsx
'use client';
// Report detail composition (spec §9.3). Used by the public page (anon views) and by the admin preview
// (service-role data serialised through the same whitelist DTO, spec §9.1 "同一组件"). Never shows a
// latest price. `preview` adds the draft/status chip and a note instead of history/spread.
import {useCallback,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {ReportStatus,ReviewStatus} from '@/lib/broker-research/types';
import type {ReportPageData} from '@/lib/broker-research/public-read';
import {SPREAD_WINDOW_MONTHS} from '@/lib/broker-research/public-read';
import {FactsSection} from './FactsSection';
import {SourceDrawer} from './SourceDrawer';
import type {DrawerSubject} from './SourceDrawer';
import {SummarySection} from './SummarySection';
import {SnippetsSection} from './SnippetsSection';
import {HistoryBlock} from './HistoryBlock';
import {SpreadBlock} from './SpreadBlock';
import {SettlementCallout} from './SettlementCallout';
import {institutionHref} from './ReportsTable';
import {displayTitle} from './format';
import {CALLOUT,CHIP,CHIP_WARN,H1,TAG,TINY} from './ui';

export interface PreviewMeta{status:ReportStatus;reviewStatus:ReviewStatus}
export function ReportView({data,preview}:{data:ReportPageData;preview?:PreviewMeta}){
 const t=useTranslations('foreign-research.public');
 const locale=useLocale();
 const r=data.report;
 const [subject,setSubject]=useState<DrawerSubject|null>(null);
 const [focusKey,setFocusKey]=useState(data.focusTargetKey);
 const close=useCallback(()=>setSubject(null),[]);
 const title=displayTitle(r.title,locale);
 const focus=r.targets.find(x=>x.targetKey===focusKey)??r.targets[0]??null;
 const histTarget=r.targets.find(x=>x.targetKey===data.focusTargetKey)??null;
 return (
  <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
   {preview?null:<nav className={TINY}><Link href="/intel">{t('breadcrumb.research')}</Link> / <Link href="/intel/foreign-research">{t('breadcrumb.list')}</Link> / {t('breadcrumb.report')}</nav>}
   <header className="flex flex-col gap-2.5">
    <div className="flex flex-wrap items-center gap-2">
     {r.institution?(preview?<span className={CHIP}>{r.institution.nameEn}</span>:<Link href={institutionHref(r.institution.id)} className={`${CHIP} hover:no-underline`}>{r.institution.nameEn}</Link>):null}
     <span className={TINY}>{t('detail.published',{date:r.publishedDate??'—'})}{r.reportType?` · ${r.reportType}`:''}</span>
     {preview?<span className={`${CHIP_WARN} ml-auto`}>{t('preview.status',{status:preview.status,review:preview.reviewStatus})}</span>:null}
    </div>
    <h1 className={`${H1} max-w-[40ch]`}>{title.text}</h1>
    {title.rewritten?<div className="flex flex-wrap items-center gap-2"><span className={TAG}>{t('title.rewritten')}</span><span className={TINY}>{t('title.rewrittenNote')}</span></div>:null}
    {title.translated?<div className="flex flex-wrap items-center gap-2"><span className={TAG}>{t('title.translated')}</span><span className={TINY}>{t('title.translatedNote',{original:r.title.text})}</span></div>:null}
    {r.targets.length?<div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-text-dim">{t('detail.targets')}</span>
     {r.targets.map(x=><button key={x.targetKey} type="button" aria-pressed={focus?.targetKey===x.targetKey} onClick={()=>setFocusKey(x.targetKey)} className={`${CHIP} font-mono ${focus?.targetKey===x.targetKey?'border-[var(--border-active)] text-text':''}`}>{x.securityTicker??x.tickerAsStated}</button>)}
    </div>:null}
    {r.analysts.length?<div className={TINY}>{t('detail.analysts')}：{r.analysts.map(a=>a.displayName).join('、')}</div>:null}
   </header>
   {focus?<FactsSection report={r} target={focus} onOpen={setSubject}/>:<section className={CALLOUT}>{t('detail.noTargets')}</section>}
   <SummarySection summaries={r.summaries}/>
   <SnippetsSection snippets={r.snippets} maxChars={r.licence.snippetMaxChars}/>
   {preview?<p className={CALLOUT}>{t('preview.noHistory')}</p>:histTarget?.securityTicker?<>
    <HistoryBlock rows={data.history} institutionName={r.institution?.nameEn??'—'} securityTicker={histTarget.securityTicker} currency={histTarget.target?.currency??null}/>
    <SpreadBlock rows={data.spread} securityTicker={histTarget.securityTicker} currency={histTarget.target?.currency??histTarget.priceAtReport?.currency??null} windowMonths={SPREAD_WINDOW_MONTHS}/>
   </>:null}
   <SettlementCallout/>
   <SourceDrawer subject={subject} availableAt={r.availableAt} codeVersion={r.codeVersion} publicationId={focus?.publicationId??null} onClose={close}/>
  </div>
 );
}
```

```tsx
// src/app/(app)/intel/foreign-research/components/InstitutionView.tsx
'use client';
// Institution page (spec §9.1; Institution artboard): aliases, library counts, reports filtered by
// normalized rating, and the F4 placeholder "馆藏样本表现" (sample n only; no hit rate before F4).
// The analysts card of the artboard needs a per-institution analysts read that the contract lacks
// (契约修订建议 4); it is omitted.
import {useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {PUBLIC_RATINGS} from '@/lib/broker-research/public-dto';
import type {InstitutionPageData} from '@/lib/broker-research/public-read';
import {ReportsTable} from './ReportsTable';
import {primaryTarget} from './format';
import {CARD,CARD_FLUSH,CHIP,EN,H1,H2,H3,SEG,TINY,segBtn} from './ui';

export function InstitutionView({data}:{data:InstitutionPageData}){
 const t=useTranslations('foreign-research.public');
 const tr=useTranslations('foreign-research.rating');
 const [rating,setRating]=useState('');
 const inst=data.institution;
 const reports=rating?data.reports.filter(r=>primaryTarget(r)?.rating.normalized===rating):data.reports;
 const present=PUBLIC_RATINGS.filter(x=>data.reports.some(r=>primaryTarget(r)?.rating.normalized===x));
 const stats:[string,string][]=[[t('institution.stats.reports'),`${data.truncated?'≥':''}${data.reports.length}`],[t('institution.stats.securities'),String(data.securities)],[t('institution.stats.lastReport'),data.lastPublishedDate??'—']];
 return (
  <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
   <nav className={TINY}><Link href="/intel">{t('breadcrumb.research')}</Link> / <Link href="/intel/foreign-research">{t('breadcrumb.list')}</Link> / {t('breadcrumb.institution')}</nav>
   <header className="flex flex-wrap items-end gap-6">
    <div><h1 className={H1}>{inst.nameEn}{inst.nameZh?<span className={EN}>{inst.nameZh}</span>:null}</h1>
     {inst.aliases.length?<div className="mt-1.5 text-xs text-text-dim">{t('institution.aliases')} {inst.aliases.join(' · ')}</div>:null}
     {inst.ratingDisclosureUrl?<a className="mt-1 inline-block text-xs" href={inst.ratingDisclosureUrl} target="_blank" rel="noopener noreferrer">{t('institution.ratingDisclosure')}</a>:null}</div>
    <dl className="ml-auto flex gap-6">{stats.map(([k,v])=><div key={k}><dt className="text-[11px] text-text-dim">{k}</dt><dd className="font-mono text-xl tabular-nums">{v}</dd></div>)}</dl>
   </header>
   <div className="grid items-start gap-5 lg:grid-cols-12">
    <section className={`${CARD_FLUSH} lg:col-span-8`}>
     <div className="flex flex-wrap items-center gap-2 px-4 py-3.5"><h2 className={H2}>{t('institution.reports')}<span className={EN}>{t('institution.reportsEn')}</span></h2>
      <div className={`${SEG} ml-auto`} role="group" aria-label={t('list.filters.rating')}>
       {['',...present].map(x=><button key={x||'all'} type="button" aria-pressed={rating===x} className={segBtn(rating===x)} onClick={()=>setRating(x)}>{x?tr(x):t('list.filters.all')}</button>)}
      </div></div>
     <ReportsTable reports={reports} hideInstitution/>
    </section>
    <section className={`${CARD} flex flex-col gap-2.5 lg:col-span-4`}>
     <h2 className={H3}>{t('institution.performance.title')}<span className={EN}>{t('institution.performance.titleEn')}</span></h2>
     <span className={`${CHIP} self-start`}>{t('institution.performance.badge')}</span>
     <p className="text-xs text-text-dim">{t('institution.performance.body',{n:data.reports.length})}</p>
     <p className={TINY}>{t('institution.performance.sampleNote')}</p>
    </section>
   </div>
  </div>
 );
}
```

- [ ] **Step 6: 实现页面与 404**

```tsx
// src/app/(app)/intel/foreign-research/page.tsx
// Public list page (spec §9.1–9.2). Server shell; the client component owns filters and states.
import {Suspense} from 'react';
import {ListClient} from './components/ListClient';

export const dynamic='force-dynamic';

export default function ForeignResearchListPage(){
 return <Suspense fallback={null}><ListClient/></Suspense>;
}
```

```tsx
// src/app/(app)/intel/foreign-research/[reportId]/page.tsx
// Public report detail (spec §9.3). Anon views only; not visible (withdrawn, unpublished, licence
// hidden, switch off) → the same 404 for all causes.
import {notFound} from 'next/navigation';
import {UUID_RE,utcDate} from '@/lib/facts/public-route';
import {anonPublicDeps,reportPageData} from '@/lib/broker-research/public-read';
import {ReportView} from '../components/ReportView';

export const dynamic='force-dynamic';

export default async function ForeignResearchReportPage({params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!UUID_RE.test(reportId))notFound();
 const data=await reportPageData(anonPublicDeps(),reportId.toLowerCase(),utcDate(new Date()));
 if(!data)notFound();
 return <ReportView data={data}/>;
}
```

```tsx
// src/app/(app)/intel/foreign-research/[reportId]/not-found.tsx
import {NotFoundCallout} from '../components/NotFoundCallout';
export default function ReportNotFound(){return <NotFoundCallout kind="report"/>;}
```

```tsx
// src/app/(app)/intel/foreign-research/institutions/[institutionId]/page.tsx
// Public institution page (spec §9.1). Only institutions with a visible report exist publicly.
import {notFound} from 'next/navigation';
import {UUID_RE} from '@/lib/facts/public-route';
import {anonPublicDeps,institutionPageData} from '@/lib/broker-research/public-read';
import {InstitutionView} from '../../components/InstitutionView';

export const dynamic='force-dynamic';

export default async function ForeignResearchInstitutionPage({params}:{params:Promise<{institutionId:string}>}){
 const {institutionId}=await params;
 if(!UUID_RE.test(institutionId))notFound();
 const data=await institutionPageData(anonPublicDeps(),institutionId.toLowerCase());
 if(!data)notFound();
 return <InstitutionView data={data}/>;
}
```

```tsx
// src/app/(app)/intel/foreign-research/institutions/[institutionId]/not-found.tsx
import {NotFoundCallout} from '../../components/NotFoundCallout';
export default function InstitutionNotFound(){return <NotFoundCallout kind="institution"/>;}
```

- [ ] **Step 7: 新建 i18n 域（`foreign-research.public.*`、`foreign-research.rating.*`、`foreign-research.fields.*`；D4/D5 追加 `foreign-research.admin.*`）**

`messages/zh/foreign-research.json`：

```json
{
  "public": {
    "breadcrumb": {"research": "研究", "list": "外资研报", "report": "报告", "institution": "机构"},
    "entry": {"tab": "外资研报"},
    "list": {
      "title": "外资研报",
      "titleEn": "Foreign broker research",
      "intro": "私有馆藏的结构化元数据。原文不对外提供；摘要为 OsbornAlpha 独立生成。",
      "stats": {"reports": "馆藏", "institutions": "机构", "lastAdded": "最近入库"},
      "filters": {"security": "标的", "securityPlaceholder": "代码", "institution": "机构", "all": "全部", "rating": "标准化评级", "published": "发布日期", "from": "开始日期", "to": "结束日期", "summaryOnly": "只看有摘要", "apply": "筛选", "clear": "清除筛选"},
      "columns": {"institution": "机构", "security": "标的", "title": "标题", "published": "日期", "rating": "评级 原文 / 标准化", "target": "目标价", "upside": "空间 · 派生", "summary": "摘要"},
      "hasSummary": "有 AI 摘要",
      "summaryShort": "AI 摘要",
      "upsideDerived": "空间 {value}（派生）",
      "upsideNote": "空间 = 目标价 / 报告时价格 − 1（派生 · upside/1，同币种）。评级、目标价与空间是第三方判断（未结算）。不显示最新价。",
      "prev": "上一页",
      "next": "下一页 →",
      "loading": "加载中",
      "error": {"body": "报告列表加载失败。不回退到示例数据。", "retry": "重试"},
      "empty": {"title": "尚无已发布研报", "body": "研报由管理员上传并经许可确认后发布。"},
      "noResults": {"title": "没有符合条件的报告", "unknownTicker": "没有找到这个标的", "clear": "清除筛选"}
    },
    "title": {"translated": "译", "rewritten": "改写", "rewrittenNote": "公开标题为改写版本，非机构原题", "translatedNote": "机器翻译的标题；原题：{original}"},
    "target": {"notPublic": "—（许可不允许公开）", "absent": "—（报告未给出）"},
    "notFound": {
      "report": {"title": "找不到这份报告", "body": "报告不存在，或已不再公开。"},
      "institution": {"title": "找不到这家机构", "body": "机构不存在，或其报告已不再公开。"},
      "back": "返回外资研报"
    },
    "drawer": {"title": "来源：{field}", "close": "关闭", "page": "页码", "pageValue": "第 {page} 页", "method": "抽取方式", "availableAt": "入库 available_at", "codeVersion": "代码版本", "publication": "发布快照", "derived": "派生值", "judgment": "第三方判断（未结算）", "privateLibrary": "私有馆藏（不对外提供原文）", "snippet": "片段"},
    "provenance": {"llmConfirmed": "LLM 抽取 + 人工确认", "llmCorrected": "LLM 抽取 + 人工修正", "humanAdded": "人工新增", "absent": "人工标注：报告未给出", "unknown": "来源未标注"},
    "facts": {
      "title": "报告所载",
      "titleEn": "Stated in report · per target",
      "hint": "点开数值 → 来源抽屉（私有馆藏 · 页码 · 抽取方式 · 入库时间 · 代码版本 · 发布快照）",
      "page": "p.{page}",
      "rows": {"rating": "评级 原文 / 标准化", "target": "目标价 · 币种 · 期限", "priceAtReport": "报告时价格 · 币种 · 日期", "upside": "空间", "method": "方法论参数"},
      "absentTarget": "报告未给出目标价",
      "months": "{n} 个月",
      "upsideFormula": "目标价 / 报告时价格 − 1，同币种",
      "kind": {"judgment": "第三方判断（未结算）", "assumption": "第三方假设 · 文件所载", "derivedJudgment": "派生 · {version} · 第三方判断（未结算）"},
      "columns": {"field": "字段", "value": "值", "kind": "性质", "provenance": "出处"},
      "noLatestPrice": "不显示最新价。报告未写明的参数不显示，不补数。"
    },
    "summary": {"title": "独立摘要", "titleEn": "Independent summary", "none": "尚无摘要", "label": "OsbornAlpha 独立摘要 · AI 生成（{model}）· 非机构原文 · 生成于 {date}", "otherLanguage": "仅有另一种语言的摘要。"},
    "snippets": {
      "title": "引用片段",
      "titleEn": "Snippets · ≤ {n} 字",
      "none": "无公开片段",
      "purpose": {"rating": "评级依据", "target": "目标价依据", "thesis": "核心观点", "risk": "风险", "method": "估值方法", "other": "其他"},
      "page": "第 {page} 页"
    },
    "history": {
      "title": "评级与目标价历史",
      "titleEn": "History",
      "scope": "同机构 · 同证券 · 同币种",
      "judgment": "第三方判断（未结算）",
      "viewToggle": "切换图表与表格",
      "chart": "图",
      "table": "表",
      "none": "暂无历史",
      "chartLabel": "{institution} 对 {ticker} 的目标价轨迹，{n} 个报告点；数值见表格视图",
      "stepNote": "阶梯线 = 目标价在两次报告之间不变；点上标注标准化评级。",
      "columns": {"range": "区间", "rating": "评级", "target": "目标价 {currency}", "change": "变化", "reportIds": "report_id（两端）", "availableAt": "available_at", "versions": "公式 / 代码"}
    },
    "spread": {
      "title": "跨机构分歧",
      "titleEn": "Cross-institution spread",
      "scope": "{ticker} · {currency} · 各机构最近一篇 · {months} 个月窗口",
      "judgment": "第三方判断（未结算）",
      "viewToggle": "切换图表与表格",
      "chart": "图",
      "table": "表",
      "none": "窗口内没有其他机构的报告",
      "chartLabel": "{n} 家机构对 {ticker}（{currency}）的目标价与报告时价格；数值见表格视图",
      "legendPrice": "报告时价格",
      "legendTarget": "目标价",
      "legendNote": "不画最新价；不同币种不放在同一轴。",
      "noTarget": "报告未给出目标价",
      "targetHidden": "目标价不可公开",
      "columns": {"institution": "机构", "report": "report_id", "date": "日期", "rating": "评级", "priceAtReport": "报告时价格", "target": "目标价", "upside": "空间"}
    },
    "settlement": {"title": "结算（判断）", "body": "F4 落地后出现：窗口收益、到期命中、pending / unsettleable 原因、方法版本、价格来源、补登记角标。"},
    "detail": {"published": "发布 {date}", "targets": "标的", "analysts": "分析师", "noTargets": "本报告不针对单个标的（行业 / 宏观策略）。"},
    "preview": {"status": "{status} · 复核 {review} · 快照尚未生成或未对外", "noHistory": "预览不含历史与跨机构分歧（它们只来自公开视图）。", "banner": "预览 · 未对外", "bannerBody": "此页用 service_role 读基表，与公开页同一组件；只有管理员可见。公开路由此时可能返回 404。", "back": "返回复核"},
    "institution": {
      "aliases": "别名",
      "ratingDisclosure": "评级体系披露",
      "stats": {"reports": "馆藏报告", "securities": "覆盖证券", "lastReport": "最近报告"},
      "reports": "报告",
      "reportsEn": "Reports",
      "performance": {"title": "馆藏样本表现", "titleEn": "Library sample performance", "badge": "判断 · F4 结算后显示", "body": "基于馆藏样本 {n} 篇。F4 结算落地前不显示命中率。", "sampleNote": "这是馆藏样本，不是该机构的全部报告；补登记将单独列出。"}
    },
    "stock": {"title": "馆藏研报（{n}）", "titleEn": "Library reports", "all": "全部 →"}
  },
  "rating": {"buy": "买入", "overweight": "增持", "neutral": "中性", "underweight": "减持", "sell": "卖出", "not_rated": "未评级", "unmapped": "未映射"},
  "fields": {
    "institution": "机构", "analyst": "分析师", "published_date": "发布日期", "price_as_of_date": "价格日期", "ticker": "代码", "rating": "评级",
    "target_price": "目标价", "target_currency": "目标价币种", "target_horizon": "目标期限", "price_at_report": "报告时价格", "price_currency": "价格币种",
    "upside_stated": "自述空间", "wacc": "WACC", "terminal_growth": "永续增长", "terminal_value_share": "终值占比", "valuation_method": "估值方法", "sector": "行业", "title": "标题"
  }
}
```

`messages/en/foreign-research.json`（键与占位符和 zh 完全一致）：

```json
{
  "public": {
    "breadcrumb": {"research": "Research", "list": "Foreign research", "report": "Report", "institution": "Institution"},
    "entry": {"tab": "Foreign research"},
    "list": {
      "title": "Foreign broker research",
      "titleEn": "外资研报",
      "intro": "Structured metadata from a private library. Originals are never distributed; summaries are written independently by OsbornAlpha.",
      "stats": {"reports": "Reports", "institutions": "Institutions", "lastAdded": "Last added"},
      "filters": {"security": "Security", "securityPlaceholder": "Ticker", "institution": "Institution", "all": "All", "rating": "Normalized rating", "published": "Published", "from": "From", "to": "To", "summaryOnly": "With summary only", "apply": "Filter", "clear": "Clear filters"},
      "columns": {"institution": "Institution", "security": "Security", "title": "Title", "published": "Published", "rating": "Rating stated / normalized", "target": "Target", "upside": "Upside · derived", "summary": "Summary"},
      "hasSummary": "AI summary",
      "summaryShort": "AI summary",
      "upsideDerived": "Upside {value} (derived)",
      "upsideNote": "Upside = target / price at report − 1 (derived · upside/1, same currency). Ratings, targets and upside are third-party judgments (unsettled). No latest price is shown.",
      "prev": "Previous",
      "next": "Next →",
      "loading": "Loading",
      "error": {"body": "The report list failed to load. No sample data is shown instead.", "retry": "Retry"},
      "empty": {"title": "No published reports yet", "body": "Reports are uploaded by admins and published after licence confirmation."},
      "noResults": {"title": "No reports match these filters", "unknownTicker": "This security was not found", "clear": "Clear filters"}
    },
    "title": {"translated": "Translated", "rewritten": "Rewritten", "rewrittenNote": "The public title is a rewrite, not the institution's original title", "translatedNote": "Machine-translated title; original: {original}"},
    "target": {"notPublic": "— (licence does not allow public display)", "absent": "— (not given in report)"},
    "notFound": {
      "report": {"title": "Report not found", "body": "This report does not exist or is no longer public."},
      "institution": {"title": "Institution not found", "body": "This institution does not exist or its reports are no longer public."},
      "back": "Back to foreign research"
    },
    "drawer": {"title": "Source: {field}", "close": "Close", "page": "Page", "pageValue": "Page {page}", "method": "Extraction", "availableAt": "Available at", "codeVersion": "Code version", "publication": "Publication snapshot", "derived": "Derived value", "judgment": "Third-party judgment (unsettled)", "privateLibrary": "Private library (originals are not distributed)", "snippet": "Snippet"},
    "provenance": {"llmConfirmed": "LLM extracted + human confirmed", "llmCorrected": "LLM extracted + human corrected", "humanAdded": "Added by a reviewer", "absent": "Marked by a reviewer: not in report", "unknown": "Source not labelled"},
    "facts": {
      "title": "Stated in report",
      "titleEn": "报告所载 · per target",
      "hint": "Open a value → source drawer (private library · page · extraction · available at · code version · publication snapshot)",
      "page": "p.{page}",
      "rows": {"rating": "Rating stated / normalized", "target": "Target · currency · horizon", "priceAtReport": "Price at report · currency · date", "upside": "Upside", "method": "Method parameters"},
      "absentTarget": "No target price in report",
      "months": "{n} months",
      "upsideFormula": "target / price at report − 1, same currency",
      "kind": {"judgment": "Third-party judgment (unsettled)", "assumption": "Third-party assumption · stated", "derivedJudgment": "Derived · {version} · third-party judgment (unsettled)"},
      "columns": {"field": "Field", "value": "Value", "kind": "Kind", "provenance": "Provenance"},
      "noLatestPrice": "No latest price is shown. Parameters the report does not state are not shown or filled in."
    },
    "summary": {"title": "Independent summary", "titleEn": "独立摘要", "none": "No summary yet", "label": "OsbornAlpha independent summary · AI-generated ({model}) · not the institution's text · generated {date}", "otherLanguage": "Only a summary in the other language exists."},
    "snippets": {
      "title": "Snippets",
      "titleEn": "≤ {n} chars",
      "none": "No public snippets",
      "purpose": {"rating": "Rating rationale", "target": "Target rationale", "thesis": "Thesis", "risk": "Risks", "method": "Valuation method", "other": "Other"},
      "page": "p.{page}"
    },
    "history": {
      "title": "Rating & target history",
      "titleEn": "评级与目标价历史",
      "scope": "Same institution · security · currency",
      "judgment": "Third-party judgment (unsettled)",
      "viewToggle": "Toggle chart and table",
      "chart": "Chart",
      "table": "Table",
      "none": "No history yet",
      "chartLabel": "Target-price trajectory of {institution} for {ticker}, {n} report points; values in the table view",
      "stepNote": "Step line = the target is unchanged between reports; points are labelled with the normalized rating.",
      "columns": {"range": "From → to", "rating": "Rating", "target": "Target {currency}", "change": "Change", "reportIds": "report_id (both ends)", "availableAt": "available_at", "versions": "Formula / code"}
    },
    "spread": {
      "title": "Cross-institution spread",
      "titleEn": "跨机构分歧",
      "scope": "{ticker} · {currency} · latest per institution · {months}-month window",
      "judgment": "Third-party judgment (unsettled)",
      "viewToggle": "Toggle chart and table",
      "chart": "Chart",
      "table": "Table",
      "none": "No other institution reported in the window",
      "chartLabel": "Targets and prices at report of {n} institutions for {ticker} ({currency}); values in the table view",
      "legendPrice": "Price at report",
      "legendTarget": "Target",
      "legendNote": "No latest price; currencies never share an axis.",
      "noTarget": "No target price in report",
      "targetHidden": "Target not public",
      "columns": {"institution": "Institution", "report": "report_id", "date": "Date", "rating": "Rating", "priceAtReport": "Price at report", "target": "Target", "upside": "Upside"}
    },
    "settlement": {"title": "Settlement (judgment)", "body": "Appears after F4 ships: window returns, horizon hit, pending / unsettleable reasons, method version, price source, retrospective badge."},
    "detail": {"published": "Published {date}", "targets": "Targets", "analysts": "Analysts", "noTargets": "This report has no single-security target (sector / macro strategy)."},
    "preview": {"status": "{status} · review {review} · no public snapshot yet", "noHistory": "The preview has no history or spread (they come from the public views only).", "banner": "Preview · not public", "bannerBody": "This page reads base tables with service_role and renders the same components as the public page; admins only. Public routes may return 404 right now.", "back": "Back to review"},
    "institution": {
      "aliases": "Aliases",
      "ratingDisclosure": "Rating system disclosure",
      "stats": {"reports": "Library reports", "securities": "Securities covered", "lastReport": "Latest report"},
      "reports": "Reports",
      "reportsEn": "报告",
      "performance": {"title": "Library sample performance", "titleEn": "馆藏样本表现", "badge": "Judgment · shown after F4 settlement", "body": "Based on a library sample of {n} reports. Hit rates are not shown before F4 settlement ships.", "sampleNote": "This is the library sample, not every report by this institution; retrospective registrations will be listed separately."}
    },
    "stock": {"title": "Library reports ({n})", "titleEn": "馆藏研报", "all": "All →"}
  },
  "rating": {"buy": "Buy", "overweight": "Overweight", "neutral": "Neutral", "underweight": "Underweight", "sell": "Sell", "not_rated": "Not rated", "unmapped": "Unmapped"},
  "fields": {
    "institution": "Institution", "analyst": "Analyst", "published_date": "Published date", "price_as_of_date": "Price date", "ticker": "Ticker", "rating": "Rating",
    "target_price": "Target price", "target_currency": "Target currency", "target_horizon": "Target horizon", "price_at_report": "Price at report", "price_currency": "Price currency",
    "upside_stated": "Stated upside", "wacc": "WACC", "terminal_growth": "Terminal growth", "terminal_value_share": "Terminal value share", "valuation_method": "Valuation method", "sector": "Sector", "title": "Title"
  }
}
```

`src/i18n/request.ts`：在 `'analyst',` 之后、`] as const;` 之前插入：

```ts
  // FOREIGN ↓ foreign broker research (plan 2026-11-06 Task D2; spec §9.7 namespaces moved into this domain, see spec §17)
  'foreign-research',
  // FOREIGN ↑
```

- [ ] **Step 8: 写 parity、组件渲染、页面约束测试**

```ts
// src/app/(app)/intel/foreign-research/messages-parity.test.ts
// zh/en parity for the foreign-research domain (keys and ICU placeholders). The shared
// src/i18n/messages-parity.test.ts only lists its own domains; this file covers ours without editing it.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

type Tree={[k:string]:string|Tree};
const load=(l:'zh'|'en')=>JSON.parse(readFileSync(resolve(process.cwd(),'messages',l,'foreign-research.json'),'utf8')) as Tree;
const flat=(t:Tree,p=''):[string,string][]=>Object.entries(t).flatMap(([k,v])=>typeof v==='string'?[[p+k,v] as [string,string]]:flat(v,`${p}${k}.`));
const ph=(s:string)=>[...s.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort();

describe('foreign-research messages',()=>{
 it('zh and en have the same keys',()=>{expect(flat(load('zh')).map(([k])=>k).sort()).toEqual(flat(load('en')).map(([k])=>k).sort());});
 it('zh and en use the same placeholders per key',()=>{
  const en=new Map(flat(load('en')));
  for(const [k,v] of flat(load('zh')))expect(ph(v),k).toEqual(ph(en.get(k)??''));
 });
 it('every string is non-empty',()=>{for(const l of ['zh','en'] as const)for(const [k,v] of flat(load(l)))expect(v.trim(),`${l}:${k}`).not.toBe('');});
 it('is registered as a message domain inside the FOREIGN fence',()=>{
  const src=readFileSync(resolve(process.cwd(),'src/i18n/request.ts'),'utf8');
  expect(src).toMatch(/\/\/ FOREIGN ↓[^\n]*\n\s*'foreign-research',\n\s*\/\/ FOREIGN ↑/);
 });
});
```

```ts
// src/app/(app)/intel/foreign-research/components/components.test.ts
// Static rendering of the public components with the real zh messages (NextIntlClientProvider works
// under renderToStaticMarkup in the node test env). Value-level: a non-public target never renders.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createElement} from 'react';
import type {ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {describe,expect,it} from 'vitest';
import type {PublicReportDetailDto} from '@/lib/broker-research/public-dto';
import type {ReportPageData} from '@/lib/broker-research/public-read';
import {ReportView} from './ReportView';
import {ReportsTable} from './ReportsTable';
import {NotFoundCallout} from './NotFoundCallout';

const zh=JSON.parse(readFileSync(resolve(process.cwd(),'messages/zh/foreign-research.json'),'utf8'));
const render=(el:ReactElement)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'zh',messages:{'foreign-research':zh}},el));
const RID='11111111-1111-4111-8111-111111111111';
function report(over:Partial<PublicReportDetailDto>={}):PublicReportDetailDto{
 return {reportId:RID,revision:1,scope:'single_issuer',institution:{id:'22222222-2222-4222-8222-222222222222',nameEn:'Synthetic Securities',nameZh:null},primaryTargetKey:'600000.SH',
  targets:[{targetKey:'600000.SH',tickerAsStated:'600000 CH',securityTicker:'600000.SH',issuerId:'iss-1',publicationId:'33333333-3333-4333-8333-333333333333',rating:{raw:'Overweight',normalized:'overweight',scaleId:'s'},
   target:{price:'12.34',currency:'CNY',horizonMonths:12},priceAtReport:{value:'9.87',currency:'CNY',asOf:'2026-09-30'},upsidePct:'0.2502',upsideFormulaVersion:'upside/1'}],
  title:{text:'Synthetic title',isRewritten:true,zh:null,en:null,isTranslation:false},publishedDate:'2026-10-01',reportType:null,sectorAsStated:null,availableAt:'2026-10-02T00:00:00+00:00',codeVersion:'abc1234',
  hasSummary:{zh:true,en:false},snippetCount:0,targetPricePublic:true,
  citations:[{targetKey:'600000.SH',field:'target_price',occurrence:1,page:1,valueText:'12.34',valueNum:'12.34',valueCurrency:'CNY',valueUnit:'price',valueDate:null,status:'confirmed',extractorKind:'llm'}],
  snippets:[],summaries:{zh:{summaryId:'m',lang:'zh',label:'independent_summary',modelId:'model-x',promptVersion:'p',generatedAt:'2026-10-02T00:00:00+00:00',markdown:'第一段\n\n第二段<script>'},en:null},
  analysts:[],licence:{snippetMaxChars:80,targetPricePublic:true,summaryPublic:true},settlement:null,...over};
}
const page=(r:PublicReportDetailDto):ReportPageData=>({report:r,history:[],spread:[],focusTargetKey:'600000.SH'});

describe('ReportView',()=>{
 it('labels judgments, the AI summary and the rewritten title; escapes summary text',()=>{
  const html=render(createElement(ReportView,{data:page(report())}));
  expect(html).toContain('第三方判断（未结算）');expect(html).toContain('第三方假设 · 文件所载');
  expect(html).toContain('12.34 CNY');expect(html).toContain('+25.0%');
  expect(html).toContain('OsbornAlpha 独立摘要 · AI 生成（model-x）· 非机构原文 · 生成于 2026-10-02');
  expect(html).toContain('改写');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('结算（判断）');
 });
 it('never renders a target price the licence hides',()=>{
  const r=report({targetPricePublic:false,targets:[{...report().targets[0],target:null,upsidePct:null}],citations:[]});
  const html=render(createElement(ReportView,{data:page(r)}));
  expect(html).toContain('—（许可不允许公开）');expect(html).not.toContain('12.34');expect(html).not.toContain('25.0%');
 });
 it('shows the absent state instead of a number',()=>{
  const r=report({targets:[{...report().targets[0],target:null,upsidePct:null}],citations:[{...report().citations[0],status:'absent',extractorKind:'human',valueText:'ABSENT',valueNum:null}]});
  expect(render(createElement(ReportView,{data:page(r)}))).toContain('报告未给出目标价');
 });
 it('preview carries the status chip and no history',()=>{
  const html=render(createElement(ReportView,{data:page(report()),preview:{status:'draft',reviewStatus:'in_review'}}));
  expect(html).toContain('draft · 复核 in_review');expect(html).toContain('预览不含历史与跨机构分歧');
 });
});

describe('ReportsTable and 404',()=>{
 it('renders list rows with neutral rating chips and links',()=>{
  const html=render(createElement(ReportsTable,{reports:[report()]}));
  expect(html).toContain(`/intel/foreign-research/${RID}`);expect(html).toContain('增持');expect(html).toContain('CNY 12.34');expect(html).toContain('有 AI 摘要');
  expect(html).not.toMatch(/text-(up|down|bullish|bearish)/);
 });
 it('uses one wording for every not-public cause',()=>{
  const html=render(createElement(NotFoundCallout,{kind:'report'}));
  expect(html).toContain('找不到这份报告');expect(html).toContain('报告不存在，或已不再公开。');
 });
});
```

```ts
// src/app/(app)/intel/foreign-research/pages.test.ts
// Page constraints: server pages are force-dynamic server components (see dynamic-rendering.test.ts),
// and nothing in the module reads the mock data module.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=join(process.cwd(),'src/app/(app)/intel/foreign-research');
const files=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?files(p):[p];});

describe('foreign-research pages',()=>{
 for(const rel of ['page.tsx','[reportId]/page.tsx','institutions/[institutionId]/page.tsx'])
  it(`${rel} is a force-dynamic server component`,()=>{
   const src=readFileSync(join(ROOT,rel),'utf8');
   expect(src.includes("'use client'")).toBe(false);expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  });
 it('never imports mock data',()=>{for(const f of files(ROOT).filter(f=>/\.tsx?$/.test(f)))expect(readFileSync(f,'utf8'),f).not.toContain('@/lib/data/mock');});
});
```

- [ ] **Step 9: 运行 D2 全部测试 + typecheck + lint**

Run: `npm test -- "src/app/(app)/intel/foreign-research" && npm run typecheck && npm run lint`
Expected: PASS（`messages-parity`、`components`、`pages`、`format`、`list-query`）

- [ ] **Step 10: 本地目测（不提交截图）**

Run: `npm run dev`，打开 `/intel/foreign-research`（本地开关关闭 → 空馆藏态）、`/intel/foreign-research/11111111-1111-4111-8111-111111111111`（404 文案）。浏览器把宽度缩到 390 px 检查列表卡片与筛选条无横向滚动。

- [ ] **Step 11: 实施记录 + 提交**

实施记录追加：`D2 | i18n 域 foreign-research + 列表/详情/机构页 + 图表 | 偏差：i18n 命名空间改为独立域；事实区标题改"报告所载"并加 F4 标签；机构页无分析师卡；摘要数字不可点`。

```bash
git add messages/zh/foreign-research.json messages/en/foreign-research.json src/i18n/request.ts "src/app/(app)/intel/foreign-research" docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): public list, report and institution pages with charts (D2)"
```

---
### Task D3: `/stock/[ticker]` "馆藏研报（n）" 块 + mock 研报移除 + consensus `none` + `/intel` 入口

**Files:**
- Create: `src/app/(app)/intel/foreign-research/components/LibraryReportsBlock.tsx`
- Create: `src/app/(app)/intel/foreign-research/components/library-block.test.ts`
- Modify: `src/app/(app)/stock/[ticker]/page.tsx`（`// FOREIGN ↓ … ↑` 围栏：删除 `hasBrokerReports` 分支、`stock.broker_reports` 的全部使用，插入馆藏块）
- Modify: `src/app/api/consensus/[ticker]/route.ts`（`// FOREIGN` 围栏：mock 回退分支 → `{source:'none', consensus:null}`）
- Create: `src/app/api/consensus/[ticker]/route.test.ts`
- Modify: `src/app/(app)/intel/page.tsx`（`// FOREIGN` 围栏：页签条加"外资研报"链接）
- Create: `src/app/(app)/intel/foreign-research/stock-integration.test.ts`

规格 §9.4：最近 5 条；无 → 整块隐藏；同一变更删 mock 研报块与 consensus 的 mock 回退。`src/lib/data/mock.ts` 不在共享文件清单，**不改**（mock 数据里的 `broker_reports` 只是不再被读）。多标的报告在每个 target 的发行人页各出现一次（开放问题 6 的默认）——由 by-ticker 路由按 `issuer_id` 过滤自然得到。

- [ ] **Step 1: 写失败测试**

```ts
// src/app/(app)/intel/foreign-research/components/library-block.test.ts
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {describe,expect,it} from 'vitest';
import type {PublicReportDto} from '@/lib/broker-research/public-dto';
import {LibraryReportsView,parseByTicker} from './LibraryReportsBlock';

const zh=JSON.parse(readFileSync(resolve(process.cwd(),'messages/zh/foreign-research.json'),'utf8'));
const r=(n:number,over:Partial<PublicReportDto>={}):PublicReportDto=>({reportId:`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,revision:1,scope:'single_issuer',institution:{id:'i',nameEn:'Synthetic Securities',nameZh:null},primaryTargetKey:'600000.SH',
 targets:[{targetKey:'600000.SH',tickerAsStated:'600000',securityTicker:'600000.SH',issuerId:'iss',publicationId:null,rating:{raw:'Buy',normalized:'buy',scaleId:null},target:{price:'10.5',currency:'CNY',horizonMonths:null},priceAtReport:null,upsidePct:null,upsideFormulaVersion:null}],
 title:{text:`Synthetic ${n}`,isRewritten:false,zh:null,en:null,isTranslation:false},publishedDate:'2026-10-01',reportType:null,sectorAsStated:null,availableAt:null,codeVersion:null,hasSummary:{zh:false,en:false},snippetCount:0,targetPricePublic:true,...over});

describe('library block',()=>{
 it('renders heading with count, rows and the filtered list link',()=>{
  const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'zh',messages:{'foreign-research':zh}},createElement(LibraryReportsView,{ticker:'600000.SH',reports:[r(1),r(2,{targetPricePublic:false})],count:2})));
  expect(html).toContain('馆藏研报（2）');expect(html).toContain('/intel/foreign-research?ticker=600000.SH');
  expect(html).toContain('CNY 10.5');expect(html).toContain('—（许可不允许公开）');expect(html).toContain('买入');
 });
 it('parses only well-formed 200 bodies; anything else hides the block',async()=>{
  const ok=new Response(JSON.stringify({ticker:'600000.SH',issuerId:'iss',reports:[r(1)],count:1}),{status:200});
  expect((await parseByTicker(ok))?.count).toBe(1);
  expect(await parseByTicker(new Response('{}',{status:404}))).toBeNull();
  expect(await parseByTicker(new Response(JSON.stringify({reports:[]}),{status:200}))).toBeNull();
  expect(await parseByTicker(new Response('not json',{status:200}))).toBeNull();
 });
});
```

```ts
// src/app/api/consensus/[ticker]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({configured:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/data/sources/tushare-cached',async()=>{
 class TushareError extends Error{}
 return {isTushareConfigured:mocks.configured,fetchTushareReportRc:mocks.fetch,TushareError};
});
import {GET} from './route';
import {TushareError} from '@/lib/data/sources/tushare-cached';

const call=(t:string)=>GET(new Request(`http://localhost/api/consensus/${t}`),{params:Promise.resolve({ticker:t})});
beforeEach(()=>{vi.clearAllMocks();mocks.configured.mockReturnValue(false);});

describe('GET /api/consensus/[ticker] without the mock fallback (spec §9.4)',()=>{
 it('returns source none for tickers whose mock stub has broker reports',async()=>{
  for(const t of ['00700.HK','NVDA','600519.SH']){
   const res=await call(t);
   expect(res.status).toBe(200);expect(await res.json()).toEqual({source:'none',ticker:t,consensus:null});
  }
 });
 it('falls to none (not mock) on a Tushare error or zero usable reports',async()=>{
  mocks.configured.mockReturnValue(true);
  mocks.fetch.mockRejectedValueOnce(new TushareError('quota'));
  expect((await (await call('600519.SH')).json()).source).toBe('none');
  mocks.fetch.mockResolvedValueOnce([]);
  expect((await (await call('600519.SH')).json()).source).toBe('none');
 });
 it('keeps 502 for unexpected errors',async()=>{
  mocks.configured.mockReturnValue(true);mocks.fetch.mockRejectedValueOnce(new Error('boom'));
  expect((await call('600519.SH')).status).toBe(502);
 });
});
```

```ts
// src/app/(app)/intel/foreign-research/stock-integration.test.ts
// Source-level guards for the shared-file edits of Task D3 (the stock page is a large client page with
// live hooks; its behaviour is covered by the block and consensus tests, its wiring here).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');

describe('D3 shared-file edits',()=>{
 it('stock page no longer reads mock broker reports and mounts the library block',()=>{
  const src=read('src/app/(app)/stock/[ticker]/page.tsx');
  expect(src).not.toContain('broker_reports');expect(src).not.toContain('hasBrokerReports');
  expect(src).toContain('<LibraryReportsBlock ticker={ticker} />');expect(src).toMatch(/\/\/ FOREIGN ↓[\s\S]*\/\/ FOREIGN ↑/);
 });
 it('consensus route has no mock branch',()=>{
  const src=read('src/app/api/consensus/[ticker]/route.ts');
  expect(src).not.toContain('getStockOrStub');expect(src).not.toContain("source: 'mock'");expect(src).toContain('FOREIGN');
 });
 it('intel page links to the module',()=>{
  const src=read('src/app/(app)/intel/page.tsx');
  expect(src).toContain('href="/intel/foreign-research"');expect(src).toMatch(/FOREIGN ↓[\s\S]*foreign-research[\s\S]*FOREIGN ↑/);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- "src/app/(app)/intel/foreign-research/components/library-block.test.ts" "src/app/api/consensus/[ticker]/route.test.ts" "src/app/(app)/intel/foreign-research/stock-integration.test.ts"`
Expected: FAIL（组件不存在；consensus 对 `00700.HK`/`NVDA` 返回 `source:'mock'`；源码断言失败）

- [ ] **Step 3: 实现馆藏块**

```tsx
// src/app/(app)/intel/foreign-research/components/LibraryReportsBlock.tsx
'use client';
// /stock/[ticker] "馆藏研报（n）" block (spec §9.4; ListStates artboard): newest 5 public reports for the
// ticker's issuer from /api/broker-research/by-ticker. 404, an error or a malformed body hides the
// whole block — there is no mock fallback.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {PublicReportDto} from '@/lib/broker-research/public-dto';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {reportHref} from './ReportsTable';
import {primaryTarget} from './format';
import {EN,TD} from './ui';

export interface ByTickerJson{ticker:string;issuerId:string;reports:PublicReportDto[];count:number}
export async function parseByTicker(res:Response):Promise<ByTickerJson|null>{
 if(!res.ok)return null;
 const body=await res.json().catch(()=>null) as Partial<ByTickerJson>|null;
 return body&&Array.isArray(body.reports)&&body.reports.length>0&&typeof body.count==='number'&&typeof body.ticker==='string'?body as ByTickerJson:null;
}

export function LibraryReportsView({ticker,reports,count}:{ticker:string;reports:PublicReportDto[];count:number}){
 const t=useTranslations('foreign-research.public.stock');
 return (
  <div className="card-base p-0">
   <div className="flex items-center gap-2 px-3 py-2.5">
    <span className="text-sm font-semibold text-text-dim">{t('title',{n:count})}<span className={EN}>{t('titleEn')}</span></span>
    <Link href={`/intel/foreign-research?ticker=${encodeURIComponent(ticker)}`} className="ml-auto text-xs">{t('all')}</Link>
   </div>
   <div className="overflow-x-auto">
    <table className="w-full text-sm"><tbody className="divide-y divide-border">
     {reports.map(r=>{const pt=r.targets.find(x=>x.securityTicker===ticker)??primaryTarget(r);return (
      <tr key={r.reportId}>
       <td className={`${TD} whitespace-nowrap pl-3 font-mono text-text-dim`}>{r.publishedDate??'—'}</td>
       <td className={`${TD} whitespace-nowrap`}>{r.institution?.nameEn??'—'}</td>
       <td className={TD}><Link href={reportHref(r.reportId)} className="text-text hover:text-accent">{r.title.text}</Link></td>
       <td className={TD}>{pt?<RatingBadge value={pt.rating.normalized}/>:null}</td>
       <td className={`${TD} whitespace-nowrap pr-3 text-right`}>{pt?<TargetValue target={pt.target} targetPricePublic={r.targetPricePublic} currencyFirst/>:null}</td>
      </tr>);})}
    </tbody></table>
   </div>
  </div>
 );
}

export function LibraryReportsBlock({ticker}:{ticker:string}){
 const [data,setData]=useState<ByTickerJson|null>(null);
 useEffect(()=>{
  setData(null);
  const ctrl=new AbortController();
  fetch(`/api/broker-research/by-ticker/${encodeURIComponent(ticker)}?limit=5`,{cache:'no-store',signal:ctrl.signal})
   .then(parseByTicker).then(setData).catch(()=>setData(null));
  return ()=>ctrl.abort();
 },[ticker]);
 return data?<LibraryReportsView ticker={data.ticker} reports={data.reports} count={data.count}/>:null;
}
```

- [ ] **Step 4: 改 `/stock/[ticker]/page.tsx`**

(a) import 区末尾（`import { QuotaNotice } …` 之后）加：

```tsx
// FOREIGN ↓ library reports block (plan 2026-11-06 Task D3)
import { LibraryReportsBlock } from '@/app/(app)/intel/foreign-research/components/LibraryReportsBlock';
// FOREIGN ↑
```

(b) 把第 50–74 行（从 `// A-share with no mock broker reports:` 注释到该 `useEffect` 的 `}, [ticker, hasBrokerReports]);`）整体替换为：

```tsx
  // FOREIGN ↓ mock broker reports removed (spec §9.4): A-share consensus comes from Tushare
  // report_rc only; /api/consensus answers {source:'none'} when there is none.
  const [brokerConsensus, setBrokerConsensus] = useState<ConsensusInfo | null>(null);

  useEffect(() => {
    setBrokerConsensus(null);
    if (!isAShare(ticker)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/consensus/${encodeURIComponent(ticker)}`);
        const data = await res.json();
        if (cancelled) return;
        const c = data?.consensus;
        if (c && Number.isFinite(c.target_median)) {
          setBrokerConsensus({ target: c.target_median, min: c.target_min, max: c.target_max, n: c.n, source: data.source });
        }
      } catch {
        // fetch failed — keep the 暂无近期研报 empty state
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);
  // FOREIGN ↑
```

(c) `news` 页签中，把第一个 `<div className="card-base">`（标题 `t('news.brokerReportsHeading', …)` 那块，到 `stock.broker_reports.map(...)` 分支结束的 `</div>`，原第 320–361 行）整体替换为：

```tsx
          {/* FOREIGN ↓ library reports (spec §9.4) replace the mock broker list; the Tushare consensus card stays */}
          <LibraryReportsBlock ticker={ticker} />
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">{t('news.brokerReportsHeading', { count: brokerConsensus?.n ?? 0 })}</div>
            {brokerConsensus ? (
              <div
                className="rounded-md bg-bg-card px-3 py-2.5 text-sm"
                title={brokerConsensus.source === 'tushare' ? t('news.consensusSourceTitle') : undefined}
              >
                <div className="font-semibold tabular-nums">
                  {t('news.consensusTarget', { price: `${stock.currency}${formatPrice(brokerConsensus.target)}` })}
                  {brokerConsensus.source === 'tushare' && (
                    <sup className="ml-0.5 text-[9px] font-normal text-text-dim">tushare</sup>
                  )}
                </div>
                <div className="text-[11px] text-text-dim">
                  {t('news.reportCount', { n: brokerConsensus.n })}
                  {brokerConsensus.min != null && brokerConsensus.max != null && brokerConsensus.max > brokerConsensus.min
                    ? t('news.range', { min: `${stock.currency}${formatPrice(brokerConsensus.min)}`, max: `${stock.currency}${formatPrice(brokerConsensus.max)}` })
                    : ''}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-text-dim">{t('news.noRecentReports')}</div>
            )}
          </div>
          {/* FOREIGN ↑ */}
```

确认：`grep -c broker_reports "src/app/(app)/stock/[ticker]/page.tsx"` 输出 `0`；`news.targetLabel` 键不再被本页使用（`market.json` 是别人的共享文件，不删键）。

- [ ] **Step 5: 改 consensus 路由**

(a) 删除 import：`import { deriveTargetPrice, deriveValuationRange } from '@/lib/stocks/metrics';` 与 `import { getStockOrStub } from '@/lib/data/mock';`（在原位置留一行 `// FOREIGN: mock imports removed (spec §9.4)`）。

(b) 文件头注释第 2 条改为：

```ts
 *   2. Otherwise (non-A-share, no token, Tushare error, or tushare returned no
 *      usable reports) → { source: 'none', consensus: null }.
 *      FOREIGN: the mock broker_reports fallback was removed (spec 2026-11-04 §9.4) —
 *      library reports now come from /api/broker-research/by-ticker.
```
并删除原第 3 条（与第 2 条合并）。

(c) 把 `const stub = getStockOrStub(ticker);` 到其 `if` 块结束（原第 48–63 行）替换为：

```ts
  // FOREIGN ↓ no mock fallback (spec §9.4)
  // FOREIGN ↑
```
保留末行 `return NextResponse.json({ source: 'none', ticker, consensus: null });`。注释里 "try the mock fallback below" / "fall through to mock degradation below" 两处改为 "fall through to source none below"。

- [ ] **Step 6: 改 `/intel/page.tsx`（页签条第三项链到本模块）**

(a) import 区（`import { Disclaimer } …` 之后）不需要新 import（`Link` 已导入）。在 `const t = useTranslations('intel');` 下一行加：

```tsx
  // FOREIGN ↓ entry to the foreign research module (plan 2026-11-06 Task D3)
  const tfr = useTranslations('foreign-research.public.entry');
  // FOREIGN ↑
```

(b) 页签容器 `<div className="mb-4 flex gap-1 rounded-md border border-border p-1 text-sm">` 里，第二个 `</button>` 之后、容器 `</div>` 之前加：

```tsx
        {/* FOREIGN ↓ */}
        <Link
          href="/intel/foreign-research"
          className="flex-1 rounded px-3 py-1.5 text-center font-semibold text-text-dim hover:text-accent hover:no-underline"
        >
          {tfr('tab')}
        </Link>
        {/* FOREIGN ↑ */}
```

- [ ] **Step 7: 运行测试 + 回归**

Run: `npm test -- "src/app/(app)/intel/foreign-research" "src/app/api/consensus" src/lib/stocks && npm run typecheck && npm run lint`
Expected: PASS（`src/lib/stocks/metrics.ts` 的 `deriveTargetPrice` 仍被其单测使用，不删）

- [ ] **Step 8: 实施记录 + 提交**

实施记录追加：`D3 | /stock 馆藏块 + mock 研报删除 + consensus none + /intel 入口 | 共享文件：stock page、consensus route、intel page（FOREIGN 围栏）`。

```bash
git add "src/app/(app)/intel/foreign-research/components/LibraryReportsBlock.tsx" "src/app/(app)/intel/foreign-research/components/library-block.test.ts" "src/app/(app)/intel/foreign-research/stock-integration.test.ts" "src/app/(app)/stock/[ticker]/page.tsx" "src/app/api/consensus/[ticker]/route.ts" "src/app/api/consensus/[ticker]/route.test.ts" "src/app/(app)/intel/page.tsx" docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): stock library block, drop mock broker reports and consensus mock (D3)"
```

---
### Task D4: 管理员页面：总览（计数 + 三项门禁只读）/ 上传 / 许可 / 访问日志

**Files:**
- Create: `src/lib/broker-research/admin-read.ts`、`src/lib/broker-research/admin-read.test.ts`
- Create: `src/app/(app)/admin/broker-research/_shared/gate.tsx`、`AdminShell.tsx`、`admin-fetch.ts`、`admin-fetch.test.ts`
- Create: `src/app/(app)/admin/broker-research/page.tsx`、`OverviewView.tsx`
- Create: `src/app/(app)/admin/broker-research/upload/page.tsx`、`UploadClient.tsx`、`upload-client.ts`、`upload-client.test.ts`
- Create: `src/app/(app)/admin/broker-research/licences/page.tsx`、`LicencesClient.tsx`、`licence-form.ts`、`licence-form.test.ts`
- Create: `src/app/(app)/admin/broker-research/access-log/page.tsx`、`AccessLogClient.tsx`、`access-log-csv.ts`、`access-log-csv.test.ts`
- Modify: `messages/zh/foreign-research.json`、`messages/en/foreign-research.json`（追加顶层 `admin` 对象，见 Step 9）

设计要点：
- 每个管理员页面是服务端组件，**自己**调用 `adminGate()`（布局在客户端导航时不重新执行，不能只在布局里守门）；未登录 → `/login?next=…`，非管理员 → 拒绝页。读数据用 service-role（`admin-read.ts`），不经 HTTP；写一律经 C 的管理员路由（`POST/PATCH`，`content-type: application/json`，浏览器自动带 Origin）。总览与许可页**不返回全文 / 跨度 / 签名 URL**，因此不是 ★ 读、不写访问日志。
- 总览的三项门禁（D1 许可确认 / `test:storage` 回执 / 黄金集回执）**只读显示**：D1 = 至少一条许可当前已确认且在有效期；黄金集 = 最新 `gold` 回执 `passed`、`n_docs ≥ 30` 且 `corpus_hash = approved_gold_corpus_hash`；`test:storage` 是本地 Supabase 栈上的人工门禁，回执在 `docs/audits/2026-11-06-foreign-research/`，线上页面无法核对 → 恒显示"人工门禁"。"打开对外"按钮恒禁用（FR-6 由 owner 按 runbook 打开）；开关已开时提供"关闭对外"（安全方向，`POST settings/public {enabled:false}`）。记入 §17。
- 总览加"复核队列"与"最近文档"两张表作为进入文档页 / 复核页的入口（画板侧栏的"文档 / 复核"没有列表页）；"机构"管理页不在本 Part 范围（见开放风险）。
- 上传：浏览器 `crypto.subtle.digest('SHA-256')` 算哈希并检查 `%PDF-` 头与 50 MiB → 选许可 → `POST documents/intent`（查重 = 409 `duplicate_document`）→ XHR `PUT` 原始字节到签名上传 URL（`content-type: application/pdf`、`x-upsert: false`，带进度）→ `POST documents/commit`（`409 intent_busy` 时重试一次）。文件不经应用服务器。

- [ ] **Step 1: 写 `admin-read` 失败测试**

```ts
// src/lib/broker-research/admin-read.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {countMappingUpdates,isLicenceConfirmed,loadLicences,loadOverview,worstField} from './admin-read';
import type {AdminReadDeps} from './admin-read';
import type {BrokerResearchDb,LicenceRow,RatingScaleRow} from './types';

const lic=(o:Partial<LicenceRow>={}):LicenceRow=>({licence_id:'L1',version:2,source_label:'Synthetic',licence_kind:'other',holder:'h',terms_summary:'t',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:false,snippet_max_chars:80,valid_from:'2026-01-01',valid_to:null,confirmed_by:'u',confirmed_at:'2026-02-01T00:00:00Z',confirmed_version:2,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-02-01T00:00:00Z',...o});
const settings={public_enabled:false,approved_gold_corpus_hash:'G',approved_gold_corpus_by:null,approved_gold_corpus_at:null,updated_by:null,updated_at:'2026-01-01T00:00:00Z'};
async function seed(){
 const tables=memoryTableClient();
 const doc=(id:string,status:string,pending=false,licence='L1')=>tables.insert('broker_report_documents',{document_id:id,status,promotion_pending:pending,licence_id:licence,uploaded_at:`2026-10-0${id.length}T00:00:00Z`,original_filename:`${id}.pdf`,sha256:id});
 await doc('d1','uploaded');await doc('d2','uploaded',true);await doc('d3','parse_failed');await doc('d4','parsed');await doc('d5','parsed');await doc('d6','withdrawn');
 const rep=(id:string,d:string,status:string,review:string,o:Record<string,unknown>={})=>tables.insert('broker_research_reports',{report_id:id,document_id:d,status,review_status:review,disclosure_ok:true,...o});
 await rep('r5','d5','draft','in_review');await rep('r7','d7','draft','approved');await rep('r8','d8','published','approved',{institution_id:'I',current_publication_id:'P',published_date:'2026-06-01'});
 await tables.insert('broker_outbox',{event_id:'e1',status:'failed'});await tables.insert('broker_outbox',{event_id:'e2',status:'pending'});
 await tables.insert('broker_eval_receipts',{receipt_id:'g1',corpus_kind:'gold',corpus_hash:'G',passed:true,n_docs:30,ran_at:'2026-10-01T00:00:00Z',per_field:{rating:{tp:9,fp:0,fn:1,precision:1,recall:0.9},wacc:{tp:0,fp:0,fn:0,precision:null,recall:null}},precision_min:1,recall_min:0.9,extractor_version:'x',model_id:'m',registry_hash:'r',prompt_version:'p',schema_version:'s',code_version:'c'});
 await tables.insert('broker_report_snippets',{snippet_id:'s1',report_id:'r8',status:'approved',approved_by:'u'});
 await tables.insert('broker_report_snippets',{snippet_id:'s2',report_id:'r5',status:'draft',approved_by:'u'});
 return tables;
}
function db(o:Partial<BrokerResearchDb>={}):BrokerResearchDb{
 return {getSettings:vi.fn().mockResolvedValue(settings),listLicences:vi.fn().mockResolvedValue([lic(),lic({licence_id:'L2',version:3,confirmed_version:2})]),reviewQueue:vi.fn().mockResolvedValue([]),
  getPublication:vi.fn().mockResolvedValue({publication_id:'P',published_at:'2026-06-02T00:00:00Z'}),listRatingScales:vi.fn().mockResolvedValue([]),listTargets:vi.fn().mockResolvedValue([]),...o} as unknown as BrokerResearchDb;
}
const deps=async(o:Partial<BrokerResearchDb>={}):Promise<AdminReadDeps>=>({db:db(o),tables:await seed(),now:()=>new Date('2026-11-06T00:00:00Z')});

describe('licence predicate',()=>{
 it('needs confirmation of the current version inside the validity window',()=>{
  expect(isLicenceConfirmed(lic(),'2026-11-06')).toBe(true);
  expect(isLicenceConfirmed(lic({confirmed_version:1}),'2026-11-06')).toBe(false);
  expect(isLicenceConfirmed(lic({valid_to:'2026-10-01'}),'2026-11-06')).toBe(false);
  expect(isLicenceConfirmed(lic({confirmed_at:null}),'2026-11-06')).toBe(false);
 });
});

describe('loadOverview',()=>{
 it('counts each state once and reads gates without touching the switch',async()=>{
  const o=await loadOverview(await deps());
  expect(o.counts).toEqual({toParse:2,toExtract:1,toReview:1,toPublish:1,published:1,withdrawn:1});
  expect(o.gates.d1).toEqual({ok:true,confirmed:1,total:2});
  expect(o.gates.gold.ok).toBe(true);expect(o.gold?.worst).toEqual({field:'rating',metric:'recall',value:0.9});
  expect(o.attention).toEqual({mappingUpdates:0,outboxFailed:1,licencesPending:1});
  expect(o.settings.public_enabled).toBe(false);
 });
 it('gold gate fails on corpus mismatch or n < 30',async()=>{
  const o=await loadOverview(await deps({getSettings:vi.fn().mockResolvedValue({...settings,approved_gold_corpus_hash:'OTHER'})}));
  expect(o.gates.gold.ok).toBe(false);expect(o.gold?.corpusMatches).toBe(false);
 });
});

describe('countMappingUpdates',()=>{
 it('counts a published report whose raw label got a newer covering scale row',async()=>{
  const scale:RatingScaleRow={scale_id:'new',institution_id:'I',raw_label:'BUY',normalized:'buy',source_url:'u',valid_from:'2026-01-01',valid_to:null,created_by:'u',created_at:'2026-07-01T00:00:00Z',closed_by:null,closed_at:null};
  const d=await deps({listRatingScales:vi.fn().mockResolvedValue([scale]),listTargets:vi.fn().mockResolvedValue([{rating_raw:'Buy',scale_id:'old'}])});
  const reports=await d.tables.select('broker_research_reports',{});
  expect(await countMappingUpdates(d,reports)).toBe(1);
  const d2=await deps({listRatingScales:vi.fn().mockResolvedValue([{...scale,created_at:'2026-05-01T00:00:00Z'}]),listTargets:vi.fn().mockResolvedValue([{rating_raw:'Buy',scale_id:'old'}])});
  expect(await countMappingUpdates(d2,reports)).toBe(0);
 });
 it('worstField ignores uncovered metrics',()=>{expect(worstField({a:{tp:0,fp:0,fn:0,precision:null,recall:null}})).toBeNull();});
});

describe('loadLicences',()=>{
 it('reports per-licence impact counts',async()=>{
  const d=await deps();
  await d.tables.insert('broker_report_documents',{document_id:'d7',status:'parsed',licence_id:'L1',promotion_pending:false});
  await d.tables.insert('broker_report_documents',{document_id:'d8',status:'parsed',licence_id:'L1',promotion_pending:false});
  const [l1,l2]=await loadLicences(d);
  expect(l1).toMatchObject({confirmed:true,pending:false,documents:8,publishedReports:1,approvedSnippets:1,revertedTexts:1});
  expect(l2).toMatchObject({confirmed:false,pending:true,documents:0});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/broker-research/admin-read.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `admin-read.ts`**

```ts
// src/lib/broker-research/admin-read.ts
// Service-role read models for the admin pages (spec §9.5): overview counts, the three FR-6 gates
// (display only), gold receipt, recent batches, open quarantine, "newer mapping available" published
// reports, outbox failures, licence impact counts, access log. None of these return full text, spans
// or signed URLs, so they are not ★ reads. Callers must have passed adminGate() first.
import {getAdminSupabase} from '../supabase/admin';
import {selectAll,supabaseTableClient} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {listOpenQuarantine} from '../dq/quarantine';
import {supabaseBrokerResearchDb} from './db';
import type {AccessLogInput,BrokerResearchDb,EvalFieldStats,LicenceRow,RatingScaleRow,ReportRow,SettingsRow} from './types';

export interface AdminReadDeps{db:BrokerResearchDb;tables:TableClient;now:()=>Date}
export function adminReadDeps():AdminReadDeps{const sb=getAdminSupabase();return {db:supabaseBrokerResearchDb(sb),tables:supabaseTableClient(sb),now:()=>new Date()};}
const str=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;
const today=(d:AdminReadDeps)=>d.now().toISOString().slice(0,10);
export const GOLD_MIN_DOCS=30;

export const isLicenceConfirmed=(l:LicenceRow,on:string)=>l.confirmed_at!==null&&l.confirmed_version===l.version&&l.valid_from<=on&&(l.valid_to===null||on<=l.valid_to);

export function worstField(perField:Record<string,EvalFieldStats>):{field:string;metric:'precision'|'recall';value:number}|null{
 let worst:{field:string;metric:'precision'|'recall';value:number}|null=null;
 for(const [field,s] of Object.entries(perField??{}))for(const metric of ['precision','recall'] as const){
  const v=s?.[metric];if(typeof v!=='number')continue;
  if(worst===null||v<worst.value)worst={field,metric,value:v};
 }
 return worst;
}
export interface GoldReceiptView{receiptId:string;ranAt:string|null;passed:boolean;nDocs:number;corpusMatches:boolean;codeVersion:string|null;
 tuple:{extractorVersion:string|null;modelId:string|null;registryHash:string|null;promptVersion:string|null;schemaVersion:string|null};
 precisionMin:number|null;recallMin:number|null;worst:ReturnType<typeof worstField>}
function goldView(r:Row|undefined,s:SettingsRow):GoldReceiptView|null{
 if(!r)return null;
 return {receiptId:String(r.receipt_id),ranAt:str(r.ran_at),passed:r.passed===true,nDocs:Number(r.n_docs??0),corpusMatches:s.approved_gold_corpus_hash!==null&&r.corpus_hash===s.approved_gold_corpus_hash,codeVersion:str(r.code_version),
  tuple:{extractorVersion:str(r.extractor_version),modelId:str(r.model_id),registryHash:str(r.registry_hash),promptVersion:str(r.prompt_version),schemaVersion:str(r.schema_version)},
  precisionMin:typeof r.precision_min==='number'?r.precision_min:null,recallMin:typeof r.recall_min==='number'?r.recall_min:null,worst:worstField((r.per_field??{}) as Record<string,EvalFieldStats>)};
}

/** Published reports where a rating-scale row newer than the publication now covers a target's raw label with a different scale (spec §4.9). */
export async function countMappingUpdates(deps:AdminReadDeps,reports:Row[]):Promise<number>{
 const scales=new Map<string,RatingScaleRow[]>();let n=0;
 for(const r of reports){
  if(r.status!=='published')continue;
  const inst=str(r.institution_id),pubId=str(r.current_publication_id),pd=str(r.published_date);if(!inst||!pubId||!pd)continue;
  const pub=await deps.db.getPublication(pubId);if(!pub)continue;
  if(!scales.has(inst))scales.set(inst,await deps.db.listRatingScales(inst));
  const list=scales.get(inst)??[];
  const targets=await deps.db.listTargets(String(r.report_id));
  const newer=targets.some(t=>t.rating_raw!==null&&list.some(s=>s.raw_label.toLowerCase()===t.rating_raw!.toLowerCase()&&s.created_at>pub.published_at&&s.valid_from<=pd&&(s.valid_to===null||pd<s.valid_to)&&s.scale_id!==t.scale_id));
  if(newer)n++;
 }
 return n;
}

export interface OverviewData{
 settings:SettingsRow;
 counts:{toParse:number;toExtract:number;toReview:number;toPublish:number;published:number;withdrawn:number};
 gates:{d1:{ok:boolean;confirmed:number;total:number};gold:{ok:boolean}};
 gold:GoldReceiptView|null;batches:Row[];quarantine:{total:number;rows:Row[]};
 attention:{mappingUpdates:number;outboxFailed:number;licencesPending:number};
 reviewQueue:ReportRow[];recentDocuments:Row[];
}
export async function loadOverview(deps:AdminReadDeps):Promise<OverviewData>{
 const c=(table:string,match:Row)=>deps.tables.count(table,match);
 const [settings,licences,uploaded,parseFailed,published,withdrawn,pending,inReview,approved,outboxFailed,quarantineTotal]=await Promise.all([
  deps.db.getSettings(),deps.db.listLicences(),
  c('broker_report_documents',{status:'uploaded',promotion_pending:false}),c('broker_report_documents',{status:'parse_failed'}),
  c('broker_research_reports',{status:'published'}),c('broker_report_documents',{status:'withdrawn'}),
  c('broker_research_reports',{status:'draft',review_status:'pending'}),c('broker_research_reports',{status:'draft',review_status:'in_review'}),
  c('broker_research_reports',{status:'draft',review_status:'approved'}),c('broker_outbox',{status:'failed'}),c('dq_quarantine',{dataset:'broker_research',status:'open'}),
 ]);
 const [parsed,reports,goldRows,batches,quarantineRows,reviewQueue,recentDocuments]=await Promise.all([
  selectAll(deps.tables,'broker_report_documents',{status:'parsed'},'document_id'),selectAll(deps.tables,'broker_research_reports',{},'report_id'),
  deps.tables.select('broker_eval_receipts',{corpus_kind:'gold'},{orderBy:'ran_at',desc:true,limit:1}),
  deps.tables.select('ingest_batches',{dataset:'broker_research'},{orderBy:'started_at',desc:true,limit:5}),
  listOpenQuarantine(deps.tables,'broker_research',5),deps.db.reviewQueue({limit:20}),
  deps.tables.select('broker_report_documents',{},{orderBy:'uploaded_at',desc:true,limit:20}),
 ]);
 const withReport=new Set(reports.map(r=>String(r.document_id)));
 const confirmed=licences.filter(l=>isLicenceConfirmed(l,today(deps))).length;
 const gold=goldView(goldRows[0],settings);
 return {
  settings,
  counts:{toParse:uploaded+parseFailed,toExtract:parsed.filter(d=>!withReport.has(String(d.document_id))).length,toReview:pending+inReview,toPublish:approved,published,withdrawn},
  gates:{d1:{ok:confirmed>0,confirmed,total:licences.length},gold:{ok:gold!==null&&gold.passed&&gold.nDocs>=GOLD_MIN_DOCS&&gold.corpusMatches}},
  gold,batches,quarantine:{total:quarantineTotal,rows:quarantineRows},
  attention:{mappingUpdates:await countMappingUpdates(deps,reports),outboxFailed,licencesPending:licences.filter(l=>l.confirmed_version!==l.version).length},
  reviewQueue,recentDocuments,
 };
}

export interface LicenceView{licence:LicenceRow;confirmed:boolean;pending:boolean;documents:number;publishedReports:number;hiddenReports:number;approvedSnippets:number;approvedSummaries:number;revertedTexts:number}
/** Impact counts per licence: what is public under it, and approved texts sent back to draft by a change (approved_by kept, status draft). */
export async function loadLicences(deps:AdminReadDeps):Promise<LicenceView[]>{
 const on=today(deps),out:LicenceView[]=[];
 for(const licence of await deps.db.listLicences()){
  const docs=await selectAll(deps.tables,'broker_report_documents',{licence_id:licence.licence_id},'document_id');
  let publishedReports=0,hiddenReports=0,approvedSnippets=0,approvedSummaries=0,revertedTexts=0;
  for(const d of docs){
   for(const r of await deps.tables.select('broker_research_reports',{document_id:d.document_id})){
    if(r.status==='published')publishedReports++;
    if(r.disclosure_ok===false)hiddenReports++;
    const id=r.report_id;
    approvedSnippets+=await deps.tables.count('broker_report_snippets',{report_id:id,status:'approved'});
    approvedSummaries+=await deps.tables.count('broker_report_summaries',{report_id:id,status:'approved'});
    for(const table of ['broker_report_snippets','broker_report_summaries'])
     revertedTexts+=(await deps.tables.select(table,{report_id:id,status:'draft'})).filter(x=>x.approved_by!==null&&x.approved_by!==undefined).length;
   }
  }
  out.push({licence,confirmed:isLicenceConfirmed(licence,on),pending:licence.confirmed_version!==licence.version,documents:docs.length,publishedReports,hiddenReports,approvedSnippets,approvedSummaries,revertedTexts});
 }
 return out;
}

export type AccessLogView=AccessLogInput&{id:string;created_at:string};
export async function loadAccessLog(deps:AdminReadDeps,opts:{documentId?:string;limit:number}):Promise<AccessLogView[]>{return deps.db.listAccessLog(opts);}
```

（测试里 `documents:8`：种子 6 条 + 用例追加 2 条全挂在 `L1`。`d5` 的 `r5` 有 `approved_by` 的草稿片段 → `revertedTexts:1`。）

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/broker-research/admin-read.test.ts`
Expected: PASS

- [ ] **Step 5: 共享壳与客户端助手（含失败测试）**

```ts
// src/app/(app)/admin/broker-research/_shared/admin-fetch.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {adminJson,baseCode,errorCode,errorField} from './admin-fetch';

afterEach(()=>vi.unstubAllGlobals());
describe('admin fetch',()=>{
 it('always sends JSON for writes and maps errors to codes',async()=>{
  const f=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'duplicate_document',documentId:'d1'}}),{status:409}));
  vi.stubGlobal('fetch',f);
  const r=await adminJson('POST','/documents/intent');
  expect(f).toHaveBeenCalledWith('/api/admin/broker-research/documents/intent',expect.objectContaining({method:'POST',body:'{}',headers:{'content-type':'application/json'},cache:'no-store'}));
  expect(r).toMatchObject({ok:false,status:409,code:'duplicate_document'});
  if(!r.ok)expect(errorField(r.body,'documentId','document_id')).toBe('d1');
 });
 it('falls back to http_<status> and splits base codes',()=>{
  expect(errorCode(null,502)).toBe('http_502');expect(baseCode('publish_blocked:review_not_approved')).toBe('publish_blocked');
  expect(errorField({error:{detail:{document_id:'x'}}},'documentId','document_id')).toBe('x');
 });
});
```

```ts
// src/app/(app)/admin/broker-research/_shared/admin-fetch.ts
// Browser helper for the C admin routes (spec §8.2): JSON body on every write (the routes answer 415
// otherwise; the browser adds Origin), no-store, error body {error:{code,...}} → code.
export const ADMIN_API='/api/admin/broker-research';
export type ApiResult<T>={ok:true;status:number;data:T}|{ok:false;status:number;code:string;body:unknown};
export function errorCode(body:unknown,status:number):string{
 const c=(body as {error?:{code?:unknown}}|null)?.error?.code;return typeof c==='string'&&c.length>0?c:`http_${status}`;
}
export const baseCode=(code:string)=>code.split(':')[0];
/** Reads a value the route may put on error or on error.detail (e.g. the existing document id of a duplicate). */
export function errorField(body:unknown,camel:string,snake:string):unknown{
 const e=(body as {error?:Record<string,unknown>}|null)?.error;if(!e)return undefined;
 const d=e.detail as Record<string,unknown>|undefined;
 return e[camel]??e[snake]??d?.[camel]??d?.[snake];
}
export async function adminJson<T>(method:'GET'|'POST'|'PATCH',path:string,body?:unknown):Promise<ApiResult<T>>{
 const write=method!=='GET';
 const res=await fetch(`${ADMIN_API}${path}`,{method,cache:'no-store',...(write?{headers:{'content-type':'application/json'},body:JSON.stringify(body??{})}:{})});
 const json=await res.json().catch(()=>null);
 return res.ok?{ok:true,status:res.status,data:json as T}:{ok:false,status:res.status,code:errorCode(json,res.status),body:json};
}
```

```tsx
// src/app/(app)/admin/broker-research/_shared/gate.tsx
// Per-page admin gate (the layout does not re-run on client navigation, so every page calls this).
import type {User} from '@supabase/supabase-js';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';

export async function adminGate(next:string):Promise<User|null>{
 try{return await requireAdminUser();}
 catch(e){
  if(e instanceof AdminForbidden)return null;
  if(e instanceof AdminUnauthenticated)redirect(`/login?next=${encodeURIComponent(next)}`);
  throw e;
 }
}
export async function AdminDenied(){
 const t=await getTranslations('foreign-research.admin.denied');
 return <section className="border-y border-border py-8"><h1 className="text-xl font-bold">{t('title')}</h1><p className="mt-2 text-sm text-text-dim">{t('body')}</p></section>;
}
```

```tsx
// src/app/(app)/admin/broker-research/_shared/AdminShell.tsx
'use client';
// Admin frame (AdminOverview artboard): "admin" tag, title, side nav at ≥ lg, wrapping row below.
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';
import type {ReactNode} from 'react';
import {CHIP_ACCENT} from '@/app/(app)/intel/foreign-research/components/ui';

const NAV=[['overview','/admin/broker-research'],['upload','/admin/broker-research/upload'],['licences','/admin/broker-research/licences'],['accessLog','/admin/broker-research/access-log']] as const;
export function AdminShell({children,crumb}:{children:ReactNode;crumb?:string}){
 const t=useTranslations('foreign-research.admin.shell');
 const path=usePathname();
 return (
  <div data-density="data" className="mx-auto flex max-w-[1400px] flex-col gap-4">
   <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3"><span className={CHIP_ACCENT}>admin</span><Link href="/admin/broker-research" className="text-xs text-text-dim">{t('title')}</Link>{crumb?<span className="text-[11px] text-text-muted">/ {crumb}</span>:null}</div>
   <div className="flex flex-col gap-5 lg:flex-row">
    <nav aria-label={t('nav')} className="flex flex-wrap gap-1 lg:w-52 lg:shrink-0 lg:flex-col">
     {NAV.map(([k,href])=>{const on=k==='overview'?path===href:path.startsWith(href);return (
      <Link key={k} href={href} aria-current={on?'page':undefined} className={`rounded-md px-3 py-2 text-xs hover:no-underline ${on?'bg-[var(--accent-wash)] text-accent':'text-text-dim hover:text-text'}`}>{t(`nav_${k}`)}</Link>);})}
    </nav>
    <main className="min-w-0 flex-1">{children}</main>
   </div>
  </div>
 );
}
```

Run: `npm test -- "src/app/(app)/admin/broker-research/_shared/admin-fetch.test.ts"` → 先 FAIL（写测试后），实现后 PASS。

- [ ] **Step 6: 总览页**

```tsx
// src/app/(app)/admin/broker-research/page.tsx
// Admin overview (spec §9.5; AdminOverview artboard).
import {adminReadDeps,loadOverview} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from './_shared/gate';
import {AdminShell} from './_shared/AdminShell';
import {OverviewView} from './OverviewView';

export const dynamic='force-dynamic';

export default async function BrokerResearchAdminPage(){
 if(!await adminGate('/admin/broker-research'))return <AdminDenied/>;
 const data=await loadOverview(adminReadDeps());
 return <AdminShell><OverviewView data={data}/></AdminShell>;
}
```

```tsx
// src/app/(app)/admin/broker-research/OverviewView.tsx
'use client';
// Overview body: public switch + three gates (display only; enabling is the owner's FR-6 step via the
// runbook, so "Enable" stays disabled; "Disable" is offered while on), six count cards, gold receipt,
// recent batches, open quarantine, needs-attention list, review queue and recent documents as entries.
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import type {OverviewData} from '@/lib/broker-research/admin-read';
import {fmtInstant,shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,BTN_PRIMARY,CARD,CHIP,CHIP_ACCENT,CHIP_WARN,EN,ERROR_BAR,H1,H3,TD,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {adminJson,baseCode} from './_shared/admin-fetch';

export function OverviewView({data}:{data:OverviewData}){
 const t=useTranslations('foreign-research.admin.overview');
 const te=useTranslations('foreign-research.admin.errors');
 const locale=useLocale();const router=useRouter();
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const on=data.settings.public_enabled;
 async function disablePublic(){
  setBusy(true);setError(null);
  const r=await adminJson('POST','/settings/public',{enabled:false});
  setBusy(false);
  if(r.ok)router.refresh();else setError(te.has(baseCode(r.code))?te(baseCode(r.code)):te('generic',{code:r.code}));
 }
 const gates=[
  {key:'d1',ok:data.gates.d1.ok,detail:t('gates.d1Detail',{confirmed:data.gates.d1.confirmed,total:data.gates.d1.total})},
  {key:'storage',ok:false,detail:t('gates.storageDetail')},
  {key:'gold',ok:data.gates.gold.ok,detail:data.gold?t('gates.goldDetail',{date:(data.gold.ranAt??'').slice(0,10),n:data.gold.nDocs,passed:String(data.gold.passed)}):t('gates.goldMissing')},
 ];
 const counts=(['toParse','toExtract','toReview','toPublish','published','withdrawn'] as const);
 return (
  <div className="flex flex-col gap-5">
   <h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
   {error?<div role="alert" className={ERROR_BAR}>{error}</div>:null}
   <section className={`${CARD} flex flex-wrap items-start gap-6`} aria-label={t('switch.title')}>
    <div className="flex min-w-[260px] flex-1 flex-col gap-2">
     <div className="flex items-center gap-2"><span className={H3}>{t('switch.title')}</span><span className={on?CHIP_ACCENT:CHIP}>{on?t('switch.on'):t('switch.off')}</span></div>
     <p className="text-xs text-text-dim">{t('switch.body')}</p>
     {on?<button type="button" className={`${BTN} self-start`} disabled={busy} onClick={disablePublic}>{t('switch.disable')}</button>:<button type="button" className={`${BTN_PRIMARY} self-start`} disabled>{t('switch.enable')}</button>}
     <span className={TINY}>{t('switch.ownerOnly')}</span>
    </div>
    <ol className="flex min-w-[300px] flex-1 flex-col gap-2.5">
     {gates.map((g,i)=><li key={g.key} className="flex items-start gap-2.5"><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${g.ok?'border-[var(--border-active)] text-accent':'border-border text-text-dim'}`}>{g.ok?'✓':i+1}</span>
      <div><div className={H3}>{t(`gates.${g.key}`)}<span className="sr-only">{g.ok?t('gates.ok'):t('gates.notOk')}</span></div><div className="text-xs text-text-dim">{g.detail}</div></div></li>)}
    </ol>
   </section>
   <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label={t('counts.title')}>
    {counts.map(k=><div key={k} className={`${CARD} ${k==='toReview'&&data.counts[k]>0?'border-[var(--border-active)]':''}`}><div className="text-[11px] text-text-dim">{t(`counts.${k}`)}</div><div className={`font-mono text-2xl tabular-nums ${k==='toReview'&&data.counts[k]>0?'text-accent':''}`}>{data.counts[k]}</div></div>)}
   </section>
   <div className="grid gap-5 lg:grid-cols-2">
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('gold.title')}</div>
     {data.gold?<dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-text-dim">{t('gold.tuple')}</dt><dd className="break-all font-mono">{[data.gold.tuple.extractorVersion,data.gold.tuple.modelId,data.gold.tuple.registryHash,data.gold.tuple.promptVersion,data.gold.tuple.schemaVersion].map(v=>v??'—').join(' · ')}</dd>
      <dt className="text-text-dim">{t('gold.minima')}</dt><dd className="font-mono">n={data.gold.nDocs} · precision {data.gold.precisionMin??'—'} · recall {data.gold.recallMin??'—'}</dd>
      <dt className="text-text-dim">{t('gold.worst')}</dt><dd className="font-mono">{data.gold.worst?`${data.gold.worst.field} · ${data.gold.worst.metric} ${data.gold.worst.value}`:'—'}</dd>
      <dt className="text-text-dim">passed</dt><dd><span className={data.gold.passed?CHIP_ACCENT:CHIP_WARN}>{String(data.gold.passed)}</span>{data.gold.corpusMatches?null:<span className={`${CHIP_WARN} ml-1.5`}>{t('gold.corpusMismatch')}</span>}</dd>
      <dt className="text-text-dim">{t('gold.code')}</dt><dd className="font-mono">{data.gold.codeVersion??'—'}</dd>
     </dl>:<p className="text-xs text-text-muted">{t('gold.none')}</p>}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('batches.title')}</div>
     {data.batches.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.batches.map(b=><tr key={String(b.batch_id)}><td className={`${TD} font-mono text-text-dim`}>{fmtInstant(String(b.started_at??''),locale)}</td><td className={`${TD} ${TINY}`}>{String(b.producer??'—')}</td><td className={TD}><span className={b.status==='success'?CHIP:CHIP_WARN}>{String(b.status??'—')}</span></td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
    <section className={CARD}>
     <div className="mb-2.5 flex items-center gap-2"><span className={H3}>{t('quarantine.title')}</span><span className={`${data.quarantine.total?CHIP_WARN:CHIP} font-mono`}>{data.quarantine.total}</span><Link href="/admin/dq" className="ml-auto text-xs">{t('quarantine.link')}</Link></div>
     {data.quarantine.rows.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.quarantine.rows.map(q=><tr key={String(q.id)}><td className={`${TD} ${TINY}`}>{String(q.reason_code??'—')}</td><td className={`${TD} break-all font-mono text-text-dim`}>{String(q.natural_key??'—')}</td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('attention.title')}</div>
     {([['mappingUpdates',null],['outboxFailed',null],['licencesPending','/admin/broker-research/licences']] as const).map(([k,href])=>(
      <div key={k} className="flex items-center justify-between py-1.5 text-xs text-text-dim"><span>{t(`attention.${k}`)}</span>
       {href?<Link href={href} className={`${data.attention[k]?CHIP_WARN:CHIP} font-mono hover:no-underline`}>{data.attention[k]}</Link>:<span className={`${data.attention[k]?CHIP_WARN:CHIP} font-mono`}>{data.attention[k]}</span>}</div>))}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('queue.title')}</div>
     {data.reviewQueue.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.reviewQueue.map(r=><tr key={r.report_id}><td className={TD}><Link href={`/admin/broker-research/review/${r.report_id}`} className="font-mono">{shortId(r.report_id)}</Link></td><td className={TD}>{r.title_original??t('queue.untitled')}</td><td className={TD}><span className={CHIP}>{r.review_status}</span></td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('documents.title')}</div>
     {data.recentDocuments.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.recentDocuments.map(d=><tr key={String(d.document_id)}><td className={TD}><Link href={`/admin/broker-research/documents/${String(d.document_id)}`}>{String(d.original_filename??shortId(String(d.document_id)))}</Link></td><td className={`${TD} font-mono text-text-dim`}>{fmtInstant(String(d.uploaded_at??''),locale)}</td><td className={TD}><span className={CHIP}>{String(d.status??'—')}</span></td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
   </div>
  </div>
 );
}
```

- [ ] **Step 7: 上传页（含助手失败测试）**

```ts
// src/app/(app)/admin/broker-research/upload/upload-client.test.ts
import {describe,expect,it} from 'vitest';
import {MAX_BYTES,sha256Hex,sniffPdf,validatePdfFile} from './upload-client';

describe('upload helpers',()=>{
 it('hashes with Web Crypto exactly like sha256sum',async()=>{
  expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 });
 it('checks the %PDF- header and size',async()=>{
  expect(await sniffPdf(new Blob(['%PDF-1.7 ...']))).toBe(true);expect(await sniffPdf(new Blob(['hello']))).toBe(false);
  expect(validatePdfFile({name:'a.pdf',type:'application/pdf',size:10})).toBeNull();
  expect(validatePdfFile({name:'a.txt',type:'text/plain',size:10})).toBe('not_pdf');
  expect(validatePdfFile({name:'a.pdf',type:'application/pdf',size:MAX_BYTES+1})).toBe('too_large');
  expect(validatePdfFile({name:'a.pdf',type:'application/pdf',size:0})).toBe('empty');
 });
});
```

```ts
// src/app/(app)/admin/broker-research/upload/upload-client.ts
// Browser-side upload helpers (spec §6.1 step 1–2): sha256 via Web Crypto, %PDF- sniff, 50 MiB cap
// (bucket limit), and a progress-reporting PUT of the raw bytes to the signed upload URL (the same
// request shape scripts/broker-research/storage-check.ts exercises against the local stack).
export const MAX_BYTES=50*1024*1024;
export async function sha256Hex(blob:Blob):Promise<string>{
 const d=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function sniffPdf(blob:Blob):Promise<boolean>{return new TextDecoder().decode(await blob.slice(0,5).arrayBuffer())==='%PDF-';}
export function validatePdfFile(f:{name:string;type:string;size:number}):'not_pdf'|'too_large'|'empty'|null{
 if(f.type!=='application/pdf'&&!/\.pdf$/i.test(f.name))return 'not_pdf';
 if(f.size===0)return 'empty';
 return f.size>MAX_BYTES?'too_large':null;
}
export function putSigned(url:string,file:Blob,onProgress:(loaded:number,total:number)=>void):Promise<void>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('PUT',url);
  xhr.setRequestHeader('content-type','application/pdf');xhr.setRequestHeader('x-upsert','false');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded,e.total);};
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(`upload_http_${xhr.status}`));
  xhr.onerror=()=>reject(new Error('upload_network'));
  xhr.send(file);
 });
}
```

```tsx
// src/app/(app)/admin/broker-research/upload/page.tsx
import {adminReadDeps,isLicenceConfirmed} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {UploadClient} from './UploadClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchUploadPage(){
 if(!await adminGate('/admin/broker-research/upload'))return <AdminDenied/>;
 const deps=adminReadDeps(),today=deps.now().toISOString().slice(0,10);
 const licences=(await deps.db.listLicences()).map(l=>({licenceId:l.licence_id,label:l.source_label,version:l.version,confirmed:isLicenceConfirmed(l,today),confirmedAt:l.confirmed_at}));
 return <AdminShell><UploadClient licences={licences}/></AdminShell>;
}
```

```tsx
// src/app/(app)/admin/broker-research/upload/UploadClient.tsx
'use client';
// Upload flow (spec §6.1, §9.5; Upload artboard): drop → sha256 → licence → intent (dedupe) → direct
// PUT to the signed URL → commit. The file never passes through the app server.
import {useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {BTN,BTN_GHOST,BTN_PRIMARY,CALLOUT,CARD,CHIP_ACCENT,EN,ERROR_BAR,FIELD_LABEL,H1,INPUT,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {adminJson,baseCode,errorField} from '../_shared/admin-fetch';
import {putSigned,sha256Hex,sniffPdf,validatePdfFile} from './upload-client';

export interface UploadLicence{licenceId:string;label:string;version:number;confirmed:boolean;confirmedAt:string|null}
type Phase='idle'|'hashing'|'ready'|'intent'|'uploading'|'committing'|'done'|'duplicate'|'error';
const STEPS=['drop','sha','dedupe','licence','upload','commit'] as const;
const stepIndex=(p:Phase,hasLicence:boolean)=>p==='idle'?0:p==='hashing'?1:p==='ready'?(hasLicence?3:3):p==='intent'?2:p==='uploading'?4:p==='committing'?5:p==='done'?6:0;

export function UploadClient({licences}:{licences:UploadLicence[]}){
 const t=useTranslations('foreign-research.admin.upload');
 const te=useTranslations('foreign-research.admin.errors');
 const [file,setFile]=useState<File|null>(null);const [sha,setSha]=useState<string|null>(null);
 const [licenceId,setLicenceId]=useState('');const [phase,setPhase]=useState<Phase>('idle');
 const [progress,setProgress]=useState<[number,number]>([0,0]);const [error,setError]=useState<string|null>(null);
 const [documentId,setDocumentId]=useState<string|null>(null);
 const errText=(code:string)=>te.has(baseCode(code))?te(baseCode(code)):te('generic',{code});

 async function choose(f:File|undefined){
  setError(null);setDocumentId(null);setSha(null);setFile(null);
  if(!f)return;
  const bad=validatePdfFile(f);if(bad){setPhase('error');setError(errText(bad));return;}
  setPhase('hashing');
  if(!await sniffPdf(f)){setPhase('error');setError(errText('not_pdf'));return;}
  setFile(f);setSha(await sha256Hex(f));setPhase('ready');
 }
 async function commit(intentId:string,retry=true):Promise<void>{
  const r=await adminJson<{documentId:string}>('POST','/documents/commit',{intentId});
  if(r.ok){setDocumentId(r.data.documentId);setPhase('done');return;}
  if(r.code==='intent_busy'&&retry){await new Promise(res=>setTimeout(res,1500));return commit(intentId,false);}
  if(r.code==='duplicate_document'){const id=errorField(r.body,'documentId','document_id');setDocumentId(typeof id==='string'?id:null);setPhase('duplicate');return;}
  setPhase('error');setError(errText(r.code));
 }
 async function upload(){
  if(!file||!sha||!licenceId)return;
  setError(null);setPhase('intent');
  const r=await adminJson<{intentId:string;uploadUrl:string;token:string}>('POST','/documents/intent',{sha256:sha,byte_size:file.size,licence_id:licenceId,original_filename:file.name});
  if(!r.ok){
   if(r.code==='duplicate_document'){const id=errorField(r.body,'documentId','document_id');setDocumentId(typeof id==='string'?id:null);setPhase('duplicate');return;}
   setPhase('error');setError(errText(r.code));return;
  }
  setPhase('uploading');setProgress([0,file.size]);
  try{await putSigned(r.data.uploadUrl,file,(a,b)=>setProgress([a,b]));}
  catch{setPhase('error');setError(errText('upload_failed'));return;}
  setPhase('committing');await commit(r.data.intentId);
 }
 const cur=stepIndex(phase,licenceId!=='');
 const mb=(n:number)=>(n/1048576).toFixed(1);
 return (
  <div className="flex flex-col gap-5">
   <h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
   <ol className="flex flex-wrap gap-4">{STEPS.map((s,i)=><li key={s} className="flex items-center gap-1.5 text-xs" aria-current={i===cur?'step':undefined}>
    <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${i<cur?'border-[var(--border-active)] text-accent':i===cur?'border-accent text-text':'border-border text-text-muted'}`}>{i<cur?'✓':i+1}</span><span className={i===cur?'text-text':'text-text-dim'}>{t(`steps.${s}`)}</span></li>)}</ol>
   <div className="grid items-start gap-5 lg:grid-cols-12">
    <section className={`${CARD} flex flex-col gap-4 lg:col-span-7`}>
     <label onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void choose(e.dataTransfer.files[0]);}} className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-7 text-center hover:border-[var(--border-active)]">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
      <span className="text-xs text-text-dim">{t('drop')}</span><span className={TINY}>{t('dropNote')}</span>
      <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={e=>void choose(e.target.files?.[0])}/>
     </label>
     {file?<dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-text-dim">{t('file')}</dt><dd className="break-all">{file.name} · <span className="font-mono">{mb(file.size)} MB</span></dd>
      <dt className="text-text-dim">sha256</dt><dd className="break-all font-mono text-text-dim">{sha??t('hashing')}</dd>
     </dl>:null}
     <div><label htmlFor="up-licence" className={FIELD_LABEL}>{t('licence')}</label>
      <select id="up-licence" className={INPUT} value={licenceId} onChange={e=>setLicenceId(e.target.value)} disabled={!sha||phase==='uploading'||phase==='committing'}>
       <option value="">{t('licencePlaceholder')}</option>
       {licences.map(l=><option key={l.licenceId} value={l.licenceId}>{l.label} · v{l.version} · {l.confirmed?t('confirmed',{date:(l.confirmedAt??'').slice(0,10)}):t('unconfirmed')}</option>)}
      </select><p className={`${TINY} mt-1`}>{t('licenceHelp')}</p></div>
     <div className="flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={!sha||!licenceId||phase!=='ready'} onClick={()=>void upload()}>{t('submit')}</button><button type="button" className={BTN_GHOST} onClick={()=>void choose(undefined)}>{t('cancel')}</button></div>
    </section>
    <div className="flex flex-col gap-4 lg:col-span-5">
     {phase==='uploading'||phase==='committing'?<section className={`${CARD} flex flex-col gap-2.5`}>
      <div className={TINY}>{phase==='uploading'?t('uploading'):t('committing')}</div>
      <div className="h-1.5 overflow-hidden rounded bg-bg-elevated" role="progressbar" aria-valuemin={0} aria-valuemax={progress[1]} aria-valuenow={progress[0]}><div className="h-full bg-accent" style={{width:`${progress[1]?Math.round(progress[0]/progress[1]*100):0}%`}}/></div>
      <div className={TINY}><span className="font-mono">{mb(progress[0])} / {mb(progress[1])} MB</span> · {t('direct')}</div>
     </section>:null}
     {phase==='duplicate'?<section className={CALLOUT}>{t('duplicate')} {documentId?<Link href={`/admin/broker-research/documents/${documentId}`}>{t('openDocument')}</Link>:null}</section>:null}
     {phase==='done'&&documentId?<section className={`${CARD} flex flex-col gap-2`}><span className={`${CHIP_ACCENT} self-start`}>{t('done')}</span><Link href={`/admin/broker-research/documents/${documentId}`} className="text-xs">{t('openDocument')}</Link></section>:null}
     {error?<div role="alert" className={ERROR_BAR}>{error}{phase==='error'&&file?<button type="button" className={`${BTN} ml-auto`} onClick={()=>setPhase(sha?'ready':'idle')}>{t('retry')}</button>:null}</div>:null}
    </div>
   </div>
  </div>
 );
}
```

- [ ] **Step 8: 许可页与访问日志页（含助手失败测试）**

```ts
// src/app/(app)/admin/broker-research/licences/licence-form.test.ts
import {describe,expect,it} from 'vitest';
import {emptyLicenceForm,toLicenceInput,validateLicenceForm} from './licence-form';

describe('licence form',()=>{
 it('validates labels, N ≤ 500 and dates',()=>{
  expect(validateLicenceForm(emptyLicenceForm('2026-11-06'))).toEqual(expect.arrayContaining(['source_label','holder','terms_summary']));
  const ok={...emptyLicenceForm('2026-11-06'),source_label:'Synthetic',holder:'Owner',terms_summary:'Terms'};
  expect(validateLicenceForm(ok)).toEqual([]);
  expect(validateLicenceForm({...ok,snippet_max_chars:'501'})).toEqual(['snippet_max_chars']);
  expect(validateLicenceForm({...ok,snippet_max_chars:'abc'})).toEqual(['snippet_max_chars']);
  expect(validateLicenceForm({...ok,valid_to:'2026-01-01',valid_from:'2026-02-01'})).toEqual(['valid_to']);
  expect(validateLicenceForm({...ok,source_label:'x'.repeat(121)})).toEqual(['source_label']);
 });
 it('serialises to LicenceInput with nulls for empty optionals',()=>{
  const f={...emptyLicenceForm('2026-11-06'),source_label:' Synthetic ',holder:'Owner',terms_summary:'Terms',allows_public_metadata:true};
  expect(toLicenceInput(f)).toMatchObject({source_label:'Synthetic',evidence_path:null,valid_to:null,snippet_max_chars:0,allows_public_metadata:true,allows_public_target_price:false});
 });
});
```

```ts
// src/app/(app)/admin/broker-research/licences/licence-form.ts
// Licence form state ⇄ LicenceInput (spec §4.1; D2/D3 defaults: N ≤ 500, every public flag false).
import type {LicenceInput,LicenceKind,LicenceRow} from '@/lib/broker-research/types';

export const LICENCE_KINDS:LicenceKind[]=['terminal_subscription','direct_from_broker','owner_authored','other'];
export const FLAGS=['allows_llm_processing','allows_public_metadata','allows_public_snippets','allows_public_summary','allows_public_target_price'] as const;
export type LicenceForm={source_label:string;licence_kind:LicenceKind;holder:string;terms_summary:string;evidence_path:string;snippet_max_chars:string;valid_from:string;valid_to:string}&Record<typeof FLAGS[number],boolean>;
export const emptyLicenceForm=(today:string):LicenceForm=>({source_label:'',licence_kind:'other',holder:'',terms_summary:'',evidence_path:'',snippet_max_chars:'0',valid_from:today,valid_to:'',
 allows_llm_processing:false,allows_public_metadata:false,allows_public_snippets:false,allows_public_summary:false,allows_public_target_price:false});
export const formFromLicence=(l:LicenceRow):LicenceForm=>({source_label:l.source_label,licence_kind:l.licence_kind,holder:l.holder,terms_summary:l.terms_summary,evidence_path:l.evidence_path??'',
 snippet_max_chars:String(l.snippet_max_chars),valid_from:l.valid_from,valid_to:l.valid_to??'',...Object.fromEntries(FLAGS.map(f=>[f,l[f]])) as Record<typeof FLAGS[number],boolean>});
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export function validateLicenceForm(f:LicenceForm):string[]{
 const bad:string[]=[];
 const label=f.source_label.trim();if(label.length<1||label.length>120)bad.push('source_label');
 if(!f.holder.trim())bad.push('holder');if(!f.terms_summary.trim())bad.push('terms_summary');
 if(!/^\d{1,3}$/.test(f.snippet_max_chars)||Number(f.snippet_max_chars)>500)bad.push('snippet_max_chars');
 if(!DATE.test(f.valid_from))bad.push('valid_from');
 if(f.valid_to&&(!DATE.test(f.valid_to)||f.valid_to<f.valid_from))bad.push('valid_to');
 return bad;
}
export const toLicenceInput=(f:LicenceForm):LicenceInput=>({source_label:f.source_label.trim(),licence_kind:f.licence_kind,holder:f.holder.trim(),terms_summary:f.terms_summary.trim(),evidence_path:f.evidence_path.trim()||null,
 snippet_max_chars:Number(f.snippet_max_chars),valid_from:f.valid_from,valid_to:f.valid_to||null,...Object.fromEntries(FLAGS.map(k=>[k,f[k]])) as Record<typeof FLAGS[number],boolean>});
```

```tsx
// src/app/(app)/admin/broker-research/licences/page.tsx
import {adminReadDeps,loadLicences} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {LicencesClient} from './LicencesClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchLicencesPage(){
 if(!await adminGate('/admin/broker-research/licences'))return <AdminDenied/>;
 const deps=adminReadDeps();
 return <AdminShell><LicencesClient views={await loadLicences(deps)} today={deps.now().toISOString().slice(0,10)}/></AdminShell>;
}
```

```tsx
// src/app/(app)/admin/broker-research/licences/LicencesClient.tsx
'use client';
// Licences (spec §4.1, §9.5; Licences artboard): list with version and confirmation state, create/edit
// form, "confirm v{n}" (409 version_mismatch → reload), and the impact panel of the selected licence.
// A material change bumps the version in SQL; the row then shows "pending confirmation".
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import type {LicenceView} from '@/lib/broker-research/admin-read';
import {BTN,BTN_GHOST,BTN_PRIMARY,CARD,CARD_FLUSH,CHIP_ACCENT,CHIP_WARN,EN,ERROR_BAR,FIELD_LABEL,H1,H3,INPUT,TD,TH,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {adminJson,baseCode} from '../_shared/admin-fetch';
import {FLAGS,LICENCE_KINDS,emptyLicenceForm,formFromLicence,toLicenceInput,validateLicenceForm} from './licence-form';
import type {LicenceForm} from './licence-form';

export function LicencesClient({views,today}:{views:LicenceView[];today:string}){
 const t=useTranslations('foreign-research.admin.licences');
 const te=useTranslations('foreign-research.admin.errors');
 const router=useRouter();
 const [editing,setEditing]=useState<string|'new'|null>(null);
 const [form,setForm]=useState<LicenceForm>(emptyLicenceForm(today));
 const [selected,setSelected]=useState<string|null>(views[0]?.licence.licence_id??null);
 const [bad,setBad]=useState<string[]>([]);const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const errText=(code:string)=>te.has(baseCode(code))?te(baseCode(code)):te('generic',{code});
 const sel=views.find(v=>v.licence.licence_id===selected)??null;
 const allowed=(v:LicenceView)=>[v.licence.allows_public_metadata&&t('flagsShort.metadata'),v.licence.allows_public_target_price&&t('flagsShort.target'),v.licence.allows_public_snippets&&t('flagsShort.snippets',{n:v.licence.snippet_max_chars}),v.licence.allows_public_summary&&t('flagsShort.summary')].filter(Boolean).join(' · ')||t('flagsShort.none');
 async function save(){
  const b=validateLicenceForm(form);setBad(b);if(b.length)return;
  setBusy(true);setError(null);
  const r=editing==='new'?await adminJson('POST','/licences',toLicenceInput(form)):await adminJson('PATCH',`/licences/${editing}`,toLicenceInput(form));
  setBusy(false);
  if(r.ok){setEditing(null);router.refresh();}else setError(errText(r.code));
 }
 async function confirm(v:LicenceView){
  setBusy(true);setError(null);
  const r=await adminJson('POST',`/licences/${v.licence.licence_id}/confirm`,{version:v.licence.version});
  setBusy(false);
  if(!r.ok)setError(errText(r.code));
  router.refresh();
 }
 const field=(k:'source_label'|'holder'|'terms_summary'|'evidence_path'|'valid_from'|'valid_to'|'snippet_max_chars',type='text')=>(
  <div><label htmlFor={`lic-${k}`} className={FIELD_LABEL}>{t(`form.${k}`)}</label>
   <input id={`lic-${k}`} type={type} className={`${INPUT} ${bad.includes(k)?'border-danger':''}`} aria-invalid={bad.includes(k)} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>
   {bad.includes(k)?<p className="mt-1 text-[11px] text-danger">{t(`invalid.${k}`)}</p>:null}</div>);
 return (
  <div className="flex flex-col gap-5">
   <div className="flex flex-wrap items-center gap-3"><h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
    <button type="button" className={`${BTN_PRIMARY} ml-auto`} onClick={()=>{setEditing('new');setForm(emptyLicenceForm(today));setBad([]);}}>{t('new')}</button></div>
   {error?<div role="alert" className={ERROR_BAR}>{error}</div>:null}
   <section className={`${CARD_FLUSH} overflow-x-auto`}>
    <table className="w-full min-w-[760px] text-sm">
     <thead className="border-b border-border"><tr>{(['licence','version','status','allowed','documents','snippets',''] as const).map(c=><th key={c||'act'} scope="col" className={`${TH} ${c==='licence'?'pl-4':''} ${c==='documents'||c==='snippets'?'text-right':''}`}>{c?t(`columns.${c}`):<span className="sr-only">{t('columns.actions')}</span>}</th>)}</tr></thead>
     <tbody className="divide-y divide-border">{views.map(v=>(
      <tr key={v.licence.licence_id} className={v.pending?'bg-[var(--accent-wash)]':''}>
       <td className={`${TD} pl-4`}><button type="button" className="text-left text-text hover:text-accent" onClick={()=>setSelected(v.licence.licence_id)}>{v.licence.source_label}</button></td>
       <td className={`${TD} font-mono`}>{v.pending&&v.licence.confirmed_version!==null?`v${v.licence.confirmed_version} → v${v.licence.version}`:`v${v.licence.version}`}</td>
       <td className={TD}>{v.pending?<span className={CHIP_WARN}>{t('pending')}</span>:v.confirmed?<span className={CHIP_ACCENT}>{t('confirmedOn',{date:(v.licence.confirmed_at??'').slice(0,10)})}</span>:<span className={CHIP_WARN}>{t('outOfWindow')}</span>}</td>
       <td className={`${TD} text-xs text-text-dim`}>{allowed(v)}</td>
       <td className={`${TD} text-right font-mono`}>{v.documents}</td><td className={`${TD} text-right font-mono`}>{v.approvedSnippets}</td>
       <td className={`${TD} whitespace-nowrap pr-4`}>
        {v.pending?<button type="button" className={BTN} disabled={busy} onClick={()=>void confirm(v)}>{t('confirm',{version:v.licence.version})}</button>:null}
        <button type="button" className={BTN_GHOST} onClick={()=>{setEditing(v.licence.licence_id);setForm(formFromLicence(v.licence));setBad([]);}}>{t('edit')}</button>
       </td>
      </tr>))}</tbody>
    </table>
    {views.length===0?<p className="px-4 py-3 text-xs text-text-muted">{t('empty')}</p>:null}
   </section>
   <div className="grid items-start gap-5 lg:grid-cols-2">
    {editing?<section className={`${CARD} flex flex-col gap-3.5`}>
     <div className={TINY}>{editing==='new'?t('form.newTitle'):t('form.editTitle')}</div>
     {field('source_label')}
     <div><label htmlFor="lic-kind" className={FIELD_LABEL}>{t('form.licence_kind')}</label><select id="lic-kind" className={INPUT} value={form.licence_kind} onChange={e=>setForm({...form,licence_kind:e.target.value as LicenceForm['licence_kind']})}>{LICENCE_KINDS.map(k=><option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></div>
     {field('holder')}{field('terms_summary')}{field('evidence_path')}
     <fieldset className="flex flex-col gap-2"><legend className="mb-1.5 text-xs text-text-dim">{t('form.flags')}</legend>
      {FLAGS.map(k=><label key={k} className="flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form[k]} onChange={e=>setForm({...form,[k]:e.target.checked})}/>{t(`flags.${k}`)}</label>)}
     </fieldset>
     {field('snippet_max_chars','number')}
     <div className="grid gap-3 sm:grid-cols-2">{field('valid_from','date')}{field('valid_to','date')}</div>
     <p className={TINY}>{t('form.materialNote')}</p>
     <div className="flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={()=>void save()}>{t('form.save')}</button><button type="button" className={BTN_GHOST} onClick={()=>setEditing(null)}>{t('form.cancel')}</button></div>
    </section>:null}
    {sel?<section className={`${CARD} flex flex-col gap-3`}>
     <div className={TINY}>{t('impact.title',{label:sel.licence.source_label})}</div>
     <table className="w-full text-xs"><tbody className="divide-y divide-border">
      {(['publishedReports','hiddenReports','approvedSnippets','approvedSummaries','revertedTexts'] as const).map(k=><tr key={k}><td className={`${TD} text-text-dim`}>{t(`impact.${k}`)}</td><td className={`${TD} text-right font-mono`}>{sel[k]}</td></tr>)}
     </tbody></table>
     <p className={TINY}>{t('impact.note')}</p>
     <div className={H3}>{t('impact.window')}</div>
     <p className="font-mono text-xs text-text-dim">{sel.licence.valid_from} → {sel.licence.valid_to??'∞'}</p>
    </section>:null}
   </div>
  </div>
 );
}
```

```ts
// src/app/(app)/admin/broker-research/access-log/access-log-csv.test.ts
import {describe,expect,it} from 'vitest';
import {toCsv} from './access-log-csv';
describe('access log CSV',()=>{
 it('quotes fields and neutralises formula injection',()=>{
  const csv=toCsv([{id:'1',created_at:'2026-11-01T00:00:00Z',user_id:'u',action:'text_viewed',document_id:null,detail:{page:2,note:'=cmd "x"'}}]);
  expect(csv.split('\n')[0]).toBe('id,created_at,user_id,action,document_id,detail');
  expect(csv.split('\n')[1]).toBe('"1","2026-11-01T00:00:00Z","u","text_viewed","","{""page"":2,""note"":""=cmd \\""x\\""""}"');
  expect(toCsv([{id:'=1',created_at:'',user_id:'+u',action:'upload',document_id:'-d',detail:{}}]).split('\n')[1]).toBe(`"'=1","","'+u","upload","'-d","{}"`);
 });
});
```

```ts
// src/app/(app)/admin/broker-research/access-log/access-log-csv.ts
// CSV export of the access log (AccessLog artboard): every field quoted, quotes doubled, and cells
// starting with = + - @ prefixed with ' so spreadsheets do not evaluate them.
import type {AccessLogView} from '@/lib/broker-research/admin-read';
const cell=(v:string)=>`"${(/^[=+\-@]/.test(v)?`'${v}`:v).replace(/"/g,'""')}"`;
export function toCsv(rows:AccessLogView[]):string{
 const head='id,created_at,user_id,action,document_id,detail';
 return [head,...rows.map(r=>[r.id,r.created_at,r.user_id,r.action,r.document_id??'',JSON.stringify(r.detail??{})].map(cell).join(','))].join('\n');
}
```

```tsx
// src/app/(app)/admin/broker-research/access-log/page.tsx
import {UUID_RE} from '@/lib/facts/public-route';
import {adminReadDeps,loadAccessLog} from '@/lib/broker-research/admin-read';
import {AdminDenied,adminGate} from '../_shared/gate';
import {AdminShell} from '../_shared/AdminShell';
import {AccessLogClient} from './AccessLogClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchAccessLogPage({searchParams}:{searchParams:Promise<{document?:string}>}){
 if(!await adminGate('/admin/broker-research/access-log'))return <AdminDenied/>;
 const {document}=await searchParams;
 const documentId=document&&UUID_RE.test(document)?document.toLowerCase():undefined;
 const rows=await loadAccessLog(adminReadDeps(),{documentId,limit:500});
 return <AdminShell><AccessLogClient rows={rows} documentId={documentId??null}/></AdminShell>;
}
```

```tsx
// src/app/(app)/admin/broker-research/access-log/AccessLogClient.tsx
'use client';
// Access log (spec §4.10; AccessLog artboard): append-only, newest first, filters by admin and action
// (client side over the loaded 500 rows), document filter via ?document=, CSV export. No IP is stored.
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {AccessLogView} from '@/lib/broker-research/admin-read';
import {fmtInstant,shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,CARD_FLUSH,CHIP,EN,H1,INPUT,TD,TH} from '@/app/(app)/intel/foreign-research/components/ui';
import {toCsv} from './access-log-csv';

export function AccessLogClient({rows,documentId}:{rows:AccessLogView[];documentId:string|null}){
 const t=useTranslations('foreign-research.admin.accessLog');
 const locale=useLocale();
 const [user,setUser]=useState('');const [action,setAction]=useState('');
 const users=useMemo(()=>[...new Set(rows.map(r=>r.user_id))].sort(),[rows]);
 const actions=useMemo(()=>[...new Set(rows.map(r=>r.action))].sort(),[rows]);
 const shown=rows.filter(r=>(!user||r.user_id===user)&&(!action||r.action===action));
 function exportCsv(){
  const url=URL.createObjectURL(new Blob([toCsv(shown)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`broker-research-access-log-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
 }
 return (
  <div className="flex flex-col gap-4">
   <h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
   <p className="max-w-[72ch] text-xs text-text-dim">{t('intro')}</p>
   <div className="flex flex-wrap items-center gap-3">
    <select aria-label={t('filters.user')} className={`${INPUT} w-56`} value={user} onChange={e=>setUser(e.target.value)}><option value="">{t('filters.user')} · {t('filters.all')}</option>{users.map(u=><option key={u} value={u}>{shortId(u)}</option>)}</select>
    <select aria-label={t('filters.action')} className={`${INPUT} w-56`} value={action} onChange={e=>setAction(e.target.value)}><option value="">{t('filters.action')} · {t('filters.all')}</option>{actions.map(a=><option key={a} value={a}>{a}</option>)}</select>
    {documentId?<Link href="/admin/broker-research/access-log" className={CHIP}>{t('filters.document',{id:shortId(documentId)})} ×</Link>:null}
    <button type="button" className={`${BTN} ml-auto`} onClick={exportCsv} disabled={shown.length===0}>{t('export')}</button>
   </div>
   <section className={`${CARD_FLUSH} overflow-x-auto`}>
    <table className="w-full min-w-[760px] text-sm">
     <thead className="border-b border-border"><tr>{(['at','user','action','object','detail'] as const).map(c=><th key={c} scope="col" className={`${TH} ${c==='at'?'pl-4':''}`}>{t(`columns.${c}`)}</th>)}</tr></thead>
     <tbody className="divide-y divide-border">{shown.map(r=>(
      <tr key={r.id}>
       <td className={`${TD} whitespace-nowrap pl-4 font-mono text-text-dim`}>{fmtInstant(r.created_at,locale)}</td>
       <td className={`${TD} font-mono text-xs`} title={r.user_id}>{shortId(r.user_id)}</td>
       <td className={TD}><span className={CHIP}>{r.action}</span></td>
       <td className={`${TD} font-mono text-xs`}>{r.document_id?<Link href={`/admin/broker-research/documents/${r.document_id}`}>{shortId(r.document_id)}</Link>:'—'}</td>
       <td className={`${TD} max-w-[24rem] break-all pr-4 font-mono text-[11px] text-text-dim`}>{JSON.stringify(r.detail??{})}</td>
      </tr>))}</tbody>
    </table>
    {shown.length===0?<p className="px-4 py-3 text-xs text-text-muted">{t('empty')}</p>:null}
   </section>
  </div>
 );
}
```

- [ ] **Step 9: 追加管理员文案（两个 JSON 顶层加 `"admin"`；D5 再往 `admin` 里加键）**

zh（`messages/zh/foreign-research.json` 顶层，`"fields"` 之后）：

```json
  "admin": {
    "denied": {"title": "无权访问", "body": "此页面仅限管理员。"},
    "shell": {"title": "研报管理", "nav": "研报管理导航", "nav_overview": "总览", "nav_upload": "上传", "nav_licences": "许可", "nav_accessLog": "访问日志"},
    "errors": {
      "generic": "操作失败（{code}）",
      "duplicate_document": "同一 sha256 已存在，不重复存储。",
      "intent_mismatch": "上传意向不匹配或已过期，请重新选择文件。",
      "intent_busy": "另一个提交正在处理这个意向，请稍后重试。",
      "intent_expired": "上传意向已过期，请重新选择文件。",
      "promotion_lost": "暂存与正式对象都不存在（promotion_lost），请重新上传同一文件。",
      "promotion_pending": "文档提升尚未完成。",
      "sha_mismatch": "服务端复算的 sha256 与浏览器不一致。",
      "size_mismatch": "文件大小与声明不一致。",
      "not_pdf": "只接受 PDF 文件。",
      "too_large": "文件超过 50 MiB。",
      "empty": "文件为空。",
      "upload_failed": "直传到私有桶失败。",
      "lease_held": "另一个处理正在占用这份文档，请稍后再试。",
      "licence_forbids_processing": "许可不允许把全文送交处理。",
      "version_mismatch": "许可版本已变化，请刷新后再确认。",
      "publish_blocked": "存在发布阻断项。",
      "published_immutable": "已发布报告不可修改，请先取消发布。",
      "document_withdrawn": "文档已撤回。",
      "access_log_failed": "访问日志写入失败，未返回内容。",
      "llm_unavailable": "平台 LLM 未启用。",
      "f3_unavailable": "文档管道（F3）未启用。",
      "hook_params_required": "缺少处理参数。"
    },
    "overview": {
      "title": "总览", "titleEn": "Overview",
      "switch": {"title": "对外开关", "on": "开启", "off": "关闭", "body": "开关在数据库层（broker_research_settings.public_enabled）。关闭时公开视图返回 0 行、公开路由 404；管理员只看预览。", "enable": "打开对外", "disable": "关闭对外", "ownerOnly": "打开由 owner 在三项门禁完成后按 runbook 执行（FR-6）；本页只显示门禁状态。"},
      "gates": {"d1": "D1 许可确认", "storage": "test:storage 回执", "gold": "黄金集回执", "ok": "已满足", "notOk": "未满足", "d1Detail": "当前有效且已确认的许可 {confirmed} / {total}", "storageDetail": "人工门禁：本地 Supabase 栈运行 npm run test:storage，回执在审计目录；本页无法核对。", "goldDetail": "{date} · n={n} · passed {passed}", "goldMissing": "尚无 gold 回执"},
      "counts": {"title": "计数", "toParse": "待解析", "toExtract": "待抽取", "toReview": "待复核", "toPublish": "待发布", "published": "已发布", "withdrawn": "已撤回"},
      "gold": {"title": "黄金集最新回执", "tuple": "五元组", "minima": "最小值", "worst": "最差字段", "corpusMismatch": "清单哈希与批准值不符", "code": "代码版本", "none": "尚无 gold 回执"},
      "batches": {"title": "最近批次"},
      "quarantine": {"title": "open 隔离项", "link": "/admin/dq →"},
      "attention": {"title": "需要处理", "mappingUpdates": "有更新映射可用的已发布报告", "outboxFailed": "outbox 失败事件", "licencesPending": "许可实质性修改后待确认"},
      "queue": {"title": "复核队列", "untitled": "（无标题）"},
      "documents": {"title": "最近文档"},
      "empty": "暂无"
    },
    "upload": {
      "title": "上传研报", "titleEn": "Upload",
      "steps": {"drop": "拖拽", "sha": "sha256", "dedupe": "查重", "licence": "选许可", "upload": "直传", "commit": "提交"},
      "drop": "拖拽 PDF 到此处，或点击选择文件", "dropNote": "只接受 owner 合法持有的 PDF；不抓取付费墙或第三方网站",
      "file": "文件", "hashing": "本地计算中…", "licence": "许可（必填）", "licencePlaceholder": "选择许可", "confirmed": "已确认 {date}", "unconfirmed": "未确认",
      "licenceHelp": "每份文件绑定一条版本化许可；许可决定目标价与片段能否公开。",
      "submit": "直传到私有桶", "cancel": "取消", "uploading": "直传中", "committing": "提交中", "direct": "直传 broker-research 私有桶，不经应用服务器",
      "duplicate": "同一 sha256 已存在，不重复存储。", "openDocument": "打开文档页 →", "done": "提交完成", "retry": "重试"
    },
    "licences": {
      "title": "许可", "titleEn": "Licences", "new": "新建许可",
      "columns": {"licence": "许可", "version": "版本", "status": "状态", "allowed": "允许公开", "documents": "文档", "snippets": "公开片段", "actions": "操作"},
      "pending": "待确认（实质性修改）", "confirmedOn": "已确认 {date}", "outOfWindow": "未确认或不在有效期", "confirm": "确认 v{version}", "edit": "编辑", "empty": "尚无许可",
      "flagsShort": {"metadata": "元数据", "target": "目标价", "snippets": "片段 ≤ {n} 字", "summary": "摘要", "none": "不允许公开"},
      "form": {"source_label": "名称", "licence_kind": "类型", "holder": "持有人", "terms_summary": "条款摘要", "evidence_path": "依据文件路径（licences/'{sha}'.pdf）", "snippet_max_chars": "片段上限 N（≤ 500）", "valid_from": "生效日", "valid_to": "到期日（可空）", "newTitle": "新建许可", "editTitle": "编辑许可", "flags": "允许", "materialNote": "改动公开标志、N 或有效期是实质性修改：版本 +1、确认清空、受影响片段与摘要回草稿。", "save": "保存", "cancel": "取消"},
      "invalid": {"source_label": "1–120 字", "holder": "必填", "terms_summary": "必填", "evidence_path": "路径无效", "snippet_max_chars": "0–500 的整数", "valid_from": "日期无效", "valid_to": "不能早于生效日"},
      "kinds": {"terminal_subscription": "终端订阅", "direct_from_broker": "券商直接提供", "owner_authored": "owner 自撰", "other": "其他"},
      "flags": {"allows_llm_processing": "允许送交 F3 / 平台 LLM 处理", "allows_public_metadata": "元数据（机构、标题、日期、评级）", "allows_public_snippets": "片段", "allows_public_summary": "独立摘要", "allows_public_target_price": "目标价"},
      "impact": {"title": "影响 · {label}", "publishedReports": "已发布报告", "hiddenReports": "披露待重查而隐藏的报告", "approvedSnippets": "已批准片段", "approvedSummaries": "已批准摘要", "revertedTexts": "因修改回到草稿的片段与摘要", "note": "确认新版本后，回到草稿的内容需重新批准才会公开。", "window": "有效期"}
    },
    "accessLog": {
      "title": "访问日志", "titleEn": "Access log", "intro": "每次返回全文、跨度或签名 URL 的请求都先写一行，再返回内容。只追加，不可编辑；不记 IP。",
      "filters": {"user": "管理员", "action": "动作", "all": "全部", "document": "文档 {id}"},
      "export": "导出 CSV",
      "columns": {"at": "时间", "user": "管理员", "action": "动作", "object": "对象", "detail": "详情"},
      "empty": "暂无记录"
    }
  }
```

en（同结构同键同占位符）：

```json
  "admin": {
    "denied": {"title": "Access denied", "body": "This page is for admins only."},
    "shell": {"title": "Broker research admin", "nav": "Broker research admin navigation", "nav_overview": "Overview", "nav_upload": "Upload", "nav_licences": "Licences", "nav_accessLog": "Access log"},
    "errors": {
      "generic": "Action failed ({code})",
      "duplicate_document": "A document with this sha256 already exists; it is not stored twice.",
      "intent_mismatch": "The upload intent does not match or has expired; choose the file again.",
      "intent_busy": "Another commit is processing this intent; try again shortly.",
      "intent_expired": "The upload intent expired; choose the file again.",
      "promotion_lost": "Neither the staged nor the final object exists (promotion_lost); upload the same file again.",
      "promotion_pending": "Document promotion has not finished.",
      "sha_mismatch": "The server-side sha256 differs from the browser's.",
      "size_mismatch": "The file size differs from the declared size.",
      "not_pdf": "Only PDF files are accepted.",
      "too_large": "The file exceeds 50 MiB.",
      "empty": "The file is empty.",
      "upload_failed": "The direct upload to the private bucket failed.",
      "lease_held": "Another job holds this document; try again later.",
      "licence_forbids_processing": "The licence does not allow sending the full text for processing.",
      "version_mismatch": "The licence version changed; refresh and confirm again.",
      "publish_blocked": "Publish blockers remain.",
      "published_immutable": "A published report cannot be changed; unpublish it first.",
      "document_withdrawn": "The document is withdrawn.",
      "access_log_failed": "Writing the access log failed; nothing was returned.",
      "llm_unavailable": "The platform LLM is not enabled.",
      "f3_unavailable": "The document pipeline (F3) is not enabled.",
      "hook_params_required": "Processing parameters are missing."
    },
    "overview": {
      "title": "Overview", "titleEn": "总览",
      "switch": {"title": "Public switch", "on": "on", "off": "off", "body": "The switch lives in the database (broker_research_settings.public_enabled). While off, public views return 0 rows and public routes 404; admins see previews only.", "enable": "Enable public", "disable": "Disable public", "ownerOnly": "Enabling is the owner's FR-6 step after the three gates, following the runbook; this page only shows the gates."},
      "gates": {"d1": "D1 licence confirmation", "storage": "test:storage receipt", "gold": "Gold set receipt", "ok": "met", "notOk": "not met", "d1Detail": "Licences confirmed and in force: {confirmed} / {total}", "storageDetail": "Manual gate: run npm run test:storage on the local Supabase stack; the receipt is in the audit folder and cannot be checked here.", "goldDetail": "{date} · n={n} · passed {passed}", "goldMissing": "No gold receipt yet"},
      "counts": {"title": "Counts", "toParse": "To parse", "toExtract": "To extract", "toReview": "To review", "toPublish": "To publish", "published": "Published", "withdrawn": "Withdrawn"},
      "gold": {"title": "Latest gold receipt", "tuple": "Tuple", "minima": "Minima", "worst": "Worst field", "corpusMismatch": "Corpus hash differs from the approved one", "code": "Code version", "none": "No gold receipt yet"},
      "batches": {"title": "Recent batches"},
      "quarantine": {"title": "Open quarantine", "link": "/admin/dq →"},
      "attention": {"title": "Needs attention", "mappingUpdates": "Published reports with a newer mapping available", "outboxFailed": "Failed outbox events", "licencesPending": "Licences pending confirmation after a material change"},
      "queue": {"title": "Review queue", "untitled": "(untitled)"},
      "documents": {"title": "Recent documents"},
      "empty": "None"
    },
    "upload": {
      "title": "Upload report", "titleEn": "上传研报",
      "steps": {"drop": "Drop", "sha": "sha256", "dedupe": "Dedupe", "licence": "Licence", "upload": "Upload", "commit": "Commit"},
      "drop": "Drop a PDF here, or click to choose a file", "dropNote": "Only PDFs the owner lawfully holds; no paywall or third-party scraping",
      "file": "File", "hashing": "Hashing locally…", "licence": "Licence (required)", "licencePlaceholder": "Choose a licence", "confirmed": "confirmed {date}", "unconfirmed": "unconfirmed",
      "licenceHelp": "Each file binds one versioned licence; the licence decides whether targets and snippets may be public.",
      "submit": "Upload to the private bucket", "cancel": "Cancel", "uploading": "Uploading", "committing": "Committing", "direct": "direct to the private broker-research bucket, not through the app server",
      "duplicate": "A document with this sha256 already exists; it is not stored twice.", "openDocument": "Open document →", "done": "Committed", "retry": "Retry"
    },
    "licences": {
      "title": "Licences", "titleEn": "许可", "new": "New licence",
      "columns": {"licence": "Licence", "version": "Version", "status": "Status", "allowed": "Public", "documents": "Documents", "snippets": "Public snippets", "actions": "Actions"},
      "pending": "Pending (material change)", "confirmedOn": "Confirmed {date}", "outOfWindow": "Unconfirmed or out of term", "confirm": "Confirm v{version}", "edit": "Edit", "empty": "No licences yet",
      "flagsShort": {"metadata": "metadata", "target": "target", "snippets": "snippets ≤ {n} chars", "summary": "summary", "none": "nothing public"},
      "form": {"source_label": "Name", "licence_kind": "Kind", "holder": "Holder", "terms_summary": "Terms summary", "evidence_path": "Evidence path (licences/'{sha}'.pdf)", "snippet_max_chars": "Snippet cap N (≤ 500)", "valid_from": "Valid from", "valid_to": "Valid to (optional)", "newTitle": "New licence", "editTitle": "Edit licence", "flags": "Allows", "materialNote": "Changing a public flag, N or the term is material: version +1, confirmation cleared, affected snippets and summaries back to draft.", "save": "Save", "cancel": "Cancel"},
      "invalid": {"source_label": "1–120 characters", "holder": "Required", "terms_summary": "Required", "evidence_path": "Invalid path", "snippet_max_chars": "An integer 0–500", "valid_from": "Invalid date", "valid_to": "Cannot be before valid from"},
      "kinds": {"terminal_subscription": "Terminal subscription", "direct_from_broker": "Direct from broker", "owner_authored": "Owner authored", "other": "Other"},
      "flags": {"allows_llm_processing": "May be sent to F3 / the platform LLM", "allows_public_metadata": "Metadata (institution, title, date, rating)", "allows_public_snippets": "Snippets", "allows_public_summary": "Independent summary", "allows_public_target_price": "Target price"},
      "impact": {"title": "Impact · {label}", "publishedReports": "Published reports", "hiddenReports": "Reports hidden pending a disclosure re-check", "approvedSnippets": "Approved snippets", "approvedSummaries": "Approved summaries", "revertedTexts": "Snippets and summaries sent back to draft by a change", "note": "After confirming a new version, texts back in draft are public only once re-approved.", "window": "Term"}
    },
    "accessLog": {
      "title": "Access log", "titleEn": "访问日志", "intro": "Every request returning full text, spans or a signed URL writes a row first, then returns content. Append-only; no IP is stored.",
      "filters": {"user": "Admin", "action": "Action", "all": "All", "document": "Document {id}"},
      "export": "Export CSV",
      "columns": {"at": "At", "user": "Admin", "action": "Action", "object": "Object", "detail": "Detail"},
      "empty": "No entries"
    }
  }
```

`evidence_path` 文案里的 `'{sha}'` 是 ICU 引号转义（字面量花括号，不是占位符）；parity 测试的占位符正则只匹配 `{name}` 形式的未转义占位符。

- [ ] **Step 10: 管理员页面约束测试**

```ts
// src/app/(app)/admin/broker-research/pages.test.ts
// Every admin page is a force-dynamic server component that runs adminGate() itself.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=join(process.cwd(),'src/app/(app)/admin/broker-research');
const pages=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?pages(p):f==='page.tsx'?[p]:[];});

describe('broker-research admin pages',()=>{
 for(const p of pages(ROOT))it(relative(ROOT,p),()=>{
  const src=readFileSync(p,'utf8');
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toMatch(/if\(!await adminGate\('\/admin\/broker-research/);
 });
});
```

- [ ] **Step 11: 运行 D4 测试 + typecheck + lint + 目测**

Run: `npm test -- src/lib/broker-research/admin-read.test.ts "src/app/(app)/admin/broker-research" "src/app/(app)/intel/foreign-research/messages-parity.test.ts" && npm run typecheck && npm run lint`
Expected: PASS

目测：`npm run dev`，以本地管理员登录打开 `/admin/broker-research`（空库：计数全 0、三项门禁未满足、"打开对外"禁用）、`/upload`（选一个合成 PDF 看 sha256 与步骤推进；本地无 Storage 时直传失败显示错误条）、`/licences`（新建一条合成许可 → 待确认 → 确认 v1）、`/access-log`。

- [ ] **Step 12: 实施记录 + 提交**

实施记录追加：`D4 | 管理员总览/上传/许可/访问日志 | 偏差：开关打开不在 UI（只读门禁）；总览加复核队列与最近文档入口`。

```bash
git add src/lib/broker-research/admin-read.ts src/lib/broker-research/admin-read.test.ts "src/app/(app)/admin/broker-research" messages/zh/foreign-research.json messages/en/foreign-research.json docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): admin overview, upload, licences and access log pages (D4)"
```

---
### Task D5: 管理员文档页 / 复核双栏 / 发布对话框 / 预览页

**Files:**
- Create: `src/lib/broker-research/admin-document.ts`（文档页读模型）
- Create: `src/lib/broker-research/preview.ts`、`src/lib/broker-research/preview.test.ts`
- Create: `src/app/(app)/admin/broker-research/documents/[documentId]/page.tsx`、`DocumentClient.tsx`
- Create: `src/app/(app)/admin/broker-research/review/[reportId]/page.tsx`、`ReviewClient.tsx`、`PublishDialog.tsx`、`review-model.ts`、`review-model.test.ts`
- Create: `src/app/(app)/admin/broker-research/preview/[reportId]/page.tsx`
- Modify: `messages/zh/foreign-research.json`、`messages/en/foreign-research.json`（`admin` 下追加 `document`、`review`、`publish`、`preview`，Step 9）

设计要点：
- **文档页**是服务端组件，service-role 读文档 / 许可 / 报告 / 运行 / 清除步骤（无全文、无跨度）；动作经 C 路由：查看原文（★ `GET documents/[id]/url` → 新窗口打开，路由先写日志）、解析、抽取、生成摘要（zh / en）、翻译标题、撤回 `{reason, purge?}`、清除（重复调用只重试未成功步骤；须输入 sha256 前 8 位确认）。
- **复核页**是客户端组件，数据只来自 ★ `GET reports/[id]` 与 ★ `GET documents/[id]/pages/[n]`（路由先写 `text_viewed` 日志；`withdrawn` → 410，页面显示撤回提示）。每个写动作之后重新拉取 ★ 复核数据（物化与规则在服务端完成，页面不自己推断状态）。三栏（≥ xl）：原文页文本（高亮本页的证据跨度、框选）/ 编辑区（每个 target 一个页签 + 报告级字段 + 片段 + 标题 + 摘要）/ 阻断面板（复核就绪列 = 阻断 − `review_not_approved`，发布就绪列 = 全部阻断）。`< xl` 堆叠。
- 类型化编辑按字段种类（`price` / `currency` / `months` / `pct` / `date` / `text`）校验后发 `correct`，载荷是完整 `TypedValue`（显式 null = 清空，契约 `CorrectedValue`）；框选当前页文本时可把跨度一并作为新的引用位置提交。片段框选显示"剩余字数 = 许可 N − 选中长度"，超出时禁用创建。偏移按 UTF-16 码元（`Range.toString().length`），与 `locate.ts` 一致；一次只显示一页，因此片段不可能跨页。
- `stale_run` 提示：存在未被取代、`parse_run_id ≠ documents.current_parse_run_id` 的证据行 → 横幅（规格 §9.5）。
- **发布对话框**：打开即 `GET publish-blockers`；有阻断 → 列表 + 禁用发布；无阻断 → "将公开"清单（按许可标志与已批准片段 / 摘要数）+ 发布；成功后 `GET publications/[id]` 显示快照 id、`snapshot_hash`、规则回执 id、许可版本，并提示 outbox `claim.register` 已由 SQL 入队。
- **预览页**：service-role 读基表，按 §4.11 视图的同一过滤规则（目标价 / 片段长度 / 摘要标志 / 分析师 `public_display` / 改写标题时不出 `title` 引用 / 只取生效行）组装成 `PublicReportDetail` 形状，再走**同一个** `toPublicReportDetail` 白名单与**同一个** `ReportView` 组件；顶栏标注"预览 · 未对外"。不含历史与分歧（它们只来自公开视图）。预览不写访问日志（只显示将要公开的内容，不含全文 / 跨度）。

- [ ] **Step 1: 写预览与复核模型的失败测试**

```ts
// src/lib/broker-research/preview.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {previewPageData} from './preview';
import type {AdminReadDeps} from './admin-read';
import type {BrokerResearchDb,FieldRow} from './types';

const RID='11111111-1111-4111-8111-111111111111';
const field=(o:Partial<FieldRow>):FieldRow=>({field_id:'f',report_id:RID,parse_run_id:'pr',run_id:'run',superseded_by_run_id:null,target_key:'600000.SH',field:'target_price',occurrence:1,page:1,char_start:0,char_end:4,value_source_text:'SPAN-SECRET',
 extractor:'llm:m@r',extractor_confidence:null,status:'confirmed',corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:'',value_text:'12.34',value_num:'12.34',value_currency:'CNY',value_unit:'price',value_date:null,...o});
function deps(o:{tp?:boolean;n?:number;titlePublic?:string|null}={}){
 const tables=memoryTableClient();
 const db={
  getReport:vi.fn().mockResolvedValue({report_id:RID,document_id:'d',revision:1,scope:'single_issuer',institution_id:'I',title_original:'Original',title_lang:'en',title_zh:null,title_en:null,title_run_id:null,title_public:o.titlePublic??null,
   published_date:'2026-10-01',price_as_of_date:null,report_type:null,sector_as_stated:null,primary_target_key:'600000.SH',status:'draft',review_status:'in_review',current_publication_id:null,supersedes_report_id:null,code_version:'c'}),
  getDocument:vi.fn().mockResolvedValue({document_id:'d',licence_id:'L',status:'parsed',uploaded_at:'2026-10-02T00:00:00Z',page_count:9}),
  getLicence:vi.fn().mockResolvedValue({licence_id:'L',allows_public_metadata:true,allows_public_target_price:o.tp??false,allows_public_snippets:true,allows_public_summary:true,snippet_max_chars:o.n??10}),
  listTargets:vi.fn().mockResolvedValue([{report_id:RID,target_key:'600000.SH',ticker_as_stated:'600000',security_ticker:'600000.SH',issuer_id:'iss',rating_raw:'Buy',rating_normalized:'buy',scale_id:'s',target_price:'12.34',target_currency:'CNY',target_horizon_months:12,price_at_report:'9',price_currency:'CNY',price_as_of_date:null,upside_pct:'0.3711',upside_formula_version:'upside/1'}]),
  listFields:vi.fn().mockResolvedValue([
   field({field_id:'f1'}),
   field({field_id:'f2',field:'rating',value_text:'Hold',value_num:null,value_currency:null,value_unit:null,status:'corrected',corrected:{value_text:'Buy'}}),
   field({field_id:'f3',field:'analyst',target_key:null,value_text:'Hidden Person',value_num:null,value_currency:null,value_unit:null,extractor:'human:u'}),
   field({field_id:'f4',field:'title',target_key:null,value_text:'Original',value_num:null,value_currency:null,value_unit:null}),
   field({field_id:'f5',field:'wacc',status:'extracted',value_text:'8%',value_num:'0.08',value_unit:'pct'}),
   field({field_id:'f6',field:'terminal_growth',superseded_by_run_id:'new',value_num:'0.02',value_unit:'pct'}),
  ]),
  listSnippets:vi.fn().mockResolvedValue([{snippet_id:'s1',report_id:RID,target_key:null,purpose:'risk',page:2,text:'short',status:'approved'},{snippet_id:'s2',report_id:RID,target_key:null,purpose:'risk',page:2,text:'far too long text',status:'approved'},{snippet_id:'s3',report_id:RID,target_key:null,purpose:'risk',page:2,text:'draft',status:'draft'}]),
  listSummaries:vi.fn().mockResolvedValue([{summary_id:'m1',report_id:RID,lang:'zh',kind:'independent_summary',run_id:'sr',summary_md:'正文',status:'approved',generated_at:'2026-10-03T00:00:00Z'},{summary_id:'m2',report_id:RID,lang:'en',kind:'independent_summary',run_id:'sr',summary_md:'draft',status:'draft',generated_at:''}]),
  listInstitutions:vi.fn().mockResolvedValue([{institution_id:'I',name_en:'Synthetic Securities',name_zh:null,aliases:[],kind:null,rating_disclosure_url:null}]),
  listAnalysts:vi.fn().mockResolvedValue([{analyst_id:'a1',institution_id:'I',display_name:'Hidden Person',name_variants:[],public_display:false}]),
  getRun:vi.fn().mockResolvedValue({run_id:'sr',model_id:'model-x',prompt_version:'independent-summary/1'}),
 } as unknown as BrokerResearchDb;
 return {deps:{db,tables,now:()=>new Date('2026-11-06T00:00:00Z')} as AdminReadDeps,tables};
}

describe('previewPageData',()=>{
 it('applies the public-view rules to service-role rows and goes through the same DTO',async()=>{
  const {deps:d,tables}=deps();
  await tables.insert('broker_report_analysts',{report_id:RID,analyst_id:'a1',role:'lead',field_id:'f3'});
  const p=await previewPageData(d,RID);
  if(p.kind!=='ok')throw new Error(p.kind);
  const r=p.data.report,json=JSON.stringify(p);
  expect(r.targetPricePublic).toBe(false);expect(r.targets[0].target).toBeNull();expect(json).not.toContain('12.34');expect(json).not.toContain('0.3711');
  expect(r.citations.map(c=>`${c.field}:${c.valueText}`).sort()).toEqual(['rating:Buy','title:Original']);   // corrected value; analyst hidden; candidate and superseded rows excluded
  expect(r.snippets.map(s=>s.snippetId)).toEqual(['s1']);expect(r.summaries.zh?.modelId).toBe('model-x');expect(r.summaries.en).toBeNull();
  expect(r.analysts).toEqual([]);expect(json).not.toContain('SPAN-SECRET');
  expect(p.meta).toEqual({status:'draft',reviewStatus:'in_review',metadataPublic:true});
  expect(p.data.history).toEqual([]);expect(p.data.spread).toEqual([]);
 });
 it('rewritten title suppresses the title citation; target shows when the licence allows',async()=>{
  const p=await previewPageData(deps({tp:true,titlePublic:'Rewritten'}).deps,RID);
  if(p.kind!=='ok')throw new Error(p.kind);
  expect(p.data.report.title).toMatchObject({text:'Rewritten',isRewritten:true});
  expect(p.data.report.citations.map(c=>c.field).sort()).toEqual(['rating','target_price']);
  expect(p.data.report.targets[0].target).toEqual({price:'12.34',currency:'CNY',horizonMonths:12});
 });
 it('not found / incomplete',async()=>{
  const {deps:d}=deps();(d.db.getReport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
  expect((await previewPageData(d,RID)).kind).toBe('not_found');
  const {deps:d2}=deps();(d2.db.getReport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({report_id:RID,document_id:'d',title_original:null,title_public:null,status:'draft',review_status:'pending'});
  expect((await previewPageData(d2,RID)).kind).toBe('incomplete');
 });
});
```

```ts
// src/app/(app)/admin/broker-research/review/[reportId]/review-model.test.ts
import {describe,expect,it} from 'vitest';
import {blockerColumns,blockerParts,buildTyped,conflictGroups,fieldKind,groupFields,isStaleRun,normalizeReviewPayload,remainingChars,segmentText} from './review-model';
import type {FieldRow} from '@/lib/broker-research/types';

const f=(o:Partial<FieldRow>):FieldRow=>({field_id:'x',report_id:'r',parse_run_id:'p1',run_id:'run',superseded_by_run_id:null,target_key:'T',field:'target_price',occurrence:1,page:1,char_start:0,char_end:1,value_source_text:'1',extractor:'llm:m@r',extractor_confidence:null,status:'extracted',corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:'',value_text:'1',value_num:'1',value_currency:null,value_unit:'price',value_date:null,...o});

describe('typed editing',()=>{
 it('validates per field kind and returns a full TypedValue with explicit nulls',()=>{
  expect(fieldKind('target_price')).toBe('price');expect(fieldKind('wacc')).toBe('pct');expect(fieldKind('target_horizon')).toBe('months');expect(fieldKind('published_date')).toBe('date');expect(fieldKind('target_currency')).toBe('currency');expect(fieldKind('analyst')).toBe('text');
  expect(buildTyped('target_price',{value_text:'CNY 12.5',value_num:'12.50',value_currency:'cny',value_date:''})).toEqual({ok:true,value:{value_text:'CNY 12.5',value_num:'12.50',value_currency:'CNY',value_unit:'price',value_date:null}});
  expect(buildTyped('target_price',{value_text:'x',value_num:'12,5',value_currency:'',value_date:''})).toEqual({ok:false,error:'value_num'});
  expect(buildTyped('target_currency',{value_text:'usd',value_num:'',value_currency:'',value_date:''})).toEqual({ok:true,value:{value_text:'USD',value_num:null,value_currency:'USD',value_unit:null,value_date:null}});
  expect(buildTyped('target_horizon',{value_text:'12M',value_num:'12.5',value_currency:'',value_date:''})).toEqual({ok:false,error:'value_num'});
  expect(buildTyped('wacc',{value_text:'8.2%',value_num:'0.082',value_currency:'',value_date:''})).toMatchObject({ok:true,value:{value_unit:'pct',value_num:'0.082'}});
  expect(buildTyped('published_date',{value_text:'1 Oct 2026',value_num:'',value_currency:'',value_date:'2026-02-30'})).toEqual({ok:false,error:'value_date'});
  expect(buildTyped('analyst',{value_text:'  ',value_num:'',value_currency:'',value_date:''})).toEqual({ok:false,error:'value_text'});
 });
});

describe('grouping, conflicts, staleness',()=>{
 it('groups live rows by target and finds open conflict groups',()=>{
  const rows=[f({field_id:'a',conflict_group:'g'}),f({field_id:'b',conflict_group:'g',value_num:'2'}),f({field_id:'c',target_key:null,field:'title'}),f({field_id:'d',superseded_by_run_id:'new'})];
  const g=groupFields(rows);
  expect([...g.keys()]).toEqual(['T','']);expect(g.get('T')!.map(x=>x.field_id)).toEqual(['a','b']);
  expect([...conflictGroups(rows).keys()]).toEqual(['g']);
  expect(conflictGroups([f({field_id:'a',conflict_group:'g'}),f({field_id:'b',conflict_group:'g',status:'confirmed'})]).size).toBe(0);
 });
 it('stale when a live row points at another parse run',()=>{
  expect(isStaleRun('p1',[f({})])).toBe(false);expect(isStaleRun('p2',[f({})])).toBe(true);expect(isStaleRun('p2',[f({superseded_by_run_id:'n'})])).toBe(false);expect(isStaleRun(null,[f({})])).toBe(false);
 });
});

describe('blockers',()=>{
 it('splits the code and builds the two columns',()=>{
  expect(blockerParts('report_incomplete:title')).toEqual({key:'report_incomplete',arg:'title'});expect(blockerParts('required_field_missing:rating:600000.SH')).toEqual({key:'required_field_missing',arg:'rating:600000.SH'});
  expect(blockerColumns(['review_not_approved','licence_unconfirmed'])).toEqual({reviewReady:['licence_unconfirmed'],publishReady:['review_not_approved','licence_unconfirmed']});
  expect(blockerColumns(['review_not_approved']).reviewReady).toEqual([]);
 });
});

describe('page text',()=>{
 it('segments around non-overlapping spans in order, UTF-16 offsets',()=>{
  expect(segmentText('ab😀cd',[{start:2,end:4,id:'s'}])).toEqual([{text:'ab',id:null},{text:'😀',id:'s'},{text:'cd',id:null}]);
  expect(segmentText('abcdef',[{start:3,end:5,id:'y'},{start:1,end:4,id:'x'}])).toEqual([{text:'a',id:null},{text:'bcd',id:'x'},{text:'ef',id:null}]);
  expect(segmentText('abc',[{start:2,end:9,id:'z'}])).toEqual([{text:'ab',id:null},{text:'c',id:'z'}]);
 });
 it('remaining chars',()=>{expect(remainingChars(80,30)).toBe(50);expect(remainingChars(10,12)).toBe(-2);expect(remainingChars(null,3)).toBeNull();});
 it('normalizes the review payload or rejects it',()=>{
  expect(normalizeReviewPayload({nope:1})).toBeNull();
  const p=normalizeReviewPayload({report:{report_id:'r'},document:{document_id:'d'},licence:{licence_id:'l'},fields:[]})!;
  expect(p.targets).toEqual([]);expect(p.blockers).toEqual([]);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/broker-research/preview.test.ts "src/app/(app)/admin/broker-research/review"`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `preview.ts`、`admin-document.ts`、`review-model.ts`**

```ts
// src/lib/broker-research/preview.ts
// Admin preview (spec §9.1 "对外前预览", §14 acceptance 8): service-role rows assembled into the
// PublicReportDetail shape with the SAME filters as the §4.11 views — target-price values only when
// the licence allows, effective rows only (confirmed/corrected/absent, not superseded) through the
// effective-value selector, analyst rows only for public_display analysts, no title citation when a
// rewritten public title exists (the publish function's title_restricted is not computed yet), approved
// snippets ≤ N with allows_public_snippets, approved summaries with allows_public_summary — and then
// through the same whitelist DTO and the same ReportView. What differs from public: publication,
// public_enabled, evidence/disclosure flags and the licence confirmation are not required (they are
// what the preview is for). History and spread are public-view only and therefore empty.
import {effectiveValue} from './effective';
import {TARGET_PRICE_FIELDS,toPublicReportDetail} from './public-dto';
import type {AdminReadDeps} from './admin-read';
import type {ReportPageData} from './public-read';
import type {ReportStatus,ReviewStatus} from './types';

export interface PreviewMeta{status:ReportStatus;reviewStatus:ReviewStatus;metadataPublic:boolean}
export type PreviewResult={kind:'ok';data:ReportPageData;meta:PreviewMeta}|{kind:'not_found'}|{kind:'incomplete'};

export async function previewPageData(deps:AdminReadDeps,reportId:string):Promise<PreviewResult>{
 const report=await deps.db.getReport(reportId);
 if(!report||report.status==='withdrawn')return {kind:'not_found'};
 const doc=await deps.db.getDocument(report.document_id);
 if(!doc||doc.status==='withdrawn')return {kind:'not_found'};
 const lic=await deps.db.getLicence(doc.licence_id);
 if(!lic)return {kind:'not_found'};
 const [targets,fields,snippets,summaries,institutions,bindings]=await Promise.all([
  deps.db.listTargets(reportId),deps.db.listFields(reportId),deps.db.listSnippets(reportId),deps.db.listSummaries(reportId),deps.db.listInstitutions(),
  deps.tables.select('broker_report_analysts',{report_id:reportId}),
 ]);
 const tpp=lic.allows_public_target_price,max=lic.snippet_max_chars;
 const inst=institutions.find(i=>i.institution_id===report.institution_id)??null;
 const analysts=inst?await deps.db.listAnalysts(inst.institution_id):[];
 const publicAnalyst=new Map(analysts.filter(a=>a.public_display).map(a=>[a.analyst_id,a]));
 const publicBindings=bindings.filter(b=>publicAnalyst.has(String(b.analyst_id)));
 const publicAnalystFields=new Set(publicBindings.map(b=>String(b.field_id)));
 const live=fields.filter(f=>(f.status==='confirmed'||f.status==='corrected'||f.status==='absent')&&f.superseded_by_run_id===null);
 const citations=live
  .filter(f=>!(TARGET_PRICE_FIELDS.has(f.field)&&!tpp)&&!(f.field==='analyst'&&!publicAnalystFields.has(f.field_id))&&!(f.field==='title'&&report.title_public!==null))
  .map(f=>{const v=effectiveValue(f);return {report_id:reportId,target_key:f.target_key,field:f.field,occurrence:f.occurrence,page:f.page,value_text:v.value_text,value_num:v.value_num,value_currency:v.value_currency,value_unit:v.value_unit,value_date:v.value_date,status:f.status,extractor_kind:f.extractor.startsWith('llm:')?'llm':'human'};});
 const snippetRows=lic.allows_public_snippets?snippets.filter(s=>s.status==='approved'&&s.text!==null&&s.text.length<=max).map(s=>({snippet_id:s.snippet_id,report_id:reportId,target_key:s.target_key,purpose:s.purpose,page:s.page,text:s.text,field_id:s.field_id})):[];
 const summaryRows=[];
 if(lic.allows_public_summary)for(const s of summaries.filter(x=>x.status==='approved')){
  const run=await deps.db.getRun(s.run_id);
  summaryRows.push({summary_id:s.summary_id,report_id:reportId,lang:s.lang,kind:s.kind,model_id:run?.model_id??null,prompt_version:run?.prompt_version??null,summary_md:s.summary_md,generated_at:s.generated_at});
 }
 const title=report.title_public??report.title_original;
 const detail=toPublicReportDetail({
  report:{report_id:reportId,revision:report.revision,scope:report.scope,institution_id:report.institution_id,title,title_is_rewritten:report.title_public!==null,title_zh:report.title_zh,title_en:report.title_en,title_is_translation:report.title_run_id!==null,
   published_date:report.published_date,price_as_of_date:report.price_as_of_date,report_type:report.report_type,sector_as_stated:report.sector_as_stated,primary_target_key:report.primary_target_key,
   available_at:doc.uploaded_at,code_version:report.code_version,published_at:null,supersedes_report_id:report.supersedes_report_id,page_count:doc.page_count,snippet_max_chars:max,target_price_public:tpp,summary_public:lic.allows_public_summary},
  targets:targets.map(t=>({report_id:reportId,publication_id:report.current_publication_id,target_key:t.target_key,ticker_as_stated:t.ticker_as_stated,security_ticker:t.security_ticker,issuer_id:t.issuer_id,
   rating_raw:t.rating_raw,rating_normalized:t.rating_normalized,scale_id:t.scale_id,target_price:tpp?t.target_price:null,target_currency:tpp?t.target_currency:null,target_horizon_months:tpp?t.target_horizon_months:null,
   upside_pct:tpp?t.upside_pct:null,target_price_public:tpp,price_at_report:t.price_at_report,price_currency:t.price_currency,price_as_of_date:t.price_as_of_date,upside_formula_version:t.upside_formula_version})),
  hasSummary:{zh:summaryRows.some(s=>s.lang==='zh'),en:summaryRows.some(s=>s.lang==='en')},snippetCount:snippetRows.length,
  institution:inst?{institution_id:inst.institution_id,name_en:inst.name_en,name_zh:inst.name_zh,aliases:inst.aliases,kind:inst.kind,rating_disclosure_url:inst.rating_disclosure_url}:null,
  citations,snippets:snippetRows,summaries:summaryRows,
  analysts:publicBindings.map(b=>{const a=publicAnalyst.get(String(b.analyst_id))!;return {report_id:reportId,analyst_id:a.analyst_id,display_name:a.display_name,institution_id:a.institution_id,role:b.role??null};}),
 });
 if(!detail)return {kind:'incomplete'};
 const focus=detail.targets.find(t=>t.targetKey===detail.primaryTargetKey)??detail.targets[0]??null;
 return {kind:'ok',data:{report:detail,history:[],spread:[],focusTargetKey:focus?.targetKey??null},meta:{status:report.status,reviewStatus:report.review_status,metadataPublic:lic.allows_public_metadata}};
}
```

```ts
// src/lib/broker-research/admin-document.ts
// Document page read model (spec §9.5 文档页): document, licence, report, immutable runs, purge steps.
// No full text, spans or signed URLs here (the "view original" button goes through the ★ route).
import type {AdminReadDeps} from './admin-read';
import type {DocumentRow,LicenceRow,PurgeStepRow,ReportRow,RunRow} from './types';

export interface DocumentPageData{document:DocumentRow;licence:LicenceRow|null;report:ReportRow|null;runs:RunRow[];purgeSteps:PurgeStepRow[]}
export async function loadDocumentPage(deps:AdminReadDeps,documentId:string):Promise<DocumentPageData|null>{
 const document=await deps.db.getDocument(documentId);if(!document)return null;
 const [licence,report,runs,purgeSteps]=await Promise.all([deps.db.getLicence(document.licence_id),deps.db.reportByDocument(documentId),deps.db.listRuns(documentId),deps.db.purgeSteps(documentId)]);
 return {document,licence,report,runs:[...runs].sort((a,b)=>b.started_at.localeCompare(a.started_at)),purgeSteps};
}
```

```ts
// src/app/(app)/admin/broker-research/review/[reportId]/review-model.ts
// Pure model of the review page (spec §6.3, §9.5): payload normalisation, typed editing by field kind
// (typed/1 shapes: decimals as strings, ISO currency, integer months, fraction pct, ISO date), live-row
// grouping, open conflict groups, stale_run detection, blocker columns, page-text segmentation (UTF-16).
import type {AnalystRow,CorrectedValue,DocumentRow,FieldName,FieldRow,InstitutionRow,LicenceRow,ReportRow,RunRow,SnippetRow,SummaryRow,TargetRow,TypedValue,ValueUnit} from '@/lib/broker-research/types';

export interface ReviewPayload{report:ReportRow;document:DocumentRow;licence:LicenceRow;fields:FieldRow[];targets:TargetRow[];snippets:SnippetRow[];summaries:SummaryRow[];institutions:InstitutionRow[];analysts:AnalystRow[];runs:RunRow[];blockers:string[]}
const arr=<T>(v:unknown):T[]=>Array.isArray(v)?v as T[]:[];
export function normalizeReviewPayload(raw:unknown):ReviewPayload|null{
 const o=raw as Record<string,unknown>|null;
 if(!o||typeof o!=='object'||!o.report||!o.document||!o.licence||!Array.isArray(o.fields))return null;
 return {report:o.report as ReportRow,document:o.document as DocumentRow,licence:o.licence as LicenceRow,fields:arr(o.fields),targets:arr(o.targets),snippets:arr(o.snippets),summaries:arr(o.summaries),
  institutions:arr(o.institutions),analysts:arr(o.analysts),runs:arr(o.runs),blockers:arr<string>(o.blockers).filter(b=>typeof b==='string')};
}

export type FieldKind='price'|'currency'|'months'|'pct'|'date'|'text';
const KIND:Record<FieldName,FieldKind>={institution:'text',analyst:'text',published_date:'date',price_as_of_date:'date',ticker:'text',rating:'text',target_price:'price',target_currency:'currency',target_horizon:'months',
 price_at_report:'price',price_currency:'currency',upside_stated:'pct',wacc:'pct',terminal_growth:'pct',terminal_value_share:'pct',valuation_method:'text',sector:'text',title:'text'};
export const fieldKind=(f:FieldName)=>KIND[f];
export const ALL_FIELDS=Object.keys(KIND) as FieldName[];
export const TARGET_LEVEL:FieldName[]=['ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','price_as_of_date','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method'];
export const REPORT_LEVEL:FieldName[]=['institution','analyst','published_date','sector','title'];
export const ABSENT_FIELDS:FieldName[]=['rating','target_price','analyst','target_horizon'];
export interface TypedForm{value_text:string;value_num:string;value_currency:string;value_date:string}
export const typedFormOf=(v:TypedValue):TypedForm=>({value_text:v.value_text,value_num:v.value_num??'',value_currency:v.value_currency??'',value_date:v.value_date??''});
const DEC=/^-?\d+(?:\.\d+)?$/;
const isDate=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const ms=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s;};
export function buildTyped(field:FieldName,f:TypedForm):{ok:true;value:CorrectedValue&TypedValue}|{ok:false;error:keyof TypedForm}{
 const text=f.value_text.trim(),num=f.value_num.trim(),cur=f.value_currency.trim().toUpperCase(),day=f.value_date.trim();
 const out=(value_num:string|null,value_currency:string|null,value_unit:ValueUnit|null,value_date:string|null,value_text=text)=>({ok:true as const,value:{value_text,value_num,value_currency,value_unit,value_date}});
 switch(fieldKind(field)){
  case 'price':if(!text)return {ok:false,error:'value_text'};if(!DEC.test(num))return {ok:false,error:'value_num'};if(cur&&!/^[A-Z]{3}$/.test(cur))return {ok:false,error:'value_currency'};return out(num,cur||null,'price',null);
  case 'currency':{const c=(cur||text).toUpperCase();if(!/^[A-Z]{3}$/.test(c))return {ok:false,error:'value_text'};return out(null,c,null,null,c);}
  case 'months':if(!text)return {ok:false,error:'value_text'};if(!/^\d{1,3}$/.test(num)||Number(num)<1)return {ok:false,error:'value_num'};return out(num,null,'months',null);
  case 'pct':if(!text)return {ok:false,error:'value_text'};if(!DEC.test(num))return {ok:false,error:'value_num'};return out(num,null,'pct',null);
  case 'date':if(!text)return {ok:false,error:'value_text'};if(!isDate(day))return {ok:false,error:'value_date'};return out(null,null,null,day);
  default:return text?out(null,null,null,null):{ok:false,error:'value_text'};
 }
}

const isLive=(f:FieldRow)=>f.superseded_by_run_id===null&&f.status!=='rejected';
export function groupFields(fields:FieldRow[]):Map<string,FieldRow[]>{
 const m=new Map<string,FieldRow[]>();
 for(const f of fields.filter(isLive)){const k=f.target_key??'';m.set(k,[...(m.get(k)??[]),f]);}
 return m;
}
/** Conflict groups still open: ≥ 2 candidate rows and no effective row in the group (spec §6.2). */
export function conflictGroups(fields:FieldRow[]):Map<string,FieldRow[]>{
 const m=new Map<string,FieldRow[]>();
 for(const f of fields.filter(x=>x.conflict_group!==null&&x.superseded_by_run_id===null))m.set(f.conflict_group!,[...(m.get(f.conflict_group!)??[]),f]);
 for(const [k,rows] of m){const cand=rows.filter(r=>r.status==='extracted'||r.status==='unverified');if(cand.length<2||rows.some(r=>r.status==='confirmed'||r.status==='corrected'))m.delete(k);}
 return m;
}
export const isStaleRun=(currentParseRunId:string|null,fields:FieldRow[])=>currentParseRunId!==null&&fields.some(f=>isLive(f)&&f.parse_run_id!==null&&f.parse_run_id!==currentParseRunId);

export function blockerParts(code:string):{key:string;arg:string|null}{const i=code.indexOf(':');return i<0?{key:code,arg:null}:{key:code.slice(0,i),arg:code.slice(i+1)};}
export function blockerColumns(blockers:string[]):{reviewReady:string[];publishReady:string[]}{
 return {reviewReady:blockers.filter(b=>b!=='review_not_approved'),publishReady:[...blockers]};
}

export interface Span{start:number;end:number;id:string}
/** Splits text around spans (sorted by start; a span overlapping an earlier one is dropped; ends clamp to the text). */
export function segmentText(text:string,spans:Span[]):{text:string;id:string|null}[]{
 const out:{text:string;id:string|null}[]=[];let pos=0;
 for(const s of [...spans].sort((a,b)=>a.start-b.start||a.end-b.end)){
  const start=Math.max(s.start,0),end=Math.min(s.end,text.length);
  if(start<pos||end<=start)continue;
  if(start>pos)out.push({text:text.slice(pos,start),id:null});
  out.push({text:text.slice(start,end),id:s.id});pos=end;
 }
 if(pos<text.length)out.push({text:text.slice(pos),id:null});
 return out;
}
export const remainingChars=(max:number|null,len:number)=>max===null?null:max-len;
```

（`segmentText` 第二例：先排序 `x(1–4)`、`y(3–5)`，`y` 与 `x` 重叠被丢弃。）

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/broker-research/preview.test.ts "src/app/(app)/admin/broker-research/review"`
Expected: PASS

- [ ] **Step 5: 文档页**

```tsx
// src/app/(app)/admin/broker-research/documents/[documentId]/page.tsx
import {notFound} from 'next/navigation';
import {UUID_RE} from '@/lib/facts/public-route';
import {adminReadDeps} from '@/lib/broker-research/admin-read';
import {loadDocumentPage} from '@/lib/broker-research/admin-document';
import {AdminDenied,adminGate} from '../../_shared/gate';
import {AdminShell} from '../../_shared/AdminShell';
import {DocumentClient} from './DocumentClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchDocumentPage({params}:{params:Promise<{documentId:string}>}){
 const {documentId}=await params;
 if(!await adminGate(`/admin/broker-research/documents/${encodeURIComponent(documentId)}`))return <AdminDenied/>;
 if(!UUID_RE.test(documentId))notFound();
 const data=await loadDocumentPage(adminReadDeps(),documentId.toLowerCase());
 if(!data)notFound();
 return <AdminShell crumb={data.document.original_filename}><DocumentClient data={data}/></AdminShell>;
}
```

```tsx
// src/app/(app)/admin/broker-research/documents/[documentId]/DocumentClient.tsx
'use client';
// Document page (spec §6.2, §6.5, §9.5; Document artboard): status, sha, licence, actions (view original
// via the ★ signed-URL route, parse, extract, summarize zh/en, translate title, review), immutable runs,
// withdraw (reason required, optional purge) and purge steps (repeatable; sha256 first 8 chars to confirm).
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import type {DocumentPageData} from '@/lib/broker-research/admin-document';
import type {PurgeStep} from '@/lib/broker-research/types';
import {fmtInstant,shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,BTN_PRIMARY,CARD,CARD_FLUSH,CHIP,CHIP_ACCENT,CHIP_DANGER,CHIP_WARN,ERROR_BAR,FIELD_LABEL,H1,H2,H3,INPUT,TD,TH,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {adminJson,baseCode} from '../../_shared/admin-fetch';

const PURGE_STEPS:PurgeStep[]=['pdf','artifacts','runs','fields_text','snippets_text','summaries','quarantine_payload'];

export function DocumentClient({data}:{data:DocumentPageData}){
 const t=useTranslations('foreign-research.admin.document');
 const te=useTranslations('foreign-research.admin.errors');
 const locale=useLocale();const router=useRouter();
 const {document:doc,licence,report,runs,purgeSteps}=data;
 const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [notice,setNotice]=useState<string|null>(null);
 const [reason,setReason]=useState('');const [alsoPurge,setAlsoPurge]=useState(false);const [confirmSha,setConfirmSha]=useState('');
 const withdrawn=doc.status==='withdrawn';
 const errText=(code:string)=>te.has(baseCode(code))?te(baseCode(code)):te('generic',{code});
 async function act(key:string,method:'GET'|'POST',path:string,body?:unknown,after?:(d:unknown)=>void){
  setBusy(key);setError(null);setNotice(null);
  const r=await adminJson(method,path,body);
  setBusy(null);
  if(!r.ok){setError(errText(r.code));return;}
  after?.(r.data);router.refresh();
 }
 const viewOriginal=()=>act('url','GET',`/documents/${doc.document_id}/url`,undefined,d=>{const url=(d as {url?:string}).url;if(url)window.open(url,'_blank','noopener,noreferrer');});
 const stepStatus=(s:PurgeStep)=>purgeSteps.find(p=>p.step===s);
 const statusChip=withdrawn?CHIP_DANGER:doc.status==='parse_failed'?CHIP_WARN:report?.review_status==='in_review'||report?.review_status==='pending'?CHIP_WARN:CHIP;
 return (
  <div className="flex flex-col gap-5">
   {error?<div role="alert" className={ERROR_BAR}>{error}</div>:null}{notice?<div role="status" className={`${CARD} text-xs text-text-dim`}>{notice}</div>:null}
   <section className="flex flex-wrap items-end gap-5">
    <div className="min-w-0"><h1 className={`${H1} break-all`}>{doc.original_filename}</h1>
     <div className="mt-1.5 flex flex-wrap items-center gap-2"><span className={statusChip}>{t(`status.${doc.status}`)}{report?` · ${t(`review.${report.review_status}`)}`:''}</span>
      <span className="font-mono text-[11px] text-text-dim" title={doc.sha256}>sha256 {doc.sha256.slice(0,8)}…{doc.sha256.slice(-4)}</span>
      <span className={TINY}>{t('licenceLine',{label:licence?.source_label??'—',version:licence?.version??'—',pages:doc.page_count??'—'})}</span>
      {doc.promotion_pending?<span className={CHIP_WARN}>{t('promotionPending')}</span>:null}{doc.verify_status?<span className={doc.verify_status==='ok'?CHIP:CHIP_WARN}>{t('verify',{status:doc.verify_status})}</span>:null}</div></div>
    <div className="flex flex-wrap gap-2 lg:ml-auto">
     <button type="button" className={BTN} disabled={withdrawn||busy!==null} onClick={()=>void viewOriginal()}>{t('actions.viewOriginal')}</button>
     <button type="button" className={BTN} disabled={withdrawn||busy!==null} onClick={()=>void act('parse','POST',`/documents/${doc.document_id}/parse`)}>{busy==='parse'?t('working'):t('actions.parse')}</button>
     <button type="button" className={BTN} disabled={withdrawn||busy!==null||doc.status!=='parsed'} onClick={()=>void act('extract','POST',`/documents/${doc.document_id}/extract`)}>{busy==='extract'?t('working'):t('actions.extract')}</button>
     {(['zh','en'] as const).map(lang=><button key={lang} type="button" className={BTN} disabled={withdrawn||busy!==null||!report} onClick={()=>void act(`summary-${lang}`,'POST',`/reports/${report!.report_id}/summary`,{lang})}>{busy===`summary-${lang}`?t('working'):t('actions.summarize',{lang})}</button>)}
     <button type="button" className={BTN} disabled={withdrawn||busy!==null||!report} onClick={()=>void act('translate','POST',`/reports/${report!.report_id}/translate`)}>{t('actions.translate')}</button>
     {report?<Link href={`/admin/broker-research/review/${report.report_id}`} className={`${BTN_PRIMARY} hover:no-underline`}>{t('actions.review')}</Link>:null}
    </div>
   </section>
   <p className={TINY}>{t('actionsNote')}</p>
   <section className={CARD_FLUSH}>
    <div className="px-4 py-3.5"><h2 className={H2}>{t('runs.title')}</h2></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
     <thead className="border-b border-border"><tr>{(['run','kind','started','status','artifact','versions'] as const).map(c=><th key={c} scope="col" className={`${TH} ${c==='run'?'pl-4':''}`}>{t(`runs.${c}`)}</th>)}<th className={`${TH} pr-4`}><span className="sr-only">{t('runs.detail')}</span></th></tr></thead>
     <tbody className="divide-y divide-border">{runs.map(r=>(
      <tr key={r.run_id}>
       <td className={`${TD} pl-4 font-mono text-[11px]`} title={r.run_id}>{shortId(r.run_id)}</td><td className={TD}>{r.kind}</td>
       <td className={`${TD} whitespace-nowrap font-mono text-text-dim`}>{fmtInstant(r.started_at,locale)}</td>
       <td className={TD}><span className={r.status==='succeeded'?CHIP:r.status==='failed'?CHIP_DANGER:CHIP_WARN}>{r.status}{typeof r.detail?.error_code==='string'?` · ${r.detail.error_code}`:''}</span></td>
       <td className={`${TD} font-mono text-[11px] text-text-dim`}>{shortId(r.artifact_hash??r.response_path??r.request_path)}</td>
       <td className={`${TD} font-mono text-[11px] text-text-dim`}>{r.code_version} · {r.prompt_version??r.extractor_version??'—'}</td>
       <td className={`${TD} pr-4`}><details><summary className="cursor-pointer text-xs text-text-dim">{t('runs.detail')}</summary><pre className="mt-1 max-h-64 max-w-md overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-elevated p-2 font-mono text-[11px]">{JSON.stringify({model_id:r.model_id,registry_hash:r.registry_hash,schema_version:r.schema_version,behavior_digest:r.behavior_digest,licence_version:r.licence_version,batch_id:r.batch_id,detail:r.detail},null,2)}</pre></details></td>
      </tr>))}</tbody>
    </table></div>
    {runs.length===0?<p className="px-4 pb-3 text-xs text-text-muted">{t('runs.empty')}</p>:null}
   </section>
   <div className="grid items-start gap-5 lg:grid-cols-2">
    <section className={`${CARD} flex flex-col gap-3`}>
     <h2 className={H3}>{t('withdraw.title')}</h2><p className="text-xs text-text-dim">{t('withdraw.body')}</p>
     {withdrawn?<p className="text-xs text-text">{t('withdraw.done',{date:fmtInstant(doc.withdrawn_at,locale),reason:doc.withdrawn_reason??'—'})}</p>:<>
      <div><label htmlFor="wd-reason" className={FIELD_LABEL}>{t('withdraw.reason')}</label><input id="wd-reason" className={INPUT} value={reason} onChange={e=>setReason(e.target.value)} placeholder={t('withdraw.placeholder')}/></div>
      <label className="flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={alsoPurge} onChange={e=>setAlsoPurge(e.target.checked)}/>{t('withdraw.alsoPurge')}</label>
      <button type="button" className={`${BTN} self-start`} disabled={!reason.trim()||busy!==null} onClick={()=>void act('withdraw','POST',`/documents/${doc.document_id}/withdraw`,{reason:reason.trim(),purge:alsoPurge},()=>setNotice(t('withdraw.ok')))}>{t('withdraw.submit')}</button></>}
    </section>
    <section className={`${CARD} flex flex-col gap-3 border-[color-mix(in_srgb,var(--danger)_40%,transparent)]`}>
     <div className="flex items-center gap-2"><h2 className={H3}>{t('purge.title')}</h2><span className={CHIP_DANGER}>{t('purge.irreversible')}</span></div>
     <ol className="flex flex-col gap-2">{PURGE_STEPS.map((s,i)=>{const st=stepStatus(s);return (
      <li key={s} className="flex items-start gap-2.5 text-xs"><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${st?.status==='done'?'border-[var(--border-active)] text-accent':st?.status==='failed'?'border-danger text-danger':'border-border text-text-muted'}`}>{st?.status==='done'?'✓':i+1}</span>
       <div><div className={st?.status==='done'?'text-text-dim':'text-text'}>{t(`purge.steps.${s}`)}</div>{st?<div className={TINY}>{st.status} · {t('purge.attempts',{n:st.attempts})}{st.last_error?` · ${st.last_error}`:''}</div>:null}</div></li>);})}</ol>
     {doc.purged_at?<span className={`${CHIP_ACCENT} self-start`}>{t('purge.done',{date:fmtInstant(doc.purged_at,locale)})}</span>:<>
      <div><label htmlFor="pg-sha" className={FIELD_LABEL}>{t('purge.confirm')}</label><input id="pg-sha" className={`${INPUT} font-mono`} value={confirmSha} onChange={e=>setConfirmSha(e.target.value.trim().toLowerCase())} placeholder={doc.sha256.slice(0,8)}/></div>
      <button type="button" className={`${BTN} self-start border-[color-mix(in_srgb,var(--danger)_50%,transparent)]`} disabled={!withdrawn||confirmSha!==doc.sha256.slice(0,8)||busy!==null} onClick={()=>void act('purge','POST',`/documents/${doc.document_id}/purge`)}>{purgeSteps.length?t('purge.retry'):t('purge.run')}</button>
      {!withdrawn?<p className={TINY}>{t('purge.needsWithdraw')}</p>:null}</>}
    </section>
   </div>
   <Link href={`/admin/broker-research/access-log?document=${doc.document_id}`} className="text-xs">{t('accessLog')}</Link>
  </div>
 );
}
```

- [ ] **Step 6: 复核页（双栏 + 阻断面板）**

```tsx
// src/app/(app)/admin/broker-research/review/[reportId]/page.tsx
import {notFound} from 'next/navigation';
import {UUID_RE} from '@/lib/facts/public-route';
import {AdminDenied,adminGate} from '../../_shared/gate';
import {AdminShell} from '../../_shared/AdminShell';
import {ReviewClient} from './ReviewClient';

export const dynamic='force-dynamic';

export default async function BrokerResearchReviewPage({params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!await adminGate(`/admin/broker-research/review/${encodeURIComponent(reportId)}`))return <AdminDenied/>;
 if(!UUID_RE.test(reportId))notFound();
 return <AdminShell><ReviewClient reportId={reportId.toLowerCase()}/></AdminShell>;
}
```

```tsx
// src/app/(app)/admin/broker-research/review/[reportId]/ReviewClient.tsx
'use client';
// Review two-pane page (spec §6.3, §9.5; Review artboard). Data only from the ★ routes (they log
// text_viewed first); every write goes through the C routes and is followed by a reload, so the page
// never infers materialised state. Panes: page text with evidence highlights and selection (UTF-16
// offsets) / editor tabs (targets, report-level, snippets, title, summaries) / blockers (review-ready
// and publish-ready columns) with review and publish actions.
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {effectiveValue} from '@/lib/broker-research/effective';
import type {FieldName,FieldRow,ReportScope,SnippetPurpose} from '@/lib/broker-research/types';
import {SNIPPET_PURPOSES} from '@/lib/broker-research/public-dto';
import {shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,BTN_GHOST,BTN_PRIMARY,CALLOUT,CARD,CARD_FLUSH,CHIP,CHIP_ACCENT,CHIP_DANGER,CHIP_WARN,DOT,ERROR_BAR,FIELD_LABEL,H3,INPUT,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {adminJson,baseCode} from '../../_shared/admin-fetch';
import {PublishDialog} from './PublishDialog';
import {ABSENT_FIELDS,REPORT_LEVEL,TARGET_LEVEL,blockerColumns,blockerParts,buildTyped,conflictGroups,fieldKind,groupFields,isStaleRun,normalizeReviewPayload,remainingChars,segmentText,typedFormOf} from './review-model';
import type {ReviewPayload,TypedForm} from './review-model';

type Tab={kind:'target';key:string}|{kind:'report'}|{kind:'snippets'}|{kind:'title'}|{kind:'summaries'};
interface Sel{start:number;end:number;text:string;page:number;parseRunId:string}
interface PageText{page:number;pageCount:number;text:string;parseRunId:string}
const SCOPES:ReportScope[]=['single_issuer','multi_issuer','sector','macro_strategy'];
const EMPTY_FORM:TypedForm={value_text:'',value_num:'',value_currency:'',value_date:''};

function selectionIn(container:HTMLElement):{start:number;end:number;text:string}|null{
 const s=window.getSelection();if(!s||s.rangeCount===0||s.isCollapsed)return null;
 const r=s.getRangeAt(0);if(!container.contains(r.startContainer)||!container.contains(r.endContainer))return null;
 const pre=document.createRange();pre.selectNodeContents(container);pre.setEnd(r.startContainer,r.startOffset);
 const start=pre.toString().length,text=r.toString();return {start,end:start+text.length,text};
}

export function ReviewClient({reportId}:{reportId:string}){
 const t=useTranslations('foreign-research.admin.review');
 const te=useTranslations('foreign-research.admin.errors');
 const [data,setData]=useState<ReviewPayload|null>(null);const [loadCode,setLoadCode]=useState<string|null>(null);
 const [page,setPage]=useState(1);const [pageText,setPageText]=useState<PageText|null>(null);const [pageCode,setPageCode]=useState<string|null>(null);
 const [sel,setSel]=useState<Sel|null>(null);const [tab,setTab]=useState<Tab>({kind:'report'});
 const [busy,setBusy]=useState(false);const [code,setCode]=useState<string|null>(null);const [publishOpen,setPublishOpen]=useState(false);
 const textRef=useRef<HTMLDivElement>(null);
 const errText=(c:string)=>te.has(baseCode(c))?te(baseCode(c)):te('generic',{code:c});

 const load=useCallback(async()=>{
  const r=await adminJson<unknown>('GET',`/reports/${reportId}`);
  if(!r.ok){setLoadCode(r.code);return;}
  const p=normalizeReviewPayload(r.data);if(!p){setLoadCode('payload_invalid');return;}
  setData(p);setLoadCode(null);
 },[reportId]);
 useEffect(()=>{void load();},[load]);
 const docId=data?.document.document_id;
 useEffect(()=>{
  if(!docId)return;let cancel=false;setSel(null);
  void adminJson<PageText>('GET',`/documents/${docId}/pages/${page}`).then(r=>{if(cancel)return;if(r.ok){setPageText(r.data);setPageCode(null);}else{setPageText(null);setPageCode(r.code);}});
  return ()=>{cancel=true;};
 },[docId,page]);
 const tabInit=useRef(false);
 useEffect(()=>{if(data&&!tabInit.current){tabInit.current=true;if(data.targets.length>0)setTab({kind:'target',key:data.targets[0].target_key});}},[data]);   // first load: open the first target tab

 async function post(path:string,body:unknown):Promise<boolean>{
  setBusy(true);setCode(null);
  const r=await adminJson('POST',path,body);
  setBusy(false);if(!r.ok)setCode(r.code);
  await load();return r.ok;
 }
 if(loadCode)return <div className={CALLOUT}>{loadCode==='document_withdrawn'?t('withdrawn'):errText(loadCode)}</div>;
 if(!data)return <div className={`${CARD} ${TINY}`} aria-busy="true">{t('loading')}</div>;

 const {report,document:doc,licence}=data;
 const live=[...groupFields(data.fields).values()].flat();
 const effectiveCount=live.filter(f=>f.status==='confirmed'||f.status==='corrected'||f.status==='absent').length;
 const conflicts=conflictGroups(data.fields);
 const stale=isStaleRun(doc.current_parse_run_id,data.fields);
 const cols=blockerColumns(data.blockers);
 const targetKeys=[...new Set([...data.targets.map(x=>x.target_key),...[...groupFields(data.fields).keys()].filter(k=>k!=='')])];
 const max=licence.snippet_max_chars;
 const spans=pageText?live.filter(f=>f.page===pageText.page&&f.parse_run_id===pageText.parseRunId&&f.char_start!==null&&f.char_end!==null).map(f=>({start:f.char_start!,end:f.char_end!,id:f.field_id})):[];
 const blockerLabel=(c:string)=>{const {key,arg}=blockerParts(c);return t.has(`blockers.${key}`)?t(`blockers.${key}`,{arg:arg??''}):c;};
 const published=report.status==='published';


 const tabs:[Tab,string][]=[...targetKeys.map(k=>[{kind:'target',key:k} as Tab,k] as [Tab,string]),[{kind:'report'},t('tabs.report')],[{kind:'snippets'},t('tabs.snippets')],[{kind:'title'},t('tabs.title')],[{kind:'summaries'},t('tabs.summaries')]];
 const sameTab=(a:Tab,b:Tab)=>a.kind===b.kind&&(a.kind!=='target'||(b.kind==='target'&&a.key===b.key));
 const ctxValue:ReviewCtxValue={data,report,post,reportId,published,busy,sel,pageText,live,conflicts,targetKeys,max};
 return (
  <ReviewCtx.Provider value={ctxValue}>
  <div className="flex flex-col gap-4">
   <header className="flex flex-wrap items-center gap-2">
    <span className="font-mono text-xs text-text-dim" title={report.report_id}>{t('crumb',{id:shortId(report.report_id)})}</span>
    <span className={CHIP}>{t('confirmedCount',{done:effectiveCount,total:live.length})}</span>
    <span className={published?CHIP_ACCENT:CHIP}>{report.status} · {report.review_status}</span>
    <Link href={`/admin/broker-research/documents/${doc.document_id}`} className="text-xs">{t('toDocument')}</Link>
    <Link href={`/admin/broker-research/preview/${report.report_id}`} className="text-xs">{t('toPreview')}</Link>
    <button type="button" className={`${BTN_PRIMARY} ml-auto`} disabled={published} onClick={()=>setPublishOpen(true)}>{t('actions.publish')}</button>
   </header>
   {stale?<div role="status" className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-3.5 py-2.5 text-xs"><span className={DOT('warn')}/>{t('staleRun',{run:shortId(doc.current_parse_run_id)})}</div>:null}
   {code?<div role="alert" className={ERROR_BAR}>{errText(code)}</div>:null}
   <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
    <section className={`${CARD_FLUSH} flex min-h-[420px] flex-col`}>
     <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"><span className={H3}>{t('page.title',{page})}</span><span className={TINY}>{t('page.private')}</span>
      <div className="ml-auto flex items-center gap-2"><button type="button" className={BTN} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>{t('page.prev')}</button><span className="font-mono text-xs text-text-dim">{page} / {pageText?.pageCount??doc.page_count??'—'}</span><button type="button" className={BTN} disabled={pageText!==null&&page>=pageText.pageCount} onClick={()=>setPage(p=>p+1)}>{t('page.next')}</button></div></div>
     {pageCode?<p className="p-4 text-xs text-danger">{errText(pageCode)}</p>:!pageText?<p className={`p-4 ${TINY}`}>{t('loading')}</p>:(
      <div ref={textRef} className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-5 text-[13px] leading-7 text-text-dim"
       onMouseUp={()=>{const s=textRef.current?selectionIn(textRef.current):null;setSel(s?{...s,page:pageText.page,parseRunId:pageText.parseRunId}:null);}}>
       {segmentText(pageText.text,spans).map((s,i)=>s.id?<mark key={i} className="border-b-2 border-accent bg-[var(--accent-wash)] px-0.5 text-text">{s.text}</mark>:<span key={i}>{s.text}</span>)}
      </div>)}
     <div className={`mt-auto border-t border-border px-4 py-2.5 ${TINY}`}>{sel?t('page.selection',{n:sel.text.length,start:sel.start,end:sel.end}):t('page.parseRun',{run:shortId(pageText?.parseRunId)})}</div>
    </section>
    <section className={`${CARD_FLUSH} flex flex-col`}>
     <div role="tablist" className="flex flex-wrap gap-1 border-b border-border px-3 pt-2">{tabs.map(([tb,label])=><button key={label} role="tab" type="button" aria-selected={sameTab(tab,tb)} className={`-mb-px border-b-2 px-2.5 py-2 text-xs ${sameTab(tab,tb)?'border-accent text-text':'border-transparent text-text-dim hover:text-text'} ${tb.kind==='target'?'font-mono':''}`} onClick={()=>setTab(tb)}>{label}</button>)}</div>
     <div className="p-4" role="tabpanel">{tab.kind==='target'?<TargetTab targetKey={tab.key}/>:tab.kind==='report'?<ReportTab/>:tab.kind==='snippets'?<SnippetsTab/>:tab.kind==='title'?<TitleTab/>:<SummariesTab/>}</div>
     <p className={`${TINY} px-4 pb-3`}>{t('typedNote')}</p>
    </section>
    <aside className={`${CARD} flex flex-col gap-3.5`} aria-label={t('blockers.title')}>
     <div className={H3}>{t('blockers.title')}</div>
     {([['reviewReady',cols.reviewReady],['publishReady',cols.publishReady]] as const).map(([k,list])=>(
      <div key={k}><div className="mb-1.5 text-[11px] text-text-dim">{t(`blockers.${k}`)}</div>
       <ul className="flex flex-col gap-1.5 text-xs">{list.length===0?<li className="flex items-center gap-2"><span className={DOT('ok')}/>{t('blockers.none')}</li>:list.map(b=><li key={b} className="flex items-start gap-2"><span className={`${DOT('err')} mt-1`}/><span className="break-all">{blockerLabel(b)}</span></li>)}</ul></div>))}
     {published?<UnpublishBox onUnpublish={reason=>void post(`/reports/${reportId}/unpublish`,{reason})} busy={busy}/>:<>
      <button type="button" className={BTN} disabled={busy||cols.reviewReady.length>0||report.review_status==='approved'} onClick={()=>void post(`/reports/${reportId}/review`,{action:'approve'})}>{t('actions.markReviewed')}</button>
      <button type="button" className={BTN_PRIMARY} disabled={cols.publishReady.length>0} onClick={()=>setPublishOpen(true)}>{cols.publishReady.length?t('actions.publishBlocked',{n:cols.publishReady.length}):t('actions.publish')}</button></>}
    </aside>
   </div>
   {publishOpen?<PublishDialog reportId={reportId} licence={licence} approvedSnippets={data.snippets.filter(s=>s.status==='approved').length} approvedSummaries={data.summaries.filter(s=>s.status==='approved').length} codeVersion={report.code_version} onClose={()=>{setPublishOpen(false);void load();}}/>:null}
  </div>
  </ReviewCtx.Provider>
 );
}


interface ReviewCtxValue{data:ReviewPayload;report:ReviewPayload['report'];post:(path:string,body:unknown)=>Promise<boolean>;reportId:string;published:boolean;busy:boolean;sel:Sel|null;pageText:PageText|null;live:FieldRow[];conflicts:Map<string,FieldRow[]>;targetKeys:string[];max:number}
// Context instead of nested component definitions: the editors keep their local state (open editor,
// typed form) when the parent re-renders, e.g. when a text selection is made while an editor is open.
const ReviewCtx=createContext<ReviewCtxValue|null>(null);
function useReview(){const c=useContext(ReviewCtx);if(!c)throw new Error('ReviewCtx missing');return c;}

function FieldLine({f}:{f:FieldRow}){
 const {post,reportId,published,busy,sel,pageText}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const [editing,setEditing]=useState(false);const [form,setForm]=useState<TypedForm>(typedFormOf(effectiveValue(f)));const [useSel,setUseSel]=useState(false);const [bad,setBad]=useState<string|null>(null);
 const v=effectiveValue(f),kind=fieldKind(f.field),candidate=f.status==='extracted'||f.status==='unverified';
 const prov=f.status==='absent'?t('prov.absent'):f.extractor.startsWith('human:')?t('prov.human'):candidate?t('prov.llm'):t('prov.llmReviewed');
 async function correct(){
  const b=buildTyped(f.field,form);if(!b.ok){setBad(b.error);return;}
  const span=useSel&&sel?{page:sel.page,char_start:sel.start,char_end:sel.end,value_source_text:sel.text,parse_run_id:sel.parseRunId}:undefined;
  if(await post(`/reports/${reportId}/fields/${f.field_id}`,{action:'correct',payload:{corrected:b.value,...(span?{span}:{})}}))setEditing(false);
 }
 return (
  <div className="grid grid-cols-1 gap-2 border-b border-border py-2.5 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center">
   <span className="text-xs text-text-dim">{tf(f.field)}{f.occurrence>1?` #${f.occurrence}`:''}</span>
   <span className="min-w-0 break-words font-mono text-sm">{v.value_text}{v.value_num!==null&&kind!=='text'?<span className="ml-1.5 text-[11px] text-text-muted">= {v.value_num}{v.value_unit?` ${v.value_unit}`:''}{v.value_currency?` ${v.value_currency}`:''}</span>:null}{v.value_date?<span className="ml-1.5 text-[11px] text-text-muted">= {v.value_date}</span>:null}</span>
   <span className="flex flex-wrap items-center gap-1.5">
    <span className={candidate?(f.status==='unverified'?CHIP_WARN:CHIP):CHIP_ACCENT}>{prov}{f.page?` · p.${f.page}`:''}{f.status==='unverified'?` · ${t('unverified')}`:''}</span>
    {published?null:<>
     {candidate?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/${f.field_id}`,{action:'confirm',payload:{}})}>{t('actions.confirm')}</button>:null}
     {f.status!=='absent'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>setEditing(e=>!e)}>{t('actions.correct')}</button>:null}
     {f.status!=='rejected'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/${f.field_id}`,{action:'reject',payload:{}})}>{t('actions.reject')}</button>:null}
     {ABSENT_FIELDS.includes(f.field)&&f.status!=='absent'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/${f.field_id}`,{action:'absent',payload:{page:pageText?.page??1}})}>{t('actions.absent')}</button>:null}
    </>}
   </span>
   {editing?<div className="col-span-full flex flex-col gap-2 rounded-md border border-border bg-bg-elevated p-3">
    <TypedInputs field={f.field} form={form} setForm={setForm} bad={bad}/>
    {sel?<label className="flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={useSel} onChange={e=>setUseSel(e.target.checked)}/>{t('useSelection',{page:sel.page,n:sel.text.length})}</label>:<p className={TINY}>{t('selectHint')}</p>}
    <div className="flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={()=>void correct()}>{t('actions.saveCorrection')}</button><button type="button" className={BTN_GHOST} onClick={()=>setEditing(false)}>{t('actions.cancel')}</button></div>
   </div>:null}
  </div>
 );
}
function TypedInputs({field,form,setForm,bad}:{field:FieldName;form:TypedForm;setForm:(f:TypedForm)=>void;bad:string|null}){
 const t=useTranslations('foreign-research.admin.review');
 const kind=fieldKind(field);
 const input=(k:keyof TypedForm,label:string,type='text')=><div className="min-w-0 flex-1"><label className={FIELD_LABEL}>{label}<input type={type} className={`${INPUT} mt-1 font-mono ${bad===k?'border-danger':''}`} aria-invalid={bad===k} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label></div>;
 return (<div className="flex flex-col gap-2">
  <div className="flex flex-wrap gap-2">{input('value_text',t('typed.text'))}
   {kind==='price'||kind==='pct'||kind==='months'?input('value_num',t(`typed.num_${kind}`)):null}
   {kind==='price'?input('value_currency',t('typed.currency')):null}
   {kind==='date'?input('value_date',t('typed.date'),'date'):null}</div>
  <p className={TINY}>{t(`typed.help_${kind}`)}</p>{bad?<p className="text-[11px] text-danger">{t(`typed.invalid_${bad}`)}</p>:null}
 </div>);
}
function AddField({targetKey}:{targetKey:string|null}){
 const {post,reportId,published,busy,sel,live}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const options=targetKey===null?REPORT_LEVEL:TARGET_LEVEL;
 const [field,setField]=useState<FieldName>(options[0]);const [form,setForm]=useState<TypedForm>({...EMPTY_FORM,value_text:sel?.text??''});const [bad,setBad]=useState<string|null>(null);
 useEffect(()=>{setForm(f=>({...f,value_text:sel?.text??f.value_text}));},[]);   // eslint-disable-line react-hooks/exhaustive-deps -- prefill once per mount
 if(!sel)return <p className={TINY}>{t('addNeedsSelection')}</p>;
 const occurrence=1+Math.max(0,...live.filter(x=>x.target_key===targetKey&&x.field===field).map(x=>x.occurrence));
 async function add(){
  const b=buildTyped(field,form);if(!b.ok){setBad(b.error);return;}
  await post(`/reports/${reportId}/fields`,{target_key:targetKey,field,occurrence,page:sel!.page,char_start:sel!.start,char_end:sel!.end,value_source_text:sel!.text,parse_run_id:sel!.parseRunId,status:'confirmed',...b.value});
 }
 return (<div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
  <div className={H3}>{t('addField')}</div>
  <label className={FIELD_LABEL}>{t('field')}<select className={`${INPUT} mt-1`} value={field} onChange={e=>setField(e.target.value as FieldName)}>{options.map(o=><option key={o} value={o}>{tf(o)}</option>)}</select></label>
  <TypedInputs field={field} form={form} setForm={setForm} bad={bad}/>
  <p className={TINY}>{t('addSpan',{page:sel.page,start:sel.start,end:sel.end,occurrence})}</p>
  <button type="button" className={`${BTN} self-start`} disabled={busy||published} onClick={()=>void add()}>{t('actions.add')}</button>
 </div>);
}
function TargetTab({targetKey}:{targetKey:string}){
 const {data,post,reportId,published,busy,pageText,conflicts}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const rows=groupFields(data.fields).get(targetKey)??[];
 const target=data.targets.find(x=>x.target_key===targetKey);
 const [ticker,setTicker]=useState(target?.security_ticker??'');
 const present=new Set(rows.filter(r=>r.status!=='rejected').map(r=>r.field));
 return (<div className="flex flex-col gap-3">
  {target?<div className="flex flex-wrap items-center gap-2 text-xs text-text-dim"><span className={CHIP}>{target.basis}</span><span>{t('resolved',{ticker:target.security_ticker??'—',issuer:shortId(target.issuer_id)})}</span>
   {target.rating_normalized?<span className={CHIP}>{target.rating_normalized}{target.scale_id?` · ${shortId(target.scale_id)}`:''}</span>:<span className={CHIP_WARN}>{t('ratingUnmapped')}</span>}</div>:null}
  {[...conflicts.entries()].filter(([,g])=>g[0].target_key===targetKey).map(([gid,g])=>(
   <div key={gid} className="rounded-md border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] p-2.5"><div className="mb-1 text-xs text-warn">{t('conflict',{field:tf(g[0].field),n:g.length})}</div>{g.map(f=><FieldLine key={f.field_id} f={f}/>)}</div>))}
  <div>{rows.filter(r=>!(r.conflict_group&&conflicts.has(r.conflict_group))).map(f=><FieldLine key={f.field_id} f={f}/>)}</div>
  {published?null:<div className="flex flex-wrap gap-2">{ABSENT_FIELDS.filter(x=>x!=='analyst'&&!present.has(x)).map(x=><button key={x} type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/absent`,{field:x,targetKey,page:pageText?.page??1})}>{t('markAbsent',{field:tf(x),page:pageText?.page??1})}</button>)}</div>}
  {published?null:<AddField targetKey={targetKey}/>}
  {published?null:<div className="flex flex-wrap items-end gap-2"><label className={`${FIELD_LABEL} min-w-[200px] flex-1`}>{t('override')}<input className={`${INPUT} mt-1 font-mono`} value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())}/></label>
   <button type="button" className={BTN} disabled={busy||!ticker.trim()} onClick={()=>void post(`/reports/${reportId}/overrides`,{targetKey,securityTicker:ticker.trim()})}>{t('actions.override')}</button></div>}
 </div>);
}
function ReportTab(){
 const {data,report,post,reportId,published,busy,targetKeys}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const rows=groupFields(data.fields).get('')??[];
 const [scope,setScope]=useState(report.scope??'');const [inst,setInst]=useState(report.institution_id??'');const [type,setType]=useState(report.report_type??'');
 const [primary,setPrimary]=useState(report.primary_target_key??'');const [supersedes,setSupersedes]=useState(report.supersedes_report_id??'');
 const analystRows=rows.filter(r=>r.field==='analyst'&&r.status!=='absent');
 const [analystId,setAnalystId]=useState('');const [analystField,setAnalystField]=useState(analystRows[0]?.field_id??'');const [role,setRole]=useState('');
 const bind=(patch:Record<string,unknown>)=>void post(`/reports/${reportId}/bind`,patch);
 const instAnalysts=data.analysts.filter(a=>a.institution_id===report.institution_id);
 return (<div className="flex flex-col gap-3">
  <div>{rows.map(f=><FieldLine key={f.field_id} f={f}/>)}</div>
  {published?null:<AddField targetKey={null}/>}
  {published?null:<div className="grid gap-3 sm:grid-cols-2">
   <label className={FIELD_LABEL}>{t('bind.scope')}<div className="mt-1 flex gap-2"><select className={INPUT} value={scope} onChange={e=>setScope(e.target.value)}><option value="">—</option>{SCOPES.map(s=><option key={s} value={s}>{t(`scopes.${s}`)}</option>)}</select><button type="button" className={BTN} disabled={busy||!scope} onClick={()=>bind({scope})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.institution')}<div className="mt-1 flex gap-2"><select className={INPUT} value={inst} onChange={e=>setInst(e.target.value)}><option value="">—</option>{data.institutions.map(i=><option key={i.institution_id} value={i.institution_id}>{i.name_en}</option>)}</select><button type="button" className={BTN} disabled={busy||!inst} onClick={()=>bind({institution_id:inst})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.reportType')}<div className="mt-1 flex gap-2"><input className={INPUT} value={type} onChange={e=>setType(e.target.value)}/><button type="button" className={BTN} disabled={busy} onClick={()=>bind({report_type:type.trim()||null})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.primary')}<div className="mt-1 flex gap-2"><select className={INPUT} value={primary} onChange={e=>setPrimary(e.target.value)}><option value="">—</option>{targetKeys.map(k=><option key={k} value={k}>{k}</option>)}</select><button type="button" className={BTN} disabled={busy||!primary} onClick={()=>bind({primary_target_key:primary})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.supersedes')}<div className="mt-1 flex gap-2"><input className={`${INPUT} font-mono`} value={supersedes} onChange={e=>setSupersedes(e.target.value.trim())} placeholder="report_id"/><button type="button" className={BTN} disabled={busy} onClick={()=>bind({supersedes_report_id:supersedes||null})}>{t('actions.save')}</button></div></label>
   <div className="flex flex-col gap-1.5"><span className={FIELD_LABEL}>{t('bind.analyst')}</span>
    <select className={INPUT} aria-label={t('bind.analyst')} value={analystId} onChange={e=>setAnalystId(e.target.value)}><option value="">—</option>{instAnalysts.map(a=><option key={a.analyst_id} value={a.analyst_id}>{a.display_name}{a.public_display?'':` · ${t('bind.private')}`}</option>)}</select>
    <select className={INPUT} aria-label={t('bind.analystField')} value={analystField} onChange={e=>setAnalystField(e.target.value)}>{analystRows.map(r=><option key={r.field_id} value={r.field_id}>{effectiveValue(r).value_text} · p.{r.page??'—'}</option>)}</select>
    <input className={INPUT} aria-label={t('bind.role')} placeholder={t('bind.role')} value={role} onChange={e=>setRole(e.target.value)}/>
    <button type="button" className={`${BTN} self-start`} disabled={busy||!analystId||!analystField} onClick={()=>bind({analyst:{analyst_id:analystId,field_id:analystField,role:role.trim()||null}})}>{t('actions.bindAnalyst')}</button></div>
  </div>}
 </div>);
}
function SnippetsTab(){
 const {data,post,reportId,published,busy,sel,max,targetKeys}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const [purpose,setPurpose]=useState<SnippetPurpose>('thesis');const [targetKey,setTargetKey]=useState('');
 const left=sel?remainingChars(max,sel.text.length):null;
 return (<div className="flex flex-col gap-3">
  {published?null:<div className="flex flex-col gap-2 rounded-md border border-border p-3">
   <div className={H3}>{t('snippets.new')}</div>
   {sel?<blockquote className="rounded-md border border-border px-3 py-2 text-xs text-text-dim">“{sel.text}” — p.{sel.page}</blockquote>:<p className={TINY}>{t('selectHint')}</p>}
   <div className="flex items-center gap-2 text-xs"><span className="text-text-dim">{t('snippets.remaining')}</span><div className="h-1.5 w-40 overflow-hidden rounded bg-bg-elevated" aria-hidden="true"><div className={`h-full ${left!==null&&left<0?'bg-danger':'bg-accent'}`} style={{width:`${sel&&max>0?Math.min(100,Math.round(sel.text.length/max*100)):0}%`}}/></div><span className={`font-mono ${left!==null&&left<0?'text-danger':'text-text-dim'}`}>{sel?`${sel.text.length} / ${max}`:`0 / ${max}`}</span></div>
   <div className="flex flex-wrap gap-2">
    <select className={`${INPUT} w-40`} aria-label={t('snippets.purpose')} value={purpose} onChange={e=>setPurpose(e.target.value as SnippetPurpose)}>{SNIPPET_PURPOSES.map(p=><option key={p} value={p}>{t(`purposes.${p}`)}</option>)}</select>
    <select className={`${INPUT} w-48`} aria-label={t('snippets.target')} value={targetKey} onChange={e=>setTargetKey(e.target.value)}><option value="">{t('snippets.noTarget')}</option>{targetKeys.map(k=><option key={k} value={k}>{k}</option>)}</select>
    <button type="button" className={BTN} disabled={busy||!sel||left===null||left<0||sel.text.length===0} onClick={()=>void post(`/reports/${reportId}/snippets`,{purpose,target_key:targetKey||null,parse_run_id:sel!.parseRunId,page:sel!.page,char_start:sel!.start,char_end:sel!.end,text:sel!.text,field_id:null})}>{t('snippets.create')}</button>
   </div>
  </div>}
  {data.snippets.length===0?<p className={TINY}>{t('snippets.none')}</p>:data.snippets.map(s=>(
   <div key={s.snippet_id} className="flex flex-col gap-1.5 border-b border-border py-2.5">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className={s.status==='approved'?CHIP_ACCENT:s.status==='rejected'?CHIP_DANGER:CHIP}>{s.status}</span><span className="text-text-dim">{t(`purposes.${s.purpose}`)} · p.{s.page}{s.target_key?` · ${s.target_key}`:''}</span>
     {s.disclosure_check&&!s.disclosure_check.passed?<span className={CHIP_DANGER}>{t('snippets.disclosureHits',{tokens:s.disclosure_check.hits.map(h=>h.kind).join(', ')})}</span>:null}</div>
    <p className="text-sm text-text-dim">{s.text??t('snippets.purged')}</p>
    {published||s.status==='rejected'?null:<div className="flex gap-2">{s.status==='draft'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/snippets/${s.snippet_id}`,{action:'approve'})}>{t('actions.approve')}</button>:null}<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/snippets/${s.snippet_id}`,{action:'reject'})}>{t('actions.reject')}</button></div>}
   </div>))}
 </div>);
}
function TitleTab(){
 const {data,report,post,reportId,published,busy}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const [title,setTitle]=useState(report.title_public??'');
 const hits=data.blockers.filter(b=>blockerParts(b).key==='restricted_value_in_text'&&(blockerParts(b).arg??'').startsWith('title'));
 return (<div className="flex flex-col gap-3">
  <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs"><dt className="text-text-dim">{t('title.original')}</dt><dd>{report.title_original??'—'}</dd><dt className="text-text-dim">{t('title.zh')}</dt><dd>{report.title_zh??'—'}</dd><dt className="text-text-dim">{t('title.en')}</dt><dd>{report.title_en??'—'}</dd></dl>
  <label className={FIELD_LABEL}>{t('title.public')}<input className={`${INPUT} mt-1 ${hits.length?'border-danger':''}`} value={title} onChange={e=>setTitle(e.target.value)} disabled={published}/></label>
  {hits.length?<p className="text-xs text-text">{t('title.blocked',{surfaces:hits.map(h=>blockerParts(h).arg).join(', ')})}</p>:null}
  {published?null:<div className="flex gap-2"><button type="button" className={BTN} disabled={busy} onClick={()=>void post(`/reports/${reportId}/bind`,{title_public:title.trim()||null})}>{t('actions.save')}</button><button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/translate`,{})}>{t('title.translate')}</button></div>}
 </div>);
}
function SummariesTab(){
 const {data,report,post,reportId,published,busy,max}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 return (<div className="flex flex-col gap-3">
  {published?null:<div className="flex gap-2">{(['zh','en'] as const).map(lang=><button key={lang} type="button" className={BTN} disabled={busy} onClick={()=>void post(`/reports/${reportId}/summary`,{lang})}>{t('summaries.generate',{lang})}</button>)}</div>}
  {data.summaries.length===0?<p className={TINY}>{t('summaries.none')}</p>:data.summaries.map(s=>{const stale=s.input_hash!==report.summary_input_digest;return (
   <div key={s.summary_id} className="flex flex-col gap-1.5 border-b border-border py-2.5">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className={s.status==='approved'?CHIP_ACCENT:s.status==='rejected'?CHIP_DANGER:CHIP}>{s.lang} · {s.status}</span>
     <span className={s.max_verbatim_overlap<=max?CHIP:CHIP_DANGER}>{t('summaries.overlap',{n:s.max_verbatim_overlap,max})}</span>
     <span className={s.numeric_grounding.passed?CHIP:CHIP_DANGER}>{t(s.numeric_grounding.passed?'summaries.grounded':'summaries.ungrounded')}</span>
     <span className={s.disclosure_check.passed?CHIP:CHIP_DANGER}>{t(s.disclosure_check.passed?'summaries.disclosureOk':'summaries.disclosureHit')}</span>
     {stale?<span className={CHIP_WARN}>{t('summaries.stale')}</span>:null}</div>
    <p className="whitespace-pre-wrap text-sm text-text-dim">{s.summary_md}</p>
    {published||s.status==='rejected'?null:<div className="flex gap-2">{s.status==='draft'?<button type="button" className={BTN_GHOST} disabled={busy||stale} onClick={()=>void post(`/summaries/${s.summary_id}`,{action:'approve'})}>{t('actions.approve')}</button>:null}<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/summaries/${s.summary_id}`,{action:'reject'})}>{t('actions.reject')}</button></div>}
   </div>);})}
 </div>);
}

function UnpublishBox({onUnpublish,busy}:{onUnpublish:(reason:string)=>void;busy:boolean}){
 const t=useTranslations('foreign-research.admin.review');
 const [reason,setReason]=useState('');
 return (<div className="flex flex-col gap-2"><label className={FIELD_LABEL}>{t('unpublish.reason')}<input className={`${INPUT} mt-1`} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  <button type="button" className={BTN} disabled={busy||!reason.trim()} onClick={()=>onUnpublish(reason.trim())}>{t('unpublish.submit')}</button><p className={TINY}>{t('unpublish.note')}</p></div>);
}
```

注：编辑器组件（`FieldLine`、`TargetTab` …）定义在模块顶层，经 `ReviewCtx` 取共享数据，父组件重渲染（例如框选文本）不会重置它们的局部编辑态。

```tsx
// src/app/(app)/admin/broker-research/review/[reportId]/PublishDialog.tsx
'use client';
// Publish dialog (spec §6.5, §9.5; Publish artboard). State A: blockers from GET publish-blockers,
// publish disabled. Ready: what will be public under the licence. State B: the immutable snapshot id,
// hash, rule receipt and licence version from GET publications/[id]; outbox claim.register rows are
// written by the SQL publish function (the page does not enqueue anything).
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {LicenceRow,PublicationRow} from '@/lib/broker-research/types';
import {shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,BTN_GHOST,BTN_PRIMARY,CALLOUT,ERROR_BAR,H2,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {adminJson,baseCode} from '../../_shared/admin-fetch';
import {blockerParts} from './review-model';

type Phase={kind:'loading'}|{kind:'blocked';blockers:string[]}|{kind:'ready'}|{kind:'publishing'}|{kind:'published';publicationId:string;publication:PublicationRow|null}|{kind:'error';code:string};
export function PublishDialog({reportId,licence,approvedSnippets,approvedSummaries,codeVersion,onClose}:{reportId:string;licence:LicenceRow;approvedSnippets:number;approvedSummaries:number;codeVersion:string;onClose:()=>void}){
 const t=useTranslations('foreign-research.admin.publish');
 const tr=useTranslations('foreign-research.admin.review');
 const te=useTranslations('foreign-research.admin.errors');
 const [phase,setPhase]=useState<Phase>({kind:'loading'});
 const closeRef=useRef<HTMLButtonElement>(null);
 async function check(){
  const r=await adminJson<{blockers:string[]}>('GET',`/reports/${reportId}/publish-blockers`);
  if(!r.ok){setPhase({kind:'error',code:r.code});return;}
  setPhase(r.data.blockers.length?{kind:'blocked',blockers:r.data.blockers}:{kind:'ready'});
 }
 useEffect(()=>{closeRef.current?.focus();void check();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return ()=>window.removeEventListener('keydown',k);},[]);   // eslint-disable-line react-hooks/exhaustive-deps -- once on open
 async function publish(){
  setPhase({kind:'publishing'});
  const r=await adminJson<{publicationId:string}>('POST',`/reports/${reportId}/publish`,{});
  if(!r.ok){if(baseCode(r.code)==='publish_blocked'){await check();return;}setPhase({kind:'error',code:r.code});return;}
  const p=await adminJson<{publication:PublicationRow}>('GET',`/publications/${r.data.publicationId}`);
  setPhase({kind:'published',publicationId:r.data.publicationId,publication:p.ok?p.data.publication:null});
 }
 const label=(c:string)=>{const {key,arg}=blockerParts(c);return tr.has(`blockers.${key}`)?tr(`blockers.${key}`,{arg:arg??''}):c;};
 const willBePublic=[t('public.metadata'),licence.allows_public_target_price?t('public.target',{version:licence.version}):t('public.noTarget'),licence.allows_public_summary&&approvedSummaries?t('public.summary',{n:approvedSummaries}):null,licence.allows_public_snippets&&approvedSnippets?t('public.snippets',{n:approvedSnippets,max:licence.snippet_max_chars}):null].filter((x):x is string=>x!==null);
 return (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-4 sm:p-12">
   <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="w-full max-w-xl rounded-lg border border-border bg-bg-elevated shadow-[var(--shadow)]">
    <div className="border-b border-border px-6 py-5"><h2 id="publish-title" className={H2}>{phase.kind==='published'?t('doneTitle'):t('title')}</h2></div>
    <div className="flex flex-col gap-3 px-6 py-5">
     {phase.kind==='loading'||phase.kind==='publishing'?<p className={TINY}>{t('checking')}</p>:null}
     {phase.kind==='error'?<div role="alert" className={ERROR_BAR}>{te.has(baseCode(phase.code))?te(baseCode(phase.code)):te('generic',{code:phase.code})}</div>:null}
     {phase.kind==='blocked'?<><div className="text-[11px] text-text-dim">{t('blockers',{n:phase.blockers.length})}</div>{phase.blockers.map(b=><div key={b} className={ERROR_BAR}>{label(b)}</div>)}</>:null}
     {phase.kind==='blocked'||phase.kind==='ready'?<><div className="mt-1.5 text-[11px] text-text-dim">{t('willBePublic')}</div><ul className="list-disc pl-5 text-xs text-text-dim">{willBePublic.map(x=><li key={x}>{x}</li>)}</ul><p className={TINY}>{t('switchNote')}</p></>:null}
     {phase.kind==='published'?<><dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-text-dim">{t('snapshot')}</dt><dd className="break-all font-mono" title={phase.publicationId}>{shortId(phase.publicationId)} · {t('immutable')}</dd>
      <dt className="text-text-dim">{t('snapshotHash')}</dt><dd className="break-all font-mono">{phase.publication?.snapshot_hash??'—'}</dd>
      <dt className="text-text-dim">{t('rulesReceipt')}</dt><dd className="font-mono">{shortId(phase.publication?.rules_receipt_id)}</dd>
      <dt className="text-text-dim">{t('licenceVersion')}</dt><dd className="font-mono">v{phase.publication?.licence_version??'—'}</dd>
      <dt className="text-text-dim">{t('codeVersion')}</dt><dd className="font-mono">{codeVersion}</dd>
      <dt className="text-text-dim">{t('f4')}</dt><dd>{t('f4Queued')}</dd></dl>
      <p className={CALLOUT}>{t('afterNote')}</p></>:null}
    </div>
    <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
     {phase.kind==='published'?<><Link href={`/admin/broker-research/preview/${reportId}`} className={`${BTN} hover:no-underline`}>{t('viewPreview')}</Link><button ref={closeRef} type="button" className={BTN_PRIMARY} onClick={onClose}>{t('done')}</button></>:<>
      <button ref={closeRef} type="button" className={BTN_GHOST} onClick={onClose}>{t('cancel')}</button>
      <button type="button" className={BTN_PRIMARY} disabled={phase.kind!=='ready'} onClick={()=>void publish()}>{t('publish')}</button></>}
    </div>
   </div>
  </div>
 );
}
```

- [ ] **Step 7: 预览页**

```tsx
// src/app/(app)/admin/broker-research/preview/[reportId]/page.tsx
// Admin preview (spec §9.1; Preview artboard): service-role data, the same ReportView as the public page,
// labelled "预览 · 未对外". Works while public_enabled=false (spec §14 acceptance 8).
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {UUID_RE} from '@/lib/facts/public-route';
import {adminReadDeps} from '@/lib/broker-research/admin-read';
import {previewPageData} from '@/lib/broker-research/preview';
import {ReportView} from '@/app/(app)/intel/foreign-research/components/ReportView';
import {CALLOUT} from '@/app/(app)/intel/foreign-research/components/ui';
import {AdminDenied,adminGate} from '../../_shared/gate';

export const dynamic='force-dynamic';

export default async function BrokerResearchPreviewPage({params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 if(!await adminGate(`/admin/broker-research/preview/${encodeURIComponent(reportId)}`))return <AdminDenied/>;
 if(!UUID_RE.test(reportId))notFound();
 const t=await getTranslations('foreign-research.public.preview');
 const tp=await getTranslations('foreign-research.admin.previewPage');
 const res=await previewPageData(adminReadDeps(),reportId.toLowerCase());
 if(res.kind==='not_found')notFound();
 return (
  <div className="flex flex-col gap-4">
   <div role="status" className="flex flex-wrap items-center gap-4 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-bg">
    <span className="font-semibold">{t('banner')}</span><span>{t('bannerBody')}</span>
    <Link href={`/admin/broker-research/review/${reportId}`} className="ml-auto text-bg underline">{t('back')}</Link>
   </div>
   {res.kind==='incomplete'?<p className={CALLOUT}>{tp('incomplete')}</p>:<>
    {res.meta.metadataPublic?null:<p className={CALLOUT}>{tp('metadataHidden')}</p>}
    <ReportView data={res.data} preview={{status:res.meta.status,reviewStatus:res.meta.reviewStatus}}/>
   </>}
  </div>
 );
}
```

- [ ] **Step 8: 页面测试已覆盖新页面**

D4 的 `src/app/(app)/admin/broker-research/pages.test.ts` 递归扫描所有 `page.tsx`，新增的三页自动纳入（force-dynamic、服务端组件、`adminGate` 调用）。

- [ ] **Step 9: 追加 D5 文案（`admin` 对象内追加 `document`、`review`、`publish`、`previewPage`）**

zh：

```json
    "document": {
      "status": {"uploaded": "待解析", "parsing": "解析中", "parsed": "已解析", "parse_failed": "解析失败", "withdrawn": "已撤回"},
      "review": {"pending": "待复核", "in_review": "复核中", "approved": "已复核", "rejected": "复核拒绝"},
      "licenceLine": "许可 {label} v{version} · {pages} 页",
      "promotionPending": "提升未完成",
      "verify": "核验 {status}",
      "working": "处理中…",
      "actions": {"viewOriginal": "查看原文（签名链接）", "parse": "解析", "extract": "抽取", "summarize": "生成摘要 {lang}", "translate": "翻译标题", "review": "去复核 →", "verify": "重跑核验"},
      "actionsNote": "查看原文：先写访问日志，再现铸 600 秒签名 URL（只发给管理员）。解析与抽取是两个独立动作，各自 maxDuration 300 s。",
      "runs": {"title": "运行（不可变）", "run": "run", "kind": "类型", "started": "开始", "status": "状态", "artifact": "产物 / 请求", "versions": "代码 · 提示词 / 抽取器", "detail": "详情", "empty": "尚无运行"},
      "withdraw": {"title": "撤回", "body": "撤回后公开路由 404，签名链接与原文路由一律 410；证据与审计保留。", "done": "已撤回 {date}：{reason}", "reason": "原因（必填）", "placeholder": "例如：许可终止", "alsoPurge": "同时开始清除", "submit": "撤回", "ok": "已撤回。"},
      "purge": {
        "title": "清除", "irreversible": "不可逆",
        "steps": {"pdf": "删除私有桶原文 PDF", "artifacts": "删除解析产物与页面图像", "runs": "删除运行请求 / 响应原文", "fields_text": "清空证据行原文跨度", "snippets_text": "清空片段文本", "summaries": "摘要置为拒绝", "quarantine_payload": "清空隔离项载荷"},
        "attempts": "尝试 {n} 次", "done": "已清除 {date}", "confirm": "输入文档 sha256 前 8 位以确认", "retry": "重试未完成步骤", "run": "执行清除", "needsWithdraw": "先撤回文档才能清除。"
      },
      "accessLog": "本文档的访问日志 →"
    },
    "review": {
      "withdrawn": "文档已撤回，复核数据不可读取（410）。",
      "loading": "加载中…",
      "prov": {"absent": "absent · 报告明确没有", "human": "人工新增", "llm": "LLM 抽取", "llmReviewed": "人工确认"},
      "unverified": "跨度未命中",
      "actions": {"confirm": "确认", "correct": "修正", "reject": "拒绝", "absent": "标为 absent", "saveCorrection": "保存修正", "cancel": "取消", "add": "新增字段", "override": "保存覆盖", "save": "保存", "bindAnalyst": "绑定分析师", "approve": "批准", "publish": "发布…", "publishBlocked": "发布（{n} 项阻断）", "markReviewed": "标记已复核"},
      "useSelection": "用当前框选作为引用位置（第 {page} 页，{n} 字）",
      "selectHint": "在左侧原文中框选文本，可作为引用位置或片段。",
      "typed": {
        "text": "原文值", "num_price": "数值", "num_pct": "小数（12.5% → 0.125）", "num_months": "月数", "currency": "币种（ISO，如 CNY）", "date": "日期",
        "help_price": "价格：数值 + 币种分别校验（typed/1）。", "help_currency": "三位 ISO 币种代码。", "help_months": "整数月数。", "help_pct": "百分数按小数录入。", "help_date": "ISO 日期。", "help_text": "按原文录入。",
        "invalid_value_text": "原文值不能为空或格式不符", "invalid_value_num": "数值格式不符", "invalid_value_currency": "币种须为三位大写字母", "invalid_value_date": "日期无效"
      },
      "addNeedsSelection": "新增字段需要先在原文中框选它的出处。",
      "addField": "按框选新增字段",
      "field": "字段",
      "addSpan": "出处：第 {page} 页，偏移 {start}–{end}，occurrence {occurrence}",
      "resolved": "解析：{ticker} · 发行人 {issuer}",
      "ratingUnmapped": "评级未映射",
      "conflict": "候选冲突：{field}（{n} 条，确认其一，其余自动拒绝）",
      "markAbsent": "{field} 标为 absent（第 {page} 页）",
      "override": "解析覆盖：证券代码",
      "bind": {"scope": "范围", "institution": "机构", "reportType": "报告类型", "primary": "主标的", "supersedes": "取代的报告", "analyst": "分析师", "private": "不公开", "analystField": "分析师证据行", "role": "角色"},
      "scopes": {"single_issuer": "单一发行人", "multi_issuer": "多发行人", "sector": "行业", "macro_strategy": "宏观策略"},
      "snippets": {"new": "新片段", "remaining": "剩余字数", "purpose": "用途", "target": "标的", "noTarget": "不绑定标的", "create": "创建片段", "none": "尚无片段", "disclosureHits": "披露检查未通过：{tokens}", "purged": "（文本已清除）"},
      "purposes": {"rating": "评级依据", "target": "目标价依据", "thesis": "核心观点", "risk": "风险", "method": "估值方法", "other": "其他"},
      "title": {"original": "原题", "zh": "中文译名", "en": "英文译名", "public": "公开标题 title_public", "blocked": "阻断第 15 条命中：{surfaces}。请改写公开标题。", "translate": "重新翻译"},
      "summaries": {"generate": "生成摘要 {lang}", "none": "尚无摘要", "overlap": "最长逐字重合 {n} / {max}", "grounded": "数字全部落地", "ungrounded": "数字未落地", "disclosureOk": "披露检查通过", "disclosureHit": "披露检查未通过", "stale": "输入已变化（需重新生成）"},
      "tabs": {"report": "报告级字段", "snippets": "片段", "title": "标题", "summaries": "摘要"},
      "crumb": "复核 {id}",
      "confirmedCount": "字段 {done} / {total} 已生效",
      "toDocument": "文档页 →",
      "toPreview": "预览 →",
      "staleRun": "stale_run：部分字段绑定的解析运行不是当前运行 {run}。人工确认的字段会保留；请核对后重新确认。",
      "page": {"title": "原文 · 第 {page} 页", "private": "私有 · 仅管理员", "prev": "← 上一页", "next": "下一页 →", "selection": "已框选 {n} 字（{start}–{end}）", "parseRun": "解析运行 {run}"},
      "typedNote": "类型化编辑：数值、币种、期限、日期各自校验（typed/1）；跨度须在页文本中逐字命中（R1），否则不能确认。",
      "blockers": {
        "title": "阻断项", "reviewReady": "复核就绪", "publishReady": "发布就绪", "none": "无",
        "review_not_approved": "尚未标记已复核", "licence_unconfirmed": "许可当前版本未确认（D1）", "licence_no_public_metadata": "许可不允许公开元数据", "document_not_parsed": "文档未解析",
        "report_incomplete": "报告级字段缺失：{arg}", "required_field_missing": "必填字段缺失：{arg}", "field_pending": "必填字段仍是候选：{arg}", "target_unresolved": "标的未解析：{arg}",
        "target_cardinality": "标的数量与范围不符", "quarantine_open": "有未处理隔离项：{arg}", "materialize_stale": "物化已过期", "rules_stale": "规则回执过期或未通过",
        "eval_receipt_missing": "含 LLM 字段但缺少有效黄金集回执", "summary_stale": "已批准摘要的输入已变化", "restricted_value_in_text": "受限值或受限姓名出现在：{arg}",
        "evidence_drift": "核验发现证据漂移", "disclosure_stale": "披露输入变化，需重跑披露检查", "conflict_unresolved": "候选冲突未解决：{arg}"
      },
      "unpublish": {"reason": "取消发布原因", "submit": "取消发布", "note": "取消发布后公开路由 404，revision +1；快照保留用于审计。"}
    },
    "publish": {
      "title": "发布这份报告？", "doneTitle": "已发布", "checking": "检查阻断项…", "blockers": "阻断（{n}）", "willBePublic": "将公开",
      "public": {"metadata": "元数据、评级原文与标准化", "target": "目标价（许可 v{version} 允许）", "noTarget": "目标价不公开（许可不允许）", "summary": "独立摘要 {n} 篇（AI 标注）", "snippets": "片段 {n} 段（≤ {max} 字）"},
      "switchNote": "对外开关关闭时，发布后只能在预览中查看。",
      "snapshot": "发布快照", "immutable": "不可变", "snapshotHash": "快照哈希", "rulesReceipt": "规则回执", "licenceVersion": "许可版本", "codeVersion": "代码版本", "f4": "F4 登记", "f4Queued": "outbox claim.register 已由发布函数入队",
      "afterNote": "取消发布 / 撤回会让公开路由返回 404；快照保留用于审计。", "viewPreview": "查看预览", "done": "完成", "cancel": "取消", "publish": "发布"
    },
    "previewPage": {"incomplete": "报告缺少标题等公开必需字段，暂时无法预览。", "metadataHidden": "许可不允许公开元数据：即使发布，公开页也不会出现这份报告。"}
```

en：

```json
    "document": {
      "status": {"uploaded": "To parse", "parsing": "Parsing", "parsed": "Parsed", "parse_failed": "Parse failed", "withdrawn": "Withdrawn"},
      "review": {"pending": "Review pending", "in_review": "In review", "approved": "Reviewed", "rejected": "Review rejected"},
      "licenceLine": "Licence {label} v{version} · {pages} pages",
      "promotionPending": "Promotion pending",
      "verify": "Verify {status}",
      "working": "Working…",
      "actions": {"viewOriginal": "View original (signed link)", "parse": "Parse", "extract": "Extract", "summarize": "Summarize {lang}", "translate": "Translate title", "review": "Review →", "verify": "Re-run verify"},
      "actionsNote": "View original writes the access log first, then mints a 600-second signed URL for admins only. Parse and extract are separate actions, each with maxDuration 300 s.",
      "runs": {"title": "Runs (immutable)", "run": "run", "kind": "Kind", "started": "Started", "status": "Status", "artifact": "Artifact / request", "versions": "Code · prompt / extractor", "detail": "Detail", "empty": "No runs yet"},
      "withdraw": {"title": "Withdraw", "body": "After withdrawal public routes 404 and signed-link and text routes 410; evidence and audit are kept.", "done": "Withdrawn {date}: {reason}", "reason": "Reason (required)", "placeholder": "e.g. licence ended", "alsoPurge": "Also start purging", "submit": "Withdraw", "ok": "Withdrawn."},
      "purge": {
        "title": "Purge", "irreversible": "Irreversible",
        "steps": {"pdf": "Delete the original PDF from the private bucket", "artifacts": "Delete parse artifacts and page images", "runs": "Delete raw run requests / responses", "fields_text": "Clear evidence spans", "snippets_text": "Clear snippet text", "summaries": "Reject summaries", "quarantine_payload": "Clear quarantine payloads"},
        "attempts": "{n} attempts", "done": "Purged {date}", "confirm": "Type the first 8 characters of the document sha256 to confirm", "retry": "Retry unfinished steps", "run": "Run purge", "needsWithdraw": "Withdraw the document before purging."
      },
      "accessLog": "Access log for this document →"
    },
    "review": {
      "withdrawn": "The document is withdrawn; review data can no longer be read (410).",
      "loading": "Loading…",
      "prov": {"absent": "absent · not in report", "human": "Added by reviewer", "llm": "LLM extracted", "llmReviewed": "Human confirmed"},
      "unverified": "span not found",
      "actions": {"confirm": "Confirm", "correct": "Correct", "reject": "Reject", "absent": "Mark absent", "saveCorrection": "Save correction", "cancel": "Cancel", "add": "Add field", "override": "Save override", "save": "Save", "bindAnalyst": "Bind analyst", "approve": "Approve", "publish": "Publish…", "publishBlocked": "Publish ({n} blockers)", "markReviewed": "Mark reviewed"},
      "useSelection": "Use the current selection as the citation (page {page}, {n} chars)",
      "selectHint": "Select text in the original on the left to use it as a citation or snippet.",
      "typed": {
        "text": "Stated value", "num_price": "Number", "num_pct": "Fraction (12.5% → 0.125)", "num_months": "Months", "currency": "Currency (ISO, e.g. CNY)", "date": "Date",
        "help_price": "Price: number and currency are validated separately (typed/1).", "help_currency": "Three-letter ISO currency code.", "help_months": "Whole months.", "help_pct": "Enter percentages as fractions.", "help_date": "ISO date.", "help_text": "As stated in the report.",
        "invalid_value_text": "The stated value is empty or malformed", "invalid_value_num": "Malformed number", "invalid_value_currency": "Currency must be three capital letters", "invalid_value_date": "Invalid date"
      },
      "addNeedsSelection": "Select the source text in the original before adding a field.",
      "addField": "Add a field from the selection",
      "field": "Field",
      "addSpan": "Source: page {page}, offsets {start}–{end}, occurrence {occurrence}",
      "resolved": "Resolved: {ticker} · issuer {issuer}",
      "ratingUnmapped": "Rating not mapped",
      "conflict": "Candidate conflict: {field} ({n} rows; confirm one, the rest are rejected)",
      "markAbsent": "Mark {field} absent (page {page})",
      "override": "Resolution override: security ticker",
      "bind": {"scope": "Scope", "institution": "Institution", "reportType": "Report type", "primary": "Primary target", "supersedes": "Supersedes report", "analyst": "Analyst", "private": "not public", "analystField": "Analyst evidence row", "role": "Role"},
      "scopes": {"single_issuer": "Single issuer", "multi_issuer": "Multiple issuers", "sector": "Sector", "macro_strategy": "Macro strategy"},
      "snippets": {"new": "New snippet", "remaining": "Remaining", "purpose": "Purpose", "target": "Target", "noTarget": "No target", "create": "Create snippet", "none": "No snippets yet", "disclosureHits": "Disclosure check failed: {tokens}", "purged": "(text purged)"},
      "purposes": {"rating": "Rating rationale", "target": "Target rationale", "thesis": "Thesis", "risk": "Risks", "method": "Valuation method", "other": "Other"},
      "title": {"original": "Original title", "zh": "Chinese title", "en": "English title", "public": "Public title title_public", "blocked": "Blocker 15 hit: {surfaces}. Rewrite the public title.", "translate": "Translate again"},
      "summaries": {"generate": "Generate summary {lang}", "none": "No summaries yet", "overlap": "Longest verbatim overlap {n} / {max}", "grounded": "All numbers grounded", "ungrounded": "Numbers not grounded", "disclosureOk": "Disclosure check passed", "disclosureHit": "Disclosure check failed", "stale": "Inputs changed (regenerate)"},
      "tabs": {"report": "Report fields", "snippets": "Snippets", "title": "Title", "summaries": "Summaries"},
      "crumb": "Review {id}",
      "confirmedCount": "{done} / {total} fields effective",
      "toDocument": "Document →",
      "toPreview": "Preview →",
      "staleRun": "stale_run: some fields are bound to a parse run other than the current run {run}. Human-confirmed fields are kept; check and re-confirm them.",
      "page": {"title": "Original · page {page}", "private": "Private · admins only", "prev": "← Previous", "next": "Next →", "selection": "{n} chars selected ({start}–{end})", "parseRun": "Parse run {run}"},
      "typedNote": "Typed editing: number, currency, horizon and date are validated separately (typed/1); a span must match the page text verbatim (R1) to be confirmed.",
      "blockers": {
        "title": "Blockers", "reviewReady": "Review-ready", "publishReady": "Publish-ready", "none": "None",
        "review_not_approved": "Not marked reviewed", "licence_unconfirmed": "Current licence version unconfirmed (D1)", "licence_no_public_metadata": "Licence does not allow public metadata", "document_not_parsed": "Document not parsed",
        "report_incomplete": "Report field missing: {arg}", "required_field_missing": "Required field missing: {arg}", "field_pending": "Required field still a candidate: {arg}", "target_unresolved": "Target unresolved: {arg}",
        "target_cardinality": "Target count does not fit the scope", "quarantine_open": "Open quarantine item: {arg}", "materialize_stale": "Materialisation is stale", "rules_stale": "Rule receipt stale or failed",
        "eval_receipt_missing": "LLM fields without a valid gold receipt", "summary_stale": "Inputs of an approved summary changed", "restricted_value_in_text": "Restricted value or name in: {arg}",
        "evidence_drift": "Verification found evidence drift", "disclosure_stale": "Disclosure inputs changed; re-run the disclosure check", "conflict_unresolved": "Unresolved candidate conflict: {arg}"
      },
      "unpublish": {"reason": "Reason for unpublishing", "submit": "Unpublish", "note": "After unpublishing public routes 404 and the revision goes up by one; the snapshot is kept for audit."}
    },
    "publish": {
      "title": "Publish this report?", "doneTitle": "Published", "checking": "Checking blockers…", "blockers": "Blockers ({n})", "willBePublic": "Will be public",
      "public": {"metadata": "Metadata, stated and normalized rating", "target": "Target price (allowed by licence v{version})", "noTarget": "Target price not public (licence does not allow it)", "summary": "{n} independent summaries (AI-labelled)", "snippets": "{n} snippets (≤ {max} chars)"},
      "switchNote": "While the public switch is off, a published report is visible in the preview only.",
      "snapshot": "Publication snapshot", "immutable": "immutable", "snapshotHash": "Snapshot hash", "rulesReceipt": "Rule receipt", "licenceVersion": "Licence version", "codeVersion": "Code version", "f4": "F4 registration", "f4Queued": "outbox claim.register queued by the publish function",
      "afterNote": "Unpublishing or withdrawing makes public routes return 404; the snapshot is kept for audit.", "viewPreview": "View preview", "done": "Done", "cancel": "Cancel", "publish": "Publish"
    },
    "previewPage": {"incomplete": "The report lacks fields required for public display (e.g. a title); it cannot be previewed yet.", "metadataHidden": "The licence does not allow public metadata: even when published, this report will not appear publicly."}
```

`document.actions.verify` 由 E1 的按钮使用（本任务先登记文案，保持两份文件 parity）。

- [ ] **Step 10: 运行 D5 测试 + 全部 D 测试 + typecheck + lint**

Run: `npm test -- src/lib/broker-research/preview.test.ts "src/app/(app)/admin/broker-research" "src/app/(app)/intel/foreign-research" && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 11: 本地端到端目测（规格 §14 验收 8 的页面部分）**

在 `test:db` 之外的本地 Supabase 栈（或 owner 的预发环境）用合成报告走一遍：管理员复核页确认字段 → 发布对话框显示阻断（`licence_unconfirmed` 等）→ 确认许可 → 发布 → 预览页可见并标注"预览 · 未对外"；`public_enabled=false` 时 `/intel/foreign-research/<id>` 404、`GET /api/broker-research/reports/<id>` 404。结果记入实施记录（不提交截图中的任何真实研报内容）。

- [ ] **Step 12: 实施记录 + 提交**

实施记录追加：`D5 | 文档页/复核双栏/发布对话框/预览页 | 偏差：预览不含历史与分歧；预览不写访问日志`。

```bash
git add src/lib/broker-research/preview.ts src/lib/broker-research/preview.test.ts src/lib/broker-research/admin-document.ts "src/app/(app)/admin/broker-research" messages/zh/foreign-research.json messages/en/foreign-research.json docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): admin document, review, publish dialog and preview pages (D5)"
```

---
### Task E1: 核验 cron + outbox 投递 + F4 端口 + storage-check + runbook

**Files:**
- Create: `src/lib/broker-research/verify.ts`、`src/lib/broker-research/verify.test.ts`
- Create: `src/lib/broker-research/ports/f4.ts`
- Create: `src/lib/broker-research/outbox.ts`、`src/lib/broker-research/outbox.test.ts`
- Create: `src/app/api/cron/broker-research-verify/route.ts`、`src/app/api/cron/broker-research-outbox/route.ts`、`src/app/api/cron/broker-research-crons.test.ts`
- Create: `src/lib/broker-research/cron-auth.ts`（两条 cron 共用的 Bearer 校验）
- Create: `src/app/api/admin/broker-research/documents/[id]/verify/route.ts`（单文档"重跑核验"，规格 §8.3）
- Modify: `src/app/(app)/admin/broker-research/documents/[documentId]/DocumentClient.tsx`（D5 创建；加"重跑核验"按钮）
- Create: `scripts/broker-research/storage-check.ts`
- Modify: `package.json`（`scripts` 对象**末尾**追加 `"test:storage"`；JSON 无注释，在实施记录里写明）
- Create: `docs/runbooks/broker-research.md`
- **不改** `vercel.json`（两条 cron 都不登记，骨架范围表 FR-5；登记是 owner 合并后事项，runbook 给出片段）

设计要点：
- 核验（规格 §8.3）：候选 = 已发布报告的文档，按 `last_verified_at` 升序、`null` 最先（在 TS 里排序，不依赖 PostgREST 的 nulls 次序）；预算 250 s（每个文档开始前检查，到点写信息码 `deadline_hit` 停止）；对生效且带跨度的证据行（`confirmed/corrected`）重跑 R1：`sliceText(artifact(parse_run_id), loc) === value_source_text`。**无论结果都写** `last_verified_at=now()` 与 `verify_status`（`ok` / `failed` / `error`），单个文档抛错也写 `error` 后继续，后面的文档不会饿死。不一致 → `evidence_ok=false`（视图即时隐藏，SQL 触发器写 `claim.retract`）+ 隔离 `span_drift`（键 `${sha256}:span_drift:${target_key??'-'}`，载荷只含字段名与页码）；产物不可读 → `evidence_ok=false` + 隔离 `artifact_unreadable`。cron 是本 dataset **唯一** `recordAttempt` 调用者（`cadence:'daily'`，`ok = batch status ≠ failed`）。cron **不恢复** `evidence_ok=true`；管理员单文档重跑（`restore:true`，不调 `recordAttempt`）通过才恢复。批次计数：每文档 `fetched+1`，结果三选一 `inserted`（ok）/ `quarantined`（failed 或 error，各 1）/ `failed`（抛错）；非信息错误 `span_drift` / `artifact_unreadable` / `verify_error` 使批次 `partial`。
- outbox（规格 §8.3、§10.2、§11.2）：`BROKER_RESEARCH_F4_URL` 未设（或不是 https / 本机）→ 端口 `enabled=false` → 路由返回 `{skipped:'f4_disabled'}`，**不读取、不改动**任何事件（`attempts` 不增加，事件保持 `pending`）。启用时每次最多 50 条、预算 50 s；投递前校验载荷形状（`claim_key` 含 `publication_id`、`claim_seq` register=1 / retract=2、`methodology_version='broker-claim/1'`、`visibility_ref.view`），不合格 → `markOutbox(failed:payload_invalid:<字段>)`；`attempts ≥ 10` 的 `failed` 由 `markOutbox`（A4）判定。投递体 = 载荷 + `event_id` + `kind`，`POST <F4>/claims/events`，`Bearer BROKER_RESEARCH_F4_TOKEN`（可选），10 s 超时。

- [ ] **Step 1: 写核验的失败测试**

```ts
// src/lib/broker-research/verify.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./ports/f3',()=>({sliceText:(a:unknown,l:{page:number;char_start:number;char_end:number})=>{const p=(a as {pages?:string[]}).pages?.[l.page-1];return p===undefined?null:p.slice(l.char_start,l.char_end);}}));
import {memoryTableClient} from '../db/memory-table-client';
import {runVerify,verifyCandidates} from './verify';
import type {VerifyDeps} from './verify';
import type {BrokerResearchDb,DocumentRow,FieldRow} from './types';

const enc=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));
const doc=(id:string,last:string|null):DocumentRow=>({document_id:id,sha256:`sha-${id}`,storage_path:'',byte_size:1,page_count:1,licence_id:'L',uploaded_by:'u',uploaded_at:'',original_filename:'',current_parse_run_id:`pr-${id}`,status:'parsed',lease_token:null,lease_until:null,promotion_pending:false,last_verified_at:last,verify_status:null,withdrawn_at:null,withdrawn_reason:null,purged_at:null});
const field=(report:string,o:Partial<FieldRow>={}):FieldRow=>({field_id:`f-${report}`,report_id:report,parse_run_id:`pr-${report.slice(2)}`,run_id:'x',superseded_by_run_id:null,target_key:'T',field:'target_price',occurrence:1,page:1,char_start:6,char_end:11,value_source_text:'12.34',
 extractor:'llm:m@r',extractor_confidence:null,status:'confirmed',corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:'',value_text:'12.34',value_num:'12.34',value_currency:'CNY',value_unit:'price',value_date:null,...o});

let tables:ReturnType<typeof memoryTableClient>,docs:Map<string,DocumentRow>,db:BrokerResearchDb,artifacts:Record<string,Uint8Array|undefined>,clock:number;
async function setup(entries:{id:string;last:string|null;text?:string;fields?:Partial<FieldRow>[];throws?:boolean}[]){
 tables=memoryTableClient({dq_freshness:['dataset']});docs=new Map();artifacts={};clock=Date.parse('2026-11-06T02:00:00Z');
 const fieldsBy=new Map<string,FieldRow[]>();
 for(const e of entries){
  docs.set(e.id,doc(e.id,e.last));
  await tables.insert('broker_research_reports',{report_id:`r-${e.id}`,document_id:e.id,status:'published',evidence_ok:true});
  if(e.text!==undefined)artifacts[`a-${e.id}`]=enc({pages:[e.text]});
  fieldsBy.set(`r-${e.id}`,(e.fields??[{}]).map(o=>field(`r-${e.id}`,o)));
 }
 await tables.insert('broker_research_reports',{report_id:'r-draft',document_id:'zz',status:'draft',evidence_ok:true});
 db={
  getDocument:vi.fn(async(id:string)=>docs.get(id)??null),
  listFields:vi.fn(async(r:string)=>{if(entries.find(e=>`r-${e.id}`===r)?.throws)throw new Error('boom');return fieldsBy.get(r)??[];}),
  getRun:vi.fn(async(id:string)=>({run_id:id,artifact_path:`a-${id.slice(3)}`})),
  updateDocument:vi.fn(async(id:string,p:Partial<DocumentRow>)=>{docs.set(id,{...docs.get(id)!,...p});}),
  updateReportDraft:vi.fn(async()=>{}),
  getReport:vi.fn(async(id:string)=>({report_id:id,evidence_ok:false})),
 } as unknown as BrokerResearchDb;
}
const deps=():VerifyDeps=>({db,tables,codeVersion:'c',now:()=>new Date(clock),storage:{download:vi.fn(async(p:string)=>{const b=artifacts[p];if(!b)throw new Error('not_found');return b;})} as unknown as VerifyDeps['storage']});
const deadline=()=>new Date(clock+250_000);

describe('verifyCandidates',()=>{
 beforeEach(()=>setup([{id:'b',last:'2026-11-05T00:00:00Z'},{id:'a',last:null},{id:'c',last:'2026-11-01T00:00:00Z'}]));
 it('published reports only, never-verified first, then oldest',async()=>{
  expect((await verifyCandidates(deps())).map(c=>c.doc.document_id)).toEqual(['a','c','b']);
 });
});

describe('runVerify',()=>{
 it('ok / drift / unreadable each write last_verified_at and verify_status; drift and unreadable hide and quarantine',async()=>{
  await setup([{id:'ok',last:null,text:'price 12.34 CNY'},{id:'dr',last:null,text:'price 12.3 CNY'},{id:'un',last:null}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:true});
  expect(Object.fromEntries(r.results.map(x=>[x.documentId,x.outcome]))).toEqual({ok:'ok',dr:'failed',un:'error'});
  for(const id of ['ok','dr','un'])expect(docs.get(id)!.last_verified_at).toBe('2026-11-06T02:00:00.000Z');
  expect(docs.get('dr')!.verify_status).toBe('failed');expect(docs.get('un')!.verify_status).toBe('error');
  expect(db.updateReportDraft).toHaveBeenCalledWith('r-dr',{evidence_ok:false});expect(db.updateReportDraft).toHaveBeenCalledWith('r-un',{evidence_ok:false});
  expect(db.updateReportDraft).not.toHaveBeenCalledWith('r-ok',expect.anything());
  const q=tables.rows('dq_quarantine').map(x=>[x.natural_key,x.reason_code]).sort();
  expect(q).toEqual([['sha-dr:span_drift:T','span_drift'],['sha-un:artifact_unreadable:-','artifact_unreadable']]);
  expect(JSON.stringify(tables.rows('dq_quarantine'))).not.toContain('12.3');      // payload holds field names and pages only
  const [batch]=tables.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'broker-research-verify',status:'partial',counts:{fetched:3,inserted:1,quarantined:2,failed:0}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'broker_research',expected_cadence:'daily',consecutive_errors:0});
  expect(r.freshness).toBe('fresh');
 });
 it('one throwing document still gets a timestamp and does not starve the next',async()=>{
  await setup([{id:'x',last:null,throws:true},{id:'y',last:'2026-11-01T00:00:00Z',text:'price 12.34 CNY'}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:true});
  expect(docs.get('x')!.verify_status).toBe('error');expect(docs.get('y')!.verify_status).toBe('ok');
  expect(r.checked).toBe(2);expect(tables.rows('ingest_batches')[0].counts).toMatchObject({failed:1,inserted:1});
 });
 it('stops at the deadline with deadline_hit and leaves the rest for tomorrow',async()=>{
  await setup([{id:'a',last:null,text:'price 12.34 CNY'},{id:'b',last:'2026-11-01T00:00:00Z',text:'price 12.34 CNY'}]);
  const d=deps();(d.db.updateDocument as ReturnType<typeof vi.fn>).mockImplementation(async(id:string,p:Partial<DocumentRow>)=>{docs.set(id,{...docs.get(id)!,...p});clock+=300_000;});
  const r=await runVerify(d,{deadline:deadline(),triggeredBy:'cron',recordFreshness:true});
  expect(r.checked).toBe(1);expect(r.remaining).toBe(1);expect(docs.get('b')!.last_verified_at).toBe('2026-11-01T00:00:00Z');
  expect(tables.rows('ingest_batches')[0].errors).toEqual([{code:'deadline_hit'}]);expect(tables.rows('ingest_batches')[0].status).toBe('success');
 });
 it('manual single-document re-run restores evidence_ok and never records freshness',async()=>{
  await setup([{id:'a',last:null,text:'price 12.34 CNY'},{id:'b',last:null,text:'price 12.34 CNY'}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'manual',recordFreshness:false,documentId:'b',restore:true});
  expect(r.results.map(x=>x.documentId)).toEqual(['b']);expect(db.updateReportDraft).toHaveBeenCalledWith('r-b',{evidence_ok:true});
  expect(tables.rows('dq_freshness')).toEqual([]);expect(r.freshness).toBeNull();
 });
 it('ignores candidate and absent rows',async()=>{
  await setup([{id:'a',last:null,text:'nothing here',fields:[{status:'extracted'},{status:'absent',page:1,char_start:null,char_end:null,value_source_text:null}]}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:false});
  expect(r.results[0].outcome).toBe('ok');
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/broker-research/verify.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `verify.ts`**

```ts
// src/lib/broker-research/verify.ts
// Daily evidence verification (spec §8.3): published reports' documents in last_verified_at order (null
// first), a 250 s budget, R1 re-run on effective span rows. Every attempted document gets
// last_verified_at and verify_status whatever happens, so a failing document never starves the rest.
// Drift → evidence_ok=false + quarantine span_drift; unreadable artifact → evidence_ok=false +
// quarantine artifact_unreadable. The cron is the dataset's only recordAttempt caller; only the
// admin single-document re-run (restore) may set evidence_ok back to true.
import {selectAll} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchError} from '../dq/batches';
import {quarantine} from '../dq/quarantine';
import {recordAttempt} from '../dq/freshness';
import type {FreshnessStatus} from '../dq/freshness';
import {sliceText} from './ports/f3';
import type {BrokerDeps,DocumentRow,FieldRow} from './types';

export type VerifyDeps=Pick<BrokerDeps,'db'|'storage'|'tables'|'now'|'codeVersion'>;
export const VERIFY_BUDGET_MS=250_000;
export const VERIFY_PRODUCER='broker-research-verify';
export type VerifyOutcome='ok'|'failed'|'error';
export interface VerifyDocResult{documentId:string;reportId:string;outcome:VerifyOutcome;driftedFieldIds:string[];quarantineItems:number}
export interface VerifyReceipt{batchId:string;status:string;checked:number;remaining:number;results:VerifyDocResult[];freshness:FreshnessStatus|null}
export interface VerifyOptions{deadline:Date;triggeredBy:'cron'|'manual';recordFreshness:boolean;documentId?:string;restore?:boolean}

export async function verifyCandidates(deps:VerifyDeps):Promise<{doc:DocumentRow;reportId:string}[]>{
 const out:{doc:DocumentRow;reportId:string}[]=[];
 for(const r of await selectAll(deps.tables,'broker_research_reports',{status:'published'},'report_id')){
  const doc=await deps.db.getDocument(String(r.document_id));
  if(doc&&doc.status!=='withdrawn')out.push({doc,reportId:String(r.report_id)});
 }
 const key=(d:DocumentRow)=>d.last_verified_at;
 return out.sort((a,b)=>{const x=key(a.doc),y=key(b.doc);if(x===y)return a.doc.document_id.localeCompare(b.doc.document_id);if(x===null)return -1;if(y===null)return 1;return x.localeCompare(y);});
}

async function readArtifact(deps:VerifyDeps,path:string|null|undefined):Promise<unknown|null>{
 if(!path)return null;
 try{const bytes=await deps.storage.download(path);return bytes?JSON.parse(new TextDecoder().decode(bytes)):null;}catch{return null;}
}
const hasSpan=(f:FieldRow)=>(f.status==='confirmed'||f.status==='corrected')&&f.superseded_by_run_id===null&&f.page!==null&&f.char_start!==null&&f.char_end!==null&&f.parse_run_id!==null;

export async function verifyDocument(deps:VerifyDeps,doc:DocumentRow,reportId:string,batchId:string,opts:{restore:boolean}):Promise<VerifyDocResult>{
 const fields=(await deps.db.listFields(reportId)).filter(hasSpan);
 const artifacts=new Map<string,unknown|null>();
 let unreadable=false;const drifted:FieldRow[]=[];
 for(const f of fields){
  const runId=f.parse_run_id!;
  if(!artifacts.has(runId))artifacts.set(runId,await readArtifact(deps,(await deps.db.getRun(runId))?.artifact_path));
  const art=artifacts.get(runId);
  if(art===null||art===undefined){unreadable=true;continue;}
  if(sliceText(art,{page:f.page!,char_start:f.char_start!,char_end:f.char_end!})!==f.value_source_text)drifted.push(f);
 }
 const outcome:VerifyOutcome=unreadable?'error':drifted.length?'failed':'ok';
 let quarantineItems=0;
 if(outcome!=='ok'){
  await deps.db.updateReportDraft(reportId,{evidence_ok:false});
  const items=new Map<string,{reason:string;fields:{field:string;page:number|null}[]}>();
  if(unreadable)items.set(`${doc.sha256}:artifact_unreadable:-`,{reason:'artifact_unreadable',fields:[]});
  for(const f of drifted){
   const k=`${doc.sha256}:span_drift:${f.target_key??'-'}`;
   const e=items.get(k)??{reason:'span_drift',fields:[]};e.fields.push({field:f.field,page:f.page});items.set(k,e);
  }
  for(const [naturalKey,e] of items){
   await quarantine(deps.tables,{dataset:'broker_research',table:'broker_research_reports',naturalKey,reasonCode:e.reason,payload:{fields:e.fields},detail:{report_id:reportId,document_id:doc.document_id},batchId});
   quarantineItems++;
  }
 }else if(opts.restore){
  const rep=await deps.db.getReport(reportId);
  if(rep&&!rep.evidence_ok)await deps.db.updateReportDraft(reportId,{evidence_ok:true});
 }
 await deps.db.updateDocument(doc.document_id,{last_verified_at:deps.now().toISOString(),verify_status:outcome});
 return {documentId:doc.document_id,reportId,outcome,driftedFieldIds:drifted.map(f=>f.field_id),quarantineItems};
}

export async function runVerify(deps:VerifyDeps,opts:VerifyOptions):Promise<VerifyReceipt>{
 const {batchId}=await startBatch(deps.tables,{producer:VERIFY_PRODUCER,dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts(),errors:BatchError[]=[],results:VerifyDocResult[]=[];
 let all=await verifyCandidates(deps);
 if(opts.documentId!==undefined)all=all.filter(c=>c.doc.document_id===opts.documentId);
 let i=0;
 for(;i<all.length;i++){
  if(deps.now().getTime()>=opts.deadline.getTime()){errors.push({code:'deadline_hit'});break;}
  const {doc,reportId}=all[i];counts.fetched++;
  try{
   const r=await verifyDocument(deps,doc,reportId,batchId,{restore:opts.restore===true});
   results.push(r);
   if(r.outcome==='ok')counts.inserted++;
   else{counts.quarantined++;errors.push({code:r.outcome==='error'?'artifact_unreadable':'span_drift',key:doc.document_id});}
  }catch{
   counts.failed++;errors.push({code:'verify_error',key:doc.document_id});
   try{await deps.db.updateDocument(doc.document_id,{last_verified_at:deps.now().toISOString(),verify_status:'error'});}catch{/* the next run retries this document first */}
  }
 }
 const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 const freshness=opts.recordFreshness?await recordAttempt(deps.tables,'broker_research',{ok:status!=='failed',cadence:'daily',now:deps.now(),detail:{batch_id:batchId,checked:counts.fetched}}):null;
 return {batchId,status,checked:counts.fetched,remaining:all.length-i,results,freshness};
}
```

（测试中 `deadline_hit` 用例：第一个文档耗时 300 s 后才写完，循环在第二个文档开始前检查预算 → 停止；批次只有信息码 → `success`。）

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/broker-research/verify.test.ts`
Expected: PASS

- [ ] **Step 5: 写 outbox / F4 端口的失败测试**

```ts
// src/lib/broker-research/outbox.test.ts
import {describe,expect,it,vi} from 'vitest';
import {deliverOutbox,validateOutboxEvent} from './outbox';
import {disabledF4Port,productionF4Port} from './ports/f4';
import type {F4Port} from './ports/f4';
import type {BrokerResearchDb,OutboxEvent} from './types';

const PUB='33333333-3333-4333-8333-333333333333';
const ev=(o:Partial<OutboxEvent>={},p:Record<string,unknown>={}):OutboxEvent=>({event_id:'e1',kind:'claim.register',status:'pending',attempts:0,last_error:null,created_at:'',delivered_at:null,
 payload:{claim_key:`broker_target_price:${PUB}:600000.SH`,claim_seq:1,claim_type:'broker_target_price',methodology_version:'broker-claim/1',source:{publication_id:PUB,report_id:'r'},visibility_ref:{view:'broker_report_targets_public_v',report_id:'r',target_key:'600000.SH'},...p},...o});
const dbOf=(events:OutboxEvent[])=>({takePendingOutbox:vi.fn().mockResolvedValue(events),markOutbox:vi.fn().mockResolvedValue(undefined)}) as unknown as BrokerResearchDb&{takePendingOutbox:ReturnType<typeof vi.fn>;markOutbox:ReturnType<typeof vi.fn>};
const now=()=>new Date('2026-11-06T00:00:00Z'),deadline=new Date('2026-11-06T00:01:00Z');

describe('validateOutboxEvent',()=>{
 it('accepts the §10.2 shapes and names the first bad field',()=>{
  expect(validateOutboxEvent(ev())).toBeNull();
  expect(validateOutboxEvent(ev({kind:'claim.retract'},{claim_seq:2}))).toBeNull();
  expect(validateOutboxEvent(ev({},{claim_seq:2}))).toBe('claim_seq');
  expect(validateOutboxEvent(ev({},{claim_key:'broker_target_price:nope'}))).toBe('claim_key');
  expect(validateOutboxEvent(ev({},{methodology_version:'x'}))).toBe('methodology_version');
  expect(validateOutboxEvent(ev({},{source:{publication_id:'44444444-4444-4444-8444-444444444444'}}))).toBe('source');
  expect(validateOutboxEvent(ev({kind:'licence.changed'},{}))).toBeNull();
 });
});

describe('deliverOutbox',()=>{
 it('F4 disabled: reads nothing, changes nothing',async()=>{
  const db=dbOf([ev()]);
  expect(await deliverOutbox({db,f4:disabledF4Port,now},{limit:50,deadline})).toEqual({skipped:'f4_disabled',taken:0,delivered:0,failed:0});
  expect(db.takePendingOutbox).not.toHaveBeenCalled();expect(db.markOutbox).not.toHaveBeenCalled();
 });
 it('marks delivered, failed and invalid events',async()=>{
  const db=dbOf([ev({event_id:'a'}),ev({event_id:'b'}),ev({event_id:'c'},{claim_seq:9})]);
  const f4:F4Port={enabled:true,deliver:vi.fn().mockResolvedValueOnce({ok:true,accepted:true,applied:true,claimId:'k'}).mockResolvedValueOnce({ok:false,error:'http_503'})};
  expect(await deliverOutbox({db,f4,now},{limit:50,deadline})).toEqual({skipped:null,taken:3,delivered:1,failed:2});
  expect(db.markOutbox.mock.calls).toEqual([['a',{delivered:true}],['b',{delivered:false,error:'http_503'}],['c',{delivered:false,error:'payload_invalid:claim_seq'}]]);
  expect(f4.deliver).toHaveBeenCalledTimes(2);
 });
});

describe('productionF4Port',()=>{
 it('is disabled without a usable URL',()=>{
  expect(productionF4Port({}).enabled).toBe(false);expect(productionF4Port({BROKER_RESEARCH_F4_URL:'http://f4.example'}).enabled).toBe(false);expect(productionF4Port({BROKER_RESEARCH_F4_URL:'::'}).enabled).toBe(false);
 });
 it('POSTs the event to /claims/events with the bearer and maps responses',async()=>{
  const fetchImpl=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({accepted:true,applied:false}),{status:200})).mockResolvedValueOnce(new Response('',{status:500})).mockRejectedValueOnce(Object.assign(new Error('t'),{name:'TimeoutError'}));
  const p=productionF4Port({BROKER_RESEARCH_F4_URL:'https://f4.example/api',BROKER_RESEARCH_F4_TOKEN:'tok'},fetchImpl as unknown as typeof fetch);
  expect(await p.deliver(ev())).toEqual({ok:true,accepted:true,applied:false,claimId:null});
  const [url,init]=fetchImpl.mock.calls[0];
  expect(String(url)).toBe('https://f4.example/api/claims/events');expect(init.headers).toMatchObject({authorization:'Bearer tok','content-type':'application/json'});
  expect(JSON.parse(init.body)).toMatchObject({event_id:'e1',kind:'claim.register',claim_seq:1});
  expect(await p.deliver(ev())).toEqual({ok:false,error:'http_500'});expect(await p.deliver(ev())).toEqual({ok:false,error:'f4_timeout'});
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/broker-research/outbox.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 7: 实现 `ports/f4.ts` 与 `outbox.ts`**

```ts
// src/lib/broker-research/ports/f4.ts
// F4 judgment-framework port (spec §11.2; plan FR-7 scope: interface + a production implementation that
// stays disabled until BROKER_RESEARCH_F4_URL is set). The consumer endpoint POST <F4>/claims/events
// dedupes by event_id and applies only the larger claim_seq per claim_key; this side only delivers.
import type {OutboxEvent} from '../types';

export type F4Delivery={ok:true;accepted:boolean;applied:boolean;claimId:string|null}|{ok:false;error:string};
export interface F4Port{readonly enabled:boolean;deliver(event:OutboxEvent):Promise<F4Delivery>}
export const disabledF4Port:F4Port={enabled:false,async deliver(){return {ok:false,error:'f4_disabled'};}};
export const eventBody=(e:OutboxEvent)=>({...e.payload,event_id:e.event_id,kind:e.kind});
const DELIVERY_TIMEOUT_MS=10_000;

export function productionF4Port(env:Record<string,string|undefined>=process.env,fetchImpl:typeof fetch=fetch):F4Port{
 const base=env.BROKER_RESEARCH_F4_URL?.trim();
 if(!base)return disabledF4Port;
 let url:URL;
 try{url=new URL('claims/events',base.endsWith('/')?base:`${base}/`);}catch{return disabledF4Port;}
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&/^(localhost|127\.0\.0\.1)$/.test(url.hostname)))return disabledF4Port;
 const token=env.BROKER_RESEARCH_F4_TOKEN?.trim();
 return {enabled:true,async deliver(e){
  try{
   const res=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(eventBody(e)),signal:AbortSignal.timeout(DELIVERY_TIMEOUT_MS)});
   if(!res.ok)return {ok:false,error:`http_${res.status}`};
   const b=await res.json().catch(()=>null) as {accepted?:unknown;applied?:unknown;claim_id?:unknown}|null;
   if(!b||typeof b.accepted!=='boolean')return {ok:false,error:'f4_bad_response'};
   return {ok:true,accepted:b.accepted,applied:b.applied===true,claimId:typeof b.claim_id==='string'?b.claim_id:null};
  }catch(err){return {ok:false,error:err instanceof Error&&err.name==='TimeoutError'?'f4_timeout':'f4_network'};}
 }};
}
```

```ts
// src/lib/broker-research/outbox.ts
// Outbox delivery to F4 (spec §8.3, §10.2). SQL writes the events (publish / unpublish / withdraw /
// hide triggers); TS only delivers. With F4 disabled nothing is read or changed: events stay pending
// and their attempts are not incremented. Each event's shape is checked before delivery;
// markOutbox (A4) increments attempts and turns ≥ 10 failures into 'failed'.
import {CLAIM_METHODOLOGY_VERSION} from './versions';
import type {F4Port} from './ports/f4';
import type {BrokerResearchDb,OutboxEvent} from './types';

export const OUTBOX_LIMIT=50,OUTBOX_BUDGET_MS=50_000;
const CLAIM_KEY=/^broker_target_price:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):.+$/i;
/** null when deliverable, else the first offending payload field. */
export function validateOutboxEvent(e:OutboxEvent):string|null{
 if(e.kind!=='claim.register'&&e.kind!=='claim.retract')return null;
 const p=e.payload,m=typeof p.claim_key==='string'?CLAIM_KEY.exec(p.claim_key):null;
 if(!m)return 'claim_key';
 if(p.claim_seq!==(e.kind==='claim.register'?1:2))return 'claim_seq';
 if(e.kind==='claim.retract')return null;
 if(p.claim_type!=='broker_target_price')return 'claim_type';
 if(p.methodology_version!==CLAIM_METHODOLOGY_VERSION)return 'methodology_version';
 const src=p.source as {publication_id?:unknown}|undefined;
 if(!src||typeof src.publication_id!=='string'||src.publication_id.toLowerCase()!==m[1].toLowerCase())return 'source';
 const vis=p.visibility_ref as {view?:unknown}|undefined;
 if(!vis||vis.view!=='broker_report_targets_public_v')return 'visibility_ref';
 return null;
}
export interface OutboxReceipt{skipped:'f4_disabled'|null;taken:number;delivered:number;failed:number}
export async function deliverOutbox(deps:{db:BrokerResearchDb;f4:F4Port;now:()=>Date},opts:{limit:number;deadline:Date}):Promise<OutboxReceipt>{
 if(!deps.f4.enabled)return {skipped:'f4_disabled',taken:0,delivered:0,failed:0};
 const events=await deps.db.takePendingOutbox(opts.limit);
 let delivered=0,failed=0;
 for(const e of events){
  if(deps.now().getTime()>=opts.deadline.getTime())break;
  const bad=validateOutboxEvent(e);
  if(bad){await deps.db.markOutbox(e.event_id,{delivered:false,error:`payload_invalid:${bad}`});failed++;continue;}
  const r=await deps.f4.deliver(e);
  if(r.ok&&r.accepted){await deps.db.markOutbox(e.event_id,{delivered:true});delivered++;}
  else{await deps.db.markOutbox(e.event_id,{delivered:false,error:r.ok?'f4_rejected':r.error});failed++;}
 }
 return {skipped:null,taken:events.length,delivered,failed};
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm test -- src/lib/broker-research/outbox.test.ts`
Expected: PASS

- [ ] **Step 9: 两条 cron 路由 + 单文档核验路由（含失败测试）**

```ts
// src/app/api/cron/broker-research-crons.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({verify:vi.fn(),deliver:vi.fn(),codeVersion:vi.fn(),f4:vi.fn()}));
vi.mock('@/lib/broker-research/verify',async(orig)=>({...await orig<typeof import('@/lib/broker-research/verify')>(),runVerify:mocks.verify}));
vi.mock('@/lib/broker-research/outbox',async(orig)=>({...await orig<typeof import('@/lib/broker-research/outbox')>(),deliverOutbox:mocks.deliver}));
vi.mock('@/lib/broker-research/ports/f4',async(orig)=>({...await orig<typeof import('@/lib/broker-research/ports/f4')>(),productionF4Port:mocks.f4}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/broker-research/db',()=>({supabaseBrokerResearchDb:()=>({tag:'db'})}));
vi.mock('@/lib/broker-research/storage',()=>({supabaseBrokerStorage:()=>({tag:'storage'})}));
vi.mock('@/lib/db/table-client',async(orig)=>({...await orig<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>({tag:'tables'})}));
import {GET as verifyGET,POST as verifyPOST} from './broker-research-verify/route';
import {GET as outboxGET} from './broker-research-outbox/route';

const AUTH={authorization:'Bearer s3cret'};
const req=(path:string,h:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/${path}`,{headers:h});
const original=process.env.CRON_SECRET;
beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='s3cret';mocks.codeVersion.mockReturnValue('abc123');
 mocks.verify.mockResolvedValue({batchId:'b',status:'success',checked:0,remaining:0,results:[],freshness:'fresh'});
 mocks.deliver.mockResolvedValue({skipped:'f4_disabled',taken:0,delivered:0,failed:0});mocks.f4.mockReturnValue({enabled:false});});
afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});

describe('cron auth (both routes)',()=>{
 it('503 without CRON_SECRET, 401 on a wrong bearer, nothing runs',async()=>{
  delete process.env.CRON_SECRET;
  for(const r of [await verifyGET(req('broker-research-verify',AUTH)),await outboxGET(req('broker-research-outbox',AUTH))]){expect(r.status).toBe(503);expect(r.headers.get('Cache-Control')).toBe('no-store');}
  process.env.CRON_SECRET='s3cret';
  expect((await verifyGET(req('broker-research-verify',{authorization:'Bearer no'}))).status).toBe(401);
  expect((await outboxGET(req('broker-research-outbox'))).status).toBe(401);
  expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();
 });
});

describe('verify cron',()=>{
 it('refuses without a code version',async()=>{mocks.codeVersion.mockReturnValue(null);expect((await verifyPOST(req('broker-research-verify',AUTH))).status).toBe(503);});
 it('runs with a 250 s budget, cron trigger and freshness recording',async()=>{
  const before=Date.now();
  const res=await verifyGET(req('broker-research-verify',AUTH));
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');
  const [deps,opts]=mocks.verify.mock.calls[0];
  expect(deps).toMatchObject({db:{tag:'db'},storage:{tag:'storage'},tables:{tag:'tables'},codeVersion:'abc123'});
  expect(opts).toMatchObject({triggeredBy:'cron',recordFreshness:true});expect(opts.restore).toBeUndefined();
  expect(opts.deadline.getTime()-before).toBeGreaterThanOrEqual(249_000);expect(opts.deadline.getTime()-before).toBeLessThanOrEqual(251_000);
  expect(await res.json()).toMatchObject({ok:true,receipt:{batchId:'b',checked:0}});
 });
 it('500 with a code only when the run throws',async()=>{
  mocks.verify.mockRejectedValue(new Error('secret detail'));
  const res=await verifyGET(req('broker-research-verify',AUTH));
  expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('secret detail');
 });
});

describe('outbox cron',()=>{
 it('F4 unset → skipped, events untouched',async()=>{
  const res=await outboxGET(req('broker-research-outbox',AUTH));
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ok:true,receipt:{skipped:'f4_disabled'}});
  expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({f4:{enabled:false}}),expect.objectContaining({limit:50}));
 });
});
```

```ts
// src/app/api/cron/broker-research-verify/route.ts
// Daily evidence verification trigger (spec §8.3). CRON_SECRET bearer (timing-safe, like facts-sync);
// maxDuration 300 with a 250 s budget; the only recordAttempt caller of dataset broker_research.
// NOT registered in vercel.json by this plan (nothing to verify before the first publication; the
// owner registers it after merge — docs/runbooks/broker-research.md). Receipt carries codes and counts.
import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {cronAuthorized} from '@/lib/broker-research/cron-auth';
import {supabaseBrokerResearchDb} from '@/lib/broker-research/db';
import {supabaseBrokerStorage} from '@/lib/broker-research/storage';
import {VERIFY_BUDGET_MS,runVerify} from '@/lib/broker-research/verify';

export const dynamic='force-dynamic';
export const maxDuration=300;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!cronAuthorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const sb=getAdminSupabase();
  const receipt=await runVerify({db:supabaseBrokerResearchDb(sb),storage:supabaseBrokerStorage(sb),tables:supabaseTableClient(sb),now:()=>new Date(),codeVersion},
   {deadline:new Date(started.getTime()+VERIFY_BUDGET_MS),triggeredBy:'cron',recordFreshness:true});
  return NextResponse.json({ok:receipt.status!=='failed',started_at:started.toISOString(),receipt:{batchId:receipt.batchId,status:receipt.status,checked:receipt.checked,remaining:receipt.remaining,freshness:receipt.freshness,
   outcomes:receipt.results.map(r=>({documentId:r.documentId,outcome:r.outcome}))}},{headers:{'Cache-Control':'no-store'}});
 }catch{return err('verify_failed','Broker research verification failed',500);}
}
export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
```

```ts
// src/app/api/cron/broker-research-outbox/route.ts
// Outbox delivery trigger (spec §8.3, every 10 min proposed). BROKER_RESEARCH_F4_URL unset → the
// production F4 port is disabled and nothing is read or changed (events stay pending, attempts not
// incremented). NOT registered in vercel.json (F4 consumer endpoint does not exist yet, F4 spec §12.3).
import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseBrokerResearchDb} from '@/lib/broker-research/db';
import {OUTBOX_BUDGET_MS,OUTBOX_LIMIT,deliverOutbox} from '@/lib/broker-research/outbox';
import {productionF4Port} from '@/lib/broker-research/ports/f4';
import {cronAuthorized} from '@/lib/broker-research/cron-auth';

export const dynamic='force-dynamic';
export const maxDuration=60;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!cronAuthorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const started=new Date();
 try{
  const f4=productionF4Port();
  const receipt=await deliverOutbox({db:f4.enabled?supabaseBrokerResearchDb(getAdminSupabase()):({} as never),f4,now:()=>new Date()},{limit:OUTBOX_LIMIT,deadline:new Date(started.getTime()+OUTBOX_BUDGET_MS)});
  return NextResponse.json({ok:true,started_at:started.toISOString(),receipt},{headers:{'Cache-Control':'no-store'}});
 }catch{return err('outbox_failed','Broker research outbox delivery failed',500);}
}
export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
```

（Next 路由文件只允许导出约定名，所以 Bearer 校验放在 `src/lib/broker-research/cron-auth.ts`，两条路由共用。）

```ts
// src/lib/broker-research/cron-auth.ts
// CRON_SECRET bearer check shared by the two broker-research crons (same timing-safe check as facts-sync).
import {timingSafeEqual} from 'node:crypto';
export function cronAuthorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
```

```ts
// src/app/api/admin/broker-research/documents/[id]/verify/route.ts
// Admin single-document "re-run verify" (spec §8.3): same R1 re-check as the cron, restore=true (a pass
// sets evidence_ok back to true), manual batch, NO recordAttempt (the cron stays the single producer of
// dataset freshness). Not ★: returns outcomes only, no text or spans.
import type {NextRequest} from 'next/server';
import {UUID_RE} from '@/lib/facts/public-route';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {supabaseBrokerResearchDb} from '@/lib/broker-research/db';
import {supabaseBrokerStorage} from '@/lib/broker-research/storage';
import {errorJson,guardPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {VERIFY_BUDGET_MS,runVerify} from '@/lib/broker-research/verify';

export const dynamic='force-dynamic';
export const maxDuration=300;

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const g=await guardPost(req);if(!('user' in g))return g;
 const {id}=await params;
 if(!UUID_RE.test(id))return errorJson('invalid_parameter:id','invalid document id',400);
 const sb=getAdminSupabase(),db=supabaseBrokerResearchDb(sb),documentId=id.toLowerCase();
 const doc=await db.getDocument(documentId);
 if(!doc)return errorJson('not_found','document not found',404);
 if(doc.status==='withdrawn')return errorJson('document_withdrawn','document withdrawn',410);
 const receipt=await runVerify({db,storage:supabaseBrokerStorage(sb),tables:supabaseTableClient(sb),now:()=>new Date(),codeVersion:resolveCodeVersion({allowGit:false})??'unknown'},
  {deadline:new Date(Date.now()+VERIFY_BUDGET_MS),triggeredBy:'manual',recordFreshness:false,documentId,restore:true});
 if(receipt.checked===0)return errorJson('not_published','document has no published report to verify',409);
 return jsonNoStore({batchId:receipt.batchId,status:receipt.status,outcome:receipt.results[0]?.outcome??'error'});
}
```

在 `DocumentClient.tsx` 的动作按钮组里（"翻译标题"按钮之后）加：

```tsx
     {/* E1: single-document re-run verify (restores evidence_ok on a pass) */}
     <button type="button" className={BTN} disabled={withdrawn||busy!==null||report?.status!=='published'} onClick={()=>void act('verify','POST',`/documents/${doc.document_id}/verify`,{},d=>setNotice(t('verify',{status:String((d as {outcome?:string}).outcome??'—')})))}>{busy==='verify'?t('working'):t('actions.verify')}</button>
```

（`notice` 在 `router.refresh()` 后保留，因为 `DocumentClient` 的状态不随服务端数据刷新重置。）

Run: `npm test -- src/app/api/cron/broker-research-crons.test.ts` → 先 FAIL，实现后 PASS。

- [ ] **Step 10: `scripts/broker-research/storage-check.ts` + `test:storage`**

```ts
// scripts/broker-research/storage-check.ts
// Storage HTTP gate (spec §12.3), run by a human against the LOCAL Supabase stack before FR-6:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… npm run test:storage
// Checks: bucket private + 50 MiB + MIME list; anon AND authenticated reads of reports/* and staging/*
// denied; signed upload URL works once with the same raw PUT the admin upload page uses and is refused
// the second time; move semantics (source gone, no overwrite); signed read URL expiry; MIME and size
// rejection; objects and earlier signed URLs dead after removal. Writes a receipt JSON into
// docs/audits/2026-11-06-foreign-research/ and exits 1 on any failure. Refuses any non-local host.
// Creates and deletes one throwaway auth user (random example.test address) for the authenticated check.
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resolveCodeVersion} from '../../src/lib/facts/deps';

const BUCKET='broker-research',MAX=52428800;
interface Check{name:string;passed:boolean;detail:string}
const checks:Check[]=[];
const check=(name:string,passed:boolean,detail='')=>{checks.push({name,passed,detail});console.log(`${passed?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const pdf=(extra='')=>new Blob([`%PDF-1.7\n% storage-check ${extra}\n%%EOF\n`],{type:'application/pdf'});

async function denied(c:SupabaseClient,path:string){const {data,error}=await c.storage.from(BUCKET).download(path);return data===null&&error!==null;}
async function exists(c:SupabaseClient,path:string){const {data}=await c.storage.from(BUCKET).download(path);return data!==null;}
async function putRaw(url:string,body:Blob){const r=await fetch(url,{method:'PUT',headers:{'content-type':'application/pdf','x-upsert':'false'},body});return r.status;}

async function main(){
 const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,anonKey=process.env.SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!service||!anonKey)throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are required');
 const host=new URL(url).hostname;
 if(!['localhost','127.0.0.1','[::1]'].includes(host))throw new Error(`refusing non-local Supabase host ${host}: run against the local stack only`);
 const opts={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,service,opts),anon=createClient(url,anonKey,opts);
 const tag=randomUUID(),rep=`reports/storage-check-${tag}.pdf`,stg=`staging/storage-check-${tag}.pdf`,moved=`reports/storage-check-${tag}-moved.pdf`;
 const cleanup:string[]=[rep,stg,moved];let userId:string|null=null;
 try{
  const {data:bucket}=await admin.storage.getBucket(BUCKET);
  check('bucket is private with the 50 MiB limit and the MIME list',bucket?.public===false&&bucket.file_size_limit===MAX&&['application/pdf','application/json','image/png'].every(m=>bucket.allowed_mime_types?.includes(m)),JSON.stringify({public:bucket?.public,limit:bucket?.file_size_limit,mime:bucket?.allowed_mime_types}));
  for(const p of [rep,stg]){const {error}=await admin.storage.from(BUCKET).upload(p,pdf(p),{contentType:'application/pdf'});check(`service_role uploads ${p.split('/')[0]}/*`,!error,error?.message??'');}
  check('anon cannot read reports/*',await denied(anon,rep));check('anon cannot read staging/*',await denied(anon,stg));
  const email=`storage-check-${tag}@example.test`,password=randomBytes(24).toString('base64url');
  const {data:created,error:ce}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  userId=created.user?.id??null;
  const authed=createClient(url,anonKey,opts);
  const {error:se}=await authed.auth.signInWithPassword({email,password});
  check('throwaway authenticated user signs in',!ce&&!se,ce?.message??se?.message??'');
  check('authenticated cannot read reports/*',await denied(authed,rep));check('authenticated cannot read staging/*',await denied(authed,stg));

  const up=`staging/storage-check-${tag}-signed.pdf`;cleanup.push(up);
  const {data:signed,error:sue}=await admin.storage.from(BUCKET).createSignedUploadUrl(up);
  const first=signed?await putRaw(signed.signedUrl,pdf('signed')):0;
  check('signed upload URL accepts one raw PUT',!sue&&first>=200&&first<300,`status ${first}`);
  const second=signed?await putRaw(signed.signedUrl,pdf('again')):0;
  check('signed upload URL refuses a second upload',second>=400,`status ${second}`);

  const {error:me}=await admin.storage.from(BUCKET).move(stg,moved);
  check('move staging → reports succeeds',!me,me?.message??'');
  check('move leaves no staging object',!(await exists(admin,stg)));check('move creates the target',await exists(admin,moved));
  const {error:overwrite}=await admin.storage.from(BUCKET).move(up,moved);
  check('move onto an existing object is refused',overwrite!==null,overwrite?.message??'no error');

  const {data:short}=await admin.storage.from(BUCKET).createSignedUrl(rep,2);
  const ok=short?(await fetch(short.signedUrl)).status:0;
  await sleep(3500);
  const late=short?(await fetch(short.signedUrl)).status:0;
  check('signed read URL works before expiry',ok===200,`status ${ok}`);check('signed read URL fails after expiry',late>=400,`status ${late}`);

  const txt=`reports/storage-check-${tag}.txt`;cleanup.push(txt);
  const {error:mimeErr}=await admin.storage.from(BUCKET).upload(txt,new Blob(['x'],{type:'text/plain'}),{contentType:'text/plain'});
  check('non-allowed MIME is rejected',mimeErr!==null,mimeErr?.message??'accepted');
  const big=`reports/storage-check-${tag}-big.pdf`;cleanup.push(big);
  const {error:sizeErr}=await admin.storage.from(BUCKET).upload(big,new Blob([new Uint8Array(MAX+1)],{type:'application/pdf'}),{contentType:'application/pdf'});
  check('object over 50 MiB is rejected',sizeErr!==null,sizeErr?.message??'accepted');

  const {data:longUrl}=await admin.storage.from(BUCKET).createSignedUrl(moved,600);
  await admin.storage.from(BUCKET).remove([moved]);
  check('purged object is gone',!(await exists(admin,moved)));
  const after=longUrl?(await fetch(longUrl.signedUrl)).status:0;
  check('a signed URL minted before purge no longer serves the object',after>=400,`status ${after}`);
 }finally{
  await admin.storage.from(BUCKET).remove(cleanup).catch(()=>undefined);
  if(userId)await admin.auth.admin.deleteUser(userId).catch(()=>undefined);
 }
 const passed=checks.length>0&&checks.every(c=>c.passed);
 const dir=join(process.cwd(),'docs/audits/2026-11-06-foreign-research');mkdirSync(dir,{recursive:true});
 const at=new Date().toISOString();
 const file=join(dir,`storage-check-${at.replace(/[:.]/g,'-')}.json`);
 writeFileSync(file,JSON.stringify({kind:'broker-research storage-check',ran_at:at,supabase_host:host,code_version:resolveCodeVersion({allowGit:true})??'unknown',passed,checks},null,2)+'\n');
 console.log(`${passed?'ALL PASS':'FAILURES'} — receipt ${file}`);
 process.exit(passed?0:1);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
```

`package.json`：`scripts` 对象**最后一项**（目前是 `"test:revocation-list"`）后追加：

```json
    "test:storage": "tsx scripts/broker-research/storage-check.ts"
```

（前一行补逗号。JSON 无法加 `FOREIGN` 围栏，实施记录写明"package.json scripts 末尾追加 test:storage"。）本任务**不运行**它（需要本地 Supabase 栈；规格 §12.3 的发布前人工门禁）。只做：`npx tsc --noEmit -p tsconfig.json` 覆盖到该脚本（若 tsconfig 不含 `scripts/`，运行 `npx tsx --check scripts/broker-research/storage-check.ts` 不可用时以 `npx tsc --noEmit --module esnext --moduleResolution bundler --target es2022 --skipLibCheck scripts/broker-research/storage-check.ts` 检查类型）。

- [ ] **Step 11: `docs/runbooks/broker-research.md`**

```markdown
# 外资研报（broker research）运行手册

规格：`docs/superpowers/specs/2026-11-04-foreign-research-design.md`；计划：`docs/superpowers/plans/2026-11-06-foreign-research.md`。

## 1. 开关与环境变量

| 变量 | 作用 | 未设时 |
|---|---|---|
| `broker_research_settings.public_enabled`（数据库） | 对外开关；关闭时全部公开视图 0 行、公开路由与页面 404 | 默认 `false` |
| `BROKER_RESEARCH_F3_ENABLED=1` | 允许调用 F3 文档管道 | 解析返回 `f3_unavailable` |
| `BROKER_RESEARCH_LLM_ENABLED=1` | 允许调用平台 LLM（抽取 / 摘要 / 翻译） | `llm_unavailable` |
| `BROKER_RESEARCH_F4_URL`（https） / `BROKER_RESEARCH_F4_TOKEN` | outbox 投递目标 `<URL>/claims/events` 与 Bearer | outbox cron 跳过，事件保持 `pending`、`attempts` 不变 |
| `CRON_SECRET` | 两条 cron 的 Bearer | cron 返回 503 |

## 2. FR-6 对外发布（只由 owner 执行）

前置三项门禁（管理员总览只读显示）：
1. **D1**：每个来源的许可行已由 owner / 法务确认当前版本（许可页"确认 v{n}"）。
2. **test:storage**：在本地 Supabase 栈运行 `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… npm run test:storage`，全部 PASS，回执 `docs/audits/2026-11-06-foreign-research/storage-check-*.json` 提交到仓库。
3. **黄金集**：owner 批准清单并写 `broker_research_settings.approved_gold_corpus_hash`（O14）；`scripts/broker-research/eval-gold.ts` 在 owner 环境写 `gold` 回执，`passed=true`、`n_docs ≥ 30`、`corpus_hash` 等于批准值。

打开（管理员会话里，浏览器控制台或 curl 带会话 cookie；路由校验 Origin）：
`POST /api/admin/broker-research/settings/public {"enabled":true}` → 匿名浏览器打开 `/intel/foreign-research` 核对只出现许可允许的内容（目标价、片段、摘要逐项）。在规格 §17 记录日期与操作者。

**紧急关闭**：管理员总览"关闭对外"按钮，或同一路由 `{"enabled":false}`。提交后之后的请求不再含任何内容（全部响应 `no-store`）；已送达客户端的响应无法召回。

## 3. 登记 cron（owner 合并后事项；本计划未改 `vercel.json`）

首篇发布后登记核验；F4 消费端点上线且 `BROKER_RESEARCH_F4_URL` 配好后登记 outbox。在 `vercel.json` 的 `crons` 数组追加：

    {"path": "/api/cron/broker-research-verify", "schedule": "30 19 * * *"},
    {"path": "/api/cron/broker-research-outbox", "schedule": "*/10 * * * *"}

（核验 03:30 Asia/Shanghai；outbox 每 10 分钟需要 Vercel Pro。）手动触发：`curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/broker-research-verify`。

## 4. 核验失败处理

- 回执 `outcomes[].outcome = failed`（跨度漂移）或 `error`（产物不可读）：对应报告已 `evidence_ok=false` 自动隐藏，`claim.retract` 已入 outbox，`/admin/dq` 有 `span_drift` / `artifact_unreadable` 隔离项。
- 处理：查明原因（产物被替换、桶对象丢失、F3 版本变化）→ 如需重新解析与复核，先 `unpublish`；修复后在文档页点"重跑核验"（`POST /api/admin/broker-research/documents/<id>/verify`），通过则 `evidence_ok=true`；再在 `/admin/dq` 处理隔离项。
- 新鲜度：`dq_freshness(dataset='broker_research')` 只由核验 cron 写；管理员手动重跑不写。

## 5. outbox

- `pending` 积压是正常的（F4 未上线）。启用后每次最多 50 条。
- `failed`（≥ 10 次失败或 `payload_invalid:*`）出现在管理员总览"需要处理"。修复原因后重新排队（service role SQL，逐条核对 `last_error`）：
  `update broker_outbox set status='pending', attempts=0, last_error=null where event_id = '<id>';`
- 同一 `claim_key` 的 retract（seq 2）先到会在 F4 写墓碑，晚到的 register（seq 1）被忽略——重放安全。

## 6. 上传与提升异常

- `409 duplicate_document`：同一 sha256 已入库，打开既有文档。
- `500 promotion_lost`：暂存与正式对象都不存在；文档已 `withdrawn(promotion_lost)`。用同一文件重新上传：intent 路由为该 sha 创建绑定既有 `document_id` 的替换意向，提交成功后文档恢复 `uploaded`。
- 孤儿暂存对象：`POST /api/admin/broker-research/documents/orphan-cleanup`（只删 `staging/` 下过期 / 放弃意向的对象，从不删 `reports/`）。

## 7. 撤回与清除

1. 文档页"撤回"（原因必填）→ 公开 404、原文与签名链接 410、`claim.retract` 入队。
2. 需要删除原文时勾选"同时清除"或之后点"执行清除"（输入 sha256 前 8 位）：步骤 `pdf → artifacts → runs → fields_text → snippets_text → summaries → quarantine_payload`，可重复执行，只重试未成功步骤；全部完成写 `purged_at`。证据哈希、运行元数据与审计保留。
3. 访问日志（`/admin/broker-research/access-log?document=<id>`）核对撤回前的全文访问。

## 8. 回放

`npx tsx scripts/broker-research/replay.ts --publication <id>`：从发布快照与桶内产物重建，不读活表、不写库；用于审计与对 F4 结算的核对。
```

- [ ] **Step 12: 运行 E1 全部测试 + typecheck + lint**

Run: `npm test -- src/lib/broker-research/verify.test.ts src/lib/broker-research/outbox.test.ts src/app/api/cron/broker-research-crons.test.ts && npm run typecheck && npm run lint`
Expected: PASS；`git diff --stat vercel.json` 为空。

- [ ] **Step 13: 实施记录 + 提交**

实施记录追加：`E1 | verify + outbox + F4 端口 + cron 路由 + 单文档核验 + storage-check + runbook | 共享：package.json scripts 末尾追加 test:storage；vercel.json 未改；test:storage 未运行（人工门禁）`。

```bash
git add src/lib/broker-research/verify.ts src/lib/broker-research/verify.test.ts src/lib/broker-research/outbox.ts src/lib/broker-research/outbox.test.ts src/lib/broker-research/ports/f4.ts src/lib/broker-research/cron-auth.ts src/app/api/cron/broker-research-verify src/app/api/cron/broker-research-outbox src/app/api/cron/broker-research-crons.test.ts "src/app/api/admin/broker-research/documents/[id]/verify" "src/app/(app)/admin/broker-research/documents/[documentId]/DocumentClient.tsx" scripts/broker-research/storage-check.ts package.json docs/runbooks/broker-research.md docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): verify and outbox crons, F4 port, storage check, runbook (E1)"
```

---
### Task E2: 规格 §17 实施记录 + 全量门禁

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-foreign-research-design.md`（只替换 §17 的占位段落"（落地后补记，格式同规格一 §14。）"）
- Modify: `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`（收尾一行）

- [ ] **Step 1: 汇总偏差**

从实施记录（每任务一行）收集 A/B/C 各任务登记的偏差，与下表 D/E 部分合并。D/E 的偏差（实施时若有新增，同步补进表格）：

| # | 偏差 | 规格条目 | 原因 / 恢复条件 |
|---|---|---|---|
| 1 | i18n 命名空间改为独立域 `foreign-research`（`.public.*`、`.admin.*`、`.rating.*`、`.fields.*`），不用 `intel.foreignResearch.*` / `admin.brokerResearch.*` / `common.rating.*`；parity 由本模块自带测试覆盖 | §9.7 | 不改共享 `intel/admin/common.json`，避免并行模块合并冲突 |
| 2 | 两条 cron（核验、outbox）路由已交付但**未登记** `vercel.json` | §8.3、§14 FR-5 | 首篇发布前无可核验内容；F4 消费端点未上线（F4 规格 §12.3）。登记片段见 `docs/runbooks/broker-research.md` §3，owner 合并后执行 |
| 3 | `test:storage` 只交付脚本与 npm 脚本，未运行 | §12.3 | 需要本地 Supabase 栈；FR-6 前人工门禁，回执提交到审计目录 |
| 4 | 公开列表无筛选且 0 行 → `404 not_found`；列表页对此显示"空馆藏"态而不是 404 页 | §8.1、§9.1、§9.2 | 匿名角色无法区分"开关关闭"与"空馆藏"（视图设计如此）；详情页与机构页照规格 404 |
| 5 | 公开响应在 §8.1 字段外多 `targets[].publicationId`、`primaryTargetKey` | §8.1 | 来源抽屉显示发布快照 id；视图已含这两列 |
| 6 | 事实区标题"事实"改为"报告所载"，评级 / 目标价 / 空间 / 历史 / 分歧标"第三方判断（未结算）"，报告时价格与方法论参数标"第三方假设 · 文件所载" | §9.3、画板 Detail | F4 规格 §3、§12.3：登记为判断前不得以事实样式展示 |
| 7 | 机构页无"分析师"卡；馆藏样本表现只显示 n | 画板 Institution | 契约无按机构读公开分析师的方法（契约修订建议 4）；命中率在 F4 后 |
| 8 | 摘要中的数字不可点开到证据 | 画板 Detail | DTO 不含落地断言（契约修订建议 3） |
| 9 | 管理员总览的"打开对外"恒禁用，三项门禁只读；只提供"关闭对外" | §9.5 | `test:storage` 回执在线上不可核对；FR-6 由 owner 按 runbook 操作 |
| 10 | 管理员总览增加"复核队列""最近文档"两表作为文档页 / 复核页入口；无独立文档列表页 | §9.1 | 画板侧栏"文档 / 复核"无列表画板 |
| 11 | 管理员"机构"页（`/admin/broker-research/institutions`）与机构 / 映射 / 分析师维护路由未交付 | §9.1、§14 FR-4 | 不在本计划 Part C/D 任务清单；FR-4 维护先经 SQL / 隔离钩子（映射行由 `broker_quarantine_resolve` 插入） |
| 12 | 预览页不含历史与跨机构分歧；预览不写访问日志 | §9.1 | 二者只来自公开视图；预览不返回全文 / 跨度 |
| 13 | 新增单文档核验路由 `POST /api/admin/broker-research/documents/[id]/verify` | §8.2 未列、§8.3 提到"重跑核验" | 规格 §8.3 要求的管理员恢复路径 |
| 14 | `/api/consensus/[ticker]` 删除 mock 回退后，非 A 股与无 Tushare 覆盖一律 `source:'none'`；`/stock` 的 Tushare 共识卡保留 | §9.4 | 与规格一致；记录以便核对 |
| 15 | 三级文字色用既有 `--text-muted`（`#52525b`），未采用画布的 `#8b8b94` | 画布约定 | 偏差待 owner 确认，未新增 token |

- [ ] **Step 2: 写 §17**

把 §17 的占位段落替换为（日期、提交、门禁结果按实际填写；"A/B/C 偏差"行由 Step 1 汇总的实际内容替换）：

```markdown
## 17. 实施记录与偏差

实施：计划 `docs/superpowers/plans/2026-11-06-foreign-research.md`，分支 `claude/foreign-research-f63683`，提交 `<first>..<last>`，<日期>。逐任务记录见 `docs/audits/2026-11-06-foreign-research/10-implementation-log.md`。

**状态**：FR-0–FR-5 代码完成；FR-6（对外发布）未执行，`public_enabled=false`；FR-7 只有关闭的 F4 端口。生产端口默认关闭：`BROKER_RESEARCH_F3_ENABLED`、`BROKER_RESEARCH_LLM_ENABLED`、`BROKER_RESEARCH_F4_URL` 未设。

**Owner 默认值（未答复，按 §15.2 / §15.3 默认实施）**：D2 片段硬上限 500；D3 目标价默认不公开；D4 分析师姓名默认不公开；D5 平台 LLM、分块 8 页 / 60%；D7 提案值原样；O11 清除时保留摘要文本；O14 未批准黄金集 → 含 LLM 字段的报告恒阻断 `eval_receipt_missing`。

**偏差**：

| # | 偏差 | 规格条目 | 原因 / 恢复条件 |
|---|---|---|---|
| A/B/C | （由实施记录汇总） | | |
| 1–15 | （Task E2 Step 1 表格原样粘贴） | | |

**门禁结果**（<日期>）：`npm run typecheck` ✓；`npm run lint` ✓；`npm test` ✓（<n> 文件 / <m> 用例）；`test:db` ✓；`test:migrations` ✓；`research-checks` ✓；`test:storage` 未运行（FR-6 前人工门禁）。

**合并后 owner 事项**：生产迁移三份（`20261113090000/091000/092000`）与建桶；D1 许可确认；O14 黄金集批准与 `eval-gold.ts` 回执；本地栈 `npm run test:storage` 回执；首篇发布后登记核验 cron，F4 上线后登记 outbox cron（runbook §3）；FR-6 开关（runbook §2）。
```

- [ ] **Step 3: 全量门禁（逐条运行，全部通过才写 §17 的结果行）**

```bash
npm run typecheck
```
```bash
npm run lint
```
```bash
npm test
```
```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
```
```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
```
```bash
npx tsx scripts/ci/research-checks.ts
```
Expected：全部退出码 0。`npm test` 已知的本地全量 flake（见仓库 memory "Alpha local DB harness environment"）若出现，单独重跑该文件确认后记录在 §17，不得跳过。

附加核对：

```bash
git diff --stat main -- vercel.json src/lib/data/mock.ts messages/zh/intel.json messages/zh/admin.json messages/zh/common.json
```
Expected：无输出（这些共享文件未被改动）。

```bash
git diff main -- src/i18n/request.ts "src/app/(app)/stock/[ticker]/page.tsx" "src/app/api/consensus/[ticker]/route.ts" "src/app/(app)/intel/page.tsx" | grep -c "FOREIGN"
```
Expected：≥ 8（每个共享文件的修改都在 `FOREIGN ↓ … ↑` 围栏内）。

```bash
grep -rn "S4_TEST_STATE" src/lib/broker-research --include=*.test.ts -l
```
Expected：输出的每个文件都在 `scripts/ci/research-checks.ts` 的 `criticalSuites` 里（A1 / C8 已登记；D/E 的测试不含该字符串）。

- [ ] **Step 4: 实施记录收尾 + 提交**

实施记录追加：`E2 | 规格 §17 实施记录 + 全量门禁 | 门禁结果：<填写>`。

```bash
git add docs/superpowers/specs/2026-11-04-foreign-research-design.md docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "docs(spec): foreign research implementation record and deviations (E2)"
```

---

## 契约修订建议（Part D/E）

以下建议**不阻塞**本 Part 的任务（每条都已有不依赖修订的实现）；采纳后可替换对应的变通做法。

1. **`PublicReportFilter` 增加 `hasSummary?: boolean`**。现状：`listPublicReports` 在分页之后过滤 `summaryOnly`，因此一页可能少于 `limit` 条（`nextCursor` 跟随最后**读取**的行，结果仍正确）。采纳后在视图层过滤，页大小稳定。
2. **`research_institutions_public_v` 增加 `report_count`、`last_published_date`、`last_available_at`**（由 `visible_reports` 聚合）。现状：`libraryStats` 用 `publicReports` 分页统计（最多 10 页 × 200，超过时 `truncated=true` 显示"≥"）。采纳后 `/institutions` 一次查询。
3. **`broker_reports_public_v` 增加 `rules_version`、`title_model_id`；`broker_report_summaries_public_v` 增加 `numeric_grounding.assertions`（只含 `sentence_idx/target_key/field/value/unit`，不含 `field_id`）**。用途：来源抽屉显示规则版本（规格 §9.3 要求，现缺）；译名标注"译 · 模型 id"（现只显示"译"）；摘要数字可点开到对应事实（画板 Detail）。
4. **`BrokerResearchDb.publicAnalysts(opts:{institutionId:string;limit:number})`**（读 `broker_analysts_public_v`）。用途：机构页"分析师"卡（画板 Institution），现已省略。
5. **`broker_report_citations_v` 增加 `field_id`**（uuid，不泄露内容）。用途：片段与引用按 `snippets.field_id` 精确关联；现按 `purpose ↔ field` 映射近似。
6. **复核数据 ★ `GET reports/[id]` 的响应形状写进共享契约**（D5 假定的 `ReviewPayload`：`report, document, licence, fields, targets, snippets, summaries, institutions, analysts, runs, blockers`）。C6 若不同，只改 `review-model.ts::normalizeReviewPayload`。
7. **`BrokerResearchDb.verifyCandidates(limit)`**（已发布报告的文档，`last_verified_at asc nulls first`）。现状：`verify.ts` 读全部已发布报告再逐个 `getDocument` 并在 TS 排序（馆藏数百篇时可接受）。
8. **管理员写路由请求体统一为 snake_case 行字段名**（D5 假定：`fields` = `HumanFieldInput`，`snippets` = `SnippetRow` 子集，`bind` 为报告列补丁 + `analyst:{analyst_id,field_id,role}`；`fields/absent` 与 `overrides` 按规格 §8.2 写 `{field,targetKey,page}`、`{targetKey,securityTicker}`）。请 C 在路由里明确并与本假定对齐，或在契约中定稿。
9. **`updateReportDraft` 改名或新增 `setReportFlags(reportId,{evidence_ok?,disclosure_ok?})`**：核验 cron 需要在**已发布**报告上改 `evidence_ok`（触发器允许），用名为 "Draft" 的方法容易被实现成"仅草稿"。
10. **API 动态段命名**：规格 §8.2 写 `documents/[id]`；E1 新增 `documents/[id]/verify` 沿用 `[id]`。若 C 的目录用 `[documentId]`，Next 会因同级不同 slug 名拒绝构建——请在契约里定一个名字（建议 `[id]`，与 §8.2 一致）。
