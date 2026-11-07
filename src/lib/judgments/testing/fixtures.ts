// src/lib/judgments/testing/fixtures.ts
// Test-only builders (plan F4 Tasks 11/12/14; production code must never import this file):
// - stubInputsDb(): a JudgmentInputsDb whose every method rejects with not_stubbed:<name> unless overridden, so a
//   resolver test proves exactly which reads it makes;
// - fixtureKline(): synthetic K-line fixtures served with readKlineRange's [from, to] inclusive semantics (spec
//   §7.4); requests are recorded and the fixture array is read at call time (a test swaps in "the 5th bar printed");
// - factsBackedDerive(): the §12.2 composition (readFacts history at asOf → deriveMetrics) over any readFacts, used
//   with plan 2's memoryFactsDb;
// - priceJudgment()/conditionJudgment(): registered judgment rows; testMethodologyRow(): an active synthetic
//   price_return methodology row (judgment_type reuses the test-only 'synthetic_fact_metric' member of JudgmentType);
// - stubResolver(): a Resolver whose resolve() the test scripts; withOverrides(): a delegating wrapper that replaces
//   single methods of a db object (prototype delegation, so closures and `this` keep working).
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {KlineSourceName,SourceKlineBar} from '@/lib/data/kline/types';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics} from '@/lib/facts/derive';
import {FactsDbError} from '@/lib/facts/types';
import type {FactsDb} from '@/lib/facts/types';
import {digest,inputsHash} from '../canonical';
import {JudgmentError} from '../errors';
import type {CapabilityLookup} from '../resolvers/price';
import {addDaysIso,closeInstantUtc} from '../time';
import type {Adjustment,Condition,Input,JudgmentInputsDb,JudgmentInsert,JudgmentRow,KlineRangeRequest,LabelPolicy,MethodologyRow,NumPredicate,PriceBarSnapshot,PriceMarket,Resolver,Target} from '../types';

export interface KlineFixture{meta:{synthetic:true;ticker:string;market:PriceMarket;source:KlineSourceName;adjustment:Adjustment;note:string};bars:SourceKlineBar[]}
export const loadKlineFixture=(name:string):KlineFixture=>JSON.parse(readFileSync(join(process.cwd(),'fixtures/judgments/kline',name),'utf8')) as KlineFixture;
/** The fixture as it looked before `lastDate`'s later sessions printed. */
export const truncateFixture=(f:KlineFixture,lastDate:string):KlineFixture=>({...f,bars:f.bars.filter(b=>b.time<=lastDate)});

const no=(name:string)=>async():Promise<never>=>{throw new Error(`not_stubbed:${name}`);};
export function stubInputsDb(over:Partial<JudgmentInputsDb>={}):JudgmentInputsDb{
 return {
  facts:{readFacts:no('facts.readFacts'),factsByIds:no('facts.factsByIds'),filingsOfIssuer:no('facts.filingsOfIssuer')},
  deriveMetricsAsOf:no('deriveMetricsAsOf'),
  macro:{observation:no('macro.observation'),snapshot:no('macro.snapshot'),snapshotsSince:no('macro.snapshotsSince'),seriesCatalog:no('macro.seriesCatalog'),classifyAsOf:no('macro.classifyAsOf')},
  tableRows:no('tableRows'),publicJudgment:no('publicJudgment'),kline:no('kline'),issuerPrimarySecurity:no('issuerPrimarySecurity'),
  ...over,
 };
}

export function fixtureKline(fixtures:KlineFixture[],calls:KlineRangeRequest[]=[]):JudgmentInputsDb['kline']{
 return async req=>{
  calls.push(req);
  if(req.signal.aborted)return {failure:'timeout'};
  const f=fixtures.find(x=>x.meta.ticker===req.ticker&&x.meta.market===req.market&&x.meta.source===req.source&&x.meta.adjustment===req.adjustment);
  if(!f)return {failure:'not_found'};
  return {source:f.meta.source,adjustment:f.meta.adjustment,volumeUnit:'shares',bars:f.bars.filter(b=>b.time>=req.from&&b.time<=req.to).map(b=>({...b}))};
 };
}

export function factsBackedDerive(facts:Pick<FactsDb,'readFacts'>):JudgmentInputsDb['deriveMetricsAsOf']{
 return async(issuer,market,asOf,formulaVersion)=>{
  if(formulaVersion!==FORMULA_VERSION)throw new JudgmentError('unsupported_formula_version');
  const envelope=await facts.readFacts(issuer,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
  if(envelope.truncated)throw new FactsDbError('read_truncated');
  return {metrics:deriveMetrics(envelope.rows,{market,asOf,basedOnRev:envelope.stateRev}),envelope};
 };
}

export const withOverrides=<T extends object>(base:T,over:Partial<T>):T=>Object.assign(Object.create(base) as T,over);

export const TEST_CODE_VERSION='test-code-version';
export const REGISTERED_AT='2026-03-01T00:00:00.000Z';
export const TEST_METHOD={id:'synthetic_price_return',version:'v1'} as const;
export function testMethodologyRow(over:Partial<Omit<MethodologyRow,'created_at'|'synced_at'>>={}):Omit<MethodologyRow,'created_at'|'synced_at'>{
 return {methodology_id:TEST_METHOD.id,version:TEST_METHOD.version,judgment_type:'synthetic_fact_metric',kind:'probability',producer_kind:'rule',
  subject_types:['issuer'],input_kinds:['price_bar'],markets:['US','A'],title_zh:'合成价格回报（测试专用）',title_en:'Synthetic price return (test only)',
  doc_path:'docs/methodologies/README.md',doc_sha256:'0'.repeat(64),implementation_sha256:'1'.repeat(64),params:{grace_days:60},params_json:{},
  horizon:{unit:'trading_sessions',n:5},upstream:{},deps_sha256:'2'.repeat(64),formula_hash:'3'.repeat(64),status:'active',publishable:false,code_version:TEST_CODE_VERSION,...over};
}

export interface PriceJudgmentSpec{baseDate:string;registeredClose:number;batchId:string;n?:number;targetDate?:string;ticker?:string;market?:PriceMarket;source?:KlineSourceName;benchmark?:{ticker:string;market:PriceMarket};labelPolicy?:LabelPolicy;graceDays?:number;closeOnly?:boolean;predicate?:NumPredicate;subjectKey?:string}
const DAY_MS=86_400_000;
export function judgmentRowOf(insert:JudgmentInsert,registeredAt=REGISTERED_AT):JudgmentRow{
 const {retrospective_hint:_hint,...rest}=insert;
 return {...rest,registered_at:registeredAt,retrospective:true,created_at:registeredAt};
}
/** A registered price_return judgment over the synthetic fixtures; settle_after / settle_by follow the shared window arithmetic. */
export function priceJudgment(s:PriceJudgmentSpec):{insert:JudgmentInsert;queue:{settle_after:string;settle_by:string;label_policy:LabelPolicy};row:JudgmentRow}{
 const market=s.market??'US',ticker=s.ticker??'ZZA',source=s.source??'eastmoney',adjustment:Adjustment='qfq',c=s.registeredClose;
 const snapshot:PriceBarSnapshot=s.closeOnly
  ?{ticker,market,date:s.baseDate,source,adjustment,open:null,high:null,low:null,close:c,volume:null,amount:null,fields_present:['close']}
  :{ticker,market,date:s.baseDate,source,adjustment,open:c,high:c,low:c,close:c,volume:1000,amount:null,fields_present:['open','high','low','close','volume']};
 const input:Input={kind:'price_bar',ref:{ticker,market,date:s.baseDate,source,adjustment},snapshot,hash:digest(snapshot),available_at:closeInstantUtc(s.baseDate,market),
  origin:{publisher:'合成测试行情',adapter:source,locator:`fixture:${ticker}`,...(s.closeOnly?{transform:'close_only'}:{})}};
 const n=s.n??5;
 const target:Target=s.targetDate?{kind:'date',date:s.targetDate}:{kind:'session_index',base_date:s.baseDate,n};
 const settleAfter=`${s.targetDate??addDaysIso(s.baseDate,n)}T00:00:00.000Z`;
 const settleBy=new Date(Date.parse(settleAfter)+(s.graceDays??60)*DAY_MS).toISOString();
 const labelPolicy=s.labelPolicy??'first_observed';
 const condition:Condition={resolver:'price_return',params:{ticker,market,adjustment,source,base_date:s.baseDate,...(s.benchmark?{benchmark:s.benchmark}:{})},
  predicate:s.predicate??{op:'>',rhs:0},text:{zh:'目标日收盘高于基准日收盘',en:'Target close above the base close'}};
 const insert:JudgmentInsert={judgment_id:randomUUID(),subject_type:'issuer',subject_key:s.subjectKey??randomUUID(),judgment_type:'synthetic_fact_metric',
  methodology_id:TEST_METHOD.id,methodology_version:TEST_METHOD.version,kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',
  as_of:s.baseDate,inputs:[input],inputs_hash:inputsHash([input]),abstained:false,abstain_reason:null,claim:{p:0.6,event:{zh:'收盘上涨',en:'close rises'}},
  condition,horizon:s.targetDate?{unit:'calendar_days',n:Math.round((Date.parse(`${s.targetDate}T00:00:00Z`)-Date.parse(`${s.baseDate}T00:00:00Z`))/DAY_MS)}:{unit:'trading_sessions',n},
  target,label_policy:labelPolicy,settle_after:settleAfter,settle_by:settleBy,code_version:TEST_CODE_VERSION,batch_id:s.batchId,retrospective_hint:{label_available_at:null}};
 return {insert,queue:{settle_after:settleAfter,settle_by:settleBy,label_policy:labelPolicy},row:judgmentRowOf(insert)};
}
/** A judgment row around any condition (resolver unit tests; never written to a db). */
export function conditionJudgment(condition:Condition,target:Target,over:Partial<JudgmentRow>={}):JudgmentRow{
 return {judgment_id:randomUUID(),subject_type:'issuer',subject_key:randomUUID(),judgment_type:'synthetic_fact_metric',methodology_id:'synthetic_fact_metric',methodology_version:'v1',
  kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of:'2026-01-02',registered_at:REGISTERED_AT,retrospective:true,inputs:[],inputs_hash:'0'.repeat(64),
  abstained:false,abstain_reason:null,claim:{p:0.5,event:{zh:'测试事件',en:'test event'}},condition,horizon:{unit:'fiscal_quarters',n:1},target,label_policy:'first_observed',
  settle_after:'2026-04-01T00:00:00.000Z',settle_by:'2026-07-30T00:00:00.000Z',code_version:TEST_CODE_VERSION,batch_id:randomUUID(),created_at:REGISTERED_AT,...over};
}
export function stubResolver(resolve:Resolver['resolve'],over:Partial<Resolver>={}):Resolver{
 return {name:'price_return',version:'stub/1',validateParams:()=>true,labelAvailableAt:()=>null,maxFetchMs:1_000,resolve,
  fromOverride:()=>{throw new Error('stub resolver has no override path');},...over};
}
export const verifiedCapability=(()=>({status:'verified',evidence:'fixtures/judgments/kline/synthetic-us-zza.json',verified_at:'2026-11-06'})) as unknown as CapabilityLookup;
export const unverifiedCapability=(()=>({status:'unverified',evidence:null,verified_at:null})) as unknown as CapabilityLookup;
