// src/lib/documents/read-route.ts
// Conventions shared by the document read routes (spec §9, §8.1): public reads go through the ANON
// client (RLS shows public documents, their extractions/pages/assets and visible citations only;
// read_documents is security invoker); parameters are parsed strictly with the facts route helpers
// (repeated parameter → 400 invalid_parameter:<name>); cursors are opaque and must decode
// (db.ts::decodeCursor); error bodies {error:{code,message}} with no-store. Cache headers by
// response class: anonymous-visible success → past asOf 'public, max-age=600, s-maxage=3600',
// otherwise successCacheControl(now); empty → no-store; anything answered after a session check
// (owner reads, signed URLs) → 'private, no-store'. Tickers resolve by today's ownership through
// resolveIssuer, INCLUDING .HK (the facts public-route resolver rejects HK; documents do not).
// The page/layout body is shared with the owner branch (Task 12), which passes the service db;
// ownerReadDeps/ownerDocumentView/auditFailedResponse at the end serve that branch.
import {getAnonSupabase} from '../supabase/anon';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity,resolveIssuer,successCacheControl} from '../entities/resolve';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {QueryError,asOfParam,dateParam,errorResponse,flagParam,intParam,readParams,utcDate} from '../facts/public-route';
import {decodeCursor,encodeCursor,supabaseDocumentsDb,timestampUuidCursor} from './db';
import {supabaseObjectStore} from './object-store';
import {cpLength,sha256Hex} from './extract/pages-json';
import {audit} from '../research/store';
import type {ResearchSupabase} from '../research/store';
import type {OwnerReadDeps} from './upload';
import {CLASSIFIER_GEN,DocumentsDbError,EXTRACTOR_VERSION,PAGE_LIMIT_MAX} from './types';
import type {AssetRow,DocClass,DocumentRow,DocumentsDb,ExtractionRow,LayoutLine,LayoutTable,ListedSource,ObjectStore,PagesJson} from './types';

export const LISTED_SOURCES:ReadonlySet<string>=new Set<ListedSource>(['edgar','cninfo','hkexnews']);
export const DOC_CLASSES:ReadonlySet<string>=new Set<DocClass>(['annual_report','interim_report','quarterly_report','results_announcement','current_report','registration','proxy','ownership','other']);
export const DEFAULT_LIMIT=100;
export const EXTRACTIONS_PAGE=100;
export const SIGNED_URL_SECONDS=300;
const MAX_CURSOR=1024;
export const PRIVATE_HEADERS={'Cache-Control':'private, no-store'} as const;

export interface DocListParams{asOf:string;source?:ListedSource;docClass?:DocClass;from?:string;to?:string;versions:boolean;cursor:string|null;limit:number}

/** An opaque cursor that our db layer can decode; anything else → invalid_parameter:<name>. */
export function cursorParam(p:Map<string,string>,name:string,keyset:'timestamp_uuid'|'any'='any'):string|null{
 const v=p.get(name);if(v===undefined)return null;
 if(v.length===0||v.length>MAX_CURSOR)throw new QueryError(name);
 try{if(keyset==='timestamp_uuid')timestampUuidCursor(v);else decodeCursor(v);}catch{throw new QueryError(name);}
 return v;
}
/** readParams plus: any query parameter outside `allowed` → invalid_parameter:<name> (unknown parameters would otherwise be cache-busters). */
export function strictParams(url:URL,allowed:readonly string[]):Map<string,string>{
 for(const k of url.searchParams.keys())if(!allowed.includes(k))throw new QueryError(k);
 return readParams(url,allowed);
}
/** True for a DocumentsDbError that rejected the keyset cursor (and nothing else). */
export function isCursorError(e:unknown):boolean{return e instanceof DocumentsDbError&&e.code==='invalid_input'&&/cursor/i.test(e.message);}
/** GET /api/documents/[ticker] parameters (spec §9). */
export function docParams(url:URL,today:string):DocListParams{
 const p=strictParams(url,['asOf','source','class','from','to','versions','cursor','limit']);
 const source=p.get('source');if(source!==undefined&&!LISTED_SOURCES.has(source))throw new QueryError('source');
 const docClass=p.get('class');if(docClass!==undefined&&!DOC_CLASSES.has(docClass))throw new QueryError('class');
 const from=dateParam(p,'from'),to=dateParam(p,'to');
 if(from!==undefined&&to!==undefined&&from>to)throw new QueryError('from');
 return {asOf:asOfParam(p,today),source:source as ListedSource|undefined,docClass:docClass as DocClass|undefined,from,to,versions:flagParam(p,'versions'),cursor:cursorParam(p,'cursor'),limit:intParam(p,'limit',DEFAULT_LIMIT,PAGE_LIMIT_MAX)};
}

export type ResponseClass='public'|'private'|'empty';
export function cacheHeadersFor(kind:ResponseClass,asOf:string|undefined,now:Date):Record<string,string>{
 if(kind==='private')return {...PRIVATE_HEADERS};
 if(kind==='empty')return {'Cache-Control':'no-store'};
 if(asOf!==undefined&&asOf<utcDate(now))return {'Cache-Control':'public, max-age=600, s-maxage=3600'};
 return {'Cache-Control':successCacheControl(now)};
}
export const notFound=()=>errorResponse('not_found','not found',404);

export const publicDocumentView=(r:DocumentRow)=>({documentId:r.document_id,source:r.source,sourceRef:r.source_ref,sourceVersion:r.source_version,observedReplacement:r.observed_replacement,
 docClass:r.doc_class,formType:r.form_type,title:r.title,language:r.language,sourceUrl:r.source_url,contentSha256:r.content_sha256,bytes:r.bytes,mime:r.mime,
 publishedAt:r.published_at,publishedAtPrecision:r.published_at_precision,availableAt:r.available_at,availableDate:r.available_date,fiscalYear:r.fiscal_year,fiscalPeriod:r.fiscal_period,
 periodEnd:r.period_end,filingSourceRef:r.filing_source_ref,status:r.status,currentExtractionId:r.current_extraction_id});
export const assetView=(a:AssetRow)=>({role:a.role,filename:a.filename,sourceUrl:a.source_url,contentSha256:a.content_sha256,bytes:a.bytes,mime:a.mime});
export const extractionView=(e:ExtractionRow)=>({extractionId:e.extraction_id,extractorVersion:e.extractor_version,tableAlgoVersion:e.table_algo_version,pageCount:e.page_count,hasTextLayer:e.has_text_layer,createdAt:e.created_at});
const lineView=(l:LayoutLine)=>({index:l.index,y:l.y,x0:l.x0,x1:l.x1,text:l.text,charStart:l.char_start,charEnd:l.char_end});
const tableView=(t:LayoutTable)=>({headerLines:t.header_lines.map(lineView),rowCount:t.row_count,colCount:t.col_count,colX0:t.col_x0,
 cells:t.cells.map(c=>({row:c.row,col:c.col,text:c.text,bbox:c.bbox,lineIndex:c.line_index,charStart:c.char_start,charEnd:c.char_end,numeric:c.numeric}))});

/** Ticker → issuer by today's ownership, every market (US, CN, HK); the echoed ticker is the matching security row. Throws 'ambiguous_owner' through. */
export async function resolveDocIssuer(tables:TableClient,rawTicker:string,today:string):Promise<{issuerId:string;ticker:string}|null>{
 const given=rawTicker.trim().toUpperCase().replace(/\//g,'.');
 const r=await resolveIssuer(tables,{ticker:given},{today});
 if(!r)return null;
 const core=inferCoreMarket(given);
 const normalised=core?normalizeSecurityTicker(given,core):null;
 const hit=r.securities.find(x=>x.ticker.toUpperCase()===given)??(normalised?r.securities.find(x=>x.ticker.toUpperCase()===normalised):undefined);
 if(hit)return {issuerId:r.issuer_id,ticker:hit.ticker};
 // merged issuer: resolveIssuer returned the target's securities; read the source row (first form with rows is authoritative)
 for(const t of normalised&&normalised!==given?[given,normalised]:[given]){
  const rows=await tables.select('issuer_securities',{ticker:t});
  if(rows.length===0)continue;
  return rows.some(x=>isCurrentSecurity(x,today))?{issuerId:r.issuer_id,ticker:t}:null;
 }
 return null;
}

/** Anon (RLS) clients for the public branch. */
export function publicDocs():{tables:TableClient;db:DocumentsDb}{
 const sb=getAnonSupabase();
 return {tables:supabaseTableClient(sb),db:supabaseDocumentsDb(sb)};
}
/** Service-role object store: the bucket is private; only the server reads pages.json or signs URLs. */
export const serviceStore=():ObjectStore=>supabaseObjectStore(getAdminSupabase());

/** Supabase session user id, or null (no session / auth error). next/headers is imported lazily. */
export async function sessionUserId():Promise<string|null>{
 const {getServerSupabase}=await import('../supabase/server');
 const sb=await getServerSupabase();
 const {data,error}=await sb.auth.getUser();
 return error||!data.user?null:data.user.id;
}

/** The version that superseded this one: the first visible version above source_version (one keyset read, limit 1); it is the successor only if it is exactly +1. */
async function supersededBy(db:DocumentsDb,row:DocumentRow):Promise<string|null>{
 const page=await db.documentVersions(row.source,row.source_ref,{cursor:encodeCursor([row.source_version]),limit:1});
 const next=page.rows[0];
 return next&&next.source_version===row.source_version+1?next.document_id:null;
}

/** GET /api/documents/doc/[id] body for a row already visible to the caller through db. */
export async function docDetail(db:DocumentsDb,row:DocumentRow,extractionsCursor:string|null){
 const [assets,extractions,next]=await Promise.all([db.assetsOf(row.document_id),db.extractionsOf(row.document_id,{cursor:extractionsCursor,limit:EXTRACTIONS_PAGE}),supersededBy(db,row)]);
 return {extractorVersion:EXTRACTOR_VERSION,classifierGen:CLASSIFIER_GEN,document:publicDocumentView(row),assets:assets.map(assetView),
  extractions:{rows:extractions.rows.map(extractionView),nextCursor:extractions.nextCursor},supersedes:row.supersedes_document_id,supersededBy:next};
}

/**
 * GET /api/documents/doc/[id]/pages/[n] body, or null when the extraction (default: current) does not
 * belong to the document or the page does not exist. layout=1 reads the extraction's pages.json from
 * the private bucket, checks its sha256 against the extraction row (mismatch → Error('pages_json_corrupt'))
 * and returns that page's lines and tables in camelCase (offsets are code points of `text`).
 */
export async function pageDetail(db:DocumentsDb,store:ObjectStore,row:DocumentRow,pageNo:number,extractionParam:string|null,layout:boolean){
 const extractionId=extractionParam??row.current_extraction_id;
 if(!extractionId)return null;
 const ex=await db.extractionById(extractionId);
 if(!ex||ex.document_id!==row.document_id)return null;
 const [page]=await db.pagesOf(ex.extraction_id,[pageNo]);
 if(!page)return null;
 const body={documentId:row.document_id,extractionId:ex.extraction_id,pageNo:page.page_no,text:page.text,textHash:page.text_hash,charCount:page.char_count,width:page.width,height:page.height};
 if(!layout)return body;
 const bytes=await store.get(ex.pages_json_path);
 if(sha256Hex(bytes)!==ex.pages_json_sha256)throw new Error('pages_json_corrupt');
 const json=JSON.parse(new TextDecoder().decode(bytes)) as PagesJson;
 const pl=json.pages.find(p=>p.page_no===pageNo);
 if(!pl||pl.text!==page.text||cpLength(pl.text)!==page.char_count)throw new Error('pages_json_corrupt');
 return {...body,lines:pl.lines.map(lineView),tables:pl.tables.map(tableView)};
}

// ── Owner branch (Task 12, spec §8.2): session → owner check → service read → audit → private, no-store ──
/** Service-role db + research_audit_log writer for readOwnedDocument (audit scoped to the owner, who is the requester). */
export function ownerReadDeps():OwnerReadDeps{
 const admin=getAdminSupabase();
 return {db:supabaseDocumentsDb(admin),audit:(userId,action,objectId,detail)=>audit({supabase:admin as unknown as ResearchSupabase,userId},action,objectId,detail)};
}
/** The owner sees the permission and licence reference of their own document as well. */
export const ownerDocumentView=(r:DocumentRow)=>({...publicDocumentView(r),permission:r.permission,licenseRef:r.license_ref});
export const auditFailedResponse=()=>errorResponse('audit_failed','audit failed',500);
