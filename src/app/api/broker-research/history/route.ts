// src/app/api/broker-research/history/route.ts
// GET /api/broker-research/history (spec §8.1): broker_rating_history_v rows for one security
// (ticker required, resolved like the list route), optional institution and currency. Empty → 404.
import {NextResponse} from 'next/server';
import {QueryError,TICKER_RE,UUID_RE,errorResponse,failureResponse,intParam,paramErrorResponse,readParams,utcDate} from '@/lib/facts/public-route';
import {HISTORY_DEFAULT_LIMIT,HISTORY_MAX_LIMIT,anonPublicDeps,publicHistory,resolveTicker} from '@/lib/broker-research/public-read';

export const dynamic='force-dynamic';
const PARAMS=['ticker','institution','currency','limit'] as const;

export async function GET(req:Request){
 const today=utcDate(new Date());
 let ticker:string,institutionId:string|undefined,currency:string|undefined,limit:number;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const t=p.get('ticker');if(t===undefined||!TICKER_RE.test(t))throw new QueryError('ticker');ticker=t;
  institutionId=p.get('institution');if(institutionId!==undefined&&!UUID_RE.test(institutionId))throw new QueryError('institution');
  currency=p.get('currency');if(currency!==undefined&&!/^[A-Z]{3}$/.test(currency))throw new QueryError('currency');
  limit=intParam(p,'limit',HISTORY_DEFAULT_LIMIT,HISTORY_MAX_LIMIT);
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=anonPublicDeps();
  const sec=await resolveTicker(deps.tables,ticker,today);
  if(!sec)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const rows=await publicHistory(deps,{securityTicker:sec.securityTicker,institutionId:institutionId?.toLowerCase(),currency,limit});
  if(rows.length===0)return errorResponse('not_found','no public history',404);
  return NextResponse.json({ticker:sec.securityTicker,rows,count:rows.length},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/history','history unavailable');}
}
