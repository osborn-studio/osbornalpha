// src/lib/company/dcf-seed.ts
// DCF fact seed (spec §9.1, §0 #65). Pure: ONE company_read_snapshot envelope (history:true) and the
// current security. Leaves: revenueLines[0].baseRevenue ← latest 12M revenue (CN revenue_operating);
// grossMarginPct ← gross_margin derived on the SAME envelope for that period; sharesDiluted ← the single
// current instant shares_outstanding at the revenue period_end, only for share_class common|A and one open
// security in the market; netDebt ← borrowings_total (derived, same envelope) − cash (US, basis us_standard)
// or − monetary_funds (CN, basis cn_borrowings_less_monetary_funds_incl_restricted), same date and unit.
// Money and shares use the SAME divisor (USD 1e6 百万, CNY 1e8 亿) so equity / shares is per-share currency.
// Every fact behind a leaf must pass the evidence gate, else the leaf is missing with the gate's reason.
import {deriveMetrics} from '@/lib/facts/derive';
import type {FactRow,Market,MetricRow} from '@/lib/facts/types';
import type {DcfSeedResponse,SeedBridgeField} from '@/lib/dcf/bridge';
import {decimalSub,formatDecimalText} from './decimal';
import {applyGate} from './evidence-gate';
import type {EvidenceDto,EvidenceRecord,PdfLocator,ReadSnapshotResult,WithheldReason} from './types';

export const SEED_CONCEPTS:Record<Market,readonly string[]>={
 US:['revenue','gross_profit','cost_of_revenue','shares_outstanding','cash','short_term_borrowings','long_term_borrowings'],
 CN:['revenue_operating','cost_of_revenue','shares_outstanding','monetary_funds','short_term_borrowings','long_term_borrowings','bonds_payable'],
};
const UNITS:Record<string,{currencyUnit:string;divisor:string}>={USD:{currencyUnit:'百万',divisor:'1000000'},CNY:{currencyUnit:'亿',divisor:'100000000'}};
export const SEED_FIELDS=['revenueLines[0].baseRevenue','grossMarginPct','sharesDiluted','netDebt'] as const;
export type SeedField=typeof SEED_FIELDS[number];
export type SeedMissingReason='read_truncated'|'no_fact'|'period_mismatch'|'unit_mismatch'|'share_basis_unverified'|'multi_class_shares'|WithheldReason;
export interface SeedLeaf{source:'fact';value:number;factIds:string[];metric?:string;divisor:string;basis:string;periodEnd:string;unit:string}
export interface SeedResult{
 seed:{baseRevenue?:number;grossMarginPct?:number;sharesDiluted?:number;netDebt?:number};
 provenance:Partial<Record<SeedField,SeedLeaf>>;missing:{field:SeedField;reason:SeedMissingReason}[];
 meta:{currency:string|null;currencyUnit:string|null;divisor:string|null};evidence:Record<string,EvidenceDto>;
 truncated?:boolean;   // the snapshot read hit its row limit: no seed is built from a partial envelope
}
export interface SeedSecurity{shareClass:string;openSecuritiesInMarket:number}
interface Cand{field:SeedField;factIds:string[];value:()=>number;metric?:string;basis:string;divisor:string;unit:string}
const KEY:Record<SeedField,keyof SeedResult['seed']>={'revenueLines[0].baseRevenue':'baseRevenue',grossMarginPct:'grossMarginPct',sharesDiluted:'sharesDiluted',netDebt:'netDebt'};
const scaled=(v:string,divisor:string)=>Number(formatDecimalText(v,BigInt(divisor),6));

interface Plan{out:SeedResult;cands:Cand[];rows:FactRow[];end:string;market:Market}
export type SeedPlanOpts={market:Market;asOf:string};
/** Phase 1: pick candidate leaves from the envelope (no gate). Phase 2 (seedFromFacts) gates every fact behind a leaf. */
function plan(snapshot:ReadSnapshotResult,security:SeedSecurity,opts:SeedPlanOpts):Plan{
 const {market}=opts;
 const out:SeedResult={seed:{},provenance:{},missing:[],meta:{currency:null,currencyUnit:null,divisor:null},evidence:{}};
 const rows=snapshot.rows.filter(r=>r.consolidation==='consolidated');
 const done=(cands:Cand[],end:string):Plan=>({out,cands,rows,end,market});
 const missAll=(reason:SeedMissingReason)=>{for(const f of SEED_FIELDS)out.missing.push({field:f,reason});return done([],'');};
 if(snapshot.truncated){out.truncated=true;return missAll('read_truncated');}
 const cur=rows.filter(r=>r.is_current===true);
 const revC=market==='US'?'revenue':'revenue_operating';
 const revs=cur.filter(r=>r.concept===revC&&r.duration==='12M');
 if(revs.length===0)return missAll('no_fact');
 const end=revs.reduce((m,r)=>r.period_end>m?r.period_end:m,revs[0].period_end);
 const at=revs.filter(r=>r.period_end===end);
 if(at.length!==1)return missAll('unit_mismatch');
 const rev=at[0];const u=UNITS[rev.unit];
 if(!u)return missAll('unit_mismatch');
 out.meta={currency:rev.unit,currencyUnit:u.currencyUnit,divisor:u.divisor};
 const metrics:MetricRow[]=deriveMetrics(rows,{market,asOf:opts.asOf,basedOnRev:snapshot.stateRev});
 const cands:Cand[]=[];const miss=(field:SeedField,reason:SeedMissingReason)=>out.missing.push({field,reason});
 cands.push({field:'revenueLines[0].baseRevenue',factIds:[rev.fact_id],value:()=>scaled(rev.value_text,u.divisor),basis:revC,divisor:u.divisor,unit:rev.unit});
 const gm=metrics.filter(m=>m.metric==='gross_margin'&&m.period_start===rev.period_start&&m.period_end===end&&m.duration==='12M'&&m.input_unit===rev.unit);
 if(gm.length===1)cands.push({field:'grossMarginPct',factIds:gm[0].inputs.map(i=>i.fact_id),value:()=>Number(gm[0].value),metric:'gross_margin',basis:gm[0].basis,divisor:'1',unit:'pure'});
 else miss('grossMarginPct','no_fact');
 // shares: affirmative applicability checks first (§9.1)
 if(!['common','A'].includes(security.shareClass)||security.openSecuritiesInMarket!==1)miss('sharesDiluted','share_basis_unverified');
 else{
  const all=cur.filter(r=>r.concept==='shares_outstanding'&&r.duration==='INSTANT');
  const sh=all.filter(r=>r.period_end===end);
  if(sh.length>1)miss('sharesDiluted','multi_class_shares');
  else if(sh.length===0)miss('sharesDiluted',all.length?'period_mismatch':'no_fact');
  else cands.push({field:'sharesDiluted',factIds:[sh[0].fact_id],value:()=>scaled(sh[0].value_text,u.divisor),basis:'shares_outstanding',divisor:u.divisor,unit:sh[0].unit});
 }
 // net debt: borrowings_total (same envelope) − cash leg, same date and unit
 const cashC=market==='US'?'cash':'monetary_funds';
 const btAll=metrics.filter(m=>m.metric==='borrowings_total');
 const bt=btAll.filter(m=>m.period_end===end&&m.input_unit===rev.unit);
 const cashAll=cur.filter(r=>r.concept===cashC&&r.duration==='INSTANT');
 const cashAtEnd=cashAll.filter(r=>r.period_end===end);
 const cash=cashAtEnd.filter(r=>r.unit===rev.unit);
 if(bt.length!==1)miss('netDebt',btAll.some(m=>m.period_end===end)?'unit_mismatch':btAll.length?'period_mismatch':'no_fact');
 else if(cash.length!==1)miss('netDebt',cashAtEnd.length?'unit_mismatch':cashAll.length?'period_mismatch':'no_fact');
 else cands.push({field:'netDebt',factIds:[...bt[0].inputs.map(i=>i.fact_id),cash[0].fact_id],value:()=>scaled(decimalSub(bt[0].value,cash[0].value_text),u.divisor),metric:'borrowings_total',
  basis:market==='US'?'us_standard':'cn_borrowings_less_monetary_funds_incl_restricted',divisor:u.divisor,unit:rev.unit});
 return done(cands,end);
}

/** Fact ids behind the candidate leaves: the only ids the route needs evidence / PDF locators for. */
export const seedFactIds=(snapshot:ReadSnapshotResult,security:SeedSecurity,opts:SeedPlanOpts):string[]=>[...new Set(plan(snapshot,security,opts).cands.flatMap(c=>c.factIds))];

export function seedFromFacts(snapshot:ReadSnapshotResult,security:SeedSecurity,opts:SeedPlanOpts&{evidence:ReadonlyMap<string,EvidenceRecord>;pdf:ReadonlyMap<string,PdfLocator>;admin:boolean}):SeedResult{
 const {out,cands,rows,end,market}=plan(snapshot,security,opts);
 const miss=(field:SeedField,reason:SeedMissingReason)=>out.missing.push({field,reason});
 if(end==='')return out;   // truncated or no 12M revenue: nothing to gate
 // one gate over every candidate fact
 const byId=new Map(rows.map(r=>[r.fact_id,r]));
 const ids=[...new Set(cands.flatMap(c=>c.factIds))];
 const facts=ids.map(id=>byId.get(id)).filter((r):r is FactRow=>r!==undefined);
 const g=applyGate({factIds:ids,facts:new Map(facts.map(r=>[r.fact_id,r])),filings:new Map(snapshot.filings.map(f=>[f.filingId,f])),records:new Map(opts.evidence),pdf:new Map(opts.pdf),market,admin:opts.admin});
 const reasonOf=(id:string):WithheldReason|null=>{const e=g.eligibility.get(id);return !byId.has(id)||!e?'evidence_incomplete':e.ok?null:e.reason;};
 for(const c of cands){
  const bad=c.factIds.map(reasonOf).filter((r):r is WithheldReason=>r!==null);
  if(bad.length){miss(c.field,bad.includes('evidence_incomplete')?'evidence_incomplete':bad[0]);continue;}
  const value=c.value();
  if(!Number.isFinite(value)){miss(c.field,'unit_mismatch');continue;}
  out.seed[KEY[c.field]]=value;
  out.provenance[c.field]={source:'fact',value,factIds:c.factIds,...(c.metric?{metric:c.metric}:{}),divisor:c.divisor,basis:c.basis,periodEnd:end,unit:c.unit};
  for(const id of c.factIds)if(g.evidence[id])out.evidence[id]=g.evidence[id];
 }
 out.missing.sort((a,b)=>SEED_FIELDS.indexOf(a.field)-SEED_FIELDS.indexOf(b.field));
 return out;
}

/** GET /api/dcf/[ticker] body: the seed as the equity-bridge panel shows it. */
export function seedResponse(ticker:string,market:Market,s:SeedResult,fallback:{currency:string;currencyUnit:string;divisor:string}):DcfSeedResponse{
 const field=(f:SeedField):SeedBridgeField=>{const p=s.provenance[f];const m=s.missing.find(x=>x.field===f);
  return p?{value:p.value,source:'fact',factIds:p.factIds,basis:p.basis,periodEnd:p.periodEnd,divisor:p.divisor,reason:null}:{value:null,source:null,factIds:[],basis:null,periodEnd:null,divisor:null,reason:m?.reason??'no_fact'};};
 return {status:'seed',ticker,market,
  meta:s.meta.currency?{currency:s.meta.currency,currencyUnit:s.meta.currencyUnit!,divisor:s.meta.divisor!}:fallback,
  bridge:{baseRevenue:field('revenueLines[0].baseRevenue'),sharesDiluted:field('sharesDiluted'),netDebt:field('netDebt')},
  grossMarginPct:{value:s.provenance.grossMarginPct?.value??null,factIds:s.provenance.grossMarginPct?.factIds??[]},
  missing:s.missing,evidence:s.evidence,...(s.truncated?{truncated:true}:{})};
}
