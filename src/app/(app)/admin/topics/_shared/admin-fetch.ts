// Topic plan T5.4: client-safe JSON transport.
export const ADMIN_API='/api/admin/topics';
export type ApiResult<T>={ok:true;status:number;data:T}|{ok:false;status:number;code:string;body:unknown};
export function errorCode(body:unknown,status:number):string{
 const c=(body as {error?:{code?:unknown}}|null)?.error?.code;return typeof c==='string'&&c.length>0?c:`http_${status}`;
}
export const baseCode=(code:string)=>code.split(':')[0];
export async function adminJson<T=unknown>(method:'GET'|'POST'|'PUT',path:string,body?:unknown):Promise<ApiResult<T>>{
 const write=method!=='GET';
 let res:Response;
 try{res=await fetch(`${ADMIN_API}${path}`,{method,cache:'no-store',...(write?{headers:{'content-type':'application/json'},body:JSON.stringify(body??{})}:{})});}
 catch{return {ok:false,status:0,code:'network_error',body:null};}
 const json=await res.json().catch(()=>null);
 return res.ok?{ok:true,status:res.status,data:json as T}:{ok:false,status:res.status,code:errorCode(json,res.status),body:json};
}

