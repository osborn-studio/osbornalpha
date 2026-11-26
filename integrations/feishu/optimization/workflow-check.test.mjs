import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assessBusinessCase,businessComparison,loadBusinessFixtures} from './workflow-check.mjs';

const examples = JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
const byId = id=>examples.find(example=>example.id===id);
const field = (value,evidence)=>({value,evidence});
const proposal = fields=>({intent:'proposal',fields});
const other = {intent:'other',fields:{}};
const amount = proposal({action:field('buy','建仓'),securityName:field('英伟达','英伟达'),executionMode:field('simulate','先买五万美元')});
const trade = proposal({ticker:field('AAPL','AAPL'),action:field('sell','卖出'),executionMode:field('simulate','模拟卖出'),
  quantity:field(18,'18股'),price:field(223.5,'每股223.5美元成交'),fee:field(1,'手续费1美元')});

test('fixed budget leads to the true parser asking for shares and unit price, without a summary',()=>{
  const {observed,passed} = assessBusinessCase(byId('t-budget'),amount);
  assert.equal(passed,true);
  assert.deepEqual(observed.missing,['price','quantity']);
  assert.equal(observed.fields.ticker,'NVDA');
  assert.equal(observed.summary,undefined);
});

test('reads a simulated sell from the formal PM summary, with exact fee, direction, per-share price and volume',()=>{
  const {observed,passed} = assessBusinessCase(byId('h-sell'),trade);
  assert.equal(passed,true);
  assert.deepEqual(observed.simulation,{direction:'sell',quantity:18,price:223.5,fee:1});
  assert.match(observed.summary,/卖出 18 股 × 223.5 USD，手续费 1/u);
  assert.match(observed.summary,/直接回复这条摘要「同意」/u);
  const dropped = {...trade,fields:{...trade.fields,fee:field(1,'别的收费')}};
  assert.equal(assessBusinessCase(byId('h-sell'),dropped).passed,false);
});

test('advice-only removes old proposed shares and never shows a simulated execution',()=>{
  const result = assessBusinessCase(byId('v-switch'),proposal({executionMode:field('advice_only','只登记建议')}));
  assert.equal(result.passed,true);
  assert.equal(result.observed.simulation,null);
  assert.match(result.observed.summary,/仅登记建议/u);
});

test('resolves independent market fixtures only on the real search key; a dual listing still needs market',()=>{
  const partial = proposal({action:field('pass','观望'),securityName:field('腾讯音乐','腾讯音乐')});
  assert.equal(assessBusinessCase(byId('h-scope'),partial).passed,true);
  const hk = proposal({market:field('HK','在香港挂牌')});
  const choice = assessBusinessCase(byId('t-market'),hk);
  assert.equal(choice.passed,true);
  assert.equal(choice.observed.fields.ticker,'00941.HK');
});

test('valid analyst supplements preserve the original stock and identify a changed share count',()=>{
  assert.equal(assessBusinessCase(byId('t-quantity'),proposal({quantity:field(30,'三十股'),price:field(128,'每股128美元模拟成交')})).passed,true);
  assert.equal(assessBusinessCase(byId('v-bare'),proposal({quantity:field(45,'45')})).passed,true);
  const corrected = assessBusinessCase(byId('h-correction'),proposal({quantity:field(24,'24股')}));
  assert.equal(corrected.passed,true);
  assert.deepEqual(corrected.observed.missing,['price']);
  assert.equal(assessBusinessCase(byId('h-correction'),proposal({quantity:field(12,'12股')})).passed,false);
});

test('a grounded new proposal differs from casual chat or an extractor outage, while ambiguous owned proposals require clarification',()=>{
  const reported = byId('t-reported');
  assert.equal(assessBusinessCase(reported,other).passed,true);
  assert.equal(assessBusinessCase(reported,null).passed,false);
  assert.equal(assessBusinessCase(reported,proposal({action:field('sell','卖出'),securityName:field('腾讯','腾讯')})).passed,false);
  const multiple = {intent:'ambiguous',fields:{},intentEvidence:'我有两条独立建议要录，各算各的：苹果减仓，微软加仓'};
  assert.equal(assessBusinessCase(byId('t-double'),multiple).passed,true);
  assert.equal(assessBusinessCase(byId('t-double'),{...multiple,intentEvidence:'完全无关'}).passed,false);
});

test('replays every selected pair, detects a regression, and rejects changed data or duplicate pairs',()=>{
  const selected = [byId('h-sell'),byId('h-code')];
  const rows = selected.map(example=>({id:example.id,run:1,kind:'extraction',
    baseline:{result:example.id==='h-sell'?trade:other},candidate:{result:other}}));
  const report = {scope:'model-adapters',split:'holdout',repeat:1,uniqueCases:2,rows,
    datasetHash:createHash('sha256').update(JSON.stringify(selected)).digest('hex')};
  const result = businessComparison(selected,report);
  assert.equal(result.baselinePassed,2);
  assert.equal(result.candidatePassed,1);
  assert.deepEqual(result.regressions,[{id:'h-sell',run:1}]);
  assert.throws(()=>businessComparison(selected,{...report,datasetHash:'invalid'}),/指纹/u);
  assert.throws(()=>businessComparison(selected,{...report,rows:[rows[0],rows[0]]}),/重复/u);
});

test('external expectations bind the case fingerprint and use only the supplied listing catalogue',()=>{
  const example = {id:'external',kind:'extraction',split:'holdout',
    input:{text:'我建议持有港股样例公司。',receivedAt:'2026-06-01T10:00:00+08:00'}};
  const packet = proposal({action:field('hold','持有'),securityName:field('样例公司','样例公司'),market:field('HK','港股')});
  const expected = {route:'pm_advice',fields:{ticker:'09876.HK',market:'HK',action:'hold'}};
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const recorded = {id:example.id,sha256:hash(example),expected};
  const fixture = {cases:[recorded],catalogues:{'样例公司':[{ticker:'09876.HK',market:'HK'}]}};
  const fixtures = loadBusinessFixtures([example],fixture);
  const report = {scope:'model-adapters',split:'holdout',repeat:1,uniqueCases:1,datasetHash:hash([example]),
    rows:[{id:example.id,kind:'extraction',run:1,baseline:{result:other},candidate:{result:packet}}]};
  const result = businessComparison([example],report,fixtures);
  assert.equal(result.candidatePassed,1);
  assert.deepEqual(result.improvements,[{id:example.id,run:1}]);
  const emptyCatalogue = loadBusinessFixtures([example],{...fixture,catalogues:{}});
  assert.equal(businessComparison([example],report,emptyCatalogue).candidatePassed,0);
  assert.throws(()=>loadBusinessFixtures([{...example,input:{...example.input,text:'改题'}}],fixture),/指纹/u);
  assert.throws(()=>loadBusinessFixtures([example],{...fixture,cases:[recorded,recorded]}),/重复/u);
});
