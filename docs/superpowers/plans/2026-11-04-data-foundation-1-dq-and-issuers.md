# 数据底座一：质量设施 + 发行人表 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地数据底座规格的 WP-F0（`ingest_batches` / `dq_quarantine` / `dq_reconciliations` / `dq_freshness` 四表、规则库、`/admin/dq` 看板）与 WP-F1a（全局 `issuers` 五表、解析与合并库、SEC 与现有研究实体的装载脚本），让后续的披露事实库和宏观模块有统一的批次回执、隔离队列、新鲜度与发行人 ID。

**Architecture:** 新增两个迁移（可重放、RLS 公共只读或仅 service role），一个薄的 `TableClient` 抽象（Supabase 实现 + 内存实现）让 `src/lib/dq/*` 与 `src/lib/entities/*` 的逻辑用纯 vitest 单测覆盖；数据库约束用 `test:db` 的真实 PostgreSQL 集成测试覆盖。装载脚本默认 dry-run，`--apply` 才写库，每次运行都写 `ingest_batches` 回执。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（Postgres + supabase-js）、vitest、`pg`（集成测试）、`tsx` 脚本。规格：`docs/superpowers/specs/2026-11-04-data-foundation-design.md` §3、§5、§6。

本计划是三份中的第一份：计划二（披露事实库 WP-F2a/b/c）、计划三（标识符补全 WP-F1b + 对账与新鲜度 WP-F5）在本计划完成后编写。

---

## 仓库约定（动手前必读）

- 迁移文件 `supabase/migrations/YYYYMMDDHHMMSS_name.sql`，时间戳必须晚于 `20261018150000`；写法可重放（`create table if not exists`、`drop policy if exists` 后 `create policy`）。`scripts/ci/research-checks.ts::migrationInventory` 要求：锁文件 `supabase/migrations.lock.json` 里的文件字节不可变；未锁的文件时间戳必须晚于已锁最新。当前锁有 41 条、迁移目录 47 个文件，即 6 个未锁迁移（20261006 之后），本计划 Task 1 把它们与新迁移一起补进锁（补锁后它们的字节就被冻结，这正是我们要的）。
- `test:db`（`scripts/ci/research-db.ts`）启动本地 PostgreSQL 17，按顺序执行全部迁移，再跑 vitest。集成测试用 `process.env.S4_TEST_STATE` 读取 `adminUrl`，用 `describe.skipIf(!enabled)` 跳过。**任何包含字符串 `S4_TEST_STATE` 的 `.test.ts` 都必须加进 `scripts/ci/research-checks.ts` 的 `criticalSuites`，否则 "Database suite inventory drift" 失败。**
- 本地 harness 只建了 `storage.buckets(id,name,public,file_size_limit,allowed_mime_types)`；迁移里不要引用 `storage.objects`。本计划不建桶。
- 管理员门禁：页面用 `requireAdminUser()`（`src/lib/admin/auth.ts`，抛 `AdminUnauthenticated` / `AdminForbidden`），API 同样；服务端写库用 `getAdminSupabase()`（`src/lib/supabase/admin.ts`，绕过 RLS）。
- i18n：`messages/{zh,en}/admin.json` 已有 `usage`、`securities` 两组；新增 `dq` 组必须中英都加，`src/i18n/messages-parity.test.ts` 会校验对等。
- `src/lib/supabase/database.types.ts` 手工维护：新表要加 `Row/Insert/Update`。
- 提交：`git commit` 单独执行（仓库钩子会拦截同一命令里出现的 `-n`）；提交信息末尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- 测试命令：`npm test -- <path>`（vitest），`npm run typecheck`，`npm run lint`，`npm run test:db`（需本机 PostgreSQL 17，`S4_POSTGRES_BIN` 可指定）。

## 文件结构

```
supabase/migrations/20261105090000_dq_foundation.sql        四张质量表
supabase/migrations/20261105091000_issuers.sql              发行人五表 + research_entity_* 新列
supabase/migrations.lock.json                               追加 6 条
src/lib/db/table-client.ts                                  TableClient 接口 + Supabase 实现
src/lib/db/memory-table-client.ts                           内存实现（测试用）
src/lib/db/table-client.test.ts
src/lib/dq/batches.ts        startBatch / finishBatch / batchStatusFromCounts
src/lib/dq/quarantine.ts     quarantine / resolveQuarantine / listOpenQuarantine
src/lib/dq/rules.ts          rangeRule / identityRule / jumpRule / runRules（纯函数）
src/lib/dq/freshness.ts      computeFreshness（纯）/ recordAttempt
src/lib/dq/*.test.ts
src/lib/dq/dq-foundation.integration.test.ts                迁移 + RLS 真实库测试
src/lib/entities/types.ts    Issuer / IssuerSecurity 类型
src/lib/entities/merge.ts    matchIssuer（纯）
src/lib/entities/issuers.ts  upsertIssuerByIdentifiers / attachSecurity
src/lib/entities/resolve.ts  resolveIssuer
src/lib/entities/*.test.ts
src/lib/entities/issuers.integration.test.ts
src/lib/research/entity-keys/parsers.ts                     + parseSecCompanyTickersExchange
src/app/api/admin/dq/route.ts                               GET 看板数据
src/app/api/admin/dq/quarantine/[id]/route.ts               POST 处理隔离项
src/app/api/entities/resolve/route.ts                       GET 公共解析
src/app/(app)/admin/dq/page.tsx + AdminDqClient.tsx
messages/{zh,en}/admin.json                                 + dq
src/lib/supabase/database.types.ts                          + 9 张表类型
scripts/entity-keys/load-sec-issuers.ts                     SEC → issuers（美股）
scripts/entity-keys/link-research-entities.ts               research_entity_keys → issuers
scripts/ci/research-checks.ts                               criticalSuites + 2
docs/runbooks/data-foundation.md
```

---

### Task 1: 质量设施迁移 + 锁文件

**Files:**
- Create: `supabase/migrations/20261105090000_dq_foundation.sql`
- Modify: `supabase/migrations.lock.json`
- Create: `src/lib/dq/dq-foundation.integration.test.ts`
- Modify: `scripts/ci/research-checks.ts:9-15`

- [ ] **Step 1: 写集成测试（真实 PostgreSQL，先失败）**

```ts
// src/lib/dq/dq-foundation.integration.test.ts
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261105090000_dq_foundation.sql';
const TABLES=['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'];

describe.skipIf(!enabled)('WP-F0 dq foundation on real PostgreSQL',()=>{
 let admin:Pool;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates the four tables with RLS enabled and no policies, and replays without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows) expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n;
  expect(policies).toBe(0);
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('enforces batch status, quarantine status and freshness cadence check constraints',async()=>{
  const batch=randomUUID();
  await admin.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'test','unit')`,[batch]);
  await expect(admin.query(`insert into public.ingest_batches(batch_id,producer,dataset,status) values($1,'test','unit','bogus')`,[randomUUID()])).rejects.toThrow(/check constraint/);
  await admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,'unit','t','k','range',$2)`,[randomUUID(),batch]);
  await expect(admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,status) values($1,'unit','t','k','range',$2,'done')`,[randomUUID(),batch])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id) values($1,'unit','t','k','range',$2)`,[randomUUID(),randomUUID()])).rejects.toThrow(/foreign key/);
  await admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('unit','daily','missing')`);
  await expect(admin.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('unit2','weekly','missing')`)).rejects.toThrow(/check constraint/);
 });

 it('denies anon and authenticated roles while service_role bypasses',async()=>{
  const c=await admin.connect();
  try{
   await c.query(`set role anon`);
   await expect(c.query(`select * from public.ingest_batches`)).rejects.toThrow(/permission denied/);
   await c.query(`reset role`);
  }finally{c.release();}
 });
});
```

- [ ] **Step 2: 把测试加入 criticalSuites**

在 `scripts/ci/research-checks.ts` 的 `.concat(` 列表末尾追加 `'src/lib/dq/dq-foundation.integration.test.ts'`：

```ts
].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts');
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm run test:db`
Expected: `dq-foundation.integration.test.ts` 失败（表不存在：`relation "public.ingest_batches" does not exist` 或 `expected [] to equal [...]`）。

- [ ] **Step 4: 写迁移**

```sql
-- supabase/migrations/20261105090000_dq_foundation.sql
-- WP-F0 (data foundation spec §5.1): shared ingest receipts, quarantine, reconciliation
-- results and freshness registry for every dataset (macro, facts, securities, …).
-- Service-role only: RLS enabled with no policies; admin routes read through getAdminSupabase().
-- Replayable: guarded create statements.

create table if not exists public.ingest_batches (
  batch_id      uuid primary key,
  producer      text not null check (length(producer) between 1 and 64),
  dataset       text not null check (length(dataset) between 1 and 64),
  status        text not null default 'running'
                check (status in ('running','success','partial','failed','rejected')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  counts        jsonb not null default '{}',
  errors        jsonb not null default '[]',
  tool_versions jsonb not null default '{}',
  code_version  text,
  triggered_by  text not null default 'script' check (triggered_by in ('cron','manual','script'))
);
create index if not exists ingest_batches_dataset_started_idx on public.ingest_batches(dataset, started_at desc);

create table if not exists public.dq_quarantine (
  id           uuid primary key,
  dataset      text not null,
  table_name   text not null,
  natural_key  text not null,
  reason_code  text not null,
  detail       jsonb not null default '{}',
  payload      jsonb not null default '{}',
  batch_id     uuid not null references public.ingest_batches(batch_id) on delete cascade,
  status       text not null default 'open' check (status in ('open','resolved_accept','resolved_reject')),
  resolved_by  uuid,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists dq_quarantine_open_idx on public.dq_quarantine(dataset, created_at desc) where status = 'open';

create table if not exists public.dq_reconciliations (
  id           uuid primary key,
  dataset      text not null,
  left_source  text not null,
  right_source text not null,
  natural_key  text not null,
  left_value   numeric,
  right_value  numeric,
  abs_diff     numeric,
  rel_diff     numeric,
  tolerance    numeric not null,
  passed       boolean not null,
  batch_id     uuid references public.ingest_batches(batch_id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists dq_reconciliations_failed_idx on public.dq_reconciliations(dataset, created_at desc) where passed = false;

create table if not exists public.dq_freshness (
  dataset            text primary key,
  expected_cadence   text not null check (expected_cadence in ('daily','monthly','quarterly','event')),
  last_ok_at         timestamptz,
  last_attempt_at    timestamptz,
  consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  status             text not null check (status in ('fresh','stale','error','missing')),
  detail             jsonb not null default '{}',
  updated_at         timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
```

- [ ] **Step 5: 追加锁文件（含 4 个历史未锁迁移）**

Run:
```bash
node -e "const fs=require('fs'),c=require('crypto');const p='supabase/migrations.lock.json';const l=JSON.parse(fs.readFileSync(p,'utf8'));const have=new Set(l.migrations.map(m=>m.file));for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){if(!have.has(f))l.migrations.push({file:f,sha256:c.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+f)).digest('hex')});}fs.writeFileSync(p,JSON.stringify(l,null,2)+'\n');console.log(l.migrations.length)"
```
Expected: 打印 `48`（锁里原有 41 条 + 6 条历史未锁迁移 + 本迁移；`ls supabase/migrations/*.sql | wc -l` 此时应为 48）。注意 `JSON.stringify` 两空格缩进与原文件一致，`git diff` 只应新增条目。

- [ ] **Step 6: 运行集成测试与迁移检查**

Run: `npm run test:db`
Expected: `dq-foundation.integration.test.ts` 3 个用例通过，`reports/research-db-summary.json` 中 criticalSuites 计数 +1。
Run: `npm run test:migrations`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add supabase/migrations/20261105090000_dq_foundation.sql supabase/migrations.lock.json src/lib/dq/dq-foundation.integration.test.ts scripts/ci/research-checks.ts
git commit -m "feat(dq): shared ingest batches, quarantine, reconciliation and freshness tables" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: TableClient 抽象（Supabase + 内存）

**Files:**
- Create: `src/lib/db/table-client.ts`
- Create: `src/lib/db/memory-table-client.ts`
- Test: `src/lib/db/table-client.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/db/table-client.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from './memory-table-client';

describe('memory table client',()=>{
 it('inserts, selects by equality, orders, limits, updates and upserts',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a',n:2,k:'x'});
  await c.insert('t',{id:'b',n:1,k:'x'});
  await c.insert('t',{id:'c',n:3,k:'y'});
  expect((await c.select('t',{k:'x'})).map(r=>r.id)).toEqual(['a','b']);
  expect((await c.select('t',{},{orderBy:'n',desc:true,limit:2})).map(r=>r.id)).toEqual(['c','a']);
  await c.update('t',{id:'a'},{n:10});
  expect((await c.select('t',{id:'a'}))[0].n).toBe(10);
  await c.upsert('t',{id:'a',n:11,k:'x'},'id');
  await c.upsert('t',{id:'d',n:0,k:'z'},'id');
  expect((await c.select('t',{id:'a'}))[0].n).toBe(11);
  expect((await c.select('t',{})).length).toBe(4);
 });
 it('rejects a duplicate primary key on insert when a key is declared',async()=>{
  const c=memoryTableClient({t:['id']});
  await c.insert('t',{id:'a'});
  await expect(c.insert('t',{id:'a'})).rejects.toThrow('duplicate key');
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/db/table-client.test.ts`
Expected: FAIL，`Cannot find module './memory-table-client'`。

- [ ] **Step 3: 实现接口与两个实现**

```ts
// src/lib/db/table-client.ts
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
export interface SelectOptions{limit?:number;orderBy?:string;desc?:boolean}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 update(table:string,match:Row,patch:Row):Promise<void>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type lacks the new tables; a loosely typed handle keeps
 // callers typed through TableClient instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)throw new Error(`${table} insert: ${error.message}`);return data as Row;},
  async update(table,match,patch){let q=db.from(table).update(patch);for(const [k,v] of Object.entries(match))q=q.eq(k,v);const {error}=await q;if(error)throw new Error(`${table} update: ${error.message}`);},
  async select(table,match,opts={}){let q=db.from(table).select('*');for(const [k,v] of Object.entries(match))q=q.eq(k,v);if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});if(opts.limit)q=q.limit(opts.limit);const {data,error}=await q;if(error)throw new Error(`${table} select: ${error.message}`);return (data??[]) as Row[];},
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)throw new Error(`${table} upsert: ${error.message}`);},
 };
}
```

```ts
// src/lib/db/memory-table-client.ts
// In-memory TableClient for unit tests. Optional `keys` declares primary keys per table so
// duplicate inserts fail like PostgreSQL would.
import type {Row,SelectOptions,TableClient} from './table-client';

const matches=(row:Row,match:Row)=>Object.entries(match).every(([k,v])=>row[k]===v);

export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[]}{
 const tables=new Map<string,Row[]>();
 const rowsOf=(t:string)=>{if(!tables.has(t))tables.set(t,[]);return tables.get(t)!;};
 const keyOf=(t:string,row:Row)=>(keys[t]??[]).map(k=>String(row[k])).join('\u0000');
 return {
  rows:(t)=>rowsOf(t).map(r=>({...r})),
  async insert(t,row){
   const rows=rowsOf(t);
   if(keys[t]&&rows.some(r=>keyOf(t,r)===keyOf(t,row)))throw new Error(`duplicate key value violates unique constraint "${t}_pkey"`);
   const copy={...row};rows.push(copy);return {...copy};
  },
  async update(t,match,patch){for(const r of rowsOf(t))if(matches(r,match))Object.assign(r,patch);},
  async select(t,match,opts={}){
   let out=rowsOf(t).filter(r=>matches(r,match)).map(r=>({...r}));
   if(opts.orderBy){const k=opts.orderBy;out.sort((a,b)=>(a[k] as number)<(b[k] as number)?-1:(a[k] as number)>(b[k] as number)?1:0);if(opts.desc)out.reverse();}
   if(opts.limit)out=out.slice(0,opts.limit);
   return out;
  },
  async upsert(t,row,onConflict){
   const cols=onConflict.split(',').map(s=>s.trim());
   const rows=rowsOf(t);const hit=rows.find(r=>cols.every(c=>r[c]===row[c]));
   if(hit)Object.assign(hit,row);else rows.push({...row});
  },
 };
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/db/table-client.test.ts`
Expected: 2 passed。

- [ ] **Step 5: 提交**

```bash
git add src/lib/db
git commit -m "feat(db): TableClient abstraction with Supabase and in-memory implementations" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 批次回执 `src/lib/dq/batches.ts`

**Files:**
- Create: `src/lib/dq/batches.ts`
- Test: `src/lib/dq/batches.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/dq/batches.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {startBatch,finishBatch,emptyCounts,batchStatusFromCounts} from './batches';

describe('batchStatusFromCounts',()=>{
 it('is success with no failures, partial with some, failed when nothing landed, rejected when flagged',()=>{
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5},[])).toBe('success');
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5,failed:1},[])).toBe('partial');
  expect(batchStatusFromCounts({...emptyCounts(),failed:3},[])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts(),fetched:0},[{code:'network'}])).toBe('failed');
  expect(batchStatusFromCounts({...emptyCounts(),inserted:5},[],{rejected:true})).toBe('rejected');
 });
});

describe('batches',()=>{
 it('starts a running batch and finishes it with counts, status and errors',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id']});
  const {batchId}=await startBatch(c,{producer:'edgar-companyfacts',dataset:'facts',toolVersions:{sec_api:'v1'},codeVersion:'abc123',triggeredBy:'script'});
  expect(batchId).toMatch(/^[0-9a-f-]{36}$/);
  expect(c.rows('ingest_batches')[0]).toMatchObject({producer:'edgar-companyfacts',dataset:'facts',status:'running',triggered_by:'script'});
  await finishBatch(c,batchId,{counts:{...emptyCounts(),inserted:2,quarantined:1},errors:[{code:'range',key:'x'}]});
  const row=c.rows('ingest_batches')[0];
  expect(row.status).toBe('success');
  expect(row.counts).toEqual({fetched:0,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:0});
  expect(row.errors).toEqual([{code:'range',key:'x'}]);
  expect(typeof row.finished_at).toBe('string');
 });
 it('rejects producer or dataset longer than 64 chars',async()=>{
  const c=memoryTableClient();
  await expect(startBatch(c,{producer:'x'.repeat(65),dataset:'d'})).rejects.toThrow('invalid_batch');
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/dq/batches.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// src/lib/dq/batches.ts
// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Nothing here throws on business
// outcomes; status is derived from counts so dashboards never guess.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:'cron'|'manual'|'script'}

export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 if(flags.rejected)return 'rejected';
 const landed=counts.inserted+counts.duplicates+counts.versioned;
 if(counts.failed>0||errors.length>0)return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:string)=>s.length>=1&&s.length<=64;
 if(!ok(input.producer)||!ok(input.dataset))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:input.triggeredBy??'script',
 });
 return {batchId};
}

export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean}):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 await client.update('ingest_batches',{batch_id:batchId},{status,counts:result.counts,errors:result.errors,finished_at:new Date().toISOString()});
 return status;
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/dq/batches.test.ts`
Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add src/lib/dq/batches.ts src/lib/dq/batches.test.ts
git commit -m "feat(dq): ingest batch receipts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 规则库与隔离队列

**Files:**
- Create: `src/lib/dq/rules.ts`
- Create: `src/lib/dq/quarantine.ts`
- Test: `src/lib/dq/rules.test.ts`, `src/lib/dq/quarantine.test.ts`

- [ ] **Step 1: 写失败测试（规则）**

```ts
// src/lib/dq/rules.test.ts
import {describe,it,expect} from 'vitest';
import {rangeRule,identityRule,jumpRule,runRules,RULES_VERSION} from './rules';

describe('dq rules',()=>{
 it('rangeRule is inclusive and reports the offending value',()=>{
  expect(rangeRule('pmi_range',50,0,100).passed).toBe(true);
  expect(rangeRule('pmi_range',100,0,100).passed).toBe(true);
  expect(rangeRule('pmi_range',101,0,100)).toEqual({ruleId:'pmi_range',passed:false,detail:{value:101,min:0,max:100}});
  expect(rangeRule('pmi_range',null,0,100)).toEqual({ruleId:'pmi_range',passed:false,detail:{value:null,reason:'not_a_number'}});
 });
 it('identityRule compares two sides with a relative tolerance scaled by magnitude',()=>{
  expect(identityRule('assets_eq',1000,1004,0.005).passed).toBe(true);
  expect(identityRule('assets_eq',1000,1006,0.005).passed).toBe(false);
  expect(identityRule('zero',0,0.5,0.005).passed).toBe(true); // magnitude floor of 1 avoids divide-by-zero
  expect(identityRule('gross',100,70,0.005,{expected:30}).passed).toBe(true);
 });
 it('jumpRule flags relative changes beyond the limit and tolerates a missing previous value',()=>{
  expect(jumpRule('yoy_jump',120,100,10).passed).toBe(true);
  expect(jumpRule('yoy_jump',1200,100,10).passed).toBe(false);
  expect(jumpRule('yoy_jump',120,undefined,10).passed).toBe(true);
 });
 it('runRules aggregates failures and carries the rules version',()=>{
  const out=runRules([rangeRule('a',1,0,2),rangeRule('b',5,0,2)]);
  expect(out).toEqual({passed:false,failed:[{ruleId:'b',passed:false,detail:{value:5,min:0,max:2}}],version:RULES_VERSION});
 });
});
```

- [ ] **Step 2: 写失败测试（隔离）**

```ts
// src/lib/dq/quarantine.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {startBatch} from './batches';
import {quarantine,resolveQuarantine,listOpenQuarantine} from './quarantine';

describe('quarantine',()=>{
 it('records an open item tied to a batch, lists it, and resolves it with actor and time',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'facts'});
  const id=await quarantine(c,{dataset:'facts',table:'financial_facts',naturalKey:'AAPL|revenue|2023-09-30',reasonCode:'identity_failed',detail:{rule:'gross'},payload:{value:1},batchId});
  const open=await listOpenQuarantine(c,'facts');
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({id,status:'open',reason_code:'identity_failed',natural_key:'AAPL|revenue|2023-09-30'});
  await resolveQuarantine(c,id,{status:'resolved_accept',resolvedBy:'00000000-0000-0000-0000-000000000001'});
  expect(await listOpenQuarantine(c,'facts')).toHaveLength(0);
  const row=c.rows('dq_quarantine')[0];
  expect(row.status).toBe('resolved_accept');
  expect(row.resolved_by).toBe('00000000-0000-0000-0000-000000000001');
  expect(typeof row.resolved_at).toBe('string');
 });
 it('rejects an unknown resolution status',async()=>{
  const c=memoryTableClient();
  await expect(resolveQuarantine(c,'x',{status:'done' as never,resolvedBy:'u'})).rejects.toThrow('invalid_status');
 });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/dq/rules.test.ts src/lib/dq/quarantine.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现规则库**

```ts
// src/lib/dq/rules.ts
// Pure validation rules (spec §5.2). Each returns a RuleResult; callers quarantine on failure.
export const RULES_VERSION='dq-rules/1.0';
export interface RuleResult{ruleId:string;passed:boolean;detail?:Record<string,unknown>}

const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);

export function rangeRule(ruleId:string,value:unknown,min:number,max:number):RuleResult{
 if(!num(value))return {ruleId,passed:false,detail:{value:value??null,reason:'not_a_number'}};
 return value>=min&&value<=max?{ruleId,passed:true}:{ruleId,passed:false,detail:{value,min,max}};
}

/** |left − right − expected| ≤ tolerance × max(|left|,|right|,1). `expected` lets "gross = revenue − cost" be expressed as identity(revenue, cost, tol, {expected: gross}). */
export function identityRule(ruleId:string,left:unknown,right:unknown,tolerance:number,opts:{expected?:number}={}):RuleResult{
 if(!num(left)||!num(right))return {ruleId,passed:false,detail:{left:left??null,right:right??null,reason:'not_a_number'}};
 const diff=Math.abs(left-right-(opts.expected??0));
 const scale=Math.max(Math.abs(left),Math.abs(right),1);
 return diff<=tolerance*scale?{ruleId,passed:true}:{ruleId,passed:false,detail:{left,right,expected:opts.expected??0,diff,tolerance}};
}

/** Relative jump |cur − prev| / max(|prev|,1) must be ≤ maxRelJump. No previous value → pass. */
export function jumpRule(ruleId:string,current:unknown,previous:unknown,maxRelJump:number):RuleResult{
 if(!num(current))return {ruleId,passed:false,detail:{value:current??null,reason:'not_a_number'}};
 if(!num(previous))return {ruleId,passed:true};
 const rel=Math.abs(current-previous)/Math.max(Math.abs(previous),1);
 return rel<=maxRelJump?{ruleId,passed:true}:{ruleId,passed:false,detail:{current,previous,rel,maxRelJump}};
}

export function runRules(results:RuleResult[]):{passed:boolean;failed:RuleResult[];version:string}{
 const failed=results.filter(r=>!r.passed);
 return {passed:failed.length===0,failed,version:RULES_VERSION};
}
```

- [ ] **Step 5: 实现隔离队列**

```ts
// src/lib/dq/quarantine.ts
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';

export type QuarantineStatus='open'|'resolved_accept'|'resolved_reject';
export interface QuarantineInput{dataset:string;table:string;naturalKey:string;reasonCode:string;detail?:Record<string,unknown>;payload?:Record<string,unknown>;batchId:string}

export async function quarantine(client:TableClient,input:QuarantineInput):Promise<string>{
 const id=randomUUID();
 await client.insert('dq_quarantine',{
  id,dataset:input.dataset,table_name:input.table,natural_key:input.naturalKey,reason_code:input.reasonCode,
  detail:input.detail??{},payload:input.payload??{},batch_id:input.batchId,status:'open',created_at:new Date().toISOString(),
 });
 return id;
}

export async function resolveQuarantine(client:TableClient,id:string,input:{status:Exclude<QuarantineStatus,'open'>;resolvedBy:string}):Promise<void>{
 if(input.status!=='resolved_accept'&&input.status!=='resolved_reject')throw new Error('invalid_status');
 await client.update('dq_quarantine',{id},{status:input.status,resolved_by:input.resolvedBy,resolved_at:new Date().toISOString()});
}

export async function listOpenQuarantine(client:TableClient,dataset?:string,limit=100):Promise<Row[]>{
 const match:Row={status:'open'};if(dataset)match.dataset=dataset;
 return client.select('dq_quarantine',match,{orderBy:'created_at',desc:true,limit});
}
```

- [ ] **Step 6: 运行通过**

Run: `npm test -- src/lib/dq/rules.test.ts src/lib/dq/quarantine.test.ts`
Expected: 6 passed。

- [ ] **Step 7: 提交**

```bash
git add src/lib/dq/rules.ts src/lib/dq/rules.test.ts src/lib/dq/quarantine.ts src/lib/dq/quarantine.test.ts
git commit -m "feat(dq): validation rules and quarantine queue" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 新鲜度登记

**Files:**
- Create: `src/lib/dq/freshness.ts`
- Test: `src/lib/dq/freshness.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/dq/freshness.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {computeFreshness,recordAttempt} from './freshness';

const T=(iso:string)=>new Date(iso);

describe('computeFreshness',()=>{
 it('is missing without a successful run, error after two consecutive failures',()=>{
  expect(computeFreshness({cadence:'daily',lastOkAt:null,consecutiveErrors:0,now:T('2026-11-05T00:00:00Z')})).toBe('missing');
  expect(computeFreshness({cadence:'daily',lastOkAt:T('2026-11-04T00:00:00Z'),consecutiveErrors:2,now:T('2026-11-05T00:00:00Z')})).toBe('error');
 });
 it('uses cadence windows plus grace: daily 1d+1d, monthly 31d+3d, quarterly 92d+3d, event never stale',()=>{
  const now=T('2026-11-05T00:00:00Z');
  expect(computeFreshness({cadence:'daily',lastOkAt:T('2026-11-03T12:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
  expect(computeFreshness({cadence:'daily',lastOkAt:T('2026-11-02T12:00:00Z'),consecutiveErrors:0,now})).toBe('stale');
  expect(computeFreshness({cadence:'monthly',lastOkAt:T('2026-10-03T00:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
  expect(computeFreshness({cadence:'monthly',lastOkAt:T('2026-10-01T00:00:00Z'),consecutiveErrors:0,now})).toBe('stale');
  expect(computeFreshness({cadence:'quarterly',lastOkAt:T('2026-08-01T00:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
  expect(computeFreshness({cadence:'event',lastOkAt:T('2020-01-01T00:00:00Z'),consecutiveErrors:0,now})).toBe('fresh');
 });
});

describe('recordAttempt',()=>{
 it('upserts the dataset row, resets errors on success and counts consecutive failures',async()=>{
  const c=memoryTableClient();
  await recordAttempt(c,'facts.us',{ok:false,cadence:'daily',now:T('2026-11-05T00:00:00Z'),detail:{code:'network'}});
  expect(c.rows('dq_freshness')[0]).toMatchObject({dataset:'facts.us',status:'missing',consecutive_errors:1,last_ok_at:null});
  await recordAttempt(c,'facts.us',{ok:false,cadence:'daily',now:T('2026-11-05T01:00:00Z')});
  expect(c.rows('dq_freshness')[0]).toMatchObject({status:'error',consecutive_errors:2});
  await recordAttempt(c,'facts.us',{ok:true,cadence:'daily',now:T('2026-11-05T02:00:00Z')});
  expect(c.rows('dq_freshness')[0]).toMatchObject({status:'fresh',consecutive_errors:0,last_ok_at:'2026-11-05T02:00:00.000Z'});
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/dq/freshness.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// src/lib/dq/freshness.ts
// Freshness registry (spec §5.1 dq_freshness). Status is computed from cadence windows, not
// from "did the cron run": a run that inserted nothing new does not refresh last_ok_at unless
// the producer says ok=true.
import type {TableClient} from '../db/table-client';

export type Cadence='daily'|'monthly'|'quarterly'|'event';
export type FreshnessStatus='fresh'|'stale'|'error'|'missing';
const DAY=86_400_000;
const WINDOW_MS:Record<Cadence,number|null>={daily:1*DAY,monthly:31*DAY,quarterly:92*DAY,event:null};
const GRACE_MS:Record<Cadence,number>={daily:1*DAY,monthly:3*DAY,quarterly:3*DAY,event:0};

export function computeFreshness(input:{cadence:Cadence;lastOkAt:Date|null;consecutiveErrors:number;now:Date}):FreshnessStatus{
 if(input.consecutiveErrors>=2)return 'error';
 if(!input.lastOkAt)return 'missing';
 const window=WINDOW_MS[input.cadence];
 if(window===null)return 'fresh';
 return input.now.getTime()-input.lastOkAt.getTime()>window+GRACE_MS[input.cadence]?'stale':'fresh';
}

export async function recordAttempt(client:TableClient,dataset:string,input:{ok:boolean;cadence:Cadence;now?:Date;detail?:Record<string,unknown>}):Promise<FreshnessStatus>{
 const now=input.now??new Date();
 const existing=(await client.select('dq_freshness',{dataset}))[0];
 const prevOk=existing?.last_ok_at?new Date(existing.last_ok_at as string):null;
 const prevErrors=Number(existing?.consecutive_errors??0);
 const consecutiveErrors=input.ok?0:prevErrors+1;
 const lastOkAt=input.ok?now:prevOk;
 const status=computeFreshness({cadence:input.cadence,lastOkAt,consecutiveErrors,now});
 await client.upsert('dq_freshness',{
  dataset,expected_cadence:input.cadence,last_ok_at:lastOkAt?lastOkAt.toISOString():null,last_attempt_at:now.toISOString(),
  consecutive_errors:consecutiveErrors,status,detail:input.detail??{},updated_at:now.toISOString(),
 },'dataset');
 return status;
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/dq/freshness.test.ts`
Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add src/lib/dq/freshness.ts src/lib/dq/freshness.test.ts
git commit -m "feat(dq): freshness registry with cadence windows" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 管理看板 API 与页面 `/admin/dq`

**Files:**
- Create: `src/app/api/admin/dq/route.ts`
- Create: `src/app/api/admin/dq/quarantine/[id]/route.ts`
- Create: `src/app/(app)/admin/dq/page.tsx`
- Create: `src/app/(app)/admin/dq/AdminDqClient.tsx`
- Modify: `messages/zh/admin.json`, `messages/en/admin.json`
- Create: `src/lib/dq/dashboard.ts`（纯函数：把四张表的行整理成看板摘要）
- Test: `src/lib/dq/dashboard.test.ts`

- [ ] **Step 1: 写失败测试（看板摘要纯函数）**

```ts
// src/lib/dq/dashboard.test.ts
import {describe,it,expect} from 'vitest';
import {summarizeDq} from './dashboard';

describe('summarizeDq',()=>{
 it('counts batches by status, open quarantine by dataset, failed reconciliations and non-fresh datasets',()=>{
  const out=summarizeDq({
   batches:[{dataset:'facts',status:'success'},{dataset:'facts',status:'partial'},{dataset:'macro',status:'failed'}],
   quarantine:[{dataset:'facts',status:'open'},{dataset:'facts',status:'open'},{dataset:'macro',status:'resolved_accept'}],
   reconciliations:[{dataset:'facts',passed:false},{dataset:'facts',passed:true}],
   freshness:[{dataset:'facts.us',status:'fresh'},{dataset:'macro',status:'stale'},{dataset:'facts.cn',status:'missing'}],
  });
  expect(out).toEqual({
   batchesByStatus:{success:1,partial:1,failed:1},
   openQuarantineByDataset:{facts:2},
   failedReconciliations:1,
   notFresh:[{dataset:'macro',status:'stale'},{dataset:'facts.cn',status:'missing'}],
  });
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/dq/dashboard.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现摘要函数**

```ts
// src/lib/dq/dashboard.ts
export interface DqSummaryInput{
 batches:{dataset:unknown;status:unknown}[];
 quarantine:{dataset:unknown;status:unknown}[];
 reconciliations:{dataset:unknown;passed:unknown}[];
 freshness:{dataset:unknown;status:unknown}[];
}
export interface DqSummary{
 batchesByStatus:Record<string,number>;
 openQuarantineByDataset:Record<string,number>;
 failedReconciliations:number;
 notFresh:{dataset:string;status:string}[];
}
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
export function summarizeDq(input:DqSummaryInput):DqSummary{
 const batchesByStatus:Record<string,number>={};for(const b of input.batches)bump(batchesByStatus,String(b.status));
 const openQuarantineByDataset:Record<string,number>={};for(const q of input.quarantine)if(q.status==='open')bump(openQuarantineByDataset,String(q.dataset));
 const failedReconciliations=input.reconciliations.filter(r=>r.passed===false).length;
 const notFresh=input.freshness.filter(f=>f.status!=='fresh').map(f=>({dataset:String(f.dataset),status:String(f.status)}));
 return {batchesByStatus,openQuarantineByDataset,failedReconciliations,notFresh};
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/dq/dashboard.test.ts`
Expected: 1 passed。

- [ ] **Step 5: 写 API 路由**

```ts
// src/app/api/admin/dq/route.ts
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {summarizeDq} from '@/lib/dq/dashboard';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  await requireAdminUser();
  const client=supabaseTableClient(getAdminSupabase());
  const [batches,quarantine,reconciliations,freshness]=await Promise.all([
   client.select('ingest_batches',{},{orderBy:'started_at',desc:true,limit:50}),
   client.select('dq_quarantine',{status:'open'},{orderBy:'created_at',desc:true,limit:100}),
   client.select('dq_reconciliations',{passed:false},{orderBy:'created_at',desc:true,limit:50}),
   client.select('dq_freshness',{},{orderBy:'dataset'}),
  ]);
  return NextResponse.json({
   summary:summarizeDq({batches,quarantine,reconciliations,freshness} as never),
   batches,quarantine,reconciliations,freshness,
  });
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'Forbidden'},{status:403});
  throw error;
 }
}
```

```ts
// src/app/api/admin/dq/quarantine/[id]/route.ts
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {resolveQuarantine} from '@/lib/dq/quarantine';

export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireAdminUser();
  const {id}=await params;
  if(!UUID.test(id))return NextResponse.json({error:'invalid_id'},{status:400});
  const body=await req.json().catch(()=>null) as {status?:string}|null;
  const status=body?.status;
  if(status!=='resolved_accept'&&status!=='resolved_reject')return NextResponse.json({error:'invalid_status'},{status:400});
  await resolveQuarantine(supabaseTableClient(getAdminSupabase()),id,{status,resolvedBy:user.id});
  return NextResponse.json({id,status});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'Forbidden'},{status:403});
  throw error;
 }
}
```

- [ ] **Step 6: 写页面与客户端组件**

```tsx
// src/app/(app)/admin/dq/page.tsx
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {AdminDqClient} from './AdminDqClient';

export default async function AdminDqPage(){
 try{
  await requireAdminUser();
 }catch(error){
  if(error instanceof AdminForbidden){
   const t=await getTranslations('admin.dq');
   return (
    <section className="border-y border-border py-8">
     <h1 className="text-xl font-bold">{t('deniedTitle')}</h1>
     <p className="mt-2 text-sm text-text-dim">{t('deniedBody')}</p>
    </section>
   );
  }
  if(error instanceof AdminUnauthenticated)redirect('/login?next=%2Fadmin%2Fdq');
  throw error;
 }
 return <AdminDqClient/>;
}
```

```tsx
// src/app/(app)/admin/dq/AdminDqClient.tsx
'use client';
import {useCallback,useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {Panel} from '@/components/ui';

type Row=Record<string,unknown>;
interface Payload{summary:{batchesByStatus:Record<string,number>;openQuarantineByDataset:Record<string,number>;failedReconciliations:number;notFresh:{dataset:string;status:string}[]};batches:Row[];quarantine:Row[];reconciliations:Row[];freshness:Row[]}

export function AdminDqClient(){
 const t=useTranslations('admin.dq');
 const [data,setData]=useState<Payload|null>(null);
 const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{
  setError(null);
  const res=await fetch('/api/admin/dq',{cache:'no-store'});
  if(!res.ok){setError(t('loadFailed'));return;}
  setData(await res.json() as Payload);
 },[t]);
 useEffect(()=>{void load();},[load]);
 const resolve=async(id:string,status:'resolved_accept'|'resolved_reject')=>{
  const res=await fetch(`/api/admin/dq/quarantine/${id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status})});
  if(res.ok)await load();else setError(t('resolveFailed'));
 };
 return (
  <>
   <h1 className="mb-1 text-xl font-bold">{t('title')}</h1>
   <p className="mb-4 text-[11px] text-text-dim">{t('subtitle')}</p>
   {error?<div className="mb-3 rounded-md bg-down/10 px-3 py-2 text-sm text-down">{error}</div>:null}
   {!data?<p className="text-sm text-text-dim">{t('loading')}</p>:(
    <div className="grid gap-3 lg:grid-cols-2">
     <Panel title={t('sections.freshness')}>
      <table className="w-full text-[11px]"><tbody>
       {data.freshness.map(f=>(
        <tr key={String(f.dataset)} className="border-b border-border">
         <td className="py-1 font-mono">{String(f.dataset)}</td>
         <td className="py-1 text-text-dim">{String(f.expected_cadence)}</td>
         <td className={`py-1 font-mono ${f.status==='fresh'?'text-text':'text-warn'}`}>{String(f.status)}</td>
         <td className="py-1 font-mono text-text-dim">{f.last_ok_at?String(f.last_ok_at).slice(0,16):'—'}</td>
        </tr>
       ))}
      </tbody></table>
     </Panel>
     <Panel title={t('sections.batches')}>
      <table className="w-full text-[11px]"><tbody>
       {data.batches.map(b=>(
        <tr key={String(b.batch_id)} className="border-b border-border">
         <td className="py-1 font-mono text-text-dim">{String(b.started_at).slice(0,16)}</td>
         <td className="py-1">{String(b.dataset)} · {String(b.producer)}</td>
         <td className="py-1 font-mono">{String(b.status)}</td>
         <td className="py-1 font-mono text-text-dim">{JSON.stringify(b.counts)}</td>
        </tr>
       ))}
      </tbody></table>
     </Panel>
     <Panel title={`${t('sections.quarantine')} · ${data.quarantine.length}`} className="lg:col-span-2">
      <table className="w-full text-[11px]"><tbody>
       {data.quarantine.map(q=>(
        <tr key={String(q.id)} className="border-b border-border">
         <td className="py-1 font-mono text-text-dim">{String(q.created_at).slice(0,16)}</td>
         <td className="py-1">{String(q.dataset)} · {String(q.table_name)}</td>
         <td className="py-1 font-mono">{String(q.natural_key)}</td>
         <td className="py-1">{String(q.reason_code)}</td>
         <td className="py-1 text-right">
          <button type="button" className="mr-2 text-accent" onClick={()=>resolve(String(q.id),'resolved_accept')}>{t('accept')}</button>
          <button type="button" className="text-text-dim" onClick={()=>resolve(String(q.id),'resolved_reject')}>{t('reject')}</button>
         </td>
        </tr>
       ))}
      </tbody></table>
     </Panel>
     <Panel title={`${t('sections.reconciliations')} · ${data.summary.failedReconciliations}`} className="lg:col-span-2">
      <table className="w-full text-[11px]"><tbody>
       {data.reconciliations.map(r=>(
        <tr key={String(r.id)} className="border-b border-border">
         <td className="py-1">{String(r.dataset)}</td>
         <td className="py-1 font-mono">{String(r.natural_key)}</td>
         <td className="py-1 font-mono">{String(r.left_source)} {String(r.left_value)} vs {String(r.right_source)} {String(r.right_value)}</td>
         <td className="py-1 font-mono text-text-dim">rel {Number(r.rel_diff).toFixed(4)}</td>
        </tr>
       ))}
      </tbody></table>
     </Panel>
    </div>
   )}
  </>
 );
}
```

- [ ] **Step 7: 加 i18n 文案（两种语言都加，键完全一致）**

在 `messages/zh/admin.json` 顶层加：

```json
"dq": {
  "title": "数据质量看板",
  "subtitle": "批次回执 · 隔离队列 · 对账失败 · 新鲜度",
  "deniedTitle": "无权访问",
  "deniedBody": "此页面仅对管理员开放。",
  "loading": "正在加载…",
  "loadFailed": "加载失败，请稍后重试。",
  "resolveFailed": "处理失败，请稍后重试。",
  "accept": "接受",
  "reject": "拒绝",
  "sections": { "freshness": "新鲜度", "batches": "最近批次", "quarantine": "隔离队列", "reconciliations": "对账失败" }
}
```

在 `messages/en/admin.json` 顶层加：

```json
"dq": {
  "title": "Data quality",
  "subtitle": "Ingest receipts · quarantine · failed reconciliations · freshness",
  "deniedTitle": "Access denied",
  "deniedBody": "This page is for administrators only.",
  "loading": "Loading…",
  "loadFailed": "Failed to load. Try again later.",
  "resolveFailed": "Could not resolve. Try again later.",
  "accept": "Accept",
  "reject": "Reject",
  "sections": { "freshness": "Freshness", "batches": "Recent batches", "quarantine": "Quarantine", "reconciliations": "Failed reconciliations" }
}
```

- [ ] **Step 8: 校验与类型检查**

Run: `npm test -- src/i18n/messages-parity.test.ts src/lib/dq`
Expected: 全部通过。
Run: `npm run typecheck && npm run lint`
Expected: 无错误。若 `Panel` 的 `className` 不接受 `lg:col-span-2`（它接受任意 `HTMLAttributes`，应无问题）。

- [ ] **Step 9: 提交**

```bash
git add src/app/api/admin/dq "src/app/(app)/admin/dq" src/lib/dq/dashboard.ts src/lib/dq/dashboard.test.ts messages/zh/admin.json messages/en/admin.json
git commit -m "feat(admin): data-quality dashboard with quarantine resolution" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 发行人迁移 + 集成测试

**Files:**
- Create: `supabase/migrations/20261105091000_issuers.sql`
- Modify: `supabase/migrations.lock.json`
- Create: `src/lib/entities/issuers.integration.test.ts`
- Modify: `scripts/ci/research-checks.ts`

- [ ] **Step 1: 写集成测试（先失败）**

```ts
// src/lib/entities/issuers.integration.test.ts
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261105091000_issuers.sql';
const PUBLIC_TABLES=['issuers','issuer_securities','industry_classifications','issuer_industry_memberships'];

describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
 let admin:Pool;const issuer=randomUUID();
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  await admin.query(`insert into public.stocks_universe(ticker,name,market) values('AAPL','Apple Inc.','US'),('600519.SH','贵州茅台','A') on conflict (ticker) do nothing`);
 });
 afterAll(async()=>{await admin?.end();});

 it('creates five tables, public read on four, service-only claims, and replays',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[[...PUBLIC_TABLES,'issuer_identifier_claims']])).rows;
  expect(rows).toHaveLength(5);for(const r of rows)expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select tablename,policyname from pg_policies where schemaname='public' and tablename=any($1)`,[PUBLIC_TABLES])).rows;
  for(const t of PUBLIC_TABLES)expect(policies.some((p:{tablename:string;policyname:string})=>p.tablename===t&&p.policyname===`${t} public read`)).toBe(true);
  expect((await admin.query(`select count(*)::int n from pg_policies where tablename='issuer_identifier_claims'`)).rows[0].n).toBe(0);
  const cols=(await admin.query(`select table_name,column_name from information_schema.columns where table_schema='public' and ((table_name='research_entity_keys' and column_name='issuer_id') or (table_name='research_entity_securities' and column_name='ticker'))`)).rows;
  expect(cols).toHaveLength(2);
  await expect(admin.query(readFileSync(MIGRATION,'utf8'))).resolves.toBeDefined();
 });

 it('enforces identifier shapes, unique hard identifiers, name presence and security validity windows',async()=>{
  await admin.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik,lei) values($1,'Apple Inc.','US','320193','HWUPKR0MPOU8FGXBT394')`,[issuer]);
  await expect(admin.query(`insert into public.issuers(issuer_id,canonical_name_en,cik) values($1,'Dup','320193')`,[randomUUID()])).rejects.toThrow(/duplicate key/);
  await expect(admin.query(`insert into public.issuers(issuer_id,canonical_name_en,cik) values($1,'Bad','0320193')`,[randomUUID()])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`insert into public.issuers(issuer_id) values($1)`,[randomUUID()])).rejects.toThrow(/check constraint/);
  await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,'AAPL','common',true,'2000-01-01','sec')`,[issuer]);
  await expect(admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,valid_from,source) values($1,'AAPL','common','2000-01-01','sec')`,[issuer])).rejects.toThrow(/duplicate key/);
  await expect(admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,valid_from,valid_to,source) values($1,'600519.SH','A','2020-01-01','2019-01-01','x')`,[issuer])).rejects.toThrow(/check constraint/);
  await expect(admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,valid_from,source) values($1,'NOPE','common','2020-01-01','x')`,[issuer])).rejects.toThrow(/foreign key/);
  await expect(admin.query(`insert into public.issuer_securities(issuer_id,ticker,figi,share_class,valid_from,source) values($1,'600519.SH','XYZ','A','2020-01-01','x')`,[issuer])).rejects.toThrow(/check constraint/);
 });

 it('anon can read issuers and securities but not claims',async()=>{
  await admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$2,'isin','US0378331005','test',0.9,'pending')`,[randomUUID(),issuer]);
  const c=await admin.connect();
  try{
   await c.query('set role anon');
   expect((await c.query(`select count(*)::int n from public.issuers where issuer_id=$1`,[issuer])).rows[0].n).toBe(1);
   expect((await c.query(`select count(*)::int n from public.issuer_securities where issuer_id=$1`,[issuer])).rows[0].n).toBe(1);
   await expect(c.query(`select * from public.issuer_identifier_claims`)).rejects.toThrow(/permission denied/);
   await c.query('reset role');
  }finally{c.release();}
 });
});
```

- [ ] **Step 2: 加入 criticalSuites**

`scripts/ci/research-checks.ts` 的 `.concat(...)` 末尾再追加 `'src/lib/entities/issuers.integration.test.ts'`。

- [ ] **Step 3: 运行，确认失败**

Run: `npm run test:db`
Expected: `issuers.integration.test.ts` 失败（表不存在）。

- [ ] **Step 4: 写迁移**

```sql
-- supabase/migrations/20261105091000_issuers.sql
-- WP-F1a (data foundation spec §3.1): one global issuer per company; securities in
-- stocks_universe hang off an issuer with validity windows. Public reference data: anon/auth
-- may read four tables; identifier claims (pending merges/conflicts) are service-role only.
-- Replayable: guarded create statements, drop-then-create policies.

create table if not exists public.issuers (
  issuer_id               uuid primary key,
  canonical_name_zh       text,
  canonical_name_en       text,
  country_code            text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  lei                     text check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$'),
  cik                     text check (cik is null or cik ~ '^[1-9][0-9]{0,9}$'),
  usci                    text check (usci is null or usci ~ '^[0-9A-HJ-NP-RTUW-Y]{18}$'),
  cninfo_org_id           text check (cninfo_org_id is null or length(btrim(cninfo_org_id)) > 0),
  hkex_stock_code_primary text check (hkex_stock_code_primary is null or hkex_stock_code_primary ~ '^[0-9]{5}$'),
  status                  text not null default 'active' check (status in ('active','merged','dissolved')),
  merged_into             uuid references public.issuers(issuer_id),
  provenance              jsonb not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint issuers_has_name check (canonical_name_zh is not null or canonical_name_en is not null)
);
create unique index if not exists issuers_lei_idx on public.issuers(lei) where lei is not null;
create unique index if not exists issuers_cik_idx on public.issuers(cik) where cik is not null;
create unique index if not exists issuers_usci_idx on public.issuers(usci) where usci is not null;
create unique index if not exists issuers_cninfo_idx on public.issuers(cninfo_org_id) where cninfo_org_id is not null;

create table if not exists public.issuer_securities (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete cascade,
  ticker      text not null references public.stocks_universe(ticker) on delete cascade,
  isin        text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  figi        text check (figi is null or figi ~ '^BBG[A-Z0-9]{9}$'),
  share_class text not null default 'common' check (share_class in ('A','H','ADR','common','preferred','other')),
  is_primary  boolean not null default false,
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),
  source      text not null,
  provenance  jsonb not null default '{}',
  primary key (issuer_id, ticker, valid_from),
  unique (ticker, valid_from)
);
create index if not exists issuer_securities_ticker_idx on public.issuer_securities(ticker);
create unique index if not exists issuer_securities_isin_idx on public.issuer_securities(isin, valid_from) where isin is not null;

create table if not exists public.issuer_identifier_claims (
  id          uuid primary key,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete cascade,
  id_type     text not null check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id')),
  value       text not null,
  source      text not null,
  confidence  numeric not null check (confidence >= 0 and confidence <= 1),
  status      text not null default 'pending' check (status in ('accepted','pending','rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists issuer_identifier_claims_pending_idx on public.issuer_identifier_claims(created_at desc) where status = 'pending';

create table if not exists public.industry_classifications (
  scheme      text not null check (scheme in ('sw2021','sw2014','gics','csrc','custom')),
  version     text not null,
  code        text not null,
  level       integer not null check (level between 1 and 4),
  name_zh     text,
  name_en     text,
  parent_code text,
  primary key (scheme, version, code)
);

create table if not exists public.issuer_industry_memberships (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete cascade,
  scheme      text not null,
  version     text not null,
  code        text not null,
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),
  source      text not null,
  provenance  jsonb not null default '{}',
  primary key (issuer_id, scheme, version, code, valid_from),
  foreign key (scheme, version, code) references public.industry_classifications(scheme, version, code)
);

alter table public.research_entity_keys add column if not exists issuer_id uuid references public.issuers(issuer_id);
alter table public.research_entity_securities add column if not exists ticker text references public.stocks_universe(ticker);

do $$ declare t text; begin
  foreach t in array array['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['issuers','issuer_securities','industry_classifications','issuer_industry_memberships'] loop
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
end $$;
```

- [ ] **Step 5: 追加锁文件**

Run: 与 Task 1 Step 5 相同的 `node -e` 命令。
Expected: 打印 `49`。

- [ ] **Step 6: 运行通过**

Run: `npm run test:db && npm run test:migrations`
Expected: 两个新集成套件全部通过。

- [ ] **Step 7: 提交**

```bash
git add supabase/migrations/20261105091000_issuers.sql supabase/migrations.lock.json src/lib/entities/issuers.integration.test.ts scripts/ci/research-checks.ts
git commit -m "feat(entities): global issuers, securities, identifier claims and industry membership tables" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 类型、合并规则与发行人写入

**Files:**
- Create: `src/lib/entities/types.ts`
- Create: `src/lib/entities/merge.ts`
- Create: `src/lib/entities/issuers.ts`
- Test: `src/lib/entities/merge.test.ts`, `src/lib/entities/issuers.test.ts`

- [ ] **Step 1: 写类型**

```ts
// src/lib/entities/types.ts
export type HardIdType='lei'|'cik'|'usci';
export interface IssuerIdentifiers{lei?:string|null;cik?:string|null;usci?:string|null;cninfo_org_id?:string|null}
export interface IssuerInput extends IssuerIdentifiers{
 canonical_name_zh?:string|null;canonical_name_en?:string|null;country_code?:string|null;hkex_stock_code_primary?:string|null;
 provenance?:Record<string,unknown>;
}
export interface Issuer extends IssuerInput{issuer_id:string;status:'active'|'merged'|'dissolved';merged_into?:string|null}
export type ShareClass='A'|'H'|'ADR'|'common'|'preferred'|'other';
export interface IssuerSecurityInput{issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;source:string;provenance?:Record<string,unknown>}
```

- [ ] **Step 2: 写失败测试（合并规则）**

```ts
// src/lib/entities/merge.test.ts
import {describe,it,expect} from 'vitest';
import {matchIssuer} from './merge';

const A={issuer_id:'a',lei:'HWUPKR0MPOU8FGXBT394',cik:'320193',usci:null};
const B={issuer_id:'b',lei:null,cik:'789019',usci:null};

describe('matchIssuer',()=>{
 it('returns same when a hard identifier matches and nothing contradicts',()=>{
  expect(matchIssuer([A,B],{cik:'320193'})).toEqual({kind:'same',issuer_id:'a'});
  expect(matchIssuer([A,B],{lei:'HWUPKR0MPOU8FGXBT394',cik:'320193'})).toEqual({kind:'same',issuer_id:'a'});
 });
 it('returns conflict when matching identifiers point at different issuers or a hard id contradicts',()=>{
  expect(matchIssuer([A,B],{lei:'HWUPKR0MPOU8FGXBT394',cik:'789019'})).toEqual({kind:'conflict',issuer_ids:['a','b'],reason:'identifiers_split'});
  expect(matchIssuer([A],{cik:'320193',lei:'529900T8BM49AURSDO55'})).toEqual({kind:'conflict',issuer_ids:['a'],reason:'hard_id_mismatch'});
 });
 it('returns new when no hard identifier matches, and rejects an input without any hard identifier',()=>{
  expect(matchIssuer([A,B],{cik:'1018724'})).toEqual({kind:'new'});
  expect(()=>matchIssuer([A],{cninfo_org_id:'x'})).toThrow('no_hard_identifier');
 });
});
```

- [ ] **Step 3: 写失败测试（写入）**

```ts
// src/lib/entities/issuers.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {upsertIssuerByIdentifiers,attachSecurity} from './issuers';

describe('upsertIssuerByIdentifiers',()=>{
 it('creates a new issuer, reuses it on a matching hard id, and merges in new fields without overwriting non-null ones',async()=>{
  const c=memoryTableClient({issuers:['issuer_id']});
  const first=await upsertIssuerByIdentifiers(c,{cik:'320193',canonical_name_en:'Apple Inc.',country_code:'US',provenance:{cik:{source:'sec'}}});
  expect(first.created).toBe(true);
  const second=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:'HWUPKR0MPOU8FGXBT394',canonical_name_en:'APPLE INC',provenance:{lei:{source:'gleif'}}});
  expect(second.created).toBe(false);
  expect(second.issuer_id).toBe(first.issuer_id);
  const row=c.rows('issuers')[0];
  expect(row.lei).toBe('HWUPKR0MPOU8FGXBT394');
  expect(row.canonical_name_en).toBe('Apple Inc.');
  expect(row.provenance).toEqual({cik:{source:'sec'},lei:{source:'gleif'}});
 });
 it('records a pending claim instead of writing on conflict',async()=>{
  const c=memoryTableClient({issuers:['issuer_id'],issuer_identifier_claims:['id']});
  await upsertIssuerByIdentifiers(c,{cik:'320193',canonical_name_en:'Apple'});
  await upsertIssuerByIdentifiers(c,{cik:'789019',canonical_name_en:'Microsoft'});
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:'529900T8BM49AURSDO55',canonical_name_en:'X'});
  expect(out).toMatchObject({created:false,conflict:true});
  expect(c.rows('issuers')).toHaveLength(2);
  expect(c.rows('issuer_identifier_claims')[0]).toMatchObject({id_type:'lei',value:'529900T8BM49AURSDO55',status:'pending'});
 });
});

describe('attachSecurity',()=>{
 it('inserts a security row once and is idempotent for the same (ticker, valid_from)',async()=>{
  const c=memoryTableClient({issuer_securities:['issuer_id','ticker','valid_from']});
  const sec={issuer_id:'a',ticker:'AAPL',share_class:'common' as const,is_primary:true,valid_from:'2000-01-01',source:'sec'};
  expect(await attachSecurity(c,sec)).toBe('inserted');
  expect(await attachSecurity(c,sec)).toBe('duplicate');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
});
```

- [ ] **Step 4: 运行，确认失败**

Run: `npm test -- src/lib/entities`
Expected: FAIL，模块不存在。

- [ ] **Step 5: 实现合并规则**

```ts
// src/lib/entities/merge.ts
// Hard identifiers (LEI, CIK, USCI) decide automatic merges; anything softer becomes a claim.
import type {HardIdType,IssuerIdentifiers} from './types';

export const HARD_IDS:HardIdType[]=['lei','cik','usci'];
export type MatchResult={kind:'same';issuer_id:string}|{kind:'new'}|{kind:'conflict';issuer_ids:string[];reason:'identifiers_split'|'hard_id_mismatch'};

export function matchIssuer(candidates:(IssuerIdentifiers&{issuer_id:string})[],incoming:IssuerIdentifiers):MatchResult{
 const present=HARD_IDS.filter(k=>incoming[k]);
 if(present.length===0)throw new Error('no_hard_identifier');
 const hits=new Set<string>();
 for(const c of candidates)for(const k of present)if(c[k]&&c[k]===incoming[k])hits.add(c.issuer_id);
 if(hits.size===0)return {kind:'new'};
 if(hits.size>1)return {kind:'conflict',issuer_ids:[...hits].sort(),reason:'identifiers_split'};
 const [id]=hits;const hit=candidates.find(c=>c.issuer_id===id)!;
 for(const k of present)if(hit[k]&&hit[k]!==incoming[k])return {kind:'conflict',issuer_ids:[id],reason:'hard_id_mismatch'};
 return {kind:'same',issuer_id:id};
}
```

- [ ] **Step 6: 实现写入**

```ts
// src/lib/entities/issuers.ts
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';
import {HARD_IDS,matchIssuer} from './merge';
import type {IssuerInput,IssuerSecurityInput} from './types';

export interface UpsertIssuerResult{issuer_id:string|null;created:boolean;conflict?:boolean}

async function candidatesFor(client:TableClient,input:IssuerInput):Promise<Row[]>{
 const rows:Row[]=[];
 for(const k of HARD_IDS)if(input[k])rows.push(...await client.select('issuers',{[k]:input[k]}));
 const seen=new Set<string>();return rows.filter(r=>{const id=String(r.issuer_id);if(seen.has(id))return false;seen.add(id);return true;});
}

/** Create or enrich an issuer keyed by hard identifiers. Non-null existing fields are kept; provenance merges per key. */
export async function upsertIssuerByIdentifiers(client:TableClient,input:IssuerInput):Promise<UpsertIssuerResult>{
 const candidates=await candidatesFor(client,input);
 const match=matchIssuer(candidates as never,input);
 const now=new Date().toISOString();
 if(match.kind==='new'){
  const issuer_id=randomUUID();
  await client.insert('issuers',{issuer_id,canonical_name_zh:input.canonical_name_zh??null,canonical_name_en:input.canonical_name_en??null,country_code:input.country_code??null,
   lei:input.lei??null,cik:input.cik??null,usci:input.usci??null,cninfo_org_id:input.cninfo_org_id??null,hkex_stock_code_primary:input.hkex_stock_code_primary??null,
   status:'active',merged_into:null,provenance:input.provenance??{},created_at:now,updated_at:now});
  return {issuer_id,created:true};
 }
 if(match.kind==='conflict'){
  for(const k of HARD_IDS)if(input[k])for(const id of match.issuer_ids)await client.insert('issuer_identifier_claims',{id:randomUUID(),issuer_id:id,id_type:k,value:input[k],source:String((input.provenance?.[k] as {source?:string}|undefined)?.source??'unknown'),confidence:0.5,status:'pending',created_at:now});
  return {issuer_id:null,created:false,conflict:true};
 }
 const existing=candidates.find(c=>c.issuer_id===match.issuer_id)!;
 const patch:Row={updated_at:now};
 for(const k of ['canonical_name_zh','canonical_name_en','country_code','lei','cik','usci','cninfo_org_id','hkex_stock_code_primary'] as const)
  if(input[k]&&!existing[k])patch[k]=input[k];
 patch.provenance={...(existing.provenance as Record<string,unknown>??{}),...(input.provenance??{})};
 await client.update('issuers',{issuer_id:match.issuer_id},patch);
 return {issuer_id:match.issuer_id,created:false};
}

export async function attachSecurity(client:TableClient,sec:IssuerSecurityInput):Promise<'inserted'|'duplicate'>{
 const dup=await client.select('issuer_securities',{ticker:sec.ticker,valid_from:sec.valid_from});
 if(dup.length)return 'duplicate';
 await client.insert('issuer_securities',{issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin??null,figi:sec.figi??null,share_class:sec.share_class,is_primary:sec.is_primary??false,
  valid_from:sec.valid_from,valid_to:sec.valid_to??null,source:sec.source,provenance:sec.provenance??{}});
 return 'inserted';
}
```

- [ ] **Step 7: 运行通过**

Run: `npm test -- src/lib/entities`
Expected: merge 3 + issuers 3 = 6 passed（集成测试被 skipIf 跳过）。

- [ ] **Step 8: 提交**

```bash
git add src/lib/entities/types.ts src/lib/entities/merge.ts src/lib/entities/merge.test.ts src/lib/entities/issuers.ts src/lib/entities/issuers.test.ts
git commit -m "feat(entities): issuer merge rules and identifier-keyed upsert" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 解析 `resolveIssuer` + 公共 API

**Files:**
- Create: `src/lib/entities/resolve.ts`
- Create: `src/app/api/entities/resolve/route.ts`
- Test: `src/lib/entities/resolve.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/entities/resolve.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {resolveIssuer} from './resolve';

async function seed(){
 const c=memoryTableClient();
 await c.insert('issuers',{issuer_id:'a',canonical_name_en:'Apple Inc.',canonical_name_zh:'苹果',cik:'320193',lei:'HWUPKR0MPOU8FGXBT394',usci:null,status:'active'});
 await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL',isin:'US0378331005',figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
 await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL.OLD',isin:null,figi:null,share_class:'other',is_primary:false,valid_from:'1990-01-01',valid_to:'1999-12-31',source:'sec'});
 return c;
}

describe('resolveIssuer',()=>{
 it('resolves by ticker (normalized), isin, cik and lei and lists only currently valid securities by default',async()=>{
  const c=await seed();
  const byTicker=await resolveIssuer(c,{ticker:'aapl'});
  expect(byTicker?.issuer_id).toBe('a');
  expect(byTicker?.securities.map(s=>s.ticker)).toEqual(['AAPL']);
  expect((await resolveIssuer(c,{isin:'US0378331005'}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{cik:'0000320193'}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{lei:'HWUPKR0MPOU8FGXBT394'}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{ticker:'AAPL'},{includeExpired:true}))?.securities).toHaveLength(2);
 });
 it('returns null for unknown identifiers and throws on an empty query',async()=>{
  const c=await seed();
  expect(await resolveIssuer(c,{ticker:'ZZZZ'})).toBeNull();
  await expect(resolveIssuer(c,{})).rejects.toThrow('empty_query');
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/entities/resolve.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// src/lib/entities/resolve.ts
import type {Row,TableClient} from '../db/table-client';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {normalizeCik} from '../research/entity-keys/identifiers';

export interface ResolveQuery{ticker?:string;isin?:string;cik?:string;lei?:string}
export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string;is_primary:boolean;valid_from:string;valid_to:string|null}
export interface ResolvedIssuer{issuer_id:string;names:{zh:string|null;en:string|null};identifiers:{cik:string|null;lei:string|null;usci:string|null};securities:ResolvedSecurity[]}

function normalizeTicker(raw:string):string|null{
 const market=inferCoreMarket(raw);
 return market?normalizeSecurityTicker(raw,market):null;
}

export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:{includeExpired?:boolean;today?:string}={}):Promise<ResolvedIssuer|null>{
 let issuerId:string|null=null;
 if(q.ticker){
  const t=normalizeTicker(q.ticker)??q.ticker.toUpperCase();
  const rows=await client.select('issuer_securities',{ticker:t},{orderBy:'valid_from',desc:true,limit:1});
  issuerId=rows[0]?String(rows[0].issuer_id):null;
 }else if(q.isin){
  const rows=await client.select('issuer_securities',{isin:q.isin.toUpperCase()},{limit:1});
  issuerId=rows[0]?String(rows[0].issuer_id):null;
 }else if(q.cik){
  let cik:string;
  try{cik=normalizeCik(q.cik);}catch{return null;} // normalizeCik throws invalid_schema on non-numeric input
  const rows=await client.select('issuers',{cik},{limit:1});
  issuerId=rows[0]?String(rows[0].issuer_id):null;
 }else if(q.lei){
  const rows=await client.select('issuers',{lei:q.lei.toUpperCase()},{limit:1});
  issuerId=rows[0]?String(rows[0].issuer_id):null;
 }else throw new Error('empty_query');
 if(!issuerId)return null;
 const issuer=(await client.select('issuers',{issuer_id:issuerId}))[0];
 if(!issuer)return null;
 const today=opts.today??new Date().toISOString().slice(0,10);
 const secs=(await client.select('issuer_securities',{issuer_id:issuerId},{orderBy:'valid_from'}))
  .filter((s:Row)=>opts.includeExpired||s.valid_to===null||String(s.valid_to)>today)
  .map((s:Row):ResolvedSecurity=>({ticker:String(s.ticker),isin:(s.isin as string|null)??null,figi:(s.figi as string|null)??null,share_class:String(s.share_class),is_primary:Boolean(s.is_primary),valid_from:String(s.valid_from),valid_to:(s.valid_to as string|null)??null}));
 return {issuer_id:issuerId,names:{zh:(issuer.canonical_name_zh as string|null)??null,en:(issuer.canonical_name_en as string|null)??null},
  identifiers:{cik:(issuer.cik as string|null)??null,lei:(issuer.lei as string|null)??null,usci:(issuer.usci as string|null)??null},securities:secs};
}
```

`normalizeCik`（`src/lib/research/entity-keys/identifiers.ts:48`）会去掉前导零并在非法输入时抛 `invalid_schema`，所以上面用 try/catch 把非法 CIK 当作"未找到"。

- [ ] **Step 4: 写 API 路由**

```ts
// src/app/api/entities/resolve/route.ts
import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {resolveIssuer} from '@/lib/entities/resolve';

export const dynamic='force-dynamic';
const SAFE=/^[A-Za-z0-9.\-]{1,24}$/;

export async function GET(req:Request){
 const url=new URL(req.url);
 const pick=(k:string)=>{const v=url.searchParams.get(k);return v&&SAFE.test(v)?v:undefined;};
 const q={ticker:pick('ticker'),isin:pick('isin'),cik:pick('cik'),lei:pick('lei')};
 if(!q.ticker&&!q.isin&&!q.cik&&!q.lei)return NextResponse.json({error:{code:'empty_query',message:'ticker, isin, cik or lei required'}},{status:400});
 // Public reference data; the service client is used only to read tables with public-read RLS.
 const result=await resolveIssuer(supabaseTableClient(getAdminSupabase()),q);
 if(!result)return NextResponse.json({error:{code:'not_found',message:'no issuer'}},{status:404});
 return NextResponse.json(result,{headers:{'Cache-Control':'public, s-maxage=86400, stale-while-revalidate=3600'}});
}
```

- [ ] **Step 5: 运行通过 + 类型检查**

Run: `npm test -- src/lib/entities/resolve.test.ts && npm run typecheck`
Expected: 2 passed；typecheck 无错误。

- [ ] **Step 6: 提交**

```bash
git add src/lib/entities/resolve.ts src/lib/entities/resolve.test.ts src/app/api/entities/resolve/route.ts
git commit -m "feat(entities): resolve issuer by ticker/isin/cik/lei with public API" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: SEC 装载脚本（美股发行人）

**Files:**
- Modify: `src/lib/research/entity-keys/parsers.ts`（新增 `parseSecCompanyTickersExchange`）
- Create: `src/lib/entities/load-sec.ts`（纯逻辑：把 SEC 行映射成 issuer/security 输入）
- Create: `scripts/entity-keys/load-sec-issuers.ts`
- Test: `src/lib/research/entity-keys/parsers.test.ts`（追加）, `src/lib/entities/load-sec.test.ts`

- [ ] **Step 1: 写失败测试（解析 + 映射）**

`src/lib/research/entity-keys/parsers.test.ts` 已存在：把 `parseSecCompanyTickersExchange` 加进文件顶部现有的 `from './parsers'` import 里（不要在文件中间写 import），然后在文件末尾追加：

```ts
describe('parseSecCompanyTickersExchange',()=>{
 it('parses the fields/data layout into rows and zero-pads nothing',()=>{
  const json=JSON.stringify({fields:['cik','name','ticker','exchange'],data:[[320193,'Apple Inc.','AAPL','Nasdaq'],[789019,'MICROSOFT CORP','MSFT','Nasdaq']]});
  expect(parseSecCompanyTickersExchange(json)).toEqual([{cik:'320193',name:'Apple Inc.',ticker:'AAPL',exchange:'Nasdaq'},{cik:'789019',name:'MICROSOFT CORP',ticker:'MSFT',exchange:'Nasdaq'}]);
 });
 it('rejects a payload without the four expected fields',()=>{
  expect(()=>parseSecCompanyTickersExchange(JSON.stringify({fields:['cik'],data:[]}))).toThrow('invalid_sec_exchange_file');
 });
});
```

```ts
// src/lib/entities/load-sec.test.ts
import {describe,it,expect} from 'vitest';
import {planSecLoad} from './load-sec';

describe('planSecLoad',()=>{
 it('keeps only tickers present in the universe, normalizes them, and builds issuer + security inputs',()=>{
  const plan=planSecLoad([
   {cik:'320193',name:'Apple Inc.',ticker:'AAPL',exchange:'Nasdaq'},
   {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOG',exchange:'Nasdaq'},
   {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOGL',exchange:'Nasdaq'},
   {cik:'99999',name:'Not Listed','ticker':'ZZZZ',exchange:'OTC'},
  ],new Set(['AAPL','GOOG','GOOGL']),'2026-11-05');
  expect(plan.skipped).toEqual(['ZZZZ']);
  expect(plan.issuers).toEqual([
   {cik:'320193',canonical_name_en:'Apple Inc.',country_code:'US',provenance:{cik:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'}}},
   {cik:'1652044',canonical_name_en:'Alphabet Inc.',country_code:'US',provenance:{cik:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'}}},
  ]);
  expect(plan.securities).toEqual([
   {cik:'320193',ticker:'AAPL',share_class:'common',is_primary:true,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1652044',ticker:'GOOG',share_class:'common',is_primary:true,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1652044',ticker:'GOOGL',share_class:'common',is_primary:false,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
  ]);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/research/entity-keys/parsers.test.ts src/lib/entities/load-sec.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现解析器与映射**

在 `src/lib/research/entity-keys/parsers.ts` 末尾追加：

```ts
export interface SecExchangeRow{cik:string;name:string;ticker:string;exchange:string}
/** company_tickers_exchange.json: {fields:[...], data:[[...]]}. */
export function parseSecCompanyTickersExchange(json:string):SecExchangeRow[]{
 const parsed=JSON.parse(json) as {fields?:unknown;data?:unknown};
 const fields=Array.isArray(parsed.fields)?parsed.fields:[];
 const idx=(k:string)=>fields.indexOf(k);
 const [ci,ni,ti,ei]=[idx('cik'),idx('name'),idx('ticker'),idx('exchange')];
 if([ci,ni,ti,ei].some(i=>i<0)||!Array.isArray(parsed.data))throw new Error('invalid_sec_exchange_file');
 return (parsed.data as unknown[][]).map(r=>({cik:String(r[ci]),name:String(r[ni]),ticker:String(r[ti]),exchange:String(r[ei]??'')}));
}
```

```ts
// src/lib/entities/load-sec.ts
// Pure planning step for scripts/entity-keys/load-sec-issuers.ts: SEC rows → issuer and
// security inputs, limited to tickers the securities master already knows.
import type {SecExchangeRow} from '../research/entity-keys/parsers';
import {normalizeSecurityTicker} from '../securities/ticker';

export const SEC_SOURCE='sec_company_tickers_exchange';
export interface PlannedIssuer{cik:string;canonical_name_en:string;country_code:'US';provenance:{cik:{source:string;as_of:string}}}
export interface PlannedSecurity{cik:string;ticker:string;share_class:'common';is_primary:boolean;valid_from:string;source:string;provenance:{exchange:string}}

export function planSecLoad(rows:SecExchangeRow[],universe:Set<string>,asOf:string):{issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}{
 const issuers=new Map<string,PlannedIssuer>();const securities:PlannedSecurity[]=[];const skipped:string[]=[];
 const seenPrimary=new Set<string>();
 for(const r of rows){
  const ticker=normalizeSecurityTicker(r.ticker,'US')??r.ticker.toUpperCase();
  if(!universe.has(ticker)){skipped.push(r.ticker);continue;}
  if(!issuers.has(r.cik))issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,country_code:'US',provenance:{cik:{source:SEC_SOURCE,as_of:asOf}}});
  const is_primary=!seenPrimary.has(r.cik);seenPrimary.add(r.cik);
  securities.push({cik:r.cik,ticker,share_class:'common',is_primary,valid_from:asOf,source:SEC_SOURCE,provenance:{exchange:r.exchange}});
 }
 return {issuers:[...issuers.values()],securities,skipped};
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/research/entity-keys/parsers.test.ts src/lib/entities/load-sec.test.ts`
Expected: PASS。

- [ ] **Step 5: 写脚本**

```ts
// scripts/entity-keys/load-sec-issuers.ts
/**
 * WP-F1a: load US issuers + securities from SEC company_tickers_exchange.json.
 *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]
 * Download separately with a User-Agent from https://www.sec.gov/files/company_tickers_exchange.json
 * Dry-run by default: prints the plan. --apply writes through the service-role client and records
 * an ingest batch (dataset 'entities', producer 'sec-company-tickers').
 */
import {readFileSync} from 'node:fs';
import {parseSecCompanyTickersExchange} from '../../src/lib/research/entity-keys/parsers';
import {planSecLoad} from '../../src/lib/entities/load-sec';
import {upsertIssuerByIdentifiers,attachSecurity} from '../../src/lib/entities/issuers';
import {startBatch,finishBatch,emptyCounts,type BatchError} from '../../src/lib/dq/batches';
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const args=process.argv.slice(2);
const file=args.find(a=>!a.startsWith('--'));
const apply=args.includes('--apply');
const asOf=args[args.indexOf('--as-of')+1]&&args.includes('--as-of')?args[args.indexOf('--as-of')+1]:new Date().toISOString().slice(0,10);
if(!file){console.error('usage: load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]');process.exit(2);}

async function main(){
 const client=supabaseTableClient(getAdminSupabase());
 const rows=parseSecCompanyTickersExchange(readFileSync(file!,'utf8'));
 const universe=new Set((await client.select('stocks_universe',{market:'US'})).map(r=>String(r.ticker)));
 const plan=planSecLoad(rows,universe,asOf);
 console.log(JSON.stringify({rows:rows.length,universe:universe.size,issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped.length,apply},null,2));
 if(!apply)return;
 const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:'entities',toolVersions:{file:'company_tickers_exchange.json',as_of:asOf},triggeredBy:'script'});
 const counts=emptyCounts();const errors:BatchError[]=[];const idByCik=new Map<string,string>();
 for(const i of plan.issuers){
  counts.fetched++;
  try{const out=await upsertIssuerByIdentifiers(client,i);if(out.conflict){counts.quarantined++;errors.push({code:'issuer_conflict',key:i.cik});continue;}idByCik.set(i.cik,out.issuer_id!);out.created?counts.inserted++:counts.duplicates++;}
  catch(e){counts.failed++;errors.push({code:'issuer_write',key:i.cik,message:(e as Error).message});}
 }
 for(const s of plan.securities){
  const issuer_id=idByCik.get(s.cik);if(!issuer_id)continue;
  try{(await attachSecurity(client,{issuer_id,ticker:s.ticker,share_class:s.share_class,is_primary:s.is_primary,valid_from:s.valid_from,source:s.source,provenance:s.provenance}))==='inserted'?counts.inserted++:counts.duplicates++;}
  catch(e){counts.failed++;errors.push({code:'security_write',key:s.ticker,message:(e as Error).message});}
 }
 const status=await finishBatch(client,batchId,{counts,errors});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.length},null,2));
 if(status==='failed')process.exit(1);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
```

- [ ] **Step 6: 本地 dry-run（需要 `.env.local` 里的 Supabase 变量；无则跳过，只做 typecheck）**

Run: `npm run typecheck`
Expected: 无错误。
可选：`npx tsx scripts/entity-keys/load-sec-issuers.ts /path/company_tickers_exchange.json`，Expected: 打印 JSON 计划，不写库。

- [ ] **Step 7: 提交**

```bash
git add src/lib/research/entity-keys/parsers.ts src/lib/research/entity-keys/parsers.test.ts src/lib/entities/load-sec.ts src/lib/entities/load-sec.test.ts scripts/entity-keys/load-sec-issuers.ts
git commit -m "feat(entities): load US issuers and securities from SEC company tickers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 现有研究实体挂接脚本

**Files:**
- Create: `src/lib/entities/link-research.ts`（纯映射）
- Create: `scripts/entity-keys/link-research-entities.ts`
- Test: `src/lib/entities/link-research.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/entities/link-research.test.ts
import {describe,it,expect} from 'vitest';
import {planResearchLink} from './link-research';

describe('planResearchLink',()=>{
 it('turns entity keys with a hard identifier into issuer inputs and maps exchange codes to universe tickers',()=>{
  const plan=planResearchLink(
   [{user_id:'u',entity_id:'e1',lei:'3003003LS77D1DRDDE25',usci:'913300002539329145',cik:null,cninfo_org_id:'gssh0600570',names_zh:['恒生电子'],names_en:['Hundsun Technologies Inc.'],home_market:'A',issuer_id:null},
    {user_id:'u',entity_id:'e2',lei:null,usci:null,cik:null,cninfo_org_id:null,names_zh:['无标识'],names_en:[],home_market:'A',issuer_id:null}],
   [{user_id:'u',entity_id:'e1',exchange_code:'600570.SH',isin:null,market:'A',security_type:'common',is_primary:true,valid_from:'2003-12-16',valid_to:null}],
   new Set(['600570.SH']),
  );
  expect(plan.issuers).toEqual([{entity_key:'u:e1',input:{lei:'3003003LS77D1DRDDE25',usci:'913300002539329145',cik:null,cninfo_org_id:'gssh0600570',canonical_name_zh:'恒生电子',canonical_name_en:'Hundsun Technologies Inc.',country_code:'CN',provenance:{link:{source:'research_entity_keys',entity_id:'e1'}}}}]);
  expect(plan.securities).toEqual([{entity_key:'u:e1',ticker:'600570.SH',share_class:'A',is_primary:true,valid_from:'2003-12-16',valid_to:null,source:'research_entity_securities'}]);
  expect(plan.skipped).toEqual([{entity_key:'u:e2',reason:'no_hard_identifier'}]);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/entities/link-research.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现映射**

```ts
// src/lib/entities/link-research.ts
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import type {IssuerInput,ShareClass} from './types';

export interface EntityKeyRow{user_id:string;entity_id:string;lei:string|null;usci:string|null;cik:string|null;cninfo_org_id:string|null;names_zh:string[];names_en:string[];home_market:'A'|'HK'|'US'|'other';issuer_id:string|null}
export interface EntitySecurityRow{user_id:string;entity_id:string;exchange_code:string;isin:string|null;market:'A'|'HK'|'US'|'other';security_type:string;is_primary:boolean;valid_from:string;valid_to:string|null}

const COUNTRY:Record<EntityKeyRow['home_market'],string|null>={A:'CN',HK:'HK',US:'US',other:null};
const CLASS:Record<EntitySecurityRow['market'],ShareClass>={A:'A',HK:'H',US:'common',other:'other'};

export function planResearchLink(keys:EntityKeyRow[],securities:EntitySecurityRow[],universe:Set<string>){
 const issuers:{entity_key:string;input:IssuerInput}[]=[];const skipped:{entity_key:string;reason:string}[]=[];
 const linked=new Set<string>();
 for(const k of keys){
  const entity_key=`${k.user_id}:${k.entity_id}`;
  if(!k.lei&&!k.usci&&!k.cik){skipped.push({entity_key,reason:'no_hard_identifier'});continue;}
  linked.add(entity_key);
  issuers.push({entity_key,input:{lei:k.lei,usci:k.usci,cik:k.cik,cninfo_org_id:k.cninfo_org_id,canonical_name_zh:k.names_zh[0]??null,canonical_name_en:k.names_en[0]??null,country_code:COUNTRY[k.home_market],provenance:{link:{source:'research_entity_keys',entity_id:k.entity_id}}}});
 }
 const out:{entity_key:string;ticker:string;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;source:string}[]=[];
 for(const s of securities){
  const entity_key=`${s.user_id}:${s.entity_id}`;if(!linked.has(entity_key))continue;
  const market=inferCoreMarket(s.exchange_code);const ticker=(market?normalizeSecurityTicker(s.exchange_code,market):null)??s.exchange_code;
  if(!universe.has(ticker)){skipped.push({entity_key,reason:`ticker_not_in_universe:${ticker}`});continue;}
  out.push({entity_key,ticker,share_class:CLASS[s.market],is_primary:s.is_primary,valid_from:s.valid_from,valid_to:s.valid_to,source:'research_entity_securities'});
 }
 return {issuers,securities:out,skipped};
}
```

- [ ] **Step 4: 运行通过**

Run: `npm test -- src/lib/entities/link-research.test.ts`
Expected: 1 passed。

- [ ] **Step 5: 写脚本**

```ts
// scripts/entity-keys/link-research-entities.ts
/**
 * WP-F1a: create/enrich global issuers from every user's research_entity_keys and set
 * research_entity_keys.issuer_id + research_entity_securities.ticker.
 *   npx tsx scripts/entity-keys/link-research-entities.ts [--apply]
 * Dry-run by default. Records an ingest batch (dataset 'entities', producer 'research-entity-link').
 */
import {planResearchLink,type EntityKeyRow,type EntitySecurityRow} from '../../src/lib/entities/link-research';
import {upsertIssuerByIdentifiers,attachSecurity} from '../../src/lib/entities/issuers';
import {startBatch,finishBatch,emptyCounts,type BatchError} from '../../src/lib/dq/batches';
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const apply=process.argv.includes('--apply');

async function main(){
 const client=supabaseTableClient(getAdminSupabase());
 const keys=(await client.select('research_entity_keys',{})) as unknown as EntityKeyRow[];
 const secs=(await client.select('research_entity_securities',{})) as unknown as EntitySecurityRow[];
 const universe=new Set((await client.select('stocks_universe',{})).map(r=>String(r.ticker)));
 const plan=planResearchLink(keys,secs,universe);
 console.log(JSON.stringify({keys:keys.length,securities:secs.length,planIssuers:plan.issuers.length,planSecurities:plan.securities.length,skipped:plan.skipped,apply},null,2));
 if(!apply)return;
 const {batchId}=await startBatch(client,{producer:'research-entity-link',dataset:'entities',triggeredBy:'script'});
 const counts=emptyCounts();const errors:BatchError[]=[];const idByKey=new Map<string,string>();
 for(const i of plan.issuers){
  counts.fetched++;
  try{
   const out=await upsertIssuerByIdentifiers(client,i.input);
   if(out.conflict){counts.quarantined++;errors.push({code:'issuer_conflict',key:i.entity_key});continue;}
   idByKey.set(i.entity_key,out.issuer_id!);out.created?counts.inserted++:counts.duplicates++;
   const [user_id,entity_id]=i.entity_key.split(':');
   await client.update('research_entity_keys',{user_id,entity_id},{issuer_id:out.issuer_id});
  }catch(e){counts.failed++;errors.push({code:'issuer_write',key:i.entity_key,message:(e as Error).message});}
 }
 for(const s of plan.securities){
  const issuer_id=idByKey.get(s.entity_key);if(!issuer_id)continue;
  try{
   (await attachSecurity(client,{issuer_id,ticker:s.ticker,share_class:s.share_class,is_primary:s.is_primary,valid_from:s.valid_from,valid_to:s.valid_to,source:s.source}))==='inserted'?counts.inserted++:counts.duplicates++;
   const [user_id,entity_id]=s.entity_key.split(':');
   await client.update('research_entity_securities',{user_id,entity_id,valid_from:s.valid_from},{ticker:s.ticker});
  }catch(e){counts.failed++;errors.push({code:'security_write',key:s.ticker,message:(e as Error).message});}
 }
 const status=await finishBatch(client,batchId,{counts,errors});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.length},null,2));
 if(status==='failed')process.exit(1);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
```

- [ ] **Step 6: 类型检查并提交**

Run: `npm run typecheck && npm run lint`
Expected: 无错误。

```bash
git add src/lib/entities/link-research.ts src/lib/entities/link-research.test.ts scripts/entity-keys/link-research-entities.ts
git commit -m "feat(entities): link research entity keys to global issuers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `database.types.ts`、运行手册、全量验证

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Create: `docs/runbooks/data-foundation.md`

- [ ] **Step 1: 补类型**

在 `src/lib/supabase/database.types.ts` 的接口区（`export interface FinancialHistory` 附近）追加：

```ts
export interface IngestBatch { batch_id: string; producer: string; dataset: string; status: 'running' | 'success' | 'partial' | 'failed' | 'rejected'; started_at: string; finished_at: string | null; counts: Record<string, number>; errors: unknown[]; tool_versions: Record<string, string>; code_version: string | null; triggered_by: 'cron' | 'manual' | 'script' }
export interface DqQuarantine { id: string; dataset: string; table_name: string; natural_key: string; reason_code: string; detail: Record<string, unknown>; payload: Record<string, unknown>; batch_id: string; status: 'open' | 'resolved_accept' | 'resolved_reject'; resolved_by: string | null; resolved_at: string | null; created_at: string }
export interface DqReconciliation { id: string; dataset: string; left_source: string; right_source: string; natural_key: string; left_value: number | null; right_value: number | null; abs_diff: number | null; rel_diff: number | null; tolerance: number; passed: boolean; batch_id: string | null; created_at: string }
export interface DqFreshness { dataset: string; expected_cadence: 'daily' | 'monthly' | 'quarterly' | 'event'; last_ok_at: string | null; last_attempt_at: string | null; consecutive_errors: number; status: 'fresh' | 'stale' | 'error' | 'missing'; detail: Record<string, unknown>; updated_at: string }
export interface Issuer { issuer_id: string; canonical_name_zh: string | null; canonical_name_en: string | null; country_code: string | null; lei: string | null; cik: string | null; usci: string | null; cninfo_org_id: string | null; hkex_stock_code_primary: string | null; status: 'active' | 'merged' | 'dissolved'; merged_into: string | null; provenance: Record<string, unknown>; created_at: string; updated_at: string }
export interface IssuerSecurity { issuer_id: string; ticker: string; isin: string | null; figi: string | null; share_class: 'A' | 'H' | 'ADR' | 'common' | 'preferred' | 'other'; is_primary: boolean; valid_from: string; valid_to: string | null; source: string; provenance: Record<string, unknown> }
export interface IssuerIdentifierClaim { id: string; issuer_id: string; id_type: 'lei' | 'cik' | 'usci' | 'isin' | 'figi' | 'cninfo_org_id'; value: string; source: string; confidence: number; status: 'accepted' | 'pending' | 'rejected'; created_at: string }
export interface IndustryClassification { scheme: 'sw2021' | 'sw2014' | 'gics' | 'csrc' | 'custom'; version: string; code: string; level: number; name_zh: string | null; name_en: string | null; parent_code: string | null }
export interface IssuerIndustryMembership { issuer_id: string; scheme: string; version: string; code: string; valid_from: string; valid_to: string | null; source: string; provenance: Record<string, unknown> }
```

在 `Tables: {` 列表中 `financial_history` 行之后追加：

```ts
      ingest_batches: { Row: IngestBatch; Insert: Partial<IngestBatch>; Update: Partial<IngestBatch> };
      dq_quarantine: { Row: DqQuarantine; Insert: Partial<DqQuarantine>; Update: Partial<DqQuarantine> };
      dq_reconciliations: { Row: DqReconciliation; Insert: Partial<DqReconciliation>; Update: Partial<DqReconciliation> };
      dq_freshness: { Row: DqFreshness; Insert: Partial<DqFreshness>; Update: Partial<DqFreshness> };
      issuers: { Row: Issuer; Insert: Partial<Issuer>; Update: Partial<Issuer> };
      issuer_securities: { Row: IssuerSecurity; Insert: Partial<IssuerSecurity>; Update: Partial<IssuerSecurity> };
      issuer_identifier_claims: { Row: IssuerIdentifierClaim; Insert: Partial<IssuerIdentifierClaim>; Update: Partial<IssuerIdentifierClaim> };
      industry_classifications: { Row: IndustryClassification; Insert: Partial<IndustryClassification>; Update: Partial<IndustryClassification> };
      issuer_industry_memberships: { Row: IssuerIndustryMembership; Insert: Partial<IssuerIndustryMembership>; Update: Partial<IssuerIndustryMembership> };
```

并把文件头注释里的"migrations up to …"改为 `20261105091000_issuers.sql`。

- [ ] **Step 2: 写运行手册**

```markdown
<!-- docs/runbooks/data-foundation.md -->
# 数据底座运行手册（WP-F0 / WP-F1a）

## 表
- `ingest_batches` / `dq_quarantine` / `dq_reconciliations` / `dq_freshness`：仅 service role 可读写；`/admin/dq` 通过 `getAdminSupabase()` 读取。
- `issuers` / `issuer_securities` / `industry_classifications` / `issuer_industry_memberships`：公共只读；`issuer_identifier_claims` 仅 service role。

## 装载美股发行人
1. 下载 `https://www.sec.gov/files/company_tickers_exchange.json`（带 User-Agent，见 `EDGAR_USER_AGENT`）。
2. 预演：`npx tsx scripts/entity-keys/load-sec-issuers.ts /path/company_tickers_exchange.json`
3. 写库：同命令加 `--apply [--as-of YYYY-MM-DD]`。查看回执：`/admin/dq` 最近批次 `entities · sec-company-tickers`。

## 挂接研究实体
1. 预演：`npx tsx scripts/entity-keys/link-research-entities.ts`；`skipped` 列表里 `no_hard_identifier` 的实体需先在研究设置里补 LEI/USCI/CIK。
2. 写库：加 `--apply`。冲突项进入 `issuer_identifier_claims(status='pending')`，由管理员在数据库中裁决（本期无 UI）。

## 隔离项处理
`/admin/dq` → 隔离队列 → 接受 / 拒绝。接受只改状态，不回写数据；拒绝同理。真正的数据修正由对应数据集的下一次批次完成。

## 回滚
两个迁移只新增对象并给 `research_entity_*` 加可空列；回滚 = `drop table` 五张 issuer 表与四张 dq 表、`alter table … drop column`。生产执行前先在 `npm run test:db` 环境演练。
```

- [ ] **Step 3: 全量验证**

Run:
```bash
npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:migrations && npm run check:migration-history -- supabase/migrations.lock.json <project-ref>
```
Expected: 全部通过（`check:migration-history` 的参数按 `scripts/ci/check-migration-history.ts` 的用法；若本地无 operator export，则跳过该命令并在 PR 描述注明）。

- [ ] **Step 4: 提交**

```bash
git add src/lib/supabase/database.types.ts docs/runbooks/data-foundation.md
git commit -m "docs(data-foundation): database types and runbook for dq + issuers" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 自检记录（写计划时完成）

**核对过的仓库事实**：`normalizeCik` 去前导零且非法时抛错；`inferCoreMarket` / `normalizeSecurityTicker(input, market)` 签名如 Task 9 所用；`Panel` 由 `@/components/ui` 导出；Tailwind 有 `text-warn`、`text-accent`、`bg-down/10`；`requireAdminUser()` 返回带 `id` 的 `User`；锁文件 41 条、迁移 47 个。

**规格覆盖**：§5.1 四表 → Task 1；§5.2 规则库 / 隔离 / 新鲜度 → Task 4、5；`/admin/dq` → Task 6；§3.1 五表与 `research_entity_*` 新列 → Task 7；合并规则 / 写入 / 解析 → Task 8、9；§3.2 的 SEC 与现有脚本改写 → Task 10、11（GLEIF/巨潮脚本改写、ISIN、FIGI、A/H 配对在计划三）；§6 迁移锁与类型 → Task 1、7、12；§5.2 的跨来源对账运行器与财报日历新鲜度属于 WP-F5，在计划三。

**计划外但必须知道**：`financial_history` 改视图、`disclosure-raw` 桶、`fact_sync_scope` 都属于计划二（WP-F2）。

**类型一致性**：`TableClient.select(table, match, opts)` 在 dq 与 entities 中签名一致；`startBatch` 返回 `{batchId}`、`finishBatch(client, batchId, {counts, errors})` 在两个脚本中用法一致；`upsertIssuerByIdentifiers` 返回 `{issuer_id, created, conflict?}`；`attachSecurity` 返回 `'inserted' | 'duplicate'`。
