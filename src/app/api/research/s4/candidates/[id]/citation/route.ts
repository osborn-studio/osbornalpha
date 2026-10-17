import {requireS4Actor} from '@/lib/research/s4/auth';
import {fail} from '@/lib/research/ingest/pa-v1/json.js';
import {s4Http} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {registeredCitation} from '@/lib/research/s4/read';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return s4Http(async()=>{const actor=await requireS4Actor(req),q=new URL(req.url).searchParams;if(req.url.length>2048||Array.from(q.keys()).some(key=>!['cardId','index'].includes(key)||q.getAll(key).length!==1)||!q.has('cardId')||!q.has('index')||! /^[0-7]$/.test(q.get('index')!))fail('invalid_schema');return registeredCitation(actor,(await ctx.params).id,q.get('cardId')||'',Number(q.get('index')));});}
