import { NextResponse } from 'next/server';
import {getFeishuAccountConfig, hasFeishuAccountToken, sourceKey} from '@/lib/feishu/integration-auth';
import {isUuid} from '@/lib/portfolio/validate';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {readFormalOverview, validFormalSections} from '../../../../../../integrations/feishu/feishu-formal-read.mjs';

export const dynamic='force-dynamic';
const json=(body:Record<string,string>,status:number)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store',vary:'Authorization'}});

export async function GET(request:Request){
  if(process.env.FEISHU_SIMULATION_INGEST_ENABLED!=='true')return json({error:'not_found'},404);
  const config=getFeishuAccountConfig();
  if(!config)return json({error:'integration_unavailable'},503);
  if(!hasFeishuAccountToken(request,config.token))return json({error:'unauthorized'},401);
  const params=new URL(request.url).searchParams;
  const owner=params.get('owner'),analyst=params.get('analyst'),sections=(params.get('sections')??'').split(',');
  if([...params.keys()].some(key=>!['owner','analyst','sections'].includes(key)||params.getAll(key).length!==1)||
    !isUuid(owner)||!validFormalSections(sections)||(analyst!==null&&!sourceKey.test(analyst)))return json({error:'invalid_scope'},400);
  if(owner.toLowerCase()!==config.ownerId)return json({error:'owner_mismatch'},403);
  const analystId=analyst===null?null:config.analysts.get(analyst);
  if(analystId===undefined||config.analysts.size===0)return json({error:'analyst_unavailable'},403);
  try{
    const text=await readFormalOverview(getAdminSupabase((input,init)=>fetch(input,{...init,cache:'no-store'})),{
      ownerId:config.ownerId,analystId,boundAnalystIds:[...config.analysts.values()],sections,
    });
    return json({text},200);
  }catch{return json({error:'query_unavailable'},503);}
}
