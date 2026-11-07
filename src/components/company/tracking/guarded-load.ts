// Request-generation guard for the company tracking view (计划第 3 轮审计 R7). Every load supersedes the
// earlier ones; a scope change (issuerId/ticker/market/asOf/watching) or unmount invalidates all of them.
// Only the current generation may write rows, cursor, error or the loading flag.
export class LoadGenerations{
 private gen=0;
 /** Scope change or unmount: every in-flight load becomes stale. */
 invalidate():number{return ++this.gen;}
 /** A new load: supersedes every earlier one. */
 begin():number{return ++this.gen;}
 /** Capture without superseding (e.g. mark-read writes). */
 peek():number{return this.gen;}
 isCurrent(g:number):boolean{return g===this.gen;}
}
export interface PageResult<T>{rows:T[];nextCursor:string|null}
export interface LoadSink<T>{setLoading(v:boolean):void;page(from:string|null,r:PageResult<T>):void;fail(code:string):void}
export async function guardedLoad<T>(gens:LoadGenerations,from:string|null,fetchPage:(from:string|null)=>Promise<PageResult<T>>,sink:LoadSink<T>,codeOf:(e:unknown)=>string):Promise<void>{
 const g=gens.begin();
 sink.setLoading(true);
 try{const r=await fetchPage(from);if(gens.isCurrent(g))sink.page(from,r);}
 catch(e){if(gens.isCurrent(g))sink.fail(codeOf(e));}
 finally{if(gens.isCurrent(g))sink.setLoading(false);}
}
