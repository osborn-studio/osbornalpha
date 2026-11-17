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
- 每次失败（包括 `payload_invalid:*`）增加 attempts；累计 ≥ 10 次后置 `failed`，出现在管理员总览"需要处理"。修复原因后重新排队（service role SQL，逐条核对 `last_error`）：
  `update broker_outbox set status='pending', attempts=0, last_error=null where event_id = '<id>';`
- 同一 `claim_key` 的 retract（seq 2）先到会在 F4 写墓碑，晚到的 register（seq 1）被忽略——重放安全。

## 6. 上传与提升异常

- `409 duplicate_document`：同一 sha256 已入库，打开既有文档。
- `500 promotion_lost`：暂存与正式对象都不存在；文档已 `withdrawn(promotion_lost)`。用同一文件重新上传：intent 路由为该 sha 创建绑定既有 `document_id` 的替换意向，提交成功后文档恢复 `uploaded`。
- 孤儿暂存对象：`POST /api/admin/broker-research/documents/orphan-cleanup`（只删 `staging/` 下过期 / 放弃意向的对象，从不删 `reports/`）。

## 7. 撤回与清除

1. 文档页"撤回"（原因必填）→ 公开 404、原文与签名链接 410、`claim.retract` 入队。
2. 需要删除原文时勾选"同时清除"或之后点"执行清除"（输入 sha256 前 8 位）：步骤 `pdf → artifacts → runs → fields_text → snippets_text → summaries → quarantine_payload`，可重复执行，只重试未成功步骤；全部完成写 `purged_at`。证据哈希、运行元数据与审计保留。清除意向先持久化；purged_at 仅表示已知路径步骤完成，未确认完成的写入仍每日反复删除。撤回但不清除的文档不进入删除对账。没有存储侧生命周期规则；owner 可日后另加。
3. 访问日志（`/admin/broker-research/access-log?document=<id>`）核对撤回前的全文访问。

## 8. 回放

`npx tsx scripts/broker-research/replay.ts --publication <id>`：从发布快照与桶内产物重建，不读活表、不写库；用于审计与对 F4 结算的核对。
