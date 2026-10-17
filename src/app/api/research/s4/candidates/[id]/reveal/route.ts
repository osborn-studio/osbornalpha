import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http,bodyJson} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {revealRegisteredCards} from '@/lib/research/s4/cards';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return s4Http(async()=>revealRegisteredCards(await requireS4Actor(req),(await ctx.params).id,await bodyJson(req)));}
