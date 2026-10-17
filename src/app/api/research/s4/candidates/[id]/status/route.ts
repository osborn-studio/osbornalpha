import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http} from '@/lib/research/s4/http';
import {registeredCandidateStatus} from '@/lib/research/s4/read';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return s4Http(async()=>registeredCandidateStatus(await requireS4Actor(req),(await ctx.params).id));}
