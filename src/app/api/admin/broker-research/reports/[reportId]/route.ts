// Private review payload; access is logged before spans or source text leave the server (spec §8.2).
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {reviewData} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const GET=adminGet<Ctx>('reports.get',async({ctx,userId})=>{const deps=brokerDeps(),{payload,log}=await reviewData(deps,uuidParam((await ctx.params).reportId));return respondLogged(deps.db,{...log,user_id:userId},payload);});
