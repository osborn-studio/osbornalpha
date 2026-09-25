import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http,bodyJson} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {submitDecision} from '@/lib/research/s4/decisions';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return s4Http(async()=>submitDecision(await requireS4Actor(req),(await ctx.params).id,await bodyJson(req)));}
