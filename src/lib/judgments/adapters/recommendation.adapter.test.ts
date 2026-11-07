// src/lib/judgments/adapters/recommendation.adapter.test.ts
// Task 20 (spec §11.2, §8.6, §14.1 recommendation.adapter.test.ts, §14.4): the private recommendation_call@v1 adapter.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Recommendation,RecommendationScore} from '@/lib/supabase/database.types';
import type {Input} from '@/lib/judgments/types';
import {digest,sha256} from '@/lib/judgments/canonical';
import {uuidV8} from '@/lib/judgments/uuid-v8';
import {originFor} from '@/lib/judgments/origins';
import {parseReplayFixture} from '@/lib/judgments/replay';
import {NO_ISSUERS,bandOf,legacyFillInput,loadIssuerIndex,recommendationCardId,selfAssessment,toJudgmentCard,type IssuerLookupClient} from './recommendation';
import {FIXTURE_REC_ID,buildRecommendationReplayFixture,fixtureRecommendation as rec,fixtureScore as score} from '@/lib/judgments/testing/recommendation-fixture';

const unfilled=(p:Partial<Recommendation>={})=>rec({fill_price:null,fill_date:null,...p});
function fakeClient(tables:{issuer_securities?:unknown[];stocks_universe?:unknown[]},fail=false):IssuerLookupClient{
 return {from:(table)=>({select:()=>({in:async(_c:string,values:string[])=>fail?{data:null,error:{message:'boom'}}:{data:(tables[table]??[]).filter(r=>values.includes((r as {ticker:string}).ticker)),error:null}})})};
}

describe('recommendation_call@v1 adapter (Task 20)',()=>{
 it('unscored (no fill): pending_fill with empty inputs, no condition / target, serialisable, band without percent',()=>{
  const card=toJudgmentCard(unfilled(),null);
  expect(card).toMatchObject({lifecycle:'pending_fill',outcome:null,condition:null,settlement:null,inputs:[],calibration:'self_assessed',source:'recommendation',
   kind:'probability',judgment_type:'recommendation_call',as_of:'2026-09-14',display:{percent:null,value:0.72,band:'high'}});
  expect(JSON.parse(JSON.stringify(card))).toEqual(card);
  expect(JSON.stringify(card)).not.toContain('undefined');
 });

 it('filled, unscored: open, session_index target on fill_date + 5, settle window from the contract, legacy_fill input',()=>{
  const card=toJudgmentCard(rec(),null);
  expect(card.lifecycle).toBe('open');
  expect(card.condition).toEqual({text:{zh:'第 5 个后续交易日收盘价高于基准日收盘（看多）',en:'Close on the 5th following session above the base-date close (long)'},
   horizon:{unit:'trading_sessions',n:5},target:{kind:'session_index',base_date:'2026-09-14',n:5},label_policy:'first_observed',
   settle_after:'2026-09-19T00:00:00.000Z',settle_by:'2026-11-18T00:00:00.000Z'});
  expect(card.inputs).toEqual([{kind:'legacy_fill',ref:{recommendation_id:FIXTURE_REC_ID},available_at:'2026-09-14T07:00:00.000Z',
   origin:originFor('legacy_fill','eastmoney',{recommendation_id:FIXTURE_REC_ID}),href:null}]);
  const fill=legacyFillInput(rec())!;
  expect(fill.snapshot).toEqual({recommendation_id:FIXTURE_REC_ID,fill_price:1452.1,fill_date:'2026-09-14',market:'A',ticker:'600519'});
  expect(fill.hash).toBe(digest(fill.snapshot));
 });

 it('hit=true → settled hit, hit=false → settled miss; realized is the self-reported hit flag',()=>{
  const hit=toJudgmentCard(rec(),score());
  expect(hit).toMatchObject({lifecycle:'settled',outcome:'hit',settlement:{kind:'settled',outcome:'hit',settled_at:'2026-09-22T09:00:00.000Z',
   realized:{value:true,label:'+2.31%',unit:null,from:'2026-09-14',to:null,label_policy:'first_observed'}}});
  expect(toJudgmentCard(rec(),score({hit:false,forward_5d_pct:-1.2}))).toMatchObject({lifecycle:'settled',outcome:'miss',settlement:{realized:{value:false,label:'-1.20%'}}});
 });

 it('withdrawn takes priority over everything, including a hit and a missing confidence',()=>{
  const w=toJudgmentCard(rec({withdrawn_at:'2026-09-20T02:00:00.000Z',withdraw_reason:'thesis broken'}),score());
  expect(w).toMatchObject({lifecycle:'withdrawn',outcome:null,settlement:{kind:'withdrawn',outcome:null,realized:null,settled_at:'2026-09-20T02:00:00.000Z',evidence_summary:{zh:'thesis broken',en:'thesis broken'}}});
  expect(toJudgmentCard(rec({withdrawn_at:'2026-09-20T02:00:00.000Z',confidence:null}),null).lifecycle).toBe('withdrawn');
 });

 it('abstains no_confidence before no_direction; hold has no direction; pass is a short call; non-A/HK/US markets abstain',()=>{
  expect(toJudgmentCard(rec({confidence:null}),score())).toMatchObject({lifecycle:'abstained',abstain_reason:'no_confidence',condition:null,inputs:[],display:{percent:null,value:null}});
  expect(toJudgmentCard(rec({confidence:null,action:'hold'}),null).abstain_reason).toBe('no_confidence');
  expect(toJudgmentCard(rec({action:'hold'}),score({hit:null}))).toMatchObject({lifecycle:'abstained',abstain_reason:'no_direction'});
  const pass=toJudgmentCard(rec({action:'pass'}),null);
  expect(pass.lifecycle).toBe('open');
  expect(pass.condition?.text.zh).toBe('第 5 个后续交易日收盘价低于基准日收盘（看空）');
  expect(toJudgmentCard(unfilled({market:'JP',ticker:'7203'}),null)).toMatchObject({lifecycle:'abstained',abstain_reason:'market_unsupported'});
 });

 it('subject: issuer from issuer_securities ⋈ stocks_universe on the recommendation date, else security',async()=>{
  const open=await loadIssuerIndex(fakeClient({issuer_securities:[{issuer_id:'iss-1',ticker:'600519',valid_from:'2001-08-27',valid_to:null}],stocks_universe:[{ticker:'600519',market:'A'}]}),[rec()]);
  expect(toJudgmentCard(rec(),null,open).subject).toEqual({type:'issuer',key:'iss-1'});
  const ended=await loadIssuerIndex(fakeClient({issuer_securities:[{issuer_id:'iss-1',ticker:'600519',valid_from:'2001-08-27',valid_to:'2026-09-14'}],stocks_universe:[{ticker:'600519',market:'A'}]}),[rec()]);
  expect(toJudgmentCard(rec(),null,ended).subject).toEqual({type:'security',key:'A:600519'});   // valid_to is exclusive
  const other=await loadIssuerIndex(fakeClient({issuer_securities:[{issuer_id:'iss-1',ticker:'600519',valid_from:'2001-08-27',valid_to:null}],stocks_universe:[{ticker:'600519',market:'HK'}]}),[rec()]);
  expect(toJudgmentCard(rec(),null,other).subject).toEqual({type:'security',key:'A:600519'});
  expect(toJudgmentCard(rec(),null,NO_ISSUERS).subject).toEqual({type:'security',key:'A:600519'});
  await expect(loadIssuerIndex(fakeClient({},true),[rec()])).rejects.toThrow('boom');
  expect(await loadIssuerIndex(fakeClient({},true),[])).toBe(NO_ISSUERS);
 });

 it('id is domain separated: uuidV8(sha256("recommendation:"+id)), a v8 uuid, not the bare-id hash',()=>{
  const id=toJudgmentCard(rec(),null).judgment_id;
  expect(id).toBe(uuidV8(sha256(`recommendation:${FIXTURE_REC_ID}`)));
  expect(id).toBe(recommendationCardId(FIXTURE_REC_ID));
  expect(id).not.toBe(uuidV8(sha256(FIXTURE_REC_ID)));
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 });

 it('never unlocks a percent: every state is self_assessed with percent null',()=>{
  const variants:Array<[Recommendation,RecommendationScore|null]>=[[unfilled(),null],[rec(),null],[rec(),score()],[rec({confidence:99}),score()],[rec({withdrawn_at:'2026-09-20T02:00:00.000Z'}),score()],[rec({action:'hold'}),null],[rec({confidence:null}),null]];
  for(const [r,s] of variants){const c=toJudgmentCard(r,s);expect({calibration:c.calibration,percent:c.display.percent,summary:c.calibration_summary}).toEqual({calibration:'self_assessed',percent:null,summary:null});}
 });

 it('bands are terciles: [0,1/3) low, [1/3,2/3) mid, [2/3,1] high',()=>{
  expect([0,0.333,1/3,0.5,0.666,2/3,0.67,1].map(bandOf)).toEqual(['low','low','mid','mid','mid','high','high','high']);
 });

 it('flags back-dated recommendations as retrospective (as_of before the registration date)',()=>{
  const c=toJudgmentCard(rec({recommended_at:'2026-09-01T01:30:00.000Z',fill_date:'2026-09-01'}),null);
  expect({as_of:c.as_of,retrospective:c.retrospective}).toEqual({as_of:'2026-09-01',retrospective:true});
  expect(toJudgmentCard(rec(),null).retrospective).toBe(false);
 });

 it('selfAssessment: settled, non-retrospective, independent calls only; Brier, hit rate and bands; state self_assessed, not auditable',()=>{
  const at=(d:string)=>`${d}T01:30:00.000Z`;
  const row=(id:string,p:Partial<Recommendation>,s:Partial<RecommendationScore>|null)=>({recommendation:rec({id,...p}),score:s===null?null:score({recommendation_id:id,...s})});
  const sa=selfAssessment([
   row('a0000000-0000-4000-8000-000000000001',{confidence:80},{hit:true}),
   row('a0000000-0000-4000-8000-000000000002',{confidence:90,recommended_at:at('2026-09-15'),created_at:at('2026-09-15'),fill_date:'2026-09-15'},{hit:false}),
   row('a0000000-0000-4000-8000-000000000003',{confidence:40,ticker:'000001'},{hit:false}),
   row('a0000000-0000-4000-8000-000000000004',{withdrawn_at:'2026-09-16T00:00:00.000Z'},{hit:true}),
   row('a0000000-0000-4000-8000-000000000005',{ticker:'000002'},null),
   row('a0000000-0000-4000-8000-000000000006',{ticker:'000003',recommended_at:at('2026-08-03'),fill_date:'2026-08-03'},{hit:true}),
  ]);
  expect(sa).toMatchObject({state:'self_assessed',auditable:false,n_total:3,n_independent:2,hit_rate:{rate:0.5}});
  expect(sa.brier!).toBeCloseTo(0.1,10);   // ((0.8−1)² + (0.4−0)²) / 2; the overlapping 600519 call of 09-15 is not independent
  expect(sa.bands.map(b=>({band:b.band,n:b.n,hits:b.hits}))).toEqual([{band:'high',n:1,hits:1},{band:'mid',n:1,hits:0},{band:'low',n:0,hits:0}]);
  expect(sa.bands[2]).toMatchObject({rate:null,low:null,high:null});
  expect(JSON.stringify(sa)).not.toContain('percent');
 });

 it('the committed private replay fixture (Task 13 format) equals the builder, carries the card id and the frozen fill, and detects a tampered fill',()=>{
  const committed=parseReplayFixture(JSON.parse(readFileSync('fixtures/judgments/replay/recommendation-call.json','utf8')));
  expect(committed).toEqual(JSON.parse(JSON.stringify(buildRecommendationReplayFixture())));
  expect(committed).toMatchObject({fixture_version:'judgment-replay/1',expect:'inputs_only',judgment:{producer_kind:'human',methodology_id:'recommendation_call',methodology_version:'v1'}});
  expect(committed.judgment.judgment_id).toBe(toJudgmentCard(rec(),score()).judgment_id);
  expect(committed.judgment.judgment_id).toBe(recommendationCardId(FIXTURE_REC_ID));
  const fill=committed.judgment.inputs[0] as Extract<Input,{kind:'legacy_fill'}>;
  expect(digest(fill.snapshot)).toBe(fill.hash);
  const tampered=structuredClone(fill);tampered.snapshot.fill_price=1452.2;
  expect(digest(tampered.snapshot)).not.toBe(tampered.hash);
  // replay.test.ts (Task 13) iterates this file too: inputs_only, and its generic tamper (fill_price + 1) → input_hash_mismatch on legacy_fill.
 });
});
