# research → analyst 建议投递（一）：playbook PAPER_TRADE 一键登记为建议

日期：2026-10-18。分支 `codex/playbook-recommendations`，基于 `main`（含 PR #78–#81）。状态：已实施（分支 `codex/playbook-recommendations`）。

## 1. 背景与边界

ADR [2026-10-17-research-analyst-portfolio-boundary.md](../../adr/2026-10-17-research-analyst-portfolio-boundary.md) 定义了三层：research 产出建议，analyst 登记、模拟、评分，portfolio 采纳。首轮 analyst 的建议全部手工登记，research → analyst 的投递是 ADR 列明的后续工作。本文做第一条投递通道：research 的 playbook 运行（`research_playbook_runs`，`proposed_action = PAPER_TRADE`）审批通过后，一键登记成 analyst 的建议。

现状事实（已核实）：

- `PAPER_TRADE` 运行只有 `memo_id` / `thesis_id`、`rationale`、`risks`、`approval_status`、`human_decision`、`review_at`（审批时间），**没有标的、没有方向**。`executeApproved()` 对它只写审计 `RECORD_ONLY`。
- memo 与 thesis 挂 `company_ids`（`research_entities`），一个 thesis 可能多家公司。标的有两处来源：`research_entity_securities`（`exchange_code` + `market ∈ A/HK/US/other`，`is_primary`，`valid_to`）和 `research_entities.ticker`（自由文本）。
- research 与 analyst 表在同一个 Supabase，research 路由由 `requireResearchUser()`（登录 + `profiles.role = admin`）门控。analyst 的 `recommendations` 表已由 BEFORE UPDATE 触发器保证只追加；`source_type` 枚举已含 `playbook`。

方向规则不变：research 向 analyst 写建议（单向）；analyst 不读 research 表；portfolio 不参与。

## 2. 决定

| 问题 | 决定 |
|---|---|
| 触发时机 | 审批通过后，在 `/research/playbooks` 上一键登记；审批流程与 API 不动 |
| 归属分析师 | 固定 kind = agent 的档案「Research Playbook」，首次登记时懒创建；模型名等来源信息进 `source_ref` |
| 多公司 | 表单多选公司，每家一条建议，一次提交批量写入 |
| 实现形状 | research 侧新增两个路由（预填 GET、登记 POST），服务端批量写 `recommendations`；不走客户端拼装，不在 analyst 侧读 research 表 |

## 3. 范围

做：

- `GET /api/research/playbooks/[id]/registration`：返回一次登记所需的全部预填数据与已登记状态。
- `POST /api/research/playbooks/[id]/register`：接收用户确认后的 N 条，服务端校验、幂等、批量写入。
- `/research/playbooks` 页面：已批准的 `PAPER_TRADE` 行显示「登记为建议」按钮与内联表单；已登记的行显示「已登记 N 条 · 查看」。
- 纯函数：候选公司解析、默认值映射、幂等分集，全部有单元测试。

不做：

- 审批时自动登记（保持两步）。
- `WATCHLIST` 等其他 `proposed_action`。
- 反向同步：建议撤回不改 playbook 运行；playbook 驳回不撤建议。
- 从 `/analyst` 侧拉取 playbook。
- 多用户、团队。

## 4. 数据流

```
/research/playbooks  --GET registration-->  研究路由：读 run + thesis/memo + entities + securities
                                             + 查已存在的 playbook 建议  --> RegistrationView
用户勾选/修改  --POST register-->  研究路由：逐条 parseRecommendationInput → 幂等分集
                                    → ensurePlaybookProfile → 一次 insert N 行 recommendations
                                    → audit('playbook.register', …)  --> { created, skipped, analyst_id }
```

所有读写都在用户自己的 `user_id` 下；research 表经 RLS 与 `requireResearchUser`，analyst 表经 RLS 与 `requireUser`（同一个 Supabase 会话）。

## 5. 预填规则（纯函数 `buildRegistrationCandidates`）

输入：run、thesis（可空）、memo（可空）、这些 company_ids 对应的 entities、这些 entity 的 securities 行、已存在的 playbook 建议（见 §7）。输出 `RegistrationView`：

```ts
interface RegistrationCandidate {
  entity_id: string;
  name: string;
  ticker: string | null;      // 规范化后的建议标的
  market: 'A' | 'HK' | 'US' | null;
  ticker_source: 'security' | 'entity' | 'none';
  supported: boolean;         // false → 不可勾选（market other 或无标的）
  selected: boolean;          // 默认：supported && 未登记 && ticker 来自 securities；来自 entities.ticker（自由文本推断）的行需用户手动勾选
  registered_recommendation_id: string | null;  // 已登记过则给出
}
interface RegistrationView {
  run: { id; proposed_action; approval_status; rationale; review_at; thesis_id; memo_id };
  source_title: string;       // thesis.title 或 memo.title
  defaults: { action: 'buy'; confidence: number; horizon: 'short'|'mid'|'long'|null; recommended_at: string; rationale: string; thesis_ref: string | null };
  candidates: RegistrationCandidate[];
  analyst: { id: string; display_name: string } | null;  // 「Research Playbook」已存在则给出
  registrable: boolean;       // run 是 PAPER_TRADE 且 APPROVED
}
```

规则：

- 公司集合：thesis 的 `company_ids` 优先；memo 的 `company_ids` 追加去重；都空则候选为空，`registrable` 仍可为 true 但表单只能手填一行。
- 标的：取该 entity 的 securities 中 `is_primary = true` 且 `valid_to is null` 的首行，`ticker = exchange_code`、`market = market`；没有则取 `entities.ticker` 并用 `inferCoreMarket` 推市场；再没有则 `ticker = null`。随后统一过 `normalizeSecurityTicker(ticker, market)`，结果为 null 视为无标的。`market = other` 或无标的 → `supported = false`。有主 security 行但其市场不支持时，不回退到 `entities.ticker`（securities 是人工核验过的权威记录）。同一实体有多行主 security 时按 `exchange_code` 排序取首行，保证确定性。
- 默认值：`action = 'buy'`；`confidence`：memo.confidence LOW 30 / MEDIUM 60 / HIGH 85，无 memo 50；`horizon`：thesis.horizon_weeks 的最大值 ≤ 8 → short，≤ 26 → mid，> 26 → long，无 thesis → null；`recommended_at = run.review_at`（审批时间），为空则 `run.created_at`；`rationale = run.rationale`；`thesis_ref = run.thesis_id`。
- 候选顺序：按 `companyIdsFor` 的顺序——thesis 的 company_ids 在前（保持 thesis 内顺序），其后是 memo 新增的公司；不按名称重排。

## 6. 登记请求与写入

`POST /api/research/playbooks/[id]/register` 请求体：

```ts
{
  items: Array<{ entity_id: string | null; ticker: string; market: 'A'|'HK'|'US'; action: DecisionAction; confidence?: number; horizon?: 'short'|'mid'|'long'; target_price?: number; stop_loss?: number }>;
  rationale?: string;        // 整批共用，默认 run.rationale
  recommended_at?: string;   // 整批共用，默认 run.review_at；不得晚于现在
}
```

服务端：

1. `requireResearchUser()`；读 run，不是 `PAPER_TRADE` 或 `approval_status ≠ APPROVED` → 422 `run_not_registrable`。
2. `items` 1–20 条；每条拼成 `RecommendationInput`（校验阶段 `analyst_id` 用占位 uuid，真实档案 id 在校验全部通过后再填；`source_type = 'playbook'`，`source_ref = { playbook_run_id, thesis_id, memo_id, entity_id, model: memo.provenance.model ?? null }`，`thesis_ref = run.thesis_id`，`recommended_at` 整批同值，理由默认截断到 4000 字）并过 `parseRecommendationInput`；`entity_id` 非空时必须属于该 run 的 thesis/memo 公司集合，否则 400 `entity_not_in_run`；任一条失败 → 400，响应 `{ error: { code: 'VALIDATION_ERROR', message, item_index, entity_id } }`，整批不写。批内重复按规范化后的 `(ticker, market)` 或重复的 `entity_id` 判定 → 400 `duplicate_item`。
3. 幂等（纯函数 `splitRegistration(items, existing)`）：`existing` = 该用户 `source_type = 'playbook'` 且 `source_ref->>'playbook_run_id' = run.id` 的建议；按 `(entity_id)` 命中则跳过，`entity_id` 为 null 的手填行按 `(ticker, market)` 命中则跳过。
4. 幂等分集后若无可写条目，直接返回 `{ created: [], skipped, analyst_id: 现有档案 id 或 null }`，不创建也不取消归档档案。否则 `ensurePlaybookProfile()`：按 `display_name = 'Research Playbook'`、`kind = agent` 查（活动行优先），已归档则取消归档并在审计里记 `profile_unarchived`，没有则插 `{ kind: 'agent', note: 'research playbook PAPER_TRADE 的自动归属' }`；23505 重读，仍冲突（同名的人工档案）→ 409。放在 `src/lib/analyst/store.ts`，与 `ensureSelfProfile` 同风格。
5. 一次 `insert` 全部待写行（Supabase 多行 insert 单请求）；成功后 `audit(ctx, 'playbook.register', run.id, { created_ids, skipped_entity_ids, analyst_id })`。
6. 响应 `{ created: Recommendation[], skipped: Array<{ entity_id|null, ticker, reason: 'already_registered' }>, analyst_id: string | null }`（`skipped.ticker` 为规范化后的标的）。

写 analyst 表走 `createRecommendation` 的同一套校验；但为了单请求批量插入，新增 `createRecommendations(inputs: RecommendationInput[])`（逐条校验由路由完成，store 只负责插入与 coerce）。

## 7. 「已登记」状态

不改 `research_playbook_runs` 表。已登记状态由 analyst 侧查询得出：`listPlaybookRecommendations(runId)`（`src/lib/analyst/store.ts`）= 该用户 `source_type = 'playbook'` 且 `source_ref->>'playbook_run_id' = runId` 的建议。`GET registration` 用它填 `registered_recommendation_id`；`/research/playbooks` 列表页用一次 `GET /api/analyst/recommendations?source=playbook`（现有列表路由新增 `source` 过滤参数）拿到所有 playbook 建议，按 `source_ref.playbook_run_id` 分组显示「已登记 N 条」。为此 `recommendations.source_ref` 上加一个 GIN 索引不必要（个人规模）；路由里用 PostgREST 的 `source_ref->>playbook_run_id` 过滤即可。

## 8. UI（`/research/playbooks`）

- 已批准的 `PAPER_TRADE` 行：按钮「登记为建议」；已登记过的行按钮文字改为「再登记」并显示「已登记 N 条 · 查看」，链接到 `/analyst/<analyst_id>`。
- 点击后在该行下方展开内联表单（不开新页）：
  - 顶部：来源标题、建议时间（默认审批时间 `review_at`，可改，不得晚于现在）、理由（预填 run.rationale，可编辑）。
  - 候选表：每行勾选框、公司名、标的（可编辑文本）、市场（下拉 A/HK/US）、方向（下拉六个动作，默认买入）、信心（数字 0–100）、期限（下拉）。`supported = false` 的行灰显并给出原因（无标的 / 市场不支持），用户填上标的并选市场后可勾选。已登记的行默认不勾选，标「已登记」。
  - 底部「新增一行」允许手填一家公司（`entity_id = null`）。
  - 提交后显示「已登记 N 条，跳过 M 条」，并刷新列表。
- 文案：research 页面沿用 zh 硬编码（该模块 i18n 豁免，见 `src/app/(app)/research/layout.tsx` 注释），不动 `messages/*`。

## 9. 错误与边界

- run 不存在 → 404；不是 PAPER_TRADE 或未批准 → 422 `run_not_registrable`。
- 「Research Playbook」档案被用户归档 → `ensurePlaybookProfile` 取消归档而不是新建同名（避免 23505），并在审计里记一笔。
- 同一 run 重复提交 → 全部命中幂等，`created = []`，200。
- 两条 item 指向同一规范化 `(ticker, market)`，或同一 `entity_id` → 400 `duplicate_item`；`entity_id` 不属于该 run 的公司集合 → 400 `entity_not_in_run`。
- 候选为空且用户未手填 → 表单禁用提交。
- `recommended_at` 晚于现在 → 由 `parseRecommendationInput` 拒绝（400）。

## 10. 测试

- `src/lib/research/playbook-registration.ts`（纯函数）+ `.test.ts`：
  - 公司集合 thesis 优先、memo 追加去重；
  - 标的解析优先级 security → entity.ticker → none，`other` 市场与无标的不可选；
  - 默认值映射（confidence 三档与无 memo；horizon 三档与无 thesis；recommended_at 取 review_at 再退 created_at）；
  - `splitRegistration` 的幂等分集（entity 命中、手填 ticker 命中、都不命中）。
- `src/lib/analyst/store.test.ts`：无新增纯逻辑则不加。
- 路由：typecheck / lint；`npm run build` 列出两个新路由。
- e2e：`e2e/research-setup.spec.ts` 已有凭据时才跑，不新增。
- 手工：本机无 e2e 凭据，登录态走查留给合并后在预览环境做，PR 描述里写明。

## 11. 交付物

- `src/lib/research/playbook-registration.ts` + 测试（纯函数与类型）
- `src/lib/analyst/store.ts`：`ensurePlaybookProfile`、`createRecommendations`、`listPlaybookRecommendations`；`listRecommendations` 增 `sourceType` 过滤
- `src/app/api/research/playbooks/[id]/registration/route.ts`、`.../register/route.ts`
- `src/app/api/analyst/recommendations/route.ts`：`?source=` 过滤
- `src/app/(app)/research/playbooks/page.tsx`：按钮、内联表单、已登记显示（表单拆为 `src/components/research/PlaybookRegisterForm.tsx`）
- ADR「首轮建议由人手工登记」一句改为"首条自动投递通道为 playbook PAPER_TRADE 登记"；spec §1.1 第 4 点同步

## 12. 实施顺序

1. 纯函数与类型（含测试）
2. analyst store 的三个函数 + `?source=` 过滤
3. 两个 research 路由
4. 页面与表单组件
5. 文档同步
6. typecheck / lint / build / vitest 全量
