// src/lib/judgments/testing/envelopes.ts
// Test-only row builders (not imported by production code): a valid probability judgment of the
// synthetic method with every contract field set, its settlement, calibration and methodology rows,
// and the envelope that latest_judgment_cards / judgment_history / calibration_cohort* return.
// Each builder takes a partial override; ids are deterministic (uuidOf(n)).
import type {CalibrationRow,Envelope,JudgmentRow,MethodologyEvent,MethodologyRow,SettlementRow} from '../types';

export const uuidOf=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ISSUER='11111111-1111-4111-8111-111111111111';
export const BATCH='22222222-2222-4222-8222-222222222222';
const HEX=(c:string)=>c.repeat(64);
const day=(iso:string,n:number)=>new Date(Date.parse(`${iso}T00:00:00.000Z`)+n*86_400_000).toISOString().slice(0,10);

export function methodologyRow(p:Partial<MethodologyRow>={}):MethodologyRow{
 return {methodology_id:'synthetic_fact_metric',version:'v1',judgment_type:'synthetic_fact_metric',kind:'probability',producer_kind:'rule',
  subject_types:['issuer'],input_kinds:['financial_fact'],markets:null,title_zh:'合成事实判断',title_en:'Synthetic fact judgment',
  doc_path:'docs/methodologies/synthetic_fact_metric/v1.md',doc_sha256:HEX('a'),implementation_sha256:HEX('b'),
  params:{grace_days:30,threshold_n:3,ece_max:0.1,window_years:3},params_json:{},horizon:{unit:'calendar_days',n:10},upstream:{},
  deps_sha256:HEX('c'),formula_hash:HEX('d'),status:'active',publishable:true,code_version:'abcdef1',
  created_at:'2026-01-01T00:00:00.000Z',synced_at:'2026-01-01T00:00:00.000Z',...p};
}
export function methodologyEvent(p:Partial<MethodologyEvent>={}):MethodologyEvent{
 return {event_id:uuidOf(990001),methodology_id:'synthetic_fact_metric',version:'v1',seq:1,event:'registered',status:'active',publishable:true,
  formula_hash:HEX('d'),code_version:'abcdef1',actor:'script',reason:null,occurred_at:'2026-01-01T00:00:00.000Z',...p};
}
/** n picks judgment_id = uuidOf(n); as_of defaults to 2026-01-01 + n days; target = as_of + 10 days. */
export function judgmentRow(p:Partial<JudgmentRow>&{n?:number}={}):JudgmentRow{
 const {n=1,...rest}=p;
 const as_of=rest.as_of??day('2026-01-01',n);
 const target=rest.target??{kind:'date' as const,date:day(as_of,10)};
 const settleAfter=`${target.kind==='date'?target.date:day(as_of,10)}T00:00:00.000Z`;
 return {judgment_id:uuidOf(n),subject_type:'issuer',subject_key:ISSUER,judgment_type:'synthetic_fact_metric',methodology_id:'synthetic_fact_metric',methodology_version:'v1',
  kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of,registered_at:`${as_of}T12:00:00.000Z`,retrospective:false,
  inputs:[{kind:'financial_fact',ref:{fact_id:uuidOf(500000+n)},snapshot:{fact_id:uuidOf(500000+n),issuer_id:ISSUER,market:'US',concept:'revenue',period_start:'2025-07-01',period_end:'2025-09-30',duration:'3M',value_text:'100',unit:'USD',consolidation:'consolidated',available_date:as_of,filing_id:uuidOf(600000+n),mapping_gen:1},hash:HEX('e'),available_at:`${as_of}T23:59:59.999Z`,origin:{publisher:'SEC',adapter:'edgar',locator:'companyfacts'}}],
  inputs_hash:HEX('f'),abstained:false,abstain_reason:null,claim:{p:0.7,event:{zh:'营收同比增长',en:'Revenue grows year over year'}},
  condition:{resolver:'fact_metric',params:{issuer_id:ISSUER,market:'US',metric:'revenue',period_start:'2025-10-01',period_end:'2025-12-31',duration:'3M',unit:'USD',input_unit:'USD',basis:'reported',formula_version:'metrics/1',compare:'yoy'},predicate:{op:'>',rhs:0},text:{zh:'2025Q4 营收同比 > 0',en:'2025Q4 revenue YoY > 0'}},
  horizon:{unit:'calendar_days',n:10},target,label_policy:'first_observed',settle_after:settleAfter,
  settle_by:new Date(Date.parse(settleAfter)+30*86_400_000).toISOString(),code_version:'abcdef1',batch_id:BATCH,created_at:`${as_of}T12:00:00.000Z`,...rest};
}
export function settlementRow(p:Partial<SettlementRow>={}):SettlementRow{
 return {settlement_id:uuidOf(700001),judgment_id:uuidOf(1),seq:1,kind:'settled',outcome:'hit',
  realized:{value:0.12,unit:'ratio',from:'2024-10-01',to:'2025-12-31',label_policy:'first_observed'},evidence:{},resolver:'fact_metric',resolver_version:'1',
  reason:null,actor:'cron',settled_at:'2026-03-01T03:00:00.000Z',request_key:'cron:test-key-1',request_digest:HEX('1'),code_version:'abcdef1',batch_id:BATCH,...p};
}
export function calibrationRow(p:Partial<CalibrationRow>={}):CalibrationRow{
 return {calibration_id:uuidOf(800001),methodology_id:'synthetic_fact_metric',methodology_version:'v1',scope_type:'all',scope_key:'',window_from:'2023-11-09',window_to:'2026-11-09',
  n_registered:140,n_settled:120,n_independent:110,n_void:5,n_retrospective_excluded:3,threshold_n:100,ece_max:0.1,kind:'probability',state:'calibrated',
  valid_until:'2026-11-23T04:00:00.000Z',validity_revision:1,
  metrics:{n_total:118,brier:0.18,brier_skill:0.21,ece_raw:0.05,hit_rate:{rate:0.64,low:0.55,high:0.72},temporal_split:{ece_raw_holdout:0.06,brier_skill_holdout:0.12}},
  reliability:[],isotonic_segments:null,cohort_path:`cohorts/${HEX('9')}.json`,cohort_sha256:HEX('9'),
  query_bounds:{window_from:'2023-11-09',window_to:'2026-11-09',registered_at_lte:'2026-11-09T04:00:00.000Z',settled_at_lte:'2026-11-09T04:00:00.000Z',frozen_at:'2026-11-09T04:00:00.000Z',n:140},
  fingerprint:HEX('8'),algorithm_version:'judgments-calibration/1',code_version:'abcdef1',computed_at:'2026-11-09T04:00:00.000Z',batch_id:BATCH,...p};
}
export interface EnvelopeSpec{judgment?:Partial<JudgmentRow>&{n?:number};settlement?:Partial<SettlementRow>|null;calibration?:Partial<CalibrationRow>|null;calibration_valid?:boolean;methodology_state?:Partial<MethodologyEvent>|null}
export function envelope(p:EnvelopeSpec={}):Envelope{
 const judgment=judgmentRow(p.judgment);
 return {judgment,
  settlement:p.settlement===null||p.settlement===undefined?null:settlementRow({judgment_id:judgment.judgment_id,...p.settlement}),
  calibration:p.calibration===null||p.calibration===undefined?null:calibrationRow(p.calibration),
  calibration_valid:p.calibration_valid??(p.calibration!==null&&p.calibration!==undefined),
  methodology_state:p.methodology_state===null?null:methodologyEvent(p.methodology_state??{})};
}
