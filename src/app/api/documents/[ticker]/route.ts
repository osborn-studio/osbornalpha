// src/app/api/documents/[ticker]/route.ts
// Public document list (spec §9): ticker (US, CN or HK) → issuer by today's ownership; read_documents
// (security invoker, anon → public rows only) picks per (source, source_ref) the highest version
// available on asOf, then applies the from/to window on available_date; versions=1 lists every
// version; cursor pagination (limit default 100, max 1000). Top level carries extractorVersion and
// classifierGen. Empty pages and errors are no-store.
import {NextResponse} from 'next/server';
import {TICKER_RE,decodeTicker,errorResponse,failureResponse,paramErrorResponse,utcDate} from '@/lib/facts/public-route';
import {cacheHeadersFor,docParams,isCursorError,publicDocs,publicDocumentView,resolveDocIssuer} from '@/lib/documents/read-route';
import type {DocListParams} from '@/lib/documents/read-route';
import {CLASSIFIER_GEN,EXTRACTOR_VERSION} from '@/lib/documents/types';

export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let q:DocListParams;
 try{q=docParams(new URL(req.url),today);}catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicDocs();
  const issuer=await resolveDocIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  const page=await db.readDocuments(issuer.issuerId,{asOf:q.asOf,source:q.source,docClass:q.docClass,from:q.from,to:q.to,allVersions:q.versions,cursor:q.cursor,limit:q.limit});
  const rows=page.rows.filter(r=>r.permission==='public');   // RLS already does this; defence in depth
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,asOf:q.asOf,extractorVersion:EXTRACTOR_VERSION,classifierGen:CLASSIFIER_GEN,documents:rows.map(publicDocumentView),nextCursor:page.nextCursor};
  return NextResponse.json(body,{headers:cacheHeadersFor(rows.length===0?'empty':'public',q.asOf,now)});
 }catch(e){
  if(isCursorError(e))return errorResponse('invalid_parameter:cursor','invalid cursor',400);
  return failureResponse(e,'documents','documents read failed');
 }
}
