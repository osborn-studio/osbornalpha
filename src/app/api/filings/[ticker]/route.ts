// src/app/api/filings/[ticker]/route.ts
// Public filings list (spec §9): the issuer's filings by available_date window, with the
// citation state (edgar | linked | pending).
import {NextResponse} from 'next/server';
import {TICKER_RE,dateParam,errorResponse,intParam,paramErrorResponse,publicClients,publicFiling,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
const PARAMS=['from','to','limit'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeURIComponent(raw);
 if(!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let from:string|undefined,to:string|undefined,limit:number;
 try{const p=readParams(new URL(req.url),PARAMS);from=dateParam(p,'from');to=dateParam(p,'to');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const filings=await db.filingsOfIssuer(issuer.issuerId,issuer.market,{from,to,limit});
  return NextResponse.json({issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,filings:filings.map(publicFiling)},{headers:successHeaders(now,undefined,filings.length===0)});
 }catch(e){
  console.error('[filings]',e instanceof Error?e.message:e);
  return errorResponse('internal','filings read failed',500);
 }
}
