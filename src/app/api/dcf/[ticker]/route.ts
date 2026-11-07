// src/app/api/dcf/[ticker]/route.ts
// DCF over disclosure facts (spec §9.1, §0 #65). No self-call to the legacy financials route: the seed comes from ONE
// company_read_snapshot envelope read server-side, gated (public rules, admin:false). GET → the equity-bridge
// panel seed (no LLM, no engine). POST {overrides} → assemble (defaults < LLM < facts < user) and run;
// an incomplete bridge → 200 {status:'unavailable', code:'dcf_bridge_missing'} without a valuation.
import {NextResponse} from 'next/server';
import {productionReadDeps} from '@/lib/company/deps';
import {SEED_CONCEPTS,seedFactIds,seedFromFacts,seedResponse} from '@/lib/company/dcf-seed';
import type {SeedResult} from '@/lib/company/dcf-seed';
import {MARKET_UNITS,assembleAssumptions} from '@/lib/dcf/assemble';
import {computeComposite} from '@/lib/dcf/engine';
import {isCurrentSecurity} from '@/lib/entities/resolve';
import {addDays} from '@/lib/facts/derive';
import {TICKER_RE,decodeTicker,errorResponse,failureResponse,publicMarketOf,resolvePublicIssuer,utcDate} from '@/lib/facts/public-route';
import type {PublicIssuer} from '@/lib/facts/public-route';
import {inferCoreMarket} from '@/lib/securities/ticker';
import type {EvidenceRecord,PdfLocator} from '@/lib/company/types';

export const dynamic='force-dynamic';
export const maxDuration=60;
interface Ctx{params:Promise<{ticker:string}>}
const NO_STORE={'Cache-Control':'no-store'};
const SEED_WINDOW_DAYS=1100;

async function loadSeed(raw:string):Promise<{issuer:PublicIssuer;seed:SeedResult}|Response>{
 const today=utcDate(new Date());
 const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 if(inferCoreMarket(ticker.trim())==='HK')return errorResponse('market_not_served','HK disclosure facts await the document pipeline (F3)',404);
 const deps=productionReadDeps();
 const issuer=await resolvePublicIssuer(deps.tables,ticker,today);
 if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
 const secs=(await deps.tables.select('issuer_securities',{issuer_id:issuer.issuerId})).filter(r=>isCurrentSecurity(r,today)&&publicMarketOf(String(r.ticker))===issuer.market);
 const own=secs.find(r=>String(r.ticker)===issuer.ticker);
 const snapshot=await deps.snapshot(issuer.issuerId,issuer.market,{concepts:[...SEED_CONCEPTS[issuer.market]],asOf:today,from:addDays(today,-SEED_WINDOW_DAYS),history:true});
 const security={shareClass:own?String(own.share_class):'unknown',openSecuritiesInMarket:secs.length};
 const ids=seedFactIds(snapshot,security,{market:issuer.market,asOf:today});   // evidence / PDF locators only for candidate leaf facts
 const [evidence,pdf]=ids.length>0
  ?await Promise.all([deps.company.evidenceOf(ids),issuer.market==='CN'?deps.pdf.locate(issuer.issuerId,issuer.market,ids):Promise.resolve(new Map<string,PdfLocator>())])
  :[new Map<string,EvidenceRecord>(),new Map<string,PdfLocator>()];
 const seed=seedFromFacts(snapshot,security,{market:issuer.market,asOf:today,evidence,pdf,admin:false});
 return {issuer,seed};
}

export async function GET(_req:Request,{params}:Ctx){
 try{
  const r=await loadSeed((await params).ticker);if(r instanceof Response)return r;
  return NextResponse.json(seedResponse(r.issuer.ticker,r.issuer.market,r.seed,MARKET_UNITS[r.issuer.market]),{headers:NO_STORE});
 }catch(e){return failureResponse(e,'dcf','dcf seed failed');}
}

/** POST /api/dcf/[ticker]  body: {overrides?} → {status, assumptions, provenance, factProvenance, result, warnings, evidence, meta} */
export async function POST(req:Request,{params}:Ctx){
 let overrides:unknown={};
 try{overrides=((await req.json()) as {overrides?:unknown})?.overrides??{};}catch{/* empty body ok */}
 try{
  const r=await loadSeed((await params).ticker);if(r instanceof Response)return r;
  if(r.seed.truncated)return NextResponse.json({status:'unavailable',code:'dcf_bridge_missing',truncated:true,ticker:r.issuer.ticker,market:r.issuer.market,meta:MARKET_UNITS[r.issuer.market],provenance:{},factProvenance:{},missing:r.seed.missing,warnings:[],evidence:{},assumptions:null,result:null},{headers:NO_STORE});   // partial envelope: no seed, no LLM, no valuation
  const a=await assembleAssumptions(r.issuer.ticker,r.issuer.market,r.seed,overrides);
  const base={ticker:r.issuer.ticker,market:r.issuer.market,meta:a.meta,provenance:a.provenance,factProvenance:r.seed.provenance,missing:a.missing,warnings:a.warnings,evidence:r.seed.evidence};
  if(a.status==='unavailable')return NextResponse.json({status:'unavailable',code:'dcf_bridge_missing',...base,assumptions:null,result:null},{headers:NO_STORE});
  return NextResponse.json({status:'ok',...base,assumptions:a.assumptions,result:computeComposite(a.assumptions!)},{headers:NO_STORE});
 }catch(e){return failureResponse(e,'dcf','dcf failed');}
}
