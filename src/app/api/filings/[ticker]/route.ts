// src/app/api/filings/[ticker]/route.ts
// Public filings list (spec §9; plan 3 §4.4, §4.5): the published filings of every member of the
// issuer's lineage by available_date window, newest first, with the citation state
// (edgar | linked | pending), acceptedAt and recordedIssuerId. tickerAsOf picks the owner at that date.
import {NextResponse} from 'next/server';
import {TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,lineageFilings,paramErrorResponse,publicClients,publicFiling,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';
const PARAMS=['from','to','limit','tickerAsOf'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let from:string|undefined,to:string|undefined,limit:number,tickerAsOf:string;
 try{const p=readParams(new URL(req.url),PARAMS);from=dateParam(p,'from');to=dateParam(p,'to');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today,tickerAsOf);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const lineage=await db.lineageOf(issuer.issuerId);
  // published only, filtered BEFORE the limit (so staged filings never consume page slots)
  const filings=(await lineageFilings(db,lineage,issuer.market,{from,to})).slice(0,limit);
  return NextResponse.json({issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,lineage,resolution:publicResolution(issuer),filings:filings.map(publicFiling)},{headers:successHeaders(now,undefined,filings.length===0)});
 }catch(e){return failureResponse(e,'filings','filings read failed');}
}
