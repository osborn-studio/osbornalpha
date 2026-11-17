You are Codex gpt-6-sol. Task B1 (plan v3) was implemented and committed (src/lib/macro/clock-contract.ts, clock-view.ts, clock-view.test.ts, regime.rules-boundary.test.ts; 28 tests green). The plan was then revised to VERSION 4 (full Task B1 text below). Bring the implementation up to plan v4 — a FIX ROUND, not a rewrite. Keep the existing public shapes; add what is missing.

Required additions:
1. Export from src/lib/macro/clock-view.ts the gate helpers exactly as the v4 task text specifies: `GateResult`, `gateSnapshot(snapshot)`, `gateObservations(snapshot, observations)`, `gateRecord(rec)`, and `clockMeta(snapshot, rec, status, diagnostics, f4?)`. `buildClockView` must call the same three gates internally (so behaviour is unchanged) and `clockMeta` must be what `buildClockView` uses to build every non-ok envelope.
2. Tests to add in src/lib/macro/clock-view.test.ts (names must match): `invariant.4.coverage` (regime.coverage altered), `invariant.7.selected` (already covered inside a test — split it into its own named case), `invariant.9.misclassified` (a scoring row flagged display_only=true in the manifest → invariant_9), `invariant.8.rule_id` must change ONLY rule_id (keep support/contribution; currently correct — just confirm), unit tests for the three gate helpers and clockMeta (status/regime_status/diagnostics), and the two real-fixture success cases: take the US and CN `RegimeInput` cases from src/lib/macro/regime.test.ts (the ones whose expected margin_pp are 11.023622 and 28.333333), run `classifyRegime` to obtain `regime` + `contributions`, build the manifest observations the way `buildRegimeInput` would (for each series in the input: latest, prev, prev3m rows with those observation_ids/periods/values), build a `RegimeRecord`, and an F4 claim with `distribution = regime.norm` and `margin_pp = r6(100*(norm[primary] - (norm[secondary] ?? 0)))`; assert `status === 'ok'` for both.
3. Do not weaken any existing invariant. Do not touch files outside the four B1 files.
4. Run `npm test -- src/lib/macro/clock-view.test.ts src/lib/macro/regime.rules-boundary.test.ts`, `npm run typecheck`, `npm run lint`. Do NOT attempt to commit (the sandbox cannot write .git); instead print the list of files changed, the vitest summary line, and any deviation with its reason.

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



### Task B1: 契约、投影与不变式（`clock-contract.ts`、`clock-view.ts`）

**Files:**
- Create: `src/lib/macro/clock-contract.ts`
- Create: `src/lib/macro/clock-view.ts`
- Test: `src/lib/macro/clock-view.test.ts`
- Test: `src/lib/macro/regime.rules-boundary.test.ts`

**`clock-contract.ts`（纯类型 + 常量；B2/B3/B4 都从这里 import；逐字实现规格 §3.3）：**

```ts
// src/lib/macro/clock-contract.ts — DTOs of the regime clock (spec 2026-11-07-macro-p5 draft 7 §3.3, §2.4). Types only.
import type {Bilingual,ChangeKind,Region,SeriesType} from './types';
import type {Regime} from './judgment-contract';
import type {Lifecycle} from '@/lib/judgments/types';     // type-only import (C6 allows type imports)
export const CLOCK_VIEW_VERSION='macro-clock-view/1';
export type ClockStatus='ok'|'snapshot_not_active'|'version_unsupported'|'integrity_error'|'record_missing'|'reconcile_failed'|'f4_unavailable'|'f4_none'|'f4_earlier'|'f4_ineligible'|'f4_mismatch';
export type RegimeStatus='classified'|'coverage_below_threshold'|'zero_score'|'unknown';
export interface ClockDiagnostic{code:string;ids:string[]}      // never numbers
export interface ClockMeta{version:typeof CLOCK_VIEW_VERSION;status:ClockStatus;
 snapshot:{id:string;region:Region;as_of:string;created_at:string;catalog_version:string;methodology_version:string;rules_version:string|null};
 regime_status:RegimeStatus;
 f4:{judgment_id:string|null;lifecycle:Lifecycle|null;abstain_reason:string|null;earlier_snapshot_id:string|null;methodology_version:string|null};
 diagnostics:ClockDiagnostic[]}
export interface ClockCard{selected:Regime;lifecycle:'open'|'settled';calibration:string;methodology:{id:string;version:string;href:string};as_of:string}
export interface ClockSummary{primary:Regime;secondary:Regime|null;margin_pp:number;coverage:number;matched_weight:number;denominator:number;uncovered_weight:number;growth_axis:number|null;inflation_axis:number|null;scores:Record<Regime,number>;norm:Record<Regime,number>;tolerance:number}
export type RowState='matched'|'not_matched'|'no_data'|'missing'|'restricted';
export interface ClockObs{observation_id:string;period_end:string;value_text:string;version:number}
export interface ClockRow{series_id:string;name:Bilingual;type:SeriesType;unit:string;change_kind:ChangeKind;weight:number;state:RowState;
 latest:ClockObs|null;comparisons:(ClockObs&{roles:('prev'|'prev3m')[]})[];inputs_present:{prev:boolean;prev3m:boolean};
 display_change:{kind:ChangeKind;value_text:string}|null;
 rule:{id:string;label:Bilingual;support:Record<Regime,number>}|null;contribution:Record<Regime,number>|null;reason:Bilingual|null}
export interface DisplayRow{series_id:string;name:Bilingual;unit:string;latest:ClockObs|null}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}
export type ClockOk=ClockMeta&{status:'ok';card:ClockCard;summary:ClockSummary;quadrants:QuadrantView[];rows:ClockRow[];display_only_rows:DisplayRow[]};
export type ClockView=ClockOk|(ClockMeta&{status:Exclude<ClockStatus,'ok'>});
/** F4 claim subset the clock reconciles (spec §2.3 detail route). */
export interface F4Claim{selected:Regime;distribution:Record<Regime,number>;margin_pp:number|null;catalog_version:string|null;scores_are_not_probabilities:true}
export type F4Match=
 |{status:'card';card:ClockCard;judgment_id:string;claim:F4Claim}
 |{status:'none'}
 |{status:'earlier';judgment_id:string;earlier_snapshot_id:string}
 |{status:'ineligible';judgment_id:string;lifecycle:Lifecycle;abstain_reason:string|null}
 |{status:'unavailable';reason:string};
/** Per-result method manifest (spec §5.2; written from D1 on; absent before). */
export interface MethodManifestRow{series_id:string;type:SeriesType|null /* 展示行（流动性序列）目录 type 为 null */;unit:string;change_kind:ChangeKind;name:Bilingual;weight:number;display_only:boolean;state:RowState;reason:Bilingual|null;latest_observation_id:string|null;prev_observation_id:string|null;prev3m_observation_id:string|null;matched:boolean;rule_id:string|null;support:Record<Regime,number>|null;contribution:Record<Regime,number>|null}
export interface MethodManifest{version:'macro-method-manifest/1';weights_version:string;rules_version:string;catalog_version:string;denominator:number;rows:MethodManifestRow[]}
```

**`clock-view.ts` 接口：**

```ts
// src/lib/macro/clock-view.ts — Server-side projection of one frozen regime result (spec draft 7 §3.3–§3.4, macro-clock-view/1).
// Pure: no I/O, no rule evaluation (never calls matchRule / Rule.when), no observation selection beyond reading the frozen manifest.
import type {ObservationRow,SnapshotRecord,RegimeRecord} from './types';
import {RULES,RULES_VERSION,METHODOLOGY_VERSION,regionWeights,pickStates} from './regime';
import {CATALOG_VERSION,catalogById} from './catalog';
import {changeOf} from './views';
import {shiftMonthEnd} from './periods';
import {REGIMES} from './judgment-contract';
export interface ClockInput{
 snapshot:SnapshotRecord;                                   // db.snapshot(id); route already ensured region ∈ {US,CN} and active
 observations:ObservationRow[];                             // db.observationsByIds(snapshot.observation_ids)
 regimeRecord:(RegimeRecord&{method_manifest?:MethodManifest|null})|null;   // db.regimeOf(id); null → record_missing
 f4:()=>Promise<F4Match>;                                   // invoked ONLY after storage reconciliation passed
 now?:string;
}
export async function buildClockView(input:ClockInput):Promise<ClockView>;
export function reconcileStorage(args:{region:Region;observations:ObservationRow[];rec:RegimeRecord&{method_manifest?:MethodManifest|null}}):{ok:true;matchedWeight:number;n:number}|{ok:false;diagnostics:ClockDiagnostic[]};   // invariants 1,2,4,8,(9) then 3,5,6 — exported for tests
export function regimeStatusOf(rec:RegimeRecord|null,region:Region,storageOk:boolean):RegimeStatus;
```

**实现要点（规格 §3.3 顺序，编号 = 测试名 `clock.status.<n>`）：**
1. `version_unsupported`（快照）：`snapshot.catalog_version!==CATALOG_VERSION || snapshot.methodology_version!==METHODOLOGY_VERSION`。
2. `integrity_error`：`observations.length !== snapshot.observation_ids.length`；或同一 `series_id` 同一 `period_end` 出现两条（manifest 每序列每期恰一条，`views.ts:53`）；或某序列 manifest 观测 > 3 条；或某非 latest 观测既不是 prev3m 也不是 prev（§3.3 角色规则）。
3. `record_missing`：`regimeRecord===null`。
4. `version_unsupported`（规则）：`rec.rules_version!==RULES_VERSION`。
5. 存储对账 `reconcileStorage`（规格 §3.4）：`W=regionWeights(region)`，`D=ΣW`，`C=rec.contributions`，`n=C.length`，`tol=(n+1)*1e-6`：
   - 1：`C[].series_id` 唯一、∈ keys(W)、目录 `active`；`observation_id` ∈ manifest，其 `series_id` 相同，且 === 该序列 manifest 中 period_end 最大（同期唯一）的观测 id。
   - 2：`weight===W[id]`；每格 `contribution[q]===r6(weight*(support[q]??0))`（`r6=x=>Math.round(x*1e6)/1e6`）。
   - 4：`matched=Σ C[].weight`；`matched+rec.uncovered_weight===D`（r6 后精确）；regime 非 null 时 `regime.coverage===r6(matched/D)`。
   - 8：`RULES[type].find(r=>r.id===rule_id)` 存在；其 `support[q]??0 === C.support[q]??0` 逐象限。
   - 9（仅 `rec.method_manifest` 存在）：规格 §3.4 第 9 条逐项（版本串、行集合 = keys(W) ∪ display rows、`denominator===D`、元数据逐字段 === `catalogById(id)`、观测 id 与角色、matched 行 === C 逐格、非 matched 行三者 null）。
   - regime 非 null 再：3 `|Σ C contribution[q] − scores[q]| ≤ tol`；5 `S'[q]=Σ C contribution[q]`，`N'[q]=S'[q]/ΣS'`，`|r6(N'[q])−norm[q]| ≤ 2e-6`，`pickStates(N')` === 存储 primary/secondary，`|r6(100*(N'[p]−(N'[s]??0)))−margin_pp| ≤ 1e-4`；6 axes：按 `regime.ts` 累加顺序（遍历 `C`，`GROWTH_TYPES=['pmi','labor_rate','growth_yoy']` 的行累加 `weight*(sr+so−ss−sc)` 与 `weight`；`inflation_yoy` 行累加 `weight*(so+ss−sr−sc)`；无命中 → null；否则 `r6(num/w)` 精确相等）。
   - 失败：`diagnostics=[{code:'invariant_<n>',ids:[...]}]`（无数值），`console.error('[macro-clock] reconcile',{snapshot_id,invariant,delta,ids})`，返回 `reconcile_failed`。
6. F4：`await input.f4()` → `unavailable|none|earlier|ineligible` → 对应状态（`f4` 元数据填入 `ClockMeta.f4`）。
7. 不变式 7：`claim.selected===regime.primary_state`；`|claim.distribution[q]−norm[q]| ≤ 1e-6`；`claim.catalog_version===snapshot.catalog_version`；`claim.margin_pp!==null && |claim.margin_pp − r6(100*(norm[p]−(norm[s]??0)))| ≤ 1e-6`；`regime!==null`；否则 `f4_mismatch`。
8. `ok`：`rows`（§3.3 行规则；`display_change`：`prev` 存在且两值都匹配 `/^-?\d+(\.\d+)?$/` 时 = `changeOf(def.changeKind, latest.value_text, prev.value_text)`，否则 `null`（非有限值的 not_matched 行照常显示原 `value_text`，不抛错）；`rule.label` 从 `RULES`；清单存在时 rows 从清单投影）、`display_only_rows`、`quadrants`（drivers 排序 (`contribution` desc, `weight` desc, `series_id` asc) 取 3）、`summary`（`matched_weight`、`denominator`、`uncovered_weight`、`tolerance=tol`、其余来自 `regime`）。
`regime_status`：`rec===null` 或存储对账失败 → `unknown`；`regime!==null` → `classified`；否则 `(D−uncovered)/D<0.6` → `coverage_below_threshold`，否则 `zero_score`。

**`clock-view.test.ts` 用例（fixture 写死在测试里；US；构造辅助 `fx()` 返回 `{snapshot, observations, rec, f4}`，默认 `snapshot.catalog_version=CATALOG_VERSION`, `methodology_version=METHODOLOGY_VERSION`, `rec.rules_version=RULES_VERSION`，`status:'active'`）：**
- 手算 ok：命中行 `US_CPI_YOY infl.2to3 w15 support{recovery:.4,overheat:.3,stagflation:.1,recession:.1}`、`US_DFF policy.2_5to4_5 w25 {.3,.2,.1,.1}`、`US_DGS10 bond.d3m.ge25bp w15 {overheat:.5,stagflation:.3}`、`US_UNRATE labor.d3m.le-0_1 w10 {recovery:.5,overheat:.4}`；贡献 = r6(w×s)；`scores={recovery:18.5,overheat:21,stagflation:8.5,recession:4}`（Σ=52）；`norm` 存 **r6**：`{recovery:0.355769,overheat:0.403846,stagflation:0.163462,recession:0.076923}`；`primary='overheat'`、`secondary='recovery'`；`margin_pp=r6(100×(21−18.5)/52)=4.807692`；`coverage=0.65`；`uncovered_weight=35`；axes：growth=(10×(0.5+0.4−0−0))/10=0.9 → `growth_axis=0.9`，inflation=(15×(0.3+0.1−0.4−0.1))/15=−0.1 → `inflation_axis=−0.1`；manifest 观测：每命中行 latest+prev+prev3m（DFF 的 prev3m 与 prev 同一条）；`US_DTWEXBGS` 两条观测、不在 C（not_matched，prev 有 prev3m 缺）；`US_PPI_FD_YOY` 无观测（no_data）；`US_ISM_PMI` missing；`US_VIX` restricted；F4 claim `{selected:'overheat', distribution=norm（存储 r6 值）, margin_pp:4.8077 /* = r6(100×(0.403846−0.355769))；与存储 margin 4.807692 不同：不变式 7 比较的是由存储 r6 norm 算出的 margin */, catalog_version:CATALOG_VERSION}`。断言：`status==='ok'`；8 行顺序 = WEIGHTS_V1 顺序；行状态；`comparisons.roles`（DFF 一条含两角色）；`display_change`（DFF `{kind:'bp',…}`、CPI `pp`、DTWEXBGS `pct`）；`summary` 全字段；drivers 排序（构造并列：两行同贡献按 weight、再按 id）；`inputs_present`。
- 破坏用例（一例一测，断言 `status`、`diagnostics[0].code`、响应不含 `summary/rows/quadrants`）：`invariant.1.duplicate_series`、`invariant.1.foreign_observation`、`invariant.1.not_latest`（换成 prev 的 id）、`invariant.2.weight`、`invariant.2.cell`（+0.01）、`invariant.3.score_sum`（+1）、`invariant.4.uncovered`（+1）、`invariant.4.coverage`、`invariant.5.norm`（+0.001）、`invariant.5.primary`（交换）、`invariant.5.margin`（+0.01）、`invariant.6.axis`（0.5）、`invariant.7.selected`、`invariant.7.distribution`（+0.001）、`invariant.7.null_regime`（F4 card 但 `regime:null`）、`invariant.8.rule_id`（改为同类型另一条 id，并把该行贡献格改为 `r6(weight×新规则 support)`、同步改 `scores`/`norm`/`margin`/axes 使 2–6 通过，只有 8 失败）、`invariant.8.support`（改一格 support 并同步改该格 contribution 与依赖的 scores/norm/margin/axes，使只有 8 失败）、`invariant.9.cell`、`invariant.9.latest_id`、`invariant.9.change_kind`、`invariant.9.display_row_weight`（展示行 weight≠0）、`invariant.9.misclassified`（评分行标成展示行）（构造含清单的 rec，含三条流动性展示行 `type:null`）。
- 舍入边界：取手算 fixture，把每格贡献替换为 `r6(w×s)+0.4e-6`（仍在 r6 格内？否——改为构造 `scores` 为 Σ 未舍入 r6 后与 Σ r6 贡献差 0.4e-6 的情况：`scores.overheat = 21 + 0.000004`，n=4，tol=5e-6 → 通过；`+0.000006` → `invariant.3`）。
- 优先级 `clock.status.1..8` 各一例（1 由路由测，此处从 2 起）；`version_unsupported` 两种触发；`integrity_error` 四种触发；`record_missing`；F4 四态下无数值键；`f4` 只在存储对账通过后被调用（用 spy 断言失败路径未调用）。
- `regimeStatusOf` 四态。
- 清单路径：含 `method_manifest` 的 ok 用例（rows 由清单投影，与无清单用例结果相同）。

**`regime.rules-boundary.test.ts`**：`matchRule('fx',7.12,null,null)===null`、`matchRule('fx',102.4,0.5,0.3)===null`（fx 只认 ±2%）、`matchRule('policy_rate',7.12,null,0)?.id==='policy.ge4_5.up'`（命中与否只由 type 决定）、`matchRule('growth_yoy',48,null,0)` 不返回 `pmi.*`；`RULES` 每条 `label.zh`/`label.en` 非空且在类型内互异；label 不含禁词。

- [ ] 写两个测试文件（红）→ 写 `clock-contract.ts`、`clock-view.ts` → `npm test -- src/lib/macro/clock-view.test.ts src/lib/macro/regime.rules-boundary.test.ts` 绿 → `npm run typecheck && npm run lint` → 提交 `feat(macro): clock contract, view projection and reconciliation invariants (P5 B1)`。


