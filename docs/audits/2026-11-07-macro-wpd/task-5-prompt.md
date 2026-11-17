You are Codex gpt-6-sol implementing ONE task of docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md in this worktree (branch claude/macro-wpd-cn, base = origin/main 68701c48 + the plan). READ FIRST: the "修订 A" section at the top of the plan (it overrides the task text where they conflict), the "仓库约定" section, and docs/audits/2026-11-07-macro-wpd/RECONCILE-2026-11-16.md. Rules: strict TDD (write the failing test, run it, implement, run again); this sandbox has no network and tests must never touch the network; do not edit any file listed in docs/audits/2026-11-07-macro-wpd/v2-closure.txt (formula-hash closure of macro_regime@v2 — includes types.ts, catalog.ts, regime.ts, decimal.ts); do not edit src/components, messages/*, or any page; do not commit (the commander commits); keep the compact code style of src/lib/macro; no banned words (概率, 置信度, probability, confidence). Fixtures: only the files in src/lib/macro/fixtures/cn-http/ (excerpts, see manifest.json) — the full raw responses are NOT in the repo and must not be fetched. Finish with: files changed, exact commands run with pass/fail counts, deviations from the task and why.

TASK: plan Task 5 (CN quote events: events.ts, series-extras.ts, cycles.ts and their tests). Overrides (decided after run 1 stopped: frozen replay fixtures under src/lib/macro/strategy/fixtures/replay/ pin 'macro-events/1' and must not change):
- Do NOT change EVENTS_VERSION ('macro-events/1' stays; US derivePolicyEvents output is byte-identical to today). Add a separate export QUOTE_EVENTS_VERSION='macro-events-quote/1' stamped on every RateQuoteEvent; the plan's test expecting 'macro-events/2' becomes an expectation of QUOTE_EVENTS_VERSION on quote events and of EVENTS_VERSION === 'macro-events/1' unchanged.
- SeriesExtras gets quoteEvents:RateQuoteEvent[] (empty for US and for every series without a *_Q derive source) and quoteEventsVersion:string; eventsVersion keeps meaning the US policy-event version. Check src/lib/macro/read-api / route code that spreads SeriesExtras into JSON: adding fields is fine, but do not change any existing field name or value, and do not edit frozen fixtures.
- The catalog has no *_Q rows yet, so production behaviour is unchanged; tests use local defs.
Gates: npm test -- src/lib/macro ; npm run typecheck ; npm run lint.

PLAN TEXT OF THE TASK (adapt per the overrides above; the overrides win):
### Task 5: CN 报价事件 `deriveRateQuoteEvents`（不改 US 事件类型）

**Files:**
- Modify: `src/lib/macro/events.ts`、`src/lib/macro/events.test.ts`、`src/lib/macro/series-extras.ts`、`src/lib/macro/cycles.ts`（`policyCycles` 输入泛化为 `Pick<PolicyEvent,'effective_date'|'change_bp'>`）
- Test: `src/lib/macro/events.test.ts`、`src/lib/macro/series-extras.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// events.test.ts 追加
describe('deriveRateQuoteEvents',()=>{
 const q=(id:string,d:string,v:string):EventInput=>({observation_id:id,period_end:d,value_text:v});
 it('one event per quote whose value differs from the previous quote; effective_date = quote date; change in bp',()=>{
  const ev=deriveRateQuoteEvents('CN_LPR_1Y_Q',[q('a','2019-08-20','4.25'),q('b','2019-09-20','4.20'),q('c','2019-10-21','4.20'),q('d','2019-11-20','4.15')]);
  expect(ev).toEqual([
   {kind:'policy_rate_quote_change',region:'CN',series_id:'CN_LPR_1Y_Q',effective_date:'2019-09-20',from:'4.25',to:'4.2',change_bp:'-5',source:'derived',evidence:['a','b'],version:'macro-events/2'},
   {kind:'policy_rate_quote_change',region:'CN',series_id:'CN_LPR_1Y_Q',effective_date:'2019-11-20',from:'4.2',to:'4.15',change_bp:'-5',source:'derived',evidence:['c','d'],version:'macro-events/2'},
  ]);
 });
 it('requires ascending dates and returns [] for < 2 quotes',()=>{
  expect(deriveRateQuoteEvents('X',[q('a','2026-01-20','3')])).toEqual([]);
  expect(()=>deriveRateQuoteEvents('X',[q('a','2026-02-24','3'),q('b','2026-01-20','3')])).toThrow('events_unsorted');
 });
 it('EVENTS_VERSION is macro-events/2 and US derivePolicyEvents output is unchanged in shape',()=>{expect(EVENTS_VERSION).toBe('macro-events/2');});
});
```
`series-extras.test.ts` 加：CN `policy_rate` 且 `derive.from` 以 `_Q` 结尾的行 → `quoteEvents` 来自 `_Q` 历史、`cycles` 来自 `policyCycles(quoteEvents,lastQuoteDay)`；US 行 `quoteEvents:[]`；`eventsVersion==='macro-events/2'`。既有 US 事件断言只改 version 字面量。

- [ ] **Step 2: 确认失败** — Run: `npm test -- src/lib/macro/events.test.ts src/lib/macro/series-extras.test.ts` → FAIL。

- [ ] **Step 3: 实现**

```ts
// events.ts 追加（文件头注释补一段：CN quote events, macro-events/2）
export const EVENTS_VERSION='macro-events/2';
export interface RateQuoteEvent{kind:'policy_rate_quote_change';region:'CN';series_id:string;effective_date:string;from:string;to:string;change_bp:string;source:'derived';evidence:[string,string];version:string}
/** CN policy-rate quote events: consecutive quotes of one event-source series (ascending) whose value differs. */
export function deriveRateQuoteEvents(seriesId:string,quotes:readonly EventInput[]):RateQuoteEvent[]{
 assertAscending(quotes,seriesId);
 const out:RateQuoteEvent[]=[];
 for(let i=1;i<quotes.length;i++){
  const p=quotes[i-1],c=quotes[i];const d=subtract(c.value_text,p.value_text);
  if(decimalSign(d)===0)continue;
  out.push({kind:'policy_rate_quote_change',region:'CN',series_id:seriesId,effective_date:c.period_end,from:canonicalDecimal(p.value_text),to:canonicalDecimal(c.value_text),change_bp:toBp(d),source:'derived',evidence:[p.observation_id,c.observation_id],version:EVENTS_VERSION});
 }
 return out;
}
```
`cycles.ts::policyCycles(events:readonly Pick<PolicyEvent,'effective_date'|'change_bp'>[],lastDate)`（实现只用这两个字段，签名放宽即可）。`series-extras.ts`：`SeriesExtras` 增 `quoteEvents:RateQuoteEvent[]`；`if(def.region==='CN'&&def.type==='policy_rate'&&def.derive?.from.endsWith('_Q')){const quotes=await read(def.derive.from,DAILY_MAX_ROWS);quoteEvents=deriveRateQuoteEvents(def.derive.from,quotes);if(quotes.length)cycles=policyCycles(quoteEvents,quotes[quotes.length-1].period_end);}`（放在既有 US 分支之后、月度 `seriesCycles` 分支之前）。目录里此时还没有 `_Q` 行，所以生产行为不变；测试用本地 def。

- [ ] **Step 4: 通过 + 闭包自检**

Run: `npm test -- src/lib/macro` ; `npm run typecheck` ; `npm run lint`
Run: `npx tsx -e "import('./src/lib/judgments/formula-hash').then(m=>console.log(m.importClosure(process.cwd(),'src/lib/judgments/methodologies/macro-regime.v1.ts').filter(f=>/events|series-extras|cycles|parsers|collect/.test(f))))"`
Expected: `[]`（本 PR 没碰闭包文件）；`git diff --name-only origin/main` 不含 `types.ts`/`catalog.ts`/`snapshots.ts`/`freshness.ts`/`db.ts`。

- [ ] **Step 5: 提交 → PR-1**

```bash
git add src/lib/macro/events.ts src/lib/macro/events.test.ts src/lib/macro/series-extras.ts src/lib/macro/series-extras.test.ts src/lib/macro/cycles.ts
git commit -F - <<'EOF'
feat(macro): CN policy-rate quote events (macro-events/2) and quoteEvents in series extras

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```
PR 正文（Opus 写）：序列表（LPR 1Y/5Y、社融存量同比、MLF 结论）、证据样本（夹具 sha256 + 定位器示例）、回放测试结果（三个测试文件通过数）、仍缺失项（MLF：无单一利率；LPR/社融目录行仍 missing，待 PR-3 翻活）。

