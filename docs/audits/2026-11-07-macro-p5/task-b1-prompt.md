You are Codex gpt-6-sol implementing ONE task of an implementation plan in this repository (OsbornAlpha). Work only in this worktree; do not run `git stash`; commit only when the task says. Use TDD: write the failing tests first, run them, implement, run again, then typecheck and lint.

TASK: Task B1 of docs/superpowers/plans/2026-11-07-macro-p5.md (full text below). Spec sections §2–§3 of docs/superpowers/specs/2026-11-07-macro-p5-chaosai-essence-design.md (draft 6) are pasted after the task; the spec is authoritative where the plan is terser.

Hard rules:
- Do NOT modify any of: src/lib/macro/{regime,catalog,snapshots,read-api,flags,freshness,db,decimal,judgment-contract,types,periods}.ts, src/lib/dq/freshness.ts, src/lib/judgments/**. Only create/modify the files listed under **Files** of Task B1.
- No rule evaluation in clock-view.ts (never call matchRule / Rule.when); import RULES only for label/support lookup by rule_id; import regionWeights, pickStates, METHODOLOGY_VERSION, RULES_VERSION from regime.ts; CATALOG_VERSION, catalogById from catalog.ts; changeOf from views.ts; shiftMonthEnd from periods.ts; REGIMES from judgment-contract.ts.
- Pure function, no I/O. The F4 reader is an injected `() => Promise<F4Match>`; define the F4Match type in clock-view.ts for now (Task B2 will move it to clock-f4.ts and re-export) — keep it structurally exactly as the spec §3.3/§2.4 describe.
- Tests are vitest (node), file name *.test.ts. Follow the compact style of src/lib/macro/*.ts (single-space indent, header comment with spec references).
- Commands: `npm test -- src/lib/macro/clock-view.test.ts src/lib/macro/regime.rules-boundary.test.ts`, `npm run typecheck`, `npm run lint`.
- Final commit: ONE command, no `-n` token anywhere on the command line, e.g. `git add <files>` then `git commit -F - <<'EOF' … EOF` with message `feat(macro): clock view projection with reconciliation invariants (P5 B1)` ending in `Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>`.
- When done, print: the list of files changed, the test summary line, and any deviation from the task text with the reason.

## 仓库约定（动手前必读；每个 Codex 任务提示都附本节）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/company-research-ebd56f`，分支 `claude/macro-p5-chaosai-essence`（WP-B）；WP-C / WP-D 各自从 `origin/main` 新开分支 `claude/macro-p5-c1`、`claude/macro-p5-c2`、`claude/macro-p5-d1`…（同一工作树顺序进行）。不要 `cd` 出去，不要用裸 `git stash`。只改本任务 **Files** 列出的文件。
- **在飞行中的兄弟分支（不碰其文件）**：#125 `claude/integ-f4-macro`（`src/lib/judgments/{deps,inputs-db}.ts`、`src/app/api/judgments/[id]/route.ts`、`src/app/api/macro/{series,snapshots}/[id]/route.ts`）；`claude/macro-strategy-latency`（`src/lib/macro/db.ts`、`src/lib/macro/strategy/port.ts`）；foreign research（迁移 `20261119*`）。
- **C6 红线文件**（WP-B / WP-C 禁改；WP-D 只在 D1/D5 任务改且同 PR 注册新 F4 方法版本）：`src/lib/macro/{regime,catalog,snapshots,read-api,flags,freshness,db,decimal,judgment-contract,types,periods}.ts`、`src/lib/dq/freshness.ts`、`src/lib/judgments/methodologies/macro-regime.v1.ts`。
- **开关**：只有 `src/app/(app)/intel/macro/page.tsx` 读 `macroJudgmentsEnabled()`；`src/components/macro/**` 不得含字符串 `MACRO_JUDGMENTS_ENABLED`（含注释；`pages.test.ts` 断言）。路由用 `import {macroJudgmentsEnabled} from '@/lib/macro/flags'`。
- **判定文案**：`macro-messages.test.ts` 禁止 `judgment.*` 之外的文案含 象限|得分|margin|概率|置信度 / quadrant|score|margin|probabilit|confidence。时钟文案全部在 `judgment.clock.*`；其中再禁 概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast，唯一豁免键 `judgment.clock.notProbability`。
- **数值**：`value_text` 十进制字符串；显示用 `src/components/macro/macro-format.ts`（`formatValueText`、`typedChange`、`roundDecimalText`）；对账用响应原始数值；`Number()` 只在服务端 `clock-view.ts` 的对账比较里出现。
- **UI**：`DESIGN.md` + `src/app/globals.css` 令牌（`--accent`、`--accent-wash`、`--border-active`、`--warn`、`--text-dim`、`--bg-elevated`、`--up`、`--down`）；不写十六进制；无紫色、无渐变、无发光；圆角 ≤ 6px（`rounded`/`rounded-md`）；数字 `font-mono tabular-nums`；`[data-density="data"]`；原语 `src/components/ui/{Panel,Tag,Button}`；视觉依据画布 `https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH` P5 行（规格第 2 稿优先于画布）。
- **测试**：vitest 只跑 `.test.ts`（node），组件逻辑抽到 `.ts` 视图模型测试；`npm test -- <path>`；`npm run typecheck`；`npm run lint`（`--max-warnings=0`）；DB 测试：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db -- <path>`（只在 WP-D）；`test:migrations`（WP-D D1）；**绝不** `pkill -f "postgres -D"`。
- **提交**：`git commit` 单独一条命令，同一命令行不能出现 `-n` 记号（用 `git commit -F - <<'EOF'`），不用 `--no-verify`；信息末尾 `Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>`。
- **代码风格**：库代码沿用 `src/lib/macro` 紧凑风格（单空格缩进、文件顶部职责注释含规格条目）；组件沿用 `src/components/macro`（两空格）。
- **i18n**：`messages/zh/macro.json` 与 `messages/en/macro.json` 键集合与占位符一致（`macro-messages.test.ts`）；`macroStrategy.json` 同理（`strategy-messages.test.ts`）。
- **F4 HTTP**：读 F4 只经 `fetch(`${NEXT_PUBLIC_SITE_URL}/api/judgments…`)`，照 `src/lib/macro/strategy/f4-client.ts` 的 fail-closed 写法（3 s 超时、非 2xx/畸形 → unavailable）。



### Task B1: `clock-view.ts` — 服务端投影与七条对账不变式

**Files:**
- Create: `src/lib/macro/clock-view.ts`
- Test: `src/lib/macro/clock-view.test.ts`
- Test: `src/lib/macro/regime.rules-boundary.test.ts`

**接口（逐字实现规格 §3.3 的类型；输入是路由已读好的原始数据，函数纯、无 I/O）：**

```ts
// src/lib/macro/clock-view.ts
// Server-side projection of one frozen regime result into the clock card (spec 2026-11-07-macro-p5 §3.3–§3.4,
// version macro-clock-view/1). Pure: no I/O, no rule evaluation, no observation selection — rows come from the frozen
// manifest and macro_regime_results exactly as stored; the only arithmetic is the reconciliation report.
import {RULES,RULES_VERSION,METHODOLOGY_VERSION,regionWeights,pickStates} from './regime';
import {CATALOG_VERSION,catalogById} from './catalog';
import {changeOf} from './views';                       // 显示变化口径（bp/pp/pct/points）
import {shiftMonthEnd} from './periods';
import {REGIMES} from './judgment-contract';
export const CLOCK_VIEW_VERSION='macro-clock-view/1';
export type ClockStatus=…;  export interface ClockRow{…}  export interface QuadrantView{…}  export interface ReconciliationFailure{invariant:1|2|3|4|5|6|7;detail:string;ids:string[];delta:number|null}
export interface ReconciliationReport{ok:boolean;tolerance:number;failures:ReconciliationFailure[];per_quadrant:Record<Regime,{sum:number;score:number;delta:number}>|null}
export interface ClockInput{
 snapshot:MacroSnapshotRow&{history_ids?:string[]};        // db.snapshot(id)
 observations:ObservationRow[];                            // db.observationsByIds(snapshot.observation_ids)
 regimeRecord:RegimeRecord;                                // db.regimeOf(id)（路由已把 null 变成 record_missing）
 f4:()=>Promise<F4Match>;                                  // Task B2；只在存储对账通过后调用
}
export async function buildClockView(input:ClockInput):Promise<ClockView>;   // 规格 §3.3 的可辨识联合；非 ok 分支只有 ClockMeta（status, snapshot, regime_status, f4 元数据, diagnostics）
```

实现要点（每条都有对应测试；类型按规格第 3 稿 §3.3 的**可辨识联合**：只有 `status:'ok'` 分支含数值字段，其余分支只有 `ClockMeta` + `diagnostics[]`）：
0. 优先级固定（规格第 4 稿 §3.3）：snapshot_not_active（路由）→ version_unsupported → integrity_error（manifest id 读不到 / 同序列同期多版本 / 角色异常）→ record_missing → **存储对账：不变式 1、2、4、8，regime 非 null 再 3、5、6 → `reconcile_failed`（在 F4 之前，总会执行并 `console.error` 记录差值）** → F4（unavailable / none / earlier / ineligible：lifecycle ∉ {open, settled}）→ 不变式 7 → ok。`regime_status` 任何状态下都算出（只作文案）。不变式 1 还要求 `contribution.observation_id` === 该序列 manifest 中最新观测（period_end 最大、version 最大）；不变式 5 用 Σ r6 贡献重建未舍入 norm（`|r6(N'[q]) − norm[q]| ≤ 2e-6`，margin 容差 1e-4）；不变式 7 的 F4 margin 与 `r6(100×(norm[p]−(norm[s]??0)))`（存储 r6 norm）比较，容差 1e-6；两份现有 F4 fixture（US margin 11.023622、CN 28.333333）必须作为 ok 用例通过。
1. 版本门槛：`snapshot.catalog_version!==CATALOG_VERSION || snapshot.methodology_version!==METHODOLOGY_VERSION || (regimeRecord&&regimeRecord.rules_version!==RULES_VERSION)` → `status:'version_unsupported'`。
2. F4 非 `card` → `status:'f4_<state>'`（**无数值字段**）。
3. `rows`：遍历 `regionWeights(snapshot.region)` 的键（顺序 = WEIGHTS_V1 顺序）；状态判定只用目录 `status` 与 `contributions`/manifest 成员资格（规格 §3.3 规则）；`latest` 对 matched 行 = `observations` 中 `observation_id === contribution.observation_id`（找不到 → 不变式 1 失败）；not_matched 行 = 同序列 manifest 观测里 `period_end` 最大者；`comparisons` = 同序列其余观测，`role` 按 `period_end===shiftMonthEnd(latest.period_end,-3)`；`display_change` = `changeOf(def.changeKind, latest.value_text, prev.value_text)`（无 prev → null）；`rule.label` = `RULES[def.type].find(r=>r.id===rule_id)?.label`（找不到 → 不变式 1 失败：规则 id 不在当前规则表）。
4. `non_scoring`：manifest 中 `series_id` 不在 `regionWeights` 的指标（去重，按目录序）。
5. `regime_status`（只作文案，任何状态下都算；存储对账失败 → `unknown`）：classified / coverage_below_threshold / zero_score（规格 §3.3）；`summary.matched_weight = Σ C[].weight`，不变式 4 核对 `matched + uncovered_weight === denominator`。`method_manifest`（D1 起才存在）：存在时 rows 只从清单渲染并跑不变式 9；P5-B 阶段清单为 undefined，走 `rec.contributions` 投影。
6. 对账 §3.4 八条（1–6、8 → `reconcile_failed`；7 → `f4_mismatch`，含"F4 合格但快照 regime 为 null"），`tol=(n+1)*1e-6`；不变式 2、6 与 `regime.ts` 同运算顺序、r6 后精确相等；不变式 8：`rule_id` ∈ `RULES[row.type]` 且存储 `support` 逐象限等于规则表（缺省 0）；`norm`/`margin`/`primary`/`secondary` 用 `pickStates` 重算核对。失败 → 对应状态，`diagnostics[]{code:'invariant_<n>',detail,ids}` **不含数值**，`console.error('[macro-clock] reconcile', …)` 记差值。
6b. `comparisons[].roles` 可同时含 `'prev'` 与 `'prev3m'`（季度序列、三月缺口）；`display_change` 对 roles 含 `'prev'` 的观测算。
7. `quadrants`：`rank` 由存储 `primary_state`/`secondary_state`；`drivers` 排序键 (`contribution` desc, `weight` desc, `series_id` asc) 取 3。

**测试用例（`clock-view.test.ts`，手算 fixture 写死在测试文件里，US 地区）：**
- fixture：4 命中行（US_CPI_YOY infl.2to3 w15、US_DFF policy.2_5to4_5 w25、US_DGS10 bond.d3m.ge25bp w15、US_UNRATE labor.d3m.le-0_1 w10）+ not_matched（US_DTWEXBGS，manifest 有 2 条观测）+ no_data（US_PPI_FD_YOY，manifest 无）+ missing（US_ISM_PMI）+ restricted（US_VIX）；手算 scores = {recovery:6+7.5+0+5=18.5, overheat:4.5+5+7.5+4=21, stagflation:1.5+2.5+4.5+0=8.5, recession:1.5+2.5+0+0=4}，total 52，norm 四位，primary overheat、secondary recovery、margin = 100×(21−18.5)/52 = 4.807692；matched 65，denominator 100，coverage 0.65，uncovered 35；F4 claim 与之一致。
- 断言：`status==='ok'`；rows 8 行、状态与顺序；`by_state` 权重 {matched:65, not_matched:10, no_data:5, missing:15, restricted:5} 和 = 100；`comparisons` role；`display_change` 文本（DFF bp、CPI pp、DTWEXBGS pct）；drivers 排序（构造两行同贡献不同权重，再构造同贡献同权重按 id）。
- 破坏用例（测试名 = 规格 §3.8）：`invariant.1.duplicate_series`、`invariant.1.foreign_observation`、`invariant.2.contribution_cell`（+0.01）、`invariant.3.score_sum`（+1）、`invariant.4.uncovered`（+1）、`invariant.5.norm`（+0.001）/`.primary`（交换）/`.margin`、`invariant.6.axis`（0.5）、`invariant.7.selected`/`.distribution`（+0.001）/`.null_regime`、`invariant.8.rule_id`（改成同类型另一条）/`.support`（改一格）；每例断言 `status` 与 `diagnostics[0].code`，且响应无 `summary`/`rows`/`quadrants` 键。
- 舍入边界：构造 20 行、每行贡献 r6 后与原始差 0.5e-6 的 fixture，Σ 差 ≤ tol 通过。
- 优先级 `clock-view.status.1`…`.8` 各一例；`regime_status` 四态；roles 双角色用例（季度 GDP：prev 与 prev3m 同一观测）；非 ok 分支的结构断言（无数值键）。

**`regime.rules-boundary.test.ts`**：`matchRule('fx', 7.12, null, null)` → null，`matchRule('fx', 102.4, 0, 0.3)` → null（fx 只认 ±2% 3M 变化）；`matchRule('policy_rate', 7.12, …)` 命中 `policy.ge4_5.*`——证明命中与否只由 `type` 决定；`matchRule('growth_yoy', 48, null, 0)` 不返回任何 `pmi.*`；`RULES` 每条 `label.zh`/`label.en` 非空且互不相同。

- [ ] 写两个测试文件（先红）→ 实现 `clock-view.ts` → `npm test -- src/lib/macro/clock-view.test.ts src/lib/macro/regime.rules-boundary.test.ts` 全绿 → `npm run typecheck && npm run lint` → 提交 `feat(macro): clock view projection with reconciliation invariants`。



===== SPEC (draft 6) §2–§3 =====
## 2. 时钟数据契约

### 2.1 计算（`regime.ts`，`METHODOLOGY_VERSION='v1.0'`，`RULES_VERSION='macro-regime-rules/1.0'`）

- 输入 `RegimeInput{region, series:Record<id,{latest, prev?, prev3m?}>}`。
- 参与条件：`WEIGHTS_V1` 中该地区序列，目录 `active`、`type` 非空、`weight>0`；`d1 = latest − prev`（百分点），`d3 = latest − prev3m`（fx 为百分比变化）；缺比较期 → null。
- `matchRule(type, v, d3, d1)`：只在本类型规则表找第一条。
- `contribution[i][q] = r6(weight_i × support[q])`；`scores[q] = r6(Σ 未舍入)`；`norm[q] = r6(scores_raw[q]/Σ scores_raw)`；`pickStates(norm_raw)`；`margin_pp = r6(100×(norm_raw[p] − (norm_raw[s] ?? 0)))`；`coverage = r6(matched/denominator)`；`uncoveredWeight = r6(denominator − matched)`；axes 如 §3.4 不变式 6。
- `coverage < 0.6` 或 `Σ ≤ 0` → `regime=null`（贡献、uncovered 仍存）。
- 权重 US 100 / CN 125；`RULES[type][].label:{zh,en}` 与 `support` 属规则表 1.0。

### 2.2 冻结与存储

- `buildRegimeInput`：`latestEligible`；`prev` = 24 个月窗口内最近更早期；`prev3m` = 恰好 −3 个月（季度：上一季度末，同一 `shiftMonthEnd(−3)`）；三者 id 去重进 `observation_ids`（prev 与 prev3m 可同一观测）；manifest 每序列 ≤ 3 条、每期一条。
- `publishRegion` 同事务写 `macro_snapshots` 与 `macro_regime_results`；后者 service_role only，经 `db.regimeOf`。
- `macro_series` 镜像只存当前目录。
- 快照不论 coverage 都发布。

### 2.3 读取

| 路由 | 返回 |
|---|---|
| `GET /api/macro/overview?region=` | `Envelope{snapshotId, asOf(日期), catalogVersion, methodologyVersion, collection, indicators[]{…, sparkline:string[]}, changes, catalogCounts}` |
| `GET /api/macro/snapshots/[id]` | `{catalogVersion, snapshot{…, created_at, status}, observations[]}`（+ 开关开：判定字段） |
| `GET /api/macro/series/[id]?from&to&asOf&transform` | `SeriesJson`（`asOf` ⇒ `available_at ≤ asOf`，经 `db.seriesHistory`，不按批次完成过滤） |
| `GET /api/judgments?subject_type=macro_region&subject_key=<R>&types=macro_regime&include_abstained=1` | `{cards[]}`：每 (judgment_type, methodology) 至多一张；`JudgmentCard{judgment_id, kind, lifecycle:Lifecycle, calibration, as_of, methodology{id,version,title,href}, display, inputs[]{kind,ref,available_at,origin,href}, abstain_reason?}`；`Lifecycle='abstained'\|'open'\|'settled'\|'void'\|'withdrawn'\|'pending_fill'`；只含 `publishable=true` 方法；弃权卡需 `include_abstained=1` |
| `GET /api/judgments/[id]` | `{card, judgment{judgment_id, methodology_id, methodology_version, abstained, abstain_reason, inputs, claim:{selected, classes, distribution, scores_are_not_probabilities:true, margin_pp, catalog_version}}, settlements, calibration}` |

### 2.4 决策 D1：时钟 = F4 判断卡 + 其依据

挂载条件（全部成立才出任何数字）：
1. `macroJudgmentsEnabled()`；
2. 快照 = 该地区活动快照，且 `catalog_version === CATALOG_VERSION`、`methodology_version === METHODOLOGY_VERSION`、`rules_version === RULES_VERSION`；
3. F4 列表中存在候选卡：`methodology.id==='macro_regime'`、`methodology.version ∈ ACCEPTED_F4_VERSIONS`（部署常量，P5-B 为 `['v1']`）、`inputs` 含 `{kind:'macro_snapshot', ref:{snapshot_id}}` = 本快照；多张候选取 version 最高 → `as_of` 最新 → `judgment_id` 字典序最小；详情 `card.lifecycle ∈ {open, settled}`（详情为准，且与列表卡的 `judgment_id`/方法/快照输入一致）；
4. 详情 `judgment.claim` 与冻结结果一致（§3.4 不变式 7）。

P1 §3.2 的第 7 稿修订已写入 P1 文件（内容同本节）。卡片内容：类别用本模块 i18n 渲染 `claim.selected`；生命周期、校准枚举 → i18n；方法链接 `id@version`；**不渲染** F4 自由文本。O1：`macro_regime` `publishable=false` → 生产显示 `f4_none`，直到 owner `sync-methodologies.ts --publishable`。

### 2.5 跨模块硬约束

| 约束 | 后果 |
|---|---|
| C1 目录即版本（`CATALOG_VERSION` 哈希；F4 方法固定它并对其他版本弃权） | 目录每变一版 → F4 新方法版本 + 切换 `compensate.ts::MACRO_METHOD`、`strategy/playbooks.ts`、`strategy/deviations.ts::METHOD`、`ACCEPTED_F4_VERSIONS` |
| C2 方法即版本 | P5 不改权重/阈值/规则；`CN_LPR_5Y` weight 0 |
| C3 开关只在服务端 | 组件以 prop 挂载 |
| C4 冻结清单不变 | WP-C 列切换纯展示 |
| C5 数值十进制 | 展示舍入不回写 |
| C6 v1 公式哈希（闭包 + `deps`：`read-api,flags,snapshots,freshness,db`、`dq/freshness`） | WP-B/WP-C 不改这些文件；D1 一次改完并注册 v2、retire v1 |

---

## 3. WP-B · 美林时钟

### 3.1 挂载

`MacroWorkbench` 概览 tab，`judgmentsEnabled` 真时在两张事实卡之下、指标表之上挂 `RegimeClockCard`（取代 `MacroJudgmentSlot`；旧槽位与 `judgment-view.ts` 在 WP-B 末任务删除）。默认展开；偏好 `localStorage` 键 `macro.clock.expanded.<region>.v1`（try/catch；SSR 默认展开）。

### 3.2 路由 `GET /api/macro/snapshots/[id]/clock`

`requireSessionUser` → `UUID_RE` → `macroJudgmentsEnabled()` 否 → 404 `judgments_disabled` → `snap = db.snapshot(id)` 无 → 404 `not_found` → `snap.region ∉ {US,CN}` → `integrity_error` → `active = db.activeSnapshot(snap.region)`；`active?.snapshot_id !== id || snap.status !== 'active'` → `snapshot_not_active` → **快照版本门槛**（`catalog_version`、`methodology_version`）→ `obs = db.observationsByIds(snap.observation_ids)`（长度不等或任一序列同期多版本 → `integrity_error`）→ `rec = db.regimeOf(id)` 无 → `record_missing` → **规则版本门槛**（`rec.rules_version === RULES_VERSION`，否则 `version_unsupported`）→ 存储对账（含不变式 9，若 `rec.method_manifest` 存在）→ F4（`clock-f4.ts`：列表 3 s；列表超时/失败则不发详情；详情 3 s；总 ≤ 6 s；`NEXT_PUBLIC_SITE_URL` 缺失 → unavailable）→ 不变式 7 → `okJson(view)`，`Cache-Control: private, no-store`。读取：1 快照 + 1 活动快照 + 1 观测批读 + 1 判定 + 2 F4 HTTP；路由 `maxDuration` 不改。传输层响应（非 `ClockStatus`）：400 `invalid_parameter:id`、401 `unauthenticated`、404 `judgments_disabled`/`not_found`、503 `read_failed`（DB 读取异常，`failureResponse`）；F4 失败不是传输错误（→ `f4_unavailable`，200）。F4 URL = `NEXT_PUBLIC_SITE_URL` 原样拼接 `/api/judgments…`（与 `f4-client.ts` 同法）。

### 3.3 `ClockView`（`src/lib/macro/clock-view.ts`，`macro-clock-view/1`，服务端纯函数）

```ts
export type ClockStatus='ok'|'snapshot_not_active'|'version_unsupported'|'integrity_error'|'record_missing'|'reconcile_failed'|'f4_unavailable'|'f4_none'|'f4_earlier'|'f4_ineligible'|'f4_mismatch';
export interface ClockMeta{version:'macro-clock-view/1';status:ClockStatus;
 snapshot:{id:string;region:Region;as_of:string;created_at:string;catalog_version:string;methodology_version:string;rules_version:string|null};
 regime_status:'classified'|'coverage_below_threshold'|'zero_score'|'unknown';
 f4:{judgment_id:string|null;lifecycle:Lifecycle|null;abstain_reason:string|null;earlier_snapshot_id:string|null;methodology_version:string|null};
 diagnostics:{code:string;ids:string[]}[]}          // 永不含数值；差值只进服务端日志
export type ClockView=ClockMeta&({status:'ok';card:ClockCard;summary:ClockSummary;quadrants:QuadrantView[];rows:ClockRow[];display_only_rows:DisplayRow[]}|{status:Exclude<ClockStatus,'ok'>});
export interface ClockCard{selected:Regime;lifecycle:'open'|'settled';calibration:string;methodology:{id:string;version:string;href:string};as_of:string}
export interface ClockSummary{primary:Regime;secondary:Regime|null;margin_pp:number;coverage:number;matched_weight:number;denominator:number;uncovered_weight:number;growth_axis:number|null;inflation_axis:number|null;scores:Record<Regime,number>;norm:Record<Regime,number>;tolerance:number}
export interface ClockRow{series_id:string;name:Bilingual;type:SeriesType;unit:string;change_kind:ChangeKind;weight:number;
 state:'matched'|'not_matched'|'no_data'|'missing'|'restricted';
 latest:{observation_id:string;period_end:string;value_text:string;version:number}|null;     // matched/not_matched 才非 null
 comparisons:{observation_id:string;period_end:string;value_text:string;roles:('prev'|'prev3m')[]}[];
 inputs_present:{prev:boolean;prev3m:boolean};                                             // 事实，不声称因果
 display_change:{kind:ChangeKind;value_text:string}|null;
 rule:{id:string;label:Bilingual;support:Record<Regime,number>}|null;contribution:Record<Regime,number>|null;reason:Bilingual|null}
export interface DisplayRow{series_id:string;name:Bilingual;unit:string;latest:ClockRow['latest']}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}
```

**优先级（唯一；编号 = 测试名 `clock.status.<n>`）**：
1 `snapshot_not_active`（路由）→ 2 `version_unsupported`（快照两版本）→ 3 `integrity_error` → 4 `record_missing`（`regimeOf` null）→ 2' `version_unsupported`（`rec.rules_version`）→ 5 存储对账：不变式 1、2、4、8，清单存在时再 9；`rec.regime` 非 null 再 3、5、6；任一失败 → `reconcile_failed`（在 F4 之前，总会执行并记录）→ 6 F4：`f4_unavailable` / `f4_none` / `f4_earlier` / `f4_ineligible`（lifecycle ∉ {open, settled}，含 abstained、pending_fill、void、withdrawn；`abstain_reason` 原样作代码）→ 7 不变式 7（含 F4 合格但 `rec.regime===null`）→ `f4_mismatch` → 8 `ok`。
`regime_status`：`rec` 无或存储对账失败 → `unknown`；`rec.regime` 非 null → `classified`；否则由存储 `uncovered_weight` 与 `denominator`（`Σ regionWeights`）内部计算 `(denominator−uncovered)/denominator < 0.6` → `coverage_below_threshold`，否则 `zero_score`；只暴露枚举。

**行规则**（`rows` = `regionWeights(region)` 的键，顺序同 `WEIGHTS_V1`）：
- 状态：目录 `missing` → `missing`；`restricted` → `restricted`（二者 `latest=null`、`comparisons=[]`、`inputs_present` 全 false）；在 `contributions` → `matched`；manifest 有该序列观测 → `not_matched`（含 `value_text` 非有限数的情形：引擎同样不命中；行文案不区分，`value_text` 原样显示）；否则 `no_data`。
- `latest`：matched = `contribution.observation_id` 的观测（不变式 1 保证它是该序列 manifest 最新）；not_matched = 该序列 manifest 中 period_end 最大者。
- `comparisons`：该序列 manifest 中其余观测，period_end 升序；`roles`：`period_end === shiftMonthEnd(latest.period_end, −3)` → 含 `'prev3m'`；`period_end` 为其余观测中最大者 → 含 `'prev'`；一条观测可同时两角色；若某观测两角色都不是 → `integrity_error`（manifest 每序列 ≤ 3 条的契约被破坏）。
- `inputs_present.prev/prev3m` = 对应角色是否存在。
- `display_change` = `changeOf(change_kind, latest.value_text, prev.value_text)`（无 prev → null）。
- `rule`：`RULES[type].find(r=>r.id===rule_id)` 的 `{id,label,support(四键，缺省 0)}`。
- `display_only_rows` = manifest 中 `series_id ∉ regionWeights` 的指标（D1 前为空）。
- `quadrants`：`score/norm` 原样；`rank` 由存储 `primary_state/secondary_state`；`drivers` = `contribution[q]>0` 行按 (`contribution` desc, `weight` desc, `series_id` asc) 取 3。

**为什么服务端可以 import `regime.ts`/`catalog.ts`**：版本门槛要求快照的三个版本等于当前常量；`WEIGHTS_V1`、`RULES`（含 label）、目录行在各自版本内冻结（C1/C2 强制）；因此门槛内读取当前常量 = 读取快照时的方法定义。D1 后旧快照（`catalog_version` = `30bcaa2a33c5` ≠ A）一律 `version_unsupported`；D1 起 `macro_regime_results.method_manifest`（§5.2）冻结每结果的完整行清单，时钟优先读它，仅规则 label 仍按 `rules_version` 查表。

### 3.4 对账（服务端；任一失败 → 无数字）

记 `C` = 存储 `contributions`，`n = |C|`，`W = regionWeights(region)`，`D = Σ W`。

| # | 不变式 | 失败状态 |
|---|---|---|
| 1 | `C[].series_id` 唯一且 ∈ keys(W) 且目录 `active`；`C[].observation_id` ∈ manifest，其观测的 `series_id` 相同，且等于该序列 manifest 中 **最新**观测（period_end 最大、version 最大）的 id | reconcile_failed |
| 2 | `C[].weight === W[series_id]`；每格 `contribution[q] === r6(weight × support[q])`（support 缺省 0；同 `regime.ts` 运算） | reconcile_failed |
| 3 | （regime 非 null）每象限 `|Σ_C contribution[q] − scores[q]| ≤ tol`，`tol = (n+1)×1e-6` | reconcile_failed |
| 4 | `matched = Σ_C weight`；`matched + uncovered_weight === D`（整数与 r6 值精确）；（regime 非 null）`coverage === r6(matched/D)` | reconcile_failed |
| 5 | （regime 非 null）重建发布端运算：`S'[q] = Σ_C contribution[q]`（r6 贡献之和），`N'[q] = S'[q]/Σ S'`（不舍入）；`|r6(N'[q]) − norm[q]| ≤ 2e-6`；`pickStates(N')` 的 primary/secondary === 存储；`|r6(100×(N'[p]−(N'[s]??0))) − margin_pp| ≤ 1e-4` | reconcile_failed |
| 6 | （regime 非 null）axes 用 `C` 的 `support`/`weight` 按 `regime.ts` 顺序重算（无命中 → null），r6 后精确相等 | reconcile_failed |
| 7 | F4 详情 `claim.selected === primary_state`；`|claim.distribution[q] − norm[q]| ≤ 1e-6`；`claim.catalog_version === snapshot.catalog_version`；`|claim.margin_pp − r6(100×(norm[p]−(norm[s]??0)))| ≤ 1e-6`（F4 的 `marginPp` 用存储 r6 norm）；`rec.regime` 非 null | f4_mismatch |
| 8 | （只对 `C` 中的行）`rule_id` ∈ `RULES[row.type]`；`support` 逐象限 === 规则表（缺省 0） | reconcile_failed |
| 9 | （`rec.method_manifest` 存在时）`manifest.version==='macro-method-manifest/1'`；`manifest.rules_version/catalog_version/weights_version` 与快照/记录一致；`manifest.rows[].series_id` 集合 === keys(W) 且唯一；`manifest.denominator === D`；每行 `weight === W[id]` 且 `name/type/unit/change_kind/status/reason` 与门槛内目录 `catalogById(id)` 逐字段相等（`state` 用 §3.3 行状态词表并与目录 `status`/观测存在性一致）；`latest/prev/prev3m_observation_id` ∈ manifest 观测且 `series_id` 相同，角色与 §3.3 日期规则一致；`matched` 行与 `C` 一一对应且 `rule_id/support/contribution` 逐格相等；非 matched 行三者皆 null | reconcile_failed |

执行顺序 1,2,4,8,（9）→（regime 非 null）3,5,6 → F4 → 7。清单存在时 `rows` **只**从清单渲染（观测值仍从 manifest 观测读取）；破坏用例：只改清单的一个贡献格 / 一个 `latest_observation_id` / 一行的 `change_kind`，`rec` 与 F4 不变 → `reconcile_failed`。数值比较用 IEEE-754 `Number`（输入均为 r6 值或整数）。失败：`diagnostics[]{code:'invariant_<n>', ids}`，差值 `console.error('[macro-clock] reconcile', {snapshot_id, invariant, delta, …})`。现有 F4 fixture（US `us-2026-09-11.json` 的 margin `11.023622`，CN `28.333333`）必须作为 `ok` 端到端用例通过。

### 3.5 UI（画布 §7；文案 `judgment.clock.*`）

- 象限卡等宽；主 `border-[var(--border-active)] bg-[var(--accent-wash)]`，次 `border-[var(--border-active)]`，其余 `border-border`；`rounded-md`；无十六进制；无四色。
- F4 行：`judgment.clock.regime.<selected>`、`judgment.clock.lifecycle.<lifecycle>`、`judgment.clock.calibration.<state>`（枚举值不在表 → 显示代码）、方法链接文本 `id@version`。
- 摘要行：主/次/`marginLabel`（"主次占比差（pp）" / "primary–secondary share gap (pp)"）/覆盖 `coverageLabel`（"命中权重 X / 评分权重 Y（含缺失、受限）"）/轴（"规则支持度合成，非实测"）+ `notProbability`（"规则得分占比，不是概率"；唯一含"概率"的键）。
- 驱动按钮 `aria-controls="clock-row-<series_id>"`：展开表、`scrollIntoView({block:'center'})`、focus、高亮 2 s。
- 分解表：matched 按 max_q contribution desc → not_matched/no_data → missing/restricted；非命中行 `text-text-dim` + "计入分母，不计入分子"；not_matched 文案 "规则未命中（上期：有/缺；3M 前：有/缺）"（事实）；比较列 `2026-08 · 2.6（上期）· 2026-06 · 2.7（3M 前）`，同一观测两角色 → "（上期 = 3M 前）"；显示变化列按 `change_kind`；脚注三条（上期定义；规则输入 = 精确十进制差值，利率类百分点、汇率类百分比变化；显示值舍入 2 位）。
- 证据：任何 `latest` 非 null 的行（matched 与 not_matched）当前值按钮 → `SourceDrawer`（冻结 `observation_id`）。
- 精度：占比 1 位 %；分数/贡献 2 位；margin 1 位；轴 2 位带符号；覆盖整数；负零 → 0；`−` 用 U+2212。
- 页头版本 → `?tab=methodology`；方法 tab `RulesTable`（`page.tsx` 服务端从 `RULES` 投影为 prop；关态 null）。
- 禁词：`judgment.clock.*` 不含 概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast（豁免 `notProbability`）；运行时字符串只有本模块 i18n、目录 `name`、规则 `label`、枚举代码；`catalog.test.ts` 与 `regime.rules-boundary.test.ts` 对 `name`/`label` 做同一禁词扫描。
- 窄屏：象限 2×2；分解表行卡。

### 3.6 状态矩阵（11 个卡级状态 + 2 个传输态 + 开关关；互斥）

| 编号 | 状态 | 触发 | UI | 测试 |
|---|---|---|---|---|
| 0 | judgments_disabled | prop false | 不挂载 | `pages.test` |
| 0a / 0b | loading / load_failed | 请求中 / 非 2xx | 骨架 / "读取失败 · 重试" | `clock-model.test` |
| 1 | snapshot_not_active | 非活动 | "概览快照已更新，请刷新" | `route.test.status.1` |
| 2 | version_unsupported | 三版本任一不等 | 显示两版本 | `clock.status.2` |
| 3 | integrity_error | 观测缺/重复/角色异常/region 非法 | "快照数据不完整，已记录" | `.3` |
| 4 | record_missing | 无判定记录 | "该快照无判定记录" | `.4` |
| 5 | reconcile_failed | 不变式 1–6、8 | "分解与分数不一致，已记录 · 重试" | `.5` |
| 6a–6d | f4_unavailable / f4_none / f4_earlier / f4_ineligible | §3.3 | 各自文案（ineligible 显示 lifecycle 与 `abstain_reason` 代码 + `regime_status` 文案） | `.6a`–`.6d` |
| 7 | f4_mismatch | 不变式 7 | "F4 判断与快照结果不一致，已记录" | `.7` |
| 8 | ok | 全过 | 全量 | `.8` |
| 行级 | matched / not_matched / no_data / missing / restricted | §3.3 | — | `clock.rows.*` |

### 3.7 不做

配置比例、行业超/低配；客户端评估规则/重选观测；显示 ChaosAI 数值；改 C6 文件。

### 3.8 测试

- `clock-view.test.ts`：手算 fixture（US：CPI `infl.2to3` w15、DFF `policy.2_5to4_5` w25、DGS10 `bond.d3m.ge25bp` w15、UNRATE `labor.d3m.le-0_1` w10；DTWEXBGS not_matched（prev 有、prev3m 缺）；PPI no_data；ISM missing；VIX restricted；scores 18.5/21/8.5/4；F4 claim 一致）→ `ok`；两份 F4 真实 fixture → `ok`；破坏用例（名 = `invariant.<n>.<case>`）：1 duplicate_series、1 foreign_observation、1 not_latest（换成 prev 的 id）、2 weight、2 cell(+0.01)、3 score_sum(+1)、4 uncovered(+1)、5 norm(+0.001)、5 primary(swap)、5 margin(+0.01)、6 axis(0.5)、7 selected、7 distribution(+0.001)、7 null_regime、8 rule_id、8 support；舍入边界（20 行累计）；优先级 `clock.status.1..8`；roles 双角色（季度 GDP）与三月缺口；非 ok 分支无数值键的结构断言。
- `clock-f4.test.ts`：真实形状、`include_abstained=1` 查询串、六种 lifecycle、多候选选择、详情与列表不一致 → unavailable、畸形/超时。
- `regime.rules-boundary.test.ts`：fx 值 7.12/102.4 不命中 policy_rate；growth_yoy 48 不进 pmi；label 非空互异；禁词。
- 路由测试：404/400/401/非活动/完整性/`Cache-Control`。
- 源码断言：`src/components/macro/clock/**` 不 import `regime.ts`/`catalog.ts`、不含 `MACRO_JUDGMENTS_ENABLED`。
- 文案：禁词；zh/en 对等；`marginLabel` 含 "pp"。
- 浏览器验收：本地 `seedClockSample` + 本地注册 v1 `--publishable`；1280 / 390 截图（视觉证据；算术由测试证明）。

---


