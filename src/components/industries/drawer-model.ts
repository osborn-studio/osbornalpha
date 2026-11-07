// src/components/industries/drawer-model.ts
// What the source drawer shows and where it fetches it (spec §8.5, canvas "Drawer" A–D): payload
// kinds, the replay URL (public route, or the admin route for the internal preview), normalisation of
// both replay responses, and the role / input / diff summaries rendered in sections 2–4.
import type {FactCellView,MembershipView,NodeView,PublicCell,PublicValuation,ReplayDiff,RunHeader} from '@/lib/industry/read';
import type {AggregateManifest,ManifestCell,Scheme} from '@/lib/industry/types';

export type DrawerPayload=
 |{kind:'aggregate';scheme:Scheme;code:string;nodeName:string;cell:PublicCell;header:RunHeader;preview:boolean}
 |{kind:'valuation';scheme:Scheme;code:string;nodeName:string;runId:string;cell:PublicValuation;preview:boolean}
 |{kind:'fact';issuerName:string;ticker:string|null;fact:FactCellView}
 |{kind:'membership';scheme:Scheme;nodeName:string;issuerName:string;ticker:string|null;membership:MembershipView;path:NodeView[]};
export type AggregatePayload=Extract<DrawerPayload,{kind:'aggregate'}>;
export interface ReplayPayload{cell:PublicCell;manifestHash:string;manifest:AggregateManifest;replay:ManifestCell[];reproduced:boolean}
export interface RecomputePayload{result:'match'|'changed';diff:ReplayDiff}

const qs=(o:Record<string,string>)=>Object.entries(o).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
/** Public replay route; the admin preview reads the admin route (original only: recompute is public-only). */
export function replayUrl(p:AggregatePayload,mode:'original'|'recompute'):string|null{
 const c=p.cell;
 if(p.preview)return mode==='original'?`/api/admin/industries/replay?${qs({runId:p.header.runId,code:p.code,periodEnd:c.periodEnd,metric:c.metric,duration:c.duration})}`:null;
 return `/api/industries/${p.scheme}/${encodeURIComponent(p.code)}/replay?${qs({runId:p.header.runId,metric:c.metric,duration:c.duration,periodEnd:c.periodEnd,mode})}`;
}
export function valuationReplayUrl(p:Extract<DrawerPayload,{kind:'valuation'}>):string|null{
 if(p.preview)return null;
 return `/api/industries/${p.scheme}/${encodeURIComponent(p.code)}/replay?${qs({runId:p.runId,metric:p.cell.metric,tradeDate:p.cell.tradeDate})}`;
}
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null;
/** Public original body or the admin body's `focus` → the drawer's replay shape; anything else → null. */
export function normalizeReplay(json:unknown):ReplayPayload|null{
 const src=isObj(json)&&isObj(json.focus)?json.focus:json;
 if(!isObj(src)||!isObj(src.manifest)||!Array.isArray(src.replay)||typeof src.reproduced!=='boolean'||typeof src.manifestHash!=='string'||!isObj(src.cell))return null;
 return src as unknown as ReplayPayload;
}
export function normalizeRecompute(json:unknown):RecomputePayload|null{
 if(!isObj(json)||(json.result!=='match'&&json.result!=='changed')||!isObj(json.diff))return null;
 return json as unknown as RecomputePayload;
}
/** Error code of an API error body ({error:{code}} or the admin {error:'code'}), else the HTTP status. */
export function errorCodeOf(status:number,json:unknown):string{
 if(isObj(json)){const e=json.error;if(typeof e==='string')return e;if(isObj(e)&&typeof e.code==='string')return e.code;}
 return `http_${status}`;
}

export const coverageOf=(c:{nWithData:number;nMembers:number;nUnresolved:number})=>({n:c.nWithData,d:c.nMembers+c.nUnresolved});
/** Issuers per role of the (metric-filtered) manifest; excluded split by reason, largest first. */
export function roleSummary(m:AggregateManifest):{included:number;excluded:{reason:string;n:number}[]}{
 const inc=new Set<string>(),exc=new Map<string,Set<string>>();
 for(const r of m.roles){
  if(r.role==='included')inc.add(r.issuer_id);
  else{const k=r.reason??'excluded';const s=exc.get(k)??new Set<string>();s.add(r.issuer_id);exc.set(k,s);}
 }
 return {included:inc.size,excluded:[...exc.entries()].map(([reason,s])=>({reason,n:s.size})).sort((a,b)=>b.n-a.n||(a.reason<b.reason?-1:1))};
}
export interface InputRow{issuerId:string;ticker:string|null;concept:string;value:string;unit:string;availableDate:string;filingId:string;citation:string|null}
/** Input facts of included issuers (the manifest is metric-filtered), ordered by issuer then concept. */
export function inputRows(m:AggregateManifest,limit:number):{rows:InputRow[];total:number}{
 const included=new Set(m.roles.filter(r=>r.role==='included').map(r=>r.issuer_id));
 const ticker=new Map(m.members.map(x=>[x.issuer_id,x.ticker]));
 const all=m.facts.filter(f=>included.size===0||included.has(f.issuer_id))
  .sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.concept<b.concept?-1:a.concept>b.concept?1:0)
  .map(f=>({issuerId:f.issuer_id,ticker:ticker.get(f.issuer_id)??null,concept:f.concept,value:f.value_text,unit:f.unit,availableDate:f.available_date,filingId:f.filing_id,citation:f.citation}));
 return {rows:all.slice(0,limit),total:all.length};
}
export function diffCounts(d:ReplayDiff){
 return {ma:d.members.added.length,mr:d.members.removed.length,ua:d.unresolved.added.length,ur:d.unresolved.removed.length,fa:d.facts.added.length,fr:d.facts.removed.length,revs:d.stateRevs.length};
}
/** Evidence link of one fact (plan-2 public route, factIds mode). */
export const factEvidenceUrl=(ticker:string|null,factId:string)=>ticker?`/api/facts/${encodeURIComponent(ticker)}?factIds=${encodeURIComponent(factId)}`:null;
export const short=(hash:string|null)=>hash?`${hash.slice(0,4)}…${hash.slice(-4)}`:'—';
