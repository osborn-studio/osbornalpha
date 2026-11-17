// src/app/api/broker-research/by-ticker/[ticker]/route.ts
// GET /api/broker-research/by-ticker/[ticker] (spec §8.1, §9.4): the newest public reports whose
// targets resolve to the ticker's issuer (default 5, max 20) for the /stock "馆藏研报（n）" block.
// Nothing public → 404 (the block hides itself).
import {NextResponse} from 'next/server';
import {TICKER_RE,decodeTicker,errorResponse,failureResponse,intParam,paramErrorResponse,readParams,utcDate} from '@/lib/facts/public-route';
import {BY_TICKER_DEFAULT_LIMIT,BY_TICKER_MAX_LIMIT,anonPublicDeps,listPublicReports,resolveTicker} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const today=utcDate(new Date());
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let limit:number;
 try{limit=intParam(readParams(new URL(req.url),['limit']),'limit',BY_TICKER_DEFAULT_LIMIT,BY_TICKER_MAX_LIMIT);}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=anonPublicDeps();
  const sec=await resolveTicker(deps.tables,ticker,today);
  if(!sec)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const page=await listPublicReports(deps,{issuerId:sec.issuerId,limit});
  if(page.reports.length===0)return errorResponse('not_found','no public reports for ticker',404);
  return NextResponse.json({ticker:sec.securityTicker,issuerId:sec.issuerId,reports:page.reports,count:page.count},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/by-ticker','reports unavailable');}
}
