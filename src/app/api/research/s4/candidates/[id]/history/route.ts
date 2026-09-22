import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {reviewHistory} from '@/lib/research/s4/read';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return s4Http(async()=>reviewHistory(await requireS4Actor(req),(await ctx.params).id));}
