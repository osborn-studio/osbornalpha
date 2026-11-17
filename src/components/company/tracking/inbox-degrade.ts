// Client fallback: probe the first batch before putting any further load on a failing service.
export type IssuerResult<T>={state:'ok';rows:T[]}|{state:'unavailable';code:string};
export type InboxProbe<T>={status:'unavailable';code:string}|{status:'ok'|'partial';perIssuer:Map<string,IssuerResult<T>>};
export async function probeInboxPerIssuer<T>({issuerIds,fetchOne,concurrency=4}:{issuerIds:readonly string[];fetchOne:(issuerId:string)=>Promise<T[]>;concurrency?:number}):Promise<InboxProbe<T>> {
  const bound=Number.isFinite(concurrency)?Math.max(1,Math.floor(concurrency)):4;
  const ids=[...new Set(issuerIds)];
  const results=new Map<string,IssuerResult<T>>();
  const fetchIssuer=async(id:string)=>{
    try{results.set(id,{state:'ok',rows:await fetchOne(id)});}
    catch(e){results.set(id,{state:'unavailable',code:typeof e==='object'&&e!==null&&'code' in e&&typeof e.code==='string'?e.code:'internal'});}
  };
  await Promise.all(ids.slice(0,bound).map(fetchIssuer));
  const first=results.get(ids[0]);
  if(first?.state==='unavailable'&&[...results.values()].every(r=>r.state==='unavailable'))return {status:'unavailable',code:first.code};
  let next=bound;
  await Promise.all(Array.from({length:Math.min(bound,Math.max(0,ids.length-bound))},async()=>{
    while(next<ids.length){const id=ids[next++];await fetchIssuer(id);}
  }));
  const perIssuer=new Map(ids.map(id=>[id,results.get(id)!]));
  return {status:[...perIssuer.values()].some(r=>r.state==='unavailable')?'partial':'ok',perIssuer};
}
export function mergeInboxRows<T extends {firstSeenAt:string|null;eventId:string}>(perIssuer:Map<string,IssuerResult<T>>):T[] {
  return [...perIssuer.values()].flatMap(r=>r.state==='ok'?r.rows:[]).sort((a,b)=>a.firstSeenAt===b.firstSeenAt?(a.eventId<b.eventId?1:a.eventId>b.eventId?-1:0):(a.firstSeenAt===null?1:b.firstSeenAt===null?-1:a.firstSeenAt<b.firstSeenAt?1:-1));
}

export interface InboxFailure {generation:number;scope:string;cursor:string|null;issuer:string|null;probeStarted:boolean}
export function shouldProbeNow({failure,generation,scope,activeWatchCount}:{failure:InboxFailure|null;generation:number;scope:string;activeWatchCount:number}):boolean {
  return !!failure && failure.generation===generation && failure.scope===scope && failure.cursor===null && failure.issuer===null && !failure.probeStarted && activeWatchCount>0;
}
