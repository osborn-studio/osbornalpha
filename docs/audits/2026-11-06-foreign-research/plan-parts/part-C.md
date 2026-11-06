# Part C — 处理服务、管理员路由、端到端（Tasks C1–C8）

> 本部分接在计划骨架 `docs/superpowers/plans/2026-11-06-foreign-research.md` 之后。共享契约（`types.ts`、`BrokerResearchDb`、`BrokerDeps`）原样使用；契约不足之处只在文末「契约修订建议」提出，正文代码按**现行契约**写（个别处用 `deps.tables` 读写本模块私有表作过渡，均在修订建议里列出）。

## Part C 通用约定

- **服务签名**：每个服务的第一个参数是 `BrokerDeps` 或其 `Pick<…>`（C2/C3 不需要 F3/LLM，用 `CoreDeps = Omit<BrokerDeps,'f3'|'llm'>`，定义在 C1 的 `deps.ts`；C4 在同一文件追加 `brokerDeps()`）。服务抛 `BrokerError(code,status,extra)`（C1 `errors.ts`），或让 `BrokerResearchDbError` 透传；路由只做 解析 → 服务 → `toErrorResponse`。
- **管理员路由**：一律用 C1 的 `adminGet` / `adminPost` 包装（顺序：`requireAdminUser` → Content-Type `application/json`（否则 415）→ Origin（与 `new URL(request.url).origin` 不同则 403）→ JSON 体（否则 400 `invalid_json`））。PATCH 同 POST。全部响应（含错误）`Cache-Control: no-store`；错误体 `{error:{code,message,...extra}}`。★ 路由用 `respondLogged(db,row,payload)`：先 `logAccess`，失败 → `500 access_log_failed` 且不含 payload；`withdrawn` 文档在记日志之前 → `410 document_withdrawn`。
- **审计**：许可、开关、发布、撤回写 `research_audit_log`（`auditAdmin`，尽力而为：失败只 `console.error`，与 `dq/quarantine` 路由同策略，因为状态已提交）。
- **处理路由**：`export const dynamic='force-dynamic'`、`export const maxDuration=300`；deadline = 请求开始 + 300 s − 20 s（`deadlineFrom(start)`，C4）。
- **单测**：`memoryBrokerResearchDb` + `memoryBrokerStorage` + `memoryTableClient` + `fakeF3Port` + `recordedLlmPort`，经 C1/C4 的 `testing.ts` 组装；路由测试 mock `@/lib/admin/auth::requireAdminUser` 与 `@/lib/broker-research/deps`（返回内存 deps），照抄 `src/app/api/admin/dq/quarantine/[id]/route.test.ts` 的 `vi.hoisted` 写法；401/403/415/403(origin)/no-store 用 C1 的 `adminGuardCases()` 统一注册。
- **测试命令**：`npm test -- src/lib/broker-research src/app/api/admin/broker-research`；`npm run typecheck`；`npm run lint`；C8 另跑 `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`。
- **实施记录**：每个任务完成后在 `docs/audits/2026-11-06-foreign-research/10-implementation-log.md` 末尾追加一行 `| C<n> | <日期> | <提交 sha 前 8 位> | <测试数> | <偏差或无> |`（文件不存在则建，表头 `| 任务 | 日期 | 提交 | 测试 | 偏差 |`）。
- **提交**：`git add <本任务 Files>` 后**单独**一条 `git commit -m "<msg>"`，同一命令不得出现任何 `-n` 记号。

### 依赖的 A/B 导出（Part C 假定的签名；与 A/B 实际落地不符时以 A/B 为准并回改本部分调用处）

| 来源 | 导出 | 假定签名 / 语义 |
|---|---|---|
| A4 `types.ts` | 全部契约类型、`BrokerResearchDbError` | 原样（骨架 §共享契约） |
| A4 `db.ts` | `supabaseBrokerResearchDb` | `(admin: SupabaseClient) => BrokerResearchDb` |
| A4 `memory-db.ts` | `memoryBrokerResearchDb` | `(opts?: {tables?: TableClient; now?: () => Date}) => BrokerResearchDb`；`tables` 用于 `publishBlockers` 第 10 条读 `dq_quarantine`；实现 `licence_material_change`、租约 CAS、`extractCommit`（superseded 标记 + 候选物化）、`fieldReview`（冲突组 confirm → 同组其余 rejected）、发布函数、`withdrawn → uploaded`（仅 `withdrawn_reason='promotion_lost'`）等价规则 |
| A4 `hash.ts` | `canonicalJson`、`sha256Hex` | `canonicalJson(v: unknown): string`；`sha256Hex(s: string): string`（UTF-8） |
| A4 `effective.ts` | `effectiveValue` | `(row: FieldRow) => TypedValue` |
| A5 `pg-db.ts` | `pgBrokerResearchDb` | `(pool: Pool) => BrokerResearchDb` |
| A1/A2 SQL | 发布阻断 13 测试模式 | 会话 GUC `broker.accept_synthetic_eval='on'` 时 `corpus_kind='synthetic'` 回执视同 `gold`（生产不设） |
| A2 SQL | `field_pending` 语义 | 只统计 `superseded_by_run_id is null` 且同身份 `(target_key,field,occurrence)` **没有生效行**的候选 |
| A2 SQL | `fencedUpdateDocument` | 对 `withdrawn` 文档返回 `lease_lost`（撤回后旧解析不能把文档改回 `parsed`） |
| A2 SQL | 发布快照 | `snapshot.fields[]` 每行含 `field_id, field, target_key, occurrence, status, extractor, parse_run_id, run_id, artifact_hash, page, char_start, char_end, value_source_text` 与生效值五分量 |
| A2 SQL | `broker_quarantine_resolve(p_id,p_status,p_by,p_payload)` | 返回文本 `'resolved'|'already_resolved'|'not_found'`；错误按 `<code>[:detail]` |
| A2 SQL | `broker_field_review` 载荷 | snake_case：`confirm {page?,char_start?,char_end?,value_source_text?}`、`correct {corrected,page,char_start,char_end,value_source_text}`、`reject {}`、`absent {page}` |
| A1 | 日志表外键 | `broker_report_access_log.user_id` 无外键；`research_audit_log.user_id` 有 `auth.users` 外键（故审计尽力而为） |
| B1 `versions.ts` | 版本常量 | 骨架「版本常量」原样 |
| B1 `behavior.ts` | `behaviorDigest` | `(i: {extractorVersion; modelId; registryHash; promptVersion; schemaVersion}: string 各项) => string`（其余五个版本常量函数内取） |
| B1 `extract/schema.ts` | `validateExtraction`、`EXTRACT_JSON_SCHEMA`、`Extraction` | `validateExtraction(v): {ok:true; value: Extraction} \| {ok:false; errors: string[]}`；`EXTRACT_JSON_SCHEMA: object` |
| B1 `extract/locate.ts` | `locateQuote` | `(pageText, quote) => {status:'hit'; char_start; char_end; multiple: boolean} \| {status:'miss'}`（UTF-16） |
| B1 `extract/typed.ts` | `toTyped` | `(field: FieldName, valueText: string, quote?: string) => TypedValue` |
| B2 `tickers.ts` | `resolveTargets` | `(tables: TableClient, stated: {targetKey: string; candidates: string[]}[], today: string) => Promise<Map<string,{resolution: Record<string,unknown>; issuerId: string\|null; securityTicker: string\|null}>>` |
| B3 `extract/merge.ts` | `mergeChunks`、`MergedCandidate` | `mergeChunks(chunks: {chunk: number; extraction: Extraction}[]) => {scope: ReportScope\|null; candidates: MergedCandidate[]; stated: {targetKey: string; candidates: string[]}[]}`；`MergedCandidate = {target_key: string\|null; field: FieldName; occurrence: number; value: string; page: number; quote: string; confidence: number; conflict_group: string\|null; detail: Record<string,unknown>}` |
| B4 `rules.ts` | `evaluateRules`、`RulesInput` | `RulesInput = {report; document; fields: FieldRow[]; targets: TargetRow[]; scales: RatingScaleRow[]; peers: {reportId; institutionId: string\|null; publishedDate: string\|null; title: string\|null; securityTickers: string[]}[]; slice: (parseRunId, page, charStart, charEnd) => string\|null}`；规则名 = §7.1 反引号名；`reason_code` = §7.1 隔离码；`detail` 只含值与页码 |
| B5 `disclosure.ts` | `checkDisclosure` | `(i: {text: string; targets: TargetRow[]; analysts: AnalystRow[]; licence: LicenceRow}) => DisclosureCheck` |
| B5 `summary/overlap.ts` | `maxVerbatimOverlap` | `(summary: string, source: string) => number` |
| B5 `summary/grounding.ts` | `checkGrounding` | `(i: {summary: string; lang: Lang; targets: TargetRow[]; fields: FieldRow[]}) => GroundingResult` |

---

### Task C1: 存储端口、错误、审计、管理员路由助手、测试装配

**Files:**
- Create: `src/lib/broker-research/errors.ts`
- Create: `src/lib/broker-research/audit.ts`
- Create: `src/lib/broker-research/storage.ts`（若 A4 为让 `types.ts` 通过类型检查已建了只含接口的桩，整文件替换为下文；接口文本不变）
- Create: `src/lib/broker-research/storage.test.ts`
- Create: `src/lib/broker-research/deps.ts`
- Create: `src/lib/broker-research/admin-route.ts`
- Create: `src/lib/broker-research/admin-route.test.ts`
- Create: `src/lib/broker-research/testing.ts`（测试装配，非测试文件）
- Create: `src/lib/broker-research/route-testing.ts`（路由测试共用断言，非测试文件，只被 `*.test.ts` 引用）

- [ ] **Step 1: 写存储失败测试**

```ts
// src/lib/broker-research/storage.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {BROKER_BUCKET,StorageError,brokerPaths,memoryBrokerStorage,supabaseBrokerStorage} from './storage';

const SHA='a'.repeat(64),ID='00000000-0000-4000-8000-000000000001';
const pdf=new TextEncoder().encode('%PDF-1.7 synthetic');

describe('memoryBrokerStorage',()=>{
 it('signed upload accepts exactly one upload for the issued token',async()=>{
  const s=memoryBrokerStorage();const {token}=await s.createSignedUploadUrl(brokerPaths.staging(ID));
  expect(s.putSigned(brokerPaths.staging(ID),'wrong',pdf)).toBe('rejected');
  expect(s.putSigned(brokerPaths.staging(ID),token,pdf)).toBe('stored');
  expect(s.putSigned(brokerPaths.staging(ID),token,pdf)).toBe('rejected');
 });
 it('upload never overwrites',async()=>{
  const s=memoryBrokerStorage();
  expect(await s.upload(brokerPaths.artifact(SHA,ID),'{"a":1}','application/json')).toBe('stored');
  expect(await s.upload(brokerPaths.artifact(SHA,ID),'{"a":2}','application/json')).toBe('exists');
  expect(s.text(brokerPaths.artifact(SHA,ID))).toBe('{"a":1}');
 });
 it('move distinguishes moved / missing / target_exists',async()=>{
  const s=memoryBrokerStorage();const st=brokerPaths.staging(ID),rp=brokerPaths.report(SHA);
  expect(await s.move(st,rp)).toBe('missing');
  await s.upload(st,pdf,'application/pdf');
  expect(await s.move(st,rp)).toBe('moved');
  expect(await s.exists(st)).toBe(false);expect(await s.exists(rp)).toBe(true);
  await s.upload(st,pdf,'application/pdf');
  expect(await s.move(st,rp)).toBe('target_exists');
 });
 it('remove is idempotent, list is one level under the prefix',async()=>{
  const s=memoryBrokerStorage();
  await s.upload(brokerPaths.staging(ID),pdf,'application/pdf');
  await s.upload(`${brokerPaths.pagesPrefix(SHA,ID)}1.png`,pdf,'image/png');
  expect(await s.list('staging/')).toEqual([brokerPaths.staging(ID)]);
  expect(await s.list(brokerPaths.pagesPrefix(SHA,ID))).toEqual([`${brokerPaths.pagesPrefix(SHA,ID)}1.png`]);
  await s.remove([brokerPaths.staging(ID)]);await s.remove([brokerPaths.staging(ID)]);
  expect(await s.list('staging/')).toEqual([]);
 });
 it('rejects paths outside the bucket layout',async()=>{
  const s=memoryBrokerStorage();
  await expect(s.upload('reports/../x.pdf',pdf,'application/pdf')).rejects.toMatchObject({code:'storage_invalid_path'});
  await expect(s.list('reports/')).rejects.toBeInstanceOf(StorageError);
 });
 it('signed read URL needs an existing object; failNext injects one failure',async()=>{
  const s=memoryBrokerStorage();
  await expect(s.createSignedUrl(brokerPaths.report(SHA),600)).rejects.toMatchObject({code:'storage_not_found'});
  s.failNext('download');
  await expect(s.download(brokerPaths.report(SHA))).rejects.toMatchObject({code:'storage_failed'});
  expect(await s.download(brokerPaths.report(SHA))).toBeNull();
 });
});

describe('supabaseBrokerStorage',()=>{
 const client=(api:Record<string,unknown>)=>({storage:{from:vi.fn((b:string)=>{expect(b).toBe(BROKER_BUCKET);return api;})}}) as unknown as SupabaseClient;
 it('maps not-found download to null and 409 upload to exists',async()=>{
  const s=supabaseBrokerStorage(client({download:async()=>({data:null,error:{message:'Object not found',statusCode:'404'}}),upload:async()=>({data:null,error:{message:'The resource already exists',statusCode:'409'}})}));
  expect(await s.download(brokerPaths.report(SHA))).toBeNull();
  expect(await s.upload(brokerPaths.report(SHA),pdf,'application/pdf')).toBe('exists');
 });
 it('maps move errors and passes upsert:false',async()=>{
  const upload=vi.fn(async()=>({data:{},error:null}));
  const move=vi.fn().mockResolvedValueOnce({error:{message:'Object not found',statusCode:'404'}}).mockResolvedValueOnce({error:{message:'The resource already exists',statusCode:'409'}}).mockResolvedValueOnce({error:null});
  const s=supabaseBrokerStorage(client({move,upload}));
  expect(await s.move(brokerPaths.staging(ID),brokerPaths.report(SHA))).toBe('missing');
  expect(await s.move(brokerPaths.staging(ID),brokerPaths.report(SHA))).toBe('target_exists');
  expect(await s.move(brokerPaths.staging(ID),brokerPaths.report(SHA))).toBe('moved');
  await s.upload(brokerPaths.report(SHA),pdf,'application/pdf');
  expect(upload).toHaveBeenCalledWith(brokerPaths.report(SHA),pdf,{contentType:'application/pdf',upsert:false});
 });
 it('throws storage_failed for other errors and pages list()',async()=>{
  const page=(n:number,from:number)=>Array.from({length:n},(_,i)=>({id:`x${from+i}`,name:`${from+i+1}.png`}));
  const list=vi.fn().mockResolvedValueOnce({data:page(1000,0),error:null}).mockResolvedValueOnce({data:page(2,1000),error:null});
  const s=supabaseBrokerStorage(client({list,remove:async()=>({error:{message:'boom',statusCode:'500'}})}));
  expect((await s.list(brokerPaths.pagesPrefix(SHA,ID))).length).toBe(1002);
  expect(list.mock.calls[1][1]).toMatchObject({limit:1000,offset:1000});
  await expect(s.remove([brokerPaths.report(SHA)])).rejects.toMatchObject({code:'storage_failed'});
 });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/broker-research/storage.test.ts`
Expected: FAIL（`Cannot find module './storage'`）。

- [ ] **Step 3: 实现 `errors.ts`、`audit.ts`、`storage.ts`**

```ts
// src/lib/broker-research/errors.ts
// Service error of the broker research module (plan Part C; spec §13): `code` is the API error code, `status`
// its HTTP status, `extra` extra body keys. Services throw it; admin-route.ts::toErrorResponse maps it 1:1.
// BrokerResearchDbError (types.ts) is the DB-layer counterpart and is mapped separately.
export class BrokerError extends Error{
 constructor(readonly code:string,readonly status:number,readonly extra:Record<string,unknown>={}){super(code);this.name='BrokerError';}
}
export const bad=(code:string,extra?:Record<string,unknown>)=>new BrokerError(code,400,extra);
export const notFound=(code='not_found')=>new BrokerError(code,404);
export const conflict=(code:string,extra?:Record<string,unknown>)=>new BrokerError(code,409,extra);
export const gone=()=>new BrokerError('document_withdrawn',410);
```

```ts
// src/lib/broker-research/audit.ts
// research_audit_log rows for admin decisions of the broker research module (licences, public switch,
// publish/unpublish, withdraw/purge; spec §8.2). Same row shape as src/lib/research/store.ts::audit. Best effort:
// the decision is already committed when this runs, so a failure is logged, never turned into a 500 that would
// invite a retry (same policy as /api/admin/dq/quarantine/[id]).
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function auditAdmin(tables:TableClient,userId:string,action:string,objectId:string|null,detail:Record<string,unknown>={},now=new Date()):Promise<void>{
 try{
  await tables.insert('research_audit_log',{id:randomUUID(),user_id:userId,actor:'user',action,object_type:'broker_research',
   object_id:objectId!==null&&UUID.test(objectId)?objectId:null,detail,created_at:now.toISOString()});
 }catch(e){console.error('[broker-research] audit failed',e instanceof Error?e.message:e);}
}
```

```ts
// src/lib/broker-research/storage.ts
// Private bucket `broker-research` (spec §4.12, §6.1, §12.3). BrokerStorage is the only way services touch objects:
// content-addressed reports/{sha}.pdf, per-intent staging/{intent_id}.pdf, per-run artifacts reports/{sha}.extract.{run}.json
// and page images, runs/{run}.{request|response}.json, licence evidence. upload() never overwrites (upsert:false →
// 'exists'); move() answers 'missing' when the source is gone and 'target_exists' when the destination is taken, so the
// commit state machine (upload.ts) can tell "already promoted" from "promotion lost". Paths are validated against the
// layout so no caller can address anything else. Signed upload URLs serve the browser's direct upload; signed read URLs
// are issued only by the ★ url route, after the access log row is written.
import type {SupabaseClient} from '@supabase/supabase-js';

export const BROKER_BUCKET='broker-research';
export const MAX_OBJECT_BYTES=52428800;
export const SIGNED_READ_SECONDS=600;
export type ObjectType='application/pdf'|'application/json'|'image/png';
const U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',S='[0-9a-f]{64}';
const PATH_RE=new RegExp(`^(staging/${U}\\.pdf|reports/${S}\\.pdf|reports/${S}\\.extract\\.${U}\\.json|reports/${S}\\.pages\\.${U}/[1-9][0-9]{0,4}\\.png|runs/${U}\\.(request|response)\\.json|licences/${S}\\.pdf)$`);
const PREFIX_RE=new RegExp(`^(staging/|reports/${S}\\.pages\\.${U}/)$`);
export const brokerPaths={
 staging:(intentId:string)=>`staging/${intentId}.pdf`,
 report:(sha:string)=>`reports/${sha}.pdf`,
 artifact:(sha:string,runId:string)=>`reports/${sha}.extract.${runId}.json`,
 artifactPrefix:(sha:string,runId:string)=>`reports/${sha}.extract.${runId}`,
 pagesPrefix:(sha:string,runId:string)=>`reports/${sha}.pages.${runId}/`,
 request:(runId:string)=>`runs/${runId}.request.json`,
 response:(runId:string)=>`runs/${runId}.response.json`,
};
export class StorageError extends Error{
 constructor(readonly code:'storage_failed'|'storage_invalid_path'|'storage_not_found',message?:string){super(message??code);this.name='StorageError';}
}
export function assertObjectPath(p:string):void{if(typeof p!=='string'||!PATH_RE.test(p))throw new StorageError('storage_invalid_path',String(p).slice(0,120));}
function assertPrefix(p:string):void{if(typeof p!=='string'||!PREFIX_RE.test(p))throw new StorageError('storage_invalid_path',String(p).slice(0,120));}

export interface BrokerStorage{
 /** Browser direct upload to `path` (staging only in practice); the token is single-use. */
 createSignedUploadUrl(path:string):Promise<{url:string;token:string}>;
 /** null = object does not exist. */
 download(path:string):Promise<Uint8Array|null>;
 /** Never overwrites: an existing object answers 'exists' and is left untouched. */
 upload(path:string,body:Uint8Array|string,contentType:ObjectType):Promise<'stored'|'exists'>;
 move(from:string,to:string):Promise<'moved'|'missing'|'target_exists'>;
 exists(path:string):Promise<boolean>;
 /** Missing objects are not an error. */
 remove(paths:string[]):Promise<void>;
 createSignedUrl(path:string,expiresIn:number):Promise<string>;
 /** Full paths of the objects directly under `prefix` ('staging/' or a pages prefix). */
 list(prefix:string):Promise<string[]>;
}

interface SbError{message:string;statusCode?:string|number;status?:number}
const statusOf=(e:SbError)=>String(e.statusCode??e.status??'');
const isNotFound=(e:SbError)=>statusOf(e)==='404'||/not.?found/i.test(e.message);
const isExists=(e:SbError)=>statusOf(e)==='409'||/already exists|duplicate/i.test(e.message);

export function supabaseBrokerStorage(admin:SupabaseClient):BrokerStorage{
 const b=()=>admin.storage.from(BROKER_BUCKET);
 const fail=(op:string,e:SbError|null)=>new StorageError('storage_failed',`${op}:${e?.message??'no_data'}`);
 return {
  async createSignedUploadUrl(path){assertObjectPath(path);const {data,error}=await b().createSignedUploadUrl(path);if(error||!data)throw fail('signed_upload',error as SbError|null);return {url:data.signedUrl,token:data.token};},
  async download(path){
   assertObjectPath(path);const {data,error}=await b().download(path);
   if(error){if(isNotFound(error as SbError))return null;throw fail('download',error as SbError);}
   return new Uint8Array(await data.arrayBuffer());
  },
  async upload(path,body,contentType){
   assertObjectPath(path);const {error}=await b().upload(path,body,{contentType,upsert:false});
   if(!error)return 'stored';if(isExists(error as SbError))return 'exists';throw fail('upload',error as SbError);
  },
  async move(from,to){
   assertObjectPath(from);assertObjectPath(to);const {error}=await b().move(from,to);
   if(!error)return 'moved';if(isExists(error as SbError))return 'target_exists';if(isNotFound(error as SbError))return 'missing';throw fail('move',error as SbError);
  },
  async exists(path){assertObjectPath(path);const {data,error}=await b().exists(path);if(error&&!isNotFound(error as SbError))throw fail('exists',error as SbError);return data===true;},
  async remove(paths){paths.forEach(assertObjectPath);if(!paths.length)return;const {error}=await b().remove(paths);if(error)throw fail('remove',error as SbError);},
  async createSignedUrl(path,expiresIn){assertObjectPath(path);const {data,error}=await b().createSignedUrl(path,expiresIn);if(error||!data)throw fail('signed_url',error as SbError|null);return data.signedUrl;},
  async list(prefix){
   assertPrefix(prefix);const out:string[]=[];
   for(let offset=0;;offset+=1000){
    const {data,error}=await b().list(prefix.slice(0,-1),{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw fail('list',error as SbError);
    for(const o of data??[])if(o.id!==null)out.push(prefix+o.name);   // id null = folder placeholder
    if(!data||data.length<1000)return out;
   }
  },
 };
}

export interface MemoryBrokerStorage extends BrokerStorage{
 objects:Map<string,{bytes:Uint8Array;contentType:string}>;
 /** Simulates the browser PUT to a signed upload URL: needs the issued token, at most once per path. */
 putSigned(path:string,token:string,bytes:Uint8Array):'stored'|'rejected';
 /** The next call of `op` throws storage_failed (one shot). */
 failNext(op:keyof BrokerStorage,message?:string):void;
 read(path:string):Uint8Array|undefined;
 text(path:string):string|undefined;
}
export function memoryBrokerStorage():MemoryBrokerStorage{
 const objects=new Map<string,{bytes:Uint8Array;contentType:string}>(),signed=new Map<string,string>(),failures=new Map<string,string>();
 let n=0;
 const guard=(op:string)=>{const m=failures.get(op);if(m!==undefined){failures.delete(op);throw new StorageError('storage_failed',`${op}:${m}`);}};
 const bytesOf=(b:Uint8Array|string)=>typeof b==='string'?new TextEncoder().encode(b):new Uint8Array(b);
 return {
  objects,
  putSigned(path,token,bytes){
   if(signed.get(path)!==token||objects.has(path)||bytes.byteLength>MAX_OBJECT_BYTES)return 'rejected';
   objects.set(path,{bytes:new Uint8Array(bytes),contentType:'application/pdf'});return 'stored';
  },
  failNext(op,message='injected'){failures.set(op,message);},
  read:(p)=>{const o=objects.get(p);return o?new Uint8Array(o.bytes):undefined;},
  text:(p)=>{const o=objects.get(p);return o?new TextDecoder().decode(o.bytes):undefined;},
  async createSignedUploadUrl(path){guard('createSignedUploadUrl');assertObjectPath(path);const token=`tok-${++n}`;signed.set(path,token);return {url:`memory://upload/${path}?token=${token}`,token};},
  async download(path){guard('download');assertObjectPath(path);const o=objects.get(path);return o?new Uint8Array(o.bytes):null;},
  async upload(path,body,contentType){
   guard('upload');assertObjectPath(path);if(objects.has(path))return 'exists';
   const bytes=bytesOf(body);if(bytes.byteLength>MAX_OBJECT_BYTES)throw new StorageError('storage_failed','upload:too_large');
   objects.set(path,{bytes,contentType});return 'stored';
  },
  async move(from,to){
   guard('move');assertObjectPath(from);assertObjectPath(to);const o=objects.get(from);
   if(!o)return 'missing';if(objects.has(to))return 'target_exists';objects.set(to,o);objects.delete(from);return 'moved';
  },
  async exists(path){guard('exists');assertObjectPath(path);return objects.has(path);},
  async remove(paths){guard('remove');paths.forEach(assertObjectPath);for(const p of paths)objects.delete(p);},
  async createSignedUrl(path,expiresIn){guard('createSignedUrl');assertObjectPath(path);if(!objects.has(path))throw new StorageError('storage_not_found',path);return `memory://read/${path}?expires=${expiresIn}`;},
  async list(prefix){guard('list');assertPrefix(prefix);return [...objects.keys()].filter(k=>k.startsWith(prefix)&&!k.slice(prefix.length).includes('/')).sort();},
 };
}
```

- [ ] **Step 4: 运行存储测试**

Run: `npm test -- src/lib/broker-research/storage.test.ts`
Expected: PASS（9 个用例）。

- [ ] **Step 5: 写管理员路由助手失败测试**

```ts
// src/lib/broker-research/admin-route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {BrokerResearchDbError} from './types';
import {BrokerError} from './errors';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn()}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
import {adminGet,adminPost,respondLogged,toErrorResponse} from './admin-route';
import {adminGuardCases,bodyOf,errCode,getReq,jsonReq} from './route-testing';

const ok=adminPost<unknown>('t.post',async({body,userId})=>new Response(JSON.stringify({body,userId}),{headers:{'Cache-Control':'no-store'}}));
const get=adminGet<unknown>('t.get',async()=>{throw new BrokerResearchDbError('publish_blocked','publish_blocked','review_not_approved,field_pending:target_price');});

describe('admin-route helpers',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:'admin-1'});});
 adminGuardCases({call:(r)=>ok(r,{}),request:()=>jsonReq('/api/admin/broker-research/x',{a:1}),requireAdmin:mocks.requireAdmin,post:true});
 it('passes the parsed body and admin id; same-origin header accepted',async()=>{
  const r=await ok(jsonReq('/api/admin/broker-research/x',{a:1},{headers:{origin:'https://alpha.example'}}),{});
  expect(r.status).toBe(200);expect(await bodyOf(r)).toEqual({body:{a:1},userId:'admin-1'});
 });
 it('400 invalid_json for a non-object body',async()=>{
  const r=await ok(new Request('https://alpha.example/x',{method:'POST',headers:{'content-type':'application/json'},body:'[1]'}),{});
  expect(r.status).toBe(400);expect(await errCode(r)).toBe('invalid_json');
 });
 it('maps publish_blocked to 409 with the reason list',async()=>{
  const r=await get(getReq('/x'),{});
  expect(r.status).toBe(409);expect(r.headers.get('cache-control')).toBe('no-store');
  expect((await bodyOf<{error:{code:string;reasons:string[]}}>(r)).error).toMatchObject({code:'publish_blocked',reasons:['review_not_approved','field_pending:target_price']});
 });
 it('maps BrokerError and DB codes; unknown errors are a logged 500',async()=>{
  expect(toErrorResponse(new BrokerError('lease_held',409),'t').status).toBe(409);
  expect(toErrorResponse(new BrokerResearchDbError('published_immutable'),'t').status).toBe(409);
  expect(toErrorResponse(new BrokerResearchDbError('hook_params_required'),'t').status).toBe(400);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const r=toErrorResponse(new Error('db down'),'t');
  expect(r.status).toBe(500);expect(await errCode(r)).toBe('internal_error');
  expect(spy).toHaveBeenCalledWith('[admin/broker-research] t','db down');spy.mockRestore();
 });
 it('respondLogged writes the log first; a log failure is 500 access_log_failed without the payload',async()=>{
  const logAccess=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('log down'));
  const db={logAccess} as never;
  const row={document_id:null,user_id:'admin-1',action:'text_viewed' as const,detail:{}};
  const a=await respondLogged(db,row,{secret:'x'});
  expect(a.status).toBe(200);expect(await bodyOf(a)).toEqual({secret:'x'});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const b=await respondLogged(db,row,{secret:'x'});
  expect(b.status).toBe(500);const text=await b.text();expect(text).not.toContain('secret');expect(text).toContain('access_log_failed');
  expect(b.headers.get('cache-control')).toBe('no-store');spy.mockRestore();
 });
});
```

- [ ] **Step 6: 实现 `admin-route.ts`、`deps.ts`、`route-testing.ts`、`testing.ts`**

```ts
// src/lib/broker-research/admin-route.ts
// Shared plumbing of every /api/admin/broker-research route (plan Part C conventions; spec §8.2): admin gate
// (requireAdminUser: 401/403), POST/PATCH guards copied from /api/admin/dq/quarantine/[id] (application/json else
// 415, foreign Origin 403), JSON body (400 invalid_json), error mapping (BrokerError 1:1, BrokerResearchDbError by
// DB_ERROR_STATUS, anything else a logged 500), Cache-Control: no-store on every response, and the ★ rule: the
// access log row is written BEFORE the payload is returned; a log failure is 500 access_log_failed with no payload.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '../admin/auth';
import {BrokerError,bad} from './errors';
import {BrokerResearchDbError} from './types';
import type {AccessLogInput,BrokerResearchDb} from './types';

export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NO_STORE={'Cache-Control':'no-store'} as const;
export const jsonNoStore=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:NO_STORE});
export const errorJson=(code:string,status:number,extra:Record<string,unknown>={})=>jsonNoStore({error:{code,message:code,...extra}},status);

/** SQL `raise exception '<code>[:<detail>]'` codes → HTTP (plan §契约补充 "RPC 错误"). */
export const DB_ERROR_STATUS:Readonly<Record<string,number>>={
 publish_blocked:409,published_immutable:409,publish_direct_forbidden:409,lease_lost:409,version_mismatch:409,
 hook_params_required:400,invalid_payload:400,invalid_action:400,not_found:404,
};
export function toErrorResponse(e:unknown,tag:string):Response{
 if(e instanceof AdminUnauthenticated)return errorJson('authentication_required',401);
 if(e instanceof AdminForbidden)return errorJson('admin_required',403);
 if(e instanceof BrokerError)return errorJson(e.code,e.status,e.extra);
 if(e instanceof BrokerResearchDbError&&DB_ERROR_STATUS[e.code]!==undefined){
  if(e.code==='publish_blocked')return errorJson('publish_blocked',409,{reasons:(e.detail??'').split(',').filter(Boolean)});
  return errorJson(e.code,DB_ERROR_STATUS[e.code],e.detail?{detail:e.detail}:{});
 }
 console.error(`[admin/broker-research] ${tag}`,e instanceof Error?e.message:e);
 return errorJson('internal_error',500);
}

export async function readJsonBody(request:Request):Promise<Record<string,unknown>>{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw new BrokerError('unsupported_media_type',415);
 // Defence in depth against cross-site form posts: a browser-sent Origin must be ours.
 const origin=request.headers.get('origin');
 if(origin!==null&&origin!==new URL(request.url).origin)throw new BrokerError('forbidden_origin',403);
 const body:unknown=await request.json().catch(()=>undefined);
 if(body===null||typeof body!=='object'||Array.isArray(body))throw bad('invalid_json');
 return body as Record<string,unknown>;
}

type Handler<C>=(request:Request,ctx:C)=>Promise<Response>;
export function adminGet<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string})=>Promise<Response>):Handler<C>{
 return async(request,ctx)=>{try{const userId=(await requireAdminUser()).id;return await fn({request,ctx,userId});}catch(e){return toErrorResponse(e,tag);}};
}
export function adminPost<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string;body:Record<string,unknown>})=>Promise<Response>):Handler<C>{
 return async(request,ctx)=>{
  try{const userId=(await requireAdminUser()).id;const body=await readJsonBody(request);return await fn({request,ctx,userId,body});}
  catch(e){return toErrorResponse(e,tag);}
 };
}
/** ★ responses: log first, then answer; never return the payload when the log row could not be written. */
export async function respondLogged(db:BrokerResearchDb,row:AccessLogInput,payload:unknown):Promise<Response>{
 try{await db.logAccess(row);}
 catch(e){console.error('[admin/broker-research] access log failed',e instanceof Error?e.message:e);return errorJson('access_log_failed',500);}
 return jsonNoStore(payload);
}

// ---- parameter readers (400 invalid_parameter:<name>) ----
const invalid=(name:string)=>bad(`invalid_parameter:${name}`);
export const uuidParam=(v:unknown,name='id'):string=>{if(typeof v!=='string'||!UUID_RE.test(v))throw invalid(name);return v.toLowerCase();};
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional?:false}):string;
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional:true}):string|undefined;
export function strField(b:Record<string,unknown>,k:string,o:{max:number;optional?:boolean}):string|undefined{
 const v=b[k];if(v===undefined&&o.optional)return undefined;
 if(typeof v!=='string'||v.trim().length===0||v.length>o.max)throw invalid(k);return v;
}
export const boolField=(b:Record<string,unknown>,k:string,def?:boolean):boolean=>{const v=b[k];if(v===undefined&&def!==undefined)return def;if(typeof v!=='boolean')throw invalid(k);return v;};
export const intField=(b:Record<string,unknown>,k:string,min:number,max:number):number=>{const v=b[k];if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw invalid(k);return v;};
export const enumField=<T extends string>(b:Record<string,unknown>,k:string,allowed:readonly T[]):T=>{const v=b[k];if(typeof v!=='string'||!(allowed as readonly string[]).includes(v))throw invalid(k);return v as T;};
export const objField=(b:Record<string,unknown>,k:string):Record<string,unknown>=>{const v=b[k]??{};if(typeof v!=='object'||v===null||Array.isArray(v))throw invalid(k);return v as Record<string,unknown>;};
```

```ts
// src/lib/broker-research/deps.ts
// Production wiring of the broker research services (plan Part C). coreDeps(): DB, storage, TableClient, clock,
// code version (resolveCodeVersion allowGit:false → 'unknown' when absent) and ids — enough for licences/upload.
// Task C4 appends brokerDeps() = coreDeps() + the flag-gated F3 and LLM ports. Routes import only this module, so
// route tests mock it with in-memory deps.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import {resolveCodeVersion} from '../facts/deps';
import {supabaseBrokerResearchDb} from './db';
import {supabaseBrokerStorage} from './storage';
import type {BrokerDeps} from './types';

export type CoreDeps=Omit<BrokerDeps,'f3'|'llm'>;
export function coreDeps():CoreDeps{
 const admin=getAdminSupabase() as unknown as SupabaseClient;
 return {db:supabaseBrokerResearchDb(admin),storage:supabaseBrokerStorage(admin),tables:supabaseTableClient(admin),
  now:()=>new Date(),codeVersion:resolveCodeVersion({allowGit:false})??'unknown',newId:randomUUID};
}
```

```ts
// src/lib/broker-research/route-testing.ts
// Shared assertions for the admin route tests (imported only by *.test.ts): 401 / 403 / 415 / 403-origin and
// Cache-Control: no-store on each of them (plan Part C conventions; spec §12.1 路由).
import {expect,it} from 'vitest';
import {AdminForbidden,AdminUnauthenticated} from '../admin/auth';

export const ORIGIN='https://alpha.example';
export const jsonReq=(path:string,body:unknown,init:{method?:string;headers?:Record<string,string>}={})=>
 new Request(`${ORIGIN}${path}`,{method:init.method??'POST',headers:{'content-type':'application/json',...init.headers},body:JSON.stringify(body)});
export const getReq=(path:string)=>new Request(`${ORIGIN}${path}`);
export const bodyOf=async<T=Record<string,unknown>>(res:Response):Promise<T>=>(await res.json()) as T;
export const errCode=async(res:Response)=>(await bodyOf<{error:{code:string}}>(res)).error.code;
export const ctxOf=<P extends Record<string,string>>(p:P)=>({params:Promise.resolve(p)});

interface GuardOpts{call:(r:Request)=>Promise<Response>;request:()=>Request;requireAdmin:{mockRejectedValueOnce(e:unknown):unknown};post:boolean}
export function adminGuardCases(o:GuardOpts):void{
 const noStore=(r:Response)=>expect(r.headers.get('cache-control')).toBe('no-store');
 it('401 without a session (no-store)',async()=>{o.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));const r=await o.call(o.request());expect(r.status).toBe(401);noStore(r);});
 it('403 for a signed-in non-admin',async()=>{o.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));const r=await o.call(o.request());expect(r.status).toBe(403);expect(await errCode(r)).toBe('admin_required');});
 if(!o.post)return;
 it('415 for a non-JSON content type',async()=>{
  const base=o.request();const r=await o.call(new Request(base.url,{method:base.method,headers:{'content-type':'text/plain'},body:'{}'}));
  expect(r.status).toBe(415);noStore(r);
 });
 it('403 for a foreign Origin',async()=>{
  const base=o.request();const body=await base.text();
  const r=await o.call(new Request(base.url,{method:base.method,headers:{'content-type':'application/json',origin:'https://evil.example'},body}));
  expect(r.status).toBe(403);expect(await errCode(r)).toBe('forbidden_origin');
 });
}
```

```ts
// src/lib/broker-research/testing.ts
// In-memory wiring for unit tests of the broker research services (plan Part C; spec §12.1): memory DB + storage +
// TableClient, a settable clock, sequential v4-shaped ids, and seeds (licence, committed document). Not a test file;
// imported only by *.test.ts and pipeline.integration.test.ts. Task C4 appends memoryBrokerDeps() with the fake ports.
import {createHash} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {memoryBrokerResearchDb} from './memory-db';
import {brokerPaths,memoryBrokerStorage} from './storage';
import type {MemoryBrokerStorage} from './storage';
import type {CoreDeps} from './deps';
import type {BrokerResearchDb,DocumentRow,LicenceInput,LicenceRow} from './types';

export const ADMIN_ID='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const OTHER_ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6e';
export const T0=new Date('2026-11-06T09:00:00.000Z');
export const seqIds=(stem='00000000-0000-4000-8000-')=>{let n=0;return ()=>`${stem}${(++n).toString(16).padStart(12,'0')}`;};
export const sha256=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export const syntheticPdf=(tag='synthetic')=>new TextEncoder().encode(`%PDF-1.7\n% ${tag}\n%%EOF\n`);

export interface MemoryCore extends CoreDeps{storage:MemoryBrokerStorage;clock:{t:number};advance(ms:number):void}
export function memoryCoreDeps(o:{tables?:TableClient;db?:BrokerResearchDb}={}):MemoryCore{
 const tables=o.tables??memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});
 const clock={t:T0.getTime()};const now=()=>new Date(clock.t);
 return {db:o.db??memoryBrokerResearchDb({tables,now}),storage:memoryBrokerStorage(),tables,now,codeVersion:'test-code',newId:seqIds(),clock,advance:(ms)=>{clock.t+=ms;}};
}
export const LICENCE_INPUT:LicenceInput={source_label:'Synthetic terminal',licence_kind:'terminal_subscription',holder:'Owner',terms_summary:'Synthetic test terms',
 evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,
 snippet_max_chars:300,valid_from:'2026-01-01',valid_to:null};
export async function seedLicence(db:BrokerResearchDb,o:{patch?:Partial<LicenceInput>;confirm?:boolean}={}):Promise<LicenceRow>{
 const row=await db.insertLicence({...LICENCE_INPUT,...o.patch});
 if(o.confirm!==false&&await db.confirmLicence(row.licence_id,ADMIN_ID,row.version)!=='confirmed')throw new Error('seed: licence not confirmed');
 return (await db.getLicence(row.licence_id))!;
}
/** A committed document (promotion done) whose PDF bytes sit at reports/{sha}.pdf. */
export async function seedDocument(d:MemoryCore,licenceId:string,bytes=syntheticPdf()):Promise<DocumentRow>{
 const sha=sha256(bytes),documentId=d.newId();
 if(await d.db.insertDocument({document_id:documentId,sha256:sha,storage_path:brokerPaths.report(sha),byte_size:bytes.byteLength,licence_id:licenceId,uploaded_by:ADMIN_ID,original_filename:'synthetic.pdf'})!=='inserted')throw new Error('seed: duplicate');
 await d.storage.upload(brokerPaths.report(sha),bytes,'application/pdf');
 await d.db.updateDocument(documentId,{promotion_pending:false});
 return (await d.db.getDocument(documentId))!;
}
```

- [ ] **Step 7: 运行 C1 全部测试**

Run: `npm test -- src/lib/broker-research/storage.test.ts src/lib/broker-research/admin-route.test.ts`
Expected: PASS。再跑 `npm run typecheck && npm run lint`，Expected: 0 error、0 warning。

- [ ] **Step 8: 提交**

```bash
git add src/lib/broker-research/errors.ts src/lib/broker-research/audit.ts src/lib/broker-research/storage.ts src/lib/broker-research/storage.test.ts src/lib/broker-research/deps.ts src/lib/broker-research/admin-route.ts src/lib/broker-research/admin-route.test.ts src/lib/broker-research/testing.ts src/lib/broker-research/route-testing.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C1 storage port, admin route helpers, test wiring"
```

---
### Task C2: 许可与设置服务 + 路由

**Files:**
- Create: `src/lib/broker-research/licences.ts`
- Create: `src/lib/broker-research/licences.test.ts`
- Create: `src/app/api/admin/broker-research/licences/route.ts`（GET 列表 / POST 新建）
- Create: `src/app/api/admin/broker-research/licences/[id]/route.ts`（GET 一条 / PATCH）
- Create: `src/app/api/admin/broker-research/licences/[id]/confirm/route.ts`（POST `{version}`）
- Create: `src/app/api/admin/broker-research/settings/public/route.ts`（POST `{enabled}`）
- Create: `src/app/api/admin/broker-research/licences/routes.test.ts`

- [ ] **Step 1: 写服务失败测试**

```ts
// src/lib/broker-research/licences.test.ts
import {describe,expect,it} from 'vitest';
import {ADMIN_ID,LICENCE_INPUT,memoryCoreDeps,seedLicence} from './testing';
import {confirmLicence,createLicence,licenceConfirmed,parseLicenceInput,patchLicence,processingAllowed,setPublicEnabled} from './licences';

describe('parseLicenceInput',()=>{
 it('accepts a full create body and defaults booleans to false',()=>{
  const {allows_llm_processing:_a,allows_public_metadata:_b,allows_public_snippets:_c,allows_public_summary:_d,allows_public_target_price:_e,...rest}=LICENCE_INPUT;
  const v=parseLicenceInput(rest as unknown as Record<string,unknown>,'create');
  expect(v).toMatchObject({allows_llm_processing:false,allows_public_target_price:false,snippet_max_chars:300,valid_to:null,evidence_path:null});
 });
 it.each([
  [{snippet_max_chars:501},'invalid_licence:snippet_max_chars'],[{snippet_max_chars:0},'invalid_licence:snippet_max_chars'],
  [{source_label:'x'.repeat(121)},'invalid_licence:source_label'],[{licence_kind:'pirate'},'invalid_licence:licence_kind'],
  [{valid_from:'2026-02-30'},'invalid_licence:valid_from'],[{valid_to:'2025-12-31'},'invalid_licence:valid_to'],
  [{evidence_path:'reports/x.pdf'},'invalid_licence:evidence_path'],[{unknown:1},'invalid_licence:unknown'],
 ])('rejects %o',(patch,code)=>{
  expect(()=>parseLicenceInput({...LICENCE_INPUT,...patch} as Record<string,unknown>,'create')).toThrow(expect.objectContaining({code,status:400}));
 });
 it('patch mode requires at least one key and checks only what is present',()=>{
  expect(()=>parseLicenceInput({},'patch')).toThrow(expect.objectContaining({code:'invalid_licence:empty'}));
  expect(parseLicenceInput({holder:'New holder'},'patch')).toEqual({holder:'New holder'});
 });
});

describe('licence services',()=>{
 it('create → confirm → material patch clears confirmation → reconfirm with the new version',async()=>{
  const d=memoryCoreDeps();
  const row=await createLicence(d,LICENCE_INPUT,ADMIN_ID);
  expect(licenceConfirmed(row,'2026-11-06')).toBe(false);
  await expect(confirmLicence(d,row.licence_id,row.version+1,ADMIN_ID)).rejects.toMatchObject({code:'version_mismatch',status:409,extra:{current_version:row.version}});
  const c=await confirmLicence(d,row.licence_id,row.version,ADMIN_ID);
  expect(licenceConfirmed(c,'2026-11-06')).toBe(true);expect(processingAllowed(c,'2026-11-06')).toBe(true);
  const p=await patchLicence(d,row.licence_id,{snippet_max_chars:100},ADMIN_ID);
  expect(p.material).toBe(true);expect(p.licence.version).toBe(row.version+1);expect(licenceConfirmed(p.licence,'2026-11-06')).toBe(false);
  const again=await confirmLicence(d,row.licence_id,p.licence.version,ADMIN_ID);expect(licenceConfirmed(again,'2026-11-06')).toBe(true);
  const audits=(d.tables as unknown as {rows(t:string):{action:string}[]}).rows('research_audit_log').map(r=>r.action);
  expect(audits).toEqual(['broker_research.licence_create','broker_research.licence_confirm','broker_research.licence_patch','broker_research.licence_confirm']);
 });
 it('validity window and the processing flag gate processing',async()=>{
  const d=memoryCoreDeps();
  const l=await seedLicence(d.db,{patch:{allows_llm_processing:false,valid_from:'2026-01-01',valid_to:'2026-06-30'}});
  expect(licenceConfirmed(l,'2026-06-30')).toBe(true);expect(licenceConfirmed(l,'2026-07-01')).toBe(false);
  expect(processingAllowed(l,'2026-03-01')).toBe(false);
 });
 it('patch of an unknown licence is 404; valid_to before valid_from (merged with stored) is 400',async()=>{
  const d=memoryCoreDeps();const l=await seedLicence(d.db);
  await expect(patchLicence(d,'00000000-0000-4000-8000-0000000000ff',{holder:'x'},ADMIN_ID)).rejects.toMatchObject({code:'licence_not_found',status:404});
  await expect(patchLicence(d,l.licence_id,{valid_to:'2025-01-01'},ADMIN_ID)).rejects.toMatchObject({code:'invalid_licence:valid_to'});
 });
 it('setPublicEnabled writes the flag and an audit row',async()=>{
  const d=memoryCoreDeps();
  expect((await setPublicEnabled(d,true,ADMIN_ID)).public_enabled).toBe(true);
  expect((await d.db.getSettings()).updated_by).toBe(ADMIN_ID);
 });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/broker-research/licences.test.ts`
Expected: FAIL（`Cannot find module './licences'`）。

- [ ] **Step 3: 实现 `licences.ts`**

```ts
// src/lib/broker-research/licences.ts
// Versioned licences and the public switch (spec §4.1, §8.2, D1–D3). Validation mirrors the table checks
// (source_label 1..120, snippet_max_chars 1..500, kinds, dates, evidence path licences/{sha}.pdf); version bump +
// confirmation reset on material change is the DB trigger's job (licence_material_change) — the service only reports
// whether it happened. licenceConfirmed/processingAllowed are the TS copies of the "当前已确认谓词" and
// "处理授权谓词" used by parse/extract/summary before any external processing (the SQL copies live in views/functions).
import {auditAdmin} from './audit';
import {bad,conflict,notFound} from './errors';
import type {CoreDeps} from './deps';
import type {LicenceInput,LicenceKind,LicenceRow,SettingsRow} from './types';

const KINDS:readonly LicenceKind[]=['terminal_subscription','direct_from_broker','owner_authored','other'];
const BOOLS=['allows_llm_processing','allows_public_metadata','allows_public_snippets','allows_public_summary','allows_public_target_price'] as const;
const KEYS=new Set<string>(['source_label','licence_kind','holder','terms_summary','evidence_path','snippet_max_chars','valid_from','valid_to',...BOOLS]);
export const SNIPPET_HARD_MAX=500;
const EVIDENCE_RE=/^licences\/[0-9a-f]{64}\.pdf$/;
export const isIsoDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const inv=(k:string)=>bad(`invalid_licence:${k}`);
const text=(v:unknown,k:string,max:number)=>{if(typeof v!=='string'||v.trim().length<1||v.length>max)throw inv(k);return v.trim();};

export function parseLicenceInput(body:Record<string,unknown>,mode:'create'):LicenceInput;
export function parseLicenceInput(body:Record<string,unknown>,mode:'patch'):Partial<LicenceInput>;
export function parseLicenceInput(body:Record<string,unknown>,mode:'create'|'patch'):Partial<LicenceInput>{
 for(const k of Object.keys(body))if(!KEYS.has(k))throw inv(k);
 if(mode==='patch'&&Object.keys(body).length===0)throw inv('empty');
 const has=(k:string)=>Object.prototype.hasOwnProperty.call(body,k);
 const need=(k:string)=>{if(mode==='create'&&!has(k))throw inv(k);return has(k);};
 const out:Partial<LicenceInput>={};
 if(need('source_label'))out.source_label=text(body.source_label,'source_label',120);
 if(need('licence_kind')){if(!KINDS.includes(body.licence_kind as LicenceKind))throw inv('licence_kind');out.licence_kind=body.licence_kind as LicenceKind;}
 if(need('holder'))out.holder=text(body.holder,'holder',200);
 if(need('terms_summary'))out.terms_summary=text(body.terms_summary,'terms_summary',4000);
 if(has('evidence_path')){const v=body.evidence_path;if(v!==null&&(typeof v!=='string'||!EVIDENCE_RE.test(v)))throw inv('evidence_path');out.evidence_path=v as string|null;}
 else if(mode==='create')out.evidence_path=null;
 for(const k of BOOLS){if(has(k)){if(typeof body[k]!=='boolean')throw inv(k);out[k]=body[k] as boolean;}else if(mode==='create')out[k]=false;}
 if(need('snippet_max_chars')){const v=body.snippet_max_chars;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>SNIPPET_HARD_MAX)throw inv('snippet_max_chars');out.snippet_max_chars=v;}
 if(need('valid_from')){if(!isIsoDate(body.valid_from))throw inv('valid_from');out.valid_from=body.valid_from;}
 if(has('valid_to')){const v=body.valid_to;if(v!==null&&!isIsoDate(v))throw inv('valid_to');out.valid_to=v as string|null;}
 else if(mode==='create')out.valid_to=null;
 if(out.valid_from&&out.valid_to&&out.valid_to<out.valid_from)throw inv('valid_to');
 return out;
}

export const utcToday=(now:Date)=>now.toISOString().slice(0,10);
/** 当前已确认谓词 (spec §4.1), evaluated at `today` (UTC date, same as the DB's current_date on a UTC instance). */
export const licenceConfirmed=(l:LicenceRow,today:string)=>l.confirmed_at!==null&&l.confirmed_version===l.version&&today>=l.valid_from&&(l.valid_to===null||today<=l.valid_to);
/** 处理授权谓词: confirmed AND allows_llm_processing — required before F3 / platform LLM see the text. */
export const processingAllowed=(l:LicenceRow,today:string)=>licenceConfirmed(l,today)&&l.allows_llm_processing;

type LicDeps=Pick<CoreDeps,'db'|'tables'|'now'>;
export async function listLicences(deps:Pick<CoreDeps,'db'>):Promise<{licences:LicenceRow[];settings:SettingsRow}>{
 const [licences,settings]=await Promise.all([deps.db.listLicences(),deps.db.getSettings()]);return {licences,settings};
}
export async function getLicenceOr404(deps:Pick<CoreDeps,'db'>,id:string):Promise<LicenceRow>{
 const l=await deps.db.getLicence(id);if(!l)throw notFound('licence_not_found');return l;
}
export async function createLicence(deps:LicDeps,input:LicenceInput,by:string):Promise<LicenceRow>{
 const row=await deps.db.insertLicence(input);
 await auditAdmin(deps.tables,by,'broker_research.licence_create',row.licence_id,{version:row.version},deps.now());
 return row;
}
export async function patchLicence(deps:LicDeps,id:string,patch:Partial<LicenceInput>,by:string):Promise<{licence:LicenceRow;material:boolean}>{
 const cur=await getLicenceOr404(deps,id);
 const from=patch.valid_from??cur.valid_from,to=patch.valid_to===undefined?cur.valid_to:patch.valid_to;
 if(to!==null&&to<from)throw inv('valid_to');
 const licence=await deps.db.updateLicence(id,patch);
 const material=licence.version!==cur.version;
 await auditAdmin(deps.tables,by,'broker_research.licence_patch',id,{keys:Object.keys(patch).sort(),from_version:cur.version,to_version:licence.version,material},deps.now());
 return {licence,material};
}
export async function confirmLicence(deps:LicDeps,id:string,version:number,by:string):Promise<LicenceRow>{
 const cur=await getLicenceOr404(deps,id);
 if(await deps.db.confirmLicence(id,by,version)==='version_mismatch')throw conflict('version_mismatch',{current_version:cur.version});
 await auditAdmin(deps.tables,by,'broker_research.licence_confirm',id,{version},deps.now());
 return getLicenceOr404(deps,id);
}
/** The switch only records who flipped it; the opening gates (D1, test:storage, gold receipt) are owner checks (spec §14 FR-6). */
export async function setPublicEnabled(deps:LicDeps,flag:boolean,by:string):Promise<SettingsRow>{
 await deps.db.setPublicEnabled(flag,by);
 await auditAdmin(deps.tables,by,'broker_research.public_switch',null,{enabled:flag},deps.now());
 return deps.db.getSettings();
}
```

- [ ] **Step 4: 运行服务测试**

Run: `npm test -- src/lib/broker-research/licences.test.ts`
Expected: PASS。

- [ ] **Step 5: 写路由失败测试**

```ts
// src/app/api/admin/broker-research/licences/routes.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ADMIN_ID,LICENCE_INPUT,memoryCoreDeps,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryCore} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',()=>({coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {GET as LIST,POST as CREATE} from './route';
import {GET as ONE,PATCH} from './[id]/route';
import {POST as CONFIRM} from './[id]/confirm/route';
import {POST as PUBLIC} from '../settings/public/route';

const BASE='/api/admin/broker-research/licences';
describe('licence routes',()=>{
 let d:MemoryCore;
 beforeEach(()=>{vi.clearAllMocks();d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 describe('POST licences',()=>{
  adminGuardCases({call:(r)=>CREATE(r,{}),request:()=>jsonReq(BASE,LICENCE_INPUT),requireAdmin:mocks.requireAdmin,post:true});
  it('201 creates; 400 on an invalid body',async()=>{
   const r=await CREATE(jsonReq(BASE,LICENCE_INPUT),{});expect(r.status).toBe(201);
   expect((await bodyOf<{licence:{version:number}}>(r)).licence.version).toBe(1);
   const bad=await CREATE(jsonReq(BASE,{...LICENCE_INPUT,snippet_max_chars:900}),{});
   expect(bad.status).toBe(400);expect(await errCode(bad)).toBe('invalid_licence:snippet_max_chars');
  });
 });
 describe('GET licences',()=>{
  adminGuardCases({call:(r)=>LIST(r,{}),request:()=>getReq(BASE),requireAdmin:mocks.requireAdmin,post:false});
  it('lists licences with the settings row, no-store',async()=>{
   await seedLicence(d.db);const r=await LIST(getReq(BASE),{});
   expect(r.headers.get('cache-control')).toBe('no-store');
   const b=await bodyOf<{licences:unknown[];settings:{public_enabled:boolean}}>(r);
   expect(b.licences).toHaveLength(1);expect(b.settings.public_enabled).toBe(false);
  });
 });
 describe('GET/PATCH licences/[id] and confirm',()=>{
  it('404 for an unknown id, 400 for a malformed id',async()=>{
   expect((await ONE(getReq(`${BASE}/x`),ctxOf({id:'x'}))).status).toBe(400);
   expect((await ONE(getReq(`${BASE}/00000000-0000-4000-8000-0000000000ff`),ctxOf({id:'00000000-0000-4000-8000-0000000000ff'}))).status).toBe(404);
  });
  it('PATCH reports material changes; confirm with a stale version is 409 version_mismatch',async()=>{
   const l=await seedLicence(d.db);const ctx=ctxOf({id:l.licence_id});
   const p=await PATCH(jsonReq(`${BASE}/${l.licence_id}`,{allows_public_target_price:false},{method:'PATCH'}),ctx);
   expect(p.status).toBe(200);expect(await bodyOf(p)).toMatchObject({material:true,licence:{version:l.version+1,confirmed_at:null}});
   const stale=await CONFIRM(jsonReq(`${BASE}/${l.licence_id}/confirm`,{version:l.version}),ctx);
   expect(stale.status).toBe(409);expect(await errCode(stale)).toBe('version_mismatch');
   const ok=await CONFIRM(jsonReq(`${BASE}/${l.licence_id}/confirm`,{version:l.version+1}),ctx);
   expect(ok.status).toBe(200);
  });
  it('PATCH and confirm enforce 415 and origin',async()=>{
   const l=await seedLicence(d.db);const ctx=ctxOf({id:l.licence_id});
   const t=await PATCH(new Request(`https://alpha.example${BASE}/${l.licence_id}`,{method:'PATCH',headers:{'content-type':'text/plain'},body:'{}'}),ctx);
   expect(t.status).toBe(415);
   const o=await CONFIRM(jsonReq(`${BASE}/${l.licence_id}/confirm`,{version:1},{headers:{origin:'https://evil.example'}}),ctx);
   expect(o.status).toBe(403);
  });
 });
 describe('POST settings/public',()=>{
  adminGuardCases({call:(r)=>PUBLIC(r,{}),request:()=>jsonReq('/api/admin/broker-research/settings/public',{enabled:true}),requireAdmin:mocks.requireAdmin,post:true});
  it('flips the switch; non-boolean is 400',async()=>{
   const r=await PUBLIC(jsonReq('/api/admin/broker-research/settings/public',{enabled:true}),{});
   expect(r.status).toBe(200);expect((await bodyOf<{settings:{public_enabled:boolean}}>(r)).settings.public_enabled).toBe(true);
   expect((await PUBLIC(jsonReq('/api/admin/broker-research/settings/public',{enabled:'yes'}),{})).status).toBe(400);
  });
 });
});
```

- [ ] **Step 6: 实现四个路由**

```ts
// src/app/api/admin/broker-research/licences/route.ts
// GET: licences + settings; POST: create a licence (spec §8.2). Thin: parse → licences.ts → error mapping.
import {adminGet,adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {createLicence,listLicences,parseLicenceInput} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
export const GET=adminGet<unknown>('licences.list',async()=>jsonNoStore(await listLicences(coreDeps())));
export const POST=adminPost<unknown>('licences.create',async({body,userId})=>
 jsonNoStore({licence:await createLicence(coreDeps(),parseLicenceInput(body,'create'),userId)},201));
```

```ts
// src/app/api/admin/broker-research/licences/[id]/route.ts
// GET one licence; PATCH (material changes bump the version and clear the confirmation in the DB trigger, spec §4.1).
import {adminGet,adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {getLicenceOr404,parseLicenceInput,patchLicence} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const GET=adminGet<Ctx>('licences.get',async({ctx})=>jsonNoStore({licence:await getLicenceOr404(coreDeps(),uuidParam((await ctx.params).id))}));
export const PATCH=adminPost<Ctx>('licences.patch',async({ctx,body,userId})=>{
 const id=uuidParam((await ctx.params).id);
 return jsonNoStore(await patchLicence(coreDeps(),id,parseLicenceInput(body,'patch'),userId));
});
```

```ts
// src/app/api/admin/broker-research/licences/[id]/confirm/route.ts
// POST {version}: owner confirmation of exactly that version (409 version_mismatch otherwise; spec §4.1, §8.2).
import {adminPost,intField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {confirmLicence} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('licences.confirm',async({ctx,body,userId})=>
 jsonNoStore({licence:await confirmLicence(coreDeps(),uuidParam((await ctx.params).id),intField(body,'version',1,1_000_000),userId)}));
```

```ts
// src/app/api/admin/broker-research/settings/public/route.ts
// POST {enabled}: the database-level public switch (spec §4.1, §8.2); audited; gates are owner checks (FR-6).
import {adminPost,boolField,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {setPublicEnabled} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
export const POST=adminPost<unknown>('settings.public',async({body,userId})=>jsonNoStore({settings:await setPublicEnabled(coreDeps(),boolField(body,'enabled'),userId)}));
```


- [ ] **Step 7: 运行**

Run: `npm test -- src/lib/broker-research/licences.test.ts src/app/api/admin/broker-research/licences`
Expected: PASS。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 8: 提交**

```bash
git add src/lib/broker-research/licences.ts src/lib/broker-research/licences.test.ts src/app/api/admin/broker-research/licences src/app/api/admin/broker-research/settings docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C2 versioned licences, confirmation, public switch routes"
```

---
### Task C3: 上传意向 / 提交状态机（含 promotion_lost 恢复）+ 孤儿清理 + ★ 签名读 URL

**Files:**
- Create: `src/lib/broker-research/upload.ts`
- Create: `src/lib/broker-research/upload.test.ts`
- Create: `src/app/api/admin/broker-research/documents/intent/route.ts`
- Create: `src/app/api/admin/broker-research/documents/commit/route.ts`
- Create: `src/app/api/admin/broker-research/documents/orphan-cleanup/route.ts`
- Create: `src/app/api/admin/broker-research/documents/[id]/url/route.ts`（★）
- Create: `src/app/api/admin/broker-research/documents/upload-routes.test.ts`

**状态机（规格 §6.1；每步是持久检查点，重试从当前状态续作）：**

| 意向状态 | 动作 | 结果 |
|---|---|---|
| `open` | 过期 → CAS `open→expired`，`409 intent_mismatch{reason:'expired'}`；CAS `open→validating`（失败 `409 intent_busy`） | 进入校验 |
| `validating` | `checkpoint_at` 距今 < 60 s → `409 intent_busy`；否则（崩溃残留）接管重做校验（只读，可重入） | 下载暂存对象：不存在 → CAS 回 `open`、`409 intent_not_uploaded`；sha/大小/`%PDF-` 不符 → 删暂存、CAS `→abandoned{error_code}`、`422 sha_mismatch\|size_mismatch\|not_pdf`；相符 → CAS `→validated` |
| `validated` | CAS `validated→promoting{document_id}`（失败 `409 intent_busy`）；`document_id` = 替换意向预填的既有 id，否则 **= intent_id**（确定性：崩溃后重试能认出"自己插入的那行"） | 进入提升 |
| `promoting` | 可重入：文档行不存在 → `insertDocument`；`duplicate` 且已存在行不是自己 → 删暂存、`→abandoned{duplicate_document}`、`409 duplicate_document{documentId}`；文档已被他人撤回（原因 ≠ `promotion_lost`）→ `→abandoned`、`410`；`move(staging→reports/{sha}.pdf)`：`moved` / `target_exists`（删暂存）/ `missing` 且正式对象存在 = 完成；`missing` 且正式对象不存在 → 文档 `withdrawn(promotion_lost)`、`→abandoned{promotion_lost}`、`500 promotion_lost`；完成 → 替换意向：文档 `uploaded` + 清 `withdrawn_*`；否则 `promotion_pending=false`；写 `upload` 访问日志 + 审计；CAS `→committed` | `200 {documentId}` |
| `committed` | — | `200 {documentId}` |
| `abandoned` | 按 `error_code` 复现原答复：`duplicate_document` → 409（带 id）、`promotion_lost` → 500、其余 `409 intent_mismatch` | — |
| `expired` | — | `409 intent_mismatch{reason:'expired'}` |

`createIntent`：许可不存在 → 404；`byte_size > 50 MiB` → `413 file_too_large`；sha 已有文档：其 `withdrawn_reason='promotion_lost'` 且许可相同 → **替换意向**（`document_id` 预填，返回 `replacesDocumentId`）；许可不同 → `409 intent_mismatch{reason:'licence'}`；其余 → `409 duplicate_document{documentId}`。

- [ ] **Step 1: 写服务失败测试**

```ts
// src/lib/broker-research/upload.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {brokerPaths} from './storage';
import {ADMIN_ID,OTHER_ADMIN,memoryCoreDeps,seedLicence,sha256,syntheticPdf} from './testing';
import type {MemoryCore} from './testing';
import {INTENT_TTL_MS,commitIntent,createIntent,orphanCleanup,signedReadUrl} from './upload';
import type {LicenceRow} from './types';

const pdf=syntheticPdf('upload');
const input=(l:LicenceRow,bytes=pdf)=>({sha256:sha256(bytes),byte_size:bytes.byteLength,licence_id:l.licence_id,original_filename:'r.pdf'});
describe('upload state machine',()=>{
 let d:MemoryCore,l:LicenceRow;
 beforeEach(async()=>{d=memoryCoreDeps();l=await seedLicence(d.db);});
 const upload=async(bytes=pdf)=>{const i=await createIntent(d,input(l,bytes),ADMIN_ID);expect(d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,bytes)).toBe('stored');return i;};

 it('happy path: intent → direct upload → commit; retry returns the same document; one object, one log row',async()=>{
  const i=await upload();
  const c=await commitIntent(d,i.intentId,ADMIN_ID);
  expect(c).toEqual({documentId:i.intentId,status:'committed'});
  expect(await commitIntent(d,i.intentId,ADMIN_ID)).toEqual(c);
  const doc=(await d.db.getDocument(c.documentId))!;
  expect(doc).toMatchObject({status:'uploaded',promotion_pending:false,storage_path:brokerPaths.report(sha256(pdf))});
  expect([...d.storage.objects.keys()]).toEqual([brokerPaths.report(sha256(pdf))]);
  expect((await d.db.listAccessLog({limit:10})).map(r=>r.action)).toEqual(['upload']);
 });
 it('second upload of the same bytes is 409 duplicate_document with the id (spec §14 sample 1)',async()=>{
  const c=await commitIntent(d,(await upload()).intentId,ADMIN_ID);
  await expect(createIntent(d,input(l),ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document',status:409,extra:{documentId:c.documentId}});
 });
 it('a race: two intents for the same bytes, the loser is abandoned with duplicate_document and its staging object is removed',async()=>{
  const a=await upload(),b=await upload();
  const ca=await commitIntent(d,a.intentId,ADMIN_ID);
  await expect(commitIntent(d,b.intentId,ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document',extra:{documentId:ca.documentId}});
  expect(await d.storage.exists(brokerPaths.staging(b.intentId))).toBe(false);
  await expect(commitIntent(d,b.intentId,ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document'});
  expect((await d.db.getIntent(b.intentId))!.status).toBe('abandoned');
 });
 it.each([
  ['sha_mismatch',(b:Uint8Array)=>{const x=new Uint8Array(b);x[x.length-1]^=1;return x;}],
  ['size_mismatch',(b:Uint8Array)=>new Uint8Array([...b,10])],
  ['not_pdf',()=>new TextEncoder().encode('hello')],
 ])('422 %s deletes the staging object and abandons the intent',async(code,mutate)=>{
  const bytes=code==='not_pdf'?new TextEncoder().encode('hello'):pdf;
  const i=await createIntent(d,input(l,bytes),ADMIN_ID);
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,mutate(bytes));
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code,status:422});
  expect(await d.storage.exists(brokerPaths.staging(i.intentId))).toBe(false);
  expect((await d.db.getIntent(i.intentId))!).toMatchObject({status:'abandoned',error_code:code});
 });
 it('commit before the browser upload is 409 intent_not_uploaded and the intent goes back to open',async()=>{
  const i=await createIntent(d,input(l),ADMIN_ID);
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'intent_not_uploaded',status:409});
  expect((await d.db.getIntent(i.intentId))!.status).toBe('open');
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,pdf);
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
 });
 it('another admin, an expired intent and a fresh concurrent validation are rejected',async()=>{
  const i=await upload();
  await expect(commitIntent(d,i.intentId,OTHER_ADMIN)).rejects.toMatchObject({code:'intent_mismatch',status:409});
  expect(await d.db.transitionIntent(i.intentId,'open','validating')).toBe(true);
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'intent_busy'});
  d.advance(61_000);   // a validating checkpoint older than 60 s is a crashed validation: taken over
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
  const j=await upload(syntheticPdf('late'));d.advance(INTENT_TTL_MS+1);
  await expect(commitIntent(d,j.intentId,ADMIN_ID)).rejects.toMatchObject({code:'intent_mismatch',extra:{reason:'expired'}});
  expect((await d.db.getIntent(j.intentId))!.status).toBe('expired');
 });
 it('crash after promoting (doc inserted, object not moved) resumes on retry',async()=>{
  const i=await upload();
  d.storage.failNext('move','crash');
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'storage_failed'});
  expect((await d.db.getIntent(i.intentId))!.status).toBe('promoting');
  expect((await d.db.getDocument(i.intentId))!.promotion_pending).toBe(true);
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
 });
 it('crash after move (staging gone, report present) counts as promoted',async()=>{
  const i=await upload();
  await d.db.transitionIntent(i.intentId,'open','validating');await d.db.transitionIntent(i.intentId,'validating','validated');
  await d.db.transitionIntent(i.intentId,'validated','promoting',{document_id:i.intentId});
  await d.db.insertDocument({document_id:i.intentId,sha256:sha256(pdf),storage_path:brokerPaths.report(sha256(pdf)),byte_size:pdf.byteLength,licence_id:l.licence_id,uploaded_by:ADMIN_ID,original_filename:'r.pdf'});
  await d.storage.move(brokerPaths.staging(i.intentId),brokerPaths.report(sha256(pdf)));
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
  expect((await d.db.getDocument(i.intentId))!.promotion_pending).toBe(false);
 });
 it('promotion_lost: both objects gone → 500, document withdrawn; a replacement intent restores the same document',async()=>{
  const i=await upload();
  await d.db.transitionIntent(i.intentId,'open','validating');await d.db.transitionIntent(i.intentId,'validating','validated');
  await d.storage.remove([brokerPaths.staging(i.intentId)]);
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'promotion_lost',status:500});
  expect((await d.db.getDocument(i.intentId))!).toMatchObject({status:'withdrawn',withdrawn_reason:'promotion_lost'});
  await expect(signedReadUrl(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({status:410});
  const r=await createIntent(d,input(l),ADMIN_ID);
  expect(r.replacesDocumentId).toBe(i.intentId);
  d.storage.putSigned(brokerPaths.staging(r.intentId),r.token,pdf);
  expect(await commitIntent(d,r.intentId,ADMIN_ID)).toEqual({documentId:i.intentId,status:'committed'});
  expect((await d.db.getDocument(i.intentId))!).toMatchObject({status:'uploaded',withdrawn_at:null,withdrawn_reason:null,promotion_pending:false});
 });
 it('createIntent rejects unknown licences and oversize files',async()=>{
  await expect(createIntent(d,{...input(l),licence_id:'00000000-0000-4000-8000-0000000000ff'},ADMIN_ID)).rejects.toMatchObject({code:'licence_not_found',status:404});
  await expect(createIntent(d,{...input(l),byte_size:52428801},ADMIN_ID)).rejects.toMatchObject({code:'file_too_large',status:413});
 });
 it('orphanCleanup removes only staging objects of expired/abandoned intents and never reports/',async()=>{
  const keep=await upload(syntheticPdf('keep'));const old=await upload(syntheticPdf('old'));
  const done=await upload(syntheticPdf('done'));await commitIntent(d,done.intentId,ADMIN_ID);
  d.advance(INTENT_TTL_MS+1);
  const fresh=await upload(syntheticPdf('fresh'));
  const r=await orphanCleanup(d,ADMIN_ID);
  expect(r.removed.sort()).toEqual([brokerPaths.staging(keep.intentId),brokerPaths.staging(old.intentId)].sort());
  expect(await d.storage.exists(brokerPaths.staging(fresh.intentId))).toBe(true);
  expect(await d.storage.exists(brokerPaths.report(sha256(syntheticPdf('done'))))).toBe(true);
  expect((await d.db.listAccessLog({limit:10})).some(x=>x.action==='orphan_cleanup')).toBe(true);
 });
 it('signedReadUrl: 404 / 409 promotion_pending / payload + log row',async()=>{
  await expect(signedReadUrl(d,'00000000-0000-4000-8000-0000000000ff',ADMIN_ID)).rejects.toMatchObject({status:404});
  const i=await upload();d.storage.failNext('move','crash');await commitIntent(d,i.intentId,ADMIN_ID).catch(()=>undefined);
  await expect(signedReadUrl(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'promotion_pending',status:409});
  await commitIntent(d,i.intentId,ADMIN_ID);
  const s=await signedReadUrl(d,i.intentId,ADMIN_ID);
  expect(s.payload).toMatchObject({expiresIn:600});expect(s.log).toMatchObject({action:'signed_url_issued',document_id:i.intentId});
 });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- src/lib/broker-research/upload.test.ts`
Expected: FAIL（`Cannot find module './upload'`）。

- [ ] **Step 3: 实现 `upload.ts`**

```ts
// src/lib/broker-research/upload.ts
// Upload intent → staging → commit (spec §6.1, §13). The commit is a state machine over broker_report_upload_intents
// whose every step is a durable checkpoint (transitionIntent = CAS + checkpoint_at), so a retry of the same intent
// resumes where the previous call stopped. document_id = intent_id (or the pre-filled id of a promotion_lost
// replacement intent), which makes "the row I inserted before crashing" recognisable. promotion_lost recovery follows
// FR4-01: a replacement intent bound to the existing document; the document stays withdrawn and unreachable until the
// replacement is validated and promoted. Orphan cleanup only touches staging/ objects of expired/abandoned intents.
import {createHash} from 'node:crypto';
import {auditAdmin} from './audit';
import {BrokerError,bad,conflict,gone,notFound} from './errors';
import {MAX_OBJECT_BYTES,SIGNED_READ_SECONDS,brokerPaths} from './storage';
import type {CoreDeps} from './deps';
import type {AccessLogInput,DocumentRow,IntentRow} from './types';

export const INTENT_TTL_MS=2*3600_000;
export const VALIDATING_STALE_MS=60_000;
type UploadDeps=Pick<CoreDeps,'db'|'storage'|'tables'|'now'|'newId'>;
export interface IntentInput{sha256:string;byte_size:number;licence_id:string;original_filename:string}
const SHA_RE=/^[0-9a-f]{64}$/,UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseIntentInput(b:Record<string,unknown>):IntentInput{
 const inv=(k:string)=>bad(`invalid_parameter:${k}`);
 if(typeof b.sha256!=='string'||!SHA_RE.test(b.sha256))throw inv('sha256');
 if(typeof b.byte_size!=='number'||!Number.isSafeInteger(b.byte_size)||b.byte_size<1)throw inv('byte_size');
 if(typeof b.licence_id!=='string'||!UUID_RE.test(b.licence_id))throw inv('licence_id');
 if(typeof b.original_filename!=='string'||b.original_filename.trim().length<1||b.original_filename.length>255)throw inv('original_filename');
 return {sha256:b.sha256,byte_size:b.byte_size,licence_id:b.licence_id.toLowerCase(),original_filename:b.original_filename.trim()};
}

export async function createIntent(deps:UploadDeps,input:IntentInput,by:string):Promise<{intentId:string;uploadUrl:string;token:string;expiresAt:string;replacesDocumentId:string|null}>{
 if(!await deps.db.getLicence(input.licence_id))throw notFound('licence_not_found');
 if(input.byte_size>MAX_OBJECT_BYTES)throw new BrokerError('file_too_large',413);
 const existing=await deps.db.findDocumentBySha(input.sha256);
 let replaces:string|null=null;
 if(existing){
  if(existing.status!=='withdrawn'||existing.withdrawn_reason!=='promotion_lost')throw conflict('duplicate_document',{documentId:existing.document_id});
  if(existing.licence_id!==input.licence_id)throw conflict('intent_mismatch',{reason:'licence'});
  replaces=existing.document_id;
 }
 const intentId=deps.newId(),expiresAt=new Date(deps.now().getTime()+INTENT_TTL_MS).toISOString();
 await deps.db.insertIntent({intent_id:intentId,sha256:input.sha256,byte_size:input.byte_size,licence_id:input.licence_id,original_filename:input.original_filename,
  created_by:by,expires_at:expiresAt,status:'open',staging_path:brokerPaths.staging(intentId),document_id:replaces});
 const {url,token}=await deps.storage.createSignedUploadUrl(brokerPaths.staging(intentId));
 return {intentId,uploadUrl:url,token,expiresAt,replacesDocumentId:replaces};
}

const reload=async(deps:UploadDeps,id:string)=>{const i=await deps.db.getIntent(id);if(!i)throw notFound('intent_not_found');return i;};
const busy=()=>conflict('intent_busy');

/** Validation of the staged bytes; returns the abandon code or null (ok). Read-only, so a takeover can re-run it. */
async function validate(deps:UploadDeps,i:IntentRow):Promise<'missing'|'sha_mismatch'|'size_mismatch'|'not_pdf'|null>{
 const bytes=await deps.storage.download(i.staging_path);
 if(bytes===null)return 'missing';
 if(bytes.byteLength!==i.byte_size)return 'size_mismatch';
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return 'not_pdf';
 if(createHash('sha256').update(bytes).digest('hex')!==i.sha256)return 'sha_mismatch';
 return null;
}
async function abandon(deps:UploadDeps,i:IntentRow,from:IntentRow['status'],code:string):Promise<void>{
 await deps.storage.remove([i.staging_path]);
 await deps.db.transitionIntent(i.intent_id,from,'abandoned',{error_code:code});
}
function replay(i:IntentRow,dupId?:string):never{
 if(i.status==='expired')throw conflict('intent_mismatch',{reason:'expired'});
 if(i.error_code==='duplicate_document')throw conflict('duplicate_document',dupId?{documentId:dupId}:{});
 if(i.error_code==='promotion_lost')throw new BrokerError('promotion_lost',500);
 if(i.error_code==='sha_mismatch'||i.error_code==='size_mismatch'||i.error_code==='not_pdf')throw new BrokerError(i.error_code,422);
 throw conflict('intent_mismatch',{reason:i.error_code??i.status});
}

export async function commitIntent(deps:UploadDeps,intentId:string,by:string):Promise<{documentId:string;status:'committed'}>{
 let i=await reload(deps,intentId);
 if(i.created_by!==by)throw conflict('intent_mismatch',{reason:'owner'});
 for(let step=0;step<8;step++){
  switch(i.status){
   case 'committed':return {documentId:i.document_id!,status:'committed'};
   case 'expired':case 'abandoned':{const dup=i.error_code==='duplicate_document'?await deps.db.findDocumentBySha(i.sha256):null;return replay(i,dup?.document_id);}
   case 'open':{
    if(deps.now().getTime()>Date.parse(i.expires_at)){await deps.db.transitionIntent(intentId,'open','expired');throw conflict('intent_mismatch',{reason:'expired'});}
    if(!await deps.db.transitionIntent(intentId,'open','validating'))throw busy();
    i=await reload(deps,intentId);break;
   }
   case 'validating':{
    // Fresh checkpoint = another call is validating right now; stale = that call crashed, take over (validation is read-only).
    if(step===0&&i.checkpoint_at!==null&&deps.now().getTime()-Date.parse(i.checkpoint_at)<VALIDATING_STALE_MS)throw busy();
    const v=await validate(deps,i);
    if(v==='missing'){await deps.db.transitionIntent(intentId,'validating','open');throw conflict('intent_not_uploaded');}
    if(v!==null){await abandon(deps,i,'validating',v);throw new BrokerError(v,422);}
    if(!await deps.db.transitionIntent(intentId,'validating','validated'))throw busy();
    i=await reload(deps,intentId);break;
   }
   case 'validated':{
    if(!await deps.db.transitionIntent(intentId,'validated','promoting',{document_id:i.document_id??intentId}))throw busy();
    i=await reload(deps,intentId);break;
   }
   case 'promoting':{await promote(deps,i,by);i=await reload(deps,intentId);break;}
  }
 }
 throw busy();
}

/** Re-entrant: two concurrent calls converge (insert is idempotent by document id, move answers missing/target_exists). */
async function promote(deps:UploadDeps,i:IntentRow,by:string):Promise<void>{
 const docId=i.document_id!,reportPath=brokerPaths.report(i.sha256);
 let doc=await deps.db.getDocument(docId);
 if(!doc){
  const r=await deps.db.insertDocument({document_id:docId,sha256:i.sha256,storage_path:reportPath,byte_size:i.byte_size,licence_id:i.licence_id,uploaded_by:i.created_by,original_filename:i.original_filename});
  if(r==='duplicate'){
   const other=await deps.db.findDocumentBySha(i.sha256);
   if(other&&other.document_id!==docId){await abandon(deps,i,'promoting','duplicate_document');throw conflict('duplicate_document',{documentId:other.document_id});}
  }
  doc=await deps.db.getDocument(docId);
  if(!doc)throw new BrokerError('document_insert_lost',500);
 }
 const replacement=doc.status==='withdrawn'&&doc.withdrawn_reason==='promotion_lost';
 if(doc.status==='withdrawn'&&!replacement){await deps.db.transitionIntent(i.intent_id,'promoting','abandoned',{error_code:'document_withdrawn'});throw gone();}
 const m=await deps.storage.move(i.staging_path,reportPath);
 if(m==='target_exists')await deps.storage.remove([i.staging_path]);
 if(m==='missing'&&!await deps.storage.exists(reportPath)){
  if(!replacement)await deps.db.updateDocument(docId,{status:'withdrawn',withdrawn_at:deps.now().toISOString(),withdrawn_reason:'promotion_lost'});
  await deps.db.transitionIntent(i.intent_id,'promoting','abandoned',{error_code:'promotion_lost'});
  throw new BrokerError('promotion_lost',500);
 }
 if(replacement)await deps.db.updateDocument(docId,{status:'uploaded',withdrawn_at:null,withdrawn_reason:null,promotion_pending:false});
 else if(doc.promotion_pending)await deps.db.updateDocument(docId,{promotion_pending:false});
 const fresh=await deps.db.getIntent(i.intent_id);
 if(fresh?.status!=='promoting')return;   // a concurrent call finished first
 await deps.db.logAccess({document_id:docId,user_id:by,action:'upload',detail:{intent_id:i.intent_id,sha256:i.sha256,byte_size:i.byte_size,replacement}});
 await deps.db.transitionIntent(i.intent_id,'promoting','committed');
 await auditAdmin(deps.tables,by,'broker_research.upload',docId,{intent_id:i.intent_id,replacement},deps.now());
}

export async function orphanCleanup(deps:UploadDeps,by:string):Promise<{removed:string[];kept:number}>{
 const removed:string[]=[];let kept=0;
 for(const path of await deps.storage.list('staging/')){
  const id=/^staging\/([0-9a-f-]{36})\.pdf$/.exec(path)?.[1];const i=id?await deps.db.getIntent(id):null;
  if(!i){kept++;continue;}   // never delete an object we cannot attribute
  let status=i.status;
  if(status==='open'&&deps.now().getTime()>Date.parse(i.expires_at)&&await deps.db.transitionIntent(i.intent_id,'open','expired'))status='expired';
  if(status==='expired'||status==='abandoned'){await deps.storage.remove([path]);removed.push(path);}else kept++;
 }
 await deps.db.logAccess({document_id:null,user_id:by,action:'orphan_cleanup',detail:{removed:removed.length,kept}});
 return {removed,kept};
}

/** Precondition shared by every ★ / processing entry point on a document. */
export async function documentForAccess(deps:Pick<CoreDeps,'db'>,documentId:string):Promise<DocumentRow>{
 const doc=await deps.db.getDocument(documentId);
 if(!doc)throw notFound('document_not_found');
 if(doc.status==='withdrawn')throw gone();
 if(doc.promotion_pending)throw conflict('promotion_pending');
 return doc;
}
export async function signedReadUrl(deps:UploadDeps,documentId:string,by:string):Promise<{payload:{url:string;expiresIn:number};log:AccessLogInput}>{
 const doc=await documentForAccess(deps,documentId);
 const url=await deps.storage.createSignedUrl(doc.storage_path,SIGNED_READ_SECONDS);
 return {payload:{url,expiresIn:SIGNED_READ_SECONDS},log:{document_id:documentId,user_id:by,action:'signed_url_issued',detail:{expires_in:SIGNED_READ_SECONDS}}};
}
```

- [ ] **Step 4: 运行服务测试**

Run: `npm test -- src/lib/broker-research/upload.test.ts`
Expected: PASS。

- [ ] **Step 5: 写路由失败测试**

```ts
// src/app/api/admin/broker-research/documents/upload-routes.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {brokerPaths} from '@/lib/broker-research/storage';
import {ADMIN_ID,memoryCoreDeps,seedDocument,seedLicence,sha256,syntheticPdf} from '@/lib/broker-research/testing';
import type {MemoryCore} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',()=>({coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST as INTENT} from './intent/route';
import {POST as COMMIT} from './commit/route';
import {POST as CLEANUP} from './orphan-cleanup/route';
import {GET as URL_} from './[id]/url/route';

const B='/api/admin/broker-research/documents';
describe('upload routes',()=>{
 let d:MemoryCore;
 beforeEach(()=>{vi.clearAllMocks();d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 const pdf=syntheticPdf('route');
 const intentBody=(licence_id:string)=>({sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id,original_filename:'r.pdf'});
 adminGuardCases({call:(r)=>INTENT(r,{}),request:()=>jsonReq(`${B}/intent`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>COMMIT(r,{}),request:()=>jsonReq(`${B}/commit`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>CLEANUP(r,{}),request:()=>jsonReq(`${B}/orphan-cleanup`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>URL_(r,ctxOf({id:'00000000-0000-4000-8000-000000000001'})),request:()=>getReq(`${B}/x/url`),requireAdmin:mocks.requireAdmin,post:false});

 it('intent → commit → 409 duplicate_document on the second intent',async()=>{
  const l=await seedLicence(d.db);
  const r=await INTENT(jsonReq(`${B}/intent`,intentBody(l.licence_id)),{});
  expect(r.status).toBe(201);const i=await bodyOf<{intentId:string;token:string;uploadUrl:string}>(r);
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,pdf);
  const c=await COMMIT(jsonReq(`${B}/commit`,{intentId:i.intentId}),{});
  expect(c.status).toBe(200);expect(await bodyOf(c)).toEqual({documentId:i.intentId,status:'committed'});
  const dup=await INTENT(jsonReq(`${B}/intent`,intentBody(l.licence_id)),{});
  expect(dup.status).toBe(409);expect(await bodyOf(dup)).toMatchObject({error:{code:'duplicate_document',documentId:i.intentId}});
 });
 it('400 for a malformed intent body; 422 not_pdf on commit',async()=>{
  const l=await seedLicence(d.db);
  expect((await INTENT(jsonReq(`${B}/intent`,{...intentBody(l.licence_id),sha256:'xyz'}),{})).status).toBe(400);
  const txt=new TextEncoder().encode('hello');
  const i=await bodyOf<{intentId:string;token:string}>(await INTENT(jsonReq(`${B}/intent`,{sha256:sha256(txt),byte_size:txt.byteLength,licence_id:l.licence_id,original_filename:'x.pdf'}),{}));
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,txt);
  const c=await COMMIT(jsonReq(`${B}/commit`,{intentId:i.intentId}),{});
  expect(c.status).toBe(422);expect(await errCode(c)).toBe('not_pdf');
 });
 it('★ url: logs then returns no-store; 410 for withdrawn; 500 access_log_failed without the URL',async()=>{
  const l=await seedLicence(d.db);const doc=await seedDocument(d,l.licence_id);const ctx=ctxOf({id:doc.document_id});
  const ok=await URL_(getReq(`${B}/${doc.document_id}/url`),ctx);
  expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('no-store');
  expect((await bodyOf<{url:string}>(ok)).url).toContain(doc.storage_path);
  expect((await d.db.listAccessLog({documentId:doc.document_id,limit:5})).map(r=>r.action)).toEqual(['signed_url_issued']);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.spyOn(d.db,'logAccess').mockRejectedValueOnce(new Error('log down'));
  const failed=await URL_(getReq(`${B}/${doc.document_id}/url`),ctx);
  expect(failed.status).toBe(500);const t=await failed.text();expect(t).toContain('access_log_failed');expect(t).not.toContain('memory://');
  spy.mockRestore();
  await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'test'});
  const w=await URL_(getReq(`${B}/${doc.document_id}/url`),ctx);
  expect(w.status).toBe(410);expect(await errCode(w)).toBe('document_withdrawn');
 });
 it('orphan cleanup answers the counts',async()=>{
  const r=await CLEANUP(jsonReq(`${B}/orphan-cleanup`,{}),{});
  expect(r.status).toBe(200);expect(await bodyOf(r)).toEqual({removed:[],kept:0});
 });
});
```

- [ ] **Step 6: 实现四个路由**

```ts
// src/app/api/admin/broker-research/documents/intent/route.ts
// POST {sha256, byte_size, licence_id, original_filename} → signed upload URL for staging/{intent_id}.pdf (spec §6.1 step 1).
import {adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {createIntent,parseIntentInput} from '@/lib/broker-research/upload';

export const dynamic='force-dynamic';
export const POST=adminPost<unknown>('documents.intent',async({body,userId})=>jsonNoStore(await createIntent(coreDeps(),parseIntentInput(body),userId),201));
```

```ts
// src/app/api/admin/broker-research/documents/commit/route.ts
// POST {intentId}: resumable commit state machine (spec §6.1 step 3). Downloads ≤ 50 MiB to re-hash (spec §16 Q8).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {commitIntent} from '@/lib/broker-research/upload';

export const dynamic='force-dynamic';
export const maxDuration=300;
export const POST=adminPost<unknown>('documents.commit',async({body,userId})=>jsonNoStore(await commitIntent(coreDeps(),uuidParam(body.intentId,'intentId'),userId)));
```

```ts
// src/app/api/admin/broker-research/documents/orphan-cleanup/route.ts
// POST {}: delete staging/ objects of expired/abandoned intents only (spec §6.1 step 4); logged as orphan_cleanup.
import {adminPost,jsonNoStore} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {orphanCleanup} from '@/lib/broker-research/upload';

export const dynamic='force-dynamic';
export const POST=adminPost<unknown>('documents.orphan_cleanup',async({userId})=>jsonNoStore(await orphanCleanup(coreDeps(),userId)));
```

```ts
// src/app/api/admin/broker-research/documents/[id]/url/route.ts
// ★ GET: 600 s signed read URL for the private PDF (spec §8.2). Withdrawn → 410 before anything is issued; the
// signed_url_issued row is written before the URL leaves the server; a log failure answers 500 with no URL.
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {signedReadUrl} from '@/lib/broker-research/upload';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const GET=adminGet<Ctx>('documents.url',async({ctx,userId})=>{
 const deps=coreDeps();const {payload,log}=await signedReadUrl(deps,uuidParam((await ctx.params).id),userId);
 return respondLogged(deps.db,log,payload);
});
```

- [ ] **Step 7: 运行**

Run: `npm test -- src/lib/broker-research/upload.test.ts src/app/api/admin/broker-research/documents`
Expected: PASS。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 8: 提交**

```bash
git add src/lib/broker-research/upload.ts src/lib/broker-research/upload.test.ts src/app/api/admin/broker-research/documents docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C3 resumable upload commit, promotion_lost recovery, orphan cleanup, signed URL"
```

---
### Task C4: F3 / LLM 端口（伪实现 + 录制 + 关闭的生产适配器）、解析服务与路由

**Files:**
- Create: `src/lib/broker-research/ports/f3.ts`（若 A4 已建接口桩，整文件替换；接口文本不变）
- Create: `src/lib/broker-research/ports/llm.ts`（同上）
- Create: `src/lib/broker-research/ports/ports.test.ts`
- Create: `src/lib/broker-research/parse.ts`
- Create: `src/lib/broker-research/parse.test.ts`
- Create: `src/lib/broker-research/fixtures/pipeline.ts`（合成三页报告：页文本、`DocumentExtraction`、录制 LLM 响应；C5、C7、C8 共用）
- Modify: `src/lib/broker-research/deps.ts`（追加 `brokerDeps()`、`deadlineFrom()`）
- Modify: `src/lib/broker-research/testing.ts`（追加 `memoryBrokerDeps()`、`seedParsed()`）
- Create: `src/app/api/admin/broker-research/documents/[id]/parse/route.ts`
- Create: `src/app/api/admin/broker-research/documents/[id]/parse/route.test.ts`

**端口语义**：`F3Port.available()` / `LlmPort.info()` 为假时服务**不建运行行**，开批次后立即以非信息码 `f3_unavailable` / `llm_unavailable` 收尾（`fetched=0` → `failed`），释放租约，路由 503。生产适配器只在 `BROKER_RESEARCH_F3_ENABLED==='1'` / `BROKER_RESEARCH_LLM_ENABLED==='1'` 时可用；F3 适配器在 F3 规格 §11.1 接口落地前即使开关为 1 也答 `available()=false`（`detail:'adapter_not_wired'`）。产物 JSON 由 `parse.ts` 写入 `reports/{sha}.extract.{run_id}.json`（`upsert:false`），`artifact_hash` = 所写字节的 sha256；R1 / 定位一律以 UTF-16 码元切片（`sliceText`）。

- [ ] **Step 1: 写合成夹具**

```ts
// src/lib/broker-research/fixtures/pipeline.ts
// Synthetic three-page broker report shared by the C4–C8 tests (spec §12.1/§12.4: no real report is ever committed).
// The page texts are invented; the institution, analyst and ticker do not exist. EXTRACT_RESPONSE is a recorded-format
// LLM answer for extract-schema/1 whose target_price quote deliberately differs by one space ("120 .00") so the field
// lands `unverified` (spec §14 sample 2). SUMMARY_RESPONSE contains no digits so grounding has nothing to assert.
import type {DocumentExtraction} from '../ports/f3';

export const PIPELINE_TICKER='ZZBR';
export const PAGES:readonly string[]=[
 ['Synthetic Broker Research Ltd','ZZ Robotics Inc (ZZBR US)','Initiation: Building the platform','Rating: Overweight',
  'Price target: US$120.00 (12-month)','Price (as of 2026-10-30): US$100.00','Upside: 20.0%','Analyst: Jane Placeholder','Published 2026-11-02'].join('\n'),
 'Valuation: discounted cash flow with WACC 9.0% and terminal growth 2.5%.\nThe platform thesis rests on recurring service revenue.',
 'Risks: execution on new product lines, customer concentration, and supply constraints.',
];
export const EXTRACTOR_VERSION='fake-f3/1';
export const pipelineExtraction=(sha256:string):DocumentExtraction=>({extractor_version:EXTRACTOR_VERSION,content_sha256:sha256,page_count:PAGES.length,ocr_used:false,ocr_version:null,pages:PAGES.map((text,i)=>({page:i+1,text}))});
const ev=(value:string,quote:string,page=1)=>({value,page,quote,confidence:0.9});
export const EXTRACT_OBJECT={
 scope:'single_issuer',institution:ev('Synthetic Broker Research Ltd','Synthetic Broker Research Ltd'),analysts:[ev('Jane Placeholder','Jane Placeholder')],
 published_date:ev('2026-11-02','Published 2026-11-02'),title:ev('Initiation: Building the platform','Initiation: Building the platform'),
 valuation_method:ev('DCF','discounted cash flow',2),wacc:ev('9.0%','WACC 9.0%',2),terminal_growth:ev('2.5%','terminal growth 2.5%',2),
 targets:[{ticker:ev('ZZBR US','ZZBR US'),rating:ev('Overweight','Overweight'),target_price:ev('120.00','120 .00'),target_currency:ev('USD','US$'),
  target_horizon_months:ev('12','12-month'),price_at_report:ev('100.00','100.00'),price_currency:ev('USD','US$'),price_as_of_date:ev('2026-10-30','2026-10-30'),upside_stated:ev('20.0%','20.0%')}],
};
export const EXTRACT_RESPONSE=JSON.stringify(EXTRACT_OBJECT);
export const SUMMARY_RESPONSE=['## 报告定位','机构对该标的给出首次覆盖观点，核心是平台化的服务收入。','## 核心结论','研究认为经常性服务收入是估值的主要支撑。',
 '## 方法论','报告采用现金流折现方法。','## 风险与边界','新产品执行、客户集中与供应约束是主要风险。'].join('\n');
export const TITLE_RESPONSE=JSON.stringify({zh:'首次覆盖：打造平台',en:'Initiation: Building the platform'});
```

- [ ] **Step 2: 写端口失败测试**

```ts
// src/lib/broker-research/ports/ports.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {F3Error,assertExtraction,fakeF3Port,productionF3Port,sliceText} from './f3';
import {LlmError,REGISTRY_HASH,productionLlmPort,recordedLlmPort} from './llm';
import {pipelineExtraction} from '../fixtures/pipeline';

const SHA='b'.repeat(64);
describe('F3 port',()=>{
 it('sliceText slices UTF-16 code units and refuses out-of-range spans',()=>{
  const ex={...pipelineExtraction(SHA),pages:[{page:1,text:'a😀b'}],page_count:1};
  expect(sliceText(ex,{page:1,char_start:1,char_end:3})).toBe('😀');
  expect(sliceText(ex,{page:1,char_start:0,char_end:9})).toBeNull();
  expect(sliceText(ex,{page:2,char_start:0,char_end:1})).toBeNull();
 });
 it('assertExtraction checks the content hash and page numbering',()=>{
  expect(()=>assertExtraction(pipelineExtraction(SHA),'c'.repeat(64))).toThrow(expect.objectContaining({code:'f3_failed'}));
  expect(()=>assertExtraction({...pipelineExtraction(SHA),page_count:9},SHA)).toThrow(F3Error);
  expect(assertExtraction(pipelineExtraction(SHA),SHA).page_count).toBe(3);
 });
 it('fakeF3Port returns the fixture; production is unavailable unless wired',async()=>{
  const f=fakeF3Port(()=>pipelineExtraction(SHA));
  expect(f.available()).toBe(true);
  expect((await f.extractDocument({bytes:new Uint8Array(),sha256:SHA,outputPrefix:'x',pagesPrefix:'y'},{deadline:new Date(),authorization:{licenceId:'l',licenceVersion:1,purpose:'broker_research'}})).page_count).toBe(3);
  expect(productionF3Port({}).available()).toBe(false);
  expect(productionF3Port({BROKER_RESEARCH_F3_ENABLED:'1'}).available()).toBe(false);
  await expect(productionF3Port({}).extractDocument({} as never,{} as never)).rejects.toMatchObject({code:'f3_unavailable'});
 });
});
describe('LLM port',()=>{
 afterEach(()=>{vi.unstubAllEnvs();});
 it('recordedLlmPort replays answers in order and records the calls',async()=>{
  const p=recordedLlmPort(['a',new LlmError('llm_quota'),'c']);
  expect(p.info()).toMatchObject({modelId:'recorded-model',registryHash:REGISTRY_HASH});
  const req={system:'s',user:'u',maxTokens:10,responseJson:true,timeoutMs:1000};
  expect((await p.complete(req)).content).toBe('a');
  await expect(p.complete(req)).rejects.toMatchObject({code:'llm_quota'});
  expect((await p.complete(req)).content).toBe('c');
  await expect(p.complete(req)).rejects.toMatchObject({code:'llm_failed'});
  expect(p.calls).toHaveLength(4);
 });
 it('production adapter is off unless BROKER_RESEARCH_LLM_ENABLED=1 and a platform LLM resolves',async()=>{
  expect(productionLlmPort({}).info()).toBeNull();
  await expect(productionLlmPort({}).complete({system:'',user:'',maxTokens:1,responseJson:false,timeoutMs:1})).rejects.toMatchObject({code:'llm_unavailable'});
  vi.stubEnv('LLM_PROVIDER','');vi.stubEnv('DEEPSEEK_API_KEY','');vi.stubEnv('ARK_API_KEY','');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('KIMI_API_KEY','');vi.stubEnv('MINIMAX_API_KEY','');
  expect(productionLlmPort({BROKER_RESEARCH_LLM_ENABLED:'1'}).info()).toBeNull();
 });
 it('registry hash is a stable sha256 of the bundled snapshot',()=>{expect(REGISTRY_HASH).toMatch(/^[0-9a-f]{64}$/);});
});
```

- [ ] **Step 3: 实现两个端口**

```ts
// src/lib/broker-research/ports/f3.ts
// F3 document-pipeline port as requested by spec §11.1: extractDocument(input,{deadline,authorization}) →
// DocumentExtraction, sliceText, F3Timeout. Offsets are UTF-16 code units (spec §4.6); the F3 spec §7.2 counts code
// points — the production adapter must convert before returning (plan Part C risk R1). productionF3Port stays
// unavailable until the F3 interface (F3 spec §8.3 / O13) is signed and wired; BROKER_RESEARCH_F3_ENABLED!=='1' always
// answers f3_unavailable. fakeF3Port serves unit and pipeline tests.
export interface F3Page{page:number;text:string}
export interface DocumentExtraction{extractor_version:string;content_sha256:string;page_count:number;ocr_used:boolean;ocr_version:string|null;pages:F3Page[]}
export interface F3Input{bytes:Uint8Array;sha256:string;outputPrefix:string;pagesPrefix:string}
export interface F3Authorization{licenceId:string;licenceVersion:number;purpose:'broker_research'}
export interface F3Port{
 available():boolean;
 extractDocument(input:F3Input,opts:{deadline:Date;authorization:F3Authorization}):Promise<DocumentExtraction>;
}
export class F3Timeout extends Error{constructor(){super('f3_timeout');this.name='F3Timeout';}}
export class F3Error extends Error{constructor(readonly code:'f3_failed'|'f3_unavailable'|'extractor_nondeterministic',message?:string){super(message??code);this.name='F3Error';}}

export function sliceText(ex:DocumentExtraction,loc:{page:number;char_start:number;char_end:number}):string|null{
 const p=ex.pages.find(x=>x.page===loc.page);
 if(!p||!Number.isInteger(loc.char_start)||!Number.isInteger(loc.char_end)||loc.char_start<0||loc.char_end<=loc.char_start||loc.char_end>p.text.length)return null;
 return p.text.slice(loc.char_start,loc.char_end);
}
export function assertExtraction(v:unknown,sha256:string):DocumentExtraction{
 const e=v as DocumentExtraction;
 if(!e||typeof e!=='object'||typeof e.extractor_version!=='string'||!Array.isArray(e.pages))throw new F3Error('f3_failed','shape');
 if(e.content_sha256!==sha256)throw new F3Error('f3_failed','content_mismatch');
 if(e.page_count!==e.pages.length||e.pages.some((p,i)=>p.page!==i+1||typeof p.text!=='string'))throw new F3Error('f3_failed','pages');
 return e;
}
export function fakeF3Port(build:(input:F3Input)=>DocumentExtraction|Error):F3Port&{calls:F3Input[]}{
 const calls:F3Input[]=[];
 return {calls,available:()=>true,async extractDocument(input){calls.push(input);const r=build(input);if(r instanceof Error)throw r;return structuredClone(r);}};
}
export function productionF3Port(env:Record<string,string|undefined>=process.env):F3Port{
 const wired=false;   // flip when src/lib/documents exposes extractDocument (F3 spec §8.3, O13)
 return {
  available:()=>env.BROKER_RESEARCH_F3_ENABLED==='1'&&wired,
  async extractDocument(){throw new F3Error('f3_unavailable',env.BROKER_RESEARCH_F3_ENABLED==='1'?'adapter_not_wired':'flag_off');},
 };
}
```

```ts
// src/lib/broker-research/ports/llm.ts
// Platform LLM port (spec §4.3, §6.2, §6.4; D5). info() names model_id, provider, registry_hash (sha256 of the bundled
// registry snapshot, src/lib/llm/registry) and the context window (registry `context`, else 32768). The production
// adapter resolves ONLY the platform key (resolvePlatformLlm) and only when BROKER_RESEARCH_LLM_ENABLED==='1'; errors
// become llm_quota (402/429), llm_failed (anything else). recordedLlmPort replays recorded answers for tests.
import {canonicalJson,sha256Hex} from '../hash';
import {registryModels,registryProviders} from '../../llm/registry/derive';
import {classifyLlmError} from '../../llm/errors';
import {resolvePlatformLlm} from '../../llm/resolve';

export interface LlmRequest{system:string;user:string;maxTokens:number;responseJson:boolean;timeoutMs:number}
export interface LlmResponse{content:string;modelId:string;usage?:{inputTokens:number;outputTokens:number}}
export interface LlmInfo{modelId:string;providerId:string;registryHash:string;contextTokens:number}
export interface LlmPort{info():LlmInfo|null;complete(req:LlmRequest):Promise<LlmResponse>}
export class LlmError extends Error{constructor(readonly code:'llm_unavailable'|'llm_quota'|'llm_failed',message?:string){super(message??code);this.name='LlmError';}}

export const REGISTRY_HASH=sha256Hex(canonicalJson({providers:registryProviders,models:registryModels}));
const DEFAULT_CONTEXT=32768;
export const contextOf=(provider:string,model:string)=>registryModels.providers[provider]?.[model]?.context??DEFAULT_CONTEXT;

export function productionLlmPort(env:Record<string,string|undefined>=process.env):LlmPort{
 const on=()=>env.BROKER_RESEARCH_LLM_ENABLED==='1';
 return {
  info(){if(!on())return null;const r=resolvePlatformLlm();return r?{modelId:r.model,providerId:r.provider,registryHash:REGISTRY_HASH,contextTokens:contextOf(r.provider,r.model)}:null;},
  async complete(req){
   const r=on()?resolvePlatformLlm():null;if(!r)throw new LlmError('llm_unavailable');
   const {chatResolved}=await import('../../data/sources/llm');
   try{
    const out=await chatResolved(r,{system:req.system,messages:[{role:'user',content:req.user}],max_tokens:req.maxTokens,temperature:0,responseJson:req.responseJson,timeoutMs:req.timeoutMs});
    return {content:out.content,modelId:r.model,usage:out.usage as unknown as {inputTokens:number;outputTokens:number}};
   }catch(e){const c=classifyLlmError(e).class;throw new LlmError(c==='quota'||c==='rate_limited'?'llm_quota':'llm_failed',c);}
  },
 };
}
export function recordedLlmPort(script:readonly (string|LlmError)[]|((req:LlmRequest,call:number)=>string|LlmError),info:Partial<LlmInfo>={}):LlmPort&{calls:LlmRequest[]}{
 const calls:LlmRequest[]=[];const full:LlmInfo={modelId:'recorded-model',providerId:'recorded',registryHash:REGISTRY_HASH,contextTokens:64000,...info};
 return {calls,info:()=>full,async complete(req){
  const n=calls.push(req)-1;const a=typeof script==='function'?script(req,n):script[n];
  if(a===undefined)throw new LlmError('llm_failed','script_exhausted');if(a instanceof LlmError)throw a;
  return {content:a,modelId:full.modelId,usage:{inputTokens:req.user.length,outputTokens:a.length}};
 }};
}
```

- [ ] **Step 4: 运行端口测试**

Run: `npm test -- src/lib/broker-research/ports/ports.test.ts`
Expected: PASS。

- [ ] **Step 5: 追加 deps / testing**

追加到 `src/lib/broker-research/deps.ts` 末尾：

```ts
import {productionF3Port} from './ports/f3';
import {productionLlmPort} from './ports/llm';
/** Full production deps for the processing routes (parse/extract/summary/translate); both ports are flag-gated. */
export function brokerDeps():BrokerDeps{return {...coreDeps(),f3:productionF3Port(),llm:productionLlmPort()};}
export const ROUTE_BUDGET_MS=300_000,DEADLINE_MARGIN_MS=20_000;
/** deadline = request start + maxDuration − 20 s (spec §6.2, §15.3 proposal). */
export const deadlineFrom=(start:Date)=>new Date(start.getTime()+ROUTE_BUDGET_MS-DEADLINE_MARGIN_MS);
```

（import 语句移到文件顶部的 import 区。）

追加到 `src/lib/broker-research/testing.ts` 末尾（import 同样上移）：

```ts
import {fakeF3Port} from './ports/f3';
import type {F3Port} from './ports/f3';
import {recordedLlmPort} from './ports/llm';
import type {LlmPort} from './ports/llm';
import {EXTRACT_RESPONSE,pipelineExtraction} from './fixtures/pipeline';
import type {BrokerDeps} from './types';
export interface MemoryDeps extends MemoryCore,BrokerDeps{storage:MemoryBrokerStorage}
export function memoryBrokerDeps(o:{f3?:F3Port;llm?:LlmPort;tables?:TableClient;db?:BrokerResearchDb}={}):MemoryDeps{
 const core=memoryCoreDeps(o);
 return {...core,f3:o.f3??fakeF3Port((i)=>pipelineExtraction(i.sha256)),llm:o.llm??recordedLlmPort([EXTRACT_RESPONSE])};
}
export const DEADLINE=()=>new Date(T0.getTime()+280_000);
```

- [ ] **Step 6: 写解析服务失败测试**

```ts
// src/lib/broker-research/parse.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {F3Error,F3Timeout,fakeF3Port} from './ports/f3';
import {pipelineExtraction} from './fixtures/pipeline';
import {brokerPaths} from './storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {loadArtifact,runParse} from './parse';

const batches=(d:MemoryDeps)=>(d.tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows('ingest_batches');
describe('runParse',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps();});
 const seed=async(patch={})=>{const l=await seedLicence(d.db,{patch});return seedDocument(d,l.licence_id);};
 it('parses: artifact stored per run, hash recorded, document parsed, lease released, batch success, log row',async()=>{
  const doc=await seed();
  const r=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r.status).toBe('succeeded');
  const run=(await d.db.getRun(r.runId))!;
  expect(run).toMatchObject({kind:'parse',status:'succeeded',artifact_path:brokerPaths.artifact(doc.sha256,r.runId)});
  expect((await loadArtifact(d,run)).page_count).toBe(3);
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'parsed',current_parse_run_id:r.runId,page_count:3,lease_token:null});
  expect(batches(d)[0]).toMatchObject({producer:'broker-research-parse',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0}});
  expect((await d.db.listAccessLog({limit:5})).map(x=>x.action)).toEqual(['parse_run']);
 });
 it('409 licence_forbids_processing / lease_held; 410 withdrawn; 409 promotion_pending',async()=>{
  const forbidden=await seed({allows_llm_processing:false});
  await expect(runParse(d,forbidden.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'licence_forbids_processing',status:409});
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id,new TextEncoder().encode('%PDF-other'));
  expect(await d.db.claimLease(doc.document_id,'other',300)).toBe(true);
  await expect(runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'lease_held',status:409});
  await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'x'});
  await expect(runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({status:410});
 });
 it.each([[new F3Timeout(),'f3_timeout'],[new F3Error('extractor_nondeterministic'),'extractor_nondeterministic'],[new Error('boom'),'f3_failed']])
 ('failure %s → run failed, parse_failed, batch failed',async(err,code)=>{
  d=memoryBrokerDeps({f3:fakeF3Port(()=>err)});const doc=await seed();
  const r=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r).toMatchObject({status:'failed',errorCode:code});
  expect((await d.db.getRun(r.runId!))!.detail).toMatchObject({error_code:code});
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'parse_failed',lease_token:null});
  expect(batches(d)[0]).toMatchObject({status:'failed',counts:{fetched:1,failed:1}});
 });
 it('a failed re-parse keeps the previous successful run current',async()=>{
  const doc=await seed();const ok=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  d.f3=fakeF3Port(()=>new F3Timeout());
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'parsed',current_parse_run_id:ok.runId});
 });
 it('F3 unavailable: no run row, batch failed f3_unavailable, 503',async()=>{
  d=memoryBrokerDeps({f3:{available:()=>false,extractDocument:async()=>pipelineExtraction('x')}});const doc=await seed();
  await expect(runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'f3_unavailable',status:503});
  expect(await d.db.listRuns(doc.document_id)).toEqual([]);
  expect(batches(d)[0]).toMatchObject({status:'failed',errors:[{code:'f3_unavailable'}]});
  expect((await d.db.getDocument(doc.document_id))!.lease_token).toBeNull();
 });
 it('loadArtifact refuses bytes whose hash differs from the run',async()=>{
  const doc=await seed();const r=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const run=(await d.db.getRun(r.runId))!;
  d.storage.objects.set(run.artifact_path!,{bytes:new TextEncoder().encode('{}'),contentType:'application/json'});
  await expect(loadArtifact(d,run)).rejects.toMatchObject({code:'artifact_unreadable'});
 });
});
```

- [ ] **Step 7: 实现 `parse.ts`**

```ts
// src/lib/broker-research/parse.ts
// parse action (spec §6.2): processing authorisation → lease (CAS, 300 s) → batch broker-research-parse → document
// `parsing` → run(kind=parse, licence_version) → F3 extractDocument (deadline) → artifact JSON at
// reports/{sha}.extract.{run_id}.json (never overwritten) + artifact_hash → fenced run finish + document `parsed`
// (current_parse_run_id) → release lease. Failure → run failed, document back to parse_failed (no prior success) or
// parsed (prior run stays current). Counts: success {fetched:1,inserted:1}; failure {fetched:1,failed:1} + non-info code.
// No recordAttempt (spec §6.2: only the verify cron). loadArtifact() re-reads an artifact and checks its hash (R1 input).
import {createHash} from 'node:crypto';
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import type {BatchError} from '../dq/batches';
import {BrokerError,conflict} from './errors';
import {processingAllowed,utcToday} from './licences';
import {F3Error,F3Timeout,assertExtraction} from './ports/f3';
import type {DocumentExtraction} from './ports/f3';
import {brokerPaths} from './storage';
import {documentForAccess} from './upload';
import type {BrokerDeps,DocumentRow,LicenceRow,RunRow} from './types';

export const LEASE_SECONDS=300;
export interface ParseResult{runId:string;status:'succeeded'|'failed';errorCode?:string;batchStatus:string}

/** Shared preconditions of parse/extract/summary/translate: document reachable, licence authorises processing, lease taken. */
export async function claimForProcessing(deps:BrokerDeps,documentId:string):Promise<{doc:DocumentRow;licence:LicenceRow;token:string}>{
 const doc=await documentForAccess(deps,documentId);
 const licence=await deps.db.getLicence(doc.licence_id);
 if(!licence||!processingAllowed(licence,utcToday(deps.now())))throw conflict('licence_forbids_processing');
 const token=deps.newId();
 if(!await deps.db.claimLease(documentId,token,LEASE_SECONDS))throw conflict('lease_held');
 return {doc,licence,token};
}
/** Port unavailable: no run row; a failed batch records why; lease released; 503. */
export async function failUnavailable(deps:BrokerDeps,producer:string,documentId:string,token:string,code:'f3_unavailable'|'llm_unavailable'):Promise<never>{
 const {batchId}=await startBatch(deps.tables,{producer,dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code}]},deps.now());
 await deps.db.fencedUpdateDocument(documentId,token,{releaseLease:true});
 throw new BrokerError(code,503);
}
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const f3Code=(e:unknown)=>e instanceof F3Timeout?'f3_timeout':e instanceof F3Error?e.code:'f3_failed';

export async function runParse(deps:BrokerDeps,documentId:string,by:string,opts:{deadline:Date}):Promise<ParseResult>{
 const {doc,licence,token}=await claimForProcessing(deps,documentId);
 if(!deps.f3.available())return failUnavailable(deps,'broker-research-parse',documentId,token,'f3_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-parse',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 const hadSuccess=doc.current_parse_run_id!==null;
 const runId=deps.newId();
 await deps.db.fencedUpdateDocument(documentId,token,{status:'parsing'});
 await deps.db.insertRun({run_id:runId,document_id:documentId,kind:'parse',parse_run_id:null,extractor_version:null,artifact_path:null,artifact_hash:null,
  model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:deps.codeVersion,behavior_digest:null,licence_version:licence.version,
  request_path:null,response_path:null,batch_id:batchId});
 let errorCode:string|null=null,ex:DocumentExtraction|null=null,artifactHash='';
 const path=brokerPaths.artifact(doc.sha256,runId);
 try{
  const bytes=await deps.storage.download(doc.storage_path);
  if(!bytes)throw new F3Error('f3_failed','pdf_missing');
  ex=assertExtraction(await deps.f3.extractDocument({bytes,sha256:doc.sha256,outputPrefix:brokerPaths.artifactPrefix(doc.sha256,runId),pagesPrefix:brokerPaths.pagesPrefix(doc.sha256,runId)},
   {deadline:opts.deadline,authorization:{licenceId:licence.licence_id,licenceVersion:licence.version,purpose:'broker_research'}}),doc.sha256);
  const artifact=new TextEncoder().encode(JSON.stringify(ex));artifactHash=sha(artifact);
  if(await deps.storage.upload(path,artifact,'application/json')!=='stored')throw new F3Error('f3_failed','artifact_exists');
 }catch(e){errorCode=f3Code(e);}
 const errors:BatchError[]=[];
 if(errorCode===null&&ex){
  const fin=await deps.db.finishRun(runId,token,{status:'succeeded',artifact_path:path,artifact_hash:artifactHash,detail:{extractor_version:ex.extractor_version,page_count:ex.page_count,ocr_used:ex.ocr_used,ocr_version:ex.ocr_version}});
  const upd=fin==='ok'?await deps.db.fencedUpdateDocument(documentId,token,{status:'parsed',current_parse_run_id:runId,page_count:ex.page_count,releaseLease:true}):'lease_lost';
  if(upd==='lease_lost')errorCode='lease_lost';
 }else{
  await deps.db.finishRun(runId,token,{status:'failed',detail:{error_code:errorCode}});
  await deps.db.fencedUpdateDocument(documentId,token,{status:hadSuccess?'parsed':'parse_failed',releaseLease:true});
 }
 if(errorCode)errors.push({code:errorCode});
 const batchStatus=await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),fetched:1,...(errorCode?{failed:1}:{inserted:1})},errors},deps.now());
 await deps.db.logAccess({document_id:documentId,user_id:by,action:'parse_run',detail:{run_id:runId,status:errorCode?'failed':'succeeded',error_code:errorCode}});
 return errorCode?{runId,status:'failed',errorCode,batchStatus}:{runId,status:'succeeded',batchStatus};
}

/** Reads a parse run's artifact and verifies it against the run's artifact_hash. */
export async function loadArtifact(deps:Pick<BrokerDeps,'storage'>,run:RunRow):Promise<DocumentExtraction>{
 if(run.kind!=='parse'||run.status!=='succeeded'||!run.artifact_path||!run.artifact_hash)throw new BrokerError('artifact_unreadable',409,{run_id:run.run_id});
 const bytes=await deps.storage.download(run.artifact_path);
 if(!bytes||sha(bytes)!==run.artifact_hash)throw new BrokerError('artifact_unreadable',409,{run_id:run.run_id});
 return JSON.parse(new TextDecoder().decode(bytes)) as DocumentExtraction;
}
/** Memoised loader keyed by parse run id (rules, review and grounding read several runs). */
export function artifactLoader(deps:Pick<BrokerDeps,'db'|'storage'>):(parseRunId:string)=>Promise<DocumentExtraction>{
 const cache=new Map<string,Promise<DocumentExtraction>>();
 return (id)=>{let p=cache.get(id);if(!p){p=deps.db.getRun(id).then(r=>{if(!r)throw new BrokerError('artifact_unreadable',409,{run_id:id});return loadArtifact(deps,r);});cache.set(id,p);}return p;};
}
```

- [ ] **Step 8: 写解析路由与测试**

```ts
// src/app/api/admin/broker-research/documents/[id]/parse/route.ts
// POST {}: run F3 on the document (spec §6.2). 200 {runId,status:'succeeded'}; a recorded failed run answers 502 with
// its error code and run id; lease_lost 409; F3 unavailable 503; preconditions 404/409/410.
import {adminPost,errorJson,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {runParse} from '@/lib/broker-research/parse';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('documents.parse',async({ctx,userId})=>{
 const start=new Date();const r=await runParse(brokerDeps(),uuidParam((await ctx.params).id),userId,{deadline:deadlineFrom(start)});
 if(r.status==='succeeded')return jsonNoStore(r);
 return errorJson(r.errorCode!,r.errorCode==='lease_lost'?409:502,{runId:r.runId,batchStatus:r.batchStatus});
});
```

```ts
// src/app/api/admin/broker-research/documents/[id]/parse/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {F3Timeout,fakeF3Port} from '@/lib/broker-research/ports/f3';
import {ADMIN_ID,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST} from './route';

describe('POST documents/[id]/parse',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{vi.clearAllMocks();d=memoryBrokerDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 const url=(id:string)=>`/api/admin/broker-research/documents/${id}/parse`;
 adminGuardCases({call:(r)=>POST(r,ctxOf({id:'00000000-0000-4000-8000-000000000001'})),request:()=>jsonReq(url('x'),{}),requireAdmin:mocks.requireAdmin,post:true});
 it('200 on success, 409 lease_held while another lease is live, 502 for a failed run, 404 unknown',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);const ctx=ctxOf({id:doc.document_id});
  const ok=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(ok.status).toBe(200);
  expect(await bodyOf(ok)).toMatchObject({status:'succeeded'});
  await d.db.claimLease(doc.document_id,'someone',300);
  const held=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(held.status).toBe(409);expect(await errCode(held)).toBe('lease_held');
  d.advance(301_000);d.f3=fakeF3Port(()=>new F3Timeout());
  const f=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(f.status).toBe(502);expect(await errCode(f)).toBe('f3_timeout');
  expect((await POST(jsonReq(url('00000000-0000-4000-8000-0000000000ff'),{}),ctxOf({id:'00000000-0000-4000-8000-0000000000ff'}))).status).toBe(404);
 });
 it('410 for a withdrawn document',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'x'});
  const r=await POST(jsonReq(url(doc.document_id),{}),ctxOf({id:doc.document_id}));
  expect(r.status).toBe(410);expect(r.headers.get('cache-control')).toBe('no-store');
 });
});
```

- [ ] **Step 9: 运行**

Run: `npm test -- src/lib/broker-research/ports src/lib/broker-research/parse.test.ts src/app/api/admin/broker-research/documents`
Expected: PASS。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 10: 提交**

```bash
git add src/lib/broker-research/ports src/lib/broker-research/parse.ts src/lib/broker-research/parse.test.ts src/lib/broker-research/fixtures/pipeline.ts src/lib/broker-research/deps.ts src/lib/broker-research/testing.ts "src/app/api/admin/broker-research/documents/[id]/parse" docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C4 F3/LLM ports (flag-off production adapters), parse service and route"
```

---
### Task C5: 抽取服务（分块、请求/响应入桶、ajv 一次重试、定位、合并、extractCommit、规则回执、隔离、批次）+ 路由

**Files:**
- Create: `src/lib/broker-research/prompts/broker-extract.v1.md`
- Create: `src/lib/broker-research/prompts/index.ts`（运行时用的 TS 常量；单测断言与 `.md` 逐字相等——避免依赖 Next 打包读取 `.md`）
- Create: `src/lib/broker-research/prompts/prompts.test.ts`
- Create: `src/lib/broker-research/rules-run.ts`（`applyRules`：规则 → 回执 → 隔离；C5/C6/C7 共用）
- Create: `src/lib/broker-research/extract/run.ts`
- Create: `src/lib/broker-research/extract/run.test.ts`
- Create: `src/app/api/admin/broker-research/documents/[id]/extract/route.ts`
- Create: `src/app/api/admin/broker-research/documents/[id]/extract/route.test.ts`

**批次计数（规格 §6.2，六计数器全部显式）**：`fetched=候选行数`、`inserted=已定位行数`、`duplicates=0`、`versioned=0`、`quarantined=隔离项数`、`failed=0`；`unverified>0` → 非信息码 `span_unverified_summary`；`quarantined>0` → 非信息码 `rules_failed_summary`；R10 → 信息码 `rule_warning_summary`；该 `behavior_digest` 无评测回执 → 信息码 `eval_receipt_absent`（C6 把它加入 `INFO_CODES`；C5 先写入错误数组，C6 前它会使批次 `partial`，C5 测试只断言 C6 之后也成立的部分）。LLM / schema / 存储失败 → `fetched=0` + 非信息码 → `failed`。**不**调 `recordAttempt`。

- [ ] **Step 1: 写提示词文件与常量**

`src/lib/broker-research/prompts/broker-extract.v1.md`（全文，`EXTRACT_PROMPT_VERSION='broker-extract/1'`）：

```md
You extract cited facts from one chunk of a sell-side research report.
Return ONE JSON object and nothing else. It must validate against the JSON Schema given in the user message
(additionalProperties is false everywhere).

Rules:
1. Every Evidence has `value`, `page` (the page number printed in the chunk header `=== page N ===`), `quote` and `confidence` (0..1).
2. `quote` must be copied character for character from that page (at most 400 characters). Never paraphrase, never normalise spaces or punctuation.
3. Currencies are separate Evidence: `quote` is the marker exactly as printed (US$, HK$, USD, Rmb, ...); `value` is the ISO 4217 code.
4. Dates as YYYY-MM-DD in `value`; the `quote` keeps the printed form.
5. Percentages: `value` keeps the printed form (e.g. "20.0%").
6. If the chunk does not state a field, omit it. Do not infer, compute or carry values from other chunks. A missing value is missing.
7. One `targets[]` entry per security the report rates; `ticker.quote` is the code as printed (e.g. "9988 HK", "BABA US").
8. `scope`: single_issuer | multi_issuer | sector | macro_strategy.
```

```ts
// src/lib/broker-research/prompts/index.ts
// Prompt texts used at runtime (spec §4.3 prompt_version, §6.4). The .md files next to this module are the reviewed
// originals; prompts.test.ts asserts byte equality, so editing one without the other (or without bumping the version
// constant in versions.ts) fails CI. Runtime code never reads the .md files (no bundler/file-tracing dependency).
export const EXTRACT_PROMPT=`You extract cited facts from one chunk of a sell-side research report.
Return ONE JSON object and nothing else. It must validate against the JSON Schema given in the user message
(additionalProperties is false everywhere).

Rules:
1. Every Evidence has \`value\`, \`page\` (the page number printed in the chunk header \`=== page N ===\`), \`quote\` and \`confidence\` (0..1).
2. \`quote\` must be copied character for character from that page (at most 400 characters). Never paraphrase, never normalise spaces or punctuation.
3. Currencies are separate Evidence: \`quote\` is the marker exactly as printed (US$, HK$, USD, Rmb, ...); \`value\` is the ISO 4217 code.
4. Dates as YYYY-MM-DD in \`value\`; the \`quote\` keeps the printed form.
5. Percentages: \`value\` keeps the printed form (e.g. "20.0%").
6. If the chunk does not state a field, omit it. Do not infer, compute or carry values from other chunks. A missing value is missing.
7. One \`targets[]\` entry per security the report rates; \`ticker.quote\` is the code as printed (e.g. "9988 HK", "BABA US").
8. \`scope\`: single_issuer | multi_issuer | sector | macro_strategy.
`;
```

```ts
// src/lib/broker-research/prompts/prompts.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import * as P from './index';

const md=(f:string)=>readFileSync(new URL(`./${f}`,import.meta.url),'utf8');
describe('prompt constants equal the reviewed .md files',()=>{
 it('broker-extract.v1',()=>{expect(P.EXTRACT_PROMPT).toBe(md('broker-extract.v1.md'));});
});
```

（`.md` 文件末尾保留一个换行，与常量末尾的 `\n` 一致。）

- [ ] **Step 2: 写 `rules-run.ts`**

```ts
// src/lib/broker-research/rules-run.ts
// Runs the §7 rules on the materialized report and records the outcome (spec §6.2 tail, §6.3 tail, §7.2): reads the
// report fresh (rules_input_hash is the receipt's input_hash, never recomputed in TS), loads every artifact the fields
// cite (R1 slice), peers of the same institution for R7 (read through deps.tables), writes broker_report_rule_receipts,
// and quarantines each failed rule except span_verbatim (the field is already unverified) and the R10 warning.
// Quarantine key = ${sha256}:${rule}:${target_key ?? '-'}; payload = the rule detail (values and pages only).
import {quarantine} from '../dq/quarantine';
import {selectAll} from '../db/table-client';
import {BrokerError} from './errors';
import {artifactLoader} from './parse';
import {sliceText} from './ports/f3';
import type {DocumentExtraction} from './ports/f3';
import {evaluateRules} from './rules';
import type {RulesInput} from './rules';
import {RULES_VERSION} from './versions';
import type {BrokerDeps,RuleResult} from './types';

const NOT_QUARANTINED=new Set(['span_verbatim','horizon_present_with_target']);
export interface RulesOutcome{receiptId:string;results:RuleResult[];quarantined:number;warnings:number;blockingFailures:number}

export async function applyRules(deps:Pick<BrokerDeps,'db'|'storage'|'tables'|'codeVersion'>,reportId:string,o:{batchId:string}):Promise<RulesOutcome>{
 const report=await deps.db.getReport(reportId);
 if(!report)throw new BrokerError('report_not_found',404);
 if(!report.rules_input_hash)throw new BrokerError('materialize_stale',409);
 const document=(await deps.db.getDocument(report.document_id))!;
 const [fields,targets]=await Promise.all([deps.db.listFields(reportId),deps.db.listTargets(reportId)]);
 const scales=report.institution_id?await deps.db.listRatingScales(report.institution_id):[];
 const load=artifactLoader(deps),artifacts=new Map<string,DocumentExtraction>();
 for(const id of new Set(fields.map(f=>f.parse_run_id).filter((x):x is string=>x!==null)))artifacts.set(id,await load(id));
 const peers:RulesInput['peers']=[];
 if(report.institution_id){
  for(const r of await selectAll(deps.tables,'broker_research_reports',{institution_id:report.institution_id},'report_id')){
   if(r.report_id===reportId)continue;
   const t=await deps.tables.select('broker_report_targets',{report_id:r.report_id as string},{limit:50});
   peers.push({reportId:r.report_id as string,institutionId:r.institution_id as string,publishedDate:(r.published_date as string|null)??null,title:(r.title_original as string|null)??null,
    securityTickers:t.map(x=>x.security_ticker).filter((x):x is string=>typeof x==='string')});
  }
 }
 const results=evaluateRules({report,document,fields,targets,scales,peers,
  slice:(runId,page,s,e)=>{const a=artifacts.get(runId);return a?sliceText(a,{page,char_start:s,char_end:e}):null;}});
 const receiptId=await deps.db.insertRuleReceipt({report_id:reportId,rules_version:RULES_VERSION,input_hash:report.rules_input_hash,results,code_version:deps.codeVersion});
 let quarantined=0,warnings=0;
 for(const r of results){
  if(r.passed)continue;
  if(r.rule==='horizon_present_with_target'){warnings++;continue;}
  if(NOT_QUARANTINED.has(r.rule)||!r.reason_code)continue;
  await quarantine(deps.tables,{dataset:'broker_research',table:'broker_research_reports',naturalKey:`${document.sha256}:${r.rule}:${r.target_key??'-'}`,
   reasonCode:r.reason_code,payload:r.detail,detail:{report_id:reportId,receipt_id:receiptId,rules_version:RULES_VERSION},batchId:o.batchId});
  quarantined++;
 }
 return {receiptId,results,quarantined,warnings,blockingFailures:results.filter(r=>!r.passed&&r.blocking).length};
}
```

- [ ] **Step 3: 写抽取服务失败测试**

```ts
// src/lib/broker-research/extract/run.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {LlmError,recordedLlmPort} from '../ports/llm';
import {EXTRACT_OBJECT,EXTRACT_RESPONSE,PAGES} from '../fixtures/pipeline';
import {runParse} from '../parse';
import {brokerPaths} from '../storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '../testing';
import type {MemoryDeps} from '../testing';
import {CHUNK_PAGES,chunkPages,runExtract} from './run';

const rows=(d:MemoryDeps,t:string)=>(d.tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows(t);
async function parsedDoc(d:MemoryDeps){const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});return doc;}

describe('chunkPages',()=>{
 it('splits at CHUNK_PAGES and at 60% of the context; an oversize page is a chunk of its own',()=>{
  const pages=Array.from({length:20},(_,i)=>({page:i+1,text:'x'.repeat(100)}));
  expect(chunkPages(pages,1_000_000,0).map(c=>c.length)).toEqual([CHUNK_PAGES,CHUNK_PAGES,4]);
  expect(chunkPages(pages,1000,0).map(c=>c.length)).toEqual(Array(4).fill(5));    // 600-token budget / 100+header per page
  expect(chunkPages([{page:1,text:'y'.repeat(5000)},{page:2,text:'z'}],1000,0).map(c=>c.map(p=>p.page))).toEqual([[1],[2]]);
 });
});

describe('runExtract',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps();});
 it('writes candidates, keeps the request/response in the bucket, unverified quote stays unverified, batch partial',async()=>{
  const doc=await parsedDoc(d);
  const r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r.status).toBe('succeeded');
  const run=(await d.db.getRun(r.runId))!;
  expect(run).toMatchObject({kind:'extract',status:'succeeded',prompt_version:'broker-extract/1',schema_version:'extract-schema/1',model_id:'recorded-model',
   request_path:brokerPaths.request(r.runId),response_path:brokerPaths.response(r.runId)});
  expect(run.behavior_digest).toMatch(/^[0-9a-f]{64}$/);
  const req=JSON.parse(d.storage.text(run.request_path!)!),res=JSON.parse(d.storage.text(run.response_path!)!);
  expect(req.calls).toHaveLength(1);expect(req.calls[0].user).toContain('=== page 1 ===');expect(res.calls[0].content).toBe(EXTRACT_RESPONSE);
  const fields=await d.db.listFields(r.reportId);
  const tp=fields.find(f=>f.field==='target_price')!;
  expect(tp).toMatchObject({status:'unverified',char_start:null,value_num:'120.00',extractor:`llm:recorded-model@${run.registry_hash}`});
  const rating=fields.find(f=>f.field==='rating')!;
  expect(rating.status).toBe('extracted');
  expect(PAGES[0].slice(rating.char_start!,rating.char_end!)).toBe(rating.value_source_text);
  expect(fields.find(f=>f.field==='target_currency')!.detail).toMatchObject({multiple_hits:true});
  expect(r.counts).toEqual({fetched:fields.length,inserted:fields.length-1,duplicates:0,versioned:0,quarantined:r.counts.quarantined,failed:0});
  const batch=rows(d,'ingest_batches').find(b=>b.producer==='broker-research-extract')!;
  expect(batch.status).toBe('partial');
  expect((batch.errors as {code:string}[]).map(e=>e.code)).toEqual(expect.arrayContaining(['span_unverified_summary','eval_receipt_absent']));
  expect((await d.db.getDocument(doc.document_id))!.lease_token).toBeNull();
  expect((await d.db.listAccessLog({documentId:doc.document_id,limit:10})).map(x=>x.action)).toContain('extract_run');
  expect(rows(d,'ingest_batches').some(b=>'recordAttempt' in b)).toBe(false);
 });
 it('writes a rule receipt bound to rules_input_hash',async()=>{
  const doc=await parsedDoc(d);const r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const report=(await d.db.getReport(r.reportId))!;
  expect(r.ruleReceiptId).toBeTruthy();expect(report.rules_input_hash).toBeTruthy();
 });
 it('schema-invalid output is retried once; a second failure fails the run llm_schema_invalid with fetched=0',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort(['{"scope":1}',EXTRACT_RESPONSE])});
  const ok=await runExtract(d,(await parsedDoc(d)).document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(ok.status).toBe('succeeded');expect((await d.db.getRun(ok.runId))!.detail).toMatchObject({retries:1});
  d=memoryBrokerDeps({llm:recordedLlmPort(['not json','{"scope":1}'])});
  const doc=await parsedDoc(d);const bad=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(bad).toMatchObject({status:'failed',errorCode:'llm_schema_invalid'});
  expect(await d.db.listFields(bad.reportId)).toEqual([]);
  expect(d.storage.text(brokerPaths.response(bad.runId))).toContain('not json');
  expect(rows(d,'ingest_batches').find(b=>b.producer==='broker-research-extract')).toMatchObject({status:'failed',counts:{fetched:0}});
 });
 it('quota error fails the run llm_quota',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort([new LlmError('llm_quota')])});
  const r=await runExtract(d,(await parsedDoc(d)).document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r).toMatchObject({status:'failed',errorCode:'llm_quota'});
 });
 it('preconditions: 409 document_not_parsed, 503 llm_unavailable without a run',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  await expect(runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'document_not_parsed',status:409});
  d.llm={info:()=>null,complete:async()=>{throw new LlmError('llm_unavailable');}};
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  await expect(runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'llm_unavailable',status:503});
  expect((await d.db.listRuns(doc.document_id)).filter(r=>r.kind==='extract')).toEqual([]);
 });
 it('a second extract marks the old candidates superseded and keeps them',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,EXTRACT_RESPONSE])});
  const doc=await parsedDoc(d);
  const a=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const b=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const all=await d.db.listFields(a.reportId,{includeSuperseded:true});
  expect(all.filter(f=>f.run_id===a.runId).every(f=>f.superseded_by_run_id===b.runId)).toBe(true);
  expect(all.filter(f=>f.run_id===b.runId)).toHaveLength(all.filter(f=>f.run_id===a.runId).length);
 });
 it('the fixture object is what the recorded response encodes',()=>{expect(JSON.parse(EXTRACT_RESPONSE)).toEqual(EXTRACT_OBJECT);});
});
```

- [ ] **Step 4: 实现 `extract/run.ts`**

```ts
// src/lib/broker-research/extract/run.ts
// extract action (spec §6.2, §5.2–§5.4, §7.4): document parsed + promotion done + processing authorised → lease →
// ensureReport → run(kind=extract, behavior_digest, licence_version) → pages chunked (≤ CHUNK_PAGES and ≤ 60% of the
// model context) → one LLM call per chunk with the same schema, one retry on schema failure → raw request/response of
// every call stored at runs/{run_id}.{request|response}.json → mergeChunks (conflict groups, no auto-pick) → locate each
// quote in the artifact page text (UTF-16; miss → unverified) → toTyped → resolveTargets snapshot → extractCommit
// (single RPC: lease check, supersede, insert, materialize) → applyRules (receipt + quarantine) → finishBatch with the
// six counters → release lease. extractCandidates() is the DB-free core shared with eval-gold.ts and replay.ts.
import {finishBatch,startBatch,emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import {behaviorDigest} from '../behavior';
import {BrokerError,conflict} from '../errors';
import {artifactLoader,claimForProcessing,failUnavailable} from '../parse';
import type {DocumentExtraction,F3Page} from '../ports/f3';
import {LlmError} from '../ports/llm';
import type {LlmInfo,LlmPort} from '../ports/llm';
import {EXTRACT_PROMPT} from '../prompts';
import {applyRules} from '../rules-run';
import {brokerPaths} from '../storage';
import type {BrokerStorage} from '../storage';
import {resolveTargets} from '../tickers';
import {EXTRACT_PROMPT_VERSION,SCHEMA_VERSION} from '../versions';
import {locateQuote} from './locate';
import {mergeChunks} from './merge';
import type {MergedCandidate} from './merge';
import {EXTRACT_JSON_SCHEMA,validateExtraction} from './schema';
import type {Extraction} from './schema';
import {toTyped} from './typed';
import type {BrokerDeps,CandidateFieldInput,MaterializeReceipt,ReportScope} from '../types';

export const CHUNK_PAGES=8,CONTEXT_SHARE=0.6,MAX_OUTPUT_TOKENS=4000,SCHEMA_RETRIES=1,CALL_TIMEOUT_MS=90_000,MIN_CALL_BUDGET_MS=30_000;
/** ≥ 1 token per UTF-16 unit: conservative for CJK and Latin text (D5 proposal; refine with a tokenizer later). */
export const estimateTokens=(s:string)=>s.length;
const header=(p:F3Page)=>`=== page ${p.page} ===\n`;

export function chunkPages(pages:readonly F3Page[],contextTokens:number,overheadTokens:number):F3Page[][]{
 const budget=Math.floor(contextTokens*CONTEXT_SHARE)-overheadTokens;const out:F3Page[][]=[];let cur:F3Page[]=[],used=0;
 for(const p of pages){
  const t=estimateTokens(header(p)+p.text);
  if(cur.length&&(cur.length>=CHUNK_PAGES||used+t>budget)){out.push(cur);cur=[];used=0;}
  cur.push(p);used+=t;
 }
 if(cur.length)out.push(cur);
 return out;
}
const parseJson=(s:string):unknown=>{const t=s.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(t);}catch{return undefined;}};

export interface CallRecord{chunk:number;attempt:number;system:string;user:string;max_tokens:number}
export interface ResponseRecord{chunk:number;attempt:number;content:string|null;model_id:string|null;error:string|null}
export interface CandidateBatch{scope:ReportScope|null;rows:CandidateFieldInput[];stated:{targetKey:string;candidates:string[]}[];unverified:number;chunks:number;retries:number;requests:CallRecord[];responses:ResponseRecord[]}
export class ExtractFailure extends Error{constructor(readonly code:string,readonly requests:CallRecord[],readonly responses:ResponseRecord[]){super(code);}}

/** LLM chunks → merged, located, typed candidate rows (no DB writes). Throws ExtractFailure carrying the raw calls. */
export async function extractCandidates(llm:LlmPort,info:LlmInfo,artifact:DocumentExtraction,o:{deadline:Date;now:()=>Date}):Promise<CandidateBatch>{
 const schemaText=JSON.stringify(EXTRACT_JSON_SCHEMA);
 const chunks=chunkPages(artifact.pages,info.contextTokens,estimateTokens(EXTRACT_PROMPT+schemaText)+MAX_OUTPUT_TOKENS);
 const requests:CallRecord[]=[],responses:ResponseRecord[]=[],parsed:{chunk:number;extraction:Extraction}[]=[];let retries=0;
 for(const [ci,pages] of chunks.entries()){
  let feedback='';let ok:Extraction|null=null;
  for(let attempt=1;attempt<=1+SCHEMA_RETRIES&&!ok;attempt++){
   if(o.deadline.getTime()-o.now().getTime()<MIN_CALL_BUDGET_MS)throw new ExtractFailure('extract_deadline',requests,responses);
   const user=`JSON Schema:\n${schemaText}\n\nReport chunk ${ci+1}/${chunks.length}:\n${pages.map(p=>header(p)+p.text).join('\n')}${feedback}`;
   requests.push({chunk:ci,attempt,system:EXTRACT_PROMPT,user,max_tokens:MAX_OUTPUT_TOKENS});
   let content:string;
   try{content=(await llm.complete({system:EXTRACT_PROMPT,user,maxTokens:MAX_OUTPUT_TOKENS,responseJson:true,timeoutMs:CALL_TIMEOUT_MS})).content;}
   catch(e){const code=e instanceof LlmError?e.code:'llm_failed';responses.push({chunk:ci,attempt,content:null,model_id:info.modelId,error:code});throw new ExtractFailure(code,requests,responses);}
   responses.push({chunk:ci,attempt,content,model_id:info.modelId,error:null});
   const v=validateExtraction(parseJson(content));
   if(v.ok)ok=v.value;else{if(attempt===1)retries++;feedback=`\n\nYour previous answer was invalid: ${v.errors.slice(0,5).join('; ')}. Answer again with valid JSON only.`;}
  }
  if(!ok)throw new ExtractFailure('llm_schema_invalid',requests,responses);
  parsed.push({chunk:ci,extraction:ok});
 }
 const merged=mergeChunks(parsed);
 const extractor=`llm:${info.modelId}@${info.registryHash}`;let unverified=0;
 const rows=merged.candidates.map((c:MergedCandidate):CandidateFieldInput=>{
  const page=artifact.pages.find(p=>p.page===c.page);
  const hit=page?locateQuote(page.text,c.quote):{status:'miss' as const};
  if(hit.status!=='hit')unverified++;
  const typed=toTyped(c.field,c.value,c.quote);
  return {target_key:c.target_key,field:c.field,occurrence:c.occurrence,...typed,page:page?c.page:null,
   char_start:hit.status==='hit'?hit.char_start:null,char_end:hit.status==='hit'?hit.char_end:null,value_source_text:hit.status==='hit'?c.quote:null,
   extractor,extractor_confidence:c.confidence,conflict_group:c.conflict_group,status:hit.status==='hit'?'extracted':'unverified',
   detail:{...c.detail,quote:c.quote,...(hit.status==='hit'&&hit.multiple?{multiple_hits:true}:{}),...(page?{}:{page_out_of_range:c.page})}};
 });
 return {scope:merged.scope,rows,stated:merged.stated,unverified,chunks:chunks.length,retries,requests,responses};
}

async function storeCalls(storage:BrokerStorage,runId:string,requests:CallRecord[],responses:ResponseRecord[]):Promise<boolean>{
 try{
  const a=await storage.upload(brokerPaths.request(runId),JSON.stringify({run_id:runId,calls:requests}),'application/json');
  const b=await storage.upload(brokerPaths.response(runId),JSON.stringify({run_id:runId,calls:responses}),'application/json');
  return a==='stored'&&b==='stored';
 }catch{return false;}
}

export interface ExtractResult{runId:string;reportId:string;status:'succeeded'|'failed';errorCode?:string;counts:BatchCounts;batchStatus:string;receipt?:MaterializeReceipt;ruleReceiptId?:string}
export async function runExtract(deps:BrokerDeps,documentId:string,by:string,opts:{deadline:Date}):Promise<ExtractResult>{
 const pre=await deps.db.getDocument(documentId);
 if(pre&&pre.status!=='withdrawn'&&!pre.promotion_pending&&(pre.status!=='parsed'||!pre.current_parse_run_id))throw conflict('document_not_parsed');
 const {doc,licence,token}=await claimForProcessing(deps,documentId);
 const info=deps.llm.info();
 if(!info)return failUnavailable(deps,'broker-research-extract',documentId,token,'llm_unavailable');
 const report=await deps.db.ensureReport(documentId,deps.codeVersion);
 const parseRun=(await deps.db.getRun(doc.current_parse_run_id!))!;
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-extract',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual',toolVersions:{prompt:EXTRACT_PROMPT_VERSION,schema:SCHEMA_VERSION}});
 const runId=deps.newId(),extractorVersion=String(parseRun.detail.extractor_version??parseRun.extractor_version??'unknown');
 const digest=behaviorDigest({extractorVersion,modelId:info.modelId,registryHash:info.registryHash,promptVersion:EXTRACT_PROMPT_VERSION,schemaVersion:SCHEMA_VERSION});
 await deps.db.insertRun({run_id:runId,document_id:documentId,kind:'extract',parse_run_id:parseRun.run_id,extractor_version:extractorVersion,artifact_path:null,artifact_hash:null,
  model_id:info.modelId,registry_hash:info.registryHash,prompt_version:EXTRACT_PROMPT_VERSION,schema_version:SCHEMA_VERSION,code_version:deps.codeVersion,behavior_digest:digest,
  licence_version:licence.version,request_path:brokerPaths.request(runId),response_path:brokerPaths.response(runId),batch_id:batchId});
 const fail=async(code:string,requests:CallRecord[]=[],responses:ResponseRecord[]=[]):Promise<ExtractResult>=>{
  await storeCalls(deps.storage,runId,requests,responses);
  await deps.db.finishRun(runId,token,{status:'failed',detail:{error_code:code,calls:requests.length}});
  await deps.db.fencedUpdateDocument(documentId,token,{releaseLease:true});
  const counts=emptyCounts();const batchStatus=await finishBatch(deps.tables,batchId,{counts,errors:[{code}]},deps.now());
  await deps.db.logAccess({document_id:documentId,user_id:by,action:'extract_run',detail:{run_id:runId,status:'failed',error_code:code}});
  return {runId,reportId:report.report_id,status:'failed',errorCode:code,counts,batchStatus};
 };
 let batch:CandidateBatch;
 try{batch=await extractCandidates(deps.llm,info,await artifactLoader(deps)(parseRun.run_id),{deadline:opts.deadline,now:deps.now});}
 catch(e){if(e instanceof ExtractFailure)return fail(e.code,e.requests,e.responses);if(e instanceof BrokerError)return fail(e.code);throw e;}
 if(!await storeCalls(deps.storage,runId,batch.requests,batch.responses))return fail('storage_failed',batch.requests,batch.responses);
 const resolved=await resolveTargets(deps.tables,batch.stated,doc.uploaded_at.slice(0,10));
 const rows=batch.rows.map(r=>r.field==='ticker'&&r.target_key&&resolved.has(r.target_key)?{...r,resolution:resolved.get(r.target_key)!.resolution}:r);
 let receipt:MaterializeReceipt;
 try{receipt=await deps.db.extractCommit(documentId,token,runId,rows);}
 catch(e){if((e as {code?:string}).code==='lease_lost'||(e as {code?:string}).code==='published_immutable')return fail((e as {code:string}).code);throw e;}
 if(batch.scope&&!report.scope)await deps.db.updateReportDraft(report.report_id,{scope:batch.scope});
 const rules=await applyRules(deps,report.report_id,{batchId});
 const errors:BatchError[]=[];
 if(batch.unverified>0)errors.push({code:'span_unverified_summary',message:`${batch.unverified} quote(s) not found verbatim`});
 if(rules.quarantined>0)errors.push({code:'rules_failed_summary',message:`${rules.quarantined} quarantined`});
 if(rules.warnings>0)errors.push({code:'rule_warning_summary',message:`${rules.warnings} warning(s)`});
 if(!await deps.db.latestEvalReceipt(digest))errors.push({code:'eval_receipt_absent',key:digest});
 const counts:BatchCounts={fetched:rows.length,inserted:rows.length-batch.unverified,duplicates:0,versioned:0,quarantined:rules.quarantined,failed:0};
 await deps.db.finishRun(runId,token,{status:'succeeded',detail:{chunks:batch.chunks,retries:batch.retries,candidates:rows.length,unverified:batch.unverified,rule_receipt_id:rules.receiptId}});
 await deps.db.fencedUpdateDocument(documentId,token,{releaseLease:true});
 const batchStatus=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 await deps.db.logAccess({document_id:documentId,user_id:by,action:'extract_run',detail:{run_id:runId,status:'succeeded',candidates:rows.length}});
 return {runId,reportId:report.report_id,status:'succeeded',counts,batchStatus,receipt,ruleReceiptId:rules.receiptId};
}
```

- [ ] **Step 5: 写路由与测试**

```ts
// src/app/api/admin/broker-research/documents/[id]/extract/route.ts
// POST {}: LLM extraction of the current parse run (spec §6.2). 200 on success; failed run 502 (lease_lost 409);
// LLM unavailable 503; 409 document_not_parsed / licence_forbids_processing / lease_held / promotion_pending; 410 withdrawn.
import {adminPost,errorJson,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {runExtract} from '@/lib/broker-research/extract/run';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('documents.extract',async({ctx,userId})=>{
 const r=await runExtract(brokerDeps(),uuidParam((await ctx.params).id),userId,{deadline:deadlineFrom(new Date())});
 return r.status==='succeeded'?jsonNoStore(r):errorJson(r.errorCode!,r.errorCode==='lease_lost'?409:502,{runId:r.runId,batchStatus:r.batchStatus});
});
```

```ts
// src/app/api/admin/broker-research/documents/[id]/extract/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {recordedLlmPort} from '@/lib/broker-research/ports/llm';
import {runParse} from '@/lib/broker-research/parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST} from './route';

describe('POST documents/[id]/extract',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{vi.clearAllMocks();d=memoryBrokerDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 const url=(id:string)=>`/api/admin/broker-research/documents/${id}/extract`;
 adminGuardCases({call:(r)=>POST(r,ctxOf({id:'00000000-0000-4000-8000-000000000001'})),request:()=>jsonReq(url('x'),{}),requireAdmin:mocks.requireAdmin,post:true});
 it('409 document_not_parsed, then 200, then 502 llm_schema_invalid',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);const ctx=ctxOf({id:doc.document_id});
  const np=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(np.status).toBe(409);expect(await errCode(np)).toBe('document_not_parsed');
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const ok=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(ok.status).toBe(200);expect(await bodyOf(ok)).toMatchObject({status:'succeeded'});
  d.llm=recordedLlmPort(['x','y']);
  const bad=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(bad.status).toBe(502);expect(await errCode(bad)).toBe('llm_schema_invalid');
 });
 it('409 licence_forbids_processing after a material licence change clears the confirmation',async()=>{
  const l=await seedLicence(d.db);const doc=await seedDocument(d,l.licence_id);
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  await d.db.updateLicence(l.licence_id,{allows_public_snippets:false});
  const r=await POST(jsonReq(url(doc.document_id),{}),ctxOf({id:doc.document_id}));
  expect(r.status).toBe(409);expect(await errCode(r)).toBe('licence_forbids_processing');
 });
});
```

- [ ] **Step 6: 运行**

Run: `npm test -- src/lib/broker-research/prompts src/lib/broker-research/extract/run.test.ts "src/app/api/admin/broker-research/documents/[id]/extract"`
Expected: PASS。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 7: 提交**

```bash
git add src/lib/broker-research/prompts src/lib/broker-research/rules-run.ts src/lib/broker-research/extract/run.ts src/lib/broker-research/extract/run.test.ts "src/app/api/admin/broker-research/documents/[id]/extract" docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C5 chunked LLM extraction with stored calls, merge, locate, rules receipt, batch counters"
```

---
### Task C6: 复核服务 + 发布 / 取消发布 + 隔离钩子 + `INFO_CODES` + 路由

**Files:**
- Create: `src/lib/broker-research/review.ts`
- Create: `src/lib/broker-research/review.test.ts`
- Create: `src/lib/broker-research/quarantine-hook.ts`
- Create: `src/lib/broker-research/quarantine-hook-rules.ts`
- Create: `src/lib/broker-research/quarantine-hook.test.ts`
- Create: `src/lib/broker-research/info-codes.test.ts`
- Modify: `src/lib/dq/batches.ts`（`INFO_CODES` 末尾 `// FOREIGN` 围栏追加 `'eval_receipt_absent'`）
- Modify: `src/app/api/admin/dq/quarantine/[id]/route.ts`（`broker_research` 分支，`// FOREIGN ↓ … ↑` 围栏）
- Modify: `src/app/api/admin/dq/quarantine/[id]/route.test.ts`（围栏内追加两个用例；共享文件清单已含该路由，测试文件随之修改，PR 中写明）
- Create（均在 `src/app/api/admin/broker-research/` 下）：`reports/[id]/route.ts`（★ GET 复核数据）、`documents/[id]/pages/[n]/route.ts`（★ GET 页文本）、`reports/[id]/fields/[fieldId]/route.ts`、`reports/[id]/fields/route.ts`、`reports/[id]/fields/absent/route.ts`、`reports/[id]/bind/route.ts`、`reports/[id]/overrides/route.ts`、`reports/[id]/review/route.ts`、`reports/[id]/publish-blockers/route.ts`、`reports/[id]/publish/route.ts`、`reports/[id]/unpublish/route.ts`、`review-queue/route.ts`、`reports/review-routes.test.ts`

**要点**：每个改变证据或绑定的动作 = DB RPC（物化在同一事务）→ 新开批次 `producer='broker-research-review'` → `applyRules` → `finishBatch`（`quarantined>0` → `rules_failed_summary`）。`confirm`/`correct`/`add` 先在 TS 做 R1：`slice(artifact(parse_run_id), page, start, end) === value_source_text`，否则 `400 span_not_verbatim`（UI 框选得到跨度，服务端切片得到文本）。`correct` 的类型化分量 = `toTyped(field, valueText)` 推导值被载荷显式键覆盖，并校验单位 / 币种 / 日期 / 数值形状（`400 invalid_correction:<key>`）。发布前 TS 先跑标题披露检查（阻断第 15 条的标题面；SQL 无法跑 TS 检查——见契约修订建议 3）。

- [ ] **Step 1: `INFO_CODES` 与测试**

`src/lib/dq/batches.ts` 中把

```ts
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit'] as const;
```

改为

```ts
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit',
 // FOREIGN ↓ broker research: extract batches for a behavior_digest without any eval receipt (spec §7.4)
 'eval_receipt_absent',
 // FOREIGN ↑
] as const;
```

```ts
// src/lib/broker-research/info-codes.test.ts
import {describe,expect,it} from 'vitest';
import {INFO_CODES,batchStatusFromCounts,isInfoError} from '../dq/batches';

describe('broker research batch codes (spec §7.4)',()=>{
 it('keeps the five existing info codes and appends eval_receipt_absent',()=>{
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','eval_receipt_absent']);
 });
 it('span_unverified_summary and rules_failed_summary stay non-informational',()=>{
  for(const code of ['span_unverified_summary','rules_failed_summary','f3_failed','f3_timeout','lease_lost','lease_expired','llm_unavailable','llm_quota','llm_schema_invalid'])expect(isInfoError({code})).toBe(false);
  const counts={fetched:3,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:0};
  expect(batchStatusFromCounts(counts,[{code:'eval_receipt_absent'}])).toBe('success');
  expect(batchStatusFromCounts(counts,[{code:'rules_failed_summary'}])).toBe('partial');
 });
});
```

- [ ] **Step 2: 写复核服务失败测试**

```ts
// src/lib/broker-research/review.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {runExtract} from './extract/run';
import {PAGES} from './fixtures/pipeline';
import {runParse} from './parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {addField,bindReport,fieldAction,markAbsent,publishBlockersOf,publishReport,reviewAction,setOverride,unpublishReport} from './review';
import type {FieldRow} from './types';

async function extracted(d:MemoryDeps){
 const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
 await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 const r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 return {doc,reportId:r.reportId};
}
const span=(text:string,page=1)=>{const s=PAGES[page-1].indexOf(text);if(s<0)throw new Error(text);return {page,charStart:s,charEnd:s+text.length};};
const byField=(fs:FieldRow[],f:string)=>fs.find(x=>x.field===f&&x.superseded_by_run_id===null&&x.status!=='rejected')!;

describe('review services',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps();});
 it('confirm needs a verbatim span; an unverified row is confirmed with a framed span (spec §14 sample 2)',async()=>{
  const {reportId}=await extracted(d);
  const tp=byField(await d.db.listFields(reportId),'target_price');
  await expect(fieldAction(d,reportId,tp.field_id,'confirm',{},ADMIN_ID)).rejects.toMatchObject({code:'span_required',status:400});
  await expect(fieldAction(d,reportId,tp.field_id,'confirm',{...span('120.00'),charStart:span('120.00').charStart-1},ADMIN_ID)).rejects.toMatchObject({code:'span_not_verbatim'});
  expect((await publishBlockersOf(d,reportId)).blockers).toContain('field_pending:target_price');
  const r=await fieldAction(d,reportId,tp.field_id,'confirm',span('120.00'),ADMIN_ID);
  expect(r.rules.receiptId).toBeTruthy();
  expect(byField(await d.db.listFields(reportId),'target_price')).toMatchObject({status:'confirmed',value_source_text:'120.00'});
  expect((await publishBlockersOf(d,reportId)).blockers).not.toContain('field_pending:target_price');
 });
 it('correct derives typed components from the text and validates explicit ones',async()=>{
  const {reportId}=await extracted(d);
  const tp=byField(await d.db.listFields(reportId),'target_price');
  await expect(fieldAction(d,reportId,tp.field_id,'correct',{valueText:'US$120.00',valueUnit:'pct',...span('US$120.00')},ADMIN_ID)).rejects.toMatchObject({code:'invalid_correction:valueUnit'});
  await fieldAction(d,reportId,tp.field_id,'correct',{valueText:'120.00',...span('120.00')},ADMIN_ID);
  expect(byField(await d.db.listFields(reportId),'target_price')).toMatchObject({status:'corrected',corrected:{value_text:'120.00',value_num:'120.00',value_unit:'price'}});
 });
 it('add and absent create human rows bound to the current parse run',async()=>{
  const {reportId}=await extracted(d);
  const added=await addField(d,reportId,{field:'sector',targetKey:null,occurrence:1,valueText:'Robotics',...span('ZZ Robotics')},ADMIN_ID).catch(e=>e);
  expect(added).toMatchObject({code:'span_not_verbatim'});   // value text must be the framed text for added rows
  const ok=await addField(d,reportId,{field:'sector',targetKey:null,occurrence:1,valueText:'ZZ Robotics',...span('ZZ Robotics')},ADMIN_ID);
  expect(ok.fieldId).toBeTruthy();
  await expect(markAbsent(d,reportId,{field:'wacc',targetKey:null,page:1},ADMIN_ID)).rejects.toMatchObject({code:'invalid_parameter:field'});
  const a=await markAbsent(d,reportId,{field:'analyst',targetKey:null,page:1},ADMIN_ID);
  expect((await d.db.listFields(reportId)).find(f=>f.field_id===a.fieldId)).toMatchObject({status:'absent',value_text:'ABSENT',extractor:`human:${ADMIN_ID}`});
 });
 it('bind writes draft columns, re-materializes and re-runs rules; override upserts a resolution',async()=>{
  const {reportId}=await extracted(d);
  const inst=await d.db.upsertInstitution({name_en:'Synthetic Broker Research Ltd',name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
  const b=await bindReport(d,reportId,{institutionId:inst,scope:'single_issuer',titlePublic:'Initiation'},ADMIN_ID);
  expect(b.rules.receiptId).toBeTruthy();
  expect((await d.db.getReport(reportId))!).toMatchObject({institution_id:inst,scope:'single_issuer',title_public:'Initiation',title_public_by:ADMIN_ID});
  await expect(bindReport(d,reportId,{scope:'galaxy'},ADMIN_ID)).rejects.toMatchObject({code:'invalid_parameter:scope'});
  const o=await setOverride(d,reportId,{targetKey:'ZZBR',securityTicker:'ZZBR',note:null},ADMIN_ID);
  expect(o.receipt.targets).toBeGreaterThanOrEqual(1);
 });
 it('approve needs readiness; publish maps publish_blocked; unpublish logs',async()=>{
  const {reportId}=await extracted(d);
  await expect(reviewAction(d,reportId,'approve',ADMIN_ID)).rejects.toMatchObject({code:'review_not_ready',status:409});
  await reviewAction(d,reportId,'start',ADMIN_ID);
  expect((await d.db.getReport(reportId))!.review_status).toBe('in_review');
  await expect(publishReport(d,reportId,ADMIN_ID)).rejects.toMatchObject({code:'publish_blocked'});
  await expect(unpublishReport(d,reportId,'x',ADMIN_ID)).rejects.toBeTruthy();   // not published
 });
});
```

- [ ] **Step 3: 实现 `review.ts`**

```ts
// src/lib/broker-research/review.ts
// Review and publish services (spec §6.3, §6.5, §4.4). Every evidence/binding change goes through one DB RPC that locks
// the parent report (published → published_immutable) and re-materializes in the same transaction; afterwards the §7
// rules run on the materialized state (batch broker-research-review) so rules_input_hash and the latest receipt agree.
// R1 is enforced here before confirm/correct/add: the stored value_source_text is always the server-side slice of the
// artifact the reviewer saw. Publish runs the TS title disclosure check first (blocker 15 for title surfaces), then the
// single publish RPC; unpublish/publish are audited and access-logged.
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import {resolveIssuer} from '../entities/resolve';
import {auditAdmin} from './audit';
import {checkDisclosure} from './disclosure';
import {BrokerError,bad,conflict,notFound} from './errors';
import {toTyped} from './extract/typed';
import {isIsoDate} from './licences';
import {artifactLoader} from './parse';
import {sliceText} from './ports/f3';
import {applyRules} from './rules-run';
import type {RulesOutcome} from './rules-run';
import type {BrokerDeps,CorrectedValue,FieldAction,FieldName,FieldRow,MaterializeReceipt,ReportRow,ReportScope,ValueUnit} from './types';

type RDeps=Pick<BrokerDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>;
const FIELDS:readonly FieldName[]=['institution','analyst','published_date','price_as_of_date','ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method','sector','title'];
const ABSENT_FIELDS:readonly FieldName[]=['rating','target_price','analyst','target_horizon'];
const SCOPES:readonly ReportScope[]=['single_issuer','multi_issuer','sector','macro_strategy'];
const UNIT:Partial<Record<FieldName,ValueUnit>>={target_price:'price',price_at_report:'price',upside_stated:'pct',wacc:'pct',terminal_growth:'pct',terminal_value_share:'pct',target_horizon:'months'};
const DECIMAL=/^-?\d+(\.\d+)?$/;
const inv=(k:string)=>bad(`invalid_parameter:${k}`);

async function reportOr404(deps:Pick<BrokerDeps,'db'>,reportId:string):Promise<ReportRow>{const r=await deps.db.getReport(reportId);if(!r)throw notFound('report_not_found');return r;}
async function currentParseRun(deps:RDeps,report:ReportRow):Promise<string>{
 const doc=await deps.db.getDocument(report.document_id);
 if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
 if(!doc.current_parse_run_id)throw conflict('document_not_parsed');return doc.current_parse_run_id;
}
export interface Span{page:number;charStart:number;charEnd:number}
const spanOf=(p:Record<string,unknown>):Span|null=>{
 if(p.page===undefined&&p.charStart===undefined&&p.charEnd===undefined)return null;
 for(const k of ['page','charStart','charEnd'])if(typeof p[k]!=='number'||!Number.isSafeInteger(p[k] as number)||(p[k] as number)<0)throw inv(k);
 return {page:p.page as number,charStart:p.charStart as number,charEnd:p.charEnd as number};
};
async function sliceOr400(deps:RDeps,parseRunId:string,s:Span):Promise<string>{
 const text=sliceText(await artifactLoader(deps)(parseRunId),{page:s.page,char_start:s.charStart,char_end:s.charEnd});
 if(text===null)throw bad('span_out_of_range');return text;
}
async function afterChange(deps:RDeps,reportId:string):Promise<RulesOutcome>{
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-review',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 try{
  const rules=await applyRules(deps,reportId,{batchId});
  await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),quarantined:rules.quarantined},errors:rules.quarantined?[{code:'rules_failed_summary',message:`${rules.quarantined} quarantined`}]:[]},deps.now());
  return rules;
 }catch(e){await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code:'rules_error',message:e instanceof Error?e.message:String(e)}]},deps.now());throw e;}
}

function corrected(field:FieldName,p:Record<string,unknown>):CorrectedValue{
 if(typeof p.valueText!=='string'||!p.valueText.trim()||p.valueText.length>400)throw bad('invalid_correction:valueText');
 const t=toTyped(field,p.valueText);const out:CorrectedValue={value_text:p.valueText,value_num:t.value_num,value_currency:t.value_currency,value_unit:t.value_unit,value_date:t.value_date};
 if(p.valueNum!==undefined){if(p.valueNum!==null&&(typeof p.valueNum!=='string'||!DECIMAL.test(p.valueNum)))throw bad('invalid_correction:valueNum');out.value_num=p.valueNum as string|null;}
 if(p.valueCurrency!==undefined){if(p.valueCurrency!==null&&(typeof p.valueCurrency!=='string'||!/^[A-Z]{3}$/.test(p.valueCurrency)))throw bad('invalid_correction:valueCurrency');out.value_currency=p.valueCurrency as string|null;}
 if(p.valueUnit!==undefined){if(p.valueUnit!==null&&p.valueUnit!==(UNIT[field]??null))throw bad('invalid_correction:valueUnit');out.value_unit=p.valueUnit as ValueUnit|null;}
 if(p.valueDate!==undefined){if(p.valueDate!==null&&!isIsoDate(p.valueDate))throw bad('invalid_correction:valueDate');out.value_date=p.valueDate as string|null;}
 return out;
}

export async function fieldAction(deps:RDeps,reportId:string,fieldId:string,action:FieldAction,payload:Record<string,unknown>,by:string):Promise<{receipt:MaterializeReceipt;rules:RulesOutcome}>{
 const report=await reportOr404(deps,reportId);
 const field=(await deps.db.listFields(reportId,{includeSuperseded:true})).find(f=>f.field_id===fieldId);
 if(!field)throw notFound('field_not_found');
 let rpc:Record<string,unknown>={};
 if(action==='confirm'||action==='correct'){
  const framed=spanOf(payload);
  const s=framed??(field.page!==null&&field.char_start!==null&&field.char_end!==null?{page:field.page,charStart:field.char_start,charEnd:field.char_end}:null);
  if(!s)throw bad('span_required');
  const runId=framed?await currentParseRun(deps,report):(field.parse_run_id??await currentParseRun(deps,report));
  const text=await sliceOr400(deps,runId,s);
  const norm=(x:string)=>x.replace(/\s+/g,'');
  // stored span: must still be verbatim; framed span on confirm: must be the cited text up to whitespace (the value is unchanged)
  if(!framed&&text!==field.value_source_text)throw bad('span_not_verbatim');
  if(framed&&action==='confirm'&&norm(text)!==norm(String(field.detail.quote??field.value_text)))throw bad('span_not_verbatim');
  rpc={page:s.page,char_start:s.charStart,char_end:s.charEnd,value_source_text:text,parse_run_id:runId};
  if(action==='correct')rpc.corrected=corrected(field.field,payload);
 }else if(action==='absent'){
  if(!ABSENT_FIELDS.includes(field.field))throw inv('field');
  if(typeof payload.page!=='number')throw inv('page');rpc={page:payload.page};
 }else if(action!=='reject')throw inv('action');
 const receipt=await deps.db.fieldReview(fieldId,action,rpc,by);
 return {receipt,rules:await afterChange(deps,reportId)};
}

export interface AddInput extends Span{field:FieldName;targetKey:string|null;occurrence:number;valueText:string}
export function parseAddInput(b:Record<string,unknown>):AddInput{
 if(!FIELDS.includes(b.field as FieldName))throw inv('field');
 if(b.targetKey!==undefined&&b.targetKey!==null&&(typeof b.targetKey!=='string'||b.targetKey.length>64))throw inv('targetKey');
 const occ=b.occurrence??1;if(typeof occ!=='number'||!Number.isSafeInteger(occ)||occ<1||occ>50)throw inv('occurrence');
 if(typeof b.valueText!=='string'||!b.valueText.trim()||b.valueText.length>400)throw inv('valueText');
 const s=spanOf(b);if(!s)throw bad('span_required');
 return {field:b.field as FieldName,targetKey:(b.targetKey as string|null|undefined)??null,occurrence:occ,valueText:b.valueText,...s};
}
export async function addField(deps:RDeps,reportId:string,i:AddInput,by:string):Promise<{fieldId:string;receipt:MaterializeReceipt;rules:RulesOutcome}>{
 const report=await reportOr404(deps,reportId);const runId=await currentParseRun(deps,report);
 const text=await sliceOr400(deps,runId,i);
 if(text!==i.valueText)throw bad('span_not_verbatim');
 const r=await deps.db.insertHumanField(reportId,{target_key:i.targetKey,field:i.field,occurrence:i.occurrence,page:i.page,char_start:i.charStart,char_end:i.charEnd,
  value_source_text:text,...toTyped(i.field,i.valueText),parse_run_id:runId,status:'confirmed'},by);
 return {...r,rules:await afterChange(deps,reportId)};
}
export async function markAbsent(deps:RDeps,reportId:string,i:{field:FieldName;targetKey:string|null;page:number},by:string):Promise<{fieldId:string;receipt:MaterializeReceipt;rules:RulesOutcome}>{
 if(!ABSENT_FIELDS.includes(i.field))throw inv('field');
 if(!Number.isSafeInteger(i.page)||i.page<1)throw inv('page');
 const report=await reportOr404(deps,reportId);const runId=await currentParseRun(deps,report);
 const r=await deps.db.insertHumanField(reportId,{target_key:i.targetKey,field:i.field,occurrence:1,page:i.page,char_start:null,char_end:null,value_source_text:null,
  value_text:'ABSENT',value_num:null,value_currency:null,value_unit:null,value_date:null,parse_run_id:runId,status:'absent'},by);
 return {...r,rules:await afterChange(deps,reportId)};
}

export interface BindInput{institutionId?:string|null;scope?:unknown;reportType?:string|null;primaryTargetKey?:string|null;supersedesReportId?:string|null;titlePublic?:string|null;analyst?:{analystId:string;fieldId:string;role?:string|null}}
export async function bindReport(deps:RDeps,reportId:string,b:BindInput,by:string):Promise<{receipt:MaterializeReceipt;rules:RulesOutcome}>{
 await reportOr404(deps,reportId);
 const patch:Parameters<RDeps['db']['updateReportDraft']>[1]={};
 const nullableStr=(v:unknown,k:string,max:number)=>{if(v!==null&&(typeof v!=='string'||!v.trim()||v.length>max))throw inv(k);return v as string|null;};
 if(b.institutionId!==undefined)patch.institution_id=nullableStr(b.institutionId,'institutionId',36);
 if(b.scope!==undefined){if(!SCOPES.includes(b.scope as ReportScope))throw inv('scope');patch.scope=b.scope as ReportScope;}
 if(b.reportType!==undefined)patch.report_type=nullableStr(b.reportType,'reportType',80);
 if(b.primaryTargetKey!==undefined)patch.primary_target_key=nullableStr(b.primaryTargetKey,'primaryTargetKey',64);
 if(b.supersedesReportId!==undefined){const v=nullableStr(b.supersedesReportId,'supersedesReportId',36);if(v===reportId)throw inv('supersedesReportId');patch.supersedes_report_id=v;}
 if(b.titlePublic!==undefined){patch.title_public=nullableStr(b.titlePublic,'titlePublic',300);patch.title_public_by=patch.title_public===null?null:by;}
 if(Object.keys(patch).length)await deps.db.updateReportDraft(reportId,patch);
 if(b.analyst){
  const f=(await deps.db.listFields(reportId)).find(x=>x.field_id===b.analyst!.fieldId);
  if(!f||f.field!=='analyst'||!['confirmed','corrected'].includes(f.status))throw bad('analyst_field_required');
  await deps.db.bindAnalyst({report_id:reportId,analyst_id:b.analyst.analystId,role:b.analyst.role??null,field_id:f.field_id});
 }
 const receipt=await deps.db.materialize(reportId);
 return {receipt,rules:await afterChange(deps,reportId)};
}
export async function setOverride(deps:RDeps&Pick<BrokerDeps,'tables'>,reportId:string,i:{targetKey:string;securityTicker:string;note:string|null},by:string):Promise<{receipt:MaterializeReceipt;rules:RulesOutcome}>{
 const report=await reportOr404(deps,reportId);const doc=(await deps.db.getDocument(report.document_id))!;
 const issuer=await resolveIssuer(deps.tables,{ticker:i.securityTicker},{today:doc.uploaded_at.slice(0,10)});
 const receipt=await deps.db.upsertTargetOverride({report_id:reportId,target_key:i.targetKey,security_ticker:i.securityTicker,issuer_id:issuer?.issuer_id??null,set_by:by,note:i.note});
 return {receipt,rules:await afterChange(deps,reportId)};
}

export async function publishBlockersOf(deps:Pick<BrokerDeps,'db'>,reportId:string):Promise<{blockers:string[];reviewReady:boolean}>{
 await reportOr404(deps,reportId);const blockers=await deps.db.publishBlockers(reportId);
 return {blockers,reviewReady:blockers.filter(b=>b!=='review_not_approved').length===0};
}
export async function reviewAction(deps:RDeps,reportId:string,action:'start'|'approve'|'reject',by:string):Promise<ReportRow>{
 if(action==='approve'){const {blockers,reviewReady}=await publishBlockersOf(deps,reportId);if(!reviewReady)throw conflict('review_not_ready',{blockers});}
 else await reportOr404(deps,reportId);
 await deps.db.updateReportDraft(reportId,{review_status:action==='start'?'in_review':action==='approve'?'approved':'rejected'});
 await auditAdmin(deps.tables,by,`broker_research.review_${action}`,reportId,{},deps.now());
 return reportOr404(deps,reportId);
}
/** Title surfaces of blocker 15 (snippets/summaries carry their own stored checks). */
export async function titleDisclosure(deps:Pick<BrokerDeps,'db'>,report:ReportRow):Promise<{failures:string[];originalPassed:boolean}>{
 const doc=(await deps.db.getDocument(report.document_id))!;const licence=(await deps.db.getLicence(doc.licence_id))!;
 const targets=await deps.db.listTargets(report.report_id);const analysts=report.institution_id?await deps.db.listAnalysts(report.institution_id):[];
 const ok=(t:string|null)=>t===null||checkDisclosure({text:t,targets,analysts,licence}).passed;
 const failures=(['title_public','title_zh','title_en'] as const).filter(k=>!ok(report[k])).map(k=>`restricted_value_in_text:${k}`);
 const originalPassed=ok(report.title_original);
 if(!originalPassed&&report.title_public===null)failures.push('restricted_value_in_text:title_original');
 return {failures,originalPassed};
}
export async function publishReport(deps:RDeps,reportId:string,by:string):Promise<{publicationId:string}>{
 const report=await reportOr404(deps,reportId);
 const t=await titleDisclosure(deps,report);
 if(t.failures.length)throw conflict('publish_blocked',{reasons:t.failures});
 const r=await deps.db.publish(reportId,by);
 await auditAdmin(deps.tables,by,'broker_research.publish',reportId,{publication_id:r.publicationId},deps.now());
 return r;
}
export async function unpublishReport(deps:RDeps,reportId:string,reason:string,by:string):Promise<ReportRow>{
 const report=await reportOr404(deps,reportId);
 if(report.status!=='published')throw conflict('not_published');
 await deps.db.unpublish(reportId,by,reason);
 await deps.db.logAccess({document_id:report.document_id,user_id:by,action:'unpublish',detail:{report_id:reportId,reason}});
 await auditAdmin(deps.tables,by,'broker_research.unpublish',reportId,{reason},deps.now());
 return reportOr404(deps,reportId);
}

/** ★ review payload: private evidence (spans, source text), runs, blockers, open quarantine items. */
export async function reviewData(deps:RDeps,reportId:string){
 const report=await reportOr404(deps,reportId);const doc=(await deps.db.getDocument(report.document_id))!;
 if(doc.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
 const [fields,targets,snippets,summaries,runs,blockers]=await Promise.all([deps.db.listFields(reportId,{includeSuperseded:true}),deps.db.listTargets(reportId),
  deps.db.listSnippets(reportId),deps.db.listSummaries(reportId),deps.db.listRuns(doc.document_id),deps.db.publishBlockers(reportId)]);
 const quarantine=(await deps.tables.select('dq_quarantine',{dataset:'broker_research',status:'open'},{limit:1000})).filter(q=>String(q.natural_key).startsWith(`${doc.sha256}:`));
 return {payload:{report,document:doc,fields,targets,snippets,summaries,runs,blockers,quarantine},log:{document_id:doc.document_id,user_id:'',action:'text_viewed' as const,detail:{report_id:reportId,surface:'review'}}};
}
export async function pageText(deps:RDeps,documentId:string,page:number){
 const doc=await deps.db.getDocument(documentId);
 if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
 if(!doc.current_parse_run_id)throw conflict('document_not_parsed');
 const a=await artifactLoader(deps)(doc.current_parse_run_id);const p=a.pages.find(x=>x.page===page);
 if(!p)throw notFound('page_not_found');
 return {payload:{documentId,parseRunId:doc.current_parse_run_id,page,text:p.text,pageCount:a.page_count},log:{document_id:documentId,user_id:'',action:'text_viewed' as const,detail:{page,parse_run_id:doc.current_parse_run_id}}};
}
export type {FieldRow};
```

- [ ] **Step 4: 写隔离钩子与其测试**

```ts
// src/lib/broker-research/quarantine-hook.ts
// dataset='broker_research' branch of POST /api/admin/dq/quarantine/[id] (spec §7.3). The verdict and its side effect
// (override upsert / rating-scale row / supersedes / review rejected) commit together inside the SQL function
// broker_quarantine_resolve, which locks the item first (not open → already_resolved, no write) and the report second
// (published → published_immutable); missing params → hook_params_required and a rollback. After an accepted verdict
// the rules are re-run so the new rules_input_hash gets its receipt; a rules failure is reported, not a 500 (the verdict
// is committed).
import {BrokerResearchDbError} from './types';
import type {BrokerDeps} from './types';
import {afterRulesForItem} from './quarantine-hook-rules';

export type ResolveRpc=(fn:'broker_quarantine_resolve',args:{p_id:string;p_status:string;p_by:string;p_payload:Record<string,unknown>})=>PromiseLike<{data:unknown;error:{message:string}|null}>;
export type BrokerResolveOutcome='resolved'|'already_resolved'|'not_found';
const toDbError=(m:string)=>{const i=m.indexOf(':');return new BrokerResearchDbError(i<0?m:m.slice(0,i),m,i<0?undefined:m.slice(i+1));};

export async function resolveBrokerQuarantine(rpc:ResolveRpc,input:{id:string;status:'resolved_accept'|'resolved_reject';by:string;payload:Record<string,unknown>}):Promise<BrokerResolveOutcome>{
 const {data,error}=await rpc('broker_quarantine_resolve',{p_id:input.id,p_status:input.status,p_by:input.by,p_payload:input.payload});
 if(error)throw toDbError(error.message);
 if(data!=='resolved'&&data!=='already_resolved'&&data!=='not_found')throw new BrokerResearchDbError('unknown',`unexpected result ${String(data)}`);
 return data;
}
export async function resolveBrokerItem(deps:Pick<BrokerDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>,rpc:ResolveRpc,item:{id:string;natural_key:string},
 input:{status:'resolved_accept'|'resolved_reject';by:string;payload:Record<string,unknown>}):Promise<{outcome:BrokerResolveOutcome;rules:'ok'|'failed'|'skipped'}>{
 const outcome=await resolveBrokerQuarantine(rpc,{id:item.id,...input});
 if(outcome!=='resolved'||input.status!=='resolved_accept')return {outcome,rules:'skipped'};
 return {outcome,rules:await afterRulesForItem(deps,item.natural_key)};
}
```

把重跑规则拆到独立小文件，避免 `quarantine-hook.ts` 依赖整套 review 服务：

```ts
// src/lib/broker-research/quarantine-hook-rules.ts
// Re-runs the rules for the report a broker_research quarantine item belongs to (natural key `${sha256}:${rule}:${target}`).
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import {applyRules} from './rules-run';
import type {BrokerDeps} from './types';

export async function afterRulesForItem(deps:Pick<BrokerDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>,naturalKey:string):Promise<'ok'|'failed'>{
 try{
  const doc=await deps.db.findDocumentBySha(naturalKey.split(':')[0]);const report=doc?await deps.db.reportByDocument(doc.document_id):null;
  if(!report)return 'failed';
  const {batchId}=await startBatch(deps.tables,{producer:'broker-research-review',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
  const r=await applyRules(deps,report.report_id,{batchId});
  await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),quarantined:r.quarantined},errors:r.quarantined?[{code:'rules_failed_summary'}]:[]},deps.now());
  return 'ok';
 }catch(e){console.error('[broker-research] rules after quarantine resolve failed',e instanceof Error?e.message:e);return 'failed';}
}
```


```ts
// src/lib/broker-research/quarantine-hook.test.ts
import {describe,expect,it,vi} from 'vitest';
import {resolveBrokerItem,resolveBrokerQuarantine} from './quarantine-hook';
import {memoryBrokerDeps} from './testing';

const ID='00000000-0000-4000-8000-0000000000aa',BY='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
describe('broker quarantine hook',()=>{
 it('passes the verdict to broker_quarantine_resolve and returns its outcome',async()=>{
  const rpc=vi.fn(async()=>({data:'resolved',error:null}));
  expect(await resolveBrokerQuarantine(rpc,{id:ID,status:'resolved_accept',by:BY,payload:{target_key:'ZZBR',security_ticker:'ZZBR'}})).toBe('resolved');
  expect(rpc).toHaveBeenCalledWith('broker_quarantine_resolve',{p_id:ID,p_status:'resolved_accept',p_by:BY,p_payload:{target_key:'ZZBR',security_ticker:'ZZBR'}});
 });
 it('maps SQL errors to BrokerResearchDbError codes',async()=>{
  await expect(resolveBrokerQuarantine(async()=>({data:null,error:{message:'hook_params_required:security_ticker'}}),{id:ID,status:'resolved_accept',by:BY,payload:{}})).rejects.toMatchObject({code:'hook_params_required',detail:'security_ticker'});
  await expect(resolveBrokerQuarantine(async()=>({data:null,error:{message:'published_immutable'}}),{id:ID,status:'resolved_accept',by:BY,payload:{}})).rejects.toMatchObject({code:'published_immutable'});
 });
 it('already_resolved and reject skip the rules re-run',async()=>{
  const d=memoryBrokerDeps();
  expect(await resolveBrokerItem(d,async()=>({data:'already_resolved',error:null}),{id:ID,natural_key:'x:y:-'},{status:'resolved_accept',by:BY,payload:{}})).toEqual({outcome:'already_resolved',rules:'skipped'});
  expect(await resolveBrokerItem(d,async()=>({data:'resolved',error:null}),{id:ID,natural_key:'x:y:-'},{status:'resolved_reject',by:BY,payload:{}})).toEqual({outcome:'resolved',rules:'skipped'});
 });
});
```

- [ ] **Step 5: 在 `dq/quarantine/[id]/route.ts` 加 `broker_research` 分支**

在 import 区末尾加：

```ts
// FOREIGN ↓ broker research quarantine hook (foreign research plan C6; spec §7.3)
import {coreDeps as brokerCoreDeps} from '@/lib/broker-research/deps';
import {resolveBrokerItem,type ResolveRpc} from '@/lib/broker-research/quarantine-hook';
import {BrokerResearchDbError} from '@/lib/broker-research/types';
// FOREIGN ↑
```

把 `if (String(item.dataset).startsWith('facts.')) { … } else {` 中的 `} else {` 改为：

```ts
    // FOREIGN ↓ broker_research items resolve inside broker_quarantine_resolve (one transaction), never resolveQuarantine
    } else if (item.dataset === 'broker_research') {
      const payload = (body as { payload?: unknown } | null)?.payload ?? {};
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
      }
      try {
        const r = await resolveBrokerItem(brokerCoreDeps(), ((fn, args) => (admin.rpc as unknown as ResolveRpc)(fn, args)) as ResolveRpc,
          { id, natural_key: String(item.natural_key) }, { status: status as Resolution, by: user.id, payload: payload as Record<string, unknown> });
        outcome = r.outcome;
        extra = { rules: r.rules };
      } catch (e) {
        if (e instanceof BrokerResearchDbError && (e.code === 'published_immutable' || e.code === 'hook_params_required')) {
          return NextResponse.json({ id, outcome: e.code }, { status: e.code === 'published_immutable' ? 409 : 400 });
        }
        throw e;
      }
    // FOREIGN ↑
    } else {
```

在 `route.test.ts` 末尾 `describe` 内追加（围栏）：

```ts
  // FOREIGN ↓ broker_research branch
  it('routes broker_research items to broker_quarantine_resolve and never to resolveQuarantine', async () => {
    await client.update('dq_quarantine', { id: ID }, { dataset: 'broker_research', table_name: 'broker_research_reports', natural_key: 'a:ticker_resolution:ZZBR', reason_code: 'unresolved_ticker' });
    const rpc = vi.fn(async () => ({ data: 'already_resolved', error: null }));
    mocks.getAdmin.mockReturnValue({ from: mocks.from, rpc });
    const res = await json({ status: 'resolved_accept', payload: { target_key: 'ZZBR', security_ticker: 'ZZBR' } });
    expect(res.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith('broker_quarantine_resolve', expect.objectContaining({ p_id: ID, p_status: 'resolved_accept' }));
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('maps hook_params_required to 400 for broker_research items', async () => {
    await client.update('dq_quarantine', { id: ID }, { dataset: 'broker_research', natural_key: 'a:ticker_resolution:ZZBR' });
    mocks.getAdmin.mockReturnValue({ from: mocks.from, rpc: async () => ({ data: null, error: { message: 'hook_params_required:security_ticker' } }) });
    const res = await json({ status: 'resolved_accept', payload: {} });
    expect(res.status).toBe(400);
  });
  // FOREIGN ↑
```

并在该测试文件顶部 mock 区追加 `vi.mock('@/lib/broker-research/deps', () => ({ coreDeps: () => ({}) }));`（同样围栏）。

- [ ] **Step 6: 实现复核路由（全部 thin）**

```ts
// src/app/api/admin/broker-research/reports/[id]/route.ts
// ★ GET: review payload (private spans and source text, runs, blockers, open quarantine items); text_viewed logged first.
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {reviewData} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const GET=adminGet<Ctx>('reports.get',async({ctx,userId})=>{
 const deps=brokerDeps();const {payload,log}=await reviewData(deps,uuidParam((await ctx.params).id));
 return respondLogged(deps.db,{...log,user_id:userId},payload);
});
```

```ts
// src/app/api/admin/broker-research/documents/[id]/pages/[n]/route.ts
// ★ GET: one page of the current parse artifact (text_viewed logged first; withdrawn → 410).
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
import {pageText} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string;n:string}>}
export const GET=adminGet<Ctx>('documents.page',async({ctx,userId})=>{
 const p=await ctx.params;const n=Number(p.n);if(!/^[1-9]\d{0,4}$/.test(p.n))throw bad('invalid_parameter:n');
 const deps=brokerDeps();const {payload,log}=await pageText(deps,uuidParam(p.id),n);
 return respondLogged(deps.db,{...log,user_id:userId},payload);
});
```

```ts
// src/app/api/admin/broker-research/reports/[id]/fields/[fieldId]/route.ts
// POST {action, payload}: confirm | correct | reject | absent one evidence row (spec §6.3).
import {adminPost,enumField,jsonNoStore,objField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {fieldAction} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string;fieldId:string}>}
export const POST=adminPost<Ctx>('reports.field_action',async({ctx,body,userId})=>{
 const p=await ctx.params;
 return jsonNoStore(await fieldAction(brokerDeps(),uuidParam(p.id),uuidParam(p.fieldId,'fieldId'),enumField(body,'action',['confirm','correct','reject','absent'] as const),objField(body,'payload'),userId));
});
```

```ts
// src/app/api/admin/broker-research/reports/[id]/fields/route.ts
// POST {field, targetKey?, occurrence?, valueText, page, charStart, charEnd}: human evidence row (confirmed).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {addField,parseAddInput} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.field_add',async({ctx,body,userId})=>jsonNoStore(await addField(brokerDeps(),uuidParam((await ctx.params).id),parseAddInput(body),userId),201));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/fields/absent/route.ts
// POST {field, targetKey?, page}: "the report states no <field>" (rating/target_price/analyst/target_horizon only).
import {adminPost,enumField,intField,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {markAbsent} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.field_absent',async({ctx,body,userId})=>jsonNoStore(await markAbsent(brokerDeps(),uuidParam((await ctx.params).id),{
 field:enumField(body,'field',['rating','target_price','analyst','target_horizon'] as const),targetKey:strField(body,'targetKey',{max:64,optional:true})??null,page:intField(body,'page',1,99999)},userId),201));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/bind/route.ts
// POST {institutionId?, scope?, reportType?, primaryTargetKey?, supersedesReportId?, titlePublic?, analyst?}.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bindReport} from '@/lib/broker-research/review';
import type {BindInput} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.bind',async({ctx,body,userId})=>{
 const a=body.analyst as Record<string,unknown>|undefined;
 const analyst=a===undefined?undefined:{analystId:uuidParam(a.analystId,'analyst.analystId'),fieldId:uuidParam(a.fieldId,'analyst.fieldId'),role:typeof a.role==='string'?a.role:null};
 if(body.institutionId!==undefined&&body.institutionId!==null)uuidParam(body.institutionId,'institutionId');
 if(body.supersedesReportId!==undefined&&body.supersedesReportId!==null)uuidParam(body.supersedesReportId,'supersedesReportId');
 return jsonNoStore(await bindReport(brokerDeps(),uuidParam((await ctx.params).id),{...(body as BindInput),analyst},userId));
});
```

```ts
// src/app/api/admin/broker-research/reports/[id]/overrides/route.ts
// POST {targetKey, securityTicker, note?}: resolution override (spec §4.5) → materialize → rules.
import {TICKER_RE} from '@/lib/facts/public-route';
import {adminPost,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
import {setOverride} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.override',async({ctx,body,userId})=>{
 const securityTicker=strField(body,'securityTicker',{max:24});if(!TICKER_RE.test(securityTicker))throw bad('invalid_parameter:securityTicker');
 return jsonNoStore(await setOverride(brokerDeps(),uuidParam((await ctx.params).id),{targetKey:strField(body,'targetKey',{max:64}),securityTicker,note:strField(body,'note',{max:500,optional:true})??null},userId));
});
```

```ts
// src/app/api/admin/broker-research/reports/[id]/review/route.ts
// POST {action: start|approve|reject}; approve requires the review-ready predicate (409 review_not_ready {blockers}).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {reviewAction} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.review',async({ctx,body,userId})=>jsonNoStore({report:await reviewAction(brokerDeps(),uuidParam((await ctx.params).id),enumField(body,'action',['start','approve','reject'] as const),userId)}));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/publish-blockers/route.ts
// GET: blockers (committed state) and the review-ready predicate.
import {adminGet,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {publishBlockersOf} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const GET=adminGet<Ctx>('reports.blockers',async({ctx})=>jsonNoStore(await publishBlockersOf(brokerDeps(),uuidParam((await ctx.params).id))));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/publish/route.ts
// POST {}: the only way to publish (broker_report_publish under a row lock); 409 publish_blocked {reasons}.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {publishReport} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.publish',async({ctx,userId})=>jsonNoStore(await publishReport(brokerDeps(),uuidParam((await ctx.params).id),userId)));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/unpublish/route.ts
// POST {reason}: back to draft, revision+1, snapshot closed, claim.retract in the outbox (SQL).
import {adminPost,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {unpublishReport} from '@/lib/broker-research/review';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.unpublish',async({ctx,body,userId})=>jsonNoStore({report:await unpublishReport(brokerDeps(),uuidParam((await ctx.params).id),strField(body,'reason',{max:500}),userId)}));
```

```ts
// src/app/api/admin/broker-research/review-queue/route.ts
// GET ?status=&limit=: reports awaiting review (metadata only, no spans).
import {QueryError,intParam,readParams} from '@/lib/facts/public-route';
import {adminGet,jsonNoStore} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
import type {ReviewStatus} from '@/lib/broker-research/types';

export const dynamic='force-dynamic';
const STATUSES:readonly ReviewStatus[]=['pending','in_review','approved','rejected'];
export const GET=adminGet<unknown>('review_queue',async({request})=>{
 let p:Map<string,string>,limit:number;
 try{p=readParams(new URL(request.url),['status','limit','receipt']);limit=intParam(p,'limit',50,200);}catch(e){if(e instanceof QueryError)throw bad(e.message);throw e;}
 const status=p.get('status');if(status!==undefined&&!STATUSES.includes(status as ReviewStatus))throw bad('invalid_parameter:status');
 return jsonNoStore({reports:await brokerDeps().db.reviewQueue({status:status as ReviewStatus|undefined,limit})});
});
```

- [ ] **Step 7: 写复核路由测试**

```ts
// src/app/api/admin/broker-research/reports/review-routes.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {runExtract} from '@/lib/broker-research/extract/run';
import {PAGES} from '@/lib/broker-research/fixtures/pipeline';
import {runParse} from '@/lib/broker-research/parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {GET as REPORT} from './[id]/route';
import {GET as PAGE} from '../documents/[id]/pages/[n]/route';
import {POST as FIELD} from './[id]/fields/[fieldId]/route';
import {POST as ABSENT} from './[id]/fields/absent/route';
import {POST as PUBLISH} from './[id]/publish/route';
import {GET as BLOCKERS} from './[id]/publish-blockers/route';
import {POST as REVIEW} from './[id]/review/route';

const B='/api/admin/broker-research/reports';
const X='00000000-0000-4000-8000-000000000001';
describe('review routes',()=>{
 let d:MemoryDeps,reportId:string,documentId:string;
 beforeEach(async()=>{
  vi.clearAllMocks();d=memoryBrokerDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);documentId=doc.document_id;
  await runParse(d,documentId,ADMIN_ID,{deadline:DEADLINE()});
  reportId=(await runExtract(d,documentId,ADMIN_ID,{deadline:DEADLINE()})).reportId;
 });
 adminGuardCases({call:(r)=>REPORT(r,ctxOf({id:X})),request:()=>getReq(`${B}/${X}`),requireAdmin:mocks.requireAdmin,post:false});
 adminGuardCases({call:(r)=>FIELD(r,ctxOf({id:X,fieldId:X})),request:()=>jsonReq(`${B}/${X}/fields/${X}`,{action:'reject'}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>PUBLISH(r,ctxOf({id:X})),request:()=>jsonReq(`${B}/${X}/publish`,{}),requireAdmin:mocks.requireAdmin,post:true});
 it('★ report: logs text_viewed first; log failure 500 without fields; withdrawn 410',async()=>{
  const ok=await REPORT(getReq(`${B}/${reportId}`),ctxOf({id:reportId}));
  expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('no-store');
  expect((await bodyOf<{fields:unknown[]}>(ok)).fields.length).toBeGreaterThan(0);
  expect((await d.db.listAccessLog({documentId,limit:20})).filter(r=>r.action==='text_viewed')).toHaveLength(1);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(d.db,'logAccess').mockRejectedValueOnce(new Error('down'));
  const f=await REPORT(getReq(`${B}/${reportId}`),ctxOf({id:reportId}));
  expect(f.status).toBe(500);expect(await f.text()).not.toContain('value_source_text');spy.mockRestore();
  await d.db.updateDocument(documentId,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'x'});
  expect((await REPORT(getReq(`${B}/${reportId}`),ctxOf({id:reportId}))).status).toBe(410);
 });
 it('★ page: text of page 1; 404 past the last page; 400 malformed',async()=>{
  const ok=await PAGE(getReq(`/api/admin/broker-research/documents/${documentId}/pages/1`),ctxOf({id:documentId,n:'1'}));
  expect((await bodyOf<{text:string}>(ok)).text).toBe(PAGES[0]);
  expect((await PAGE(getReq('/x'),ctxOf({id:documentId,n:'9'}))).status).toBe(404);
  expect((await PAGE(getReq('/x'),ctxOf({id:documentId,n:'0'}))).status).toBe(400);
 });
 it('field action: 400 unknown action, 404 unknown field, 200 confirm with a framed span',async()=>{
  const tp=(await d.db.listFields(reportId)).find(f=>f.field==='target_price')!;
  expect((await FIELD(jsonReq(`${B}/${reportId}/fields/${tp.field_id}`,{action:'nuke'}),ctxOf({id:reportId,fieldId:tp.field_id}))).status).toBe(400);
  expect((await FIELD(jsonReq(`${B}/${reportId}/fields/${X}`,{action:'reject'}),ctxOf({id:reportId,fieldId:X}))).status).toBe(404);
  const s=PAGES[0].indexOf('120.00');
  const r=await FIELD(jsonReq(`${B}/${reportId}/fields/${tp.field_id}`,{action:'confirm',payload:{page:1,charStart:s,charEnd:s+6}}),ctxOf({id:reportId,fieldId:tp.field_id}));
  expect(r.status).toBe(200);
 });
 it('absent 201; review approve 409 review_not_ready; publish 409 publish_blocked with reasons; blockers GET',async()=>{
  expect((await ABSENT(jsonReq(`${B}/${reportId}/fields/absent`,{field:'analyst',page:1}),ctxOf({id:reportId}))).status).toBe(201);
  const a=await REVIEW(jsonReq(`${B}/${reportId}/review`,{action:'approve'}),ctxOf({id:reportId}));
  expect(a.status).toBe(409);expect(await errCode(a)).toBe('review_not_ready');
  const p=await PUBLISH(jsonReq(`${B}/${reportId}/publish`,{}),ctxOf({id:reportId}));
  expect(p.status).toBe(409);expect((await bodyOf<{error:{code:string;reasons:string[]}}>(p)).error.reasons).toContain('review_not_approved');
  const b=await BLOCKERS(getReq(`${B}/${reportId}/publish-blockers`),ctxOf({id:reportId}));
  expect((await bodyOf<{reviewReady:boolean}>(b)).reviewReady).toBe(false);
 });
});
```

- [ ] **Step 8: 运行**

Run: `npm test -- src/lib/broker-research src/app/api/admin/broker-research src/app/api/admin/dq src/lib/dq`
Expected: PASS（含既有 `dq` 测试不回归）。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 9: 提交**

```bash
git add src/lib/broker-research/review.ts src/lib/broker-research/review.test.ts src/lib/broker-research/quarantine-hook.ts src/lib/broker-research/quarantine-hook-rules.ts src/lib/broker-research/quarantine-hook.test.ts src/lib/broker-research/info-codes.test.ts src/lib/dq/batches.ts "src/app/api/admin/dq/quarantine/[id]/route.ts" "src/app/api/admin/dq/quarantine/[id]/route.test.ts" src/app/api/admin/broker-research/reports src/app/api/admin/broker-research/review-queue "src/app/api/admin/broker-research/documents/[id]/pages" docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C6 review, publish/unpublish, quarantine hook, eval_receipt_absent info code"
```

---
### Task C7: 独立摘要（四段提示词 + 三检查 + 批准）、标题翻译、片段、撤回 / 清除步骤表 + 路由

**Files:**
- Create: `src/lib/broker-research/prompts/independent-summary.v1.md`
- Modify: `src/lib/broker-research/prompts/index.ts`（追加 `SUMMARY_PROMPT`、`TRANSLATE_PROMPT`）
- Modify: `src/lib/broker-research/prompts/prompts.test.ts`（追加 summary 用例）
- Create: `src/lib/broker-research/summary/run.ts`
- Create: `src/lib/broker-research/summary/run.test.ts`
- Create: `src/lib/broker-research/snippets.ts`
- Create: `src/lib/broker-research/snippets.test.ts`
- Create: `src/lib/broker-research/withdraw.ts`
- Create: `src/lib/broker-research/withdraw.test.ts`
- Create（`src/app/api/admin/broker-research/` 下）：`reports/[id]/summary/route.ts`、`reports/[id]/translate/route.ts`、`reports/[id]/snippets/route.ts`、`snippets/[id]/route.ts`、`summaries/[id]/route.ts`、`documents/[id]/withdraw/route.ts`、`documents/[id]/purge/route.ts`、`access-log/route.ts`、`publications/[id]/route.ts`、`text-routes.test.ts`

**摘要状态**：生成后三检查——(a) `max_verbatim_overlap ≤ licence.snippet_max_chars`，(b) `numeric_grounding.passed`，(c) `disclosure_check.passed`；全过 → `draft`，否则 `rejected`（原因码 `summary_overlap|summary_ungrounded|restricted_value|restricted_name`，作为该次 summary 批次的非信息码，批次 `partial`）。`input_hash := reports.summary_input_digest`（为 null → `409 materialize_stale`）。批准：`input_hash` 仍等于当前 `summary_input_digest`（否则 `409 summary_stale`）、重算披露检查（不过 → 置 `rejected` 并 `409 restricted_*`）、同语言已有 `approved` 先回 `draft`（唯一索引）。O11 默认：清除时摘要文本保留，只置 `rejected`。

- [ ] **Step 1: 摘要提示词**

`src/lib/broker-research/prompts/independent-summary.v1.md`（全文，`SUMMARY_PROMPT_VERSION='independent-summary/1'`；`{{LANG}}` 由服务替换为 `中文` / `English`）：

```md
You write the OsbornAlpha independent summary of one sell-side research report, in {{LANG}}.
It is an AI-generated summary, not the institution's text. Output Markdown with exactly these four sections, in this order:

## 报告定位 / Positioning
## 核心结论 / Key conclusions
## 方法论 / Methodology
## 风险与边界 / Risks and limits

(Use the Chinese heading when writing Chinese, the English heading when writing English.)

Hard rules:
1. Do not quote the report. Never copy a run of more than ten consecutive words or characters from the source text; paraphrase.
2. The only numbers you may write are the values in EFFECTIVE_FIELDS. Do not write any other number, year, count, ratio or percentage.
3. Every number must appear in the form "<ticker> 的 <field label> <value> <unit>" (Chinese) or "<ticker>'s <field label> <value> <unit>" (English),
   one number per sentence, e.g. "9988.HK 的 目标价 120.00 HKD" / "9988.HK's target price 120.00 HKD". With a single target the ticker may be omitted.
4. Do not name any analyst. Do not state a target price or upside unless it is in EFFECTIVE_FIELDS.
5. If a section has nothing grounded to say, write one sentence saying the report does not state it.
```

在 `prompts/index.ts` 末尾追加：

```ts
export const SUMMARY_PROMPT=`You write the OsbornAlpha independent summary of one sell-side research report, in {{LANG}}.
It is an AI-generated summary, not the institution's text. Output Markdown with exactly these four sections, in this order:

## 报告定位 / Positioning
## 核心结论 / Key conclusions
## 方法论 / Methodology
## 风险与边界 / Risks and limits

(Use the Chinese heading when writing Chinese, the English heading when writing English.)

Hard rules:
1. Do not quote the report. Never copy a run of more than ten consecutive words or characters from the source text; paraphrase.
2. The only numbers you may write are the values in EFFECTIVE_FIELDS. Do not write any other number, year, count, ratio or percentage.
3. Every number must appear in the form "<ticker> 的 <field label> <value> <unit>" (Chinese) or "<ticker>'s <field label> <value> <unit>" (English),
   one number per sentence, e.g. "9988.HK 的 目标价 120.00 HKD" / "9988.HK's target price 120.00 HKD". With a single target the ticker may be omitted.
4. Do not name any analyst. Do not state a target price or upside unless it is in EFFECTIVE_FIELDS.
5. If a section has nothing grounded to say, write one sentence saying the report does not state it.
`;
/** Title translation (run kind 'translate'); not a reviewed .md — the output is checked by disclosure at publish. */
export const TRANSLATE_PROMPT='Translate the research report title into Chinese and English. Answer with JSON {"zh": "...", "en": "..."} only. Keep tickers as written; do not add numbers.';
```

`prompts.test.ts` 追加：`it('independent-summary.v1',()=>{expect(P.SUMMARY_PROMPT).toBe(md('independent-summary.v1.md'));});`，以及 `it('summary prompt has the four sections',()=>{for(const h of ['## 报告定位','## 核心结论','## 方法论','## 风险与边界'])expect(P.SUMMARY_PROMPT).toContain(h);});`。

- [ ] **Step 2: 写摘要 / 片段 / 撤回失败测试**

```ts
// src/lib/broker-research/summary/run.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {runExtract} from '../extract/run';
import {EXTRACT_RESPONSE,PAGES,SUMMARY_RESPONSE,TITLE_RESPONSE} from '../fixtures/pipeline';
import {runParse} from '../parse';
import {recordedLlmPort} from '../ports/llm';
import {brokerPaths} from '../storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '../testing';
import type {MemoryDeps} from '../testing';
import {approveSummary,rejectSummary,runSummary,translateTitle} from './run';

async function ready(d:MemoryDeps){
 const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
 await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 return (await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).reportId;
}
describe('independent summary',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,SUMMARY_RESPONSE,PAGES.join('\n'),SUMMARY_RESPONSE,TITLE_RESPONSE])});});
 it('generates a draft with the three checks and run provenance; request/response stored',async()=>{
  const reportId=await ready(d);
  const r=await runSummary(d,reportId,'zh',ADMIN_ID,{deadline:DEADLINE()});
  expect(r.status).toBe('draft');
  const s=(await d.db.listSummaries(reportId)).find(x=>x.summary_id===r.summaryId)!;
  expect(s).toMatchObject({lang:'zh',kind:'independent_summary',input_hash:(await d.db.getReport(reportId))!.summary_input_digest});
  expect(s.numeric_grounding.passed).toBe(true);expect(s.disclosure_check.passed).toBe(true);
  expect((await d.db.getRun(s.run_id))!).toMatchObject({kind:'summary',prompt_version:'independent-summary/1'});
  expect(d.storage.text(brokerPaths.response(s.run_id))).toContain('核心结论');
  expect((d.llm as ReturnType<typeof recordedLlmPort>).calls[1].system).toContain('中文');
 });
 it('a summary that copies the source is rejected summary_overlap',async()=>{
  const reportId=await ready(d);await runSummary(d,reportId,'zh',ADMIN_ID,{deadline:DEADLINE()});
  const r=await runSummary(d,reportId,'en',ADMIN_ID,{deadline:DEADLINE()});
  expect(r).toMatchObject({status:'rejected',reasons:expect.arrayContaining(['summary_overlap'])});
 });
 it('approve checks input_hash and re-runs disclosure; reject is final',async()=>{
  const reportId=await ready(d);const r=await runSummary(d,reportId,'zh',ADMIN_ID,{deadline:DEADLINE()});
  const ok=await approveSummary(d,r.summaryId,ADMIN_ID);expect(ok.status).toBe('approved');
  await rejectSummary(d,r.summaryId,ADMIN_ID);
  expect((await d.db.listSummaries(reportId)).find(x=>x.summary_id===r.summaryId)!.status).toBe('rejected');
  await expect(approveSummary(d,r.summaryId,ADMIN_ID)).rejects.toMatchObject({code:'summary_not_draft',status:409});
 });
 it('translateTitle writes title_zh/title_en with a translate run',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,TITLE_RESPONSE])});
  const reportId=await ready(d);
  await d.db.materialize(reportId);
  const t=await translateTitle(d,reportId,ADMIN_ID,{deadline:DEADLINE()});
  expect((await d.db.getReport(reportId))!).toMatchObject({title_zh:'首次覆盖：打造平台',title_en:'Initiation: Building the platform',title_run_id:t.runId});
 });
});
```

```ts
// src/lib/broker-research/snippets.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {runExtract} from './extract/run';
import {PAGES} from './fixtures/pipeline';
import {runParse} from './parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {approveSnippet,createSnippet,rejectSnippet} from './snippets';

async function ready(d:MemoryDeps,patch={}){
 const l=await seedLicence(d.db,{patch});const doc=await seedDocument(d,l.licence_id);
 await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 return {reportId:(await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).reportId,licence:l};
}
const at=(t:string,page=1)=>{const s=PAGES[page-1].indexOf(t);return {page,charStart:s,charEnd:s+t.length};};
describe('snippets',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps();});
 it('creates a draft from the server-side slice and approves it',async()=>{
  const {reportId}=await ready(d);
  const s=await createSnippet(d,reportId,{purpose:'rating',targetKey:null,fieldId:null,...at('Rating: Overweight')},ADMIN_ID);
  const row=(await d.db.listSnippets(reportId)).find(x=>x.snippet_id===s.snippetId)!;
  expect(row).toMatchObject({status:'draft',text:'Rating: Overweight',page:1});
  await approveSnippet(d,s.snippetId,ADMIN_ID);
  expect((await d.db.listSnippets(reportId))[0].status).toBe('approved');
 });
 it('400 snippet_too_long / snippet_page / snippet_cross_page / snippet_not_verbatim',async()=>{
  const {reportId}=await ready(d,{snippet_max_chars:10});
  await expect(createSnippet(d,reportId,{purpose:'rating',targetKey:null,fieldId:null,...at('Rating: Overweight')},ADMIN_ID)).rejects.toMatchObject({code:'snippet_too_long'});
  await expect(createSnippet(d,reportId,{purpose:'risk',targetKey:null,fieldId:null,page:9,charStart:0,charEnd:5},ADMIN_ID)).rejects.toMatchObject({code:'snippet_page'});
  await expect(createSnippet(d,reportId,{purpose:'risk',targetKey:null,fieldId:null,page:3,charStart:PAGES[2].length-3,charEnd:PAGES[2].length+4},ADMIN_ID)).rejects.toMatchObject({code:'snippet_cross_page'});
  await expect(createSnippet(d,reportId,{purpose:'risk',targetKey:null,fieldId:null,...at('Risks'),text:'Rizks'},ADMIN_ID)).rejects.toMatchObject({code:'snippet_not_verbatim'});
 });
 it('target price not public: a snippet carrying it is rejected restricted_value at approval (spec §14 sample 3)',async()=>{
  const {reportId}=await ready(d,{allows_public_target_price:false});
  const s=await createSnippet(d,reportId,{purpose:'target',targetKey:null,fieldId:null,...at('Price target: US$120.00')},ADMIN_ID);
  await expect(approveSnippet(d,s.snippetId,ADMIN_ID)).rejects.toMatchObject({code:'restricted_value',status:409});
  expect((await d.db.listSnippets(reportId))[0].status).toBe('rejected');
  await expect(rejectSnippet(d,s.snippetId,ADMIN_ID)).resolves.toBeUndefined();
 });
});
```

（该用例依赖物化后 targets 有 `target_price=120.00`：先确认 `target_price` 字段或保证候选物化写数值——A4 候选基准物化写候选值，故成立；若 A 的候选物化不写数值，则在用例里先 `fieldAction(confirm)`。）

```ts
// src/lib/broker-research/withdraw.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {runExtract} from './extract/run';
import {runParse} from './parse';
import {brokerPaths} from './storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {PURGE_STEPS,purgeDocument,withdrawDocument} from './withdraw';

describe('withdraw and purge',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps();});
 const ready=async()=>{const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});return {doc,reportId:r.reportId};};
 it('withdraw marks document and report withdrawn and logs; purge needs withdrawn first',async()=>{
  const {doc,reportId}=await ready();
  await expect(purgeDocument(d,doc.document_id,ADMIN_ID)).rejects.toMatchObject({code:'document_not_withdrawn',status:409});
  await withdrawDocument(d,doc.document_id,{reason:'licence ended',purge:false},ADMIN_ID);
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'withdrawn',withdrawn_reason:'licence ended'});
  expect((await d.db.getReport(reportId))!.status).toBe('withdrawn');
  expect((await d.db.listAccessLog({documentId:doc.document_id,limit:20})).map(x=>x.action)).toContain('withdraw');
 });
 it('purge runs every step, records failures, retries only failed steps, then sets purged_at',async()=>{
  const {doc}=await ready();
  await withdrawDocument(d,doc.document_id,{reason:'x',purge:false},ADMIN_ID);
  d.storage.failNext('remove','down');   // the first remove call is the pdf step
  const first=await purgeDocument(d,doc.document_id,ADMIN_ID);
  expect(first.done).toBe(false);expect(first.steps.find(s=>s.step==='pdf')).toMatchObject({status:'failed',attempts:1});
  expect(first.steps.filter(s=>s.status==='done').map(s=>s.step)).toEqual(PURGE_STEPS.filter(s=>s!=='pdf'));
  const second=await purgeDocument(d,doc.document_id,ADMIN_ID);
  expect(second.done).toBe(true);expect((await d.db.getDocument(doc.document_id))!.purged_at).not.toBeNull();
  expect(await d.storage.exists(brokerPaths.report(doc.sha256))).toBe(false);
  expect([...d.storage.objects.keys()].filter(k=>k.startsWith('runs/')||k.includes('.extract.'))).toEqual([]);
 });
});
```

- [ ] **Step 3: 实现 `summary/run.ts`**

```ts
// src/lib/broker-research/summary/run.ts
// Independent summary (spec §6.4, §4.7) and title translation. Summary: processing authorised → lease → run(kind=summary)
// → one LLM call with prompts/independent-summary.v1.md (four sections, no quoting, numbers only as field assertions)
// over the parse text + effective fields → raw request/response stored → (a) max verbatim overlap ≤ licence N,
// (b) numeric grounding (grounding/1), (c) content-level disclosure → insert as draft or rejected with
// input_hash = reports.summary_input_digest. Approval re-checks the digest and disclosure (inputs may have changed).
import {finishBatch,startBatch,emptyCounts} from '../../dq/batches';
import {checkDisclosure} from '../disclosure';
import {effectiveValue} from '../effective';
import {BrokerError,conflict,notFound} from '../errors';
import {artifactLoader,claimForProcessing,failUnavailable} from '../parse';
import {LlmError} from '../ports/llm';
import {SUMMARY_PROMPT,TRANSLATE_PROMPT} from '../prompts';
import {brokerPaths} from '../storage';
import {SUMMARY_PROMPT_VERSION} from '../versions';
import {CONTEXT_SHARE,estimateTokens} from '../extract/run';
import {checkGrounding} from './grounding';
import {maxVerbatimOverlap} from './overlap';
import type {BrokerDeps,Lang,ReportRow,SummaryRow} from '../types';

const EFFECTIVE=new Set(['confirmed','corrected','absent']);
const MAX_SUMMARY_TOKENS=2000,TIMEOUT_MS=120_000;
async function reportOr404(deps:Pick<BrokerDeps,'db'>,id:string):Promise<ReportRow>{const r=await deps.db.getReport(id);if(!r)throw notFound('report_not_found');return r;}

async function llmRun(deps:BrokerDeps,report:ReportRow,kind:'summary'|'translate',by:string,call:(runId:string)=>Promise<{system:string;user:string;content:string}>):Promise<{runId:string;content:string;batchId:string;token:string;licenceVersion:number}>{
 if(report.status==='published')throw conflict('published_immutable');
 const {doc,licence,token}=await claimForProcessing(deps,report.document_id);
 const info=deps.llm.info();
 if(!info)return failUnavailable(deps,'broker-research-summary',doc.document_id,token,'llm_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-summary',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual',toolVersions:{kind}});
 const runId=deps.newId();
 await deps.db.insertRun({run_id:runId,document_id:doc.document_id,kind,parse_run_id:doc.current_parse_run_id,extractor_version:null,artifact_path:null,artifact_hash:null,
  model_id:info.modelId,registry_hash:info.registryHash,prompt_version:kind==='summary'?SUMMARY_PROMPT_VERSION:'translate-title/1',schema_version:null,code_version:deps.codeVersion,
  behavior_digest:null,licence_version:licence.version,request_path:brokerPaths.request(runId),response_path:brokerPaths.response(runId),batch_id:batchId});
 try{
  const r=await call(runId);
  await deps.storage.upload(brokerPaths.request(runId),JSON.stringify({run_id:runId,calls:[{system:r.system,user:r.user}]}),'application/json');
  await deps.storage.upload(brokerPaths.response(runId),JSON.stringify({run_id:runId,calls:[{content:r.content,model_id:info.modelId}]}),'application/json');
  await deps.db.finishRun(runId,token,{status:'succeeded',detail:{}});
  await deps.db.fencedUpdateDocument(doc.document_id,token,{releaseLease:true});
  await deps.db.logAccess({document_id:doc.document_id,user_id:by,action:'summary_run',detail:{run_id:runId,kind}});
  return {runId,content:r.content,batchId,token,licenceVersion:licence.version};
 }catch(e){
  const code=e instanceof LlmError?e.code:e instanceof BrokerError?e.code:'llm_failed';
  await deps.db.finishRun(runId,token,{status:'failed',detail:{error_code:code}});
  await deps.db.fencedUpdateDocument(doc.document_id,token,{releaseLease:true});
  await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code}]},deps.now());
  throw new BrokerError(code,code==='llm_quota'?429:502,{runId});
 }
}

export async function runSummary(deps:BrokerDeps,reportId:string,lang:Lang,by:string,_o:{deadline:Date}):Promise<{summaryId:string;runId:string;status:'draft'|'rejected';reasons:string[]}>{
 const report=await reportOr404(deps,reportId);
 if(!report.summary_input_digest)throw conflict('materialize_stale');
 const doc=(await deps.db.getDocument(report.document_id))!;
 if(!doc.current_parse_run_id)throw conflict('document_not_parsed');
 const artifact=await artifactLoader(deps)(doc.current_parse_run_id);
 const [fields,targets]=await Promise.all([deps.db.listFields(reportId),deps.db.listTargets(reportId)]);
 const effective=fields.filter(f=>EFFECTIVE.has(f.status));
 const source=artifact.pages.map(p=>p.text).join('\n');
 const info=deps.llm.info();const budget=Math.floor((info?.contextTokens??32768)*CONTEXT_SHARE)-MAX_SUMMARY_TOKENS-estimateTokens(SUMMARY_PROMPT);
 const payload=(text:string)=>JSON.stringify({LANG:lang,TARGETS:targets.map(t=>({target_key:t.target_key,ticker_as_stated:t.ticker_as_stated,security_ticker:t.security_ticker})),
  EFFECTIVE_FIELDS:effective.map(f=>({target_key:f.target_key,field:f.field,occurrence:f.occurrence,...effectiveValue(f)})),SOURCE_TEXT:text});
 const text=source.slice(0,Math.max(0,budget-estimateTokens(payload(''))));
 const system=SUMMARY_PROMPT.replace('{{LANG}}',lang==='zh'?'中文':'English');
 const run=await llmRun(deps,report,'summary',by,async()=>{
  const user=payload(text);
  const r=await deps.llm.complete({system,user,maxTokens:MAX_SUMMARY_TOKENS,responseJson:false,timeoutMs:TIMEOUT_MS});
  return {system,user,content:r.content.trim()};
 });
 const licence=(await deps.db.getLicence(doc.licence_id))!;
 const analysts=report.institution_id?await deps.db.listAnalysts(report.institution_id):[];
 const overlap=maxVerbatimOverlap(run.content,source);
 const grounding=checkGrounding({summary:run.content,lang,targets,fields:effective});
 const disclosure=checkDisclosure({text:run.content,targets,analysts,licence});
 const reasons=[...(overlap>licence.snippet_max_chars?['summary_overlap']:[]),...(grounding.passed?[]:['summary_ungrounded']),
  ...[...new Set(disclosure.hits.map(h=>h.kind==='restricted_name'?'restricted_name':'restricted_value'))]];
 const status=reasons.length?'rejected':'draft';
 const summaryId=await deps.db.insertSummary({report_id:reportId,lang,kind:'independent_summary',run_id:run.runId,input_hash:report.summary_input_digest,
  summary_md:run.content,max_verbatim_overlap:overlap,numeric_grounding:grounding,disclosure_check:disclosure,status});
 await finishBatch(deps.tables,run.batchId,{counts:{...emptyCounts(),fetched:1,inserted:1},errors:reasons.map(code=>({code,key:summaryId}))},deps.now());
 return {summaryId,runId:run.runId,status,reasons};
}

async function summaryById(deps:Pick<BrokerDeps,'db'|'tables'>,summaryId:string):Promise<{summary:SummaryRow;report:ReportRow}>{
 const [row]=await deps.tables.select('broker_report_summaries',{summary_id:summaryId},{limit:1});
 if(!row)throw notFound('summary_not_found');
 const report=await reportOr404(deps,row.report_id as string);
 const summary=(await deps.db.listSummaries(report.report_id)).find(s=>s.summary_id===summaryId);
 if(!summary)throw notFound('summary_not_found');
 return {summary,report};
}
export async function approveSummary(deps:BrokerDeps,summaryId:string,by:string):Promise<SummaryRow>{
 const {summary,report}=await summaryById(deps,summaryId);
 if(summary.status!=='draft')throw conflict('summary_not_draft');
 if(summary.input_hash!==report.summary_input_digest)throw conflict('summary_stale');
 const doc=(await deps.db.getDocument(report.document_id))!;const licence=(await deps.db.getLicence(doc.licence_id))!;
 if(summary.max_verbatim_overlap>licence.snippet_max_chars)throw conflict('summary_overlap');
 if(!summary.numeric_grounding.passed)throw conflict('summary_ungrounded');
 const fresh=checkDisclosure({text:summary.summary_md,targets:await deps.db.listTargets(report.report_id),analysts:report.institution_id?await deps.db.listAnalysts(report.institution_id):[],licence});
 if(!fresh.passed){await deps.db.setSummaryStatus(summaryId,{status:'rejected'});throw conflict(fresh.hits.some(h=>h.kind==='restricted_name')?'restricted_name':'restricted_value',{hits:fresh.hits.length});}
 for(const s of await deps.db.listSummaries(report.report_id))if(s.lang===summary.lang&&s.status==='approved')await deps.db.setSummaryStatus(s.summary_id,{status:'draft',approved_by:null});
 await deps.db.setSummaryStatus(summaryId,{status:'approved',approved_by:by});
 return (await summaryById(deps,summaryId)).summary;
}
export async function rejectSummary(deps:BrokerDeps,summaryId:string,_by:string):Promise<void>{
 await summaryById(deps,summaryId);await deps.db.setSummaryStatus(summaryId,{status:'rejected',approved_by:null});
}

export async function translateTitle(deps:BrokerDeps,reportId:string,by:string,_o:{deadline:Date}):Promise<{runId:string;zh:string;en:string}>{
 const report=await reportOr404(deps,reportId);
 if(!report.title_original)throw conflict('report_incomplete:title');
 const run=await llmRun(deps,report,'translate',by,async()=>{
  const user=JSON.stringify({title:report.title_original,lang:report.title_lang});
  const r=await deps.llm.complete({system:TRANSLATE_PROMPT,user,maxTokens:300,responseJson:true,timeoutMs:60_000});
  return {system:TRANSLATE_PROMPT,user,content:r.content};
 });
 let t:{zh?:unknown;en?:unknown};try{t=JSON.parse(run.content);}catch{t={};}
 if(typeof t.zh!=='string'||typeof t.en!=='string'||!t.zh.trim()||!t.en.trim()||t.zh.length>300||t.en.length>300){
  await finishBatch(deps.tables,run.batchId,{counts:{...emptyCounts(),fetched:1,failed:1},errors:[{code:'llm_schema_invalid'}]},deps.now());
  throw new BrokerError('llm_schema_invalid',502,{runId:run.runId});
 }
 await deps.db.updateReportDraft(reportId,{title_zh:t.zh.trim(),title_en:t.en.trim(),title_run_id:run.runId});
 await finishBatch(deps.tables,run.batchId,{counts:{...emptyCounts(),fetched:1,inserted:1},errors:[]},deps.now());
 return {runId:run.runId,zh:t.zh.trim(),en:t.en.trim()};
}
```

- [ ] **Step 4: 实现 `snippets.ts`**

```ts
// src/lib/broker-research/snippets.ts
// Quoted snippets (spec §4.7, §13 snippet_*): the text is ALWAYS the server-side slice of the current parse artifact
// (one page by construction; a span past the page end is snippet_cross_page), ≤ licence N and ≤ 500. The disclosure
// check runs at creation (stored) and again at approval with the current inputs; a failing approval rejects the snippet.
import {checkDisclosure} from './disclosure';
import {bad,conflict,gone,notFound} from './errors';
import {SNIPPET_HARD_MAX} from './licences';
import {artifactLoader} from './parse';
import type {BrokerDeps,SnippetPurpose,SnippetRow} from './types';

export const PURPOSES:readonly SnippetPurpose[]=['rating','target','thesis','risk','method','other'];
export interface SnippetInput{purpose:SnippetPurpose;targetKey:string|null;fieldId:string|null;page:number;charStart:number;charEnd:number;text?:string}
type SDeps=Pick<BrokerDeps,'db'|'storage'|'tables'>;

async function inputs(deps:SDeps,reportId:string){
 const report=await deps.db.getReport(reportId);if(!report)throw notFound('report_not_found');
 const doc=(await deps.db.getDocument(report.document_id))!;
 if(doc.status==='withdrawn')throw gone();
 const licence=(await deps.db.getLicence(doc.licence_id))!;
 return {report,doc,licence,targets:await deps.db.listTargets(reportId),analysts:report.institution_id?await deps.db.listAnalysts(report.institution_id):[]};
}
export async function createSnippet(deps:SDeps,reportId:string,i:SnippetInput,by:string):Promise<{snippetId:string;passed:boolean}>{
 if(!PURPOSES.includes(i.purpose))throw bad('invalid_parameter:purpose');
 const {report,doc,licence,targets,analysts}=await inputs(deps,reportId);
 if(report.status==='published')throw conflict('published_immutable');
 if(!doc.current_parse_run_id)throw conflict('document_not_parsed');
 const a=await artifactLoader(deps)(doc.current_parse_run_id);const page=a.pages.find(p=>p.page===i.page);
 if(!page)throw bad('snippet_page');
 if(!Number.isSafeInteger(i.charStart)||!Number.isSafeInteger(i.charEnd)||i.charStart<0||i.charEnd<=i.charStart)throw bad('snippet_span');
 if(i.charEnd>page.text.length)throw bad('snippet_cross_page');
 if(i.charEnd-i.charStart>Math.min(licence.snippet_max_chars,SNIPPET_HARD_MAX))throw bad('snippet_too_long',{max:Math.min(licence.snippet_max_chars,SNIPPET_HARD_MAX)});
 const text=page.text.slice(i.charStart,i.charEnd);
 if(i.text!==undefined&&i.text!==text)throw bad('snippet_not_verbatim');
 const check=checkDisclosure({text,targets,analysts,licence});
 const snippetId=await deps.db.insertSnippet({report_id:reportId,target_key:i.targetKey,purpose:i.purpose,parse_run_id:doc.current_parse_run_id,page:i.page,char_start:i.charStart,char_end:i.charEnd,
  text,field_id:i.fieldId,disclosure_check:check,created_by:by});
 return {snippetId,passed:check.passed};
}
async function snippetById(deps:SDeps,snippetId:string):Promise<SnippetRow>{
 const [row]=await deps.tables.select('broker_report_snippets',{snippet_id:snippetId},{limit:1});
 if(!row)throw notFound('snippet_not_found');
 const s=(await deps.db.listSnippets(row.report_id as string)).find(x=>x.snippet_id===snippetId);
 if(!s)throw notFound('snippet_not_found');return s;
}
export async function approveSnippet(deps:SDeps,snippetId:string,by:string):Promise<void>{
 const s=await snippetById(deps,snippetId);
 if(s.status!=='draft'||s.text===null)throw conflict('snippet_not_draft');
 const {licence,targets,analysts}=await inputs(deps,s.report_id);
 if(s.text.length>licence.snippet_max_chars)throw conflict('snippet_too_long');
 const check=checkDisclosure({text:s.text,targets,analysts,licence});
 if(!check.passed){await deps.db.setSnippetStatus(snippetId,{status:'rejected',disclosure_check:check});throw conflict(check.hits.some(h=>h.kind==='restricted_name')?'restricted_name':'restricted_value');}
 await deps.db.setSnippetStatus(snippetId,{status:'approved',disclosure_check:check,approved_by:by});
}
export async function rejectSnippet(deps:SDeps,snippetId:string,_by:string):Promise<void>{
 await snippetById(deps,snippetId);await deps.db.setSnippetStatus(snippetId,{status:'rejected',approved_by:null});
}
```

- [ ] **Step 5: 实现 `withdraw.ts`**

```ts
// src/lib/broker-research/withdraw.ts
// Withdraw and purge (spec §6.5). Withdraw flips the document (the DB trigger withdraws the report and writes
// claim.retract). Purge is a resumable step table broker_purge_steps: each step runs only if not yet done; a failure is
// recorded (attempts+1, last_error) and the other steps still run; purged_at is set when all are done. Text purges of
// fields/snippets/summaries/quarantine payloads go through deps.tables (service role) until the DB contract gets a
// purge method (plan Part C 契约修订建议 5). O11 default: summary text is kept, status → rejected.
import {selectAll} from '../db/table-client';
import {auditAdmin} from './audit';
import {conflict,notFound} from './errors';
import {brokerPaths} from './storage';
import type {BrokerDeps,PurgeStep,PurgeStepRow} from './types';

export const PURGE_STEPS:readonly PurgeStep[]=['pdf','artifacts','runs','fields_text','snippets_text','summaries','quarantine_payload'];
type WDeps=Pick<BrokerDeps,'db'|'storage'|'tables'|'now'>;

export async function withdrawDocument(deps:WDeps,documentId:string,i:{reason:string;purge:boolean},by:string):Promise<{purge:Awaited<ReturnType<typeof purgeDocument>>|null}>{
 const doc=await deps.db.getDocument(documentId);if(!doc)throw notFound('document_not_found');
 if(doc.status!=='withdrawn'){
  await deps.db.updateDocument(documentId,{status:'withdrawn',withdrawn_at:deps.now().toISOString(),withdrawn_reason:i.reason});
  await deps.db.logAccess({document_id:documentId,user_id:by,action:'withdraw',detail:{reason:i.reason}});
  await auditAdmin(deps.tables,by,'broker_research.withdraw',documentId,{reason:i.reason},deps.now());
 }
 return {purge:i.purge?await purgeDocument(deps,documentId,by):null};
}

export async function purgeDocument(deps:WDeps,documentId:string,by:string):Promise<{done:boolean;steps:PurgeStepRow[]}>{
 const doc=await deps.db.getDocument(documentId);if(!doc)throw notFound('document_not_found');
 if(doc.status!=='withdrawn')throw conflict('document_not_withdrawn');
 const report=await deps.db.reportByDocument(documentId);
 const done=new Set((await deps.db.purgeSteps(documentId)).filter(s=>s.status==='done').map(s=>s.step));
 const runs=await deps.db.listRuns(documentId);
 const exec:Record<PurgeStep,()=>Promise<void>>={
  pdf:()=>deps.storage.remove([doc.storage_path]),
  artifacts:async()=>{for(const r of runs.filter(x=>x.kind==='parse')){await deps.storage.remove([brokerPaths.artifact(doc.sha256,r.run_id)]);const pages=await deps.storage.list(brokerPaths.pagesPrefix(doc.sha256,r.run_id));if(pages.length)await deps.storage.remove(pages);}},
  runs:async()=>{const paths=runs.flatMap(r=>[r.request_path,r.response_path]).filter((p):p is string=>p!==null);if(paths.length)await deps.storage.remove(paths);},
  fields_text:async()=>{if(report)await deps.tables.update('broker_report_fields',{report_id:report.report_id},{value_source_text:null,status:'rejected'});},
  snippets_text:async()=>{if(report)await deps.tables.update('broker_report_snippets',{report_id:report.report_id},{text:null,status:'rejected'});},
  summaries:async()=>{if(report)await deps.tables.update('broker_report_summaries',{report_id:report.report_id},{status:'rejected'});},
  quarantine_payload:async()=>{
   for(const q of await selectAll(deps.tables,'dq_quarantine',{dataset:'broker_research'},'id'))
    if(String(q.natural_key).startsWith(`${doc.sha256}:`))await deps.tables.update('dq_quarantine',{id:q.id as string},{payload:{}});
  },
 };
 for(const step of PURGE_STEPS){
  if(done.has(step))continue;
  try{await exec[step]();await deps.db.upsertPurgeStep(documentId,step,{ok:true});}
  catch(e){await deps.db.upsertPurgeStep(documentId,step,{ok:false,error:(e instanceof Error?e.message:String(e)).slice(0,500)});}
 }
 const steps=await deps.db.purgeSteps(documentId);
 const all=PURGE_STEPS.every(s=>steps.some(x=>x.step===s&&x.status==='done'));
 if(all&&!doc.purged_at)await deps.db.updateDocument(documentId,{purged_at:deps.now().toISOString()});
 await deps.db.logAccess({document_id:documentId,user_id:by,action:'purge',detail:{done:all,failed:steps.filter(s=>s.status!=='done').map(s=>s.step)}});
 if(all)await auditAdmin(deps.tables,by,'broker_research.purge',documentId,{},deps.now());
 return {done:all,steps};
}
```

（单测的内存 `TableClient` 与内存 DB 不共享行：`fields_text/snippets_text/summaries` 三步在单测里对空表执行 `update` 返回 0 并记为 done；真实擦除由 C8 的 pg 集成测试断言。）

- [ ] **Step 6: 实现路由**

```ts
// src/app/api/admin/broker-research/reports/[id]/summary/route.ts
// POST {lang}: generate one independent summary (spec §6.4); 409 lease_held / licence_forbids_processing / materialize_stale.
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {runSummary} from '@/lib/broker-research/summary/run';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.summary',async({ctx,body,userId})=>
 jsonNoStore(await runSummary(brokerDeps(),uuidParam((await ctx.params).id),enumField(body,'lang',['zh','en'] as const),userId,{deadline:deadlineFrom(new Date())}),201));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/translate/route.ts
// POST {}: translate title_original into title_zh/title_en (run kind translate).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {translateTitle} from '@/lib/broker-research/summary/run';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.translate',async({ctx,userId})=>jsonNoStore(await translateTitle(brokerDeps(),uuidParam((await ctx.params).id),userId,{deadline:deadlineFrom(new Date())})));
```

```ts
// src/app/api/admin/broker-research/reports/[id]/snippets/route.ts
// POST {purpose, targetKey?, fieldId?, page, charStart, charEnd, text?}: draft snippet from the server-side slice.
import {adminPost,enumField,intField,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {PURPOSES,createSnippet} from '@/lib/broker-research/snippets';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('reports.snippet_create',async({ctx,body,userId})=>jsonNoStore(await createSnippet(brokerDeps(),uuidParam((await ctx.params).id),{
 purpose:enumField(body,'purpose',PURPOSES),targetKey:strField(body,'targetKey',{max:64,optional:true})??null,
 fieldId:body.fieldId===undefined||body.fieldId===null?null:uuidParam(body.fieldId,'fieldId'),
 page:intField(body,'page',1,99999),charStart:intField(body,'charStart',0,10_000_000),charEnd:intField(body,'charEnd',1,10_000_000),
 text:strField(body,'text',{max:500,optional:true})},userId),201));
```

```ts
// src/app/api/admin/broker-research/snippets/[id]/route.ts
// POST {action: approve|reject}; approval re-runs the disclosure check (409 restricted_value|restricted_name).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {approveSnippet,rejectSnippet} from '@/lib/broker-research/snippets';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('snippets.action',async({ctx,body,userId})=>{
 const id=uuidParam((await ctx.params).id);const action=enumField(body,'action',['approve','reject'] as const);
 await (action==='approve'?approveSnippet:rejectSnippet)(brokerDeps(),id,userId);
 return jsonNoStore({snippetId:id,status:action==='approve'?'approved':'rejected'});
});
```

```ts
// src/app/api/admin/broker-research/summaries/[id]/route.ts
// POST {action: approve|reject} (spec §4.7 approval conditions; 409 summary_stale / summary_not_draft / restricted_*).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {approveSummary,rejectSummary} from '@/lib/broker-research/summary/run';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('summaries.action',async({ctx,body,userId})=>{
 const id=uuidParam((await ctx.params).id);
 if(enumField(body,'action',['approve','reject'] as const)==='approve')return jsonNoStore({summary:await approveSummary(brokerDeps(),id,userId)});
 await rejectSummary(brokerDeps(),id,userId);return jsonNoStore({summaryId:id,status:'rejected'});
});
```

```ts
// src/app/api/admin/broker-research/documents/[id]/withdraw/route.ts
// POST {reason, purge?}: withdraw (report withdrawn + claim.retract by trigger); purge=true runs the step table.
import {adminPost,boolField,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {withdrawDocument} from '@/lib/broker-research/withdraw';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('documents.withdraw',async({ctx,body,userId})=>
 jsonNoStore(await withdrawDocument(coreDeps(),uuidParam((await ctx.params).id),{reason:strField(body,'reason',{max:500}),purge:boolField(body,'purge',false)},userId)));
```

```ts
// src/app/api/admin/broker-research/documents/[id]/purge/route.ts
// POST {}: (re)run the purge steps not yet done (spec §6.5).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {purgeDocument} from '@/lib/broker-research/withdraw';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{id:string}>}
export const POST=adminPost<Ctx>('documents.purge',async({ctx,userId})=>jsonNoStore(await purgeDocument(coreDeps(),uuidParam((await ctx.params).id),userId)));
```

```ts
// src/app/api/admin/broker-research/access-log/route.ts
// GET ?document=&limit=: access log rows (no IP is ever stored).
import {QueryError,intParam,readParams} from '@/lib/facts/public-route';
import {adminGet,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';

export const dynamic='force-dynamic';
export const GET=adminGet<unknown>('access_log',async({request})=>{
 let p:Map<string,string>,limit:number;
 try{p=readParams(new URL(request.url),['document','limit']);limit=intParam(p,'limit',100,500);}catch(e){if(e instanceof QueryError)throw bad(e.message);throw e;}
 const document=p.get('document');
 return jsonNoStore({rows:await coreDeps().db.listAccessLog({documentId:document===undefined?undefined:uuidParam(document,'document'),limit})});
});
```

```ts
// src/app/api/admin/broker-research/publications/[id]/route.ts
// GET: immutable publication snapshot (contains approved snippet/summary text and spans → admin only, no-store).
import {adminGet,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {notFound} from '@/lib/broker-research/errors';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{id:string}>}
export const GET=adminGet<Ctx>('publications.get',async({ctx})=>{
 const p=await coreDeps().db.getPublication(uuidParam((await ctx.params).id));if(!p)throw notFound('publication_not_found');
 return jsonNoStore({publication:p});
});
```

```ts
// src/app/api/admin/broker-research/text-routes.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {runExtract} from '@/lib/broker-research/extract/run';
import {EXTRACT_RESPONSE,PAGES,SUMMARY_RESPONSE} from '@/lib/broker-research/fixtures/pipeline';
import {runParse} from '@/lib/broker-research/parse';
import {recordedLlmPort} from '@/lib/broker-research/ports/llm';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST as SUMMARY} from './reports/[id]/summary/route';
import {POST as SNIPPET} from './reports/[id]/snippets/route';
import {POST as WITHDRAW} from './documents/[id]/withdraw/route';
import {POST as PURGE} from './documents/[id]/purge/route';
import {GET as LOG} from './access-log/route';
import {GET as PUB} from './publications/[id]/route';

const X='00000000-0000-4000-8000-000000000001';
describe('text and lifecycle routes',()=>{
 let d:MemoryDeps,reportId:string,documentId:string;
 beforeEach(async()=>{
  vi.clearAllMocks();d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,SUMMARY_RESPONSE])});mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);documentId=doc.document_id;
  await runParse(d,documentId,ADMIN_ID,{deadline:DEADLINE()});reportId=(await runExtract(d,documentId,ADMIN_ID,{deadline:DEADLINE()})).reportId;
 });
 adminGuardCases({call:(r)=>SUMMARY(r,ctxOf({id:X})),request:()=>jsonReq(`/s/${X}`,{lang:'zh'}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>WITHDRAW(r,ctxOf({id:X})),request:()=>jsonReq(`/w/${X}`,{reason:'x'}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>LOG(r,{}),request:()=>getReq('/api/admin/broker-research/access-log'),requireAdmin:mocks.requireAdmin,post:false});
 it('summary 201 draft; 400 bad lang; 409 lease_held',async()=>{
  expect((await SUMMARY(jsonReq('/s',{lang:'fr'}),ctxOf({id:reportId}))).status).toBe(400);
  const ok=await SUMMARY(jsonReq('/s',{lang:'zh'}),ctxOf({id:reportId}));expect(ok.status).toBe(201);expect(await bodyOf(ok)).toMatchObject({status:'draft'});
  await d.db.claimLease(documentId,'other',300);
  const held=await SUMMARY(jsonReq('/s',{lang:'en'}),ctxOf({id:reportId}));expect(held.status).toBe(409);expect(await errCode(held)).toBe('lease_held');
 });
 it('snippet 201 and 400 snippet_too_long',async()=>{
  const s=PAGES[0].indexOf('Rating: Overweight');
  expect((await SNIPPET(jsonReq('/n',{purpose:'rating',page:1,charStart:s,charEnd:s+18}),ctxOf({id:reportId}))).status).toBe(201);
  const long=await SNIPPET(jsonReq('/n',{purpose:'rating',page:1,charStart:0,charEnd:PAGES[0].length}),ctxOf({id:reportId}));
  expect(long.status).toBe(400);expect(await errCode(long)).toBe('snippet_too_long');
 });
 it('withdraw then purge; afterwards parse-side ★ routes see 410 (covered in C3/C6); access log lists withdraw and purge',async()=>{
  expect((await WITHDRAW(jsonReq('/w',{reason:'licence ended'}),ctxOf({id:documentId}))).status).toBe(200);
  const p=await PURGE(jsonReq('/p',{}),ctxOf({id:documentId}));expect(p.status).toBe(200);expect(await bodyOf(p)).toMatchObject({done:true});
  const log=await bodyOf<{rows:{action:string}[]}>(await LOG(getReq(`/api/admin/broker-research/access-log?document=${documentId}`),{}));
  expect(log.rows.map(r=>r.action)).toEqual(expect.arrayContaining(['withdraw','purge']));
  expect((await LOG(getReq('/api/admin/broker-research/access-log?document=nope'),{})).status).toBe(400);
 });
 it('publication 404 for an unknown id',async()=>{expect((await PUB(getReq('/x'),ctxOf({id:X}))).status).toBe(404);});
});
```

- [ ] **Step 7: 运行**

Run: `npm test -- src/lib/broker-research src/app/api/admin/broker-research`
Expected: PASS。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 8: 提交**

```bash
git add src/lib/broker-research/prompts src/lib/broker-research/summary/run.ts src/lib/broker-research/summary/run.test.ts src/lib/broker-research/snippets.ts src/lib/broker-research/snippets.test.ts src/lib/broker-research/withdraw.ts src/lib/broker-research/withdraw.test.ts src/app/api/admin/broker-research docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C7 independent summary with three checks, title translation, snippets, withdraw/purge steps"
```

---
### Task C8: 评测回执、回放、脚本、端到端集成测试（critical）

**Files:**
- Create: `src/lib/broker-research/eval.ts`
- Create: `src/lib/broker-research/eval.test.ts`
- Create: `scripts/broker-research/eval-gold.ts`
- Create: `src/lib/broker-research/replay.ts`
- Create: `src/lib/broker-research/replay.test.ts`
- Create: `scripts/broker-research/replay.ts`
- Create: `src/lib/broker-research/pipeline.integration.test.ts`
- Modify: `scripts/ci/research-checks.ts`（`criticalSuites` 在 A1 建的 `// FOREIGN` 围栏内追加；若围栏不存在则建）

**评测匹配（规格 §11.3）**：同 `(target_key, field, occurrence)`；生效值相等（两边都有 `value_num` 时 `decimalEquals`，容差 0；否则 `value_text` 小写并折叠空白后相等）；页码相等；跨度重叠（未定位的候选不匹配）。`per_field[field] = {tp,fp,fn,precision,recall}`，`precision = tp/(tp+fp)`（分母 0 → null），`recall = tp/(tp+fn)`（分母 0 → null）；`absence`：标注 `absent` 且抽取无该 `(target_key,field)` → tp，标注 `absent` 但抽取有 → fp，标注有值但抽取完全没有该 `(target_key,field)` → fn。`precision_min/recall_min` = 非 null 值的最小值；`passed = precision_min ≥ 0.95 && recall_min ≥ 0.95`（任一为 null → false）。`corpus_hash = sha256Hex(canonicalJson(按 sha256 排序的 manifest.docs))`。

- [ ] **Step 1: 写评测失败测试**

```ts
// src/lib/broker-research/eval.test.ts
import {describe,expect,it} from 'vitest';
import {corpusHash,evalStats} from './eval';
import type {GoldDoc} from './eval';

const g=(field:string,value_text:string,value_num:string|null,page=1,s=0,e=5,target_key:string|null='ZZBR')=>({target_key,field,occurrence:1,value_text,value_num,page,char_start:s,char_end:e});
describe('evalStats',()=>{
 const gold:GoldDoc[]=[{sha256:'a'.repeat(64),fields:[g('target_price','120.00','120.00'),g('rating','Overweight',null,1,10,20)],absent:[{target_key:'ZZBR',field:'target_horizon'}]}];
 it('counts tp/fp/fn per field with zero numeric tolerance and span overlap',()=>{
  const s=evalStats(gold,[{sha256:'a'.repeat(64),rows:[g('target_price','120.0','120.0',1,2,8),g('rating','overweight',null,1,30,40),g('wacc','9%','0.09',2)]}]);
  expect(s.per_field.target_price).toEqual({tp:1,fp:0,fn:0,precision:1,recall:1});
  expect(s.per_field.rating).toEqual({tp:0,fp:1,fn:1,precision:0,recall:0});   // span does not overlap
  expect(s.per_field.wacc).toEqual({tp:0,fp:1,fn:0,precision:0,recall:null});
  expect(s.absence).toEqual({tp:1,fp:0,fn:0});
  expect(s.precision_min).toBe(0);expect(s.passed).toBe(false);expect(s.n_docs).toBe(1);
 });
 it('passes at ≥ 0.95 on every covered field; unlocated candidates never match',()=>{
  const ok=evalStats(gold,[{sha256:'a'.repeat(64),rows:[g('target_price','120.00','120.00'),g('rating','Overweight',null,1,10,20)]}]);
  expect(ok.passed).toBe(true);
  const unl=evalStats(gold,[{sha256:'a'.repeat(64),rows:[{...g('target_price','120.00','120.00'),char_start:null,char_end:null}]}]);
  expect(unl.per_field.target_price).toMatchObject({tp:0,fp:1,fn:1});
 });
 it('corpus hash is order independent',()=>{
  const a={sha256:'a'.repeat(64),fields:[],absent:[]},b={sha256:'b'.repeat(64),fields:[],absent:[]};
  expect(corpusHash([a,b])).toBe(corpusHash([b,a]));
 });
});
```

- [ ] **Step 2: 实现 `eval.ts`**

```ts
// src/lib/broker-research/eval.ts
// Gold-set evaluation receipts (spec §4.10, §11.3, §12.4; blocker 13). evalStats() is pure: it matches extracted
// candidate rows to annotated rows by identity, effective value (numeric tolerance 0), page and span overlap, and
// produces per-field and absence counts. writeEvalReceipt() stores the receipt keyed by behavior_digest. 'synthetic'
// receipts are written only by tests against a test database; the production blocker accepts 'gold' only.
import {decimalEquals} from '../facts/json-numbers';
import {canonicalJson,sha256Hex} from './hash';
import type {BrokerDeps,EvalFieldStats,EvalReceiptRow} from './types';

export interface EvalRow{target_key:string|null;field:string;occurrence:number;value_text:string;value_num:string|null;page:number|null;char_start:number|null;char_end:number|null}
export interface GoldDoc{sha256:string;fields:EvalRow[];absent:{target_key:string|null;field:string}[]}
export interface ExtractedDoc{sha256:string;rows:EvalRow[]}
export const EVAL_THRESHOLD=0.95,GOLD_MIN_DOCS=30;
const id=(r:{target_key:string|null;field:string;occurrence?:number})=>`${r.target_key??''}\u0000${r.field}\u0000${r.occurrence??1}`;
const tf=(r:{target_key:string|null;field:string})=>`${r.target_key??''}\u0000${r.field}`;
const norm=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();
const sameValue=(a:EvalRow,b:EvalRow)=>a.value_num!==null&&b.value_num!==null?decimalEquals(a.value_num,b.value_num):norm(a.value_text)===norm(b.value_text);
const overlaps=(a:EvalRow,b:EvalRow)=>a.char_start!==null&&a.char_end!==null&&b.char_start!==null&&b.char_end!==null&&a.char_start<b.char_end&&b.char_start<a.char_end;
const matches=(gold:EvalRow,x:EvalRow)=>sameValue(gold,x)&&gold.page===x.page&&overlaps(gold,x);
const ratio=(n:number,d:number)=>d===0?null:n/d;

export function evalStats(gold:GoldDoc[],extracted:ExtractedDoc[]):Pick<EvalReceiptRow,'n_docs'|'per_field'|'absence'|'precision_min'|'recall_min'|'passed'>{
 const per:Record<string,{tp:number;fp:number;fn:number}>={};const bump=(f:string,k:'tp'|'fp'|'fn')=>{(per[f]??={tp:0,fp:0,fn:0})[k]++;};
 const absence={tp:0,fp:0,fn:0};
 for(const gd of gold){
  const rows=extracted.find(e=>e.sha256===gd.sha256)?.rows??[];
  const byId=new Map<string,EvalRow[]>();for(const r of rows){const k=id(r);byId.set(k,[...(byId.get(k)??[]),r]);}
  const used=new Set<EvalRow>();
  for(const gr of gd.fields){
   const hit=(byId.get(id(gr))??[]).find(x=>!used.has(x)&&matches(gr,x));
   if(hit){used.add(hit);bump(gr.field,'tp');}else bump(gr.field,'fn');
  }
  for(const r of rows)if(!used.has(r))bump(r.field,'fp');
  const present=new Set(rows.map(tf));
  for(const a of gd.absent)present.has(tf(a))?absence.fp++:absence.tp++;
  for(const k of new Set(gd.fields.map(tf)))if(!present.has(k))absence.fn++;
 }
 const per_field:Record<string,EvalFieldStats>=Object.fromEntries(Object.entries(per).sort(([a],[b])=>a<b?-1:1).map(([f,c])=>[f,{...c,precision:ratio(c.tp,c.tp+c.fp),recall:ratio(c.tp,c.tp+c.fn)}]));
 const mins=(k:'precision'|'recall')=>{const v=Object.values(per_field).map(s=>s[k]).filter((x):x is number=>x!==null);return v.length?Math.min(...v):null;};
 const precision_min=mins('precision'),recall_min=mins('recall');
 return {n_docs:gold.length,per_field,absence,precision_min,recall_min,passed:precision_min!==null&&recall_min!==null&&precision_min>=EVAL_THRESHOLD&&recall_min>=EVAL_THRESHOLD};
}
export const corpusHash=(docs:GoldDoc[])=>sha256Hex(canonicalJson([...docs].sort((a,b)=>a.sha256<b.sha256?-1:1)));

export async function writeEvalReceipt(deps:Pick<BrokerDeps,'db'>,r:Omit<EvalReceiptRow,'receipt_id'|'ran_at'>):Promise<string>{
 if(r.corpus_kind==='gold'&&r.n_docs<GOLD_MIN_DOCS)console.warn(`[broker-research] gold receipt with ${r.n_docs} < ${GOLD_MIN_DOCS} docs will not lift blocker 13`);
 return deps.db.insertEvalReceipt(r);
}
```

- [ ] **Step 3: 写 `scripts/broker-research/eval-gold.ts`**

```ts
// scripts/broker-research/eval-gold.ts
// Gold-set runner (spec §11.3, §12.4; owner action O14 / FR-5). Usage:
//   npx tsx scripts/broker-research/eval-gold.ts --manifest <private gold manifest.json> --by <admin uuid> [--dry-run]
// The manifest (never committed; lives with the owner) is {docs: GoldDoc[]}: each doc's sha256 must already be uploaded
// and parsed. For every doc the extraction core (extract/run.ts::extractCandidates) runs against the current parse
// artifact with the production LLM port (BROKER_RESEARCH_LLM_ENABLED=1) — no DB writes besides the receipt; the raw
// calls are kept under runs/{eval run id}.*. Prints the receipt and whether corpus_hash equals
// settings.approved_gold_corpus_hash (the receipt lifts blocker 13 only when it does, passed=true and n_docs ≥ 30).
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {brokerDeps} from '../../src/lib/broker-research/deps';
import {behaviorDigest} from '../../src/lib/broker-research/behavior';
import {corpusHash,evalStats,writeEvalReceipt} from '../../src/lib/broker-research/eval';
import type {ExtractedDoc,GoldDoc} from '../../src/lib/broker-research/eval';
import {extractCandidates} from '../../src/lib/broker-research/extract/run';
import {artifactLoader} from '../../src/lib/broker-research/parse';
import {brokerPaths} from '../../src/lib/broker-research/storage';
import {EXTRACT_PROMPT_VERSION,SCHEMA_VERSION} from '../../src/lib/broker-research/versions';

const arg=(k:string)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:undefined;};
async function main(){
 const manifestPath=arg('--manifest'),by=arg('--by'),dry=process.argv.includes('--dry-run');
 if(!manifestPath||!by)throw new Error('usage: --manifest <file> --by <uuid> [--dry-run]');
 const docs=(JSON.parse(readFileSync(manifestPath,'utf8')) as {docs:GoldDoc[]}).docs;
 const deps={...brokerDeps(),codeVersion:resolveCodeVersion({allowGit:true})??'unknown'};
 const info=deps.llm.info();if(!info)throw new Error('llm_unavailable: set BROKER_RESEARCH_LLM_ENABLED=1 and a platform LLM');
 const load=artifactLoader(deps);const extracted:ExtractedDoc[]=[];const versions=new Set<string>();
 for(const g of docs){
  const doc=await deps.db.findDocumentBySha(g.sha256);
  if(!doc?.current_parse_run_id)throw new Error(`not parsed: ${g.sha256}`);
  const run=(await deps.db.getRun(doc.current_parse_run_id))!;versions.add(String(run.detail.extractor_version??'unknown'));
  const b=await extractCandidates(deps.llm,info,await load(run.run_id),{deadline:new Date(Date.now()+600_000),now:()=>new Date()});
  const evalRun=randomUUID();
  await deps.storage.upload(brokerPaths.request(evalRun),JSON.stringify({run_id:evalRun,purpose:'eval-gold',sha256:g.sha256,calls:b.requests}),'application/json');
  await deps.storage.upload(brokerPaths.response(evalRun),JSON.stringify({run_id:evalRun,calls:b.responses}),'application/json');
  extracted.push({sha256:g.sha256,rows:b.rows});
  console.log(`${g.sha256.slice(0,12)} candidates=${b.rows.length} unverified=${b.unverified} calls=${b.requests.length}`);
 }
 if(versions.size!==1)throw new Error(`mixed extractor versions: ${[...versions].join(',')}`);
 const [extractorVersion]=[...versions];
 const stats=evalStats(docs,extracted),hash=corpusHash(docs);
 const digest=behaviorDigest({extractorVersion,modelId:info.modelId,registryHash:info.registryHash,promptVersion:EXTRACT_PROMPT_VERSION,schemaVersion:SCHEMA_VERSION});
 const settings=await deps.db.getSettings();
 console.log(JSON.stringify({corpus_hash:hash,approved:settings.approved_gold_corpus_hash===hash,behavior_digest:digest,...stats},null,1));
 if(dry)return;
 const id=await writeEvalReceipt(deps,{corpus_kind:'gold',corpus_hash:hash,behavior_digest:digest,extractor_version:extractorVersion,model_id:info.modelId,registry_hash:info.registryHash,
  prompt_version:EXTRACT_PROMPT_VERSION,schema_version:SCHEMA_VERSION,code_version:deps.codeVersion,...stats,ran_by:by});
 console.log(`receipt ${id}`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
```

- [ ] **Step 4: 写回放失败测试与实现**

```ts
// src/lib/broker-research/replay.test.ts
import {describe,expect,it} from 'vitest';
import {replayFromSnapshot} from './replay';
import {runExtract} from './extract/run';
import {runParse} from './parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {PublicationRow} from './types';

describe('replayFromSnapshot',()=>{
 it('rebuilds candidates from stored responses and verifies every span against the artifact; flags a tampered row',async()=>{
  const d=memoryBrokerDeps();const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const ex=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const run=(await d.db.getRun(ex.runId))!;const parse=(await d.db.getRun(run.parse_run_id!))!;
  const fields=(await d.db.listFields(ex.reportId)).filter(f=>f.status==='extracted').map(f=>({...f,status:'confirmed',artifact_hash:parse.artifact_hash}));
  const pub={publication_id:'p',snapshot:{fields},snapshot_hash:'h'} as unknown as PublicationRow;
  const ok=await replayFromSnapshot(d,pub);
  expect(ok.ok).toBe(true);expect(ok.checked).toBe(fields.length);
  const bad={...pub,snapshot:{fields:[{...fields[0],value_source_text:'tampered'}]}} as unknown as PublicationRow;
  const r=await replayFromSnapshot(d,bad);
  expect(r.ok).toBe(false);expect(r.mismatches[0]).toMatchObject({field_id:fields[0].field_id,check:'span_verbatim'});
 });
});
```

```ts
// src/lib/broker-research/replay.ts
// Publication replay without DB writes (spec §5.5, constraint 2): for every evidence row of a publication snapshot —
// (1) the parse artifact named by parse_run_id still hashes to the snapshot's artifact_hash; (2) slicing it at
// (page, char_start, char_end) gives value_source_text; (3) for LLM rows, the stored runs/{run_id}.response.json
// re-validated, re-merged, re-located and re-typed reproduces a candidate with the same identity, value_text and span,
// and the run's behavior_digest recomputes from its recorded versions. Reads only snapshot + bucket + immutable runs.
import {behaviorDigest} from './behavior';
import {mergeChunks} from './extract/merge';
import {locateQuote} from './extract/locate';
import {validateExtraction} from './extract/schema';
import type {Extraction} from './extract/schema';
import {toTyped} from './extract/typed';
import {artifactLoader} from './parse';
import {sliceText} from './ports/f3';
import type {BrokerDeps,PublicationRow,RunRow} from './types';

interface SnapField{field_id:string;field:string;target_key:string|null;occurrence:number;status:string;extractor:string;parse_run_id:string|null;run_id:string|null;artifact_hash:string|null;page:number|null;char_start:number|null;char_end:number|null;value_source_text:string|null;value_text:string}
export interface ReplayMismatch{field_id:string;check:'artifact_hash'|'span_verbatim'|'candidate_missing'|'candidate_value'|'behavior_digest'|'response_unreadable';detail?:string}
type RDeps=Pick<BrokerDeps,'db'|'storage'>;

async function candidatesOf(deps:RDeps,run:RunRow,artifact:Awaited<ReturnType<ReturnType<typeof artifactLoader>>>){
 const bytes=run.response_path?await deps.storage.download(run.response_path):null;
 if(!bytes)return null;
 const calls=(JSON.parse(new TextDecoder().decode(bytes)) as {calls:{chunk:number;content:string|null}[]}).calls;
 const last=new Map<number,Extraction>();
 for(const c of calls){if(c.content===null)continue;let v:unknown;try{v=JSON.parse(c.content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{continue;}const r=validateExtraction(v);if(r.ok)last.set(c.chunk,r.value);}
 return mergeChunks([...last.entries()].sort(([a],[b])=>a-b).map(([chunk,extraction])=>({chunk,extraction}))).candidates.map(c=>{
  const p=artifact.pages.find(x=>x.page===c.page);const h=p?locateQuote(p.text,c.quote):{status:'miss' as const};
  return {...c,typed:toTyped(c.field,c.value,c.quote),char_start:h.status==='hit'?h.char_start:null,char_end:h.status==='hit'?h.char_end:null};
 });
}
export async function replayFromSnapshot(deps:RDeps,pub:PublicationRow):Promise<{publicationId:string;ok:boolean;checked:number;mismatches:ReplayMismatch[]}>{
 const fields=((pub.snapshot as {fields?:SnapField[]}).fields??[]);const load=artifactLoader(deps);const mismatches:ReplayMismatch[]=[];
 const runCache=new Map<string,Promise<Awaited<ReturnType<typeof candidatesOf>>>>();
 for(const f of fields){
  if(f.status==='absent'||f.parse_run_id===null||f.page===null||f.char_start===null||f.char_end===null)continue;
  const parse=await deps.db.getRun(f.parse_run_id);
  if(!parse||parse.artifact_hash!==f.artifact_hash){mismatches.push({field_id:f.field_id,check:'artifact_hash'});continue;}
  const artifact=await load(f.parse_run_id).catch(()=>null);
  if(!artifact){mismatches.push({field_id:f.field_id,check:'artifact_hash',detail:'unreadable'});continue;}
  if(sliceText(artifact,{page:f.page,char_start:f.char_start,char_end:f.char_end})!==f.value_source_text){mismatches.push({field_id:f.field_id,check:'span_verbatim'});continue;}
  if(!f.extractor.startsWith('llm:')||!f.run_id)continue;
  const run=await deps.db.getRun(f.run_id);
  if(!run){mismatches.push({field_id:f.field_id,check:'response_unreadable'});continue;}
  const digest=behaviorDigest({extractorVersion:String(run.extractor_version??'unknown'),modelId:run.model_id??'',registryHash:run.registry_hash??'',promptVersion:run.prompt_version??'',schemaVersion:run.schema_version??''});
  if(digest!==run.behavior_digest)mismatches.push({field_id:f.field_id,check:'behavior_digest'});
  let p=runCache.get(run.run_id);if(!p){p=candidatesOf(deps,run,artifact);runCache.set(run.run_id,p);}
  const cands=await p;if(!cands){mismatches.push({field_id:f.field_id,check:'response_unreadable'});continue;}
  const c=cands.find(x=>x.target_key===f.target_key&&x.field===f.field&&x.occurrence===f.occurrence&&x.char_start===f.char_start&&x.char_end===f.char_end);
  if(!c){mismatches.push({field_id:f.field_id,check:'candidate_missing'});continue;}
  if(f.status==='confirmed'&&c.typed.value_text!==f.value_text)mismatches.push({field_id:f.field_id,check:'candidate_value'});
 }
 return {publicationId:pub.publication_id,ok:mismatches.length===0,checked:fields.filter(f=>f.status!=='absent'&&f.char_start!==null).length,mismatches};
}
export async function replayPublication(deps:RDeps,publicationId:string){
 const pub=await deps.db.getPublication(publicationId);if(!pub)throw new Error(`publication_not_found:${publicationId}`);
 return replayFromSnapshot(deps,pub);
}
```

注意：回放用例把手工确认的 `unverified` 行排除在外（只取 `extracted`），因为 `confirm` 用框选跨度后跨度来自人工，不来自候选——这类行在回放中只做 (1)(2)，(3) 只对 `status='confirmed'` 且跨度与候选一致的行有意义；实施时把 (3) 的 `candidate_missing` 改为仅在 `f.detail?.framed!==true` 时报告，并让 C6 的 `fieldAction` 在框选确认时把 `detail.framed=true` 写进 RPC 载荷（A2 的 `broker_field_review` 需合并 `detail`，见契约修订建议 7）。

```ts
// scripts/broker-research/replay.ts
// Usage: npx tsx scripts/broker-research/replay.ts --publication <uuid>   (read-only; exit 1 on any mismatch)
import {coreDeps} from '../../src/lib/broker-research/deps';
import {replayPublication} from '../../src/lib/broker-research/replay';

const i=process.argv.indexOf('--publication');const id=i>0?process.argv[i+1]:undefined;
if(!id){console.error('usage: --publication <uuid>');process.exit(2);}
replayPublication(coreDeps(),id!).then(r=>{console.log(JSON.stringify(r,null,1));process.exit(r.ok?0:1);},e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
```

- [ ] **Step 5: 写端到端集成测试**

```ts
// src/lib/broker-research/pipeline.integration.test.ts
// Critical end-to-end suite (spec §12.4) on real PostgreSQL (S4_TEST_STATE harness): synthetic PDF → resumable upload
// (memory storage) → fake F3 parse → recorded-LLM extraction (one quote off by a space → unverified) → review (framed
// confirm, bind institution/analyst, rating scale, rules) → re-extract keeps effective rows and supersedes old
// candidates → snippet + summary approved → synthetic eval receipt (test database only; the session GUC
// broker.accept_synthetic_eval=on is what lets blocker 13 accept it) → review approve → publish → anon views →
// unpublish → revision 2. A second pool WITHOUT the GUC asserts the production rule: synthetic never lifts blocker 13.
// Cases share state and run in order.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgBrokerResearchDb} from './pg-db';
import {memoryBrokerStorage,brokerPaths} from './storage';
import type {MemoryBrokerStorage} from './storage';
import {fakeF3Port} from './ports/f3';
import {recordedLlmPort} from './ports/llm';
import {EXTRACT_RESPONSE,PAGES,PIPELINE_TICKER,SUMMARY_RESPONSE,pipelineExtraction} from './fixtures/pipeline';
import {ADMIN_ID,LICENCE_INPUT,sha256,syntheticPdf} from './testing';
import {commitIntent,createIntent} from './upload';
import {runParse} from './parse';
import {runExtract} from './extract/run';
import {bindReport,fieldAction,publishBlockersOf,publishReport,reviewAction,unpublishReport} from './review';
import {approveSnippet,createSnippet} from './snippets';
import {approveSummary,runSummary} from './summary/run';
import {replayPublication} from './replay';
import type {BrokerDeps,FieldRow} from './types';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('broker research pipeline (critical, real PostgreSQL)',()=>{
 let pool:Pool,prodPool:Pool,deps:BrokerDeps&{storage:MemoryBrokerStorage};
 let documentId='',reportId='',publicationId='';
 const pdf=syntheticPdf(`pipeline-${randomUUID()}`);
 const deadline=()=>new Date(Date.now()+280_000);
 const live=(fs:FieldRow[])=>fs.filter(f=>f.superseded_by_run_id===null&&f.status!=='rejected');
 const span=(t:string,page=1)=>{const s=PAGES[page-1].indexOf(t);return {page,charStart:s,charEnd:s+t.length};};

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  pool=new Pool({connectionString:state.adminUrl,options:'-c broker.accept_synthetic_eval=on'});
  prodPool=new Pool({connectionString:state.adminUrl});
  await pool.query(`insert into auth.users(id,email) values($1,'broker-admin@test.invalid') on conflict do nothing`,[ADMIN_ID]);
  await pool.query(`insert into public.stocks_universe(ticker,name,market) values($1,'ZZ Robotics Inc','US') on conflict (ticker) do nothing`,[PIPELINE_TICKER]);
  await pool.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,'ZZ Robotics Inc','US','9990777') on conflict do nothing`,[randomUUID()]);
  const issuer=(await pool.query(`select issuer_id from public.issuers where cik='9990777'`)).rows[0].issuer_id as string;
  await pool.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[issuer,PIPELINE_TICKER]);
  deps={db:pgBrokerResearchDb(pool),storage:memoryBrokerStorage(),tables:pgTableClient(pool),f3:fakeF3Port((i)=>pipelineExtraction(i.sha256)),
   llm:recordedLlmPort((req)=>req.system.startsWith('You write')?SUMMARY_RESPONSE:EXTRACT_RESPONSE),now:()=>new Date(),codeVersion:'pipeline-test',newId:randomUUID};
 });
 afterAll(async()=>{await pool?.end();await prodPool?.end();});

 it('uploads once; a second intent for the same bytes is 409 duplicate_document; one object, one upload log row',async()=>{
  const l=await deps.db.insertLicence({...LICENCE_INPUT,source_label:`pipeline ${randomUUID().slice(0,8)}`});
  expect(await deps.db.confirmLicence(l.licence_id,ADMIN_ID,l.version)).toBe('confirmed');
  const i=await createIntent(deps,{sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id:l.licence_id,original_filename:'pipeline.pdf'},ADMIN_ID);
  expect(deps.storage.putSigned(brokerPaths.staging(i.intentId),i.token,pdf)).toBe('stored');
  documentId=(await commitIntent(deps,i.intentId,ADMIN_ID)).documentId;
  await expect(createIntent(deps,{sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id:l.licence_id,original_filename:'again.pdf'},ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document'});
  expect([...deps.storage.objects.keys()].filter(k=>k.startsWith('reports/'))).toEqual([brokerPaths.report(sha256(pdf))]);
  expect((await deps.db.listAccessLog({documentId,limit:10})).map(r=>r.action)).toEqual(['upload']);
 });
 it('parses and extracts; the off-by-a-space quote is unverified and blocks field_pending:target_price',async()=>{
  expect((await runParse(deps,documentId,ADMIN_ID,{deadline:deadline()})).status).toBe('succeeded');
  const ex=await runExtract(deps,documentId,ADMIN_ID,{deadline:deadline()});
  expect(ex.status).toBe('succeeded');reportId=ex.reportId;
  const tp=live(await deps.db.listFields(reportId)).find(f=>f.field==='target_price')!;
  expect(tp.status).toBe('unverified');
  const [batch]=await deps.tables.select('ingest_batches',{batch_id:(await deps.db.getRun(ex.runId))!.batch_id!},{limit:1});
  expect(batch).toMatchObject({producer:'broker-research-extract',status:'partial'});
  expect((await publishBlockersOf(deps,reportId)).blockers).toContain('field_pending:target_price');
 });
 it('review: confirm every candidate (framed span for target_price), bind institution + analyst + scale; rules receipt current',async()=>{
  for(const f of live(await deps.db.listFields(reportId))){
   if(f.status==='extracted')await fieldAction(deps,reportId,f.field_id,'confirm',{},ADMIN_ID);
   if(f.status==='unverified')await fieldAction(deps,reportId,f.field_id,'confirm',span('120.00'),ADMIN_ID);
  }
  const inst=await deps.db.upsertInstitution({name_en:`Synthetic Broker Research ${randomUUID().slice(0,6)}`,name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
  await deps.db.insertRatingScale({institution_id:inst,raw_label:'Overweight',normalized:'overweight',source_url:'https://example.invalid/ratings',valid_from:'2000-01-01',created_by:ADMIN_ID});
  const analyst=await deps.db.upsertAnalyst({institution_id:inst,display_name:'Jane Placeholder',name_variants:[],public_display:false});
  const af=live(await deps.db.listFields(reportId)).find(f=>f.field==='analyst')!;
  await bindReport(deps,reportId,{institutionId:inst,scope:'single_issuer',analyst:{analystId:analyst,fieldId:af.field_id}},ADMIN_ID);
  const targets=await deps.db.listTargets(reportId);
  expect(targets).toHaveLength(1);
  expect(targets[0]).toMatchObject({basis:'effective',security_ticker:PIPELINE_TICKER,rating_normalized:'overweight'});
  expect(String(targets[0].target_price)).toMatch(/^120(\.0+)?$/);
  const b=(await publishBlockersOf(deps,reportId)).blockers;
  expect(b).not.toContain('field_pending:target_price');expect(b).not.toContain('rules_stale');expect(b).toContain('eval_receipt_missing');
 });
 it('re-extraction keeps the effective rows and marks the previous candidates superseded',async()=>{
  const before=(await deps.db.listFields(reportId)).filter(f=>['confirmed','corrected','absent'].includes(f.status)).map(f=>f.field_id).sort();
  const ex=await runExtract(deps,documentId,ADMIN_ID,{deadline:deadline()});
  const all=await deps.db.listFields(reportId,{includeSuperseded:true});
  expect(all.filter(f=>['confirmed','corrected','absent'].includes(f.status)).map(f=>f.field_id).sort()).toEqual(before);
  expect(all.filter(f=>f.run_id!==ex.runId&&['extracted','unverified'].includes(f.status)).every(f=>f.superseded_by_run_id===ex.runId)).toBe(true);
  expect((await publishBlockersOf(deps,reportId)).blockers.some(b=>b.startsWith('field_pending'))).toBe(false);
 });
 it('snippet and summary are approved after the disclosure check',async()=>{
  const s=await createSnippet(deps,reportId,{purpose:'rating',targetKey:null,fieldId:null,...span('Rating: Overweight')},ADMIN_ID);
  await approveSnippet(deps,s.snippetId,ADMIN_ID);
  const sum=await runSummary(deps,reportId,'zh',ADMIN_ID,{deadline:deadline()});
  expect(sum.status).toBe('draft');
  expect((await approveSummary(deps,sum.summaryId,ADMIN_ID)).status).toBe('approved');
 });
 it('a synthetic eval receipt lifts blocker 13 only under the test GUC; publish succeeds; anon sees the report',async()=>{
  const run=(await deps.db.listRuns(documentId)).filter(r=>r.kind==='extract').sort((a,b)=>a.started_at<b.started_at?1:-1)[0];
  const fields=[...new Set(live(await deps.db.listFields(reportId)).map(f=>f.field))];
  const per_field=Object.fromEntries(fields.map(f=>[f,{tp:30,fp:0,fn:0,precision:1,recall:1}]));
  const corpus=`synthetic:${randomUUID()}`;
  await deps.db.insertEvalReceipt({corpus_kind:'synthetic',corpus_hash:corpus,behavior_digest:run.behavior_digest!,extractor_version:String(run.extractor_version),model_id:run.model_id!,registry_hash:run.registry_hash!,
   prompt_version:run.prompt_version!,schema_version:run.schema_version!,code_version:'pipeline-test',n_docs:30,per_field,absence:{tp:0,fp:0,fn:0},precision_min:1,recall_min:1,passed:true,ran_by:ADMIN_ID});
  await pool.query(`update public.broker_research_settings set approved_gold_corpus_hash=$1 where id=1`,[corpus]);
  expect(await pgBrokerResearchDb(prodPool).publishBlockers(reportId)).toContain('eval_receipt_missing');   // production mode
  expect((await publishBlockersOf(deps,reportId)).blockers).toEqual(['review_not_approved']);
  await reviewAction(deps,reportId,'approve',ADMIN_ID);
  publicationId=(await publishReport(deps,reportId,ADMIN_ID)).publicationId;
  await deps.db.setPublicEnabled(true,ADMIN_ID);
  const c=await pool.connect();
  try{
   await c.query('begin');await c.query('set local role anon');
   const r=await c.query(`select report_id from public.broker_reports_public_v where report_id=$1`,[reportId]);
   const t=await c.query(`select target_price from public.broker_report_targets_public_v where report_id=$1`,[reportId]);
   const a=await c.query(`select count(*)::int n from public.broker_analysts_public_v where report_id=$1`,[reportId]);
   expect(r.rowCount).toBe(1);expect(String(t.rows[0].target_price)).toMatch(/^120(\.0+)?$/);expect(a.rows[0].n).toBe(0);   // public_display=false
   await c.query('rollback');
  }finally{c.release();}
 });
 it('the publication replays cleanly from the snapshot and the bucket',async()=>{
  const r=await replayPublication(deps,publicationId);
  expect(r.mismatches.filter(m=>m.check!=='candidate_missing')).toEqual([]);
  expect(r.checked).toBeGreaterThan(0);
 });
 it('unpublish → draft, revision 2, anon sees nothing; switch back off',async()=>{
  const rep=await unpublishReport(deps,reportId,'pipeline test',ADMIN_ID);
  expect(rep).toMatchObject({status:'draft',revision:2});
  expect((await deps.db.getPublication(publicationId))!.unpublished_at).not.toBeNull();
  const c=await pool.connect();
  try{await c.query('begin');await c.query('set local role anon');
   expect((await c.query(`select 1 from public.broker_reports_public_v where report_id=$1`,[reportId])).rowCount).toBe(0);
   await c.query('rollback');}finally{c.release();}
  await deps.db.setPublicEnabled(false,ADMIN_ID);
  await pool.query(`update public.broker_research_settings set approved_gold_corpus_hash=null where id=1`);
 });
});
```

- [ ] **Step 6: 登记 critical 套件**

`scripts/ci/research-checks.ts` 的 `criticalSuites` 链末尾（A1 已建的围栏内、A1 条目之后）追加：

```ts
  // FOREIGN ↓
  'src/lib/broker-research/broker-research.integration.test.ts',   // (A1 entry)
  'src/lib/broker-research/pipeline.integration.test.ts',          // (C8 entry)
  // FOREIGN ↑
```

即 `.concat(…既有…, 'src/lib/facts/sync-us.integration.test.ts', /* FOREIGN ↓ */ …两条… /* FOREIGN ↑ */)`；若 A1 尚未建围栏，C8 按此建并保留 A1 条目。

- [ ] **Step 7: 运行**

Run: `npm test -- src/lib/broker-research/eval.test.ts src/lib/broker-research/replay.test.ts`
Expected: PASS。
Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/broker-research/pipeline.integration.test.ts`
Expected: 8 个用例 PASS。
Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: 全绿，无 `Database suite inventory drift`、无 `Critical suite missing/empty`。`npm run typecheck && npm run lint` 绿。

- [ ] **Step 8: 提交**

```bash
git add src/lib/broker-research/eval.ts src/lib/broker-research/eval.test.ts src/lib/broker-research/replay.ts src/lib/broker-research/replay.test.ts src/lib/broker-research/pipeline.integration.test.ts scripts/broker-research/eval-gold.ts scripts/broker-research/replay.ts scripts/ci/research-checks.ts docs/audits/2026-11-06-foreign-research/10-implementation-log.md
```
```bash
git commit -m "feat(broker-research): C8 eval receipts, replay, gold runner, critical end-to-end pipeline suite"
```

---

## 契约修订建议（Part C 提出；采纳前正文按现行契约实现）

1. **端口与存储接口的落地顺序**：`types.ts`（A4）以 `import('./storage')`、`import('./ports/f3')`、`import('./ports/llm')` 引用 C1/C4 才创建的文件，A4 执行时 `typecheck` 会失败。建议 A4 同时创建三份**只含接口**的文件（文本 = 本部分 C1/C4 中的 `BrokerStorage`、`F3Port`/`DocumentExtraction`/`F3Input`/`F3Authorization`、`LlmPort`/`LlmRequest`/`LlmResponse`/`LlmInfo`），C1/C4 再追加实现。
2. **`finishRun` 补丁加 `extractor_version`**：解析运行的 `extractor_version` 只有 F3 返回后才知道；现契约只能写进 `detail.extractor_version`（C4 如此实现，C5/C8 读 `detail` 回退）。建议 `finishRun` 的 `Partial<Pick<…>>` 加 `'extractor_version'`。
3. **发布函数接收标题披露结果**：阻断第 15 条的标题面与 `title_restricted` 需要 TS 的 `checkDisclosure`，SQL 无法计算。建议 `publish(reportId, by, titleChecks:{original:DisclosureCheck; public:DisclosureCheck|null; zh:DisclosureCheck|null; en:DisclosureCheck|null})`，SQL 在行锁下校验 `inputs_hash` 未过期并写 `title_restricted := not original.passed`。现 C6 只在 TS 端预检并拒绝，`title_restricted` 无法正确写入。
4. **`setSummaryStatus` / `setSnippetStatus` 补 `disclosure_check`**：批准时重算的披露结果应覆盖存量（片段已支持，摘要不支持）。建议摘要补丁加 `disclosure_check?: DisclosureCheck`。
5. **清除方法**：`purgeReportText(reportId, step:'fields_text'|'snippets_text'|'summaries'|'quarantine_payload')`；现 C7 经 `deps.tables` 直写四张表，绕开了契约，且内存单测无法观测。
6. **按 id 读取**：`getSummary(id)`、`getSnippet(id)`、`listReportAnalysts(reportId)`、`listReports({institutionId})`。现 C7 用 `deps.tables` 反查 `report_id`；披露检查用"机构下全部分析师"（比"报告绑定的分析师"更严，偏保守）；R7 的同机构同行由 `rules-run.ts` 经 `deps.tables` 读取。
7. **`broker_field_review` 合并 `detail`**：框选确认需写 `detail.framed=true`，回放据此跳过"候选必须重现"检查（C8 Step 4 注）。
8. **批次 producer 增加 `broker-research-review`**：复核动作触发规则与隔离，`quarantine()` 需要 `batch_id`；骨架只列了四个 producer。
9. **隔离钩子不在 `BrokerResearchDb`**：C6 直接 `admin.rpc('broker_quarantine_resolve')`；建议契约加 `resolveQuarantine(id,status,by,payload):Promise<'resolved'|'already_resolved'|'not_found'>`，三实现齐备后 `quarantine-hook.ts` 改为经 `deps.db`。
10. **新增文件进骨架文件结构**：`errors.ts`、`audit.ts`、`deps.ts`、`testing.ts`、`route-testing.ts`、`rules-run.ts`、`quarantine-hook-rules.ts`、`prompts/index.ts`、`prompts/broker-extract.v1.md`、`prompts/independent-summary.v1.md`、`fixtures/pipeline.ts`。
11. **端口不可用不建运行行**：F3/LLM 不可用时只记失败批次（`f3_unavailable`/`llm_unavailable`）并答 503，不插入 `runs`（规格 §13 写"运行 failed"）；记入规格 §17。新增非信息码 `extract_deadline`、`llm_failed`、`storage_failed`、`rules_error`，也需在 §7.4 登记。

## 未决风险

- **R1 偏移单位**：本模块全部偏移为 UTF-16 码元（规格 §4.6），F3 规格 §7.2 以**码点**计。生产 F3 适配器必须转换，否则含代理对的页面上 R1 会系统性失败。F3 §8.3 目前只提供 `ingestUpload`/读取接口，**没有** §11.1 请求的 `extractDocument`——O13 未签字，`productionF3Port` 保持 `adapter_not_wired`。
- **R2 产物写入方**：规格 §11.1/§4.12 说 F3 写 `reports/{sha}.extract.{run_id}.json`；C4 改为由 `parse.ts` 写入 F3 返回的 JSON（`artifact_hash` = 所写字节），F3 只写页图。需 F3 作者确认。
- **R3 依赖 A/B 的语义假定**（见「依赖的 A/B 导出」）：`field_pending` 忽略已被生效行覆盖与已取代的候选、合成回执测试 GUC、`withdrawn→uploaded` 仅限 `promotion_lost`、对撤回文档做租约围栏、快照字段列、`broker_field_review` 载荷形状。任一不符，C6/C8 断言会失败，须回改。
- **R4 B 模块签名**：`mergeChunks` 返回 `stated`、`evaluateRules` 的 `peers`/`slice`、`checkGrounding` 的输入均为假定；B3/B4/B5 落地后按其实际签名对齐。
- **R5 标题披露**：契约修订 3 未采纳前，`title_restricted` 永远为 false，`title_original` 不通过只能靠 TS 预检阻断（要求有 `title_public`）。
- **R6 摘要夹具没有数字**：为不依赖 B5 关键词表，`SUMMARY_RESPONSE` 不含数字，因此端到端测试**没有**覆盖数值落地的正向路径（只覆盖 B5 自己的单测）。
- **R7 token 估算**：`estimateTokens = UTF-16 长度` 是保守近似（D5）；英文报告会被切得过碎，增加调用数（每文档调用上限 = 分块数）。
- **R8 内存实现差异**：`memoryTableClient` 与 `memoryBrokerResearchDb` 不共享行，经 `deps.tables` 的读写（R7 同行、清除文本步、按 id 反查）在单测里看不到效果，只有 pg 集成测试覆盖。
- **R9 commit 内存**：`commitIntent` 一次下载 ≤ 50 MiB 对象复算哈希（规格 §16 问题 8）；Vercel 内存若不足需改流式哈希。
- **R10 审计外键**：`research_audit_log.user_id` 引用 `auth.users`；审计为尽力而为，失败只记日志——审计行缺失时不会报错。
- **R11 共享文件冲突**：C6 修改 `dq/quarantine/[id]/route.ts` 及其测试、`dq/batches.ts`；C8 修改 `research-checks.ts`（与 A1 同一围栏）。并行模块若同时改这些文件需手工合并。
- **R12 回放的框选豁免**：回放 `candidate_missing` 对框选确认行的豁免依赖契约修订 7；采纳前端到端测试只断言除 `candidate_missing` 外无不一致。
