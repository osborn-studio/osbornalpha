You are Codex gpt-6-sol implementing Task 8 of the WP-D plan in this worktree (branch claude/macro-wpd-fed, PR-2; Tasks 6–7 are already committed). Follow the steps literally (TDD): quality.ts units/profiles, derive.test.ts weekly + LPR month_end cases (derive.ts itself must not change; if a case fails against the current derive.ts, report it instead of editing derive.ts). Gates: `npm test -- src/lib/macro/quality.test.ts src/lib/macro/derive.test.ts`, `npm run typecheck`, `npm run lint`. Do not touch any file in docs/audits/2026-11-07-macro-wpd/v2-closure.txt. Do not commit. Report the diff summary and test counts.

### Task 8: 单位区间 `usd_mn` / `usd_bn`；weekly `month_end` 派生测试

**Files:**
- Modify: `src/lib/macro/quality.ts`、`src/lib/macro/quality.test.ts`、`src/lib/macro/derive.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// quality.test.ts
it('usd_mn / usd_bn profiles (Fed balance-sheet levels, RRP volumes)',()=>{
 expect(KNOWN_UNITS).toContain('usd_mn');expect(KNOWN_UNITS).toContain('usd_bn');
 expect(profileOf({unit:'usd_mn',type:null})).toEqual({min:0,max:20_000_000,maxRelJump:0.5});
 expect(profileOf({unit:'usd_bn',type:null})).toEqual({min:0,max:10_000,maxRelJump:null});
 expect(validatePoint({unit:'usd_mn',type:null},'6748145','6745635').passed).toBe(true);
 expect(validatePoint({unit:'usd_mn',type:null},'6748145','3000000').passed).toBe(false);   // > 50 % week-on-week jump
 expect(validatePoint({unit:'usd_bn',type:null},'0.15','2500').passed).toBe(true);          // RRP collapses are real
});
// derive.test.ts
describe('deriveSeries month_end over weekly Wednesday inputs',()=>{
 const me=def('US_WALCL',{kind:'month_end',from:'US_WALCL_W'});
 it('takes the last Wednesday observation of each completed month; a month whose last Wednesday is early is not padded',()=>{
  const w=['2026-09-02','2026-09-09','2026-09-16','2026-09-23','2026-09-30','2026-10-07','2026-10-14','2026-10-21','2026-10-28','2026-11-04'].map((d,i)=>obs('US_WALCL_W',d,String(6700000+i)));
  const out=deriveSeries(me,w,{now:new Date('2026-11-06T05:30:00Z')});
  expect(out.map(o=>[o.period_end,o.value_text])).toEqual([['2026-09-30','6700004'],['2026-10-31','6700008']]);
  expect(out[1].derived_from).toEqual([w[8].observation_id,w[9].observation_id]);   // Oct 28 + witness Nov 4
 });
 it('a month with no observation produces no row',()=>{
  const w=[obs('US_WALCL_W','2026-08-26','1'),obs('US_WALCL_W','2026-10-07','2'),obs('US_WALCL_W','2026-11-04','3')];
  expect(deriveSeries(me,w,{now:new Date('2026-11-06T05:30:00Z')}).map(o=>o.period_end)).toEqual(['2026-08-31','2026-10-31']);
 });
});
describe('deriveSeries month_end over LPR quote dates (event source)',()=>{
 const lpr=def('CN_LPR_1Y',{kind:'month_end',from:'CN_LPR_1Y_Q'},'month','immutable');
 it('two quotes in one month → the later one; a month without a quote → no row; the current month → no row; available_at = witness',()=>{
  const a=obs('CN_LPR_1Y_Q','2026-08-20','3','2026-08-20T01:30:00.000Z'),b=obs('CN_LPR_1Y_Q','2026-08-25','3.1','2026-08-25T01:30:00.000Z'),c=obs('CN_LPR_1Y_Q','2026-10-20','3.1','2026-10-20T01:30:00.000Z'),d=obs('CN_LPR_1Y_Q','2026-11-20','3','2026-11-20T01:30:00.000Z');
  const out=deriveSeries(lpr,[a,b,c,d],{now:new Date('2026-11-21T05:30:00Z')});
  expect(out).toEqual([
   {series_id:'CN_LPR_1Y',period_end:'2026-08-31',value_text:'3.1',available_at:c.available_at,revisable:false,derived_from:[b.observation_id,c.observation_id],transform:'month_end@1'},   // September has no quote: no row, witness is October
   {series_id:'CN_LPR_1Y',period_end:'2026-10-31',value_text:'3.1',available_at:d.available_at,revisable:false,derived_from:[c.observation_id,d.observation_id],transform:'month_end@1'},
  ]);
 });
});
```

- [ ] **Step 2: 确认失败**，**Step 3: 实现**（`KNOWN_UNITS` 追加两项；`BY_UNIT` 加 `usd_mn:{min:0,max:20_000_000,maxRelJump:0.5}`、`usd_bn:{min:0,max:10_000,maxRelJump:null}`；派生代码不改），**Step 4: 通过**：`npm test -- src/lib/macro/quality.test.ts src/lib/macro/derive.test.ts`。

- [ ] **Step 5: 门禁 + 闭包自检 + 提交 → PR-2**

Run: `npm run typecheck && npm run lint && npm test -- src/lib/macro src/app/api/cron/macro-sync`；`git diff --name-only origin/main` 不含闭包 / deps 文件。
```bash
git add src/lib/macro/quality.ts src/lib/macro/quality.test.ts src/lib/macro/derive.test.ts
git commit -F - <<'EOF'
feat(macro): usd_mn / usd_bn quality profiles; weekly month_end derivation regressions

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```
PR 正文：序列表（三条 + 月末派生行，单位 / 频率 / 对齐规则：WALCL 周三水平、WTREGEN 周平均以周三标记、RRPONTSYD 日成交额且无操作日无点；月度行 = 月内最后一次周观测，**不是**月末余额）、夹具 sha256、解析回归结果、尚未入目录的说明（PR-3）。

