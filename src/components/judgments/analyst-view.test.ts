// src/components/judgments/analyst-view.test.ts
// Task 20 (spec §11.2, §8.6): the /analyst confidence column shows a band + "uncalibrated" and never a percent of p; the
// judgments.analyst message subtree is complete and in zh/en parity.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {SelfAssessment} from '@/lib/judgments/adapters/recommendation';
import {toJudgmentCard} from '@/lib/judgments/adapters/recommendation';
import {fixtureRecommendation as rec,fixtureScore as score} from '@/lib/judgments/testing/recommendation-fixture';
import {bandSegments,confidenceView,selfAssessmentView} from './analyst-view';

const messages=(l:'zh'|'en')=>JSON.parse(readFileSync(`messages/${l}/judgments.json`,'utf8')) as Record<string,unknown>;
function keys(v:unknown,prefix=''):string[]{if(typeof v!=='object'||v===null||Array.isArray(v))return [prefix];return Object.entries(v).flatMap(([k,c])=>keys(c,prefix?`${prefix}.${k}`:k));}
const get=(o:unknown,path:string)=>path.split('.').reduce<unknown>((a,k)=>a&&typeof a==='object'?(a as Record<string,unknown>)[k]:undefined,o);
const placeholders=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]).sort();
const USED=['analyst.uncalibrated','analyst.toggleAria','analyst.showRegistered','analyst.hideRegistered','analyst.registeredLabel','analyst.registeredNote',
 'analyst.lifecycleLabel','analyst.abstainLabel','analyst.conditionLabel','analyst.targetLabel','analyst.target','analyst.settleBy',
 ...['low','mid','high'].map(b=>`analyst.band.${b}`),...['abstained','open','settled','void','withdrawn','pending_fill'].map(l=>`analyst.lifecycle.${l}`),
 'analyst.outcome.hit','analyst.outcome.miss',...['no_confidence','no_direction','market_unsupported'].map(r=>`analyst.abstain.${r}`),
 ...['title','empty','settled','independent','hitRate','brier','brierSkill','bandTable','note','columns.band','columns.n','columns.hits','columns.rate'].map(k=>`analyst.selfAssessment.${k}`)];

describe('/analyst confidence view (Task 20)',()=>{
 it('settled card: band high, registered decimal 0.72, lifecycle and outcome; no percent anywhere',()=>{
  const v=confidenceView(toJudgmentCard(rec(),score()));
  expect(v).toMatchObject({band:'high',registered:'0.72',lifecycle:'settled',outcome:'hit',abstainReason:null});
  expect(JSON.stringify(v)).not.toMatch(/\d%/);
 });
 it('abstained card has no band and carries the reason; a missing card renders nothing',()=>{
  expect(confidenceView(toJudgmentCard(rec({action:'hold'}),null))).toMatchObject({band:null,registered:null,lifecycle:'abstained',abstainReason:'no_direction'});
  expect(confidenceView(null)).toEqual({band:null,registered:null,lifecycle:null,outcome:null,abstainReason:null,condition:null,headline:null});
 });
 it('lights exactly one segment per band',()=>{
  expect(bandSegments('low')).toEqual([true,false,false]);
  expect(bandSegments('mid')).toEqual([false,true,false]);
  expect(bandSegments('high')).toEqual([false,false,true]);
  expect(bandSegments(null)).toEqual([false,false,false]);
 });
 it('formats the self-assessment: hit rate with Wilson interval, Brier to 3 decimals, signed skill, per-band rows',()=>{
  const sa:SelfAssessment={state:'self_assessed',auditable:false,n_total:3,n_independent:2,brier:0.1,brier_skill:0.6,ece_raw:0.2,
   hit_rate:{rate:0.5,low:0.0945,high:0.9055},reliability:[],
   bands:[{band:'high',n:1,hits:1,rate:1,low:0.2065,high:1},{band:'mid',n:1,hits:0,rate:0,low:0,high:0.7935},{band:'low',n:0,hits:0,rate:null,low:null,high:null}]};
  expect(selfAssessmentView(sa)).toEqual({empty:false,settled:3,independent:2,hitRate:'50%',interval:'9–91%',brier:'0.100',brierSkill:'+0.60',
   bands:[{band:'high',n:1,hits:1,rate:'100%',interval:'21–100%'},{band:'mid',n:1,hits:0,rate:'0%',interval:'0–79%'},{band:'low',n:0,hits:0,rate:'—',interval:null}]});
  expect(selfAssessmentView({...sa,n_independent:0}).empty).toBe(true);
 });
 it('judgments.analyst messages: every used key exists in zh and en, the subtrees are in parity, placeholders match',()=>{
  const zh=messages('zh'),en=messages('en');
  for(const k of USED)expect({k,zh:typeof get(zh,k),en:typeof get(en,k)}).toEqual({k,zh:'string',en:'string'});
  expect(keys(zh.analyst).sort()).toEqual(keys(en.analyst).sort());
  for(const k of keys(zh.analyst))expect({k,p:placeholders(String(get(zh.analyst,k)))}).toEqual({k,p:placeholders(String(get(en.analyst,k)))});
 });
});
