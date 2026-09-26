# 采集器设计（WP-A4，第一切片） / Collectors design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§5.1、§8.2 WP-A4、§14.1。基于 main（含 A1 Source 扩展、A2 实体键）。用户已确认：第一切片只做官方三源 EDGAR、巨潮、HKEX；公告正文多为 PDF，第一切片存标题 + 元数据 + 链接，EDGAR 取主文档 HTML 转文本；财联社/东财新闻与招标平台放第二切片。设计已批准。

## 目标 / Goal

对 A2 `in_scope` 公司，按市场从官方披露源拉取新公告/文件，写入 `research_source_documents`（`permission=public`、`market`、`event_time`、`available_at`、`entity_ids`），同 URL 内容变化时 `source_version` 递增；每源独立成功/失败回执，一源失败不阻塞其他源；限速与 User-Agent 合规；测试全部用录制夹具，不联网。

## 非目标 / Non-goals

- 不做 PDF 正文抽取（巨潮/HKEX 的 `raw_text` = 标题 + 类型 + 日期 + 链接；PDF URL 进 `metadata.document_url`，后续本地抽取时以 `source_version` 递增补正文）。
- 不做新闻源与招标源（第二切片），不做去重聚簇（A5），不触发 fan-out（A6 自己按窗口读 Source）。
- 不做定时调度（"连续 5 个工作日每源有数据"由脚本按日运行后在回执里体现）。
- 不接触生产库。

## 接口 / Contracts

```ts
// src/lib/research/ingest/collectors/types.ts
interface CollectorCompany { entity_id: string; names_en: string[]; names_zh: string[]; home_market: 'A'|'HK'|'US'|'other'; cik: string|null; cninfo_org_id: string|null; exchange_codes: string[] }
interface CollectOptions { ctx: ResearchCtx; companies: CollectorCompany[]; since: string /*ISO*/; until?: string; fetch?: typeof fetch; now?: () => Date; userAgent?: string; maxPerCompany?: number }
interface CollectFailure { company: string|null; stage: 'lookup'|'list'|'document'|'ingest'; message: string; url?: string }
interface CollectReceipt { source: 'edgar'|'cninfo'|'hkexnews'; started_at: string; finished_at: string; companies: number; fetched: number; inserted: number; duplicates: number; versioned: number; skipped: number; failures: CollectFailure[]; ok: boolean /* failures.length === 0 */ }
type Collector = (opts: CollectOptions) => Promise<CollectReceipt>
```

### 写入（`collectors/write.ts`）
`ingestVersioned(ctx, input)`：`ingestSource` 之前按 `url` 查同用户既有行：无 → `source_version='1'`；有且 `content_hash` 相同 → 交给 `ingestSource` 走去重（`duplicate`）；有且内容不同 → `source_version = max+1`（新行，旧行保留）。为此 `IngestSourceInput` 增加可选 `source_version`（`^[1-9][0-9]{0,8}$`，默认 `'1'`）与 `origin_type`（A1 枚举），插入语句带上。回执统计 `inserted/duplicates/versioned`。

### 三源
- **EDGAR**（`edgar.ts`，`market='US'`）：`GET https://data.sec.gov/submissions/CIK{cik 10 位}.json`（UA 必带 `EDGAR_USER_AGENT` 或默认 `OsbornAlpha research <email>`；≥100ms 间隔 ≤10 req/s）；取 `filings.recent` 中 `acceptanceDateTime ≥ since` 且 `form ∈ EDGAR_FORMS`（默认 `8-K, 10-Q, 10-K, 6-K, 20-F, S-1, 424B*, DEF 14A, SC 13D/G`；Form 4/144 默认排除，可配置）；主文档 `https://www.sec.gov/Archives/edgar/data/{cik}/{acc 无连字符}/{primaryDocument}`：`.htm/.html` → 去标签转文本（≤200k 字符），其他类型 → 标题 + 描述；`source_type='FILING'`、`available_at=acceptanceDateTime`、`event_time=filingDate`、`published_at=filingDate`、`trust_level='HIGH'`、`metadata={accession_number, form, primary_document, document_url, collector:'edgar'}`。
- **巨潮**（`cninfo.ts`，`market='A'`）：orgId 缺失时 `POST /new/information/topSearch/query`（`keyWord=<6 位代码>`）按 `code` 精确匹配取 `orgId`（回执 `lookups`）；`POST /new/hisAnnouncement/query`（`stock=<code>,<orgId>`、`column=sse|szse`、`tabName=fulltext`、`seDate=<since>~<until>`、`pageSize=30`，翻页至 `hasMore=false` 或 `maxPerCompany`）；每条 → `source_type='FILING'`、`title=announcementTitle`、`url=http://static.cninfo.com.cn/<adjunctUrl>`、`raw_text=标题 + 公告类型 + 日期 + 链接`、`event_time=announcementTime`、`available_at=now()`、`metadata={announcement_id, sec_code, org_id, adjunct_type, document_url, collector:'cninfo'}`；≥500ms 间隔。
- **HKEX**（`hkexnews.ts`，`market='HK'`）：`POST https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=zh` 表单（股票代码、日期范围，字段名以录制的表单为准），HTML 表格解析（日期时间、代码、简称、标题、PDF 链接）；`source_type='FILING'`、`raw_text=标题 + 类别 + 日期 + 链接`、`event_time=发布时间（HKT → UTC）`、`available_at=now()`、`metadata={stock_code, document_url, collector:'hkexnews'}`；≥1s 间隔。HTML 结构变化 → 该源 `failures[{stage:'list', message:'layout_changed'}]`，不抛。

### 编排（`collectors/run.ts`）
`collectAll(opts, sources)`：按源顺序执行，每源包在 try/catch 中，任何异常变成该源的 `failures` 且 `ok=false`；公司来自 `listEntityKeys` 过滤 `in_scope`，按 `home_market` 分派（US→EDGAR，A→巨潮，HK→HKEX）；结束写审计 `collect.run`（detail = 全部回执，不含正文）。

### 脚本
- `scripts/research-collect.ts [--source edgar,cninfo,hkexnews] [--since ISO] [--until ISO] [--dry-run]`：`RESEARCH_OWNER_USER_ID` 必填；打印回执 JSON；任一源 `ok=false` 退出码 1（其他源结果已写入）。
- `scripts/entity-keys/fill-cninfo-org-id.ts`：对 `first-cohort.json` 中 `home_market='A'` 且 `cninfo_org_id` 为空的公司调用 topSearch，回填 `keys.cninfo_org_id`、`provenance.cninfo_org_id={source:'web:cninfo.com.cn', ref:topSearch URL}` 并从 `missing` 移除；`cohort.test.ts` 继续校验。本切片顺带用它把 10 家 A 股 orgId 填好。

## 测试 / Tests
- 夹具：`src/lib/research/ingest/__fixtures__/collectors/`（录制自 2026-09-26 的真实响应，EDGAR submissions 截取最近 40 条，HKEX 一页 HTML）。
- `write.test.ts`：首写 v1；同 URL 同内容 → duplicate；同 URL 新内容 → v2 新行且旧行保留；`source_version` 非法被拒。
- `edgar.test.ts`：表单过滤与时间过滤；主文档 HTML → 文本（标签、脚本、实体剥离）；`available_at` 精确等于 `acceptanceDateTime`；UA 与间隔；404 主文档 → `failures[stage:'document']` 而其他文件继续；网络异常 → 源级失败。
- `cninfo.test.ts`：orgId 缺失 → topSearch 精确匹配；翻页；`event_time` 由毫秒时间戳转 ISO；`url` 拼接；重复运行 → duplicates。
- `hkexnews.test.ts`：夹具 HTML 解析出行；时间 HKT→UTC；布局变化 → `layout_changed` 失败不抛。
- `run.test.ts`：一源抛异常，其余两源仍成功；公司按市场分派；审计写一条。
- `fill-cninfo-org-id` 纯函数测试：合并逻辑与 provenance。

## 验收 / Acceptance
`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`；Codex CLI（中等）评审无 P1；对本地库跑一次 `research-collect.ts --since <7 天前>` 三源实抓（只读公开数据，写本地库），回执存 `docs/handoffs/alpha-a4/collect-<date>.json`；不接触生产库。
