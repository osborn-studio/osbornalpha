import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {scoreExample} from './scoring.mjs';

const examples = JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
const example = id => examples.find(row=>row.id === id);
const grade = (id, result, raw=result) => scoreExample(example(id),{raw,result,latencyMs:14});
const field = (value,evidence) => ({value,evidence});

test('fixture splits have unique conversations and texts, and both adapters are represented', () => {
  const splitByGroup = new Map();
  const ids = new Set();
  const texts = new Set();
  const coverage = new Set();
  for (const row of examples) {
    assert.ok(['train','validation','holdout'].includes(row.split));
    assert.ok(['chat','extraction'].includes(row.kind));
    assert.ok(row.group && row.id && row.input.text);
    assert.ok(!ids.has(row.id));
    assert.ok(!texts.has(row.input.text));
    ids.add(row.id);
    texts.add(row.input.text);
    const otherSplit = splitByGroup.get(row.group);
    assert.ok(!otherSplit || otherSplit === row.split,`Conversation ${row.group} spans splits`);
    splitByGroup.set(row.group,row.split);
    coverage.add(row.split + ':' + row.kind);
    if (row.kind === 'chat' && row.expect.tool) {
      assert.ok(['formal_report','analyst_roster','pending'].includes(row.expect.tool.read));
    } else if (row.kind === 'chat') {
      assert.ok(row.expect.concepts.length > 0);
      for (const pattern of [...row.expect.concepts.flat(),...row.expect.avoid??[],...row.expect.criticalAvoid??[]]) {
        assert.doesNotThrow(()=>new RegExp(pattern,'iu'));
      }
    } else {
      assert.ok(Number.isFinite(Date.parse(row.input.receivedAt)));
      assert.ok(row.expect.fields && row.expect.intent);
    }
  }
  assert.equal(coverage.size,6);
});

test('separates raw model success from dropped evidence or fields in the real adapter', () => {
  const raw = {intent:'proposal',fields:{quantity:field(30,'三十股'),price:field(128,'每股128美元'),currency:field('USD','每股128美元')}};
  const complete = grade('t-quantity',raw);
  assert.equal(complete.score,1);
  assert.equal(complete.passed,true);
  const filtered = grade('t-quantity',{intent:'proposal',fields:{price:raw.fields.price,currency:raw.fields.currency}},raw);
  assert.equal(filtered.rawScore,1);
  assert.ok(filtered.resultScore < filtered.rawScore);
  assert.match(filtered.feedback,/原始答案正确/u);
  assert.equal(filtered.critical,false);
});

test('grade rejects unsupported fields, wrong direction, and access to evidence in conversation history', () => {
  const own = {intent:'proposal',fields:{action:field('add','加点仓')}};
  assert.equal(grade('h-reference',own).score,1);
  for (const item of [{ticker:field('9988','9988')},{securityName:field('阿里巴巴','阿里巴巴')},{action:field('sell','加点仓')}]) {
    const report = grade('h-reference',{...own,fields:{...own.fields,...item}});
    assert.equal(report.critical,true);
    assert.equal(report.score,0);
  }
  const falseQuantity = grade('t-budget',{intent:'proposal',fields:{quantity:field(50000,'五万美元')}});
  assert.equal(falseQuantity.critical,true);
});

test('a third-party suggestion must not trigger a proposal; rejecting a raw false proposal is visible separately', () => {
  const raw = {intent:'proposal',fields:{action:field('sell','卖出')}};
  assert.equal(grade('t-reported',raw).critical,true);
  const filtered = grade('t-reported',{intent:'other',fields:{}},raw);
  assert.equal(filtered.critical,false);
  assert.equal(filtered.rawCritical,true);
  assert.ok(filtered.score < 1);
});

test('accepts evidence-supported equivalent timestamps and requires evidence for a withdrawal', () => {
  const row = {intent:'proposal',fields:{action:field('buy','买入'),securityName:field('宁德时代','宁德时代'),recommended_at:field('2026-11-03T06:00:00Z','北京时间11月3日14点')}};
  assert.equal(grade('v-date',row).score,1);
  assert.equal(grade('h-retract',{intent:'cancel',fields:{},intentEvidence:'请撤回整条建议'}).score,1);
  assert.ok(grade('h-retract',{intent:'cancel',fields:{},intentEvidence:'请取消'}).score < 1);
});

test('summary QA allows paraphrases while spotting fabricated prices, unit swaps or a false action', () => {
  assert.equal(grade('t-hkd','拟成交价是每股 78.50 港元。').score,1);
  assert.equal(grade('t-hkd','共120股，单价为 78.5 HKD。').score,1);
  for (const response of ['拟成交价是每股 78.5 美元。','拟成交是每股 87.5 港元。','单价为 120 港元，共 78.5 股。']) {
    assert.equal(grade('t-hkd',response).critical,true);
  }
  assert.equal(grade('t-confirmed','回执显示，这条建议已经登记。').score,1);
  assert.equal(grade('t-confirmed','我已经帮你登记。').critical,true);
  assert.equal(grade('t-presence','在呀。现在最新报价为 78.5 港元。').critical,true);
  assert.equal(grade('h-wait','还没录入，正在等 PM 确认。').score,1);
  assert.equal(grade('h-wait','已成功录入。').critical,true);
});

test('captured bad chat is scored separately when delivery rejects it; timeout yields zero', () => {
  const failed = scoreExample(example('t-presence'),{raw:'我刚刚帮你买入。',error:'mock-rejected',latencyMs:25});
  assert.equal(failed.score,0);
  assert.equal(failed.rawCritical,true);
  assert.equal(failed.latencyMs,25);
  assert.equal(failed.passed,false);
  assert.equal(scoreExample(example('t-presence'),{error:'timeout'}).score,0);
});

test('read grading checks section set and scope in raw and applied results, with ordinary chat and approval as controls',()=>{
  const tool={read:'formal_report',sections:['trades','scores'],scope:'named',subject:'景秋'};
  const example={kind:'chat',input:{text:'查景秋的成交和评分'},expect:{tool}};
  const score=(raw,result)=>scoreExample(example,{raw,result});
  assert.equal(score(JSON.stringify({...tool,sections:['scores','trades']}),tool).passed,true);
  for(const wrong of [{...tool,scope:'all'},{...tool,subject:'朱良'},{...tool,sections:['scores']},{...tool,ownerId:'made_up'},{read:'approve'}]){
    assert.equal(score(JSON.stringify(wrong),tool).rawCritical,true);
    assert.equal(score(JSON.stringify(tool),wrong).critical,true);
  }
  assert.equal(score('我已替你下单。','我已替你下单。').critical,true);
  assert.equal(scoreExample({kind:'chat',input:{text:'路上好堵'},expect:{concepts:[['堵']]}},{result:tool}).critical,true);
});
