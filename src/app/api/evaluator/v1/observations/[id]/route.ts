import {evaluatorRpc} from '@/lib/research/s6/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return evaluatorRpc(req,'observation',(await ctx.params).id);}
