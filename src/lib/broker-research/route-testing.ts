// Shared assertions for broker research admin route tests (spec §12.1); imported only by tests.
import {expect,it} from 'vitest';
import {AdminForbidden,AdminUnauthenticated} from '../admin/auth';

export const ORIGIN='https://alpha.example';
export const jsonReq=(path:string,body:unknown,init:{method?:string;headers?:Record<string,string>}={})=>
 new Request(`${ORIGIN}${path}`,{method:init.method??'POST',headers:{'content-type':'application/json',...init.headers},body:JSON.stringify(body)});
export const getReq=(path:string)=>new Request(`${ORIGIN}${path}`);
export const bodyOf=async<T=Record<string,unknown>>(res:Response):Promise<T>=>(await res.json()) as T;
export const errCode=async(res:Response)=>(await bodyOf<{error:{code:string}}>(res)).error.code;
export const ctxOf=<P extends Record<string,string>>(p:P)=>({params:Promise.resolve(p)});
interface GuardOpts{call:(r:Request)=>Promise<Response>;request:()=>Request;requireAdmin:{mockRejectedValueOnce(e:unknown):unknown};post:boolean}
export function adminGuardCases(o:GuardOpts):void{
 const noStore=(r:Response)=>expect(r.headers.get('cache-control')).toBe('no-store');
 it('401 without a session (no-store)',async()=>{o.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));const r=await o.call(o.request());expect(r.status).toBe(401);noStore(r);});
 it('403 for a signed-in non-admin',async()=>{o.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));const r=await o.call(o.request());expect(r.status).toBe(403);expect(await errCode(r)).toBe('admin_required');});
 if(!o.post)return;
 it('415 for a non-JSON content type',async()=>{const base=o.request();const r=await o.call(new Request(base.url,{method:base.method,headers:{'content-type':'text/plain'},body:'{}'}));expect(r.status).toBe(415);noStore(r);});
 it('403 for a foreign Origin',async()=>{const base=o.request(),body=await base.text();const r=await o.call(new Request(base.url,{method:base.method,headers:{'content-type':'application/json',origin:'https://evil.example'},body}));expect(r.status).toBe(403);expect(await errCode(r)).toBe('forbidden_origin');});
}
