// src/lib/documents/candidates/admin-http.ts
// Shared conventions of the F3 admin routes (spec §9), copied from /api/admin/dq/quarantine/[id]:
// a write must be JSON (415) and a browser-sent Origin must be ours (403); bodies are
// {error:<code>}; every response is private, no-store (it answers a signed-in admin); the admin
// guard's AdminUnauthenticated / AdminForbidden map to 401 / 403, anything else to a logged 500.
// auditBestEffort writes research_audit_log like the dq route: the decision is committed already,
// so an audit failure is logged rather than turned into a 500 that would invite a retry.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated} from '../../admin/auth';
import {audit} from '../../research/store';
import type {ResearchSupabase} from '../../research/store';

export const PRIVATE_NO_STORE={'Cache-Control':'private, no-store'} as const;
export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:PRIVATE_NO_STORE});
export const jsonError=(error:string,status:number)=>json({error},status);
/** null = the request may proceed. */
export function writeGuard(request:Request):NextResponse|null{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))return jsonError('unsupported_media_type',415);
 const origin=request.headers.get('origin');
 if(origin!==null&&origin!==new URL(request.url).origin)return jsonError('forbidden_origin',403);
 return null;
}
export function adminFailure(e:unknown,tag:string):NextResponse{
 if(e instanceof AdminUnauthenticated)return jsonError('authentication required',401);
 if(e instanceof AdminForbidden)return jsonError('admin role required',403);
 console.error(`[${tag}]`,e instanceof Error?e.message:e);
 return jsonError('unavailable',500);
}
export async function auditBestEffort(admin:unknown,userId:string,action:string,objectId:string|null,detail:Record<string,unknown>):Promise<void>{
 try{await audit({supabase:admin as ResearchSupabase,userId},action,objectId,detail);}
 catch(e){console.error('[admin/documents] audit failed',e instanceof Error?e.message:e);}
}
