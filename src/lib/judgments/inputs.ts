// src/lib/judgments/inputs.ts
// Fixed input builders (spec §3.5, audit G03). buildInput(request, inputsDb, asOf) is the ONLY way an
// Input is made — snapshot (frozen projection), hash = digest(snapshot), available_at (§3.7),
// origin (origins.ts) — and it reads only through JudgmentInputsDb's public (anon) paths, so a
// quarantined / unpublished / non-ok row never becomes a public input (input_not_public).
// rebuildAndCompare re-runs the builder at registration and demands byte equality (§6.2 step 1).
// Kinds: financial_fact — factsByIds locates the (ok) row, readFacts(asOf, history) proves it is
// visible at as_of on its published generation; financial_metric — S04/S05: cutoff derivation via
// deriveMetricsAsOf (never the materialised cache); the frozen derivation rows are every envelope
// row whose concept is in the lineage and whose period_end ∈ [period_start − 400 d, period_end],
// sorted (concept, period_start, period_end, unit, disclosure_seq, fact_id); self-check: deriving
// from those rows alone must give exactly one row with the same key, value and inputs, else
// metric_not_reproducible (so a too-narrow subset fails at registration, not at replay);
// macro_observation; macro_snapshot — available_at = max of its observations' available_at, never
// created_at (audit F10); a snapshot without a regime is snapshot_unclassified; price_bar — only
// verified capability rows (else market_unsupported), close-only bars keep only close (G27);
// table_rows — rows with valid_from after as_of are dropped; available_at = max over the rows of their SYSTEM
// timestamp (updated_at, else created_at); a row with neither → input_unavailable (availability cannot be
// evidenced; never substituted by as_of — plan audit P1-08; buildOrAbstain abstains on it for table_rows);
// judgment — public table only, not abstained, available_at = registered_at. legacy_fill / document_span:
// input_not_allowed.
// Snapshots never contain undefined (canonicalize rejects it): optional values become null.
import {FORMULA_VERSION,deriveMetrics} from '@/lib/facts/derive';
import type {KlineSourceName} from '@/lib/data/kline/types';
import type {FactRow,MetricRow} from '@/lib/facts/types';
import type {Abstained,Adjustment,DerivationRow,FactProjection,FactsMarket,Input,InputKind,JudgmentInputsDb,MacroSnapshotSnapshot,MetricKey,MetricSnapshot,PriceBarSnapshot,PriceMarket,PublicTable,Regime} from './types';
import {PUBLIC_INPUT_KINDS,PUBLIC_TABLES} from './types';
import {canonicalize,digest} from './canonical';
import {JudgmentError} from './errors';
import {datagatewaySymbol} from '@/lib/data/sources/datagateway';
import {tickerToSecid} from '@/lib/data/sources/eastmoney';
import {closeOnlyOf} from './kline';
import {MacroUnavailable,observationIdOf} from './macro-api';
import {originFor} from './origins';
import {capabilityOf} from './resolvers/price-capabilities';
import type {CapabilityStatus} from './resolvers/price-capabilities';
import {addDaysIso,closeInstantUtc,endOfUtcDay} from './time';
import {industryTableRowsInput,IndustryInputError,parseIndustryNaturalKey} from '@/lib/industry/judgment-input';
export {inputsHash as inputsHashOf} from './canonical';

export type PublicInputKind=typeof PUBLIC_INPUT_KINDS[number];
type RefOf<K extends InputKind>=Extract<Input,{kind:K}>['ref'];
export type InputRequest={[K in PublicInputKind]:{kind:K;ref:RefOf<K>}}[PublicInputKind];
export interface BuildOptions{capability?:(source:KlineSourceName,market:PriceMarket,adjustment:Adjustment)=>{status:CapabilityStatus};signal?:AbortSignal;klineTimeoutMs?:number}
/** Builder codes that mean "this input is missing" at gather time: produce / buildOrAbstain turn them into Abstained. */
export const ABSTAIN_CODES=['input_not_public','market_unsupported','metric_not_reproducible','unsupported_formula_version','snapshot_unclassified','target_unresolvable'] as const;
const NOT_PUBLIC_ON_REBUILD=new Set<string>(['input_not_public','market_unsupported','metric_not_reproducible','unsupported_formula_version','snapshot_unclassified']);
const REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];
const DAY_SHAPE=/^\d{4}-\d{2}-\d{2}$/;
const DAY={test:(d:string)=>{if(!DAY_SHAPE.test(d))return false;const t=Date.parse(`${d}T00:00:00.000Z`);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d;}};
/** The market the source would actually query for this ticker (review H-01): eastmoney resolves it from the ticker itself
 *  (tickerToSecid, src/lib/data/sources/eastmoney.ts), datagateway validates ticker against the stated market
 *  (datagatewaySymbol, src/lib/data/sources/datagateway.ts); other sources use eastmoney's ticker grammar. */
function tickerMatchesMarket(source:KlineSourceName,ticker:string,market:PriceMarket):boolean{
 if(source==='datagateway')return datagatewaySymbol(ticker,market)!==null;
 return tickerToSecid(ticker)?.market===market;
}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const iso=(v:string)=>new Date(v).toISOString();
const isoMax=(xs:string[])=>xs.reduce((m,x)=>Date.parse(x)>Date.parse(m)?x:m);
const factsAdapter=(m:FactsMarket)=>m==='US'?'edgar':'tushare';
const notPublic=(what:string)=>new JudgmentError('input_not_public',what);

export function inputLabel(x:{kind:InputKind;ref:unknown}):string{
 const r=(x.ref??{}) as Record<string,string>;
 switch(x.kind){
  case 'financial_fact':return `financial_fact:${r.fact_id}`;
  case 'financial_metric':return `financial_metric:${r.issuer_id}:${r.market}:${r.metric}@${r.period_start}..${r.period_end}`;
  case 'macro_observation':return `macro_observation:${r.series_id}@${r.period_end}#${r.vintage_id}`;
  case 'macro_snapshot':return `macro_snapshot:${r.snapshot_id}`;
  case 'price_bar':return `price_bar:${r.source}:${r.market}:${r.ticker}@${r.date}/${r.adjustment}`;
  case 'table_rows':return `table_rows:${r.table}:${r.natural_key}`;
  case 'judgment':return `judgment:${r.judgment_id}`;
  case 'legacy_fill':return `legacy_fill:${r.recommendation_id}`;
  default:return `${x.kind}:${canonicalize(x.ref)}`;
 }
}
export function sortInputs<T extends {kind:InputKind;ref:unknown}>(inputs:readonly T[]):T[]{
 return inputs.map(x=>({x,k:`${x.kind}\u0000${canonicalize(x.ref)}`})).sort((a,b)=>cmp(a.k,b.k)).map(e=>e.x);
}
export function factProjection(r:FactRow):FactProjection{
 return {fact_id:r.fact_id,issuer_id:r.issuer_id,market:r.market,concept:r.concept,period_start:r.period_start,period_end:r.period_end,duration:r.duration,value_text:r.value_text,unit:r.unit,consolidation:r.consolidation,available_date:r.available_date,filing_id:r.filing_id,mapping_gen:r.mapping_gen};
}
export function derivationRowOf(r:FactRow):DerivationRow{
 return {...factProjection(r),status:r.status,created_at:r.created_at,disclosure_seq:r.disclosure_seq??null,is_current:r.is_current??null,is_revision:r.is_revision??null};
}
/** Snapshot → kernel row: value restored from value_text; run_id/source_concept/statement/mapping_version/raw_hash are never read by deriveMetrics. */
export function factRowOfDerivation(d:DerivationRow):FactRow{
 return {fact_id:d.fact_id,issuer_id:d.issuer_id,market:d.market,filing_id:d.filing_id,run_id:'',concept:d.concept,source_concept:'',statement:'IS',period_start:d.period_start,period_end:d.period_end,duration:d.duration as FactRow['duration'],value:d.value_text,value_text:d.value_text,unit:d.unit,consolidation:d.consolidation,available_date:d.available_date,mapping_gen:d.mapping_gen,mapping_version:'',status:d.status as FactRow['status'],raw_hash:'',created_at:d.created_at,
  ...(d.disclosure_seq!==null?{disclosure_seq:d.disclosure_seq}:{}),...(d.is_current!==null?{is_current:d.is_current}:{}),...(d.is_revision!==null?{is_revision:d.is_revision}:{})};
}
export function derivationRowsFor(rows:readonly FactRow[],m:Pick<MetricRow,'inputs'|'period_start'|'period_end'>):DerivationRow[]{
 const concepts=new Set(m.inputs.map(i=>i.concept));
 const lo=addDaysIso(m.period_start,-400);
 return rows.filter(r=>concepts.has(r.concept)&&r.period_end>=lo&&r.period_end<=m.period_end).map(derivationRowOf)
  .sort((a,b)=>cmp(a.concept,b.concept)||cmp(a.period_start??'',b.period_start??'')||cmp(a.period_end,b.period_end)||cmp(a.unit,b.unit)||((a.disclosure_seq??0)-(b.disclosure_seq??0))||cmp(a.fact_id,b.fact_id));
}
const metricKeyOf=(k:MetricKey):MetricKey=>({issuer_id:k.issuer_id,market:k.market,metric:k.metric,period_start:k.period_start,period_end:k.period_end,input_unit:k.input_unit,basis:k.basis,formula_version:k.formula_version});
const sameKey=(m:MetricRow,k:MetricKey)=>m.issuer_id===k.issuer_id&&m.market===k.market&&m.metric===k.metric&&m.period_start===k.period_start&&m.period_end===k.period_end&&m.input_unit===k.input_unit&&m.basis===k.basis&&m.formula_version===k.formula_version;
async function viaMacro<T>(f:()=>Promise<T>):Promise<T>{
 try{return await f();}catch(e){if(e instanceof MacroUnavailable)throw new JudgmentError('input_unavailable',e.message);throw e;}
}

async function buildFact(ref:{fact_id:string},db:JudgmentInputsDb,asOf:string):Promise<Input>{
 const [row]=await db.facts.factsByIds([ref.fact_id]);
 if(!row||row.fact_id!==ref.fact_id)throw notPublic(`financial_fact ${ref.fact_id}`);
 const env=await db.facts.readFacts(row.issuer_id,row.market,{concepts:[row.concept],asOf,history:true});
 if(env.truncated)throw new JudgmentError('read_truncated',`financial_fact ${ref.fact_id}`);
 const r=env.rows.find(x=>x.fact_id===ref.fact_id&&x.status==='ok');
 if(!r)throw notPublic(`financial_fact ${ref.fact_id} is not visible at ${asOf}`);
 const snapshot=factProjection(r);
 return {kind:'financial_fact',ref:{fact_id:ref.fact_id},snapshot,hash:digest(snapshot),available_at:endOfUtcDay(r.available_date),origin:originFor('financial_fact',factsAdapter(r.market),{fact_id:r.fact_id,filing_id:r.filing_id})};
}
async function buildMetric(raw:MetricKey,db:JudgmentInputsDb,asOf:string):Promise<Input>{
 const key=metricKeyOf(raw);const label=inputLabel({kind:'financial_metric',ref:key});
 if(key.formula_version!==FORMULA_VERSION)throw new JudgmentError('unsupported_formula_version',`${label}: ${key.formula_version}`);
 const {metrics,envelope}=await db.deriveMetricsAsOf(key.issuer_id,key.market,asOf,key.formula_version);
 const hits=metrics.filter(m=>sameKey(m,key));
 if(hits.length===0)throw notPublic(`${label} is not derivable at ${asOf}`);
 if(hits.length>1||hits[0].inputs.length===0)throw new JudgmentError('metric_not_reproducible',`${label}: ${hits.length} rows`);
 const m=hits[0];
 const rows=derivationRowsFor(envelope.rows,m);
 const again=deriveMetrics(rows.map(factRowOfDerivation),{market:key.market,asOf,basedOnRev:envelope.stateRev}).filter(x=>sameKey(x,key));
 if(again.length!==1||again[0].value!==m.value||canonicalize(again[0].inputs)!==canonicalize(m.inputs))throw new JudgmentError('metric_not_reproducible',`${label}: the frozen derivation rows do not reproduce it`);
 const snapshot:MetricSnapshot={...key,value_text:m.value,unit:m.unit,duration:m.duration,as_of:asOf,based_on_rev:m.based_on_rev,lineage:m.inputs,derivation:{formula_version:key.formula_version,as_of:asOf,state_rev:envelope.stateRev,rows}};
 const latest=m.inputs.map(i=>i.available_date).sort().at(-1)!;
 return {kind:'financial_metric',ref:key,snapshot,hash:digest(snapshot),available_at:endOfUtcDay(latest),
  origin:originFor('financial_metric',factsAdapter(key.market),{issuer_id:key.issuer_id,metric:key.metric,period_start:key.period_start,period_end:key.period_end,formula_version:key.formula_version})};
}
async function buildObservation(ref:{series_id:string;period_end:string;vintage_id:string},db:JudgmentInputsDb):Promise<Input>{
 const r={series_id:ref.series_id,period_end:ref.period_end,vintage_id:ref.vintage_id};
 const o=await viaMacro(()=>db.macro.observation(observationIdOf(r)));
 if(!o||o.series_id!==r.series_id||o.period_end!==r.period_end||o.vintage_id!==r.vintage_id)throw notPublic(inputLabel({kind:'macro_observation',ref:r}));
 const snapshot={series_id:o.series_id,period_end:o.period_end,value:o.value,unit:o.unit,vintage_id:o.vintage_id,available_at:iso(o.available_at)};
 return {kind:'macro_observation',ref:r,snapshot,hash:digest(snapshot),available_at:snapshot.available_at,origin:originFor('macro_observation','macro_workbench',r)};
}
async function buildSnapshot(ref:{snapshot_id:string},db:JudgmentInputsDb):Promise<Input>{
 const label=inputLabel({kind:'macro_snapshot',ref});
 const s=await viaMacro(()=>db.macro.snapshot(ref.snapshot_id));
 if(!s||s.status==='failed'||s.snapshot_id!==ref.snapshot_id)throw notPublic(label);
 if(!s.regime)throw new JudgmentError('snapshot_unclassified',label);
 if(s.observation_ids.length===0)throw notPublic(`${label} has no observations`);
 const stamps:string[]=[];
 for(const id of s.observation_ids){const o=await viaMacro(()=>db.macro.observation(id));if(!o)throw notPublic(`${label}: observation ${id}`);stamps.push(iso(o.available_at));}
 const g=s.regime;const pick=(x:Record<Regime,number>)=>Object.fromEntries(REGIMES.map(k=>[k,x[k]])) as Record<Regime,number>;
 const snapshot:MacroSnapshotSnapshot={snapshot_id:s.snapshot_id,region:s.region,as_of:s.as_of,methodology_version:s.methodology_version,catalog_version:s.catalog_version,observation_ids:[...s.observation_ids],primary_state:g.primary_state,secondary_state:g.secondary_state,scores:pick(g.scores),norm:pick(g.norm),coverage:g.coverage,margin_pp:g.margin_pp,growth_axis:g.growth_axis,inflation_axis:g.inflation_axis};
 return {kind:'macro_snapshot',ref:{snapshot_id:s.snapshot_id},snapshot,hash:digest(snapshot),available_at:isoMax(stamps),origin:originFor('macro_snapshot','macro_workbench',{snapshot_id:s.snapshot_id})};
}
async function buildBar(raw:{ticker:string;market:PriceMarket;date:string;source:KlineSourceName;adjustment:Adjustment},db:JudgmentInputsDb,observedAt:string,opts:BuildOptions):Promise<Input>{
 const ref={ticker:raw.ticker,market:raw.market,date:raw.date,source:raw.source,adjustment:raw.adjustment};const label=inputLabel({kind:'price_bar',ref});
 if(!DAY.test(ref.date))throw new JudgmentError('input_not_allowed',`${label}: date`);
 if(!tickerMatchesMarket(ref.source,ref.ticker,ref.market))throw notPublic(`${label}: market_mismatch (${ref.source} would not query ${ref.ticker} as ${ref.market})`);
 const closeAt=closeInstantUtc(ref.date,ref.market);
 // H-02: a daily bar is final only after the exchange close; never freeze an unfinished one.
 if(Date.parse(closeAt)>Date.parse(observedAt))throw new JudgmentError('input_unavailable',`${label}: bar_not_closed (close ${closeAt} > observed ${observedAt})`);
 const cap=(opts.capability??capabilityOf)(ref.source,ref.market,ref.adjustment);
 if(cap.status!=='verified')throw new JudgmentError('market_unsupported',`${label}: capability ${cap.status}`);
 const signal=opts.signal??AbortSignal.timeout(opts.klineTimeoutMs??20_000);
 const s=await db.kline({ticker:ref.ticker,market:ref.market,adjustment:ref.adjustment,source:ref.source,from:ref.date,to:ref.date,signal});
 if('failure' in s){if(s.failure==='empty'||s.failure==='not_found')throw notPublic(`${label}: ${s.failure}`);throw new JudgmentError('input_unavailable',`${label}: ${s.failure}`);}
 const b=s.bars.find(x=>x.time===ref.date);
 if(!b)throw notPublic(`${label}: no bar on that date`);
 const closeOnly=closeOnlyOf(s);
 const snapshot:PriceBarSnapshot=closeOnly
  ?{...ref,open:null,high:null,low:null,close:b.close,volume:null,amount:null,fields_present:['close']}
  :{...ref,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,amount:b.amount??null,fields_present:b.amount===undefined?['open','high','low','close','volume']:['open','high','low','close','volume','amount']};
 return {kind:'price_bar',ref,snapshot,hash:digest(snapshot),available_at:closeAt,
  origin:originFor('price_bar',ref.source,{market:ref.market,ticker:ref.ticker,date:ref.date,adjustment:ref.adjustment},closeOnly?{transform:'close_only'}:{})};
}
async function buildTable(raw:{table:PublicTable;natural_key:string},db:JudgmentInputsDb,asOf:string):Promise<Input>{
 const ref={table:raw.table,natural_key:raw.natural_key};const label=inputLabel({kind:'table_rows',ref});
 if(!(PUBLIC_TABLES as readonly string[]).includes(ref.table))throw new JudgmentError('input_not_allowed',label);
 if(ref.table==='industry_metrics'){
  if(parseIndustryNaturalKey(ref.natural_key)?.table!=='industry_metrics')throw new JudgmentError('input_not_allowed',`${label}: natural key`);
  if(!db.industry)throw new JudgmentError('input_unavailable',`${label}: industry provider unavailable`);
  try{
   const input=await industryTableRowsInput(db.industry,{table:'industry_metrics',natural_key:ref.natural_key});
   return {...input,ref:{table:'industry_metrics',natural_key:ref.natural_key},snapshot:{...input.snapshot,table:'industry_metrics',rows:input.snapshot.rows as unknown as Record<string,unknown>[]},origin:{publisher:input.origin.publisher,adapter:input.origin.adapter,locator:input.origin.locator,transform:input.origin.transform}};
  }catch(e){if(e instanceof IndustryInputError)throw new JudgmentError(e.code==='invalid_natural_key'||e.code==='unsupported_deferred_i3'?'input_not_allowed':e.code==='input_ambiguous_manifest'?'input_unavailable':e.code,e.message);throw e;}
 }
 const all=await viaMacro(()=>db.tableRows(ref.table,ref.natural_key));
 const rows=all.filter(r=>typeof r.valid_from!=='string'||r.valid_from<=asOf);
 if(rows.length===0)throw notPublic(`${label}: no rows visible at ${asOf}`);
 // P1-08: availability is the rows' system time (updated_at, else created_at) — valid_from is an effective date,
 // not a publication time, and the requested as_of is never a substitute.
 // H-03: per row max(valid created_at, valid updated_at); updated_at earlier than created_at is inconsistent → unevidenced.
 // ABSENT (null / undefined) differs from MALFORMED (present but unparseable): malformed → NaN → unevidenced (H2-01).
 const ts=(v:unknown):number|null=>v===null||v===undefined?null:typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
 const stampOf=(r:Record<string,unknown>):string|null=>{const c=ts(r.created_at),u=ts(r.updated_at);if(Number.isNaN(c)||Number.isNaN(u)||(c!==null&&u!==null&&u<c))return null;const m=Math.max(c??-Infinity,u??-Infinity);return Number.isFinite(m)?new Date(m).toISOString():null;};
 const stamps=rows.map(stampOf);
 if(stamps.some(s=>s===null))throw new JudgmentError('input_unavailable',`${label}: a row has no system timestamp (valid, ordered updated_at / created_at), so its availability at ${asOf} cannot be evidenced`);
 const snapshot={table:ref.table,natural_key:ref.natural_key,rows};
 return {kind:'table_rows',ref,snapshot,hash:digest(snapshot),available_at:isoMax(stamps as string[]),
  origin:originFor('table_rows',ref.table==='macro_series'?'macro_workbench':'supabase_public',{table:ref.table,natural_key:ref.natural_key})};
}
async function buildJudgment(ref:{judgment_id:string},db:JudgmentInputsDb):Promise<Input>{
 const j=await db.publicJudgment(ref.judgment_id);
 if(!j||j.abstained||j.claim===null)throw notPublic(inputLabel({kind:'judgment',ref}));
 const snapshot={judgment_id:j.judgment_id,claim:j.claim,as_of:j.as_of};
 return {kind:'judgment',ref:{judgment_id:j.judgment_id},snapshot,hash:digest(snapshot),available_at:j.registered_at,origin:originFor('judgment','judgments',{judgment_id:j.judgment_id})};
}

export async function buildInput(req:InputRequest,db:JudgmentInputsDb,asOf:string,observedAt:string,opts:BuildOptions={}):Promise<Input>{
 if(!DAY.test(asOf))throw new JudgmentError('invalid_parameter',`asOf must be a real YYYY-MM-DD date, got ${asOf}`);
 if(!Number.isFinite(Date.parse(observedAt)))throw new JudgmentError('invalid_parameter',`observedAt must be an ISO instant, got ${observedAt}`);
 if(!(PUBLIC_INPUT_KINDS as readonly string[]).includes(req.kind))throw new JudgmentError('input_not_allowed',`${req.kind} is not a public input kind`);
 switch(req.kind){
  case 'financial_fact':return buildFact(req.ref,db,asOf);
  case 'financial_metric':return buildMetric(req.ref,db,asOf);
  case 'macro_observation':return buildObservation(req.ref,db);
  case 'macro_snapshot':return buildSnapshot(req.ref,db);
  case 'price_bar':return buildBar(req.ref,db,observedAt,opts);
  case 'table_rows':return buildTable(req.ref,db,asOf);
  case 'judgment':return buildJudgment(req.ref,db);
 }
}
export async function buildOrAbstain(req:InputRequest,db:JudgmentInputsDb,asOf:string,observedAt:string,opts:BuildOptions={}):Promise<Input|Abstained>{
 try{return await buildInput(req,db,asOf,observedAt,opts);}
 catch(e){
  if(e instanceof JudgmentError&&(ABSTAIN_CODES as readonly string[]).includes(e.code))return {abstained:true,reason:e.code,missing:[inputLabel(req)]};
  // P1-08: a table_rows input whose rows carry no system timestamp is permanently unevidenced → abstain (for the other
  // kinds input_unavailable is a transient provider failure and stays an error).
  if(e instanceof JudgmentError&&e.code==='input_unavailable'&&(req.kind==='table_rows'||(req.kind==='price_bar'&&e.message.includes('bar_not_closed'))))return {abstained:true,reason:'input_unavailable',missing:[inputLabel(req)]};
  throw e;
 }
}
export type RebuildResult={status:'ok'}|{status:'input_snapshot_mismatch';field:'hash'|'ref'|'snapshot'|'available_at'|'origin'}|{status:'input_not_public';code:string};
export async function rebuildAndCompare(input:Input,db:JudgmentInputsDb,asOf:string,observedAt:string,opts:BuildOptions={}):Promise<RebuildResult>{
 if(!(PUBLIC_INPUT_KINDS as readonly string[]).includes(input.kind))throw new JudgmentError('input_not_allowed',`${input.kind} is not a public input kind`);
 // H-04: the submitted snapshot must be exactly what JSON storage would return (no holes, undefined, extra array props).
 if(digest(JSON.parse(JSON.stringify(input.snapshot)))!==digest(input.snapshot))throw new JudgmentError('invalid_parameter','snapshot does not round-trip JSON');
 if(input.hash!==digest(input.snapshot))return {status:'input_snapshot_mismatch',field:'hash'};
 let fresh:Input;
 try{fresh=await buildInput({kind:input.kind,ref:input.ref} as InputRequest,db,asOf,observedAt,opts);}
 catch(e){if(e instanceof JudgmentError&&NOT_PUBLIC_ON_REBUILD.has(e.code))return {status:'input_not_public',code:e.code};throw e;}
 if(canonicalize(fresh.ref)!==canonicalize(input.ref))return {status:'input_snapshot_mismatch',field:'ref'};
 if(fresh.hash!==input.hash)return {status:'input_snapshot_mismatch',field:'snapshot'};
 if(fresh.available_at!==input.available_at)return {status:'input_snapshot_mismatch',field:'available_at'};
 if(canonicalize(fresh.origin)!==canonicalize(input.origin))return {status:'input_snapshot_mismatch',field:'origin'};
 return {status:'ok'};
}
