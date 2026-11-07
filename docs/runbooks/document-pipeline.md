# 披露文档管道运行手册（F3）

规格：`docs/superpowers/specs/2026-11-04-document-pipeline-design.md`；计划：`docs/superpowers/plans/2026-11-06-document-pipeline.md`；实施日志：`docs/audits/2026-11-06-document-pipeline/implementation-log.md`。数据底座（批次、隔离、新鲜度、事实库）见 `docs/runbooks/data-foundation.md`。

## 1. 组成与开关

| 组成 | 位置 | 说明 |
|---|---|---|
| 迁移一 | `supabase/migrations/20261115090000_disclosure_documents.sql` | 九表 `disclosure_documents`、`document_assets`、`document_extractions`、`document_pages`、`document_citations`、`extraction_candidates`、`extraction_approvals`、`candidate_publications`、`document_sync_scope`；视图 `disclosure_documents_public`；私有桶 `disclosure-docs`（`file_size_limit=52428800`）；全部写入经 `security definer` 函数 |
| 迁移二 | `supabase/migrations/20261115091000_fact_citations.sql` | `fact_citations`、`filing_documents`；规格二四处检查约束加 `HK`/`hkex`；`publish_hk_run`、`assert_run_evidence_complete`、`bind_filing_documents`、`insert_fact_citations`、`finish/abandon_candidate_publications`、`hk_promotion_due`、`hk_zero_output_documents`、`ensure_hk_fact_scope`、`resolve_hk_facts_quarantine` |
| 采集 cron | `/api/cron/documents-sync?source=hkexnews\|cninfo\|edgar[&limit=n]` | `vercel.json` 三条（Task 8）；批次 `producer='documents-sync'`，`dataset='documents.<source>'` |
| 抽取 cron | `/api/cron/documents-extract[?limit=n]`（默认 10，≤ 100） | **未进 `vercel.json`**，见 §9；`DOCUMENTS_EXTRACT_ENABLED` 关闭 → 认证后 200 `{skipped:'disabled'}`；批次 `producer='documents-extract'`，`dataset='documents.extract'` |
| 候选 cron | `/api/cron/documents-candidates[?limit=n]`（默认 25，≤ 200） | `DOCUMENTS_CANDIDATES_ENABLED` 独立门控；关闭 → 认证后 200 `{skipped:'disabled'}`；三阶段 candidates → auto → promote；批次 `producer='documents-candidates'`，`dataset='documents.candidates'`；港股事实新鲜度 `facts.hk` |
| 读接口 | `/api/documents/[ticker]`、`/api/documents/doc/[id]`、`…/pages/[n]`、`…/file`、`/api/citations/[id]`、`/api/citations?factId=` | 公共分支 anon 客户端 + RLS；持有人分支见规格 §8.2 |
| 管理接口 | `/api/admin/documents/[id]/reprocess`、`/api/admin/documents/candidates`（列表）、`…/candidates/[id]`（决定）、`…/candidates/regenerate`、`/api/admin/documents/approvals`、`/api/admin/documents/hk-quarantine/[id]` | `requireAdminUser`；POST 校验 JSON 内容类型与同源 |

三个开关统一经 `src/lib/documents/flags.ts::documentsFlag` 读取：`DOCUMENTS_SYNC_ENABLED`、`DOCUMENTS_EXTRACT_ENABLED`、`DOCUMENTS_CANDIDATES_ENABLED`；仅小写 `'1'` 或 `'true'` 开启，其他值和未设置均关闭。三个 cron 都先认证，关闭时返回 200 `{skipped:'disabled'}`，不装配依赖、不读写库、不建批次。缺少 CRON_SECRET → 503；错误 bearer → 401。开关控制 cron；本机脚本不受开关阻挡，管理员确认仍会立即尝试晋升，不能把关闭 cron 当成全局写禁令。

环境变量：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`CRON_SECRET`、`EDGAR_USER_AGENT`（真实联系方式；本机脚本也要）、`VERCEL_GIT_COMMIT_SHA`（cron 只认完整 40 位 SHA，缺失 → 503 `code_version_unavailable`）、`DOCUMENTS_EXTRACT_ENABLED`（抽取 cron 与重处理的就地抽取）、`DOCUMENTS_SYNC_ENABLED`、`DOCUMENTS_CANDIDATES_ENABLED`（候选 cron）。

pdf.js 固定 `pdfjs-dist@4.10.38` legacy build；PDF/HTML 在 `node:worker_threads` 中执行，主线程继续续租。esbuild 生成 `build/extract-worker/extract-worker.mjs` 和 `extract-worker.manifest.json`；`npm run dev/build` 的 `predev/prebuild` 自动构建，`scripts/documents/extract.ts` **每次都重建**。manifest 记录 extractor/table 版本与源码哈希；部署 preflight 校验版本和哈希格式，不是部署源码的独立哈希复算。`next.config.mjs` 给 extract/candidates/reprocess 路由追踪 bundle、manifest、CMaps、standard_fonts 与 `legacy/build/pdf.worker.mjs`。`pdfjsAssets()` 使用文件系统目录；CJK CID 字体必须有 CMaps。worker 硬截止终止线程，堆上限 1024 MB、PDF 上限 1500 页；逐文档最长 240 s，cron 工作截止 240 s，抽取收尾最多额外 30 s（路由上限 300 s）。

**owner 启用顺序**：先完成 commander 门禁与锁，再生产应用 `20261115090000_disclosure_documents.sql` → `20261115091000_fact_citations.sql`（在 main 已锁 `20261114090000` 宏观迁移之后）→ 三开关关闭部署 → 每来源手动小批 sync → 检查回执、对象、权限后开 `DOCUMENTS_SYNC_ENABLED=1` → §9 preview worker/CJK/Storage 冒烟 → 开生产 `DOCUMENTS_EXTRACT_ENABLED=1` 并添加抽取 cron → 评审候选和零输出代激活决策后开 `DOCUMENTS_CANDIDATES_ENABLED=1` 并添加候选 cron。没有审批行时 auto 阶段不决定任何候选。

```bash
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source hkexnews --apply --limit 5
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source cninfo --apply --limit 5
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source edgar --apply --limit 5
```

当前 `vercel.json` 只有以下三条 F3 cron（UTC；其他模块的条目保留）：

```json
[
  { "path": "/api/cron/documents-sync?source=hkexnews", "schedule": "0 16 * * *" },
  { "path": "/api/cron/documents-sync?source=cninfo", "schedule": "20 16 * * *" },
  { "path": "/api/cron/documents-sync?source=edgar", "schedule": "30 3 * * *" }
]
```

## 2. 手动触发

脚本默认 dry-run（读库、可联网、**不写任何行/对象/批次/游标/租约**）；`--apply` 才写。cron 与同来源脚本不要同时跑（租约会让后到者 `skipped/leased`，但会浪费一次抓取）。

```bash
# 采集（无截止；--issuer 可重复，接受 issuer_id 或 ticker）
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source hkexnews --issuer 0268.HK --since-year 2016
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source hkexnews --issuer 0268.HK --since-year 2016 --apply
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source edgar --limit 5 --forms 10-K,10-Q --apply
node --env-file=.env.local --import tsx scripts/documents/sync.ts --source cninfo --issuer 600519.SH --refetch --apply

# 抽取（--document 可重复）。抽取在 worker 线程里跑，需要打包好的 build/extract-worker/extract-worker.mjs
# （build/ 不进仓库）：extract.ts 每次自动重建 bundle 和 manifest；npm run dev / npm run build 由 predev / prebuild 构建；
# 手动构建：npx tsx scripts/documents/build-extract-worker.ts。缺 bundle 的 cron/重处理批次以 worker_missing
# 失败，且不认领任何文档、不消耗尝试次数（计划审计第 5 轮 R5-P2-1）
node --env-file=.env.local --import tsx scripts/documents/extract.ts --limit 5 --apply
node --env-file=.env.local --import tsx scripts/documents/extract.ts --document <uuid> --apply

# 候选三阶段（默认 candidates,auto,promote）；只跑某些阶段用 --phases
node --env-file=.env.local --import tsx scripts/documents/candidates.ts --limit 10 --apply
node --env-file=.env.local --import tsx scripts/documents/candidates.ts --phases candidates --extraction <uuid> --apply

# 港股晋升（规格二运行模型）；--due 取 promotionDue 选出的发行人
node --env-file=.env.local --import tsx scripts/documents/promote-hk.ts --issuer 0268.HK
node --env-file=.env.local --import tsx scripts/documents/promote-hk.ts --due --limit 20 --apply

# cron 路由（部署后）
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/documents-sync?source=hkexnews&limit=5"
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/documents-extract?limit=1"
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/documents-candidates?limit=5"
```

回执只含码、键与计数（不含消息正文）；完整错误在 `ingest_batches.errors`。

## 3. 重处理与再生

- **重抽取**（抽取器升级、页面损坏）：`POST /api/admin/documents/<id>/reprocess`，JSON `{"stage":"extract"}`。当前 `(EXTRACTOR_VERSION, TABLE_ALGO_VERSION)` 已有抽取 → 409 `revision_exists`（同版本不重抽；`document_pages` 只增不减）；否则文档回 `stored`、`extract_attempts=0`，`documentsFlag(DOCUMENTS_EXTRACT_ENABLED)` 为真且有部署 SHA 时就地跑一次抽取，否则等 cron 或 `extract.ts --document <id> --apply`。旧抽取的引用保持 `integrity='ok'`、`currentExtraction=false`。
- **重分类**（分类规则升级）：`{"stage":"classify"}`；上传文档 409 `not_classifiable`。
- **候选再生**（`HK_LABEL_GEN` / `HK_RULES_VERSION` 升级、修复生成器后）：`POST /api/admin/documents/candidates/regenerate`，`{"filter":{"source":"hkexnews"}}`（或 `issuer_id` / `document_id`），或 `candidates.ts --regenerate --filter source=hkexnews --actor <admin uuid> --apply`。当前抽取版本中已完成（done/failed/exhausted）的回 `pending`；下次候选运行重新生成。通过检查的人工确认按 `fingerprint` 继承到新候选；自动决定不继承（审批绑定 extractor_ref 与版本，规格 §7.3）。
- **发布代升级**（`HK_PUB_GEN`）：`HK_RULES_VERSION`、`HK_LABEL_GEN`、`EXTRACTOR_VERSION`、`TABLE_ALGO_VERSION` 任一变更都必须同时增加 `HK_PUB_GEN`，`hk-facts/promote.test.ts` 钉住此组合。相同代已有事实的值或证据定位不同，晋升以 `pub_gen_required` 失败，不能静默复用旧事实。改常量后部署；`promotionDue` 条件 (ab)/(c)/(d) 让受影响发行人下次 cron 以新代重新发布；零输出文档的 filing 进 manifest 以隐藏旧代行（R5-13）。

## 4. 悬空批次、租约与卡住的行

工作者在 `finishBatch` 前被杀（Vercel 超时、OOM）会留下 `status='running'` 的批次。确认 `started_at` 早于 10 分钟（cron `maxDuration=300`）后标 failed：

```sql
update public.ingest_batches
   set status='failed', finished_at=now(),
       errors=errors || '[{"code":"orphaned_running","message":"marked failed by document-pipeline runbook §4"}]'::jsonb
 where producer in ('documents-sync','documents-extract','documents-candidates')
   and triggered_by='cron' and status='running' and started_at < now() - interval '10 minutes';
```

脚本批次（`triggered_by='script'`）无截止，可以合法地跑很久：先确认进程已不在，再去掉 `triggered_by` 条件单独处理。抽取、候选与晋升在每个写入阶段前续租（`renew_document_extract_lease` / `renew_candidates_lease` / `renew_hk_fact_lease`；采集用 `renew_document_sync_lease`，不计尝试次数）；租约过期且已被别的批次认领时，原批次在下一个写入阶段前得到 `lease_lost` 并停止写入（计划审计 P2-7）。

**租约不要手工清**：三类租约（`document_sync_scope.lease_*`、`disclosure_documents.extract_lease_*`、`document_extractions.candidates_lease_*`）TTL 600 s，到期后下一次 claim 自动接管；`extract_attempts` / `candidates_attempts` 在 claim 时计数，第三次失败后终态 `extract_failed` / `exhausted`。HK 晋升的规格二运行：本批次崩溃留下的 `staged` 运行由下一次 `beginRun` 在新租约下废弃（promote 第 0b 步），不要 `abandon_sync_run` 别人的运行。

查看：

```sql
-- 持有中的采集租约
select issuer_id, source, lease_batch_id, lease_until, last_status, last_attempt_at
  from public.document_sync_scope where lease_until > now() order by lease_until;
-- 抽取：等待中 / 已重试 / 终态失败
select status, count(*), max(extract_attempts) from public.disclosure_documents group by status;
select document_id, source, source_ref, extract_attempts, extract_lease_until
  from public.disclosure_documents where status='stored' and extract_attempts > 0 order by extract_attempts desc limit 50;
-- 候选：当前抽取的状态分布（只看 current_extraction_id）
select e.candidates_role, e.candidates_status, count(*)
  from public.document_extractions e join public.disclosure_documents d on d.current_extraction_id = e.extraction_id
 group by 1, 2 order by 1, 2;
-- HK 规格二运行与本规格发布行
select run_id, issuer_id, status, mapping_gen, batch_id, started_at from public.fact_sync_runs where market='HK' and status='staged';
select state, pub_gen, count(*) from public.candidate_publications group by 1, 2 order by 1, 2;
```

`candidate_publications` 长期 `staged` 且其事实 `quarantined`：等隔离项裁决（§8）；其运行已 `abandoned`：下一次 promote 第 0a 步会把它们转 `abandoned` 并重新暂存。

## 5. 孤儿对象

对象按内容寻址（`blobs/<sha256>.<ext>`、`extractions/<content_sha>/<pages_sha>.pages.json`），写行之前先上传；行写失败会留下无行引用的对象（无害：同字节下次复用）。只在需要回收空间时清理，先导出清单，**托管库**执行（本地 harness 没有 `storage.objects`）：

```sql
select o.name, o.created_at, (o.metadata->>'size')::bigint as bytes
  from storage.objects o
 where o.bucket_id = 'disclosure-docs'
   and o.created_at < now() - interval '1 day'
   and not exists (select 1 from public.disclosure_documents d where d.storage_path = o.name)
   and not exists (select 1 from public.document_assets a where a.storage_path = o.name)
   and not exists (select 1 from public.document_extractions e where e.pages_json_path = o.name)
 order by o.created_at;
```

删除经 Storage API（`supabase.storage.from('disclosure-docs').remove([...names])` 或控制台），不要直接 `delete from storage.objects`。不要删除任何被上面三列引用的对象（文档行与抽取行不可删，删对象会让 `file`/`layout=1` 永久 500）。

## 6. 回填与轮询游标

```sql
-- 每来源进度：回填完成数、到期数、失败数
select source, count(*) filter (where backfill_done) as backfilled, count(*) filter (where not backfill_done) as backfilling,
       count(*) filter (where next_due_at <= now() and priority > 0) as due, count(*) filter (where last_status='failed') as failed
  from public.document_sync_scope group by source order by source;
-- 某发行人的游标（{segment, last_ref, settled, attempts, seq}；{} = 从头/无进行中的窗口；按 source_ref 续跑，计划审计 P2-5）
select source, priority, reasons, fetch_key, backfill_done, backfill_cursor, poll_cursor, next_due_at, last_status
  from public.document_sync_scope where issuer_id = '<uuid>';
-- 回填卡在同一项（attempts[source_ref] 递增；第三次失败的项以 document_fetch_exhausted 隔离后前进）
select s.issuer_id, s.source, a.key as source_ref, a.value::int as attempts from public.document_sync_scope s
 cross join lateral jsonb_each_text(coalesce(s.backfill_cursor->'attempts','{}'::jsonb)) a
 where a.value::int >= 2 order by s.source;
```

EDGAR：`files[]` 未核对（`EDGAR_FILES_VERIFIED=false`）时 `recent` 走完不置 `backfill_done`、回执 `coverage_summary`，`next_due=now+1d`——这是有意的，见 §10(a)。要让某发行人从头回填：只能经 `advance_document_cursor(…, p_cursor => null, p_done => false, p_reset => true)`（持租约；不带 `p_reset` 时游标只进不退——已完成的回填不能改回未完成、`seq` 必须递增，否则 `cursor_regression`，计划审计 P2-4）或等待 `reconcile` 新行；不要直接 `update document_sync_scope`。

## 7. 候选、检查、审批与自动决定

- 列表：`GET /api/admin/documents/candidates?status=candidate&issuer=<uuid>&limit=50`（`status` / `extraction` / `issuer` 至少一个；`extraction` 优先于 `issuer`；翻页带回 `cursor`）；决定：`POST /api/admin/documents/candidates/<id>`，`{"status":"confirmed"|"rejected"|"candidate"}`。`checks_passed=false` 的候选确认 → 409；`promoted` 不可回退。
- 审批（决策 C，默认无审批行、全部人工）：先跑评测（§10(g)），`precision` 与 `recall` 都 ≥ 0.95 才可能写入：`POST /api/admin/documents/approvals`，JSON `{extractorRef:'hk-facts/1/hk-facts/1.0', extractorVersion, tableAlgoVersion, codeVersion, concepts:[…], goldSha256, precision:'0.97', recall:'0.96', reportPath:'docs/audits/2026-11-06-document-pipeline/eval-hk-facts-<date>.json'}`（版本串取评测报告里的值；`reportPath` 必须以 `docs/audits/` 开头；`precision`/`recall` 是十进制字符串）。路由不自动读取报告文件；owner 必须核对报告、gold 与版本一致后提交，不能只填达标数字。低于阈值 → 422 `threshold`。撤销：`POST /api/admin/documents/approvals/<id>/revoke`，同源、管理员会话与 `Content-Type: application/json`（可发 `{}`）。数据库时钟写 `revoked_at`；重复撤销返回 `alreadyRevoked:true`，不重复审计。
  撤销后，已自动确认但未发布的候选在下一次暂存时回到 `candidate`（`stage_candidate_publication` 提交回退并报 `approval_revoked`，该发行人的本次晋升整体废弃、下次重来）。
- 信息码（不降级批次，`src/lib/dq/batches.ts::F3_INFO_CODES`）：`locate_ambiguous`、`period_unparsed`、`unit_ambiguous`、`label_ambiguous`、`not_consolidated`、`restated_comparative`、`en_zh_mismatch`、`extractor_disagreement`、`llm_uncited`。持续出现的码按抽取查 `ingest_batches.errors`，修生成器后走 §3 再生。

## 8. 港股隔离项裁决与钩子修复

事实级 `dataset='facts.hk' AND table_name='financial_facts'` 项经 `POST /api/admin/documents/hk-quarantine/<item id>`：`{"status":"resolved_accept","chosenFactIds":["<fact uuid>"]}` 或 `{"status":"resolved_reject"}`。同日冲突选择该项成员中的同值事实（最多 100 个）；identity_bs/identity_gp 接受全部成员。`run_pending` → 409，`invalid_choice` → 422，非 HK 项 → 404。accept 的事实提升与 `detail.hook={stage:'done',state:'done',message:'hk_no_metrics',at:…}` 在一个 SQL 事务中完成；reject 不提升事实。下次 promote 收尾相应 staged publication。

生成/检查阶段的 `hk_identity_*`、`hk_restated_comparative` 等是候选级隔离，不能把 candidate id 当 fact id 送入此路由；检查失败只能修证据/规则再生，不能强行确认。

生产候选运行在 promote 阶段、选发行人前调用 `finalizeHkHooks`，即使没有到期发行人也修复。`supabaseHookRepair` 调 `finalize_hk_hooks`，只选择已接受且 hook 未 done 的 facts.hk 项，局部合并 `detail.hook`，保留其他 detail；默认最多 500 项，每批 100，受截止约束（`ff8912f5` 接线）。此操作只修 hook，不独立提升事实；误用通用裁决路由后核对事实和既有裁决，专用路由对已关闭项返回 already_resolved，不能直接重复接受。需要恢复时由 owner 按现有裁决/事实状态安排修复，不手改 published 事实。

## 9. 冒烟（上线抽取/候选 cron 之前，owner/指挥）

(a) **pdf.js on Vercel preview**（规格 §7.1、§15 问题 3）：
1. 推一个 preview 部署；只在 preview 环境设 `DOCUMENTS_EXTRACT_ENABLED=1`。
2. 预览库里有 `2026090300863_c`（0268.HK 2026 中期报告）的 `stored` 文档（`sync.ts --source hkexnews --issuer 0268.HK --apply` 指向预览库），以及 F3-1 实测页数最多的一份年报。
3. `curl -s -H "Authorization: Bearer $CRON_SECRET" "$PREVIEW/api/cron/documents-extract?limit=1"` 两次（每次一份）。通过标准：回执 `status='success'`、`page_count` 与本机 `scripts/documents/smoke-pdf.ts <file.pdf>` 一致（0268：86）、函数未超时、Vercel 日志无 OOM；`GET $PREVIEW/api/documents/doc/<id>/pages/47?layout=1`（公共元数据/页无需会话；副本下载需会话）文本含 `簡明綜合中期利潤表`（CMaps 已打包；若中文全无，检查 `outputFileTracingIncludes` 与部署产物里的 `node_modules/pdfjs-dist/cmaps/`）。检查部署路由 `.nft.json` 和实际产物含 bundle、manifest、CMaps、字体；必须证明 worker 从这些已追踪文件启动，不依赖本机 TS 源或 tsx。记录部署 SHA、版本、耗时、内存与 CJK 字符计数。
4. 失败 → 降级（§12）：不加 cron 条目，抽取与候选只在本机脚本跑；记录失败形态。
(b) **Storage SDK 行为**（§15 问题 6）：对同一文档跑两次 `sync.ts … --apply --refetch`，第二次回执 `duplicates≥1` 且无 `object_put_failed`。同步会在上传之前查重，因此另在 preview 对同一合法内容寻址路径、相同字节直接调用两次 `ObjectStore.put`，验证第一次 created / 第二次 exists（SDK 原始重复错误形态也记录）；`GET /api/documents/doc/<id>/file` 拿到签名 URL，立即下载 200，301 秒后再下载应失败（记下状态码与错误体）。
(c) 结论（日期、部署 URL、两份文档的耗时与内存、上面每一项的结果）写进本节末尾的"冒烟记录"。

**通过后（owner）**：在 `vercel.json` 的 `crons` 数组**末尾**追加两条，部署：

```json
[
  { "path": "/api/cron/documents-extract", "schedule": "45 * * * *" },
  { "path": "/api/cron/documents-candidates", "schedule": "25 * * * *" }
]
```

以上为要追加的两个对象，合入现有 crons 数组，不替换其他条目。

分别启用生产 `DOCUMENTS_EXTRACT_ENABLED=1` 与 `DOCUMENTS_CANDIDATES_ENABLED=1`，候选开关独立于抽取。小时级 cron 需要 Vercel Pro（规格 §14）；未确认套餐前不要部署这两条。

冒烟记录：（待填）

## 10. 真实网络核对（指挥执行期；结果写本节与实施日志）

(a) **EDGAR**（§15 问题 1）：commander 已报告 2026-11-07 live 核对：`data.sec.gov` submissions 的 `filings.files[]` 元素为 `{name, filingCount, filingFrom, filingTo}`，Archives `index.json` 为 `directory.item[]`。这是 owner 提供的核对记录，本次未联网复验。代码的 `EDGAR_FILES_VERIFIED` 仍是 false；历史响应的列数组与 `*_htm.xml` 命名仍需留存真实夹具并验证，不能因文字记录自动宣布十年回填完整。用一家公司（如 AAPL）录 `submissions` 的 `filings.files[]` 分页文件与一份申报目录 `index.json`，与 `src/lib/documents/sources/edgar.ts` 的假设对照；一致后另开提交把 `EDGAR_FILES_VERIFIED` 改 `true` 并补真实夹具用例（`sync-us.integration.test.ts` 当前用的是合成的 `fixtures/edgar/index-000132165526000039.json`）。
(b) **HKEX 英文搜索**（§15 问题 2）：录 `lang=en` 标题搜索页；整合时已确认 0268 的中期报告**只有一份中英双语 PDF**（`…_c.pdf`），`…_e.pdf` 返回 HTTP 200 的 HTML 错误页（同步按 `unexpected_mime` 隔离，不入库）。若英文搜索列出的仍是同一 `_c` 文件或不存在的 `_e` 文件，把 `src/lib/documents/deps.ts` 的 hkexnews 适配器设为 `languages:['zh']`（否则每个轮询窗口都会为 `_e` 产生一条 `unexpected_mime` 隔离项），并记规格 §17 偏差。
(c) **HKEX 条数上限**：核对标题搜索按年范围是否截断条数；现有适配器已按 total-records 递归拆日期窗口；单日仍不足报 `hkex_truncated`，未解析行报 `layout_changed`。核对真实页面总数元数据与拆分结果。
(d) **巨潮 `category`**（§15 问题 4）：以规格二核对结果为准，确认定期报告四类的取值与排除词。
(e) **三来源各 3 家 dry-run**（§13）：`sync.ts --source <s> --issuer <3 家> --since-year 2016`（不加 `--apply`），回执 JSON 存 `docs/audits/2026-11-06-document-pipeline/dry-run-<source>-<date>.json`；记录首 20 个港股发行人的实测字节数与最大页数（决策 E）。
(f) **录制 0268 夹具**：当前已提交 `2026090300863_c.pages.json`，无需重复覆盖。如果目标 checkout 未带夹具，使用：
```bash
npx tsx scripts/documents/record-fixture.ts --hkex https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf --doc-class interim_report --pages 44-48,51-52
```
只存主表页（BS 44–46、IS 47、单独的综合收益表 48——保留它以便回放"综合收益表不作 IS"的真实路径、CF 51–52）；头部保留整份 `page_count=86` 与 `content_sha256`，`pages_subset:true`。输出行的 `cjk_chars` 必须 > 0（否则 CMaps 未生效，脚本 exit 1）。录制后检查并提交 `src/lib/documents/fixtures/hkex/2026090300863_c.pages.json`，由 commander 重跑 `npm run test:db`：`sync-hk.integration.test.ts` 的录制层随之运行。整合时用同一文件本机实测：带 CMaps 的抽取 + 生成 + 检查得到 32 条候选、全部 `checks_passed`，值与印刷版一致（如收入 3,625,422 千元、总资产 13,903,111 千元）。
(g) **黄金集与评测**：黄金集（3 家 × 2 期 × 18 概念，含页码与"缺失"）由实施者之外的人抄进 `src/lib/documents/fixtures/gold/hk-facts.json`，全部录完把 `ready` 置 true；然后
```bash
node --env-file=.env.local --import tsx scripts/documents/eval-hk-facts.ts --source db --apply
node --env-file=.env.local --import tsx scripts/documents/validate-extraction.ts --apply
```
`--source fixtures` 只用于离线开发，不能作审批证据；数据库评测要求所有非 pending gold 文档齐全、版本一致；真实字节验证同时要求 bytes/text 与逐条 gold 对齐，缺文档或不一致非零退出。两脚本默认仅 stdout，`--apply` 才写报告。当前 gold `ready:false`，不可据此批准 auto。报告落 `docs/audits/2026-11-06-document-pipeline/{eval-hk-facts,real-bytes-validation}-<date>.json`（`validate-extraction` 对 `--pages` 子集夹具只比对已录页的 `text_hash`）。
(h) **引用回溯抽样**（§13）：F3-4 上线后随机抽 5% 已发布港股事实人工核对页码与片段，记 `docs/audits/2026-11-06-document-pipeline/citation-sampling-<date>.md`。

## 11. 回滚

生产优先做可逆暂停：三开关全部关闭并重新部署，移除已添加的 documents cron（当前三条 sync，未来可能五条）；停止本机 apply 脚本和管理员确认/重处理操作。等待在途运行完成或租约到期，保留只读接口、旧页、引用、对象和已发布事实。撤销自动审批不会撤回既有已发布事实；不要降低 HK_PUB_GEN 或直接修改 filing.mapping_gen 来回滚，修正经新代重新发布并复核零输出影响。

先导出两份迁移涉及的全部行、事实/filing 绑定、审批/发布/引用、批次/隔离审计和 Storage 对象清单。Schema 拆除只用于 owner 明确批准的退役/临时库演练，不是日常回滚：停止所有写入者，核对依赖，先撤迁移二自有 RPC/策略/表（含 `renew_hk_fact_lease`），再迁移一自有 RPC/策略/表（含 `renew_document_sync_lease`、`fail_document_extract_terminal`、`revoke_extraction_approval`、`finalize_hk_hooks`）。按两份 SQL 的全部实际签名枚举，不依赖通配符漏掉助手；先解除 `dd_current_extraction_fkey` 的文档↔抽取环及外部依赖，后按外键逆序拆除，不盲用 CASCADE。四处 market 与 filings source/origin 约束只有在所有 HK/hkex 行及依赖清除并核对后才可恢复。保留审计批次和新鲜度记录。

桶只在引用数据已退役、备份可恢复且 owner 明确批准删除后经 Storage API 清空/删除；不要删除仍被旧引用使用的对象。commander 在独立临时库演练并记录；本次未运行 DB 演练，也未修改迁移锁。

## 12. 错误定位与收据

HTTP 200 不是管道成功的充分条件：区分 `{skipped:'disabled'}` 与 `receipt.status/ok`，并查 `ingest_batches.errors` 的完整消息。批次六计数为 fetched/inserted/duplicates/versioned/quarantined/failed；纯信息码或隔离不自动降级，非信息错误有落地行则 partial、无则 failed。无到期项是 idle 心跳。新鲜度与单次批次状态分开看，连续失败才进入 error。

| 码 / 信号 | 实际行为与处置 |
|---|---|
| `worker_missing` / `worker_stale` | bundle 不在，或 manifest 缺失/不可读/版本不符；认领前失败，不耗 attempts。重新构建并核对 tracing，不能重试耗尽正常文档；reprocess setup 错为 503（重置文档已提交）。 |
| `extract_timeout` / `extract_error` / `too_many_pages` | 硬截止终止 worker；错误/OOM/超过 1500 页按文档失败；常规 claim 最多三次后 extract_failed。检查日志和页数，必要时本机抽取。 |
| `content_hash_mismatch` | 首次发现即 `fail_document_extract_terminal` 原子设置 extract_failed、清租约、建 quarantine；终态不等三次。核对存储字节与哈希后再决定恢复；另有 terminalize 错说明数据库提交未证实，先查状态。 |
| `object_get_failed` / `object_put_failed` | 检查桶与服务权限；pages.json put 失败不 finishExtract，保留租约至过期；行前对象可能成为孤儿。 |
| `document_too_large` / `unexpected_mime` | 52,428,800 字节上限；HKEX/cninfo 只收 PDF，HTTP 200 HTML 错误页仍隔离。 |
| `document_url_rejected` | 来源 URL 不在允许主机/协议/端口规则内；适配器拒绝项有隔离与回执，核对来源，不能直接放开任意主机。 |
| `document_ref_conflict` | 同 source/ref 属另一发行人（同哈希也冲突）；先于去重校验，不转移所有权。 |
| `list_failed` / `layout_changed` / `hkex_truncated` | 列表不完整、不解析或单日仍截断；不推进段。保存原始响应，修适配器后再跑。 |
| `fetch_failed` / `asset_fetch_failed` / `document_fetch_exhausted` | item 重试按 ref 计，三次耗尽隔离；payload 保留次数和最后错误，前次在批次中。open quarantine 会跳过；解决后重放时重新判断，不永久 settled。 |
| `lease_lost` / `cursor_regression` | 停止写；租约到期让新批次接手。游标只经 RPC，显式 reset 才可后退；基础设施/约束错误不冒充 item 错误消耗尝试。 |
| `pub_gen_required` | 同代现有事实值或 raw_hash 证据定位与候选不同；增加 HK_PUB_GEN 并重规划，不复用陈旧事实。 |
| `evidence_failed` / `evidence_incomplete` / `stale_plan` | 废弃本运行及关联，下次重新读快照规划；不能换 expectedRev 重试旧计划。证据必须与候选 citations + payload 完全相同，含 unit_currency；period 每事实最多 64 个不同引用。 |
| `approval_revoked` | 自动确认的未发布候选回 candidate（SQL 提交回退后适配器报错）；整发行人本次晋升废弃。已发布事实不倒退。 |
| `label_ambiguous` / `unit_ambiguous` / `period_unparsed` / `locate_ambiguous` | 无候选并记信息码；检查 label/EPS 子单位、表头与期间，不补猜值。 |
| `identity_skipped` | `skipped_summary` 消息、脚本 receipt.identity.skipped（逐抽取也有 identity）；checkTally 另返回 columns.skipped，HTTP 精简回执不含这些 tally，需查完整脚本回执/批次消息中的缺输入列记录；check 为 `blocking:false, passed:null, detail.applicable:false`，不应当作恒等式验证通过。 |
| `no_text_layer` | 正常写入空文本抽取版本并记信息码，不 OCR，不等同失败。 |
| `revision_exists` / `upload_conflict` / `audit_failed` | 同版本抽取不重写；同 owner/哈希不同权限或许可冲突；私有读取审计失败则 500、不返回内容。 |

来源 `politeHttp` 主机 allowlist 在 `sources/shared.ts::HOST_POLICY`；每跳重定向先检查（最多 3 跳）；cninfo 查询主机 www.cninfo.com.cn 允许 HTTP，其余只允许 HTTPS，拒绝 URL 用户信息和非默认端口，SEC 联系人 User-Agent 只发 SEC 主机，其他来源用无联系方式 UA。此保证是生产来源适配器的策略；`record-fixture.ts` 和 `validate-extraction.ts` 的人工网络脚本仍自行使用 EDGAR_USER_AGENT/default UA，运行时应知其接收方。列表限 20 MB，429/503 尊重 Retry-After 与预算退避；完整性失败不当空列表。

## 13. 接口请求、owner 决策与退出门禁

以下作为 PR body 的跨模块请求（原规格 §16）：

| 对方 | 请求 / 边界 |
|---|---|
| 规格二事实库 | `/api/facts`、`/api/filings` 支持 `.HK` 与 `citations=1`；当前 F3 用文档路由和 `/api/citations?factId=` 验证。 |
| 规格二派生层 | 定义 HK metrics 口径与 `financial_metrics.market/basis`，物化及 state_rev 安全重试；F3 不物化 HK 指标。 |
| 规格二类型 | 扩展 `Market/Source/Origin` 的 HK/hkex 类型后收敛 `hk-facts/facts-port.ts` 的局部断言。 |
| 规格二发布授权 | `publish_sync_run` 必须按 market 限定 HK 发布经证据校验入口。当前 service_role 仍可绕过 `publish_hk_run` 发布无证据 HK 运行；`publish-boundary.test.ts` 防止 F3 调用旁路，集成测试记录 residual risk，但不能阻止其他 service_role 调用者。 |
| 规格二 / 通用 DQ | 将 facts.hk accept 分派给专用裁决，核对已接受项的 hook 修复；定义 US/CN filing↔document 绑定授权。 |
| F4 判断 | 输入快照保留 citation_id；模块发布时自行调用 publish_citations，只发布可公开证据。 |
| F6 评测 | 统一 gold 格式/阈值与未来 LLM 候选评测 harness；对齐 eval 输出与审批版本。 |
| 计划三标识符/对账 | HK 没有第二事实源，比较列检查不能冒充跨来源对账；通用租约合并另定。 |
| 外资研报 | 明确 license.ref/许可范围、field JSON Schema 与独立摘要；使用上传、持有人读与审计接口。 |
| 公司/行业页面 | 来源抽屉与候选工作台按 Claude Design 画布后实施；采用 §9.1 的版本、时点、完整性及许可状态。 |

owner 待决定/执行：

- §4.11(d) **零输出代激活**：实现会在 primary 当前抽取 candidates_status=done、旧 filing.mapping_gen < 新代时推进 filing，即使新候选仍 candidate 待人工复核也可能隐藏旧事实。并不只限“生成了零条候选”。决定接受此空窗还是要求新一轮已审候选就绪；本次只记录，不改语义。
- 是否启用自动决定（默认无审批）；独立抄录 3 家 × 2 期 × 18 概念 gold（含 missing）并审阅完整 DB eval/真实字节报告；每个审批精确率与召回率均须至少 0.95。
- 存储容量/50 MiB 上限、首 20 家文件量与最大页数；许可 ref 登记与片段范围（默认仅持有人）；HKEX 周期性重核验节奏（当前只在回填/轮询窗口发现替换）。
- 维持默认范围 A=in_scope、B=定期报告，或明确批准扩大；preview 冒烟与小时 cron 套餐确认、环境和生产迁移、三来源首批小规模 apply。
- 留存真实 lang=en、EDGAR 历史/索引与 cninfo category 回执；三来源各 3 家 dry-run；生产 PostgREST max_rows/超过 1000 行分页验证；上线后随机 5% 事实引用人工抽样。

本次 Codex 只执行 npm test/typecheck/lint，精确结果见 [实施日志](../audits/2026-11-06-document-pipeline/implementation-log.md)。commander 执行：

```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations
```

仅全门禁通过后 commander 将两份迁移文件字节 SHA-256 条目追加到 `supabase/migrations.lock.json` 末尾；失败不锁。随后按原 T19 补 `npm run check:migration-history` 和 `npm run build` 的证据，生产发布仍待上述 owner 步骤；本次不宣称这些命令或上线验收已通过。
