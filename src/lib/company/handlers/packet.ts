// src/lib/company/handlers/packet.ts
// GET /api/companies/[ticker]/packet — the Copilot financials packet (spec §6.1, §9.2). One snapshot envelope
// (history:true, bounded by `from`): the three statements' annual rows (annualPeriods ≤ 10, default 5) and the
// most recent disclosed periods (recentPeriods ≤ 8, default 4) from the same grid builder as the page, plus six
// derived metrics on the same envelope. Every value carries factId + availableDate and passes the evidence gate
// (ineligible → {withheld, factId}); provenance {mappingGen, formulaVersion, stateRev}. The serialized JSON is
// ≤ 32 KB, guaranteed by clipping periods (reported in `clipped`). No evidence dictionary (size; see plan note).
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {FORMULA_VERSION,addDays,deriveMetrics} from '@/lib/facts/derive';
import {intParam} from '@/lib/facts/public-route';
import type {Market,MetricRow} from '@/lib/facts/types';
import {buildGated,cellFactIds,countWithheld,gateCell} from '../route';
import type {Gated,Handler} from '../route';
import {buildStatementsGrid,periodKeyOf} from '../statements-grid';
import type {Basis,Cell,PeriodCol,StatementKind,WithheldCounts,WithheldReason} from '../types';

export const PACKET_PARAMS=['annualPeriods','recentPeriods'] as const;
export const PACKET_METRICS=['gross_margin','net_margin','fcf','revenue_yoy','net_income_yoy','roe'] as const;
export const PACKET_MAX_BYTES=32*1024;
const STATEMENTS:StatementKind[]=['IS','BS','CF'];
export type PacketValue={value:string;factId:string;availableDate:string}|{withheld:WithheldReason;factId:string};
export interface PacketRow{concept:string;unit:string|null;values:Record<string,PacketValue>}
export interface PacketSection{periods:PeriodCol[];IS:PacketRow[];BS:PacketRow[];CF:PacketRow[]}
export type PacketMetric={metric:string;periodKey:string;unit:string;basis:string;factIds:string[];availableDate:string}&({value:string}|{withheld:WithheldReason});
export interface PacketDto{
 issuerId:string;ticker:string;market:Market;asOf:string;truncated:boolean;
 provenance:{mappingGen:number;formulaVersion:string;stateRev:number};
 annual:PacketSection;recent:PacketSection;metrics:PacketMetric[];clipped:{annual:number;recent:number};withheld:WithheldCounts;
}
const emptySection=():PacketSection=>({periods:[],IS:[],BS:[],CF:[]});
const bytes=(x:unknown)=>Buffer.byteLength(JSON.stringify(x),'utf8');

function valueOf(c:Cell):PacketValue|null{
 if(!c)return null;
 if(c.kind==='withheld')return {withheld:c.reason,factId:c.factId};
 if(c.kind==='fact')return {value:c.value,factId:c.factId,availableDate:c.availableDate};
 return null;   // annual/disclosed grids carry fact cells only
}
interface Built{sections:Record<'annual'|'recent',Record<StatementKind,{periods:PeriodCol[];rows:{concept:string;unit:string|null;cells:Record<string,Cell>}[]}>>;metrics:MetricRow[]}
// Same column order as Task 7's grid: period_end desc → period_start desc → 3M<6M<9M<12M<TTM<INSTANT.
const DUR_ORDER:Record<string,number>={'3M':0,'6M':1,'9M':2,'12M':3,TTM:4,INSTANT:5};
const cmpStr=(a:string,b:string)=>a<b?-1:a>b?1:0;
const colOrder=(a:PeriodCol,b:PeriodCol)=>cmpStr(b.periodEnd,a.periodEnd)||cmpStr(b.periodStart,a.periodStart)||(DUR_ORDER[a.duration]??9)-(DUR_ORDER[b.duration]??9);
// 计划第 3 轮审计 R4: out.periods is the union of every statement's retained (clipped) periods, so every
// values key is declared — an annual IS 12M key and a BS INSTANT key both appear; clipping stays per statement.
function sectionOf(b:Built['sections']['annual'],n:number,g:Gated):PacketSection{
 const out=emptySection();
 const periodsByKey=new Map<string,PeriodCol>();
 for(const s of STATEMENTS){
  const periods=b[s].periods.slice(0,n);
  for(const p of periods)periodsByKey.set(p.key,p);
  out[s]=b[s].rows.map(r=>({concept:r.concept,unit:r.unit,values:Object.fromEntries(periods.flatMap(p=>{const v=valueOf(gateCell(r.cells[p.key]??null,g));return v?[[p.key,v]]:[];}))})).filter(r=>Object.keys(r.values).length>0);
 }
 out.periods=[...periodsByKey.values()].sort(colOrder);
 return out;
}
function metricsOf(ms:MetricRow[],ends:Set<string>,g:Gated):PacketMetric[]{
 return ms.filter(m=>(PACKET_METRICS as readonly string[]).includes(m.metric)&&ends.has(m.period_end)).map(m=>{
  const factIds=m.inputs.map(i=>i.fact_id);
  const availableDate=m.inputs.reduce((d,i)=>i.available_date>d?i.available_date:d,'');
  const bad=factIds.map(id=>g.reasonOf(id)).filter((r):r is WithheldReason=>r!==null);
  const base={metric:m.metric,periodKey:periodKeyOf(m),unit:m.unit,basis:m.basis,factIds,availableDate};
  return bad.length?{...base,withheld:bad.includes('evidence_incomplete')?'evidence_incomplete':bad[0]}:{...base,value:m.value};
 });
}
export const packetHandler:Handler=async(ctx)=>{
 const {params:p,issuer,deps,asOf}=ctx;
 const annualN=intParam(p,'annualPeriods',5,10),recentN=intParam(p,'recentPeriods',4,8);
 const snap=await deps.snapshot(issuer.issuerId,issuer.market,{concepts:null,asOf,from:addDays(asOf,-(annualN+2)*366),history:true});
 const head={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf,truncated:snap.truncated,provenance:{mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,stateRev:snap.stateRev}};
 if(snap.truncated){const body:PacketDto={...head,annual:emptySection(),recent:emptySection(),metrics:[],clipped:{annual:0,recent:0},withheld:{evidenceIncomplete:0,citationPending:0}};return {body,empty:true};}
 // Task 7 grid on the same envelope (current disclosures only for annual/disclosed); 40 columns, sectionOf clips to n.
 const grid=(basis:Basis,s:StatementKind)=>{const o=buildStatementsGrid(snap,{statement:s,basis,periods:40,market:issuer.market,asOf});return o.ok?{periods:o.periods,rows:o.rows}:{periods:[],rows:[]};};
 const built:Built={sections:{annual:{} as Built['sections']['annual'],recent:{} as Built['sections']['recent']},metrics:deriveMetrics(snap.rows,{market:issuer.market,asOf,basedOnRev:snap.stateRev})};
 for(const s of STATEMENTS){built.sections.annual[s]=grid('annual',s);built.sections.recent[s]=grid('disclosed',s);}
 const ids=[...STATEMENTS.flatMap(s=>[...built.sections.annual[s].rows,...built.sections.recent[s].rows].flatMap(r=>Object.values(r.cells).flatMap(cellFactIds))),...built.metrics.flatMap(m=>m.inputs.map(i=>i.fact_id))];
 const g=await buildGated(ctx,ids,snap.rows,snap.filings);
 const make=(a:number,r:number):PacketDto=>{
  const annual=sectionOf(built.sections.annual,a,g),recent=sectionOf(built.sections.recent,r,g);
  const ends=new Set([...annual.periods,...recent.periods].map(x=>x.periodEnd));
  const metrics=metricsOf(built.metrics,ends,g);
  const all=[...annual.IS,...annual.BS,...annual.CF,...recent.IS,...recent.BS,...recent.CF].flatMap(row=>Object.values(row.values));
  const withheld=countWithheld([...all,...metrics].filter(v=>'withheld' in v).map(v=>({kind:'withheld',reason:(v as {withheld:WithheldReason}).withheld})));
  return {...head,annual,recent,metrics,clipped:{annual:annualN-a,recent:recentN-r},withheld};
 };
 let a=annualN,r=recentN,body=make(a,r);
 while(bytes(body)>PACKET_MAX_BYTES&&(a>1||r>1)){if(r>1&&(r>=a||a===1))r--;else a--;body=make(a,r);}
 if(bytes(body)>PACKET_MAX_BYTES)body={...head,annual:emptySection(),recent:emptySection(),metrics:[],clipped:{annual:annualN,recent:recentN},withheld:body.withheld};
 return {body,empty:body.annual.periods.length===0&&body.recent.periods.length===0};
};
