You are Codex gpt-6-sol implementing ONE task in this repository (OsbornAlpha, Next.js 15 / TypeScript). Work only in this worktree on the current branch; never run `git stash`; TDD: failing tests first, then implement, then `npm run typecheck` and `npm run lint`. Do NOT attempt to commit (the sandbox cannot write .git); print files changed, the vitest summary line, and any deviation with its reason.

TASK: Task B2 of docs/superpowers/plans/2026-11-07-macro-p5.md (version 4; full task text below). Task B1 is already committed: read src/lib/macro/clock-contract.ts (F4Match, F4Claim, ClockCard types — use them, do not redefine) and src/lib/macro/clock-view.ts. Spec excerpts (§2.3 read contracts, §2.4, §3.3) are pasted after the task. Also read src/lib/macro/strategy/f4-client.ts for the existing fail-closed fetch pattern (AbortController timeout, base URL from NEXT_PUBLIC_SITE_URL) and src/lib/judgments/types.ts line 255 for the Lifecycle enum (type-only import).

Hard rules:
- Only create src/lib/macro/clock-f4.ts and src/lib/macro/clock-f4.test.ts. Do NOT modify any other file (C6 red line applies; clock-contract.ts is frozen for this task — if you believe a contract change is needed, stop and report it as a deviation instead).
- Validation is structural: never trust the shape of the F4 responses; any malformed field → `{status:'unavailable', reason}`.
- Never retain F4 free text (headline, titles) in F4Match.card.
- Tests: vitest node; use fake fetchers; timeout test uses a fetcher that rejects with AbortError when `init.signal` fires `abort`, with `vi.useFakeTimers()`.
- Commands: `npm test -- src/lib/macro/clock-f4.test.ts`, `npm run typecheck`, `npm run lint`.

## 仓库约定（每个 Codex 任务提示都附本节）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/company-research-ebd56f`。WP-B 在分支 `claude/macro-p5-chaosai-essence`；WP-C1 `claude/macro-p5-c1`、WP-C2 `claude/macro-p5-c2`、WP-D1 `claude/macro-p5-d1`…（各自从 `origin/main` 新开，同一工作树顺序进行）。不要 `cd` 出去；不要用裸 `git stash`（栈与其他工作树共享）；只改本任务 **Files** 列出的文件。
- **在飞行中的兄弟分支（不碰其文件）**：PR #125 `claude/integ-f4-macro`（`src/lib/judgments/{deps,inputs-db}.ts`、`src/app/api/judgments/[id]/route.ts`、`src/app/api/macro/{series,snapshots}/[id]/route.ts`）；`claude/macro-strategy-latency`（`src/lib/macro/db.ts`、`src/lib/macro/strategy/port.ts`）—— **D1 前置：该分支先合并到 main 并 rebase**；foreign research（迁移 `20261119*`）。
- **C6 红线文件**（WP-B / WP-C 禁改）：`src/lib/macro/{regime,catalog,snapshots,read-api,flags,freshness,db,decimal,judgment-contract,types,periods}.ts`、`src/lib/dq/freshness.ts`、`src/lib/judgments/**`。
- **开关**：只有 `src/app/(app)/intel/macro/page.tsx` 读 `macroJudgmentsEnabled()`；`src/components/macro/**`（含测试文件！`pages.test.ts` 扫描该目录全部 `.ts/.tsx`）不得出现连续字符串 `MACRO_JUDGMENTS_ENABLED`；路由用 `import {macroJudgmentsEnabled} from '@/lib/macro/flags'`。
- **判定文案**：`macro-messages.test.ts` 禁止 `judgment.*` 之外的文案含 象限|得分|margin|概率|置信度 / quadrant|score|margin|probabilit|confidence。时钟文案全部在 `judgment.clock.*`；其中再禁 概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast，唯一豁免键 `judgment.clock.notProbability`。
- **数值**：`value_text` 十进制字符串；显示用 `src/components/macro/macro-format.ts`；对账比较用 IEEE-754 `Number`（输入为 r6 值或整数）；客户端不做 `Number()` 判定。
- **UI**：`DESIGN.md` + `src/app/globals.css` 令牌（`--accent`、`--accent-wash`、`--border-active`、`--warn`、`--text-dim`、`--bg-elevated`、`--up`、`--down`），不写十六进制；无紫色/渐变/发光；圆角 `rounded`/`rounded-md`；数字 `font-mono tabular-nums`；`[data-density="data"]`；原语 `src/components/ui/{Panel,Tag,Button}`；画布 `https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH` P5 行（规格优先于画布）。
- **测试**：vitest 只跑 `.test.ts`（node，`vitest.config.ts`），组件逻辑抽到 `.ts` 模型测试；`npm test -- <path>`；`npm run typecheck`；`npm run lint`（`--max-warnings=0`）；DB 测试（只 WP-D）：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db -- <path>`；`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations`；**绝不** `pkill -f "postgres -D"`。
- **提交**：`git add <files>` 后 `git commit -F - <<'EOF' … EOF`，commit 命令行里不能出现 `-n` 记号；不用 `--no-verify`；信息末尾 `Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>`。
- **代码风格**：库代码沿用 `src/lib/macro` 紧凑风格（单空格缩进、顶部职责注释含规格条目）；组件沿用 `src/components/macro`（两空格）。
- **i18n**：`messages/zh/macro.json` 与 `messages/en/macro.json` 键集合与占位符一致（`macro-messages.test.ts`）；`macroStrategy.json` 同理（`strategy-messages.test.ts`）。
- **F4 HTTP**：只经 `fetch(`${NEXT_PUBLIC_SITE_URL}/api/judgments…`)`，照 `src/lib/macro/strategy/f4-client.ts` 的 fail-closed 写法（`AbortController` 3 s、非 2xx/畸形 → unavailable）。
- **现有类型（勿重定义）**：`SnapshotRecord`、`RegimeRecord`、`RegimeContribution`、`ObservationRow`、`Region`、`SeriesType`、`ChangeKind`、`Bilingual`（`src/lib/macro/types.ts`）；`RegimeResult`、`Regime`、`REGIMES`（`src/lib/macro/judgment-contract.ts`）；`Lifecycle`（`src/lib/judgments/types.ts:255`，WP-B 只 **type import**）。`db.snapshot()` 返回 `SnapshotRecord`（无 `regime` 字段）；`db.regimeOf()` 返回 `RegimeRecord|null`；`db.activeSnapshot(region)`；`db.observationsByIds(ids)`。



### Task B2: `clock-f4.ts` — F4 卡匹配、生产 reader、版本常量

**Files:** Create `src/lib/macro/clock-f4.ts`，Test `src/lib/macro/clock-f4.test.ts`。

```ts
export const ACCEPTED_F4_VERSIONS:readonly string[]=['v1'];        // D1 → ['v2'], D9 → ['v3']
export interface F4Reader{listCards(region:Region):Promise<unknown>;detail(judgmentId:string):Promise<unknown>}
export function fetchF4Reader(env:Readonly<Record<string,string|undefined>>=process.env,fetcher:typeof fetch=fetch):F4Reader|null;   // null when NEXT_PUBLIC_SITE_URL missing; each call AbortController 3 s; non-2xx → throw
export async function matchF4Card(reader:F4Reader|null,region:Region,snapshotId:string,accepted:readonly string[]=ACCEPTED_F4_VERSIONS):Promise<F4Match>;
```
规则（规格 §2.3/§2.4/§3.3）：reader null → `unavailable:'no_base_url'`；列表 URL `/api/judgments?subject_type=macro_region&subject_key=<R>&types=macro_regime&include_abstained=1`；envelope `{cards:[…]}` 或数组；每卡必须有 `judgment_id:string`、`lifecycle` ∈ `Lifecycle` 六值、`methodology{id:string,version:string,href:string}`、`inputs:Array<{kind:string,ref:unknown}>`、`as_of:string`、`calibration:string`，`abstain_reason?:string`；候选 = `methodology.id==='macro_regime' && accepted.includes(version) && inputs.some(i=>i.kind==='macro_snapshot' && (i.ref as any)?.snapshot_id===snapshotId)`；无候选且无任何 `macro_regime` 卡 → `none`；无候选但有 `macro_regime` 卡 → `earlier`（`as_of` 最新者的 snapshot_id）；多候选取 version 最高（按 `accepted` 顺序）→ `as_of` 最新 → `judgment_id` 字典序；读详情 `/api/judgments/<id>`：`detail.card.judgment_id/methodology.id/version/inputs(snapshot)/lifecycle` 与列表卡一致，`detail.judgment.{judgment_id,methodology_id,methodology_version}` 一致，否则 `unavailable:'detail_mismatch'`；**详情 `card.lifecycle` 为准**：∉ {open,settled} → `ineligible`（含 `pending_fill`、`abstained` 等；`abstain_reason` 取详情）；`claim` 校验：`selected` ∈ REGIMES、`distribution` 四键有限数、`margin_pp` number|null、`catalog_version` string|null、`scores_are_not_probabilities===true` → `card`（`ClockCard` 只含 selected/lifecycle/calibration/methodology{id,version,href}/as_of；**不保留** headline/title）；任何异常/畸形/超时 → `unavailable:<reason>`。
测试：真实形状（含两种 inputs kind）；`include_abstained=1` 出现在 URL；六种 lifecycle（列表与详情一致时：open/settled → card，其余四种 → ineligible）；列表 open 但详情 withdrawn → `unavailable:'detail_mismatch'`；多候选选择三级；`earlier`；`none`；畸形 claim；超时：假 fetcher 监听 `init.signal` 的 `abort` 事件并以 `AbortError` reject，配合假 timer 推进 3 s；列表超时 → 不发详情（spy 断言）；`fetchF4Reader` 无 base URL → null。

- [ ] 红 → 实现 → 绿 → `typecheck && lint` → 提交 `feat(macro): F4 regime card matching for the clock (P5 B2)`。



===== SPEC EXCERPTS (draft 8) =====
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


