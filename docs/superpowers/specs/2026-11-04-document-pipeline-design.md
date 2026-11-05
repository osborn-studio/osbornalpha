# 数据底座三 · F3 披露文档管道 设计规格

日期：2026-11-04（第 1 稿；审计轨迹：`docs/audits/2026-11-04-document-pipeline/`）
状态：草案，待 owner 评审（§14 有六项 owner 决策）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一，F1 发行人与 F5 质量设施已落地，§14 偏差视为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二，第 6 稿：`fact_sync_runs`、`filings`、`financial_facts`、写入只经 `security definer` 函数、`read_facts` 信封；港股事实与 PDF 页码引用明确延后到本规格）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §4"文档管道"行与 §5 硬约束。本规格逐条对照：只用一手披露文件（EDGAR、巨潮、HKEXnews；PDF/HTML 原件入私有桶）、每个数字可回放到"源文件哈希 + 页码/字符区间 + 可得时间 + 变换 + 代码版本"、事实与判断分离（抽取结果先是候选，确认后才是事实）、缺失保持缺失（扫描件不做 OCR 猜测、找不到的科目不补）、研报原文永不对外分发（许可先于功能）、本规格不含任何面向用户的页面，只定义"来源抽屉"的数据契约与待设计清单。

---

## 1. 目标与非目标

### 1.1 目标

1. **全局文档库。** 一张与用户无关、以 `issuers.issuer_id` 为主挂接的 `disclosure_documents` 表，记录三个市场的官方披露文件（EDGAR 主文档与申报索引、巨潮公告 PDF、HKEXnews 公告 PDF）：来源、来源引用、内容哈希、字节数、可得时间、版本、权限、处理状态。原件字节存私有桶，内容寻址。
2. **页级引用。** 每份已抽取的文件有逐页文本（`document_pages`，含文本哈希与版面 JSON），任何模块引用一个数字时写一条 `document_citations`（文档、页、字符区间、可选 bbox、文本哈希、片段），读取时可验证片段仍与页面文本一致。
3. **港股事实作为规格二的扩展。** 从港股年报/中报 PDF 的三张主表抽取候选值（规则抽取，带页码与单元格 bbox），经确定性检查与人工确认后，按规格二的写入路径成为 `financial_facts` 行（`source='hkex'`），并通过 `fact_citations` 指向页面。未确认的永远只是候选。
4. **LLM 边界。** LLM 只能产出候选（同样必须带引用），永不直接产出事实；候选转事实只有两条路：人工确认，或全部确定性检查通过且该抽取器在黄金集上的字段级精确率达到总纲 §3.5 的 0.95 门槛后 owner 开启自动晋升。
5. **公共/私有分层。** 官方披露的元数据与页文本公共只读；原件副本不对匿名公开（读接口给出官方 `source_url`）；授权研报（外资研报规格的输入）以 `permission='licensed'` 走同一管道，元数据、页文本、片段只对持有人可见，每次访问写审计日志。
6. **读接口与运维。** 按 ticker 的文档列表、按文档的元数据/页文本、按引用 id 的片段校验、管理员重处理、两个 cron（采集、抽取）与同核心的本机脚本。

成功标准（计划三-文档 退出条件）：
- 范围内（§6.4）每个港股发行人最近 10 年（`sinceYear = 当前年 − 10`，与规格二默认一致）的年报与中报 PDF 已入库且 `status='extracted'`（无文本层的记 `no_text_layer`，不计失败）；每个美股发行人最近 10 年 10-K/10-Q/20-F 主文档与申报索引入库；范围内 A 股发行人最近 10 年定期报告 PDF 入库。
- `GET /api/citations/{id}` 对任一已确认港股事实的引用返回 `verified=true`，且 `snippet` 中的数字字符串与 `financial_facts.value_text` 按 §7.5 的换算规则一致。
- 黄金集（§11.4）港股部分：规则抽取器对 3 家 × 2 期 × 6 科目的候选，经确定性检查后与人工抄录值逐项一致；不一致项全部停留在候选态并有隔离项。
- 同一发行人两次运行采集：第二次 `duplicates = 第一次 inserted`，无新行；HKEX 同一 `source_ref` 的 PDF 字节变化 → 新 `source_version`，旧行与旧对象保留。
- 断网运行两个 cron：批次 `failed`，表与桶不变，连续两次后新鲜度 `error`。
- 匿名角色读不到 `licensed/private` 文档的任何行、读不到候选表、不能调用租约函数（真实角色集成测试）。

### 1.2 本规格之外

- 任何面向用户的页面与组件实现（来源抽屉由公司研究/行业研究规格的页面接入，本规格只给数据契约与"Claude Design 画布待设计清单"）。
- OCR（扫描件保持 `no_text_layer`）、XBRL 实例解析（规格二用 companyfacts；实例文件只存不解析）、业绩会录音/文字稿、交互易/e 互动问答。
- 外资研报的字段抽取（机构/评级/目标价）、分析师实体、去重（simhash）：外资研报规格；本规格只交付其需要的上传、私有存储、引用片段与访问日志接口（§8.3）。
- A 股 PDF 的财务事实抽取（规格二已定 Tushare 为 A 股事实来源；A 股 PDF 在本规格只作为引用与计划三对账的原件）。
- 跨来源对账运行器（`dq_reconciliations` 写入者）：计划三；本规格的港股"上年比较数"检查只写隔离与信息码（§7.6）。
- `research_source_documents` 的改造或迁移；Research OS 各脚本继续按用户写该表，不受影响（§3）。

---

## 2. 现状（2026-11-04，仓库勘察）

| 领域 | 现状（已核对文件） | 本规格如何使用 |
|---|---|---|
| 文档库 | `research_source_documents`（`supabase/migrations/20260705000000_research_os_tables.sql`）：`user_id not null references auth.users`，`unique (user_id, content_hash)`，RLS `auth.uid() = user_id`，S4 限制性策略 `s4_controlled_copy`（`20260922090000_research_s4.sql`），`research_source_entity_alignments` 以 `(user_id, source_id)` 外键挂接（`20260926100000`）；只存 `raw_text`，无二进制、无页结构；`entity_ids` 指向按用户的 `research_entities` | 不泛化（§3）；新建全局表 |
| 来源扩展 | `20260925230000_research_source_extension.sql`：`available_at timestamptz not null`、`source_version text ~ '^[1-9][0-9]{0,8}$'`、`permission in ('public','licensed','private')`、`origin_type`、`market in ('A','HK','US','other')`；不可变触发器覆盖 `raw_text/content_hash/source_type/url/available_at/source_version` | 沿用 `available_at`、`source_version`、`permission` 三个约定的语义；版本改为整数列 |
| 采集器 | `src/lib/research/ingest/collectors/`：`shared.ts::createClient`（UA = `EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT`，最小间隔，`AbortSignal.timeout(30_000)`）；`edgar.ts`（`data.sec.gov/submissions/CIK{10}.json` → `recent[]`，主文档 URL `www.sec.gov/Archives/edgar/data/{cik}/{accn无横线}/{primaryDocument}`，`available_at = acceptanceDateTime`，`htmlToText` 截断 `MAX_TEXT=200_000`，间隔 120 ms）；`cninfo.ts`（`topSearch` 与 `hisAnnouncement/query`，`PAGE_SIZE=30`，`announcementTime` 为北京时间当日零点，PDF 为 `static.cninfo.com.cn/{adjunctUrl}`，间隔 500 ms；只做 SH/SZ）；`hkexnews.ts`（`prefix.do` 取 `stockId`，`titlesearch.xhtml` 返回 HTML 表，`release-time` HKT 精确到分钟，PDF 链接 `www1.hkexnews.hk/listedco/...pdf`，间隔 1000 ms；布局漂移抛 `layout_changed`） | 复用三个来源的列表协议、节奏与 UA；新的写入端（§6）不再调用 `ingestVersioned`；超时改为按剩余预算 |
| 采集夹具 | `src/lib/research/ingest/__fixtures__/collectors/`：`edgar-submissions-1321655.json`、`edgar-8k-pltr-20260803.htm`、`cninfo-topsearch-600570.json`、`cninfo-his-600570.json`、`hkex-prefix-0268.js`、`hkex-titlesearch-0268.html`（含 `2026090300863_c.pdf` 等三个 PDF 链接）、`hkex-empty-0268.html` | 列表层测试直接复用；新增 PDF 层夹具（§11） |
| 写入与版本 | `collectors/write.ts::ingestVersioned`：按 `(user_id, url)` 查旧行，`content_hash` 相同为重复，否则 `source_version = max + 1` | 版本语义沿用到 `(source, source_ref)` 粒度 |
| 脚本 | `scripts/research-collect.ts`：`RESEARCH_OWNER_USER_ID` 必填，service-role ctx，范围 = `listEntityKeys` 的 `in_scope` 公司 | 保留；新增 `scripts/documents/*` |
| 发行人 | `issuers(issuer_id, cik, cninfo_org_id, hkex_stock_code_primary ~ '^[0-9]{5}$', status)`；`issuer_securities(ticker, is_primary, valid_from, valid_to)`；`research_entity_keys.issuer_id`；`resolveIssuer(client, {ticker|cik|…}, {today})`（`src/lib/entities/resolve.ts`） | 文档只挂 `issuer_id`；港股范围用 `hkex_stock_code_primary` |
| 质量设施 | `ingest_batches`（六计数器、`INFO_CODES=['skipped_summary','relink']`）、`dq_quarantine`（同键 open 唯一，`quarantine()` 已存在时返回旧项且不更新 payload）、`dq_freshness`（连续两次失败才 `error`）、`rules.ts`（`identityRule/rangeRule/jumpRule/unitRule` 不抛异常）；RLS 仅 service_role | 复用；新增信息码见 §10 |
| 存储 | 唯一私有桶 `security-snapshots`（`file_size_limit 52428800`，`allowed_mime_types ['application/json']`，迁移内 `insert into storage.buckets … on conflict (id) do update`）；上传代码 `src/lib/securities/sync/writer.ts`（`client.storage.from(...).upload(path, body, {contentType, upsert:true})`）；规格二将新建 `disclosure-raw`（仅 JSON） | 新建 `disclosure-docs` 桶（PDF/HTML/XML/JSON），`upsert:false` |
| 数据库访问 | `TableClient`（`src/lib/db/table-client.ts`：select/insert/update、`gte/lt`、单列排序、`selectAll` 分页 1000；无 delete/rpc/事务） | 批次/隔离/新鲜度继续用它；文档库定义自己的 `DocumentsDb`（§4.9） |
| 测试数据库 | `scripts/ci/research-db.ts` 起本地 PostgreSQL 17（`scripts/s4/local-db.ts` 创建 `anon/authenticated/service_role` 角色与桩 `storage.buckets` 表）；含 `S4_TEST_STATE` 的测试必须列入 `scripts/ci/research-checks.ts::criticalSuites`；本地库**没有** Supabase Storage 服务 | 桶操作走 `ObjectStore` 接口（§4.9），集成测试用内存实现 |
| 依赖 | `package.json` 无任何 PDF 库；`scripts/*.py` 仅三个用 reportlab 写 PDF 的一次性脚本，无 `requirements*`/`pyproject`；CI 为 Node（`node-version-file: package.json`，`>=22.19.0 <23`）+ PostgreSQL 17；Vercel 运行时 Node，`maxDuration=300`，region `hnd1` | 不引入 Python 路径；新增 `pdfjs-dist`（§7.1，owner 决策 D） |
| cron | `src/app/api/cron/securities-sync/route.ts`：`CRON_SECRET` Bearer + `timingSafeEqual`，`force-dynamic`，`maxDuration=300`；`vercel.json` 六条日频 cron | 同法 |
| 管理 | `requireAdminUser()`（`src/lib/admin/auth.ts`）；`POST /api/admin/dq/quarantine/[id]`（JSON 内容类型、Origin 校验、`research_audit_log`） | 同法 |
| LLM | `src/lib/llm/`（`openai-compat.ts::chat/toolChat`、`anthropic-compat.ts`、registry 快照、计量） | 只作候选抽取器的调用通道（§7.7）；本规格不实现调用 |
| 规格二（第 6 稿，未落地） | 写入模型 = 同步运行：`claimLease → beginRun → stageFilings → stageFacts → quarantineFacts → publishRun(manifest) → releaseLease`，全部为带租约校验的 `security definer` 函数；`service_role` 对事实层表无直接写，唯一例外是 `filings.document_ref/document_url/link_attempts` 列级 update；`filings.market/source/origin`、`financial_facts.market`、`fact_sync_runs.market`、`fact_sync_scope.market` 枚举只含 `US/CN`；`raw_hash` 指向桶内快照；`read_facts(p_market, …)` 信封 | 港股事实经同一运行模型写入（§7.6）；枚举加法与 `primary_document_id` 列在迁移二（§4.8） |
| 迁移 | 最新已锁 `20261105091000_issuers.sql`；规格二占 `20261106090000_financial_facts.sql`；`database.types.ts` 手工维护 | 本规格两个迁移：`20261106100000_disclosure_documents.sql`（不依赖规格二）、`20261106110000_fact_citations.sql`（依赖规格二落地） |
| 环境 | 本机无 `EDGAR_USER_AGENT`；生产有 `CRON_SECRET`、`SUPABASE_SERVICE_ROLE_KEY` | 采集夹具录制与首轮真实运行需 owner 配 UA（§14） |

---

## 3. 存储决策：新建全局 `disclosure_documents`，不泛化 `research_source_documents`

从 §2 核对的代码得出四条不可绕过的事实：

1. **租户边界写在约束里。** `user_id not null references auth.users`、`unique (user_id, content_hash)`、`research_source_owner_id(user_id, id)` 唯一索引、`research_source_entity_alignments` 的 `(user_id, source_id)` 外键、S4 限制性策略 `s4_controlled_copy` 与 `research_s4_source_visible(user_id, id)`。让 `user_id` 可空会同时破坏四处；而"用一个系统用户持有全局文档"会把全站共享来源伪装成某个账号的私有材料（REPORT.md §8 已明确告诫）。
2. **它是文本库，不是文件库。** 只有 `raw_text`，EDGAR 文本在 200,000 字符处截断，巨潮/HKEX 只写标题与元数据行；没有字节、没有页。总纲要求"源文件、页码"，这需要原件与页结构。
3. **不可变性方向相反。** 现有触发器把 `raw_text/url/available_at/source_version` 定为不可变，适合 append-only 文本；文档管道需要同一行上的处理状态迁移（`stored → extracted`）与资产补录。
4. **实体体系不同。** `entity_ids` 指向按用户的 `research_entities`；总纲与规格一/二都以 `issuers.issuer_id` 为公共主键。

因此：**新建** `disclosure_documents` 及其子表（§4），`issuer_id` 挂接，service_role 写，公共元数据按 RLS 只读。现有三个采集器与 `research_source_documents` 保持不变（Research OS 仍是 owner 的私有工作台）；两者的桥接（例如在 `research_source_documents.metadata` 写 `disclosure_document_id`）不在本规格。新采集器复用 `shared.ts` 的客户端与节奏代码，但不复用其写入函数。

与规格二 `filings` 的关系：`filings` 是"一次申报"（事实的挂接点，`document_ref/document_url` 为文本指针），`disclosure_documents` 是"一个文件"。一次申报可有多个文件（主文档、索引、XBRL 实例），一个文件也可能不对应任何 `filings` 行（8-K、普通公告）。两者通过 §4.8 的 `filings.primary_document_id`（依赖规格二落地，§12 F3-4）与 `disclosure_documents.filing_source_ref`（本规格自有，§4.1）互指，不互相嵌套。

---

## 4. 数据模型

迁移一 `supabase/migrations/20261106100000_disclosure_documents.sql`（可重放：`create table if not exists`、`drop policy if exists` 后 `create policy`、函数 `create or replace`、桶 `on conflict do update`）；迁移二 `20261106110000_fact_citations.sql`（§4.8，要求规格二迁移已应用）。两者都补 `migrations.lock.json`；`database.types.ts` 手工补 Row 类型。所有新表显式 `revoke all from public, anon, authenticated` 后按 §4.10 授权。

### 4.1 `disclosure_documents`

```
document_id            uuid primary key                       -- 写入端生成
issuer_id              uuid references issuers(issuer_id) on delete restrict   -- 官方披露必填；licensed/private 上传可空（§8.3）
source                 text not null check (source in ('edgar','cninfo','hkexnews','upload'))
market                 text not null check (market in ('US','CN','HK','other'))
source_ref             text not null                          -- §5.1
source_version         int not null default 1 check (source_version >= 1)
supersedes_document_id uuid references disclosure_documents(document_id) on delete restrict
form_type              text                                   -- 来源原样：EDGAR form；巨潮 adjunctType/分类；HKEX headline
doc_class              text not null check (doc_class in ('annual_report','interim_report','quarterly_report','results_announcement','current_report','registration','proxy','ownership','other'))
classifier_gen         int not null                           -- §5.4
title                  text not null
source_url             text not null                          -- 官方原始链接（公共可见）
content_sha256         text not null check (content_sha256 ~ '^[0-9a-f]{64}$')
bytes                  bigint not null check (bytes > 0)
mime                   text not null check (mime in ('application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'))
storage_path           text not null                          -- `{source}/{issuer_id|'_'}/{sha256}.{ext}`
available_at           timestamptz not null                   -- §5.2
available_at_precision text not null check (available_at_precision in ('instant','date'))
available_date         date not null                          -- §5.2
event_date             date                                   -- 申报/公告日（EDGAR filingDate；巨潮公告日；HKEX 发放日）
fiscal_year            int
fiscal_period          text check (fiscal_period in ('FY','H1','Q1','Q3'))
period_end             date
filing_source_ref      text                                   -- 规格二 filings.source_ref 的值（EDGAR accn；HK: §4.8），无则 null
permission             text not null check (permission in ('public','licensed','private'))
owner_user_id          uuid references auth.users(id) on delete restrict   -- permission <> 'public' 时必填
license_ref            text                                   -- licensed：许可记录标识（外资研报规格定义）
status                 text not null default 'stored' check (status in ('stored','extracted','no_text_layer','extract_failed'))
page_count             int check (page_count is null or page_count >= 0)
extractor_version      text                                   -- §7.1，extracted 后必填
extract_lease_until    timestamptz
extract_attempts       int not null default 0
extracted_at           timestamptz
batch_id               uuid not null references ingest_batches(batch_id) on delete restrict
code_version           text not null
created_at             timestamptz not null default now()
constraint dd_owner_iff_private check ((permission = 'public') = (owner_user_id is null))
constraint dd_issuer_required check (permission <> 'public' or issuer_id is not null)
constraint dd_extracted_fields check (status <> 'extracted' or (page_count is not null and extractor_version is not null and extracted_at is not null))
unique (source, source_ref, source_version)
unique (source, source_ref, content_sha256)
index (issuer_id, available_at desc)
index (issuer_id, doc_class, period_end desc)
index (status, created_at) where status = 'stored'
index (content_sha256)
```

- 触发器 `disclosure_documents_limited_update`：`update` 只允许改 `status/page_count/extractor_version/extract_lease_until/extract_attempts/extracted_at/doc_class/classifier_gen/fiscal_year/fiscal_period/period_end/filing_source_ref`；其余列变化抛 `23514`（`append_only:disclosure_documents`）；`status` 允许迁移 `stored→extracted|no_text_layer|extract_failed`、`extract_failed→stored`（管理员重处理）、`extracted→stored`（抽取器升级重跑）；`delete` 禁止。
- 同一 `(source, source_ref)` 再次抓到不同 `content_sha256` → 新行 `source_version = max + 1`、`supersedes_document_id = 旧最高版`；相同哈希 → `duplicates`，不写。
- 同一 `content_sha256` 出现在不同 `source_ref`（同一文件被两次公告引用）→ 两行，`storage_path` 相同，对象只存一份。

### 4.2 `document_assets`

一次申报的附属文件（EDGAR 申报索引 JSON、XBRL 实例、巨潮/HKEX 暂无）。

```
asset_id        uuid primary key
document_id     uuid not null references disclosure_documents(document_id) on delete restrict
role            text not null check (role in ('filing_index','xbrl_instance','exhibit'))
filename        text not null
source_url      text not null
content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$')
bytes           bigint not null check (bytes > 0)
mime            text not null
storage_path    text not null
created_at      timestamptz not null default now()
unique (document_id, role, filename)
```

### 4.3 `document_pages`

```
document_id   uuid not null references disclosure_documents(document_id) on delete restrict
page_no       int not null check (page_no >= 1)
text          text not null                 -- §7.2 规范化文本；空页为 ''
text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$')   -- sha256(text)
char_count    int not null check (char_count >= 0)
width         numeric                       -- PDF 页宽（pt）；HTML 为 null
height        numeric
line_count    int not null check (line_count >= 0)
has_tables    boolean not null default false
primary key (document_id, page_no)
```

版面明细（行、文本项 bbox、表格单元格）不入库：存桶内 `{storage_path 去扩展名}.pages.json`（§7.2），`document_pages` 只存能支撑搜索、片段与哈希校验的文本。`document_pages` 行随抽取一次性写入；重跑抽取前先删本文档全部页（§4.6 函数内，触发器之外的唯一删除路径）。

### 4.4 `document_citations`

任何模块（本规格的港股事实、规格四的判断、外资研报、页面的来源抽屉）引用文档中一处位置时写一行。引用是**事实**的一部分，永不删除。

```
citation_id   uuid primary key
document_id   uuid not null references disclosure_documents(document_id) on delete restrict
page_no       int not null
char_start    int not null check (char_start >= 0)
char_end      int not null check (char_end > char_start)
bbox          jsonb check (bbox is null or (jsonb_typeof(bbox) = 'object'))   -- {x0,y0,x1,y1}，PDF 单位 pt，原点左下（pdf.js 约定）；HTML 为 null
snippet       text not null                 -- 创建时 text[char_start:char_end] 的原样拷贝
text_hash     text not null                 -- 创建时该页 document_pages.text_hash
created_by    text not null check (created_by in ('extractor','human','llm','module'))
created_ref   text not null                 -- extractor_version / 用户 id / 模型 id+prompt 版本 / 模块名
created_at    timestamptz not null default now()
foreign key (document_id, page_no) references document_pages(document_id, page_no) on delete restrict
index (document_id, page_no)
```

读取时 `verified = (当前 document_pages.text_hash == citation.text_hash) and (当前 text[char_start:char_end] == snippet)`。抽取器升级重跑页面后哈希可能变化：旧引用保留，`verified=false`，读接口如实返回，页面必须显示"引用待复核"而不是隐藏数字（总纲 §5：做不到回放的不上线——这里能回放旧快照，所以显示但标记）。

### 4.5 `extraction_candidates`

```
candidate_id     uuid primary key
document_id      uuid not null references disclosure_documents(document_id) on delete restrict
kind             text not null check (kind in ('financial_fact','table_cell','field'))
extractor_kind   text not null check (extractor_kind in ('rule','llm'))
extractor_ref    text not null               -- rule: `hk-facts/<HK_LABEL_GEN>`；llm: `<model_id>@<prompt_version>`
citation_id      uuid not null references document_citations(citation_id) on delete restrict
payload          jsonb not null check (jsonb_typeof(payload) = 'object')   -- financial_fact: {concept, period_start, period_end, duration, value: string, unit, scale, consolidation}
checks           jsonb not null default '[]' check (jsonb_typeof(checks) = 'array')   -- [{check, passed, detail}]
checks_passed    boolean not null default false
status           text not null default 'candidate' check (status in ('candidate','confirmed','rejected','promoted'))
decided_by       uuid references auth.users(id)
decided_at       timestamptz
promoted_ref     text                        -- 晋升后：financial_facts.fact_id
input_snapshot   jsonb not null check (jsonb_typeof(input_snapshot) = 'object')   -- {content_sha256, page_nos, extractor_version, pages_json_sha256}
batch_id         uuid not null references ingest_batches(batch_id) on delete restrict
created_at       timestamptz not null default now()
unique (document_id, kind, extractor_ref, citation_id)
index (document_id, status)
index (status, created_at) where status = 'candidate'
```

触发器 `extraction_candidates_lifecycle`：`insert` 必须 `status='candidate'`；`update` 只允许改 `status/decided_by/decided_at/promoted_ref/checks/checks_passed`，允许迁移 `candidate→confirmed|rejected`、`confirmed→promoted`、`confirmed→candidate`（撤回确认，仅当 `promoted_ref is null`）；`delete` 禁止。`confirmed/rejected` 必须带 `decided_by`。

### 4.6 `document_sync_scope` 与租约函数

```
issuer_id        uuid not null references issuers(issuer_id) on delete cascade
source           text not null check (source in ('edgar','cninfo','hkexnews'))
reasons          jsonb not null default '[]'
priority         int not null default 0        -- 0 = 不调度
fetch_key        text not null                 -- edgar: 10 位 CIK；cninfo: '<code>,<orgId>'（orgId 可空时 '<code>,'）；hkexnews: 5 位股份代号
next_due_at      timestamptz not null default now()
lease_until      timestamptz
lease_batch_id   uuid references ingest_batches(batch_id) on delete set null
last_attempt_at  timestamptz
last_success_at  timestamptz
last_status      text check (last_status in ('success','failed'))
updated_at       timestamptz not null default now()
primary key (issuer_id, source)
index (source, next_due_at, priority desc, issuer_id) where priority > 0
```

SQL 函数（`language plpgsql security definer set search_path = public`；`revoke execute from public, anon, authenticated; grant execute to service_role`），语义与规格二 §4.4 的租约函数相同（租约令牌 = 批次 id；同一批次续租；释放只有持有者能做）：

```sql
claim_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_ttl_seconds int) returns boolean
release_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_outcome text, p_next_due timestamptz) returns void
-- 抽取租约按文档：未租/过期/同批次 → true
claim_document_extract_lease(p_document uuid, p_batch uuid, p_ttl_seconds int) returns boolean
-- 抽取结果原子落库：校验租约 → 删旧页 → 插新页 → 更新文档状态与字段 → 清租约；无租约抛 lease_lost (55P03)
finish_document_extract(p_document uuid, p_batch uuid, p_status text, p_pages jsonb, p_fields jsonb) returns int
```

`finish_document_extract` 是 `document_pages` 唯一的删除/插入路径（表上触发器禁止其他 delete）。规格二与本规格各有一套租约表与函数是有意的重复：两份规格并行评审，合并成通用 `sync_leases` 列入 §16 待对齐项，不阻塞任一方。

### 4.7 桶 `disclosure-docs`

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disclosure-docs', 'disclosure-docs', false, 52428800,
        array['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
```

- `file_size_limit` 取现有 `security-snapshots` 的 52428800（50 MB）；超限文件不下载正文（先 `HEAD`/`Content-Length`，无长度则流式读到上限即停），隔离 `document_too_large`，owner 决定是否上调（§14 决策 E）。
- 路径：`{source}/{issuer_id 或 '_'}/{sha256}.{pdf|htm|xml|json}`；旁路 `{sha256}.meta.json`（`{source, source_url, fetched_at, http_status, content_type, content_length, etag, last_modified, request_headers:{user-agent}}`，不含任何密钥）与 `{sha256}.pages.json`（§7.2）。
- 上传 `upsert:false`；`409` 视为已存在（内容寻址保证字节相同）。上传失败 → 不写任何行，该文档 `failed`。
- 保留：`ok` 对象永不删除（回放义务）；被 `supersedes` 的旧版本保留；`document_too_large`/抓取失败不产生对象。桶容量是 owner 事项（§14 决策 E）：F3-1 用范围内前 20 个港股发行人的真实文件量在 runbook 记录实测字节数后再定预算，本规格不猜。

### 4.8 迁移二：`fact_citations` 与规格二表的衔接（`20261106110000_fact_citations.sql`）

要求规格二 `20261106090000_financial_facts.sql` 已应用；`test:migrations` 按时间戳顺序重放即满足。

```
fact_citations
  fact_id      uuid not null references financial_facts(fact_id) on delete restrict
  citation_id  uuid not null references document_citations(citation_id) on delete restrict
  role         text not null check (role in ('value','label','period','unit'))   -- 值单元格、科目标签、期间标题、单位/倍数标题
  primary key (fact_id, role, citation_id)

alter table filings add column if not exists primary_document_id uuid references disclosure_documents(document_id) on delete restrict;
```

并对规格二的枚举做**加法**修改（§16 待对齐，若规格二在落地前自行纳入则本迁移的对应语句为空操作；写法为 `drop constraint if exists` 后 `add constraint` 同名、集合扩大）：`filings.market`、`financial_facts.market`、`fact_sync_runs.market`、`fact_sync_scope.market` 加 `'HK'`；`filings.source` 加 `'hkex'`；`filings.origin` 加 `'hkex'`。港股 `filings.source_ref = 'hkex:<5 位代号>:<period_end>:<doc_class>'`，`document_ref = document_id`，`document_url = source_url`，`url = source_url`，`form_type = 'annual'|'semiannual'`，`available_date = disclosure_documents.available_date`。`primary_document_id` 比照规格二对 `document_ref/document_url/link_attempts` 的明示例外：`service_role` 获得该列的列级 `update`，`filings_limited_update` 触发器把它加入允许列（同一迁移内 `create or replace`，以规格二落地版本为准）；对 US 行由本规格的采集在 `filing_source_ref = filings.source_ref` 时回填，对 CN 行由规格二挂接到 `document_ref` 后按 `disclosure_documents(source='cninfo', source_ref=document_ref)` 回填。

### 4.9 数据访问契约 `src/lib/documents/db.ts` 与 `object-store.ts`

```ts
export interface DocumentsDb {
  claimSyncLease(issuer, source, batch, ttlSeconds): Promise<boolean>;
  releaseSyncLease(issuer, source, batch, outcome, nextDue): Promise<void>;
  claimExtractLease(documentId, batch, ttlSeconds): Promise<boolean>;
  finishExtract(documentId, batch, status, pages: PageRow[], fields: ExtractFields): Promise<number>;   // 抛 LeaseLost
  findDocument(source, sourceRef): Promise<DocumentRow[]>;               // 全部版本
  insertDocument(row): Promise<void>; insertAssets(rows): Promise<void>;
  updateDocument(documentId, patch: LimitedPatch): Promise<void>;
  documentsOfIssuer(issuer, opts: {source?, docClass?, availableFrom?, availableTo?, permission: 'public'|'all', limit}): Promise<DocumentRow[]>;
  documentById(id): Promise<DocumentRow|null>; pagesOf(documentId, pageNos?): Promise<PageRow[]>;
  insertCitation(row): Promise<void>; citationById(id): Promise<CitationRow|null>;
  insertCandidates(rows): Promise<void>; candidatesOf(documentId|{status}): Promise<CandidateRow[]>; updateCandidate(id, patch): Promise<void>;
  storedDue(limit): Promise<DocumentRow[]>;                               // status='stored' and (extract_lease_until is null or < now()) order by created_at
  scopeDue(source, now, limit): Promise<ScopeRow[]>; upsertScope(rows): Promise<void>;
}
export interface ObjectStore {
  put(path, bytes: Uint8Array, mime): Promise<'created'|'exists'>;
  get(path): Promise<Uint8Array>;
  head(path): Promise<{bytes: number}|null>;
  signedUrl(path, expiresSeconds): Promise<string>;
}
```

三种 `DocumentsDb` 实现：`supabaseDocumentsDb`（PostgREST + `rpc()`）、`memoryDocumentsDb`（单测；实现租约、状态迁移、唯一键）、`pgDocumentsDb`（集成测试直连）。`ObjectStore` 两种：`supabaseObjectStore`（`storage.from('disclosure-docs')`）、`memoryObjectStore`（测试；可注入"上传失败"）。读接口用 `anon` 客户端的只读子集。

### 4.10 权限

| 表 | anon / authenticated | service_role |
|---|---|---|
| `disclosure_documents` | `select`，策略 `using (permission = 'public' or owner_user_id = auth.uid())` | 全部 |
| `document_assets`、`document_pages`、`document_citations` | `select`，策略 `using (exists (select 1 from disclosure_documents d where d.document_id = <表>.document_id and (d.permission = 'public' or d.owner_user_id = auth.uid())))` | 全部 |
| `extraction_candidates`、`document_sync_scope` | 无 | 全部 |
| `fact_citations` | `select`，策略 `using (exists (select 1 from financial_facts f where f.fact_id = fact_citations.fact_id and f.status = 'ok'))`（规格二的事实可见性即引用可见性） | 全部 |
| 五个函数 | 不可执行 | 可执行 |

`storage.objects` 不加任何对 anon/authenticated 的策略：原件只经 service_role 签名 URL 下发（§9）。集成测试以真实角色验证（含 anon 调函数被拒、anon 读 `licensed` 行为空）。

---

## 5. 标识、时点与版本语义

### 5.1 `source_ref`（来源内稳定标识）

| source | source_ref | 说明 |
|---|---|---|
| edgar | `<accession no.>/<primaryDocument>`（如 `0001823952-26-000022/plt-20260803.htm`） | 一次申报一个主文档；索引与 XBRL 实例作 `document_assets`，`filing_source_ref = accn`（与规格二 `filings.source_ref` 同值） |
| cninfo | `<announcementId>` | `adjunctUrl` 变化但 id 不变 → 新版本 |
| hkexnews | PDF 路径中的文件标识（`/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf` → `2026090300863_c`） | 标题搜索无独立公告 id；同一公告的中/英文版是两个 `_c/_e` 文件、两行 |
| upload | `content_sha256` | 同一人上传同一文件 → 重复 |

### 5.2 可得时间

| source | `available_at` | precision | `available_date` |
|---|---|---|---|
| edgar | `acceptanceDateTime`（现有采集器已用） | instant | 该瞬间在 `America/New_York` 的日历日 |
| hkexnews | 标题搜索表 `release-time`（HKT，`hktToIso` 已有） | instant | 该瞬间在 UTC+8 的日历日 |
| cninfo | `announcementTime`（服务端给的是北京时间当日零点） | date | 该日；`available_at` = 该日 00:00 UTC+8 |
| upload | 上传瞬间 | instant | 上传瞬间 UTC+8 日历日（持有人所在时区不可知，固定约定） |

`available_at` 入库后不可变（触发器）。对 `date` 精度的文档，任何"当日内先后"问题由读取方按 `available_date` 处理，不承诺日内顺序（与规格二 §5.1 一致）。

### 5.3 版本

`(source, source_ref)` 下按 `content_sha256` 判断：新哈希 → `source_version + 1` 并 `supersedes_document_id`；页文本与引用都挂具体 `document_id`，所以旧版本的引用永远指向旧字节。读接口默认返回每个 `(source, source_ref)` 的最高版本，`versions=1` 返回全部。

### 5.4 分类 `doc_class` 与期间字段

`src/lib/documents/classify.ts::classify(source, {form_type, title, headline})`，`CLASSIFIER_GEN = 1`（整数，规则改动 +1；`disclosure_documents.classifier_gen` 记处理代；重分类只改 `doc_class/classifier_gen/fiscal_*/period_end`，在触发器允许列内）：

- edgar：`10-K|20-F|40-F|10-K/A|20-F/A → annual_report`；`10-Q|10-Q/A → quarterly_report`；`8-K|8-K/A|6-K → current_report`；`S-1|424B* → registration`；`DEF 14A → proxy`；`SC 13D|SC 13G → ownership`；其余 `other`。`fiscal_year/period_end` 不从 form 推断（规格二从 companyfacts 得到），留 null，`filing_source_ref = accn`。
- cninfo：标题含 `年度报告` 且不含 `摘要|英文|更正|已取消|补充|半年` → `annual_report`；`半年度报告`（同样排除）→ `interim_report`；`第一季度报告|第三季度报告` → `quarterly_report`；`业绩快报|业绩预告` → `results_announcement`；其余 `other`。排除词与规格二 §6.3 巨潮挂接规则一致。`fiscal_year` = 标题中四位年份（恰好一个时），`period_end` 按类型（12-31 / 06-30 / 03-31 / 09-30），`fiscal_period` FY/H1/Q1/Q3。
- hkexnews：`headline` 含 `年報` 或 `Annual Report` → `annual_report`；含 `中期/半年度報告` 或 `Interim Report` → `interim_report`；含 `季度報告` → `quarterly_report`；含 `業績公告|全年業績|中期業績|Results Announcement` → `results_announcement`；其余 `other`。`fiscal_year/period_end` 由标题中的"截至…年…月…日"/"for the year ended …"解析，解析不到留 null（不从发布日推断财年）。
- 语言：HKEX 文件标识后缀 `_c/_e` 记入 `metadata`? —— 本表无 `metadata` 列；语言写入 `form_type` 之外的新列会扩表，本稿用 `title` 原样（含中/英）即可，读接口按 `source_ref` 后缀给出 `language: 'zh'|'en'|null`。

---

## 6. 采集

### 6.1 共用核心 `src/lib/documents/sync.ts`

```ts
export interface SyncDeps { db: DocumentsDb; tables: TableClient; store: ObjectStore;
  list: (source, scope: ScopeRow, budget: Budget) => Promise<Listed[]>;      // 来源列表适配器（§6.2）
  fetchBytes: (url, budget: Budget, maxBytes) => Promise<{bytes, mime, status, headers}|'too_large'>;
  now: () => Date; deadline: Date|null; codeVersion: string }
export interface Listed { source_ref: string; source_url: string; title: string; form_type: string|null; headline?: string;
  available_at: string; precision: 'instant'|'date'; event_date: string; assets?: Array<{role, filename, source_url}> }
```

`runDocumentsSync(deps, {source, limit, issuerIds?, sinceYear, dryRun, triggeredBy})`：一个 `ingest_batches` 行（`producer='documents-sync'`，`dataset='documents.<source>'`，`tool_versions={classifier_gen, source}`，`code_version` 同规格二 §6.1 规则：`VERCEL_GIT_COMMIT_SHA ?? git rev-parse HEAD`，取不到则拒绝 apply，脏工作树加 `-dirty`）。先 `reconcileScope(source)`（§6.4），再 `scopeDue(source, now, limit)`，逐个发行人（剩余预算 < 90 s 不再开始新发行人，回执 `deadline_hit`；预算与截止规则同规格二 §6.5：`deadline = start + 240 s`）：

1. `claimSyncLease(…, 600)`；失败 → `skipped_summary(leased)`。
2. `list(source, scope, budget)` → `Listed[]`，按 `available_at` 升序，`sinceYear` 之前跳过；每发行人每次最多 `maxPerIssuer`（默认 50，沿用现有采集器 `maxPerCompany`）。
3. 对每个 `Listed`：`findDocument(source, source_ref)`；已有行且**本次不重新抓字节**的来源（edgar、cninfo：历史文件不变更）→ `duplicates`，跳过；hkexnews（观察到会替换文件，§15 问题 2）与显式 `--refetch` → 抓字节比对哈希。
4. `fetchBytes`（`maxBytes = 52428800`，超时 `min(60 s, remaining − 20 s)`，`429/503` 退避 1→2→4→8 s，预算不足停止）→ `too_large` 则隔离 `document_too_large`（payload `{source_ref, source_url, content_length}`，无行）。
5. sha256；与已有行比对：同哈希 → `duplicates`；新哈希且有旧行 → `versioned`，否则 `inserted`。
6. `store.put(storage_path, bytes, mime)`（`exists` 亦视为成功）；写 `meta.json`；再写 `disclosure_documents` 行（`status='stored'`）与 `document_assets`（EDGAR：申报索引 `index.json` 必抓；XBRL 实例 `*_htm.xml` 若索引列出且 ≤ 上限则抓，否则 `skipped_summary(xbrl_skipped)`）。对象先于行：崩溃只留下孤儿对象，不留下无对象的行；孤儿对象由内容寻址在下次运行自然复用。
7. `releaseSyncLease(outcome, nextDue)`：成功 `now + 1d`（披露是事件驱动，日频轮询），失败 `now + 6h`。

批次结束 `finishBatch`；`recordAttempt('documents.<source>', {ok, cadence:'daily'})`，`ok` = 无到期发行人（心跳）或至少一个发行人成功。抽取不在此批次内（§7.3）。

### 6.2 来源列表适配器（`src/lib/documents/sources/`）

复用 `collectors/shared.ts::createClient` 的 UA 与节奏（edgar 120 ms、cninfo 500 ms、hkexnews 1000 ms），超时改为按预算；协议解析复用现有函数：

- `edgar.ts`：`submissions/CIK{10}.json` 的 `filings.recent`（只覆盖最近的申报；更早的在 `filings.files[]` 分页文件中，`sinceYear` 覆盖不到的部分记 `coverage_summary`，F3-1 第一步用一家公司核对分页文件形态后决定是否接入，核对前不宣称 10 年完整）。表单集合默认 `['10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','8-K','8-K/A','6-K']`（规格二 `filings.form_type` 枚举 ∪ 现有 `EDGAR_DEFAULT_FORMS` 中的定期/临时报告；S-1/424B/DEF 14A/SC 13 默认不抓，`--forms` 可加）。资产：`https://www.sec.gov/Archives/edgar/data/{cik}/{accn无横线}/index.json`（`directory.item[]`），XBRL 实例 = 其中以 `_htm.xml` 结尾的项（**形态未在本仓库核对**，§15 问题 1）。
- `cninfo.ts`：`topSearch`（`issuers.cninfo_org_id` 为空时查并回写，与规格二 §6.3 同一处）+ `hisAnnouncement/query`（`seDate` 按 `sinceYear-01-01 ~ 今天`，`category` 默认限定定期报告类别；全部分页；短页即末页的现有观察沿用）。默认只入库 `doc_class ∈ {annual_report, interim_report, quarterly_report, results_announcement}`；`--all-announcements` 关闭过滤（owner 决策 B）。仅 SH/SZ。
- `hkexnews.ts`：`prefix.do` → `stockId`；`titlesearch.xhtml`（`from/to` 按年份分段，每段一次请求，HKEX 的日期范围上限**未核对**，§15 问题 2）；`parseTitleSearch` 已有。默认只入库 `annual_report|interim_report|quarterly_report|results_announcement`；中英文版都入库（事实抽取优先用中文版 `_c`，英文版作对照，§7.5）。

### 6.3 触发

- `GET|POST /api/cron/documents-sync?source=edgar|cninfo|hkexnews[&limit=n]`：`CRON_SECRET` Bearer（复制 `securities-sync` 的 `authorized()`）；`maxDuration=300`；默认 `limit` 25。`vercel.json`：`documents-sync?source=hkexnews` `0 16 * * *`（UTC，= 次日 00:00 HKT，HKEX 当日公告发布完毕后）；`documents-sync?source=cninfo` `20 16 * * *`；`documents-sync?source=edgar` `30 3 * * *`（EDGAR 当日受理截止 22:00 ET 之后）。与现有 cron 分钟错开。
- `GET|POST /api/cron/documents-extract[&limit=n]`：§7.3；`45 * * * *`（每小时；Vercel cron 频率是否受团队计划限制由 owner 确认，§14）。
- `scripts/documents/sync.ts --source … [--issuer …] [--limit n] [--since-year y] [--forms …] [--all-announcements] [--refetch] [--apply]`：无截止；dry-run 不上传、不建批次。
- `scripts/documents/extract.ts [--document id] [--limit n] [--apply]`。
- `scripts/documents/record-fixture.ts --hkex <pdf url> | --edgar <cik> <accn> | --cninfo <announcementId>`（§11）。

### 6.4 范围 `src/lib/documents/scope.ts::reconcileScope(source)`

幂等；只改 `reasons/priority/fetch_key`，不动调度与租约列：

- edgar：与规格二 §6.4 美股范围相同来源（三个宇宙活跃 ticker → `resolveIssuer` → 有 `cik`），`priority 10`。
- cninfo：规格二 owner 决策 A 的同一集合（默认 `research_entity_keys.in_scope and issuer_id is not null` 的发行人，当前 `is_primary and valid_to is null` 的 `.SH/.SZ` ticker；`.BJ` 不入）。
- hkexnews：`research_entity_keys.in_scope and issuer_id is not null` 且 `issuers.hkex_stock_code_primary is not null` 的发行人（owner 决策 A：是否扩到 `hk_main` 宇宙全体）。
- 不再出现的行 `reasons=[]`、`priority=0`。

---

## 7. 抽取

### 7.1 PDF 文本层：`pdfjs-dist`（新依赖，owner 决策 D）

选择依据：仓库无 PDF 库、无 Python 运行时路径、Vercel 运行时为 Node；`pdfjs-dist` 是纯 JS（Node 下用 `legacy/build/pdf.mjs`，文本抽取不需要 canvas），`getTextContent()` 给出每个文本项的变换矩阵（x、y）、宽高与字符串，足以得到行、单元格与 bbox；无需原生模块。固定版本号在 F3-0 写入 `package.json`（取 F3-0 实施日已发布两周以上的最新 4.x）；**Node 22 + Next 15 路由处理器中的加载方式与单文档内存占用未在本仓库核对**，F3-0 第一步做一次 Vercel preview 冒烟（§15 问题 3），失败则抽取只在本机脚本运行、cron 只做采集（§12 降级路径）。

不选项：Docling/MinerU（Python，无运行时）、OCR（本规格不做）、`pdf-parse`（无坐标）。

### 7.2 页面抽取 `src/lib/documents/extract/`

`EXTRACTOR_VERSION = 'docs-extract/1.0'`（抽取或规范化规则改动即升版本；`disclosure_documents.extractor_version` 记处理版本，重跑只对 `extractor_version <> 当前` 的文档）。

- `pdf.ts::extractPdf(bytes, budget) → {pages: Page[], hasTextLayer}`：逐页 `getTextContent()`；文本项按 `y`（取 `transform[5]`）聚类成行（同一行：`|Δy| ≤ 0.5 × 项高度`），行内按 `x` 排序，项间距 `> 1 × 空格宽`插入一个空格；行按 `y` 降序（页顶在前）拼接，行间 `\n`；规范化：NFKC、连续空白折叠为一个空格、去首尾空白。空页 `text=''`。`hasTextLayer` = 至少一页有非空白文本项；全空 → `no_text_layer`。
- `tables.ts::detectTables(lines) → Table[]`（`TABLE_ALGO_VERSION='tables/1.0'`）：把连续的、含 ≥ 2 个"数值项"（匹配 `^\(?[-–]?[\d,]+(\.\d+)?\)?$` 或 `^[-–]$`）且数值项 `x` 位置在相邻行之间重合的行归为一个表；列 = 数值项 `x0` 的聚类（`|Δx0| ≤ 项宽的一半`）；每行的最左非数值文本为标签单元格。输出单元格 `{row, col, text, bbox}`。只服务 §7.5，不追求通用表格还原。
- `html.ts::extractHtml(bytes) → Page[]`：EDGAR iXBRL/HTML 按分页标记切页：`<hr` 元素，或样式含 `page-break-before|page-break-after|break-before|break-after` 且值为 `always|page` 的元素；无标记 → 一页。每页经 `htmlToText` 同款规则（复用 `collectors/edgar.ts::htmlToText` 的实体与标签处理，**去掉** 200,000 截断）后同样规范化。HTML 页无 bbox，引用只用字符区间。
- 输出写法：`document_pages` 行（text、hash、计数、宽高、`has_tables`）+ 桶内 `{sha256}.pages.json`：`{extractor_version, table_algo_version, pages:[{page_no, width, height, lines:[{y, x0, x1, text}], tables:[…]}]}`，`pages_json_sha256` 记入候选的 `input_snapshot`。

### 7.3 抽取调度 `src/lib/documents/extract/run.ts`

`runDocumentsExtract(deps, {limit, documentIds?, dryRun, triggeredBy})`：批次 `producer='documents-extract'`、`dataset='documents.extract'`、`tool_versions={extractor_version, table_algo_version}`。`storedDue(limit)`（`status='stored'`，租约空或过期，按 `created_at`），逐文档（剩余预算 < 90 s 不再开始）：`claimExtractLease(doc, batch, 600)` → `store.get(storage_path)` → 按 `mime` 走 `extractPdf/extractHtml`（超预算 → `extract_timeout`，`extract_attempts + 1`，≥ 3 次后 `extract_failed`）→ `store.put(pages.json)` → `finishExtract(doc, batch, 'extracted'|'no_text_layer', pages, {page_count, extractor_version, extracted_at})` → 若 `market='HK'` 且 `doc_class ∈ {annual_report, interim_report}` 且为中文版 → §7.5 产出候选（同批次）。`LeaseLost` → 该文档 `failed`。新鲜度 `recordAttempt('documents.extract', {ok, cadence:'daily'})`。

### 7.4 引用写入 `src/lib/documents/citations.ts`

`cite(db, {document_id, page_no, char_start, char_end, bbox?, created_by, created_ref})`：读当前页 `text` 与 `text_hash`，`snippet = text.slice(start, end)`，空片段拒绝（`invalid_citation`）；返回 `citation_id`。`verify(db, citation_id)` 按 §4.4 规则。模块侧约定：**引用先于数字**——任何写事实/判断的代码先 `cite()` 拿到 id，再写自己的行。

### 7.5 港股财务事实候选 `src/lib/documents/hk-facts/`

`HK_LABEL_GEN = 1`、`HK_RULES_VERSION = 'hk-facts/1.0'`。只处理 `source='hkexnews'`、`doc_class ∈ {annual_report, interim_report}`、中文版（`source_ref` 以 `_c` 结尾）、`status='extracted'` 的文档；英文版只在 §7.6 的对照检查中读取。

1. **定位主表页** `locate.ts`：页文本含下列标题之一（繁体、简体、英文任一），且该页 `tables` 非空：损益表 `綜合損益表|綜合損益及其他全面收益表|綜合全面收益表|Consolidated Statement of Profit or Loss`；财务状况表 `綜合財務狀況表|綜合資產負債表|Consolidated Statement of Financial Position`；现金流量表 `綜合現金流量表|Consolidated Statement of Cash Flows`。同一类命中多页 → 取第一页为主表页，其余记 `locate_ambiguous` 信息码；一类都没有 → 该类缺失（不从附注或摘要页补）。
2. **期间与列** `period.ts`：主表页文本中的 `截至(\d{4})年(\d{1,2})月(\d{1,2})日止(年度|六個月|六个月|期間)` 或 `for the (year|six months) ended (\d{1,2}) (\w+) (\d{4})` → `period_end`、`duration`（年度 12M；六個月 6M）；表头中的两个四位年份列（当年列在前为常见，但以表头年份为准，不假定顺序）。解析不到期间 → 该页不产候选，信息码 `period_unparsed`。
3. **单位与倍数** `scale.ts`：主表页文本中的 `(港幣|港元|HK\$|人民幣|RMB|美元|US\$)\s*(千元|'000|百萬|百万|million|'000,000)?` → `unit`（`HKD|CNY|USD`）与 `scale`（1 / 1000 / 1000000）；多个货币命中 → `unit_ambiguous`，不产候选；无命中 → 候选 `unit=null`（永不通过检查）。
4. **科目映射** `labels.ts`：标签单元格文本（规范化后）与下表正则匹配；一行标签命中多个概念或一个概念被多行命中 → 该概念 `label_ambiguous`，不产候选。概念集合是规格二 §3 目录的子集（ifrs-full 列），不新增概念：

| concept | 标签正则（繁/简/英） |
|---|---|
| revenue | `^(收益|收入|營業額|营业额|Revenue)$` |
| cost_of_revenue | `^(銷售成本|销售成本|Cost of sales)$` |
| gross_profit | `^(毛利|Gross profit)$` |
| operating_income | `^(經營溢利|经营溢利|Operating profit|Profit from operations)$` |
| income_tax | `^(所得稅開支|所得税开支|Income tax expense)$` |
| net_income | `^(年內溢利|年度溢利|期內溢利|年内溢利|期内溢利|Profit for the (year|period))$` |
| net_income_parent | `^(本公司擁有人應佔|本公司拥有人应占|Owners of the Company)` 且位于 `net_income` 行之后的首个匹配行 |
| eps_basic | `^(基本|Basic)` 且位于 `每股盈利|Earnings per share` 行之后 |
| eps_diluted | `^(攤薄|摊薄|Diluted)` 同上 |
| total_assets | `^(資產總值|资产总值|總資產|总资产|Total assets)$` |
| total_liabilities | `^(負債總額|负债总额|總負債|总负债|Total liabilities)$` |
| equity_parent | `^(本公司擁有人應佔權益|本公司拥有人应占权益|Equity attributable to owners of the Company)$` |
| equity_total | `^(權益總額|权益总额|總權益|总权益|Total equity)$` |
| cash | `^(現金及現金等價物|现金及现金等价物|Cash and cash equivalents)$` |
| operating_cash_flow | `^(經營業務所得現金淨額|经营业务所得现金净额|經營活動所得現金淨額|Net cash (generated )?from operating activities)` |
| investing_cash_flow | `^(投資活動(所用|所得)現金淨額|投资活动(所用|所得)现金净额|Net cash (used in|from) investing activities)` |
| financing_cash_flow | `^(融資活動(所用|所得)現金淨額|融资活动(所用|所得)现金净额|Net cash (used in|from) financing activities)` |
| net_change_in_cash | `^(現金及現金等價物(增加|減少)淨額|现金及现金等价物(增加|减少)净额|Net (increase|decrease) in cash and cash equivalents)` |

港股主表常不列示"資產總值"（只列"總資產減流動負債"）或"負債總額"——这些概念就保持缺失，不从分项相加。

5. **值解析** `values.ts`：单元格 `^\(?([\d,]+(\.\d+)?)\)?$`，括号 = 负数；`–|-|—` 单独出现 = 该期无值（不产候选，不写 0）；`value = 数字 × scale`，以十进制字符串表示（整数倍数相乘不丢精度；eps 行 `scale=1`，单位 `<货币>/share`）。
6. **候选**：每个 (概念, 期间列) 一条 `extraction_candidates(kind='financial_fact', extractor_kind='rule', extractor_ref='hk-facts/1')`，`citation_id` = 值单元格引用（`created_by='extractor'`）；另写标签、期间标题、单位标题三条引用，晋升时进 `fact_citations` 的 `label/period/unit` 角色。上年比较列是 **本文件对上一期间的披露**，同样产候选（规格二披露日志语义：`available_date` = 本文件可得日）。

### 7.6 确定性检查 `checks.ts` 与晋升

每条候选记录全部检查结果到 `checks`；`checks_passed` = 全部通过：

| check | 规则 | 失败处理 |
|---|---|---|
| `citation_verified` | §4.4 规则，且 `snippet` 去除逗号/括号后等于解析前的数字串 | 候选不可晋升 |
| `unit_known` | `unit` 与 `scale` 均非空 | 同上 |
| `period_known` | `period_end` 与 `duration` 已解析；比较列的 `period_end` = 主列减一年同日 | 同上 |
| `identity_bs` | `identityRule('identity_bs', total_assets, total_liabilities + equity_total, 0.005)`（三者同页同列都有时；缺任一不检） | 同列 BS 候选全部不可晋升；隔离 `hk_identity_bs` |
| `identity_gp` | `identityRule('identity_gp', gross_profit, revenue − cost_of_revenue, 0.005)`（三者都有时） | 同列 IS 候选不可晋升；隔离 `hk_identity_gp` |
| `identity_cf` | `identityRule('identity_cf', net_change_in_cash, operating + investing + financing, 0.02)`（四者都有时；容差取规格一 §5.2 的 CF 三项之和 2%） | 同列 CF 候选不可晋升；隔离 `hk_identity_cf` |
| `comparative_consistent` | 本文件比较列的值 vs 上一期文件主列的已晋升事实（同概念、同期间、同单位）：`identityRule(…, 0.005)`；上一期不存在 → 不检 | **不阻断**（重述是合法披露）；写信息码 `restated_comparative` 与 `dq_quarantine` 项 `hk_restated_comparative`（供计划三对账与人工关注） |
| `en_cross_check` | 同一公告的英文版（`_e`）若已抽取：同页序号的同概念值相等 | 不阻断；不等 → 信息码 `en_zh_mismatch` 并写隔离项 |

**晋升**（`promote.ts`）：

- 人工：管理员在 §9 的候选接口 `confirmed` → 候选只变 `confirmed`；写入事实由 `src/lib/documents/hk-facts/promote.ts::runHkFactsSync(deps, {issuerIds, triggeredBy})` 完成（同一请求内对该发行人调用一次；也可由脚本批量调用）。它是规格二写入模型在 `market='HK'` 上的一次**同步运行**，输入不是抓取而是该发行人全部 `status='confirmed' and promoted_ref is null` 的候选：`reconcileScope('HK', [{issuer, priority: 0, fetch_key: hkex_stock_code_primary, reasons:['documents']}])`（`priority 0`：规格二的 cron 永不调度港股，只有本函数写）→ `claimLease(issuer,'HK',batch,600)` → `beginRun(issuer,'HK',batch, MAPPING_GEN)` → `stageFilings`（每个来源文档一行港股 `filings`，§4.8）→ `stageFacts`（每个候选一行：`concept/period/duration/value/unit` 来自 `payload`，`source_concept` = 标签原文，`consolidation='consolidated'`，`available_date` = 文档 `available_date`，`raw_hash` = 文档 `content_sha256`，`mapping_gen = MAPPING_GEN`；规格二 §5.3 的重复/同日冲突规划照常）→ 规格二 `identity_bs/identity_gp` 规则（输入 = 本运行新行 ∪ 该 filing 当前 ok 行）→ `quarantineFacts` → `publishRun(manifest)` → 写 `fact_citations`（`value/label/period/unit` 四角色；本表由 service_role 直接 insert）→ 候选 `promoted`、`promoted_ref = fact_id` → `replaceMetrics`（规格二派生）→ `releaseLease`。规格二规则失败的行按其隔离项处理，对应候选停在 `confirmed`（不是 `promoted`），管理员可见；`publishRun` 抛错 → `abandonRun`，所有候选保持 `confirmed`，下次调用重试。`raw_hash` 对港股的定位规则：桶内 `{content_sha256}.pdf` 的 `fact_citations(role='value')` 所指页与 bbox。
- 自动：`HK_AUTO_PROMOTE`（环境变量，默认未设）为 `1` 时，`checks_passed=true` 且 `extractor_kind='rule'` 的候选在同一抽取批次内晋升，`decided_by` 为空、`decided_at=now()`、`checks` 保留为证据。owner 只能在黄金集（§11.4）上规则抽取器字段级精确率 ≥ 0.95（总纲 §3.5 的门槛）后设置该变量（§14 决策 C）。
- `rejected` 候选不动；`llm` 候选永不自动晋升（§7.7）。

### 7.7 LLM 抽取边界

本规格不实现任何 LLM 调用，只约束未来实现（外资研报、公司研究、评测 F6 共用）：

1. LLM 的输出只能写 `extraction_candidates(extractor_kind='llm', extractor_ref='<model_id>@<prompt_version>')`，`payload` 必须经 ajv（仓库已有）按 kind 的 JSON Schema 校验，`citation_id` 必须由 `cite()` 产生——即 LLM 返回的是"页码 + 引述原文"，服务端在该页文本中**精确定位**引述得到字符区间；定位不到的输出整条丢弃并计 `llm_uncited`，不入候选。
2. `input_snapshot` 记 `content_sha256`、送入的页码、`extractor_version`、`pages_json_sha256`、模型 id、prompt 版本；调用经 `src/lib/llm` 计量。
3. LLM 候选与规则候选对同一 (概念, 期间) 的值不一致 → 信息码 `extractor_disagreement` 并写隔离项；一致不改变任何晋升规则。
4. 公开页面不得展示 `status='candidate'` 的任何值（RLS 已保证 anon 读不到候选表；页面层也不得通过 service_role 旁路）。

---

## 8. 公共与私有、许可

### 8.1 公共（`permission='public'`，官方披露）

- 公共可读：`disclosure_documents` 元数据（含 `source_url`、`content_sha256`、`available_at`）、`document_pages.text`、`document_citations`、`fact_citations`。
- 不公开：桶内对象（原件与 `pages.json`）。读接口对公共文档返回 `source_url` 作为"在原文打开"的目标；我们的副本只经签名 URL 给**已登录用户**（`GET /api/documents/doc/[id]/file`，`expiresSeconds = 300`，与 `maxDuration` 同量级，足够一次下载），避免匿名流量把私有桶变成公共镜像。

### 8.2 私有与授权（`licensed` / `private`）

- `owner_user_id` 必填；RLS 只对持有人可见；读接口对非持有人返回 404（不泄露存在性）。
- 每次 `file`、`pages`、`citations` 读取写 `research_audit_log(user_id = 持有人, action = 'document.read', object_id = document_id, payload = {route, page_no?, citation_id?, requester})`（表已存在；写入用 service_role，`requester = auth.uid()`）。
- 片段只返回 `snippet`（创建引用时的区间原文），不返回整页；`pages` 接口对 licensed 文档只对持有人开放。

### 8.3 给外资研报规格的接口（本规格交付，外资研报规格消费）

```ts
// src/lib/documents/upload.ts
ingestUpload(deps, {ownerUserId, bytes, filename, mime: 'application/pdf', license: {ref: string}, issuerId?: string, title?: string})
  → {documentId, duplicate: boolean}          // source='upload', permission='licensed', source_ref=sha256, available_at=now
// 读取：§9 的 doc/pages/citations/file 四个接口，持有人身份下可用
// 抽取：同 §7.2（文本层 + 表格 + pages.json）；字段抽取（机构/评级/目标价）由外资研报规格以 §7.7 边界实现，kind='field'
// 脱敏：本规格不改写原文；对外展示的"独立摘要"是外资研报规格的产物；本规格只保证原文、页文本、片段不越过持有人
```

许可确认先于功能（总纲 §3.2）：`license.ref` 的含义、可展示范围、是否允许片段展示，是外资研报规格与 owner 的事项（§14 决策 F）；本规格默认片段仅持有人可见。

---

## 9. 读取接口与管理接口

共同约定：公共接口用 `anon` 客户端的 `DocumentsDb` 只读子集，`force-dynamic`；参数重复 → 400 `invalid_parameter:<name>`；ticker 正则与规格二相同；`resolveIssuer({ticker},{today})`，无 → 404 `unknown_ticker`；错误与空结果 `no-store`；成功 `Cache-Control` 规则同规格二 §9（历史查询 `public, max-age=600, s-maxage=3600`，否则 `successCacheControl(now)`）。响应顶层含 `extractorVersion`（当前）与 `classifierGen`。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/documents/[ticker]` | `source`、`class`（`doc_class`）、`from`/`to`（`available_date`）、`versions=1`、`limit`（默认 100、最大 1000） | `{issuerId, ticker, documents:[{documentId, source, sourceRef, sourceVersion, docClass, formType, title, language, sourceUrl, contentSha256, bytes, mime, availableAt, availableAtPrecision, availableDate, eventDate, fiscalYear, fiscalPeriod, periodEnd, filingSourceRef, status, pageCount, extractorVersion}]}`；只含 `public` |
| `GET /api/documents/doc/[id]` | — | 同上单条 + `assets:[{role, filename, sourceUrl, contentSha256, bytes}]` + `supersedes`、`supersededBy`；licensed 对持有人以登录身份返回 |
| `GET /api/documents/doc/[id]/pages/[n]` | `layout=1` | `{documentId, pageNo, text, textHash, charCount, width, height, lines?:[{y,x0,x1,text}], tables?:[…]}`；`layout=1` 时服务端读桶内 `pages.json` 取该页 |
| `GET /api/citations/[id]` | — | `{citationId, documentId, pageNo, charStart, charEnd, bbox, snippet, textHash, verified, createdBy, createdRef, document:{title, sourceUrl, availableAt, docClass}}`；`verified` 按 §4.4 实时计算 |
| `GET /api/documents/doc/[id]/file` | — | 需登录（`getServerSupabase` 会话）；`{url, expiresAt}` 签名 URL；licensed 非持有人 404 |
| `GET /api/facts/[ticker]`（规格二，扩展） | `citations=1` | 每行追加 `citations:[{role, citationId, pageNo}]`（来自 `fact_citations`）；港股 `filings.citation = 'page'` |
| `POST /api/admin/documents/[id]/reprocess` | body `{stage: 'extract'|'classify'}` | `requireAdminUser()`，JSON 与 Origin 校验同 `/api/admin/dq/quarantine/[id]`；`extract` → `status` 置回 `stored`（触发器允许 `extracted/extract_failed → stored`）并立即跑一次 `runDocumentsExtract({documentIds:[id]})`；`classify` → 重跑 `classify()`；写 `research_audit_log` |
| `GET /api/admin/documents/candidates` | `status`、`document`、`issuer`、`limit` | 候选列表（含 `checks`、引用片段、文档标题） |
| `POST /api/admin/documents/candidates/[id]` | body `{status:'confirmed'|'rejected'}` | 翻转并按 §7.6 晋升；返回 `{status, promotedRef?, hook:{state, message?}}`；重复 POST 幂等 |
| `GET|POST /api/cron/documents-sync`、`/api/cron/documents-extract` | §6.3 | 批次回执 |

### 9.1 来源抽屉数据契约（供各页面规格接入）

页面上每个可回放数字携带 `{factId?, citationIds: string[], documentId, pageNo}`；抽屉打开时调用 `GET /api/citations/[id]`（必要时 `pages/[n]?layout=1`）。抽屉必须呈现：文档标题、来源与 `availableAt`、页码、片段（高亮 `charStart..charEnd`）、`verified` 状态（false → "引用待复核"标记，数字仍显示）、"在原文打开"（`sourceUrl`，PDF 加 `#page=n`）、对已登录用户的"下载副本"（`file`）；licensed 文档对非持有人显示"需授权"而不显示片段。状态：加载骨架（按 `DESIGN.md` 骨架规则）、引用不存在（404 → 行内错误条）、无文本层（`no_text_layer` → 只给原文链接与页码）。zh/en 文案进 `messages/{zh,en}/documents.json`，`messages-parity.test.ts` 自动校验。

### 9.2 Claude Design 画布待设计清单（owner 规则：所有 UI 先在画布设计）

1. 来源抽屉（桌面侧滑 / 手机全屏）：页文本视图、高亮片段、bbox 示意（无 PDF 渲染，用行坐标画出矩形）、`verified`/待复核/需授权三态、原文与下载入口。
2. 管理员候选复核工作台（挂在现有 `/admin/dq` 下）：候选表（概念、期间、值、单位、`checks` 逐项）、同页片段对照、确认/拒绝、晋升结果与规格二隔离回显。
3. 发行人文档列表（公司研究页的"披露文件"标签页）：按类别/年份筛选、版本标识、处理状态、每行进入抽屉。
4. `/admin/dq` 的文档处理状态面板：三来源新鲜度、`stored` 积压、`no_text_layer`/`extract_failed` 计数、重处理入口。

---

## 10. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| 列表请求失败（HTTP 非 2xx、超时、`layout_changed`） | 该发行人跳过 | `failed` / `list_failed`（message 含 `layout_changed` 原文） | partial |
| 文件 429/503 重试耗尽或预算不足 | 该文件跳过，发行人继续 | `fetch_failed` | partial |
| 文件 404 | 跳过 | `skipped_summary(document_missing)` | — |
| `Content-Length` 或实际字节 > 52428800 | 隔离 `document_too_large`，无行 | `quarantined` | partial |
| 对象上传失败 | 不写行 | `object_put_failed` | partial |
| 内容类型与来源预期不符（如 HKEX 返回 HTML 错误页） | 隔离 `unexpected_mime`（payload 含前 256 字节的十六进制） | `quarantined` | partial |
| 23505（版本/哈希唯一键） | 该文件 `duplicates`（并发写入者赢） | — | — |
| 租约被占 / 丢失 | 跳过 / 该发行人或文档 failed | `skipped_summary(leased)` / `lease_lost` | — / partial |
| 发行人 `merged` | 跳过 | `skipped_summary(issuer_merged)` | — |
| 抽取：无文本层 | `status='no_text_layer'`，不算失败 | `skipped_summary(no_text_layer)` | — |
| 抽取：pdf.js 抛错 / 超预算 | `extract_attempts + 1`；≥ 3 → `extract_failed` | `extract_error` / `extract_timeout` | partial |
| 抽取：`pages.json` 上传失败 | 不调用 `finishExtract`，文档留 `stored` | `object_put_failed` | partial |
| 港股候选：定位/期间/单位/标签歧义 | 不产候选 | 信息码 `locate_ambiguous` / `period_unparsed` / `unit_ambiguous` / `label_ambiguous`（各一条汇总，`key=document_id`） | — |
| 港股候选：恒等式失败 | 候选不可晋升，隔离 `hk_identity_*` | `quarantined` | partial |
| 港股候选：比较数/中英不一致 | 候选可晋升，隔离 `hk_restated_comparative` / `hk_en_zh_mismatch` | 信息码 `restated_comparative` / `en_zh_mismatch` | — |
| 晋升时规格二规则失败 | 候选停在 `confirmed`，返回 `hook.state='failed'` 与规格二隔离 id | — | — |
| 引用创建片段为空 | 拒绝 | `invalid_citation` | — |
| 截止 | 不再开始新发行人/文档 | `deadline_hit`（信息） | — |
| 无到期项 | 心跳 ok | `detail.idle=true` | success |
| `fetched>0` 无结果 | `unaccounted` | — | failed |
| 读接口 | 404 `unknown_ticker` / `not_found`；400 `invalid_parameter:<name>`；401 `unauthenticated`（`file`） | | |

新增信息码（加入 `INFO_CODES`）：`deadline_hit`、`coverage_summary`、`locate_ambiguous`、`period_unparsed`、`unit_ambiguous`、`label_ambiguous`、`restated_comparative`、`en_zh_mismatch`、`extractor_disagreement`、`llm_uncited`。规格二已申请 `deadline_hit`/`coverage_summary`，重复定义以先落地者为准。

---

## 11. 测试策略

### 11.1 单元（vitest，`memoryDocumentsDb` + `memoryObjectStore`）

- `classify.test.ts`：三来源规则、排除词、年份与期间解析、`CLASSIFIER_GEN`。
- `sources/edgar.test.ts`：复用 `edgar-submissions-1321655.json`；表单过滤、`source_ref`、资产列表（索引 JSON 夹具在 F3-1 录制）。`sources/cninfo.test.ts`、`sources/hkexnews.test.ts`：复用现有列表夹具；年份分段；分页。
- `sync.test.ts`：两遍幂等（第二遍全 `duplicates`）；哈希变化 → `versioned` 与 `supersedes`；`too_large`、`unexpected_mime`、上传失败不写行；租约失败/丢失；截止；空转；`code_version` 缺失拒绝。
- `extract/pdf.test.ts`：夹具 `fixtures/pdf/minimal-two-pages.pdf`（手写的最小 PDF，两页，第一页一段文本，第二页三列数字表，≤ 2 KB，文件头注释说明是手工构造而非真实披露）：行聚类、空格插入、页序、`hasTextLayer`、空页；`fixtures/pdf/no-text.pdf`（只含一个图像对象）→ `no_text_layer`。
- `extract/tables.test.ts`：对录制的港股主表页 `lines`（来自 §11.3 夹具）得到预期的列数与标签单元格。
- `extract/html.test.ts`：复用 `edgar-8k-pltr-20260803.htm`；分页标记切页（该夹具若无标记则为一页，并增录一个含 `page-break` 的 10-K 片段夹具）。
- `citations.test.ts`：`cite/verify`、哈希变化后 `verified=false`、空片段拒绝。
- `hk-facts/*.test.ts`：`locate`（多页歧义）、`period`（年度/六個月、英文）、`scale`（千元/百萬/歧义/缺失）、`labels`（每个概念至少一个繁体、一个简体、一个英文样例；`net_income_parent` 的顺序约束）、`values`（括号负数、破折号缺失、倍数）、`checks`（每条检查的通过/失败各一例；`identity_cf` 2% 容差）、`promote`（人工路径、自动路径只在 `HK_AUTO_PROMOTE=1` 且 `checks_passed`、llm 候选永不自动）。
- 路由测试：参数、缓存头、`verified`、licensed 非持有人 404、`file` 未登录 401、管理接口的媒体类型/Origin、候选 POST 幂等。

### 11.2 数据库（`test:db`，全部 critical）

`src/lib/documents/documents.integration.test.ts`：迁移一可重放；唯一键（版本、哈希）；`dd_owner_iff_private`、`dd_extracted_fields`；触发器（限定列、状态迁移集合、delete 禁止、候选生命周期、`decided_by` 必填）；四个函数（租约互斥/过期/续租、`lease_lost`、`finish_document_extract` 删旧插新原子、anon 不可执行）；RLS 真实角色（anon 读 public 行、读不到 licensed 行与候选表、页/引用策略跟随文档）。
`src/lib/documents/fact-citations.integration.test.ts`：迁移二在规格二迁移之后可重放；`fact_citations` 外键；`filings.primary_document_id`；枚举加法（`market='HK'` 可插）；RLS 跟随 `financial_facts.status`。本套件只在规格二 F2-0 落地后创建（harness 不允许跳过块）。

### 11.3 离线集成（录制回放）

`scripts/documents/record-fixture.ts --hkex <url>` 下载真实 PDF，**不提交 PDF**，提交：`fixtures/hkex/<source_ref>.pages.json`（本抽取器输出，文件头 `{recorded_at, source_url, content_sha256, bytes, page_count, extractor_version}`）与 `<source_ref>.meta.json`。首批录制对象：`0268.HK` 的 `2026090300863_c`（2026 中期报告，已在列表夹具中）与 F3-2 时从 HKEX 列表取到的同一公司最近一份年报（`_c` 与 `_e` 各一）。
`src/lib/documents/sync-hk.integration.test.ts`（critical）：列表夹具 + `pages.json` 夹具注入 `memoryObjectStore`（`fetchBytes` 返回与 `content_sha256` 一致的占位字节，抽取层被替换为"读夹具 pages.json"）→ 两遍同步、抽取、候选、检查；黄金断言港股部分逐项一致；人工确认路径写入规格二表（依赖规格二落地）。
`src/lib/documents/sync-us.integration.test.ts`（critical）：`edgar-submissions` + 8-K 夹具 + 索引 JSON 夹具 → 文档与资产入库、HTML 分页、引用。

### 11.4 黄金集与评测

`fixtures/gold/hk-facts.json`：3 家港股（含 `0268.HK`，其余两家在 F3-4 从范围内选取，须有可用中文年报）× 2 期 × 6 科目（revenue、net_income_parent、total_assets 或缺失如实、equity_total、operating_cash_flow、eps_basic），每条 `{issuer, concept, period_end, unit, value, source:{document_sha256, page, line_text}, recorded_by, recorded_at}`，**由实施者之外的人从 PDF 抄录**。
评测接口（供 F6）：`scripts/documents/eval-hk-facts.ts --gold fixtures/gold/hk-facts.json` 输出 `{precision, recall, mismatches[]}`；精确率 = 通过检查的候选中与黄金一致的比例，召回 = 黄金条目中被候选覆盖的比例；结果写 `docs/audits/2026-11-04-document-pipeline/eval-hk-facts-<date>.json`。`HK_AUTO_PROMOTE` 的前提是精确率 ≥ 0.95（§7.6）。

### 11.5 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`；全部门禁（`lint`、`typecheck`、`test`、`test:db`、`test:migrations`、`check:migration-history`）绿才算完成。

---

## 12. 分期（供计划三-文档 拆任务）

| 工作包 | 交付 | 退出条件 | 工作量 |
|---|---|---|---|
| F3-0 迁移一、契约、依赖 | `20261106100000_disclosure_documents.sql`（六表、桶、四函数、触发器、权限）、锁文件、types、`DocumentsDb`/`ObjectStore` 各实现、`pdfjs-dist` 入 `package.json` 与 Vercel preview 冒烟记录 | `test:db`、`test:migrations` 绿；冒烟结论写入 runbook | 2.5 人日 |
| F3-1 采集 | `sources/{edgar,cninfo,hkexnews}.ts`、`sync.ts`、`scope.ts`、`classify.ts`、cron `documents-sync`、脚本、EDGAR 索引/分页文件形态核对记录、首 20 个港股发行人实测字节数 | 单测绿；真实 dry-run 各来源 3 家；回执落库 | 3 人日 |
| F3-2 抽取与引用 | `extract/{pdf,tables,html,run}.ts`、`citations.ts`、cron `documents-extract`、`record-fixture.ts`、PDF 夹具（手工最小 PDF + 录制的 `pages.json`） | 单测绿；`0268.HK` 中期报告三张主表页可定位 | 3 人日 |
| F3-3 读接口 | `/api/documents/*`、`/api/citations/[id]`、`file` 签名 URL、管理员 `reprocess`、i18n `documents.json`、来源抽屉契约文档 | 路由测试绿；真实库上 `verified=true` | 2 人日 |
| F3-4 港股事实（依赖规格二 F2-0～F2-2 落地） | 迁移二、`hk-facts/*`、候选管理接口、晋升到规格二写入路径、黄金集、`eval-hk-facts.ts`、`sync-hk.integration` | 黄金断言一致；评测报告落审计目录；`HK_AUTO_PROMOTE` 默认关 | 4 人日 |
| F3-5 授权上传接口 | `upload.ts`、licensed RLS 与访问日志、`file/pages/citations` 的持有人路径测试 | 真实角色测试：非持有人读不到 | 1.5 人日 |
| F3-6 文档收尾 | `docs/runbooks/document-pipeline.md`（手动触发、重处理、悬空批次与租约清理 SQL、孤儿对象说明）、规格一/二指向、§17 偏差记录 | 全量门禁绿 | 1 人日 |

合计约 17 人日。F3-0～F3-3、F3-5 不依赖规格二；F3-4 等规格二。若 §15 问题 3 的冒烟失败：F3-2 的 cron 不上线，抽取只走 `scripts/documents/extract.ts`（本机），读接口与引用不变（§14 决策 D 的降级路径）。

验收样例：
1. `scripts/documents/sync.ts --source hkexnews --issuer <0268.HK 的 issuer_id> --since-year 2016 --apply` 两次：第二次 `inserted=0`，`duplicates=第一次 inserted`。
2. `documents-extract` 后 `GET /api/documents/doc/<id>/pages/<损益表页>` 文本含 `綜合損益表`，`has_tables=true`。
3. 管理员确认一条 `revenue` 候选 → `GET /api/facts/0268.HK?concepts=revenue&citations=1` 该行 `citations` 含 `value/label/period/unit` 四角色，`GET /api/citations/<value>` `verified=true`。
4. 把该页 `document_pages.text` 人为改动（测试库）→ `verified=false`，事实行仍返回。
5. HKEX 同一 `source_ref` 返回不同字节 → `source_version=2`，旧引用仍指向 `source_version=1` 的页。
6. anon 调 `GET /api/documents/doc/<licensed id>` → 404；持有人 → 200 且 `research_audit_log` 多一行。
7. 断网运行两个 cron：批次 `failed`，表与桶不变。

---

## 13. 独立验证

- Codex（gpt-6-astra，medium）：规格两轮与处置表（本目录 01/02/03）；每个工作包提交再审。
- 黄金集由实施者之外的人抄录；评测脚本输出进审计目录。
- 真实来源 dry-run：三来源各 3 家（需 `EDGAR_USER_AGENT`）；EDGAR 索引 JSON 与分页文件形态、HKEX 日期范围上限、HKEX 文件替换行为的核对记录进 runbook。
- 引用回溯抽样：F3-4 后随机抽 5% 已晋升港股事实（总纲 §2.6 的比例），人工点开原文核对页码与片段，记录在 `docs/audits/2026-11-04-document-pipeline/citation-sampling-<date>.md`。
- 会计口径复核：§7.5 标签表中"資產總值/負債總額常不在主表"与"比较列是对上一期间的披露"两处由审核人确认。

---

## 14. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 A**：港股范围 = in_scope 队列（默认）还是 `hk_main` 宇宙全体（HKEX 1000 ms 节奏下全体轮询一轮的耗时另算） | owner | 计划编写前 |
| **决策 B**：巨潮与 HKEX 是否只入库定期报告类（默认）还是全部公告 | owner | 计划编写前 |
| **决策 C**：港股候选是否允许自动晋升（`HK_AUTO_PROMOTE`）；前提为黄金集精确率 ≥ 0.95；默认关、全部人工确认 | owner | F3-4 评测报告出来后 |
| **决策 D**：批准新依赖 `pdfjs-dist`；若 Vercel 冒烟失败，接受"抽取只在本机脚本运行"的降级 | owner | F3-0 |
| **决策 E**：桶 `disclosure-docs` 的容量预算与 `file_size_limit`（默认 52428800）；F3-1 实测前 20 家港股字节数后定 | owner | F3-1 后 |
| **决策 F**：授权研报的许可条款、片段是否可对持有人以外展示（默认不可）、`license.ref` 的登记方式 | owner + 外资研报规格 | F3-5 前 |
| Vercel 环境变量 `EDGAR_USER_AGENT`（本机也需要，录夹具用）、`CRON_SECRET`、（可选）`HK_AUTO_PROMOTE` | owner | 部署前 |
| 确认 Vercel 团队计划允许每小时 cron（`documents-extract`） | owner | F3-2 前 |
| 生产执行两个迁移；首轮 `scripts/documents/sync.ts --source hkexnews --limit 5 --apply`；cron 与脚本不同时运行 | owner | 合并后 |
| 黄金集抄录（3 家 × 2 期 × 6 科目，含页码） | owner / 审核人 | F3-4 前 |

---

## 15. 开放问题（实施前核对）

1. EDGAR 申报目录 `index.json` 的字段形态与 XBRL 实例文件命名（`*_htm.xml`）；`submissions` 的 `filings.files[]` 分页文件是否需要接入才能覆盖 10 年。
2. HKEX：标题搜索的日期范围上限（是否需按年分段）；同一 PDF 路径被替换的频率（决定 `--refetch` 是否默认开）。
3. `pdfjs-dist` 在 Next 15 路由处理器（Node 22、Vercel hnd1）的加载方式与 300 页年报的内存/耗时。
4. 巨潮 `hisAnnouncement` 的 `category` 参数对定期报告的取值（规格二 §6.3 也用到；以其核对结果为准）。
5. 港股主表的繁/简/英标题与科目标签在范围内公司的实际分布：§7.5 的正则是从常见格式写出的，F3-4 第一步用范围内全部已抽取年报统计"每类主表定位命中率"与"每个概念标签命中率"，命中率写入评测报告；未命中的标签不扩表，只记录。
6. 版本语义与规格二 `filings.mapping_gen` 的交互：港股 filing 的 `mapping_gen` 由谁升（本稿：晋升时按规格二规则由写入路径处理）。
7. 两份规格的租约表合并为通用 `sync_leases`（计划三）。

---

## 16. 依赖接口（待对齐）

| 对方 | 本规格需要 | 本规格提供 |
|---|---|---|
| 规格二（事实库） | 四处 `market` 枚举加 `HK`，`filings.source/origin` 加 `hkex`；`filings.primary_document_id` 与其列级 update 例外；`FactsDb` 的 `reconcileScope/claimLease/beginRun/stageFilings/stageFacts/quarantineFacts/publishRun/abandonRun/releaseLease/replaceMetrics` 可被 §7.6 的 `runHkFactsSync` 以 `market='HK'` 调用；`read_facts` 对 `p_market='HK'` 不做额外限制；`/api/facts` 接受 `citations=1`；`INFO_CODES` 的 `deadline_hit/coverage_summary` 共用 | `fact_citations`；港股 `filings`/`financial_facts(source='hkex')` 的唯一写入者；A 股 `filings.document_ref`（巨潮 announcementId）可通过 `disclosure_documents(source='cninfo', source_ref=announcementId)` 反查到 `document_id` |
| 规格四（判断框架） | 无 | 判断的输入快照可引用 `citation_id`；`created_by='module'` |
| 规格六（评测） | 黄金集格式与阈值由其统一；LLM 候选的评测 harness | `eval-hk-facts.ts` 的输出格式；`extraction_candidates` 作为评测样本源 |
| 计划三（标识符/对账） | 港股无第二事实来源，`dq_reconciliations` 对港股只能用"比较列 vs 上期主列"（§7.6 已写隔离项） | `hk_restated_comparative` 隔离项与信息码 |
| 外资研报规格 | 许可条款、`license.ref`、`kind='field'` 的 JSON Schema、独立摘要规则 | §8.3 上传接口、licensed RLS、访问日志、片段 API |
| 公司研究 / 行业研究页面规格 | 来源抽屉组件实现（Claude Design 画布后） | §9.1 契约、§9.2 待设计清单、`/api/documents/[ticker]` |

---

## 17. 实施记录与偏差

（计划三-文档 落地后补记，格式同规格一 §14。）
