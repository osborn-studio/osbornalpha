// src/lib/facts/derive.ts
// Derived metrics (spec §8). deriveMetrics is pure: it takes the readFacts history rows of one
// issuer/market (status ok, available_date <= asOf, with disclosure_seq/is_current/is_revision)
// and emits MetricRow[] for FORMULA_VERSION. Rules: exact period matching; missing input, unit
// mismatch, zero denominator or non-unique match → no row ("missing stays missing"); YTD
// differencing only across compatible disclosure versions — (a) both current disclosures from the
// same filing, or (b) both sequences never revised — the rule is recoverable from `inputs`
// (equal filing_id ⇒ a); TTM = four adjacent single quarters; YoY prior = the unique same-duration
// fact ending 350–380 days earlier; ROE opening equity = the instant fact dated exactly one day
// before the TTM window. Arithmetic is exact decimal on BigInt; ratios are rounded half away from
// zero to RATIO_SCALE places; INSTANT metrics carry period_start = period_end (column is not null).
// Differenced quarters are order-independent: a direct 3M fact wins; conflicting differences = no quarter. ROE with a
// non-positive average equity is missing. as_of is the UTC date for every market.
// materialize() follows the plan-3 lineage contract (spec §4.4, T9): target T = targetOf(issuer); the
// current lineage of T; read_facts_lineage (truncated → read_truncated); every row must belong to the
// lineage and market; derive for T; replace_financial_metrics_lineage under the envelope's rev
// vector, one retry on stale_computation (a rev or the lineage moved).
import type {Duration,FactRow,FactsDb,LineageRev,Market,MetricDuration,MetricRow} from './types';
import {FactsDbError} from './types';
import {canonicalDecimal} from './json-numbers';
import {classifyDuration} from './classify';

export const FORMULA_VERSION='facts-derive/1.0';
export const RATIO_SCALE=10;
export const Q_SINGLE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','net_income_parent','operating_income','operating_cash_flow','capex'],
 CN:['revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles'],
};
/** Concepts to read per market: the readFacts `concepts` list for materialize and the live metrics route. */
export const DERIVE_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','gross_profit','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex','short_term_borrowings','long_term_borrowings','equity_parent'],
 CN:['revenue','revenue_operating','cost_of_revenue','net_income_parent','operating_income','operating_cash_flow','capex_incl_intangibles','short_term_borrowings','long_term_borrowings','bonds_payable','equity_parent'],
};
const FIXED_METRICS=['gross_margin','net_margin','fcf','borrowings_total','revenue_yoy','net_income_yoy','roe'] as const;
export function metricNames(market:Market):string[]{
 return [...FIXED_METRICS,...Q_SINGLE_CONCEPTS[market].flatMap(c=>[`q_single_${c}`,`ttm_${c}`])];
}
export interface DeriveOptions{market:Market;asOf:string;basedOnRev?:number;/** complete lineage vector the rows derive from; default [{issuer_id, basedOnRev}] */basedOn?:LineageRev[]}

// ---- exact decimal arithmetic (value = n / 10^s) ----
interface Dec{n:bigint;s:number}
const DEC_RE=/^-?\d+(\.\d+)?$/;
const pow10=(k:number)=>10n**BigInt(k);
function parseDec(v:string):Dec|null{
 if(!DEC_RE.test(v))return null;
 const neg=v.startsWith('-'),body=neg?v.slice(1):v,[i,f='']=body.split('.');
 const n=BigInt(i+f);return {n:neg?-n:n,s:f.length};
}
function align(a:Dec,b:Dec):[bigint,bigint,number]{const s=Math.max(a.s,b.s);return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];}
const add=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};
const sub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x-y,s};};
const sameNumber=(x:string,y:string)=>{const a=parseDec(x),b=parseDec(y);if(!a||!b)return x===y;const [p,q]=align(a,b);return p===q;};
const isZero=(d:Dec)=>d.n===0n;
const abs=(d:Dec):Dec=>({n:d.n<0n?-d.n:d.n,s:d.s});
const times=(d:Dec,k:bigint):Dec=>({n:d.n*k,s:d.s});
/** a / b rounded half away from zero to RATIO_SCALE places; null when b is zero. */
function div(a:Dec,b:Dec):Dec|null{
 if(isZero(b))return null;
 const [x,y]=align(a,b);
 const q=(x*pow10(RATIO_SCALE+1))/y;      // one guard digit; BigInt division truncates toward zero
 const r=q<0n?-((-q+5n)/10n):(q+5n)/10n;
 return {n:r,s:RATIO_SCALE};
}
function decToString(d:Dec):string{
 const neg=d.n<0n;let digits=(neg?-d.n:d.n).toString();
 if(d.s>0){digits=digits.padStart(d.s+1,'0');digits=`${digits.slice(0,-d.s)}.${digits.slice(-d.s)}`;}
 return canonicalDecimal((neg?'-':'')+digits);
}

// ---- calendar days (UTC) ----
const DAY_MS=86_400_000;
const dayMs=(d:string)=>Date.parse(`${d}T00:00:00Z`);
export const addDays=(d:string,n:number)=>new Date(dayMs(d)+n*DAY_MS).toISOString().slice(0,10);
const daysBetween=(from:string,to:string)=>Math.round((dayMs(to)-dayMs(from))/DAY_MS);

// ---- current disclosure per natural key ----
interface Cur{row:FactRow;dec:Dec;revised:boolean}
type Input=MetricRow['inputs'][number];
const inputOf=(c:Cur,extra:Partial<Input>={}):Input=>({fact_id:c.row.fact_id,concept:c.row.concept,filing_id:c.row.filing_id,available_date:c.row.available_date,...extra});
const cmpStr=(a:string,b:string)=>a<b?-1:a>b?1:0;
function currentFacts(rows:FactRow[]):Map<string,Cur[]>{
 const groups=new Map<string,FactRow[]>();
 for(const r of rows){const k=`${r.concept}|${r.period_start??''}|${r.period_end}|${r.consolidation}|${r.unit}`;(groups.get(k)??groups.set(k,[]).get(k)!).push(r);}
 const out=new Map<string,Cur[]>();
 for(const g of groups.values()){
  g.sort((a,b)=>(a.disclosure_seq??0)-(b.disclosure_seq??0)||cmpStr(a.available_date,b.available_date)||cmpStr(a.created_at,b.created_at)||cmpStr(a.fact_id,b.fact_id));
  const currents=g.filter(r=>r.is_current===true);
  if(currents.length>1)throw new Error(`derive_multiple_current:${g[0].concept}|${g[0].period_end}`);
  const row=currents[0]??g[g.length-1];
  const dec=parseDec(row.value);if(!dec)continue;
  const revised=g.some((r,i)=>r.is_revision===true||(r.is_revision===undefined&&i>0&&!sameNumber(r.value,g[i-1].value)));
  (out.get(row.concept)??out.set(row.concept,[]).get(row.concept)!).push({row,dec,revised});
 }
 return out;
}

export function deriveMetrics(allRows:FactRow[],opts:DeriveOptions):MetricRow[]{
 // Consolidated rows only: the metric vocabulary is consolidated-only and financial_metrics has no consolidation column in its key,
 // so mixing bases would pair a consolidated revenue with a parent gross profit or collide on the primary key.
 // Scope guard: one issuer and market per call, and the market must be the one being derived.
 if(allRows.some(r=>r.issuer_id!==allRows[0].issuer_id||r.market!==allRows[0].market||r.market!==opts.market))throw new Error('derive_mixed_scope');
 let rows=allRows.filter(r=>r.consolidation==='consolidated');
 if(rows.length===0)return [];
 // as_of is a UTC calendar date for every market (accepted, spec §8).
 const {market,asOf}=opts;const issuerId=rows[0].issuer_id;const basedOnRev=opts.basedOnRev??0;const basedOn=opts.basedOn??[{issuer_id:issuerId,state_rev:basedOnRev}];
 const facts=currentFacts(rows);
 const of=(concept:string)=>facts.get(concept)??[];
 const unique=<T>(xs:T[])=>xs.length===1?xs[0]:null;
 const same=(concept:string,ref:Cur)=>unique(of(concept).filter(c=>c.row.period_start===ref.row.period_start&&c.row.period_end===ref.row.period_end&&c.row.unit===ref.row.unit));
 const instant=(concept:string,end:string,unit:string)=>unique(of(concept).filter(c=>c.row.duration==='INSTANT'&&c.row.period_end===end&&c.row.unit===unit));
 const isDuration=(c:Cur):c is Cur&{row:FactRow&{period_start:string}}=>c.row.period_start!==null&&c.row.duration!=='INSTANT';
 const std=market==='US'?'us_standard':'cn_standard';
 const basisQ=(c:string)=>market==='CN'&&c==='capex_incl_intangibles'?'cn_incl_intangibles':std;
 const out:MetricRow[]=[];
 const emit=(metric:string,start:string,end:string,duration:MetricDuration,value:Dec,unit:string,inputUnit:string,basis:string,inputs:Input[])=>{
  const seen=new Set<string>();
  out.push({issuer_id:issuerId,market,metric,period_start:start,period_end:end,duration,value:decToString(value),unit,input_unit:inputUnit,basis,formula_version:FORMULA_VERSION,
   inputs:inputs.filter(i=>{const k=`${i.fact_id}|${i.quarter?.join('~')??''}`;return !seen.has(k)&&!!seen.add(k);}),based_on_rev:basedOnRev,based_on_lineage:basedOn.map(x=>({...x})),as_of:asOf});
 };
 const ratio=(metric:string,ref:Cur&{row:{period_start:string}},num:Dec,den:Dec,basis:string,inputs:Cur[])=>{
  const v=div(num,den);if(v)emit(metric,ref.row.period_start,ref.row.period_end,ref.row.duration,v,'pure',ref.row.unit,basis,inputs.map(x=>inputOf(x)));
 };
 // margins
 const revC=market==='US'?'revenue':'revenue_operating';
 for(const rev of of(revC)){
  if(!isDuration(rev)||isZero(rev.dec))continue;
  const gp=market==='US'?same('gross_profit',rev):null;
  if(gp)ratio('gross_margin',rev,gp.dec,rev.dec,std,[gp,rev]);
  else{const cor=same('cost_of_revenue',rev);if(cor)ratio('gross_margin',rev,sub(rev.dec,cor.dec),rev.dec,std,[cor,rev]);}
  const ni=same('net_income_parent',rev);
  if(ni)ratio('net_margin',rev,ni.dec,rev.dec,std,[ni,rev]);
 }
 // free cash flow
 const capexC=market==='US'?'capex':'capex_incl_intangibles';
 for(const ocf of of('operating_cash_flow')){
  if(!isDuration(ocf))continue;
  const cx=same(capexC,ocf);if(!cx)continue;
  emit('fcf',ocf.row.period_start,ocf.row.period_end,ocf.row.duration,sub(ocf.dec,cx.dec),ocf.row.unit,ocf.row.unit,market==='US'?'us_standard':'cn_incl_intangibles',[inputOf(ocf),inputOf(cx)]);
 }
 // borrowings_total (INSTANT; period_start = period_end)
 for(const st of of('short_term_borrowings')){
  if(st.row.duration!=='INSTANT')continue;
  const lt=instant('long_term_borrowings',st.row.period_end,st.row.unit);if(!lt)continue;
  const bonds=market==='CN'?instant('bonds_payable',st.row.period_end,st.row.unit):null;
  if(market==='CN'&&!bonds)continue;
  const total=bonds?add(add(st.dec,lt.dec),bonds.dec):add(st.dec,lt.dec);
  emit('borrowings_total',st.row.period_end,st.row.period_end,'INSTANT',total,st.row.unit,st.row.unit,market==='US'?'us_standard':'cn_incl_bonds',[st,lt,...(bonds?[bonds]:[])].map(x=>inputOf(x)));
 }
 // year over year
 for(const [metric,concept] of [['revenue_yoy','revenue'],['net_income_yoy','net_income_parent']] as const){
  for(const cur of of(concept)){
   if(!isDuration(cur))continue;
   const prior=unique(of(concept).filter(p=>{if(p.row.duration!==cur.row.duration||p.row.unit!==cur.row.unit)return false;const d=daysBetween(p.row.period_end,cur.row.period_end);return d>=350&&d<=380;}));
   if(!prior||isZero(prior.dec))continue;
   ratio(metric,cur,sub(cur.dec,prior.dec),abs(prior.dec),std,[cur,prior]);
  }
 }
 // single quarters and TTM
 const STEP:Partial<Record<Duration,Duration>>={'6M':'3M','9M':'6M','12M':'9M'};
 const compatible=(a:Cur,b:Cur)=>a.row.filing_id===b.row.filing_id||(!a.revised&&!b.revised);
 interface Q{start:string;end:string;unit:string;dec:Dec;inputs:Input[]}
 const ttmNetIncome:Q[]=[];
 for(const c of Q_SINGLE_CONCEPTS[market]){
  const quarters=new Map<string,Q>();
  // A direct 3M fact wins outright. Derived candidates for one (start,end,unit) are order-independent: differing values
  // are ambiguous (no quarter); equal values keep the candidate with the smallest sorted input fact_ids.
  const derived=new Map<string,Q[]>();
  const qk=(q:Q)=>`${q.start}|${q.end}|${q.unit}`;
  const put=(q:Q)=>{quarters.set(qk(q),q);};
  const all=of(c).filter(isDuration);
  for(const f of all)if(f.row.duration==='3M')put({start:f.row.period_start,end:f.row.period_end,unit:f.row.unit,dec:f.dec,inputs:[inputOf(f,{quarter:[f.row.period_start,f.row.period_end]})]});
  for(const a of all){
   const bDur=STEP[a.row.duration];if(!bDur)continue;
   const b=unique(all.filter(x=>x.row.duration===bDur&&x.row.period_start===a.row.period_start&&x.row.unit===a.row.unit));
   if(!b||!compatible(a,b))continue;
   const start=addDays(b.row.period_end,1),end=a.row.period_end;
   if(classifyDuration(start,end)!=='3M')continue;   // the difference must itself be a single quarter
   const tag:Partial<Input>={ytd_rule:a.row.filing_id===b.row.filing_id?'same_filing':'never_revised',quarter:[start,end]};
   const cand:Q={start,end,unit:a.row.unit,dec:sub(a.dec,b.dec),inputs:[inputOf(a,tag),inputOf(b,tag)]};
   (derived.get(qk(cand))??derived.set(qk(cand),[]).get(qk(cand))!).push(cand);
  }
  const ids=(q:Q)=>q.inputs.map(i=>i.fact_id).sort().join('|');
  for(const [k,cands] of derived){
   if(quarters.has(k))continue;
   const [first,...rest]=cands;
   if(rest.some(x=>{const [p,q]=align(first.dec,x.dec);return p!==q;}))continue;
   put(cands.reduce((m,x)=>cmpStr(ids(x),ids(m))<0?x:m,first));
  }
  const qs=[...quarters.values()].sort((x,y)=>cmpStr(x.unit,y.unit)||cmpStr(x.end,y.end)||cmpStr(x.start,y.start));
  for(const q of qs)emit(`q_single_${c}`,q.start,q.end,'3M',q.dec,q.unit,q.unit,basisQ(c),q.inputs);
  const byEnd=new Map<string,Q[]>();
  for(const q of qs){const k=`${q.unit}|${q.end}`;(byEnd.get(k)??byEnd.set(k,[]).get(k)!).push(q);}
  for(const last of qs){
   // exactly-adjacent quarters, each unique by (unit, period_end); any ambiguity skips this window
   const w=[last];let ok=(byEnd.get(`${last.unit}|${last.end}`)?.length??0)===1;
   for(let j=1;ok&&j<4;j++){const prev=byEnd.get(`${last.unit}|${addDays(w[0].start,-1)}`)??[];if(prev.length!==1)ok=false;else w.unshift(prev[0]);}
   if(!ok)continue;
   const t:Q={start:w[0].start,end:last.end,unit:last.unit,dec:w.slice(1).reduce((acc,q)=>add(acc,q.dec),w[0].dec),inputs:w.flatMap(q=>q.inputs)};
   emit(`ttm_${c}`,t.start,t.end,'TTM',t.dec,t.unit,t.unit,basisQ(c),t.inputs);
   if(c==='net_income_parent')ttmNetIncome.push(t);
  }
 }
 // ROE = TTM net income / avg(opening equity, closing equity) = 2·TTM / (e0 + e1)
 for(const t of ttmNetIncome){
  const e0=instant('equity_parent',addDays(t.start,-1),t.unit),e1=instant('equity_parent',t.end,t.unit);
  if(!e0||!e1)continue;
  const eq=add(e0.dec,e1.dec);if(eq.n<=0n)continue;   // non-positive average equity: ROE is not meaningful → missing
  const v=div(times(t.dec,2n),eq);if(!v)continue;
  emit('roe',t.start,t.end,'TTM',v,'pure',t.unit,std,[...t.inputs,inputOf(e0),inputOf(e1)]);
 }
 const key=(m:MetricRow)=>`${m.metric}|${m.period_end}|${m.period_start}|${m.input_unit}|${m.basis}`;
 return out.sort((a,b)=>cmpStr(key(a),key(b)));
}

export type MaterializeDb=Pick<FactsDb,'targetOf'|'lineageOf'|'readFactsLineage'|'replaceMetricsLineage'>;
export interface MaterializeResult{rows:number;stateRev:number;retried:boolean;target:string;basedOn:LineageRev[]}
/**
 * Rows of a lineage derived for its target T: every row must belong to the lineage and the market
 * (replaces plan 2's "rows of this issuer only"); issuer ids are relabelled to T so the
 * single-issuer derivation applies — the recorded issuer stays traceable through inputs[].fact_id.
 * based_on_rev = T's rev in basedOn; based_on_lineage = basedOn.
 */
export function deriveLineageMetrics(rows:FactRow[],target:string,lineage:readonly string[],opts:{market:Market;asOf:string;basedOn:LineageRev[]}):MetricRow[]{
 const members=new Set(lineage);
 if(!members.has(target)||rows.some(r=>!members.has(r.issuer_id)||r.market!==opts.market))throw new Error(`derive_scope_mismatch:${target}/${opts.market}`);
 const basedOnRev=opts.basedOn.find(x=>x.issuer_id===target)?.state_rev??0;
 return deriveMetrics(rows.map(r=>r.issuer_id===target?r:{...r,issuer_id:target}),{market:opts.market,asOf:opts.asOf,basedOnRev,basedOn:opts.basedOn});
}
/** as_of = today; materialises T(issuer) over its current lineage (see the header). */
export async function materialize(db:MaterializeDb,issuer:string,market:Market,opts:{today?:string}={}):Promise<MaterializeResult>{
 const asOf=opts.today??new Date().toISOString().slice(0,10);
 for(let attempt=0;;attempt++){
  // the target is resolved inside each attempt: a merge that makes the first replace stale moves T, and the retry must follow it
  const target=await db.targetOf(issuer);
  const lineage=await db.lineageOf(target);
  const env=await db.readFactsLineage(lineage,market,{concepts:[...DERIVE_CONCEPTS[market]],asOf,history:true});
  if(env.truncated)throw new FactsDbError('read_truncated',`read_facts_lineage truncated for ${target}/${market}`);
  const rows=deriveLineageMetrics(env.rows,target,lineage,{market,asOf,basedOn:env.stateRevs});
  const stateRev=env.stateRevs.find(x=>x.issuer_id===target)?.state_rev??0;
  try{const n=await db.replaceMetricsLineage(target,market,env.stateRevs,rows);return {rows:n,stateRev,retried:attempt>0,target,basedOn:env.stateRevs};}
  catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
 }
}
