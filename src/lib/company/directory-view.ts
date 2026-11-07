// Browser-safe pure helpers of the coverage directory view (spec §8): q validation, the query key a
// response is bound to, which state to render for the CURRENT key, and the displayed name. No server imports.
/** Letters, digits, space, '.', '-' only: PostgREST or/ilike syntax characters never reach the filter. */
export const DIRECTORY_Q_RE=/^[\p{L}\p{N} .\-]{1,24}$/u;

export type QueryState='empty'|'valid'|'invalid';
/** The trimmed q as the API will see it: '' sends no q; anything else must match DIRECTORY_Q_RE (no request when invalid). */
export const qStateOf=(q:string):QueryState=>{const s=q.trim();return s===''?'empty':DIRECTORY_Q_RE.test(s)?'valid':'invalid';};

export const queryKeyOf=(o:{q:string;market:string;sort:string;page:number}):string=>JSON.stringify([o.q.trim(),o.market,o.sort,o.page]);

export type DirectoryView<D>={status:'ready';data:D}|{status:'error';code:string}|{status:'loading'};
/** Rows, totals and pagination belong to the query key of the response that produced them; a different current key is loading (or that key's own error). */
export function viewOf<D>(currentKey:string,ok:{key:string;data:D}|null,err:{key:string;code:string}|null):DirectoryView<D>{
 if(ok&&ok.key===currentKey)return {status:'ready',data:ok.data};
 if(err&&err.key===currentKey)return {status:'error',code:err.code};
 return {status:'loading'};
}

/** company_list_coverage sorts `name` by coalesce(canonical_name_en, canonical_name_zh): show exactly that name under that sort, else the locale's name. */
export function displayName(r:{names:{zh:string|null;en:string|null};primaryTicker:string|null;issuerId:string},locale:'zh'|'en',sort:string):string{
 const {zh,en}=r.names;
 const n=sort==='name'?(en??zh):locale==='en'?(en??zh):(zh??en);
 return n??r.primaryTicker??r.issuerId;
}

/** Only the citation counts that exist for the stream: US has edgar links, CN has linked/pending PDF citations. */
export function citationParts(market:'US'|'CN',c:{linked:number;pending:number;edgar:number}):{key:'linked'|'pending'|'edgar';n:number}[]{
 return market==='US'?[{key:'edgar',n:c.edgar}]:[{key:'linked',n:c.linked},{key:'pending',n:c.pending}];
}
