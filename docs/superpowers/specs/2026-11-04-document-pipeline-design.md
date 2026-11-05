# 数据底座三 · F3 披露文档管道 设计规格

日期：2026-11-04（第 5 稿，吸收 Codex 四轮共 57 项；第四轮 R4-1～R4-7 按 Codex 给定修法逐字落入，未再审计；审计轨迹：`docs/audits/2026-11-04-document-pipeline/`——01 Codex 一轮、02 Codex 二轮、03 处置表、04 Codex 三轮、05 Codex 四轮）
状态：草案，待 owner 评审（§14 有七项 owner 决策）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一，F1 发行人与 F5 质量设施已落地，§14 偏差视为既定事实）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二，本稿写作时为第 8 稿：`fact_sync_runs` 同步运行、写入只经 `security definer` 函数、`read_facts` 信封、`materialize(issuer, market)`；港股事实与 PDF 页码引用明确延后到本规格。规格二仍在修订，本规格对它的依赖集中在 §16，以其落地版本为准）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §4"文档管道"行与 §5 硬约束。本规格逐条对照：只用一手披露文件（EDGAR、巨潮、HKEXnews；PDF/HTML 原件入私有桶）、每个数字可回放到"源文件哈希 + 抽取版本 + 页码/字符区间 + 可得时间 + 变换 + 代码版本"、事实与判断分离（抽取结果先是候选，确认后才是事实；候选永不公开）、缺失保持缺失（扫描件不做 OCR 猜测、找不到的科目不补、倍数不明的值不晋升）、研报原文永不对外分发（许可先于功能）、本规格不含任何面向用户的页面，只定义"来源抽屉"的数据契约与待设计清单。

---

## 1. 目标与非目标

### 1.1 目标

1. **全局文档库。** 一张与用户无关、以 `issuers.issuer_id` 为主挂接的 `disclosure_documents` 表，记录三个市场的官方披露文件（EDGAR 主文档与申报索引、巨潮公告 PDF、HKEXnews 公告 PDF）：来源、来源引用、内容哈希、字节数、发布时间与可得时间、版本、权限、处理状态、获取记录。原件字节存私有桶，内容寻址；写入只经数据库函数（§4.8 的变更清单给出每个函数的锁与授权来源）。
2. **不可变的抽取版本与页级引用。** 每次抽取是一个不可变的 `document_extractions` 版本（抽取器版本 + 版面 JSON 哈希），其逐页文本 `document_pages` 永不删除或改写；任何模块引用一个数字时写一条 `document_citations`（抽取版本、页、Unicode 码点区间、可选 bbox、文本哈希、片段）。重新抽取只是新增版本并切换"当前版本"，旧引用继续指向旧版本的页。
3. **港股事实作为规格二的扩展。** 从港股年报/中报 PDF 的三张主表抽取候选值（规则抽取，引用角色：值、科目标签、期间证据（报表标题 + 所选列头）、单位标题），经阻断性确定性检查与人工确认（或经审批记录授权的自动决定）后，以规格二的同步运行模型写入 `financial_facts`（`filings.source='hkex'`），证据 `fact_citations` 在发布前已暂存并经 `assert_run_evidence_complete` 校验，随事实发布原子可见。未确认的永远只是候选，候选表对非 service_role 不可见。
4. **LLM 边界。** LLM 只能产出候选（同样必须由服务端定位到页内字符区间），永不直接产出事实，永不自动晋升。
5. **公共/私有分层。** 官方披露的元数据、页文本、已随事实发布或由模块公开的引用公共只读；原件副本不对匿名公开；授权研报（外资研报规格的输入）以 `permission='licensed'` 走同一管道，任何行对非持有人不可见，持有人只能经服务端路由读取（每次读取写审计，审计失败则请求失败），响应 `private, no-store`。
6. **读接口与运维。** 按 ticker 与 as-of 的文档列表、按文档的元数据/页文本、按引用 id 的片段校验、管理员重处理与候选决定、三个 cron 路由（采集；抽取；候选 + 自动决定 + 晋升）与同核心的本机脚本。

成功标准（计划三-文档 退出条件）：
- 范围内（§6.4）每个港股发行人：`document_sync_scope.backfill_done=true`，且 `sinceYear = 当前年 − 10`（与规格二默认一致）以来每份年报与中报 PDF 已入库并有当前抽取版本（无文本层的记 `no_text_layer`，不计失败）；美股发行人同期 10-K/10-Q/20-F 主文档与申报索引入库；A 股发行人同期定期报告 PDF 入库。"完整"以 §6.2 核对过的历史分页机制为准，核对前回执只报 `coverage_summary`。
- `GET /api/citations/{id}` 对任一已发布港股事实的 `value` 引用返回 `integrity='ok'`，`snippet` 去除千分位与括号后的数字串按候选记录的 `scale` 与符号规则换算后等于 `financial_facts.value_text`（换算用十进制字符串算术，§7.5 第 5 条）。
- 黄金集（§11.4）港股部分：3 家 × 2 期 × 全部 18 个概念（含"该报表不列示"的缺失项），规则抽取器候选经阻断检查后与人工抄录逐项一致；不一致项全部停留在候选态并有隔离项；评测报告（精确率、召回率）与真实字节验证报告落审计目录。
- 同一发行人两次运行采集：第二次 `duplicates = 第一次 inserted`，无新文档行，游标不回退；HKEX 同一 `source_ref` 的 PDF 字节变化 → 新 `source_version`，其 `available_at` = 首次观察到新字节的时刻，旧行、旧对象、旧引用保留。
- 重新抽取一份已被引用的文档（抽取器版本升级）：旧引用 `integrity='ok'`、`currentExtraction=false`；新引用指向新版本；`document_pages` 行数只增不减。
- 断网运行三个 cron：批次按 `batchStatusFromCounts` 为 `failed`（无任何 landed 行）；文档、页、引用、候选、事实各表无新行，桶无新对象（批次回执、租约、新鲜度等运维行照常写入）；连续两次后新鲜度 `error`。
- 真实角色集成测试：anon/authenticated 直接查表与查视图都读不到 `licensed/private` 文档的任何行、读不到候选表、读不到未公开的引用、不能调用任何写函数；owner A 对 owner B 的文档得到 404。

### 1.2 本规格之外

- 任何面向用户的页面与组件实现（来源抽屉由公司研究/行业研究规格的页面接入，本规格只给数据契约与"Claude Design 画布待设计清单"）。
- OCR（扫描件保持 `no_text_layer`）、XBRL 实例解析（规格二用 companyfacts；实例文件只存不解析）、业绩会录音/文字稿、交互易/e 互动问答。
- 外资研报的字段抽取（机构/评级/目标价）、分析师实体、去重（simhash）：外资研报规格；本规格只交付其需要的上传、私有存储、引用片段与访问日志接口（§8.3）。
- A 股 PDF 的财务事实抽取（规格二已定 Tushare 为 A 股事实来源；A 股 PDF 在本规格只作为引用与计划三对账的原件）。
- 跨来源对账运行器（`dq_reconciliations` 写入者）：计划三；本规格的港股"上年比较数"检查只写隔离与信息码（§7.6）。
- 人工覆盖（override）晋升：阻断检查失败的候选只能拒绝或等待重抽取/规则升级，本规格不提供"强行确认"。
- 已入库文档的周期性重新核验（发现 HKEX 对旧文件的替换）：替换只在回填与轮询窗口内被发现（§6.1）；周期性重核验的节奏在 §15 问题 2 核对后由 owner 决定（§14）。
- `research_source_documents` 的改造或迁移；Research OS 各脚本继续按用户写该表，不受影响（§3）。

---

## 2. 现状（2026-11-04，仓库勘察）

| 领域 | 现状（已核对文件） | 本规格如何使用 |
|---|---|---|
| 文档库 | `research_source_documents`（`supabase/migrations/20260705000000_research_os_tables.sql`）：`user_id not null references auth.users`，`unique (user_id, content_hash)`，RLS `auth.uid() = user_id`，S4 限制性策略 `s4_controlled_copy`（`20260922090000_research_s4.sql`），`research_source_entity_alignments` 以 `(user_id, source_id)` 外键挂接（`20260926100000`）；只存 `raw_text`，无二进制、无页结构；`entity_ids` 指向按用户的 `research_entities` | 不泛化（§3）；新建全局表 |
| 来源扩展 | `20260925230000_research_source_extension.sql`：`available_at timestamptz not null`（触发器缺省 = `ingested_at`）、`source_version text ~ '^[1-9][0-9]{0,8}$'`、`permission in ('public','licensed','private')`、`origin_type`、`market in ('A','HK','US','other')`；不可变触发器覆盖 `raw_text/content_hash/source_type/url/available_at/source_version` | 沿用 `permission` 三值与"版本 = 同一引用下内容变化"两个约定；**可得时间语义在本规格是有意改变的**（§5.2）：现有巨潮/HKEX 采集器写 `available_at = clock()`、发布时间写 `event_time`，本规格区分 `published_at` 与 `available_at` 并对首个版本取发布时间 |
| 采集器 | `src/lib/research/ingest/collectors/`：`shared.ts::createClient`（UA = `EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT`，最小间隔，`AbortSignal.timeout(30_000)`）；`edgar.ts`（`data.sec.gov/submissions/CIK{10}.json` → `filings.recent[]` 仅最近申报，主文档 URL `www.sec.gov/Archives/edgar/data/{cik}/{accn无横线}/{primaryDocument}`，`acceptanceDateTime`，`htmlToText` 截断 `MAX_TEXT=200_000`，间隔 120 ms）；`cninfo.ts`（`topSearch` 与 `hisAnnouncement/query`，`category: ''`，`PAGE_SIZE=30`，`announcementTime` 为北京时间当日零点，PDF 为 `static.cninfo.com.cn/{adjunctUrl}`，间隔 500 ms；只做 SH/SZ）；`hkexnews.ts`（`prefix.do` 取 `stockId`，`titlesearch.xhtml` 一次返回整个 HTML 表（无分页参数），`release-time` HKT 精确到分钟，PDF 链接 `www1.hkexnews.hk/listedco/...pdf`，间隔 1000 ms；布局漂移抛 `layout_changed`） | 复用三个来源的列表协议、节奏与 UA；新的写入端（§6）不再调用 `ingestVersioned`；超时改为按剩余预算 |
| 采集夹具 | `src/lib/research/ingest/__fixtures__/collectors/`：`edgar-submissions-1321655.json`、`edgar-8k-pltr-20260803.htm`、`cninfo-topsearch-600570.json`、`cninfo-his-600570.json`、`hkex-prefix-0268.js`、`hkex-titlesearch-0268.html`（含 `2026090300863_c.pdf` 等三个 PDF 链接）、`hkex-empty-0268.html` | 列表层测试直接复用；新增抽取层夹具（§11） |
| 写入与版本 | `collectors/write.ts::ingestVersioned`：按 `(user_id, url)` 查旧行，`content_hash` 相同为重复，否则 `source_version = max + 1` | 版本语义沿用到 `(source, source_ref)` 粒度，分配改在数据库函数内完成 |
| 脚本 | `scripts/research-collect.ts`：`RESEARCH_OWNER_USER_ID` 必填，service-role ctx，范围 = `listEntityKeys` 的 `in_scope` 公司 | 保留；新增 `scripts/documents/*` |
| 发行人 | `issuers(issuer_id, cik, cninfo_org_id, hkex_stock_code_primary ~ '^[0-9]{5}$', status)`；`issuer_securities(ticker, is_primary, valid_from, valid_to)`；`research_entity_keys.issuer_id`；`resolveIssuer(client, {ticker|cik|…}, {today})`（`src/lib/entities/resolve.ts`）；`successCacheControl(now)` 返回 `public, s-maxage=…, stale-while-revalidate=600` | 文档只挂 `issuer_id`；港股范围用 `hkex_stock_code_primary`；只有匿名可见的公共响应才用 `successCacheControl` |
| 质量设施 | `ingest_batches`（六计数器、`INFO_CODES=['skipped_summary','relink']`；`batchStatusFromCounts`：有非信息错误时 `landed>0 ? 'partial' : 'failed'`，只有隔离不降级）、`dq_quarantine`（同键 open 唯一，`quarantine()` 已存在时返回旧项且不更新 payload）、`dq_freshness`（连续两次失败才 `error`）、`rules.ts`（`identityRule/rangeRule/jumpRule/unitRule` 不抛异常；只接受 `number`，字符串返回 `not_a_number`） | 复用；批次状态一律由 `batchStatusFromCounts` 得出（§10）；规则输入按 §7.6 显式转换 |
| 审计日志 | `research_audit_log(user_id not null, actor, action, object_type not null, object_id uuid, detail jsonb)`；`src/lib/research/store.ts::audit(ctx, action, objectId, detail)` 以 `action` 的点前缀作 `object_type`，失败抛错 | 私有文档访问日志用它（§8.2） |
| 存储 | 唯一私有桶 `security-snapshots`（`file_size_limit 52428800`，`allowed_mime_types ['application/json']`，迁移内 `insert into storage.buckets … on conflict (id) do update`）；上传代码 `src/lib/securities/sync/writer.ts`（`client.storage.from(...).upload(path, body, {contentType, upsert:true})`）；规格二将新建 `disclosure-raw`（仅 JSON） | 新建 `disclosure-docs` 桶（PDF/HTML/XML/JSON），`upsert:false`；SDK 对重复上传的错误形态与签名 URL 行为**未在本仓库核对**（§15 问题 6），F3-0 冒烟记录 |
| 数据库访问 | `TableClient`（`src/lib/db/table-client.ts`：select/insert/update、`gte/lt`、单列排序、`select` 单页 ≤ 1000、`selectAll` 分页；无 delete/rpc/事务） | 批次/隔离/新鲜度继续用它；文档库定义自己的 `DocumentsDb`（§4.11），每个读方法都有显式分页或显式"完整读"实现 |
| 测试数据库 | `scripts/ci/research-db.ts` 起本地 PostgreSQL 17（`scripts/s4/local-db.ts` 创建 `anon/authenticated/service_role` 角色与桩 `storage.buckets` 表）；含 `S4_TEST_STATE` 的测试必须列入 `scripts/ci/research-checks.ts::criticalSuites`；本地库**没有** Supabase Storage 服务也没有 PostgREST（`max_rows` 截断只在真实 Supabase 上发生） | 桶操作走 `ObjectStore` 接口，集成测试用内存实现；分页契约按 §9 的游标设计，以 > 1000 行的夹具在内存/`pg` 实现上测游标，真实截断行为在 F3-3 的真实库核对中记录 |
| 迁移门禁 | `scripts/ci/research-checks.ts::migrationInventory`：未锁定的迁移文件若时间戳 `<= maxLocked` 抛 `Non-append migration` | 本规格的时间戳必须晚于**合并时**已锁的最大值（§12 合并顺序） |
| 依赖 | `package.json` 无任何 PDF 库；`scripts/*.py` 仅三个用 reportlab 写 PDF 的一次性脚本，无 `requirements*`/`pyproject`；CI 为 Node（`node-version-file: package.json`，`>=22.19.0 <23`）+ PostgreSQL 17；Vercel 运行时 Node，`maxDuration=300`，region `hnd1`；`next.config.mjs` 无 PDF 相关配置 | 不引入 Python 路径；新增 `pdfjs-dist`（§7.1，owner 决策 D） |
| cron | `src/app/api/cron/securities-sync/route.ts`：`CRON_SECRET` Bearer + `timingSafeEqual`，`force-dynamic`，`maxDuration=300`；`vercel.json` 六条日频 cron（`0 0`、`30 0`、`30 1`、`15 16`、`30 21`、`30 0`） | 同法；新增五条（§6.3） |
| 管理 | `requireAdminUser()`（`src/lib/admin/auth.ts`）；`POST /api/admin/dq/quarantine/[id]`（JSON 内容类型、Origin 校验、`research_audit_log`）；`getServerSupabase()`（`src/lib/supabase/server.ts`）会话客户端 | 同法 |
| LLM | `src/lib/llm/`（`openai-compat.ts::chat/toolChat`、`anthropic-compat.ts`、registry 快照、计量） | 只作候选抽取器的调用通道（§7.8）；本规格不实现调用 |
| 规格二（第 8 稿，未落地） | 写入模型 = 同步运行：`claimLease → beginRun → stageFilings → stageFacts → quarantineFacts → publishRun(manifest) → releaseLease`，全部为带租约校验的 `security definer` 函数；`abandon_sync_run`/`begin_sync_run` 会**删除**未发布运行的事实行；`stage_facts(run, rows jsonb) → int`（不返回 id）；`service_role` 对事实层表无直接写，唯一例外是 `filings.document_ref/document_url/link_attempts` 列级 update；`financial_facts` 有 `market` 列、无 `source` 列（来源在 `filings.source`）；重复规划按 K + filing + `mapping_gen`，同日冲突由规划器（`planFactWrites` + `openConflicts`）构造；`filings.mapping_gen` 按 filing 单调（`publishRun` 校验 `filings.mapping_gen > run.mapping_gen → mapping_gen_regression`）；枚举只含 `US/CN`；`raw_hash` 指向桶内快照；`read_facts(p_market, …)` 信封含 `state_rev`；`materialize(issuer, market)`；`/api/facts` 的 `market` 由 ticker 后缀决定（`.SH/.SZ/.BJ` → CN，否则 US） | 港股事实经同一运行模型写入（§7.7）；枚举加法、`primary_document_id`、`stage_facts` 返回 id、ticker 路由与派生口径列入 §16 |
| 迁移 | 最新已锁 `20261105091000_issuers.sql`；规格二占 `20261106090000_financial_facts.sql`；`database.types.ts` 手工维护 | 本规格两个迁移，默认时间戳 `20261106100000_disclosure_documents.sql`（无 SQL 依赖）、`20261106110000_fact_citations.sql`（依赖规格二落地）；合并顺序改变时按 §12 重新分配 |
| 环境 | 本机无 `EDGAR_USER_AGENT`；生产有 `CRON_SECRET`、`SUPABASE_SERVICE_ROLE_KEY` | 采集夹具录制与首轮真实运行需 owner 配 UA（§14） |

---

## 3. 存储决策：新建全局 `disclosure_documents`，不泛化 `research_source_documents`

从 §2 核对的代码得出四条不可绕过的事实：

1. **租户边界写在约束里。** `user_id not null references auth.users`、`unique (user_id, content_hash)`、`research_source_owner_id(user_id, id)` 唯一索引、`research_source_entity_alignments` 的 `(user_id, source_id)` 外键、S4 限制性策略 `s4_controlled_copy` 与 `research_s4_source_visible(user_id, id)`。让 `user_id` 可空会同时破坏四处；而"用一个系统用户持有全局文档"会把全站共享来源伪装成某个账号的私有材料（REPORT.md §8 已明确告诫）。
2. **它是文本库，不是文件库。** 只有 `raw_text`，EDGAR 文本在 200,000 字符处截断，巨潮/HKEX 只写标题与元数据行；没有字节、没有页。总纲要求"源文件、页码"，这需要原件与页结构。
3. **不可变性方向相反。** 现有触发器把 `raw_text/url/available_at/source_version` 定为不可变，适合 append-only 文本；文档管道需要同一行上的处理状态迁移（`stored → extracted`）与当前抽取版本指针。
4. **实体体系不同。** `entity_ids` 指向按用户的 `research_entities`；总纲与规格一/二都以 `issuers.issuer_id` 为公共主键。

因此：**新建** `disclosure_documents` 及其子表（§4），`issuer_id` 挂接，写入只经 `security definer` 函数（与规格二同一纪律），公共元数据按 RLS 只读。现有三个采集器与 `research_source_documents` 保持不变（Research OS 仍是 owner 的私有工作台）；两者的桥接不在本规格。新采集器复用 `shared.ts` 的客户端与节奏代码，但不复用其写入函数。

与规格二 `filings` 的关系：`filings` 是"一次申报"（事实的挂接点），`disclosure_documents` 是"一个文件"。一次申报可有多个文件（主文档、索引、XBRL 实例），一个文件也可能不对应任何 `filings` 行（8-K、普通公告）。两者通过 §4.9 的 `filings.primary_document_id`（依赖规格二落地）与 `disclosure_documents.filing_source_ref`（本规格自有）互指，不互相嵌套。

---

## 4. 数据模型

迁移一 `supabase/migrations/20261106100000_disclosure_documents.sql`、迁移二 `20261106110000_fact_citations.sql`（§4.9，要求规格二迁移已应用；时间戳按 §12 合并顺序可重新分配）；两者可重放（`create table if not exists`、`drop policy if exists` 后 `create policy`、函数 `create or replace`、约束 `drop constraint if exists` 后 `add constraint`、桶 `on conflict do update`），补 `migrations.lock.json`，`database.types.ts` 手工补 Row 类型。所有新表显式 `revoke all from public, anon, authenticated, service_role` 后按 §4.12 授权——**`service_role` 对下列表不开放直接 insert/update/delete**：`disclosure_documents`、`document_assets`、`document_extractions`、`document_pages`、`document_citations`、`extraction_candidates`、`candidate_publications`、`document_sync_scope`、`fact_citations`（删除只经级联）；写只经 §4.8 的函数。`extraction_approvals` 由 service_role 直接 insert 与 `update(revoked_at)`（审批记录不改变任何可见性）。

### 4.1 `disclosure_documents`

```
document_id            uuid primary key                       -- 函数内生成
issuer_id              uuid references issuers(issuer_id) on delete restrict   -- 官方披露必填；上传可空（§8.3）
source                 text not null check (source in ('edgar','cninfo','hkexnews','upload'))
market                 text not null check (market in ('US','CN','HK','other'))
source_ref             text not null                          -- §5.1
source_version         int not null check (source_version >= 1)
supersedes_document_id uuid references disclosure_documents(document_id) on delete restrict
observed_replacement   boolean not null default false         -- §5.2
form_type              text                                   -- 来源原样：EDGAR form；巨潮 adjunctType/分类；HKEX headline
doc_class              text not null check (doc_class in ('annual_report','interim_report','quarterly_report','results_announcement','current_report','registration','proxy','ownership','other'))
classifier_gen         int not null                           -- §5.4
title                  text not null
language               text check (language in ('zh','en'))   -- HKEX 由文件标识后缀 _c/_e；巨潮 zh；EDGAR en；上传 null
source_url             text                                   -- 官方原始链接；上传为 null
content_sha256         text not null check (content_sha256 ~ '^[0-9a-f]{64}$')
bytes                  bigint not null check (bytes > 0)
mime                   text not null check (mime in ('application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'))
storage_path           text not null                          -- `blobs/{sha256}.{ext}`（内容寻址，不含来源与发行人）
acquisition            jsonb not null check (jsonb_typeof(acquisition) = 'object')   -- 本行自己的获取记录：{fetched_at, http_status, content_type, content_length, etag, last_modified, user_agent}；上传：{uploaded_at, filename}
published_at           timestamptz not null                   -- 来源给出的发布时间（§5.2）
published_at_precision text not null check (published_at_precision in ('instant','date'))
available_at           timestamptz not null                   -- 这些字节可被观察到的最早时刻（§5.2）
available_date         date not null
fiscal_year            int
fiscal_period          text check (fiscal_period in ('FY','H1','Q1','Q3'))
period_end             date
filing_source_ref      text                                   -- 规格二 filings.source_ref 的值（EDGAR accn；HK: §4.9），无则 null
permission             text not null check (permission in ('public','licensed','private'))
owner_user_id          uuid references auth.users(id) on delete restrict
license_ref            text
status                 text not null default 'stored' check (status in ('stored','extracted','no_text_layer','extract_failed'))
current_extraction_id  uuid                                   -- 外键在 §4.3 之后添加
extract_lease_until    timestamptz
extract_lease_batch_id uuid references ingest_batches(batch_id) on delete set null
extract_attempts       int not null default 0                 -- 只在 claim 时 +1（§4.8）
batch_id               uuid not null references ingest_batches(batch_id) on delete restrict
code_version           text not null
created_at             timestamptz not null default now()
constraint dd_owner_iff_private check ((permission = 'public') = (owner_user_id is null))
constraint dd_issuer_required check (permission <> 'public' or issuer_id is not null)
constraint dd_upload_shape check ((source = 'upload') = (source_url is null))
constraint dd_extracted_fields check (status not in ('extracted','no_text_layer') or current_extraction_id is not null)
constraint dd_replacement_version check (observed_replacement = false or source_version > 1)
unique (source, source_ref, source_version)
unique (source, source_ref, content_sha256)
index (issuer_id, available_date, source, source_ref, source_version desc)
index (issuer_id, doc_class, period_end desc)
index (status, created_at) where status = 'stored'
index (content_sha256)
index (owner_user_id) where owner_user_id is not null
```

- 触发器 `disclosure_documents_limited_update`：`update` 只允许改 `status/current_extraction_id/extract_lease_until/extract_lease_batch_id/extract_attempts/doc_class/classifier_gen/fiscal_year/fiscal_period/period_end/filing_source_ref`；其余列变化抛 `23514`（`append_only:disclosure_documents`）；`status` 允许迁移 `stored→extracted|no_text_layer|extract_failed`、`extract_failed|no_text_layer|extracted→stored`（只经 `request_document_extract`）；`delete` 禁止。
- 公共读取视图 `disclosure_documents_public`：`create view … with (security_invoker = true) as select <列，不含 owner_user_id/license_ref/extract_lease_*> from disclosure_documents where permission = 'public'`。视图只给公共读；"最新版本"的选择不在视图里做，而在 `read_documents` 函数里按 as-of 做（§4.8），因为"最新"取决于时点（§5.3）。

### 4.2 `document_assets`

一次申报的附属文件（EDGAR 申报索引 JSON、XBRL 实例；巨潮/HKEX 暂无）。与主文档在同一函数调用内写入（§4.8 `insert_document_version`），不存在"有文档无资产"的中间态。

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
acquisition     jsonb not null check (jsonb_typeof(acquisition) = 'object')
created_at      timestamptz not null default now()
unique (document_id, role, filename)
```

### 4.3 `document_extractions`（不可变抽取版本）

```
extraction_id       uuid primary key
document_id         uuid not null references disclosure_documents(document_id) on delete restrict
extractor_version   text not null                 -- §7.2 EXTRACTOR_VERSION
table_algo_version  text not null
code_version        text not null
has_text_layer      boolean not null
page_count          int not null check (page_count >= 0)
pages_json_path     text not null                 -- `extractions/{content_sha256}/{pages_json_sha256}.pages.json`
pages_json_sha256   text not null check (pages_json_sha256 ~ '^[0-9a-f]{64}$')
candidates_role     text not null check (candidates_role in ('none','primary','comparison'))   -- §7.3：primary = 中文港股定期报告；comparison = 其英文版
candidates_status   text not null default 'n/a' check (candidates_status in ('n/a','pending','done','failed','exhausted'))
candidates_attempts int not null default 0        -- 只在 claim 时 +1
candidates_lease_until timestamptz
candidates_lease_batch_id uuid references ingest_batches(batch_id) on delete set null
batch_id            uuid not null references ingest_batches(batch_id) on delete restrict
created_at          timestamptz not null default now()
unique (document_id, extractor_version, table_algo_version)
unique (document_id, extraction_id)
constraint de_role_status check ((candidates_role = 'none') = (candidates_status = 'n/a'))
```

`disclosure_documents.current_extraction_id` 的外键在本表之后 `alter table … add constraint … foreign key (current_extraction_id, document_id) references document_extractions(extraction_id, document_id)`。触发器：`update` 只允许改 `candidates_status/candidates_attempts/candidates_lease_*`；`delete` 禁止。同一 `(document, extractor_version, table_algo_version)` 只有一个版本：同版本"重处理"不产生新版本（§4.8 `request_document_extract` 的规则）。

### 4.4 `document_pages`（不可变）

```
extraction_id uuid not null references document_extractions(extraction_id) on delete restrict
page_no       int not null check (page_no >= 1)
text          text not null                 -- §7.2 规范化文本；空页为 ''
text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$')   -- sha256(utf8(text))
char_count    int not null check (char_count >= 0)   -- Unicode 码点数 = PostgreSQL length(text)
width         numeric
height        numeric
line_count    int not null check (line_count >= 0)
has_tables    boolean not null default false
primary key (extraction_id, page_no)
```

触发器禁止 `update` 与 `delete`。**坐标系**：所有字符偏移（本表 `char_count`、`pages.json` 的行/单元格偏移、`document_citations.char_start/char_end`）都是 **Unicode 码点**偏移，与 PostgreSQL 的 `length/substr`（UTF-8 下按字符计）一致；JS 侧用 `Array.from(text)` 得到码点数组后计算，绝不使用 `String.prototype.slice` 的 UTF-16 索引（§7.2、§11.1 含增补平面汉字与 emoji 夹具）。

### 4.5 `document_citations`

任何模块引用文档中一处位置时写一行。引用永不删除。

```
citation_id   uuid primary key
document_id   uuid not null references disclosure_documents(document_id) on delete restrict
extraction_id uuid not null
page_no       int not null
char_start    int not null check (char_start >= 0)            -- 码点偏移
char_end      int not null check (char_end > char_start)
bbox          jsonb check (bbox is null or jsonb_typeof(bbox) = 'object')   -- {x0,y0,x1,y1}，pt，原点左下（pdf.js 约定）；HTML 为 null
snippet       text not null                 -- 创建时 substr(text, char_start+1, char_end-char_start)
text_hash     text not null
visibility    text not null default 'internal' check (visibility in ('internal','public'))   -- 只对 created_by in ('human','module') 的引用有意义（§4.12）
created_by    text not null check (created_by in ('extractor','human','llm','module'))
created_ref   text not null
created_at    timestamptz not null default now()
foreign key (extraction_id, page_no) references document_pages(extraction_id, page_no) on delete restrict
foreign key (document_id, extraction_id) references document_extractions(document_id, extraction_id) on delete restrict
index (document_id, page_no)
index (extraction_id)
```

- 插入只经 `insert_citation`（§4.8，校验越界与片段一致）；触发器：`update` 只允许 `visibility internal→public`（只经 `publish_citations`，且只对 `created_by in ('human','module')` 的行）；`delete` 禁止。
- **可见性规则**（§4.12）：引用对公共读者可见当且仅当文档 `permission='public'` 且（`visibility='public'` 或 存在一条 `fact_citations` 指向它且其事实 `status='ok'`）。抽取器/LLM 创建的引用因此只随事实发布而可见，不需要也不允许单独"公开"；人工/模块创建的引用由其发布动作公开。
- 读取时 `integrity`：重算当前 `document_pages(extraction_id, page_no)` 的 `text_hash` 与 `substr` 等于记录值 → `'ok'`，否则 `'corrupt'`（页表不可变，`corrupt` 只可能来自存储损坏，告警级）；`currentExtraction = (extraction_id = disclosure_documents.current_extraction_id)`。

### 4.6 `extraction_candidates` 与 `candidate_publications`

```
extraction_candidates
  candidate_id     uuid primary key
  document_id      uuid not null
  extraction_id    uuid not null
  kind             text not null check (kind in ('financial_fact','table_cell','field'))
  extractor_kind   text not null check (extractor_kind in ('rule','llm'))
  extractor_ref    text not null               -- rule: `hk-facts/<HK_LABEL_GEN>/<HK_RULES_VERSION>`；llm: `<model_id>@<prompt_version>`
  natural_key      text not null               -- financial_fact: `<concept>:<period_start|''>:<period_end>:<duration>:<unit>`
  citations        jsonb not null check (jsonb_typeof(citations) = 'object')
    -- financial_fact: {value: id, label: id, unit: id, period: [{role:'statement_title'|'column_header', citation_id}]}（§7.5）；field/table_cell 至少含 value
  payload          jsonb not null check (jsonb_typeof(payload) = 'object')
    -- financial_fact: {concept, statement, period_start, period_end, duration, value: string（十进制字符串，已换算、已规范符号）, presented: string, unit, scale: string（'1'|'0.01'|'1000'|'1000000'）, sign_flip: boolean, period_derivation: {rule, title_date, column_text}, consolidation}
  fingerprint      text not null               -- sha256(canonical json of {natural_key, payload, 四个引用的 snippet})，决定继承用（§7.3）
  checks           jsonb not null default '[]' check (jsonb_typeof(checks) = 'array')   -- [{check, blocking, passed, detail}]
  checks_passed    boolean not null default false   -- 全部 blocking 检查通过
  status           text not null default 'candidate' check (status in ('candidate','confirmed','rejected','promoted'))
  decision_kind    text check (decision_kind in ('human','auto'))
  decided_by       uuid references auth.users(id)
  approval_id      uuid references extraction_approvals(approval_id)
  decided_at       timestamptz
  inherited_from   uuid references extraction_candidates(candidate_id)   -- 决定继承来源（仅人工决定可继承）
  input_snapshot   jsonb not null check (jsonb_typeof(input_snapshot) = 'object')   -- {content_sha256, pages_json_sha256, page_nos, extractor_version, table_algo_version, code_version, hk_label_gen, hk_rules_version}；版本比对一律以 document_extractions 行为准（§4.8 decide_candidate），快照只作记录
  batch_id         uuid not null references ingest_batches(batch_id) on delete restrict
  created_at       timestamptz not null default now()
  foreign key (document_id, extraction_id) references document_extractions(document_id, extraction_id) on delete restrict   -- 候选的文档与抽取版本一致
  constraint ec_decision_shape check (
    (status = 'candidate' and decision_kind is null and decided_by is null and approval_id is null and decided_at is null)
    or (status in ('confirmed','rejected','promoted') and decided_at is not null and
        ((decision_kind = 'human' and decided_by is not null and approval_id is null)
         or (decision_kind = 'auto' and decided_by is null and approval_id is not null and inherited_from is null and status <> 'rejected'))))
  unique (extraction_id, kind, extractor_ref, natural_key)
  index (document_id, status)
  index (status, created_at) where status in ('candidate','confirmed')

candidate_publications                        -- 候选 × 发布代 的关联（一个候选可在多个 HK_PUB_GEN 下各有一次发布）
  candidate_id   uuid not null references extraction_candidates(candidate_id) on delete restrict
  pub_gen        int not null                   -- §7.7 HK_PUB_GEN
  run_id         uuid not null                  -- 规格二 fact_sync_runs.run_id
  fact_id        uuid not null                  -- 该发布代下该候选对应的事实（新暂存的或已存在的重复行）
  state          text not null check (state in ('staged','published','abandoned'))
  created_at     timestamptz not null default now()
  updated_at     timestamptz not null default now()
  primary key (candidate_id, pub_gen)
  index (run_id)
```

状态语义：`promoted` = 至少有一条 `candidate_publications.state='published'`；`confirmed` 的候选可反复进入新的发布代。发布行的迁移：`staged→published`（其事实 `ok` 且所属运行 `published`）、`staged→abandoned`（运行废弃）、`abandoned→staged`（新运行重新暂存：同一主键行被**更新**为新的 `run_id/fact_id`，`updated_at` 刷新）；`staged` 的行在运行已发布但事实 `quarantined` 时**保持 `staged`**，直到事实被提升为 `ok`。生命周期只经 §4.8 的候选函数。

### 4.7 `extraction_approvals` 与 `document_sync_scope`

```
extraction_approvals
  approval_id      uuid primary key
  extractor_ref    text not null               -- 与候选 extractor_ref 完全相等才生效
  extractor_version text not null
  table_algo_version text not null
  code_version     text not null
  concepts         text[] not null
  gold_sha256      text not null
  precision        numeric not null check (precision between 0 and 1)
  recall           numeric not null check (recall between 0 and 1)
  report_path      text not null
  approved_by      uuid not null references auth.users(id)
  approved_at      timestamptz not null default now()
  revoked_at       timestamptz
  constraint ea_threshold check (precision >= 0.95 and recall >= 0.95)   -- 总纲 §3.5 的门槛（精确率与召回率同时）
```

```
document_sync_scope
  issuer_id        uuid not null references issuers(issuer_id) on delete cascade
  source           text not null check (source in ('edgar','cninfo','hkexnews'))
  reasons          jsonb not null default '[]'
  priority         int not null default 0
  fetch_key        text not null                 -- edgar: 10 位 CIK；cninfo: '<code>,<orgId>'（orgId 未知时 '<code>,'）；hkexnews: 5 位股份代号
  backfill_cursor  jsonb not null default '{}'   -- §6.1：{segment, index, item_attempts}
  backfill_done    boolean not null default false
  poll_cursor      jsonb not null default '{}'   -- §6.1：{segment, index, item_attempts}（轮询模式）
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

### 4.8 变更清单与 SQL 函数

全部 `language plpgsql security definer set search_path = public`；`revoke execute from public, anon, authenticated`；`grant execute to service_role`（`read_documents` 例外：`security invoker`，授予 anon/authenticated/service_role）。**每个会改变行的函数都在下表写明它的锁与授权来源**；没有"所有函数都需要同步租约"这样的总则。

| 函数 | 锁 / 授权来源 | 作用 |
|---|---|---|
| `reconcile_document_sync_scope(p_source, p_rows jsonb)` → int | 无（调度输入） | `insert … on conflict (issuer_id, source) do update set reasons, priority, fetch_key, updated_at`；不动游标、调度与租约列 |
| `claim_document_sync_lease(p_issuer, p_source, p_batch, p_ttl)` → bool | scope 行 `for update` | 未租 / 过期 / 同批次续租 → true |
| `insert_document_version(p_issuer, p_source, p_batch, p_doc jsonb, p_assets jsonb)` → jsonb | scope 行锁 + 同步租约校验（`lease_batch_id = p_batch and lease_until > now()`，否则 `raise 'lease_lost' using errcode='55P03'`） | 一个事务内：按 `(source, source_ref)` 读现有版本；存在同 `content_sha256` → `{outcome:'duplicate', document_id}`，不写；否则分配 `source_version = max + 1`、`supersedes_document_id`、`observed_replacement = (max > 0)`，插入文档与全部资产；返回 `{outcome:'inserted'|'versioned', document_id}` |
| `insert_upload_document(p_owner, p_doc jsonb)` → jsonb | `pg_advisory_xact_lock(hashtext('upload:' || p_owner))` | `source_ref = '<owner>/<sha256>'`；同 owner 同哈希 → `duplicate`；插入 `permission='licensed'|'private'`，`issuer_id` 可空 |
| `advance_document_cursor(p_issuer, p_source, p_batch, p_mode, p_cursor jsonb, p_done bool)` | scope 行锁 + 同步租约 | `p_mode='backfill'` 写 `backfill_cursor/backfill_done`；`'poll'` 写 `poll_cursor` |
| `release_document_sync_lease(p_issuer, p_source, p_batch, p_outcome, p_next_due)` | scope 行锁；持有者才能释放 | 写 `last_*`、`next_due_at`，清租约 |
| `reclassify_document(p_document, p_patch jsonb, p_actor uuid)` | 文档行 `for update`；管理员（路由已 `requireAdminUser`） | 只改 `doc_class/classifier_gen/fiscal_year/fiscal_period/period_end/filing_source_ref`；写审计由路由完成 |
| `claim_document_extract_lease(p_document, p_batch, p_ttl)` → bool | 文档行 `for update` | 要求 `status='stored'` 且（未租 / 过期 / 同批次）；若 `extract_attempts >= 3` → 置 `status='extract_failed'`、清租约、返回 false（第三次崩溃的行由此收尾）；否则设租约，**`extract_attempts + 1`**（唯一的计数点；崩溃也被计入），返回 true。`storedDue` **不**按 attempts 过滤，只按 `status='stored'` 与租约空/过期选取，让本函数完成终态转换 |
| `finish_document_extract(p_document, p_batch, p_extraction jsonb, p_pages jsonb)` → uuid | 文档行锁 + 抽取租约校验（`extract_lease_batch_id = p_batch and extract_lease_until > now()`） | 插入 `document_extractions`（`candidates_role/candidates_status` 按 §7.3 规则在函数内判定）与全部 `document_pages`；`status = 'extracted'|'no_text_layer'`，`current_extraction_id` 指向新版本；清租约；返回 `extraction_id`。无任何删除 |
| `fail_document_extract(p_document, p_batch, p_code)` | 文档行锁 + 抽取租约 | `extract_attempts >= 3` → `status='extract_failed'`；清租约（不再计数） |
| `request_document_extract(p_document, p_actor uuid)` | 文档行锁；管理员 | 若已存在 `(document, EXTRACTOR_VERSION, TABLE_ALGO_VERSION)` 的版本 → `raise 'revision_exists'`（同版本重跑没有意义：版本不可变）；否则 `extracted|no_text_layer|extract_failed → stored`，`extract_attempts = 0` |
| `claim_candidates_lease(p_extraction, p_batch, p_ttl)` → bool | 抽取版本行 `for update` | 要求 `candidates_status in ('pending','failed')` 且（未租 / 过期 / 同批次）；若 `candidates_attempts >= 3` → 置 `exhausted`、清租约、返回 false（第三次崩溃的行由此收尾）；否则设租约，`candidates_attempts + 1`，返回 true。`candidatesDue` 不按 attempts 过滤 |
| `write_candidate_checks(p_extraction, p_batch, p_rows jsonb)` → jsonb | 抽取版本行锁 + 候选租约 + 每个候选行 `for update` | （R4-4 修法）对本版本 `status='candidate'` 的行：先持久化新算出的 `checks/checks_passed`（`p_rows = [{candidate_id, checks, checks_passed}]`）；对 `checks_passed=true` 的行，随后执行同文档、`fingerprint` 相同、`decision_kind='human'`、`status in ('confirmed','promoted')` 的人工决定继承查找，有则在同一语句内原子套用继承确认：`status='confirmed'`、`decision_kind='human'`、`decided_by = 旧.decided_by`、`decided_at = now()`、`inherited_from = 旧.candidate_id`；检查失败的行保持 `candidate`。已决定的行不可改（`raise 'decided'`）。这是 `checks` 列唯一的写入路径；返回 `{written, inherited}` |
| `finish_candidates(p_extraction, p_batch, p_status)` | 抽取版本行锁 + 候选租约 | `pending|failed → done|failed`；清租约 |
| `request_candidates_regen(p_filter jsonb, p_actor uuid)` → int | 抽取版本行锁；管理员/脚本 | 把满足 §7.3 资格（`candidates_role <> 'none'` 且 `extraction_id = 所属文档 current_extraction_id`）且 `candidates_status in ('done','failed','exhausted')` 的版本置 `pending`、`candidates_attempts = 0`；`p_filter` 限定来源/发行人/文档 |
| `insert_citation(p_row jsonb)` → uuid | 无锁（页不可变） | 校验 `char_end <= char_count`、`snippet = substr(text, char_start+1, char_end-char_start)`、`text_hash` 一致；插入 |
| `publish_citations(p_ids uuid[])` → int | 无 | 只对 `created_by in ('human','module')` 且文档 `permission='public'` 的行 `visibility internal→public`；否则 `raise 'not_publishable'` |
| `insert_candidates(p_extraction, p_batch, p_rows jsonb)` → jsonb | 抽取版本行锁 + 候选租约 | 校验每行引用的每个 `citation_id` 存在且 `extraction_id = p_extraction`，`document_id` 等于版本所属文档；`insert … on conflict (extraction_id, kind, extractor_ref, natural_key) do nothing`；（R4-4 修法）**每个新行一律以 `candidate` 插入，决定字段为空，本函数不套用任何继承**——人工决定的继承由 `write_candidate_checks` 在检查通过后原子套用（自动决定永不继承）；返回 `{inserted}` |
| `decide_candidate(p_candidate, p_decision jsonb)` → jsonb | 候选行 `for update` | `{kind:'human', decided_by, status:'confirmed'|'rejected'|'candidate'}`：`candidate→confirmed` 要求 `checks_passed`（否则 `raise 'not_eligible'`）；`candidate→rejected`；`confirmed→candidate` 要求无 `candidate_publications` 行；`{kind:'auto', approval_id}`：要求 `status='candidate' and extractor_kind='rule' and checks_passed`、审批行未撤销、`approval.extractor_ref = candidate.extractor_ref`，且 `approval.extractor_version/table_algo_version/code_version` 与候选所属 **`document_extractions` 行**（经 `extraction_id` 连接）的三列完全相等、`payload->>'concept' = any(concepts)` → `confirmed` |
| `stage_candidate_publication(p_candidate, p_pub_gen, p_run, p_fact_id)` | 候选行锁 | 要求 `status in ('confirmed','promoted')`；本候选在 `p_pub_gen` 下：无行 → 插入 `staged`；`abandoned` → 更新为 `staged`（新 `run_id/fact_id`）；`staged|published` → `raise 'already_staged'`（调用方按 §7.7 的筛选规则不会走到这里）；自动决定的候选再校验其审批行仍未撤销（否则 `raise 'approval_revoked'`，候选回 `candidate`） |
| `finish_candidate_publications(p_run)` → jsonb | 候选行锁（批量；迁移二，因需读 `financial_facts`） | 要求该运行 `fact_sync_runs.status='published'`；对本运行每条 `staged` 行**逐条判定**：其 `fact_id` 的事实 `status='ok'` → `published`，候选 `confirmed→promoted`；事实 `quarantined` → 保持 `staged`；事实不存在 → `abandoned`。返回 `{published, still_staged, abandoned}`。同一函数用于正常完成与崩溃恢复（幂等） |
| `abandon_candidate_publications(p_run)` → int | 同上 | 本运行全部 `staged → abandoned`（候选状态不变） |
| `publish_hk_run(p_issuer, p_batch, p_run, p_manifest uuid[])` → int | 迁移二；（R4-2 修法）锁契约：**在证据校验之前，先锁该发行人/HK 的 `fact_sync_scope` 行 `FOR UPDATE`，校验当前批次租约有效且 `p_run` 属于本发行人、本市场且状态为 `staged`；然后锁本运行或 manifest 引用的全部 `filings`（按 `filing_id` 排序）`FOR UPDATE`；再锁这些 filing 引用的 `disclosure_documents` 行（按 `document_id` 排序）`FOR UPDATE`。只有在取得这些锁之后才执行证据校验，然后在不释放任何锁的情况下调用规格二 `publish_sync_run(p_run, p_manifest)`，所有锁持有到事务结束。** 校验失败则整个事务回滚，事实不发布。（R4-7 修法）发布成功时在同一事务内原子写入 `hk_materialization_due(issuer_id, run_id, set_at)`（`on conflict (issuer_id) do update`） | 这是港股事实**唯一**的发布入口（`runHkFactsSync` 不直接调用 `publishRun`），证据完整性与绑定在发布事务内被锁保护 |
| `assert_run_evidence_complete(p_run)` | 只在 `publish_hk_run` 内、取锁之后调用 | （R4-3 修法）输入谓词 **`run_id = p_run AND status IN ('staged','quarantined')`**（不是按发布行迭代）：对**该集合中的每个事实**：`fact_citations` 必须含 `value`、`label`、`unit` 各恰好一条与 `period` 至少一条；每条引用的文档 = 该事实 filing 的 `primary_document_id`，抽取版本 = 该文档 `current_extraction_id`，引用 `integrity='ok'`；且该集合中的每个事实恰有一条本运行的 `candidate_publications(staged)` 指向它；任一不满足 `raise 'evidence_incomplete'`。**隔离不豁免发布时证据校验：任一被隔离事实缺角色、绑定无效或缺发布关联都会中止整个运行的发布** |
| `clear_materialization_due(p_issuer, p_state_rev bigint)` | 迁移二；`hk_materialization_due` 行锁 | （R4-7 修法）只有当 `materialize(issuer,'HK')` 成功且其所依据的 `state_rev` 不小于标记行写入时的 `fact_state_rev` 时删除标记；否则不删（标记保持，`promotionDue` 条件 (d) 会再次选中该发行人） |
| `insert_fact_citations(p_run, p_rows jsonb)` → int | 无（迁移二） | 校验逐行条件（文档公共、文档 = filing 的 `primary_document_id`、抽取版本 = 当前、事实 `status='staged'` 且属于 `p_run`、角色集合合法）；插入 |
| `read_documents(p_issuer, p_as_of date, p_source, p_doc_class, p_from, p_to, p_cursor jsonb, p_limit int)` → jsonb | `security invoker`（RLS 生效） | 信封 `{rows, next_cursor, row_count}`：在 `available_date <= p_as_of` 的行中按 `(source, source_ref)` 取最高 `source_version`，再按 `available_date between p_from and p_to` 过滤，按 `(available_at desc, document_id desc)` 游标分页；`p_limit ≤ 1000` |

### 4.9 迁移二：`fact_citations` 与规格二表的衔接

```
fact_citations
  fact_id      uuid not null references financial_facts(fact_id) on delete cascade   -- 规格二废弃运行时删除未发布事实，证据随之级联；ok 行永不删除（规格二触发器），故已发布证据永不消失
  citation_id  uuid not null references document_citations(citation_id) on delete restrict
  role         text not null check (role in ('value','label','period','unit'))
  primary key (fact_id, role, citation_id)

alter table filings add column if not exists primary_document_id uuid references disclosure_documents(document_id) on delete restrict;

hk_materialization_due                        -- （R4-7 修法）发行人级"待物化"持久标记
  issuer_id    uuid primary key references issuers(issuer_id) on delete cascade
  run_id       uuid not null
  state_rev    bigint not null                 -- 写入时的 fact_state_rev(issuer,'HK')
  set_at       timestamptz not null default now()
```

- `hk_materialization_due` 只由 `publish_hk_run` 原子写入、只由 `clear_materialization_due` 在修订号校验通过的成功物化后删除；无角色可直接写。
- 插入只经 `insert_fact_citations`（§4.8）；触发器禁止 `update` 与非级联 `delete`（`delete` 仅当 `pg_trigger_depth() > 0`，即由 `financial_facts` 的级联触发）。
- 规格二枚举的**加法**修改（§16；若规格二在落地前自行纳入则本迁移对应语句为空操作）：`filings.market`、`financial_facts.market`、`fact_sync_runs.market`、`fact_sync_scope.market` 加 `'HK'`；`filings.source` 加 `'hkex'`；`filings.origin` 加 `'hkex'`。
- 港股 `filings`：`source='hkex'`，`origin='hkex'`，`market='HK'`，**`source_ref = 'hkex:<文件标识>:v<source_version>'`**（如 `hkex:2026090300863_c:v1`）：每个中文文档行恰好一个 filing；替换版本是另一次申报，有自己的 `available_date`（= 文档 `available_date`，替换版本为观察日，不回溯）；英文版不建 filing。`form_type = 'annual'|'semiannual'`，`period_end`、`fiscal_year/fiscal_period` 来自文档行，`document_ref = document_id`，`document_url = source_url`，`url = source_url`，`primary_document_id = document_id`。同日冲突：原版与替换版同一 `available_date` 且同 K 不同值时，由规格二的规划器构造 `same_day_conflict`（§7.7），本规格不另设规则。
- `primary_document_id` 比照规格二对 `document_ref/document_url/link_attempts` 的明示例外：`service_role` 获得该列的列级 `update`，规格二的 `filings_limited_update` 触发器把它加入允许列。回填：US 行在本规格采集到 `filing_source_ref = filings.source_ref` 的主文档时；CN 行在规格二挂接 `document_ref` 后按 `disclosure_documents(source='cninfo', source_ref=document_ref)` 反查。

### 4.10 桶 `disclosure-docs`

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disclosure-docs', 'disclosure-docs', false, 52428800,
        array['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
```

- `file_size_limit` 取现有 `security-snapshots` 的 52428800；超限文件不下载正文（先 `HEAD`/`Content-Length`，无长度则流式读到上限即停），隔离 `document_too_large`，owner 决定是否上调（§14 决策 E）。
- 路径：原件 `blobs/{sha256}.{pdf|htm|xml|json}`（对象内容只由字节决定，所以内容寻址成立）；抽取输出 `extractions/{content_sha256}/{pages_json_sha256}.pages.json`。获取元数据（URL、时间、响应头）**不放桶**，放每个文档/资产行的 `acquisition`（每次获取事件各自记录，不被"已存在"吞掉）。
- 上传 `upsert:false`；"已存在"视为成功（SDK 的具体错误形态在 F3-0 冒烟中记录，`ObjectStore.put` 把它归一为 `'exists'`）。原件上传失败 → 不调用 `insert_document_version`。对象先于行：崩溃只留下孤儿对象。
- 保留：对象永不删除（回放义务）；被 `supersedes` 的旧版本保留。桶容量是 owner 事项（§14 决策 E）：F3-1 用范围内前 20 个港股发行人的真实文件量在 runbook 记录实测字节数后再定预算。

### 4.11 数据访问契约 `src/lib/documents/db.ts` 与 `object-store.ts`

```ts
type Page<T> = {rows: T[]; nextCursor: string|null};          // 游标编码 (sort key, id)；limit ≤ 1000
export interface DocumentsDb {
  // 写（全部 rpc，与 §4.8 一一对应）
  reconcileScope; claimSyncLease; insertDocumentVersion; insertUploadDocument; advanceCursor; releaseSyncLease; reclassifyDocument;
  claimExtractLease; finishExtract; failExtract; requestExtract;
  claimCandidatesLease; finishCandidates; requestCandidatesRegen; writeCandidateChecks;
  insertCitation; publishCitations; insertCandidates; decideCandidate;
  stageCandidatePublication; finishCandidatePublications; abandonCandidatePublications; publishHkRun; insertFactCitations;
  // 读：每个方法要么分页，要么有明示上限的"完整读"
  documentVersions(source, sourceRef, opts: {cursor?, limit}): Promise<Page<DocumentRow>>;
  knownSourceRefs(issuer, source, refs: string[]): Promise<Set<string>>;          // refs 分块 ≤ 500，每块一次请求
  readDocuments(issuer, opts: {asOf, source?, docClass?, from?, to?, cursor?, limit}): Promise<Page<DocumentRow>>;   // rpc read_documents
  documentById(id): Promise<DocumentRow|null>;
  extractionsOf(documentId, opts: {cursor?, limit}): Promise<Page<ExtractionRow>>;
  pagesOf(extractionId, pageNos: number[]): Promise<PageRow[]>;                   // 显式页号，≤ 100 个
  citationById(id): Promise<CitationRow|null>; citationsByIds(ids: string[]): Promise<CitationRow[]>;   // ≤ 100
  candidatesOf(opts: {extractionId} | {status} | {issuer, status}, page: {cursor?, limit}): Promise<Page<CandidateRow>>;
  publicationsOf(opts: {candidateIds: string[]} | {runId}, page: {cursor?, limit}): Promise<Page<PublicationRow>>;   // candidateIds ≤ 100，结果按 (candidate_id, pub_gen) 游标分页
  approvalsFor(extractorRef, opts: {limit: 100}): Promise<ApprovalRow[]>;         // 超过 limit 条 → 抛 DocumentsDbError('too_many_approvals')，调用方停止自动决定
  storedDue(limit): Promise<DocumentRow[]>;          // status='stored' 且租约空/过期；不按 attempts 过滤（终态转换在 claim 内）
  candidatesDue(limit): Promise<ExtractionRow[]>;    // candidates_status in ('pending','failed') 且租约空/过期且 extraction_id = 所属文档 current_extraction_id；不按 attempts 过滤
  promotionDue(pubGen, limit): Promise<{issuerId}[]>;   // （R4-5 修法）发行人满足任一条件：(ab) 存在活动候选 status in ('confirmed','promoted') 且不存在 candidate_publications 行满足 pub_gen = pubGen and state in ('staged','published')；(c) 在 pubGen 下有 staged 行（崩溃或隔离后的恢复）；(d)（R4-7 修法）hk_materialization_due 存在该发行人的标记
  clearMaterializationDue(issuer, stateRev): Promise<boolean>;   // rpc clear_materialization_due
  scopeDue(source, now, limit): Promise<ScopeRow[]>;
}
export interface ObjectStore {
  put(path, bytes: Uint8Array, mime): Promise<'created'|'exists'>;
  get(path): Promise<Uint8Array>;
  head(path): Promise<{bytes: number}|null>;
  signedUrl(path, expiresSeconds): Promise<string>;
}
```

三种 `DocumentsDb` 实现：`supabaseDocumentsDb`（`rpc()` + 只读 `from()`，游标分页，每页 ≤ 1000 与 PostgREST `max_rows` 一致），`memoryDocumentsDb`（单测；实现租约、状态迁移、唯一键、游标），`pgDocumentsDb`（集成测试直连）。`ObjectStore` 两种：`supabaseObjectStore`、`memoryObjectStore`。所有错误以 `DocumentsDbError{code: 'lease_lost'|'not_eligible'|'revision_exists'|'evidence_incomplete'|'approval_revoked'|'not_publishable'|…}` 归一。

### 4.12 权限

| 表 / 视图 | anon / authenticated | service_role |
|---|---|---|
| `disclosure_documents` | `select`，策略 `using (permission = 'public')` | `select` |
| `disclosure_documents_public`（`security_invoker=true`，`where permission='public'`，不含敏感列） | `select` | `select` |
| `document_assets`、`document_extractions`、`document_pages` | `select`，策略 `using (exists (select 1 from disclosure_documents d where d.document_id = <表>.document_id and d.permission = 'public'))`（`document_pages` 经 `document_extractions` 连接） | `select` |
| `document_citations` | `select`，策略 `using (exists (… d.permission = 'public') and (visibility = 'public' or exists (select 1 from fact_citations fc join financial_facts f on f.fact_id = fc.fact_id where fc.citation_id = document_citations.citation_id and f.status = 'ok')))`；迁移一先建不含 `fact_citations` 子句的策略，迁移二替换为完整策略 | `select` |
| `extraction_candidates`、`candidate_publications`、`document_sync_scope` | 无 | `select` |
| `extraction_approvals` | 无 | `select, insert, update(revoked_at)` |
| `fact_citations` | `select`，策略 `using (exists (select 1 from financial_facts f where f.fact_id = fact_citations.fact_id and f.status = 'ok'))` | `select` |
| `read_documents` | 可执行（`security invoker`） | 可执行 |
| 其余函数 | 不可执行 | 可执行 |

**非公开文档对 `authenticated` 也不可见**（没有 `owner_user_id = auth.uid()` 策略）：持有人的所有读取只经服务端路由（会话校验 → service_role 读 → 写审计 → `private, no-store` 响应）。`storage.objects` 不加任何对 anon/authenticated 的策略。集成测试以真实角色直接查表与查视图验证（不只经 HTTP）。

---

## 5. 标识、时点与版本语义

### 5.1 `source_ref`（来源内稳定标识）

| source | source_ref | 说明 |
|---|---|---|
| edgar | `<accession no.>/<primaryDocument>`（如 `0001823952-26-000022/plt-20260803.htm`） | 一次申报一个主文档；索引与 XBRL 实例作 `document_assets`，`filing_source_ref = accn` |
| cninfo | `<announcementId>` | `adjunctUrl` 变化但 id 不变 → 新版本 |
| hkexnews | PDF 路径中的文件标识（`/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf` → `2026090300863_c`） | 中/英文版是两个 `_c/_e` 文件、两行、`language` 不同 |
| upload | `<owner_user_id>/<content_sha256>` | 持有人维度去重；对象共享一份；不向任何持有人返回他人的行 |

### 5.2 发布时间与可得时间

| source | `published_at` | precision | 首个版本的 `available_at` | 替换版本（`observed_replacement=true`）的 `available_at` |
|---|---|---|---|---|
| edgar | `acceptanceDateTime` | instant | = `published_at` | 不适用（EDGAR 修正是新 accession） |
| hkexnews | 标题搜索表 `release-time`（HKT） | instant | = `published_at` | 本次抓取的 `acquisition.fetched_at`（`published_at` 保留原发放时间） |
| cninfo | `announcementTime`（北京时间当日零点） | date | = `published_at` | `acquisition.fetched_at` |
| upload | 上传瞬间 | instant | = `published_at` | 不适用（新哈希 = 新 `source_ref`） |

`available_date` = `available_at` 在来源本地时区的日历日（US `America/New_York`；HK/CN/upload UTC+8）。替换版本**不回溯**：我们只知道何时看见。

### 5.3 版本与时点读取

`(source, source_ref)` 下按 `content_sha256` 判断：新哈希 → `source_version + 1`（`insert_document_version` 内原子分配）。"最新版本"是时点概念：`read_documents(p_as_of)` 先按 `available_date <= p_as_of` 过滤，再在每个 `(source, source_ref)` 内取最高版本——v1 于 1 月可得、v2 于 3 月可得时，`as_of=2 月` 返回 v1。`versions=1` 返回全部版本（分页）。

### 5.4 分类 `doc_class` 与期间字段

`src/lib/documents/classify.ts::classify(source, {form_type, title, headline, source_ref})`，`CLASSIFIER_GEN = 1`（整数，规则改动 +1；重分类经 `reclassify_document`）：

- edgar：`10-K|20-F|40-F|10-K/A|20-F/A → annual_report`；`10-Q|10-Q/A → quarterly_report`；`8-K|8-K/A|6-K → current_report`；`S-1|424B* → registration`；`DEF 14A → proxy`；`SC 13D|SC 13G → ownership`；其余 `other`。`fiscal_year/period_end` 留 null，`filing_source_ref = accn`，`language='en'`。
- cninfo：标题含 `年度报告` 且不含 `摘要|英文|更正|已取消|补充|半年` → `annual_report`；`半年度报告`（同样排除）→ `interim_report`；`第一季度报告|第三季度报告` → `quarterly_report`；`业绩快报|业绩预告` → `results_announcement`；其余 `other`。`fiscal_year` = 标题中四位年份（恰好一个时），`period_end` 按类型（12-31 / 06-30 / 03-31 / 09-30），`fiscal_period` FY/H1/Q1/Q3；`language='zh'`。
- hkexnews：`headline` 含 `年報` 或 `Annual Report` → `annual_report`；含 `中期/半年度報告` 或 `Interim Report` → `interim_report`；含 `季度報告` → `quarterly_report`；含 `業績公告|全年業績|中期業績|Results Announcement` → `results_announcement`；其余 `other`。`fiscal_year/period_end` 由标题中的"截至…年…月…日"/"for the year ended …"解析（`cnDate()`，§7.5），解析不到留 null。`language` 由 `source_ref` 后缀 `_c → zh`、`_e → en`。

---

## 6. 采集

### 6.1 共用核心 `src/lib/documents/sync.ts`

```ts
export interface SyncDeps { db: DocumentsDb; tables: TableClient; store: ObjectStore;
  list: (source, scope: ScopeRow, segment: Segment, budget: Budget) => Promise<Listed[]>;   // 一个"段"的完整列表（§6.2）
  segments: (source, scope: ScopeRow, mode: 'backfill'|'poll', sinceYear, now) => Segment[];
  fetchBytes: (url, budget: Budget, maxBytes) => Promise<{bytes, mime, status, headers, fetchedAt}|'too_large'>;
  now: () => Date; deadline: Date|null; codeVersion: string }
export interface Listed { source_ref; source_url; title; form_type; headline?; published_at; precision; assets? }
type Cursor = { segment: string|null; index: number; item_attempts: number }   // segment 内第 index 项是下一个待处理项
```

`runDocumentsSync(deps, {source, limit, issuerIds?, sinceYear, refetch, dryRun, triggeredBy})`：一个 `ingest_batches` 行（`producer='documents-sync'`，`dataset='documents.<source>'`，`tool_versions={classifier_gen, source}`，`code_version` 同规格二规则，取不到则拒绝 apply）。先 `reconcileScope(source)`（§6.4），再 `scopeDue(source, now, limit)`，逐个发行人（剩余预算 < 90 s 不再开始新发行人，回执 `deadline_hit`；`deadline = start + 240 s`，同规格二）：

1. `claimSyncLease(…, 600)`；失败 → `skipped_summary(leased)`。
2. 模式：`backfill_done=false` → `backfill`，游标 `backfill_cursor`，段 = `segments('backfill')`（§6.2，按 `sinceYear` 到今年）；`backfill_done=true` → `poll`，游标 `poll_cursor`，段 = 覆盖 `[last_success_at − 1 天, now]` 的段（重叠一个 cron 周期，cron 为日频，§6.3；不是替换检测）。
3. 从游标所在段开始：`list()` 得到该段完整有序列表（按 `published_at, source_ref` 稳定排序）；从 `index` 起逐项处理；每处理完**一项**（无论结果）即 `advanceCursor({segment, index+1, item_attempts:0})`；段末 → 下一段 `index 0`；全部段完成 → `backfill` 模式置 `backfill_done=true`，`poll` 模式清游标。
4. 每项：`knownSourceRefs` 命中且 `refetch=false` → `duplicates`，前进（不消耗 `maxPerIssuer`）；hkexnews 默认 `refetch=true`（§15 问题 2 核对后可改）。新项计数达到 `maxPerIssuer`（默认 50）→ 本发行人本次结束，游标停在该项。
5. `fetchBytes`（`maxBytes = 52428800`，超时 `min(60 s, remaining − 20 s)`，`429/503` 退避 1→2→4→8 s，预算不足停止）：`too_large` → 隔离 `document_too_large`，前进；404 → `skipped_summary(document_missing)`，前进；MIME 不符 → 隔离 `unexpected_mime`，前进；抓取/上传/必抓资产失败 → **不前进**，`item_attempts + 1`，`item_attempts >= 3` → 隔离 `document_fetch_exhausted`（payload 含 URL 与三次错误）并前进。
6. sha256 → `store.put(blobs/…)` → 资产同样抓取与上传（EDGAR：`index.json` 必抓；XBRL 实例若索引列出且 ≤ 上限则抓，否则 `skipped_summary(xbrl_skipped)`）→ `insertDocumentVersion`（文档 + 资产一次事务，`acquisition` 记本次获取）→ 按 `outcome` 计 `inserted/versioned/duplicates`。
7. `releaseSyncLease(outcome, nextDue)`：成功且 `backfill_done` → `now + 1d`；成功但回填未完 → `now`；失败 → `now + 6h`。

批次结束 `finishBatch`（状态由 `batchStatusFromCounts` 得出）；`recordAttempt('documents.<source>', {ok, cadence:'daily'})`，`ok` = 无到期发行人（心跳）或至少一个发行人 `success`。

### 6.2 来源列表适配器（`src/lib/documents/sources/`）

复用 `collectors/shared.ts::createClient` 的 UA 与节奏（edgar 120 ms、cninfo 500 ms、hkexnews 1000 ms），超时改为按预算；协议解析复用现有函数。段定义：

- `edgar.ts`：段 = `submissions` 的 `recent` 与 `filings.files[]` 中的每个历史文件（`{name, filingFrom, filingTo}`，逐个取 `https://data.sec.gov/submissions/{name}`——**形态未在本仓库核对**，F3-1 第一步用一家公司核对并录成夹具；核对前段只有 `recent`，`backfill_done` 不置 true，回执 `coverage_summary`）。表单集合默认 `['10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','8-K','8-K/A','6-K']`；`--forms` 可加。资产：`…/{accn无横线}/index.json`（`directory.item[]`），XBRL 实例 = 其中以 `_htm.xml` 结尾的项（**未核对**，§15 问题 1）。
- `cninfo.ts`：段 = 年份（`seDate = <year>-01-01~<year>-12-31`）；`list()` 内部遍历 `hisAnnouncement/query` 全部分页（`PAGE_SIZE=30`，短页即末页）得到该年完整列表；`category` 的定期报告取值**未核对**（§15 问题 4），核对前传 `''` 并用 `classify()` 过滤。默认只入库 `annual_report|interim_report|quarterly_report|results_announcement`；`--all-announcements` 关闭过滤（owner 决策 B）。仅 SH/SZ。
- `hkexnews.ts`：段 = 年份（`from/to` 按年）；标题搜索一次返回整表（现有解析），日期范围与条数上限**未核对**（§15 问题 2），F3-1 核对后若有上限则段改为更短区间。默认只入库定期报告类；中英文版都入库。

### 6.3 触发

- `GET|POST /api/cron/documents-sync?source=edgar|cninfo|hkexnews[&limit=n]`：`CRON_SECRET` Bearer（复制 `securities-sync` 的 `authorized()`）；`maxDuration=300`；默认 `limit` 25。
- `GET|POST /api/cron/documents-extract[&limit=n]`、`GET|POST /api/cron/documents-candidates[&limit=n]`：§7.3、§7.7。
- `vercel.json` 新增五条，与现有六条合计十一条（规格二的 `facts-sync` 另计）：`documents-sync?source=hkexnews` `0 16 * * *`（UTC；= 次日 00:00 HKT）；`documents-sync?source=cninfo` `20 16 * * *`；`documents-sync?source=edgar` `30 3 * * *`（UTC；EDGAR 受理截止 22:00 美东，冬令时为 03:00 UTC、夏令时为 02:00 UTC，均早于 03:30）；`documents-extract` `45 * * * *`；`documents-candidates` `25 * * * *`（避开现有 `15 16 * * *`）。每小时 cron 需要 Vercel Pro 及以上计划（Hobby 不允许小时级频率；owner 确认，§14）。
- `scripts/documents/sync.ts --source … [--issuer …] [--limit n] [--since-year y] [--forms …] [--all-announcements] [--refetch] [--apply]`：无截止；dry-run 不上传、不建批次。
- `scripts/documents/extract.ts`、`scripts/documents/candidates.ts [--regenerate --filter …]`、`scripts/documents/promote-hk.ts --issuer … [--apply]`、`scripts/documents/record-fixture.ts`（§11）。

### 6.4 范围 `src/lib/documents/scope.ts::reconcileScope(source)`

幂等；只改 `reasons/priority/fetch_key`：

- edgar：与规格二 §6.4 美股范围相同来源（三个宇宙活跃 ticker → `resolveIssuer` → 有 `cik`），`priority 10`。
- cninfo：规格二 owner 决策 A 的同一集合（默认 `research_entity_keys.in_scope and issuer_id is not null` 的发行人，当前 `is_primary and valid_to is null` 的 `.SH/.SZ` ticker；`.BJ` 不入）。
- hkexnews：`research_entity_keys.in_scope and issuer_id is not null` 且 `issuers.hkex_stock_code_primary is not null` 的发行人（owner 决策 A）。
- 不再出现的行 `reasons=[]`、`priority=0`。

---

## 7. 抽取

### 7.1 PDF 文本层：`pdfjs-dist`（新依赖，owner 决策 D）

选择依据：仓库无 PDF 库、无 Python 运行时路径、Vercel 运行时为 Node；`pdfjs-dist` 是纯 JS（Node 下用 `legacy/build/pdf.mjs`，文本抽取不需要 canvas），`getTextContent()` 给出每个文本项的变换矩阵、宽高与字符串。固定版本号在 F3-0 写入 `package.json`（取 F3-0 实施日已发布两周以上的最新 4.x）。**加载方式与内存占用未在本仓库核对**，F3-0 做 Vercel preview 冒烟，通过标准：对 `0268.HK` 的 `2026090300863_c.pdf` 与范围内页数最多的一份年报（F3-1 实测后选定）各在一次 `documents-extract` 调用内完成抽取，`page_count` 等于本机脚本给出的页数，函数未超时、无 OOM 日志；失败则抽取只在本机脚本运行、cron 只做采集（§12 降级路径）。

不选项：Docling/MinerU（Python，无运行时）、OCR（本规格不做）、`pdf-parse`（无坐标）。

### 7.2 页面抽取 `src/lib/documents/extract/`

`EXTRACTOR_VERSION = 'docs-extract/1.0'`、`TABLE_ALGO_VERSION = 'tables/1.0'`。

- `pdf.ts::extractPdf(bytes, budget) → {pages: Page[], hasTextLayer}`：逐页 `getTextContent()`；文本项按 `y`（`transform[5]`）聚类成行（同一行：`|Δy| ≤ 0.5 × 项高度`），行内按 `x` 排序，项间距 `> 1 × 空格宽`插入一个空格；行按 `y` 降序拼接，行间 `\n`。**规范化与偏移映射**：每个文本项先 NFKC，再折叠连续空白为一个空格、去首尾空白；页文本 = 行文本以 `\n` 连接；偏移以**码点**计（`Array.from`），每行记录 `{y, x0, x1, text, char_start, char_end}`，每个表格单元格记录 `{row, col, text, bbox, line_index, char_start, char_end}`（相对页文本），在拼接时直接得到，不事后搜索。空页 `text=''`。`hasTextLayer` = 至少一页有非空白文本项；全空 → `no_text_layer`（版本仍写入）。
- `tables.ts::detectTables(lines) → Table[]`：表体 = 连续的、含 ≥ 2 个"数值项"（`^\(?[-–—]?[\d,]+(\.\d+)?\)?$` 或 `^[-–—]$`）且数值项 `x` 位置在相邻行之间重合的行；列 = 数值项 `x0` 的聚类（`|Δx0| ≤ 项宽的一半`）；每行最左非数值文本为标签单元格。**表头块** = 表体上方到前一个空行（或前一个表体、或页顶）之间的全部行，原样保留（含中文数字日期、货币与倍数词、`附註/Notes`），作为 `header_lines[]` 随表记录（各带偏移）；表头的数值项（年份）不计入表体。聚类阈值在 F3-2 用录制的港股主表页校验：每张主表的列数与人工数出的列数一致才算通过，不一致则调整并记录在评测报告（§15 问题 5）。
- `html.ts::extractHtml(bytes) → Page[]`：EDGAR iXBRL/HTML 按分页标记切页：`<hr` 元素，或样式含 `page-break-before|page-break-after|break-before|break-after` 且值为 `always|page` 的元素；无标记 → 一页。每页经 `htmlToText` 同款规则（复用 `collectors/edgar.ts::htmlToText`，**去掉** 200,000 截断）后同样规范化；行 = 块级边界；偏移同样码点计。HTML 页无 bbox。
- 输出：`pages.json` = `{extractor_version, table_algo_version, code_version, content_sha256, pages:[{page_no, width, height, lines, tables:[{header_lines, cells}]}]}`，上传到 `extractions/{content_sha256}/{sha256(pages.json)}.pages.json`，然后 `finishExtract`。

### 7.3 抽取、候选与晋升的调度

- `runDocumentsExtract(deps, {limit, documentIds?, dryRun, triggeredBy})`：批次 `producer='documents-extract'`、`dataset='documents.extract'`。`storedDue(limit)`（（R4-6 修法）`status='stored'`，租约空或过期，按 `created_at` 排序；**不按 attempts 过滤**），逐文档（剩余预算 < 90 s 不再开始）：`claimExtractLease(doc, batch, 600)`（计数点）；**返回 false 则跳过本文档的抽取与后续全部写入——claim 可能已把它终态转换为 `extract_failed`** → `store.get` → `extractPdf/extractHtml`（超预算 → `failExtract(extract_timeout)`；抛错 → `failExtract(extract_error)`）→ `store.put(pages.json)`（失败 → 不调 `finishExtract`，租约到期后重试，计数已在 claim）→ `finishExtract`。`candidates_role` 在函数内判定：`market='HK' and doc_class in ('annual_report','interim_report') and has_text_layer` → `language='zh'` ? `primary` : `comparison`；否则 `none`；`role <> 'none'` → `candidates_status='pending'`。新鲜度 `recordAttempt('documents.extract', {ok, cadence:'daily'})`。
- `runDocumentsCandidates(deps, {limit, extractionIds?, dryRun, triggeredBy})`：批次 `producer='documents-candidates'`、`dataset='documents.candidates'`、`tool_versions={hk_label_gen, hk_rules_version}`。三个阶段，各受预算约束：
  1. **候选**：`candidatesDue(limit)`（§4.11；attempts 的终态转换由 `claimCandidatesLease` 完成）→ `claimCandidatesLease(…, 600)`（计数点；返回 false 则跳过）→ `store.get(pages_json_path)` → §7.5（`comparison` 版本同样产候选，只用于 §7.6 的 `en_cross_check`，永不可晋升）→ `insertCandidates`（幂等；含决定继承）→ 对本版本 `status='candidate'` 的候选跑 §7.6 检查 → `writeCandidateChecks`（唯一写入路径；已决定的行不重算）→ `finishCandidates(done)`；抛错 → `finishCandidates(failed)`。
  2. **自动决定**：对 `status='candidate' and checks_passed and extractor_kind='rule'` 的候选（不限本批次——崩溃后重跑即可补上），若 `approvalsFor(extractor_ref)` 有未撤销且与候选所属抽取版本行三个版本列匹配的审批行且概念在范围内 → `decideCandidate({kind:'auto', approval_id})`；幂等。
  3. **晋升**：`promotionDue(HK_PUB_GEN, limit)`（§4.11 的三类条件：待首发、待新代、待恢复）→ 逐发行人 `runHkFactsSync`（§7.7）。人工确认的候选也由这一阶段兜底（§9 的确认路由会立即触发一次，失败则等 cron）。
  新鲜度 `recordAttempt('documents.candidates', {ok, cadence:'daily'})`。
- `HK_LABEL_GEN`/`HK_RULES_VERSION` 升级：`scripts/documents/candidates.ts --regenerate [--filter …]` 调 `request_candidates_regen`（只对当前抽取版本、`role <> 'none'` 的版本）；新 `extractor_ref` 产生新候选行（旧行保留）；**决定继承**只对人工决定、按 `fingerprint`（自然键 + 完整 payload + 四类引用片段）完全相同时发生，写新的 `decided_at` 与 `inherited_from`；自动决定永不继承（审批绑定旧版本）。`EXTRACTOR_VERSION` 升级：`request_document_extract` 对每份文档开新版本，新版本的候选从零生成，同样走继承。

### 7.4 引用写入 `src/lib/documents/citations.ts`

`cite(db, {document_id, extraction_id, page_no, char_start, char_end, bbox?, created_by, created_ref})`：读该版本页的 `text`（码点数组）与 `text_hash`，`snippet = 码点[start:end].join('')`，空片段或越界拒绝（`invalid_citation`）；`insert_citation` 再校验一次；返回 `citation_id`。`verify(db, citation_id)` 返回 `{integrity, currentExtraction}`。约定：**引用先于数字**。

### 7.5 港股财务事实候选 `src/lib/documents/hk-facts/`

`HK_LABEL_GEN = 1`、`HK_RULES_VERSION = 'hk-facts/1.0'`、`extractor_ref = 'hk-facts/1/hk-facts/1.0'`。输入 = 一个 `pending` 抽取版本的 `pages.json`（`primary` 或 `comparison` 角色）。

1. **定位主表** `locate.ts`：三类主表各由标题正则识别（繁体、简体、英文任一）：损益表 `綜合損益表|綜合損益及其他全面收益表|綜合全面收益表|Consolidated Statement of Profit or Loss`（`IS`，duration）；财务状况表 `綜合財務狀況表|綜合資產負債表|Consolidated Statement of Financial Position`（`BS`，instant）；现金流量表 `綜合現金流量表|Consolidated Statement of Cash Flows`（`CF`，duration）。一类主表 = 标题命中且 `tables` 非空的**连续**页序列（续页标题常带 `（續）|(continued)`）；命中页不连续 → `locate_ambiguous`，不产候选；没有命中 → 该类缺失。附注页（`附註|Notes to`）不计。标题不含 `綜合|Consolidated` → `not_consolidated`，不产候选。
2. **期间与列** `period.ts`：`cnDate()` 把 `二零二五年十二月三十一日`、`2025年12月31日`、`31 December 2025` 都解析为 ISO 日期。
   - duration 表（IS/CF）：主表首页标题行的 `截至<日期>止(年度|六個月|六个月)` 或 `for the (year|six months) ended <日期>` → 主列 `period_end`，`duration = 12M|6M`，`period_start = period_end − 12 个月 + 1 天 | − 6 个月 + 1 天`（`period_derivation.rule = 'title_duration'`）。表头块中的年份列（`\d{4}` 或 `二零\S\S年`，按 `x` 与数值列对齐）给出各列年份；比较列 = 标题日期把年份替换为该列年份（`rule='title_year_substitution'`，`column_text` = 该列头原文），`duration` 相同。表头没有两个年份 → 只产主列。
   - instant 表（BS）：`於<日期>` 或 `as at <日期>` → 主列 `period_end`，`period_start = null`，`duration='INSTANT'`。比较列：列头含完整日期 → 用之（`rule='column_date'`）；列头只有年份且标题为 `於<月日>`（年报）→ 年份替换；中期 BS 列头只有年份 → 比较列不产候选，`period_unparsed`。
   - 解析不到主列期间 → 该表不产候选，`period_unparsed`。
   - **期间证据**：每个候选的 `citations.period` 数组含报表标题行引用（`statement_title`）与所选列头引用（`column_header`，主列也记录）；比较列的证据因此指向它自己的列头。
3. **单位、倍数与每股子单位** `scale.ts`（在表头块与主表首页标题区匹配；**最长匹配优先、按词边界**）：
   - 倍数词按长度降序尝试：`'000,000` → 1000000；`百萬|百万|million` → 1000000；`'000|千元|千` → 1000；`元|dollars`（且不是 `港元|千元|人民幣元` 的一部分）→ 1。货币：`港幣|港元|HK\$` → HKD；`人民幣|RMB` → CNY；`美元|US\$` → USD。货币词先于倍数词从文本中剔除后再匹配倍数，避免 `港元` 中的 `元` 被当作倍数。货币出现但无倍数词 → `scale=null`；多个货币 → `unit_ambiguous`。
   - 每股行（eps）：子单位 `港仙|仙|HK cents|cents` → `scale='0.01'`、`unit='<货币>/share'`；`港元|HK\$|人民幣元|RMB` → `scale='1'`；无子单位词 → `scale=null`。eps 不继承表头倍数。
   - `scale=null` 永远不通过 `unit_known`。
4. **科目映射** `labels.ts`（与第 2 稿相同的 18 个概念与正则、符号规则：`cost_of_revenue`、`income_tax` 列示为负取绝对值并 `sign_flip=true`；现金流量按列示；`net_change_in_cash` 标签为"減少"且值为正取负；其余如列示）。一行标签命中多个概念或一个概念被多行命中 → `label_ambiguous`，不产候选。港股主表常不列示"資產總值/負債總額"——保持缺失，不从分项相加。
5. **值解析** `values.ts`：单元格 `^\(?([\d,]+(\.\d+)?)\)?$`，括号 = 负数；`–|-|—` 单独出现 = 该期无值（不产候选，不写 0）；`presented` = 原文；`value` = 十进制字符串算术（`src/lib/documents/decimal.ts`：字符串乘 10 的幂、带符号加减，无浮点）得到的 `presented × scale`，再按符号规则处理。
6. **候选**：每个 (概念, 期间列) 一条，`natural_key = <concept>:<period_start|''>:<period_end>:<duration>:<unit>`；引用（值、标签、单位、期间证据数组）都在 `insert_candidates` 前以 `cite()` 创建（`created_by='extractor'`）；`consolidation='consolidated'`；`fingerprint` 按 §4.6。上年比较列是**本文件对上一期间的披露**，同样产候选。

### 7.6 确定性检查 `checks.ts`

数值检查前把十进制字符串显式转换为 `number`（`Number(value)`，15 位有效数字，与规格二审计 N8 的决定一致——恒等式用 0.5%/2% 容差，双精度足够；转换失败记 `not_a_number`），再调用 `rules.ts`。每条候选记录全部检查到 `checks`；`checks_passed` = 全部 `blocking` 通过：

| check | blocking | 规则 | 失败处理 |
|---|---|---|---|
| `citation_verified` | 是 | 全部引用 `integrity='ok'` 且 `currentExtraction=true`；值引用 `snippet` 去除逗号/括号/破折号后等于 `presented` 的数字串 | 不可晋升 |
| `unit_known` | 是 | `unit` 与 `scale` 均非空 | 不可晋升 |
| `period_known` | 是 | `period_end` 已解析；duration 表 `period_start` 非空且天数落在规格二的 `6M`/`12M` 区间；instant 表 `period_start` 为空；`citations.period` 含 `statement_title` 与 `column_header` 各至少一条 | 不可晋升 |
| `consolidated` | 是 | 主表标题含 綜合/Consolidated | 不可晋升 |
| `identity_bs` | 是 | `identityRule('identity_bs', total_assets, total_liabilities + equity_total, 0.005)`（三者同列都有时；缺任一不检，detail 记 `skipped`） | 同列 BS 候选不可晋升；隔离 `hk_identity_bs` |
| `identity_gp` | 是 | `identityRule('identity_gp', gross_profit, revenue − cost_of_revenue(绝对值), 0.005)`（三者都有时） | 同列 IS 候选不可晋升；隔离 `hk_identity_gp` |
| `identity_cf` | 是 | `identityRule('identity_cf', net_change_in_cash, operating + investing + financing, 0.02)`（四者都有时；容差取规格一 §5.2 的 2%） | 同列 CF 候选不可晋升；隔离 `hk_identity_cf` |
| `comparative_consistent` | 否 | 本文件比较列 vs 上一期文件主列的已发布事实（`read_facts`，同概念、同期间、同单位）：`identityRule(…, 0.005)`；无 → `unavailable` | 可晋升；信息码 `restated_comparative` 与隔离项 `hk_restated_comparative` |
| `en_cross_check` | 否 | 同发行人、同 `doc_class`、同 `period_end`、`language='en'` 文档的 `comparison` 候选中 `natural_key` 相同者值相等；无 → `unavailable` | 可晋升；不等 → 信息码 `en_zh_mismatch` 与隔离项 `hk_en_zh_mismatch` |

### 7.7 晋升 `promote.ts::runHkFactsSync(deps, {issuerIds, triggeredBy})`

**发布代 `HK_PUB_GEN`**（整数常量，F3 拥有）：`EXTRACTOR_VERSION`、`TABLE_ALGO_VERSION`、`HK_LABEL_GEN`、`HK_RULES_VERSION` 任一改动，或需要替换已发布值的修正，都 +1。它作为规格二 `beginRun(…, mapping_gen)` 的 `mapping_gen`：规格二按 K + filing + `mapping_gen` 去重并按 filing 整体激活代，因此新代能替换同 K 的旧值，旧代行留作历史（与规格二美股映射升级同一机制；`filings.mapping_gen` 只需按 filing 单调，港股 filing 的代序列独立于美股）。

**活动候选集**：对一份港股中文文档 = `extraction_id = current_extraction_id` 且 `extractor_ref = 当前 extractor_ref` 且 `status in ('confirmed','promoted')` 且满足资格（`kind='financial_fact'`、`extractor_kind='rule'`、文档 `permission='public'`、`source='hkexnews'`、`language='zh'`、`issuer_id` 等于运行发行人、`checks_passed`）的候选；其他代/版本的候选不参与（它们的发布行留作历史）。

运行（一个发行人一次；每一步幂等，崩溃后重跑从第 0 步开始）：
0. **租约先于恢复**（R4-1 修法）：先 `reconcileScope('HK', [{issuer, priority: 0, fetch_key: hkex_stock_code_primary, reasons:['documents']}])`，再为当前批次取得该发行人的 HK 租约 `claimLease(issuer,'HK',batch,600)`；返回 false → 以 `skipped_summary(leased)` 退出，**不做任何恢复写入**。持有该租约后执行恢复：对该发行人在 `HK_PUB_GEN` 下所有 `staged` 发布行，按 `run_id` 分组：运行 `published` → （R4-7 修法）先置本次运行的 `needs_materialization=true`，再 `finishCandidatePublications(run)`（逐条判定：事实 `ok` → `published`；`quarantined` → 保持 `staged`，本次运行不再暂存该候选；事实不存在 → `abandoned`）；运行 `staged`（上次崩溃在发布前）→ `abandonRun(run)`（级联删证据）+ `abandonCandidatePublications(run)`；运行 `abandoned` → `abandonCandidatePublications(run)`。所有恢复中的废弃调用都以当前租约持有者身份执行。`hk_materialization_due` 存在本发行人标记 → 同样置 `needs_materialization=true`。恢复完成后才 `beginRun(issuer,'HK',batch, HK_PUB_GEN)`。**每条正常退出路径（含 `nothing_to_publish`）都释放租约。**
1. （并入第 0 步。）
2. **本次暂存的候选** = 活动候选集中在 `HK_PUB_GEN` 下**没有** `staged|published` 行的候选（无行或 `abandoned`）；活动集中已 `published` 的候选不再暂存（它们的事实已是 `ok`，同代下规格二也会判为重复），`staged` 且事实 `quarantined` 的候选等待规格二隔离处理。对该发行人每份有活动候选集的文档（以及文档虽有候选但活动集为空的——零输出 filing 也进 manifest，使旧代行被新代"隐藏"）：`stageFilings`（§4.9 的港股 filing）；候选 → 事实行（`concept/statement/period/duration/value/unit/consolidation` 来自 `payload`，`source_concept` = 标签片段，`available_date` = 文档 `available_date`，`raw_hash` = `content_sha256`，`fact_id` 由写入端生成）；**规划用规格二的 `planFactWrites` + `openConflicts` 原样**（重复、同日冲突、`versioned` 计数都由它决定；港股原版与替换版同日不同值即进 `same_day_conflict`）；`stageFacts(run, rows)`（§16：返回每个输入键的 `fact_id` 与 `inserted|duplicate` 结果）→ 对每个本次暂存的候选 `stageCandidatePublication(candidate, HK_PUB_GEN, run, fact_id)`（结果为 `duplicate` 的候选也登记，`fact_id` 为既有行；既有行若已 `ok` 则第 4 步直接判为 `published`）。本次没有任何候选可暂存且没有零输出 filing → （R4-7 修法）废弃刚创建的空运行；若 `needs_materialization`，先调用 `materialize(issuer,'HK')`（成功后 `clearMaterializationDue(issuer, stateRev)`），再释放租约并以 `skipped_summary(nothing_to_publish)` 返回。物化失败必须独立于候选发布状态可持久重试：标记保留，`promotionDue` 条件 (d) 再次选中。
3. **证据**：对本运行新暂存的每个事实 `insertFactCitations(run, rows)`（值、标签、单位各一条，期间证据数组每条一行）；失败 → `abandonRun`（级联删除未发布事实与其证据）→ `abandonCandidatePublications(run)` → 该发行人 `failed`（`evidence_failed`）。
4. 规格二 `identity_bs/identity_gp` 规则（输入 = 本运行新行 ∪ 该 filing 当前 ok 行）→ `quarantineFacts` → **`publishHkRun(issuer, batch, run, manifest)`**（一个事务：先 `assert_run_evidence_complete`（对运行内全部 staged 事实），再规格二 `publish_sync_run`；证据不全则整个事务回滚、事实不发布，`evidence_incomplete` → `abandonRun` + `abandonCandidatePublications`，`failed`）→ `finishCandidatePublications(run)`（逐条判定，隔离行保持 `staged`）→ `materialize(issuer, 'HK')`（成功后 `clearMaterializationDue(issuer, stateRev)`；失败则标记保留、`promotionDue` 条件 (d) 重试）→ `releaseLease`。
5. 被规格二隔离的行：其候选的发布行停在 `staged`（事实 `quarantined`），规格二隔离处理提升为 `ok` 后，`promotionDue` 条件 (c) 使下次运行在第 0 步补 `published`。`publishHkRun` 抛其他错 → `abandonRun` + `abandonCandidatePublications`，`publish_failed`。

**同代第二次确认**：新确认的候选在下次运行按第 2 步单独暂存（已发布的不重复暂存），manifest 仍含其 filing，`filings.mapping_gen` 不变（规格二 `publishRun` 对相等的代不抛 `mapping_gen_regression`）。

`raw_hash` 对港股的定位规则：桶内 `blobs/{content_sha256}.pdf` 的 `fact_citations(role='value')` 所指抽取版本、页与 bbox。

### 7.8 LLM 抽取边界

本规格不实现任何 LLM 调用，只约束未来实现（外资研报、公司研究、评测 F6 共用）：

1. LLM 的输出只能写 `extraction_candidates(extractor_kind='llm', extractor_ref='<model_id>@<prompt_version>')`，`payload` 必须经 ajv 按 kind 的 JSON Schema 校验，引用必须由 `cite()` 产生——LLM 返回"页码 + 引述原文"，服务端在该页文本中**精确匹配**引述（必须恰好出现一次）得到码点区间；匹配不到或多处匹配的输出整条丢弃并计 `llm_uncited`。
2. `input_snapshot` 记 `content_sha256`、`pages_json_sha256`、送入的页码、`extractor_version`、`code_version`、模型 id、prompt 版本；调用经 `src/lib/llm` 计量。
3. LLM 候选与规则候选对同一 `natural_key` 的值不一致 → 信息码 `extractor_disagreement` 并写隔离项。
4. `decide_candidate` 的自动路径要求 `extractor_kind='rule'`；活动候选集只含 `rule`；RLS 使 anon 读不到候选表；页面层也不得通过 service_role 旁路展示 `candidate` 状态的值。

---

## 8. 公共与私有、许可

### 8.1 公共（`permission='public'`，官方披露）

- 公共可读：`disclosure_documents_public`、`document_extractions`、`document_pages.text`、按 §4.12 规则可见的 `document_citations`、`fact_citations`（随事实可见）。
- 不公开：桶内对象、未随事实发布或未被模块公开的引用、候选。读接口对公共文档返回 `source_url`；我们的副本只经签名 URL 给**已登录用户**（`GET /api/documents/doc/[id]/file`，`expiresSeconds = 300`：签名 URL 只用于浏览器随即发起的一次下载，owner 可调；响应 `private, no-store`）。

### 8.2 私有与授权（`licensed` / `private`）

- `owner_user_id` 必填；RLS 对 anon/authenticated 都不可见（§4.12）；持有人只能经服务端路由读取：`getServerSupabase()` 会话 → `auth.uid() = owner_user_id`（不等 → 404）→ service_role 读 → **先写审计后返回**：`audit(ctx(owner), 'document.read', document_id, {route, page_no?, citation_id?, requester: auth.uid(), signed_url_issued?: true})`（`object_type='document'`）；审计写失败 → 500。签名 URL 的签发被记录；对象的实际下载由 Supabase Storage 完成，不在本审计内。
- 元数据、页文本、片段、文件四类读取都经该路径；响应 `Cache-Control: private, no-store`。

### 8.3 给外资研报规格的接口

```ts
// src/lib/documents/upload.ts
ingestUpload(deps, {ownerUserId, bytes, filename, mime: 'application/pdf', permission: 'licensed'|'private', license?: {ref}, issuerId?, title?})
  → {documentId, duplicate}          // source='upload', source_ref='<owner>/<sha256>', published_at=available_at=now, source_url=null, acquisition={uploaded_at, filename}
// 读取：§9 的 doc/pages/citations/file 四个接口，持有人身份下可用；响应 private, no-store
// 抽取：同 §7.2，candidates_role='none'；字段抽取由外资研报规格以 §7.8 边界实现（kind='field'），其候选与引用对外不可见
// 公开性：非公开文档的引用永远不能 publish_citations，也不能进入 fact_citations（函数拒绝）
```

许可确认先于功能（总纲 §3.2）：`license.ref` 的含义、可展示范围、是否允许片段展示，是外资研报规格与 owner 的事项（§14 决策 F）；本规格默认片段仅持有人可见。

---

## 9. 读取接口与管理接口

共同约定：公共接口用 `anon` 客户端的 `DocumentsDb` 只读子集，`force-dynamic`；参数重复 → 400 `invalid_parameter:<name>`；ticker 正则与规格二相同；`resolveIssuer({ticker},{today})`，无 → 404 `unknown_ticker`；错误与空结果 `no-store`。**缓存头按响应类别**：匿名可见的公共响应——`asOf` 早于今天的查询 `public, max-age=600, s-maxage=3600`，否则 `successCacheControl(now)`；任何经会话校验返回的响应——`private, no-store`。列表接口游标分页（`cursor` 不透明；`limit` 默认 100、最大 1000；`nextCursor`）。响应顶层含 `extractorVersion`（当前）与 `classifierGen`。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/documents/[ticker]` | `asOf`（默认今天；时点选最新版本）、`source`、`class`、`from`/`to`（`available_date` 窗口，在 as-of 选版之后过滤）、`versions=1`（返回全部版本而非时点最新）、`cursor`、`limit` | `{issuerId, ticker, asOf, documents:[{documentId, source, sourceRef, sourceVersion, observedReplacement, docClass, formType, title, language, sourceUrl, contentSha256, bytes, mime, publishedAt, publishedAtPrecision, availableAt, availableDate, fiscalYear, fiscalPeriod, periodEnd, filingSourceRef, status, currentExtractionId}], nextCursor}`；只含 `public` |
| `GET /api/documents/doc/[id]` | `extractionsCursor` | 单条 + `assets:[…]` + `extractions:{rows:[{extractionId, extractorVersion, tableAlgoVersion, pageCount, hasTextLayer, createdAt}], nextCursor}` + `supersedes`、`supersededBy`；非公开：持有人经会话得到，其他人 404 |
| `GET /api/documents/doc/[id]/pages/[n]` | `extraction`（默认当前）、`layout=1` | `{documentId, extractionId, pageNo, text, textHash, charCount, width, height, lines?, tables?}` |
| `GET /api/citations/[id]` | — | `{citationId, documentId, extractionId, pageNo, charStart, charEnd, bbox, snippet, textHash, integrity, currentExtraction, createdBy, createdRef, document:{title, sourceUrl, publishedAt, availableAt, docClass, language}}`；不可见引用对匿名 404 |
| `GET /api/documents/doc/[id]/file` | — | 需登录；`{url, expiresAt}`；`private, no-store`；licensed 非持有人 404 |
| `GET /api/facts/[ticker]`（规格二，扩展） | `citations=1` | 每行追加 `citations:[{role, citationId, extractionId, pageNo}]`；港股 `filings.citation='page'`；`.HK` → `market='HK'`（§16） |
| `POST /api/admin/documents/[id]/reprocess` | body `{stage:'extract'|'classify'}` | `requireAdminUser()`，JSON 与 Origin 校验同 `/api/admin/dq/quarantine/[id]`；`extract` → `requestExtract`（`revision_exists` → 409）后立即跑一次 `runDocumentsExtract({documentIds:[id]})`；`classify` → `reclassifyDocument`；审计；`private, no-store` |
| `GET /api/admin/documents/candidates` | `status`、`extraction`、`issuer`、`cursor`、`limit` | 候选列表（含 `checks`、各引用片段、文档标题、`publications`） |
| `POST /api/admin/documents/candidates/[id]` | body `{status:'confirmed'|'rejected'|'candidate'}` | `decideCandidate(human)`；`confirmed` 后对该发行人立即跑一次 `runHkFactsSync`（失败由 cron 兜底）；返回 `{status, run:{state:'published'|'failed'|'skipped', message?}}`；`not_eligible` → 409；幂等 |
| `POST /api/admin/documents/candidates/regenerate` | body `{filter}` | `requestCandidatesRegen`；审计 |
| `POST /api/admin/documents/approvals` | body `{extractorRef, extractorVersion, tableAlgoVersion, codeVersion, concepts, goldSha256, precision, recall, reportPath}` | 写 `extraction_approvals`（`ea_threshold` 把 < 0.95 拒绝 → 422）；审计 |
| `GET|POST /api/cron/documents-sync`、`/documents-extract`、`/documents-candidates` | §6.3 | 批次回执 |

### 9.1 来源抽屉数据契约（供各页面规格接入）

页面上每个可回放数字携带 `{factId?, citationIds: string[], documentId, extractionId, pageNo}`；抽屉打开时调用 `GET /api/citations/[id]`（必要时 `pages/[n]?extraction=…&layout=1`）。抽屉必须呈现：文档标题、来源、`publishedAt` 与 `availableAt`（不同时都显示）、页码、片段（高亮 `charStart..charEnd`）、`currentExtraction=false` 的"引用基于旧抽取版本"标记、`integrity='corrupt'` 的"引用校验失败"标记（数字仍显示，并进告警）、期间证据有多条时逐条列出、"在原文打开"（`sourceUrl`，PDF 加 `#page=n`）、对已登录用户的"下载副本"；licensed 文档对非持有人显示"需授权"而不显示片段。状态：加载骨架（`DESIGN.md` 骨架规则）、引用不存在（404 → 行内错误条）、无文本层（只给原文链接与页码）。zh/en 文案进 `messages/{zh,en}/documents.json`，`messages-parity.test.ts` 自动校验。

### 9.2 Claude Design 画布待设计清单（owner 规则：所有 UI 先在画布设计）

1. 来源抽屉（桌面侧滑 / 手机全屏）：页文本视图、高亮片段、bbox 示意（无 PDF 渲染，用行坐标画矩形）、当前/旧版本/校验失败/需授权四态、多条期间证据、原文与下载入口。
2. 管理员候选复核工作台（挂在现有 `/admin/dq` 下）：候选表（概念、期间、值、单位与倍数、符号规则、`checks` 逐项含 blocking 标识）、引用片段对照、确认/拒绝、发布代与发布行状态、规格二隔离回显、审批记录入口、再生入口。
3. 发行人文档列表（公司研究页的"披露文件"标签页）：as-of 选择、按类别/年份/语言筛选、版本与替换标识、处理状态、每行进入抽屉。
4. `/admin/dq` 的文档处理状态面板：三来源新鲜度与回填进度、`stored`/`pending` 积压、`no_text_layer`/`extract_failed`/`exhausted` 计数、重处理入口。

---

## 10. 错误处理

批次状态一律由 `batchStatusFromCounts(counts, errors)` 得出（有非信息错误时：`landed>0 ? partial : failed`；只有隔离不降级）；下表"批次"列写的是该情形单独出现时的结果。

| 情形 | 行为 | 码 | 计数 / 批次 |
|---|---|---|---|
| 列表请求失败（HTTP 非 2xx、超时、`layout_changed`） | 该发行人跳过，游标不前进 | `list_failed` | `failed+1`；partial/failed |
| 文件 429/503 重试耗尽或预算不足 / 上传失败 / 必抓资产失败 | 不前进，`item_attempts+1`；三次后隔离 `document_fetch_exhausted` 并前进 | `fetch_failed` / `object_put_failed` / `asset_fetch_failed` | `failed+1`；partial/failed |
| 文件 404 | 跳过，前进 | `skipped_summary(document_missing)` | 信息 |
| 字节 > 52428800 / MIME 不符 | 隔离 `document_too_large` / `unexpected_mime`，前进 | — | `quarantined+1`；不降级 |
| `lease_lost` | 该发行人/文档 failed | `lease_lost` | `failed+1` |
| 租约被占 / 发行人 `merged` | 跳过 | `skipped_summary(leased|issuer_merged)` | 信息 |
| 抽取：无文本层 | 版本写入、`no_text_layer` | `skipped_summary(no_text_layer)` | 信息 |
| 抽取：抛错 / 超预算 / `pages.json` 上传失败 | `fail_document_extract` 或留租约到期；attempts 在 claim 计 | `extract_error` / `extract_timeout` / `object_put_failed` | `failed+1` |
| 候选：抛错 | `finishCandidates(failed)`；三次后 `exhausted` | `candidates_error` | `failed+1` |
| 港股候选：定位/期间/单位/标签歧义、非综合报表 | 不产候选 | 信息码 `locate_ambiguous` / `period_unparsed` / `unit_ambiguous` / `label_ambiguous` / `not_consolidated`（各一条汇总，`key=extraction_id`） | 信息 |
| 港股候选：阻断检查失败 | 不可晋升；恒等式失败另写隔离 `hk_identity_*` | — | `quarantined+1` |
| 港股候选：比较数/中英不一致 | 可晋升；隔离 `hk_restated_comparative` / `hk_en_zh_mismatch` | 信息码 `restated_comparative` / `en_zh_mismatch` | `quarantined+1` |
| 晋升：证据写入失败 / `publishHkRun` 证据校验回滚 / 其他发布错误 | `abandonRun` + `abandonCandidatePublications` | `evidence_failed` / `evidence_incomplete` / `publish_failed` | `failed+1` |
| 晋升：无候选可暂存 | `abandonRun` | `skipped_summary(nothing_to_publish)` | 信息 |
| 晋升：规格二规则隔离 | 发布行停在 `staged` | 规格二隔离项 | `quarantined+1` |
| 决定：不合格候选 / 审批撤销 | 409 `not_eligible` / 候选回 `candidate` | `approval_revoked` | — |
| 引用越界或片段为空 | 拒绝 | `invalid_citation` | — |
| `publish_citations` 对不可发布引用 | 拒绝 | `not_publishable` | — |
| 审计写失败（私有读取） | 500 | `audit_failed` | — |
| 截止 | 不再开始新项 | `deadline_hit`（信息） | 信息 |
| 无到期项 | 心跳 ok | `detail.idle=true` | success |
| `fetched>0` 无结果 | `unaccounted` | — | failed |
| 读接口 | 404 `unknown_ticker` / `not_found`；400 `invalid_parameter:<name>`；401 `unauthenticated`；409 `revision_exists` / `not_eligible`；422 `threshold` | | |

新增信息码（加入 `INFO_CODES`）：`deadline_hit`、`coverage_summary`、`locate_ambiguous`、`period_unparsed`、`unit_ambiguous`、`label_ambiguous`、`not_consolidated`、`restated_comparative`、`en_zh_mismatch`、`extractor_disagreement`、`llm_uncited`。规格二已申请 `deadline_hit`/`coverage_summary`，以先落地者为准。

---

## 11. 测试策略

### 11.1 单元（vitest，`memoryDocumentsDb` + `memoryObjectStore`）

- `classify.test.ts`：三来源规则、排除词、年份与期间解析（含中文数字）、`language`、`CLASSIFIER_GEN`。
- `sources/*.test.ts`：复用现有列表夹具；段与稳定排序；EDGAR `recent` → `files[]`（分页夹具在 F3-1 录制）。
- `sync.test.ts`：两遍幂等（第二遍全 `duplicates`，游标前进）；已知项不消耗 `maxPerIssuer`；游标在段首/段中/段末的截止、上限与失败（不前进、三次后隔离并前进）；哈希变化 → `versioned`、`supersedes`、`observed_replacement`、`available_at = fetched_at`；`too_large`、`unexpected_mime`、上传失败、必抓资产失败；租约失败/丢失；空转；`code_version` 缺失拒绝；回填完成与轮询模式切换；`batchStatusFromCounts` 的状态。
- `extract/pdf.test.ts`：`fixtures/pdf/minimal-two-pages.pdf`（手写最小 PDF，两页，≤ 2 KB，含一个增补平面汉字与一个 emoji 在被引用文本之前）：行聚类、空格插入、页序、码点偏移（每行/单元格偏移切出的子串等于其文本）、`hasTextLayer`、空页；`fixtures/pdf/no-text.pdf` → `no_text_layer`。
- `extract/tables.test.ts`：对录制的港股主表页 `lines` 得到预期列数、标签单元格与**表头块**（含中文数字年份行）。
- `extract/html.test.ts`：复用 `edgar-8k-pltr-20260803.htm`；分页标记切页；无截断。
- `citations.test.ts`：`cite/verify`、越界与空片段拒绝、码点 vs UTF-16 夹具、`integrity`、`currentExtraction`、`publish_citations` 只对 human/module。
- `decimal.test.ts`：字符串乘 10 的幂、带符号加减、20 位整数。
- `hk-facts/*.test.ts`：`locate`、`period`（年度/六個月、英文、中文数字、BS instant、中期 BS 只含年份 → 不产、期间证据两条）、`scale`（最长匹配、`港元` 不触发 `元`、只有货币 → null、eps 子单位）、`labels`、`values`、`checks`（blocking/非 blocking、显式数值转换、`identity_cf` 2%）、`decide`（人工 `checks_passed=false` → `not_eligible`；自动只在审批四版本完全相等；llm 永不；撤销后 `approval_revoked`）、`promote`（活动候选集；同代第二次确认只暂存新候选；零输出 filing 进 manifest；`HK_PUB_GEN` 升级替换旧值；`publishHkRun` 证据不全回滚；混合结果运行的逐条判定（`published/still_staged/abandoned`）；`abandoned→staged` 重暂存；第 0 步对三种运行状态的恢复；`promotionDue` 三类条件；规划器同日冲突；第三次崩溃后 `claim` 收尾为 `extract_failed/exhausted`；`writeCandidateChecks` 对已决定行拒绝）、`regenerate`（人工决定按 `fingerprint` 继承、自动不继承）。
- 路由测试：参数、`asOf` 选版、游标、缓存头按类别（含 owner → 匿名、owner A → owner B）、`integrity/currentExtraction`、licensed 非持有人 404、`file` 未登录 401、管理接口的媒体类型/Origin、候选 POST 幂等与 409、审批 422。

### 11.2 数据库（`test:db`，全部 critical）

`src/lib/documents/documents.integration.test.ts`：迁移一可重放；唯一键；检查约束（`dd_*`、`de_role_status`、`ec_decision_shape`、`ea_threshold`）；触发器（限定列、状态迁移集合、页与引用不可删改、`insert_citation` 校验、`publish_citations` 限制、候选生命周期）；函数（租约互斥/过期/续租、`lease_lost`、`insert_document_version` 版本分配与重复、`finish_document_extract` 无删除、`request_document_extract` 的 `revision_exists`、`claim_*` 的计数与 `exhausted`、`decide_candidate` 资格、`insert_candidates` 的引用一致性校验与继承、`service_role` 直接 insert/update/delete 被拒、anon 不可执行写函数、`read_documents` as-of 选版）；RLS 真实角色（anon/authenticated 直接查表与查 `disclosure_documents_public` 都读不到 licensed 行、候选表、未公开引用）；游标分页在 > 1000 行上的正确性（`pgDocumentsDb`）；码点 `substr` 与 JS 码点切片一致（增补平面夹具）。
`src/lib/documents/fact-citations.integration.test.ts`：迁移二在规格二迁移之后可重放；`fact_citations` 级联（删除 staged 事实 → 证据消失；ok 事实不可删）；`insert_fact_citations` 守卫（私有文档、跨 filing 文档、非当前抽取版本被拒）；`assert_run_evidence_complete`；`document_citations` 的事实联动可见性；`filings.primary_document_id` 列级 update；枚举加法。本套件只在规格二 F2-0 落地后创建。

### 11.3 离线集成（录制回放）

- `scripts/documents/record-fixture.ts --hkex <url>` 下载真实 PDF，**不提交 PDF**，提交 `fixtures/hkex/<source_ref>.pages.json`（文件头 `{recorded_at, source_url, content_sha256, bytes, page_count, extractor_version, table_algo_version}`）。录制对象：黄金集三家发行人各两期年报/中报的中文版与英文版，以及 `0268.HK` 的 `2026090300863_c`。
- `src/lib/documents/sync-hk.integration.test.ts`（critical）——两层：**编排层**（合成字节，其 `content_sha256` 为合成字节的真实哈希；抽取层替换为"读录制 `pages.json`"，`pages_json_sha256` 为夹具真实哈希 → 同步、抽取、候选、检查、决定、晋升到规格二表）；**录制抽取层**（对录制 `pages.json` 跑 §7.5–7.6，断言黄金集逐项一致）。
- **真实字节验证**（不在 CI）：`scripts/documents/validate-extraction.ts --gold fixtures/gold/hk-facts.json` 本机下载三家原件（哈希须等于夹具头），跑完整 `extractPdf → 候选 → 检查`，输出与录制 `pages.json` 的逐页 `text_hash` 一致性与黄金集一致性，报告落 `docs/audits/2026-11-04-document-pipeline/real-bytes-validation-<date>.json`。F3-4 退出条件之一。
- `src/lib/documents/sync-us.integration.test.ts`（critical）：`edgar-submissions` + 8-K 夹具 + 索引 JSON 夹具 → 文档与资产入库、HTML 分页、引用。

### 11.4 黄金集与评测

`fixtures/gold/hk-facts.json`：3 家港股（含 `0268.HK`，其余两家在 F3-4 从范围内选取，须有可用中文年报）× 2 期 × **全部 18 个概念**，每条 `{issuer, concept, period_start, period_end, duration, unit, value | "missing", source:{document_sha256, page, line_text}, recorded_by, recorded_at}`，**由实施者之外的人从 PDF 抄录**。
`scripts/documents/eval-hk-facts.ts --gold …` 输出 `{extractor_ref, extractor_version, table_algo_version, code_version, gold_sha256, concepts, precision, recall, mismatches[]}`；精确率 = `checks_passed` 候选中与黄金一致的比例；召回 = 黄金非缺失条目中被 `checks_passed` 候选覆盖的比例；缺失条目：有候选 → 精确率分母加 1 且不一致。结果写审计目录；审批引用该文件哈希，`precision` 与 `recall` 都 ≥ 0.95（总纲 §3.5）才能写入。

### 11.5 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`；全部门禁（`lint`、`typecheck`、`test`、`test:db`、`test:migrations`、`check:migration-history`）绿才算完成。

---

## 12. 分期（供计划三-文档 拆任务）

**合并顺序（owner 决策 G）**：迁移时间戳必须晚于合并时 `migrations.lock.json` 的最大值（CI `Non-append migration` 门禁）。默认顺序：规格二 F2-0 先合并（锁 `20261106090000`），本规格 F3-0 之后合并（`20261106100000`）。若 owner 决定 F3-0 先合并，则 F3-0 保留 `20261106100000`，规格二需重新分配晚于它的时间戳；两者不能各自按预占时间戳独立合并。

| 工作包 | 交付 | 退出条件 | 工作量 |
|---|---|---|---|
| F3-0 迁移一、契约、依赖 | 迁移一（九表、视图、桶、函数、触发器、权限）、锁文件、types、`DocumentsDb`/`ObjectStore` 各实现、`decimal.ts`、`pdfjs-dist` 入 `package.json` 与 Vercel preview 冒烟记录（含 Storage SDK 重复上传与签名 URL 行为） | `test:db`、`test:migrations` 绿；冒烟结论写入 runbook | 3.5 人日 |
| F3-1 采集 | `sources/*`（段与游标）、`sync.ts`、`scope.ts`、`classify.ts`、cron `documents-sync`、脚本、EDGAR `files[]`/索引形态与 HKEX 范围上限核对记录、首 20 个港股发行人实测字节数与最大页数 | 单测绿；真实 dry-run 各来源 3 家；回执落库 | 3.5 人日 |
| F3-2 抽取与引用 | `extract/*`、`citations.ts`、cron `documents-extract`、`record-fixture.ts`、PDF 夹具、表格阈值校验记录 | 单测绿；`0268.HK` 中期报告三张主表页可定位且偏移映射自洽 | 3 人日 |
| F3-3 读接口 | `/api/documents/*`（`read_documents`）、`/api/citations/[id]`、`file`、管理员 `reprocess`、游标分页、缓存头、i18n `documents.json`、来源抽屉契约文档、真实库 PostgREST 截断核对记录 | 路由测试绿；真实库上 `integrity='ok'` | 2.5 人日 |
| F3-4 港股事实（依赖规格二 F2-0～F2-2 落地与 §16 (a)(b)(c)） | 迁移二、`hk-facts/*`、`candidates/run.ts` 三阶段与 cron、候选/审批/再生管理接口、`promote.ts`、黄金集（18 概念）、`eval-hk-facts.ts`、`validate-extraction.ts`、`sync-hk.integration` | 黄金断言一致；评测与真实字节验证报告落审计目录；无审批行时无自动决定 | 5.5 人日 |
| F3-5 授权上传接口 | `upload.ts`、`insert_upload_document`、持有人路由与审计、持有人路径测试 | 真实角色测试：非持有人 404、审计行存在、`private, no-store` | 1.5 人日 |
| F3-6 文档收尾 | `docs/runbooks/document-pipeline.md`（手动触发、重处理、悬空批次与租约清理 SQL、孤儿对象、回填/轮询游标查询、再生流程）、规格一/二指向、§17 偏差记录 | 全量门禁绿 | 1 人日 |

合计约 20.5 人日（各包按交付项逐条估计后相加；是判断，不是测量）。F3-0～F3-3、F3-5 无 SQL 依赖于规格二，但受合并顺序约束；F3-4 等规格二。若 §15 问题 3 的冒烟失败：F3-2/F3-4 的 cron 不上线，抽取与候选只走本机脚本，读接口与引用不变。

验收样例：
1. `scripts/documents/sync.ts --source hkexnews --issuer <0268.HK 的 issuer_id> --since-year 2016 --apply` 两次：第二次 `inserted=0`，`duplicates=第一次 inserted`，游标不回退，`backfill_done=true`（在 HKEX 范围上限核对后）。
2. `documents-extract` 后 `GET /api/documents/doc/<id>/pages/<损益表页>?layout=1` 文本含 `綜合損益表`，`has_tables=true`，某单元格 `charStart..charEnd` 的码点切片等于其 `text`。
3. 管理员确认一条 `checks_passed` 的 `revenue` 候选 → `GET /api/facts/0268.HK?concepts=revenue&citations=1` 该行 `citations` 含 `value/label/unit` 与 ≥ 2 条 `period`，`GET /api/citations/<value>` `integrity='ok'`、`currentExtraction=true`；确认一条 `checks_passed=false` 的候选 → 409。
4. 抽取器版本升级后 `reprocess(extract)` → 新 `extraction_id`，旧引用 `currentExtraction=false`、`integrity='ok'`，`document_pages` 行数只增不减；同版本再次 `reprocess` → 409。
5. HKEX 同一 `source_ref` 返回不同字节 → `source_version=2`、`observed_replacement=true`、`available_at` 为抓取时刻；`GET /api/documents/0268.HK?asOf=<替换前日期>` 返回 v1。
6. anon 与 owner B 读 owner A 的 licensed 文档 → 404；owner A → 200、`private, no-store`、`research_audit_log` 多一行。
7. 断网运行三个 cron：批次 `failed`，内容表与桶无新行/对象。
8. 自动决定：无审批行 → 候选全部 `candidate`；`precision=0.94` 的审批 → 422；合格审批后 → 范围内概念 `confirmed(auto)` 并在同一 cron 运行内发布；`HK_LABEL_GEN` 升级后 → 新候选无自动决定，人工决定按 `fingerprint` 继承。
9. `HK_PUB_GEN` 升级后一次运行：同 K 新值以新代发布；旧代行保留为历史，`asOf` 读取（`read_facts` 只看 `filings.mapping_gen` 当前代）不再返回它们，但 `GET /api/facts/0268.HK?factIds=<旧 fact_id>` 仍能取回（规格二 `factsByIds` 不限代），其 `fact_citations` 仍可见。
10. 混合结果运行：一次运行中 3 条新行发布、1 条被规格二 `identity_bs` 隔离 → `finishCandidatePublications` 返回 `{published:3, still_staged:1, abandoned:0}`，被隔离候选保持 `confirmed`、发布行 `staged`；管理员接受隔离项后下一次 cron 运行第 0 步把它转为 `published`。

---

## 13. 独立验证

- Codex（gpt-6-astra，medium）：规格两轮与处置表（本目录 01/02/03）；每个工作包提交再审。
- 黄金集由实施者之外的人抄录；评测脚本与真实字节验证输出进审计目录。
- 真实来源 dry-run：三来源各 3 家（需 `EDGAR_USER_AGENT`）；EDGAR `files[]` 与索引 JSON 形态、HKEX 日期范围上限与替换行为、巨潮 `category` 取值、Storage SDK 行为的核对记录进 runbook。
- 引用回溯抽样：F3-4 后随机抽 5% 已发布港股事实（总纲 §2.6 的比例），人工点开原文核对页码与片段，记录在 `docs/audits/2026-11-04-document-pipeline/citation-sampling-<date>.md`。
- 会计口径复核：§7.5 中"資產總值/負債總額常不在主表"、"比较列是对上一期间的披露"、"銷售成本/所得稅取绝对值"、"现金流量按列示符号"四处由审核人确认。

---

## 14. 环境与 owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 A**：港股范围 = in_scope 队列（默认）还是 `hk_main` 宇宙全体 | owner | 计划编写前 |
| **决策 B**：巨潮与 HKEX 是否只入库定期报告类（默认）还是全部公告 | owner | 计划编写前 |
| **决策 C**：港股候选是否允许自动决定；前提为评测精确率与召回率都 ≥ 0.95 且写入审批记录；默认无审批行、全部人工 | owner | F3-4 评测报告出来后 |
| **决策 D**：批准新依赖 `pdfjs-dist`；若 Vercel 冒烟失败，接受"抽取与候选只在本机脚本运行"的降级 | owner | F3-0 |
| **决策 E**：桶 `disclosure-docs` 的容量预算与 `file_size_limit`（默认 52428800）；F3-1 实测后定 | owner | F3-1 后 |
| **决策 F**：授权研报的许可条款、片段是否可对持有人以外展示（默认不可）、`license.ref` 的登记方式 | owner + 外资研报规格 | F3-5 前 |
| **决策 G**：规格二与本规格的合并顺序（默认规格二先） | owner | 计划编写前 |
| 已入库 HKEX 文档的周期性重核验节奏（§15 问题 2 核对后；默认不做，替换只在轮询窗口内发现） | owner | F3-1 后 |
| Vercel 环境变量 `EDGAR_USER_AGENT`（本机也需要）、`CRON_SECRET`；确认 Vercel 计划为 Pro 及以上（每小时 cron） | owner | 部署前 |
| 生产执行迁移；首轮 `scripts/documents/sync.ts --source hkexnews --limit 5 --apply`；cron 与脚本不同时运行 | owner | 合并后 |
| 黄金集抄录（3 家 × 2 期 × 18 概念，含页码与"缺失"） | owner / 审核人 | F3-4 前 |

---

## 15. 开放问题（实施前核对）

1. EDGAR：`submissions` 的 `filings.files[]` 分页文件形态；申报目录 `index.json` 的字段形态；XBRL 实例文件命名（`*_htm.xml`）。
2. HKEX：标题搜索的日期范围与结果条数上限；同一 PDF 路径被替换的频率（决定 hkexnews `refetch` 默认与重核验节奏）；中英文版是否总是成对。
3. `pdfjs-dist` 在 Next 15 路由处理器（Node 22、Vercel hnd1）的加载方式与范围内最大年报的内存/耗时（冒烟标准见 §7.1）。
4. 巨潮 `hisAnnouncement` 的 `category` 参数对定期报告的取值（规格二 §6.3 也用到；以其核对结果为准）。
5. 港股主表的繁/简/英标题、列头日期形态、科目标签与表格聚类阈值在范围内公司的实际分布：F3-2/F3-4 用范围内全部已抽取年报统计定位命中率、列头可解析率、每个概念标签命中率、列数一致率，写入评测报告；未命中的标签不扩表，只记录。
6. Supabase Storage SDK：`upsert:false` 重复上传的错误形态、`createSignedUrl` 的到期行为；本地 `supabase/config.toml` 的 `max_rows=1000` 在生产的实际值。
7. 两份规格的租约表与函数合并为通用 `sync_leases`（计划三）。

---

## 16. 依赖接口（待对齐）

| 对方 | 本规格需要 | 本规格提供 |
|---|---|---|
| 规格二（事实库） | (a) 四处 `market` 枚举加 `HK`，`filings.source/origin` 加 `hkex`；(b) `filings.primary_document_id` 与其列级 update 例外、触发器允许列；(c) **`stage_facts(run, rows jsonb)` 返回 `jsonb`：`{<input_key>: {fact_id, outcome:'inserted'|'duplicate'}}`，`input_key` 由调用方在每行提供，`fact_id` 由调用方生成随行传入（重复时返回既有行 id）；分块 ≤ 500 时每块返回各自映射；三种 `FactsDb` 实现与测试同步更新；(d) `FactsDb` 的 `reconcileScope/claimLease/beginRun/stageFilings/stageFacts/quarantineFacts/publishRun/abandonRun/releaseLease/factsByIds/readFacts/replaceMetrics/openConflicts` 与 `planFactWrites`、`materialize(issuer, market)` 可被 §7.7 以 `market='HK'` 调用；`abandon_sync_run`/`begin_sync_run` 删除未发布事实时允许 `fact_citations` 级联（本规格以 `on delete cascade` 配合）；`publish_sync_run` 可被本规格的 `publish_hk_run`（同为 `security definer`，service_role 调用）在同一事务内调用，且对 `filings.mapping_gen = run.mapping_gen`（同代再次发布）不抛 `mapping_gen_regression`；(e) `/api/facts`、`/api/filings` 的 ticker 路由：`.HK` 后缀 → `market='HK'`；(f) 派生层对 `market='HK'` 的口径：`gross_margin = gross_profit / revenue`（无 `gross_profit` 时 `(revenue − cost_of_revenue)/revenue`）、`net_margin = net_income_parent / revenue`、`basis='standard'`；`fcf/borrowings_total/capex/q_single_*/ttm_*/roe` 因概念未抽取或只有 12M/6M 期间而缺失——本规格**不请求**新增年度 ROE 指标，港股 `roe` 在本期保持缺失；(g) `/api/facts` 接受 `citations=1`；(h) `INFO_CODES` 的 `deadline_hit/coverage_summary` 共用 | `fact_citations`（随事实级联）；港股 `filings`/`financial_facts` 的唯一写入者（经规格二函数）；A 股 `filings.document_ref` 反查 `document_id` |
| 规格四（判断框架） | 无 | 判断的输入快照可引用 `citation_id`；`created_by='module'`；发布判断时自行 `publish_citations` |
| 规格六（评测） | 黄金集格式与阈值由其统一；LLM 候选的评测 harness | `eval-hk-facts.ts` 的输出格式；`extraction_candidates`、`extraction_approvals` 作为评测样本与审批记录 |
| 计划三（标识符/对账） | 港股无第二事实来源，`dq_reconciliations` 对港股只能用"比较列 vs 上期主列"；租约表合并 | `hk_restated_comparative` 隔离项与信息码 |
| 外资研报规格 | 许可条款、`license.ref`、`kind='field'` 的 JSON Schema、独立摘要规则 | §8.3 上传接口、持有人路由与审计、片段 API、对非公开文档引用的发布拒绝 |
| 公司研究 / 行业研究页面规格 | 来源抽屉组件实现（Claude Design 画布后） | §9.1 契约、§9.2 待设计清单、`/api/documents/[ticker]`（含 `asOf`） |

---

## 17. 实施记录与偏差

（计划三-文档 落地后补记，格式同规格一 §14。）
