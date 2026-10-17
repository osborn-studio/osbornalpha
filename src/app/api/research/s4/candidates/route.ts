import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http,bodyText} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {listRegisteredCandidates} from '@/lib/research/s4/registered-list';
import {fail} from '@/lib/research/ingest/pa-v1/json.js';
import {importRegisteredCandidate} from '@/lib/research/s4/import';
export async function GET(req:Request){return s4Http(async()=>{
 const actor=await requireS4Actor(req),query=new URL(req.url).searchParams;
 if(req.url.length>2048||Array.from(query.keys()).some(key=>!['limit','createdAt','id'].includes(key)||query.getAll(key).length!==1))fail('invalid_schema');
 const limit=query.get('limit')??'20';
 if(!/^[1-9][0-9]{0,2}$/.test(limit)||query.has('createdAt')!==query.has('id'))fail('invalid_schema');
 return listRegisteredCandidates(actor,Number(limit),query.has('id')?{createdAt:query.get('createdAt')!,id:query.get('id')!}:undefined);
});}
export async function POST(req:Request){return s4Http(async()=>importRegisteredCandidate(await requireS4Actor(req),await bodyText(req)));}
