// Topic public route and cache boundary (spec §6, §9).
import {NextResponse} from 'next/server';
import {requireSessionUser} from '@/lib/macro/route-helpers';
import {errorResponse,failureResponse,paramErrorResponse} from '@/lib/facts/public-route';
import {topicsEnabled} from './flags';
import {TopicError} from './errors';
export const jsonNoStore=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function topicRoute<C>(tag:string,fn:(a:{request:Request;ctx:C;userId:string})=>Promise<Response>){
 return async(request:Request,ctx:C):Promise<Response>=>{
  let response:Response;
  try{
   const session=await requireSessionUser();
   if(!session.ok)response=session.response;
   else if(!topicsEnabled())response=errorResponse('topics_disabled','not found',404);
   else response=await fn({request,ctx,userId:session.user.id});
  }catch(e){
   if(e instanceof TopicError)response=e.detail===null?errorResponse(e.code,e.code,e.status):jsonNoStore({error:{code:e.code,message:e.code},meta:e.detail},e.status);
   else response=paramErrorResponse(e)??failureResponse(e,tag,'topics unavailable');
  }
  const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 };
}
