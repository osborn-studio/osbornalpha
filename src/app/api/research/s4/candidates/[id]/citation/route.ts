import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {citation} from '@/lib/research/s4/read';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return s4Http(async()=>{const actor=await requireS4Actor(req),q=new URL(req.url).searchParams;return citation(actor,(await ctx.params).id,q.get('cardId')||'',Number(q.get('index')));});}
