// src/lib/company/route.ts
// Shared layer of the composed company routes (spec §6 common conventions, §6.4, §0 #57 #62 #63 #64 #69).
// companyRoute() is the one GET factory: public mode never reads the session and caches with
// successHeaders(now, asOf given ? asOf : undefined, empty); admin mode calls requireAdminUser() FIRST
// and every response (success or error) is `private, no-store`. Ticker → issuer via resolvePublicIssuer
// (exact-first, normalised fallback, merge redirect; market from the matched security); HK → 404
// market_not_served (F3 state on the page, never a US fallback). Handlers assemble every DTO per
// request from readSnapshot (no module cache), so public and admin never share a built object.
// buildGated() is the single evidence gate (fact rows + filings → evidenceOf + CN pdf.locate → Task 6
// applyGate) every financial value goes through; gateCell() applies it to grid cells (a derived cell is
// withheld as a whole). Events use the same applyGate through event-dto.ts gateEvents.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {TICKER_RE,asOfParam,decodeTicker,errorResponse,failureResponse,paramErrorResponse,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
import type {PublicIssuer} from '@/lib/facts/public-route';
import {inferCoreMarket} from '@/lib/securities/ticker';
import type {FactRow,FilingRow} from '@/lib/facts/types';
import {productionReadDeps} from './deps';
import type {ReadDeps} from './deps';
import {applyGate,gateCell as gateCellByEligibility} from './evidence-gate';
import type {Eligibility} from './evidence-gate';
import {inGateScope} from './fact-scope';
import {filingSummaryOf} from './snapshot-read';
import type {Cell,EvidenceDto,EvidenceRecord,FilingSummary,PdfLocator,WithheldCell,WithheldCounts,WithheldReason} from './types';

export type Mode='public'|'admin';
export const PRIVATE_NO_STORE='private, no-store';
export class RouteError extends Error{constructor(public readonly code:string,public readonly status:number,message?:string){super(message??code);this.name='RouteError';}}
export interface RouteCtx{mode:Mode;admin:boolean;now:Date;today:string;asOf:string;asOfGiven:boolean;issuer:PublicIssuer;params:Map<string,string>;deps:ReadDeps;userId:string|null}
export interface HandlerResult{body:unknown;status?:number;empty:boolean;cacheControl?:string}
export type Handler=(ctx:RouteCtx,req:Request)=>Promise<HandlerResult|Response>;

/** requireAdminUser() → user id, or the 401/403/500 response. */
export async function adminGate():Promise<string|Response>{
 try{return (await requireAdminUser()).id;}
 catch(e){
  if(e instanceof AdminUnauthenticated)return errorResponse('not_authenticated','authentication required',401);
  if(e instanceof AdminForbidden)return errorResponse('forbidden','admin role required',403);
  return failureResponse(e,'admin','admin check failed');
 }
}
export function privateResponse(res:Response):Response{res.headers.set('Cache-Control',PRIVATE_NO_STORE);return res;}

export function companyRoute(spec:{tag:string;mode:Mode;params:readonly string[];handler:Handler}){
 return async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}):Promise<Response>{
  const now=new Date(),today=utcDate(now);
  const finish=(res:Response)=>spec.mode==='admin'?privateResponse(res):res;
  let userId:string|null=null;
  if(spec.mode==='admin'){const a=await adminGate();if(a instanceof Response)return finish(a);userId=a;}
  const {ticker:raw}=await params;const ticker=decodeTicker(raw);
  if(ticker===null||!TICKER_RE.test(ticker))return finish(errorResponse('invalid_parameter:ticker','invalid ticker',400));
  let p:Map<string,string>,asOf:string,asOfGiven:boolean,tickerAsOf:string;
  try{p=readParams(new URL(req.url),[...spec.params,'tickerAsOf']);tickerAsOf=tickerAsOfParam(p,today);asOfGiven=p.has('asOf');asOf=spec.params.includes('asOf')?asOfParam(p,today):today;}
  catch(e){const r=paramErrorResponse(e);if(r)return finish(r);throw e;}
  if(inferCoreMarket(ticker.trim())==='HK')return finish(errorResponse('market_not_served','HK disclosure facts await the document pipeline (F3)',404));
  try{
   const deps=productionReadDeps();
   const issuer=await resolvePublicIssuer(deps.tables,ticker,today,tickerAsOf);
   if(!issuer)return finish(errorResponse('unknown_ticker','no issuer for ticker',404));
   const out=await spec.handler({mode:spec.mode,admin:spec.mode==='admin',now,today,asOf,asOfGiven,issuer,params:p,deps,userId},req);
   if(out instanceof Response)return finish(out);
   const headers=spec.mode==='admin'?{'Cache-Control':PRIVATE_NO_STORE}:out.cacheControl?{'Cache-Control':out.cacheControl}:successHeaders(now,asOfGiven?asOf:undefined,out.empty);
   return NextResponse.json(out.body,{status:out.status??200,headers});
  }catch(e){
   const pr=paramErrorResponse(e);if(pr)return finish(pr);
   if(e instanceof RouteError)return finish(errorResponse(e.code,e.message,e.status));
   return finish(failureResponse(e,spec.tag,`${spec.tag} read failed`));
  }
 };
}

/** A published filings row as the gate's FilingSummary (factCount unknown here → 0; the gate never reads it). */
export const gateFilingOf=(f:FilingRow):FilingSummary=>filingSummaryOf(f,0);
export interface Gated{
 evidence:Record<string,EvidenceDto>;
 /** Task 6 Eligibility per requested id (feed to gateEventPayload / metricWithheldReason). */
 eligibility:Map<string,Eligibility>;
 /** The caller's snapshot filings plus any published filing loaded for an unknown fact. */
 filings:Map<string,FilingSummary>;
 /** null = eligible; unknown or foreign ids are evidence_incomplete. */
 reasonOf(factId:string):WithheldReason|null;
 withheld(factId:string):WithheldCell|null;
 fact(factId:string):FactRow|undefined;
}
/**
 * The one evidence gate (§5.6, §0 #63): rows not in `known` are read with factsByIds and kept only when they
 * belong to this (lineage members, market); filings not in `filings` come from filingsOfIssuer (published only);
 * evidence via the service_role company_fact_evidence read; CN PDF locators via the injected source.
 */
export async function buildGated(ctx:{deps:ReadDeps;admin:boolean;issuer:PublicIssuer;asOf?:string;lineage?:ReadonlySet<string>},factIds:Iterable<string>,known:readonly FactRow[],filings:readonly FilingSummary[]):Promise<Gated>{
 const {deps,issuer}=ctx;
 const members=ctx.lineage??new Set([issuer.issuerId]);
 const ids=[...new Set(factIds)];
 const byId=new Map<string,FactRow>();
 for(const r of known)if(inGateScope(r,members,issuer.market,ctx.asOf))byId.set(r.fact_id,r);
 const unknown=ids.filter(id=>!byId.has(id));
 if(unknown.length>0)for(const r of await deps.facts.factsByIds(unknown))if(inGateScope(r,members,issuer.market,ctx.asOf))byId.set(r.fact_id,r);
 const facts=ids.map(id=>byId.get(id)).filter((r):r is FactRow=>r!==undefined);
 const filingMap=new Map<string,FilingSummary>(filings.map(f=>[f.filingId,f]));
 if(facts.some(r=>!filingMap.has(r.filing_id)))
  for(const f of (await Promise.all([...members].map(id=>deps.facts.filingsOfIssuer(id,issuer.market,{})))).flat())if(f.mapping_gen>0&&(!ctx.asOf||f.available_date<=ctx.asOf)&&!filingMap.has(f.filing_id))filingMap.set(f.filing_id,gateFilingOf(f));
 const perMember=await Promise.all([...members].map(async member=>{
  const present=facts.filter(r=>r.issuer_id===member).map(r=>r.fact_id);
  return present.length>0
   ?Promise.all([deps.company.evidenceOf(present),issuer.market==='CN'?deps.pdf.locate(member,issuer.market,present):Promise.resolve(new Map<string,PdfLocator>())])
   :[new Map<string,EvidenceRecord>(),new Map<string,PdfLocator>()] as const;
 }));
 const records=new Map(perMember.flatMap(([records])=>[...records]));
 const pdf=new Map(perMember.flatMap(([,pdf])=>[...pdf]));
 const g=applyGate({factIds:ids,facts:new Map(facts.map(r=>[r.fact_id,r])),filings:filingMap,records,pdf,market:issuer.market,admin:ctx.admin});
 const reasonOf=(id:string):WithheldReason|null=>{const e=g.eligibility.get(id);return !e?'evidence_incomplete':e.ok?null:e.reason;};
 return {evidence:g.evidence,eligibility:g.eligibility,filings:filingMap,reasonOf,fact:id=>byId.get(id),withheld:id=>{const r=reasonOf(id);return r?{kind:'withheld',reason:r,factId:id}:null;}};
}
export const cellFactIds=(c:Cell):string[]=>!c||c.kind==='withheld'?[]:c.kind==='fact'?[c.factId]:c.inputs.map(i=>i.factId);
/** A fact cell is withheld when its fact fails; a derived cell when ANY input fails or it has none (Task 6 gateCell; evidence_incomplete wins). */
export const gateCell=(cell:Cell,g:Gated):Cell=>gateCellByEligibility(cell,g.eligibility);
export function countWithheld(cells:Iterable<Cell|WithheldCell|{kind:string;reason?:string}|null>):WithheldCounts{
 const n={evidenceIncomplete:0,citationPending:0};
 for(const c of cells)if(c&&c.kind==='withheld'){if((c as WithheldCell).reason==='evidence_incomplete')n.evidenceIncomplete++;else n.citationPending++;}
 return n;
}
