// Publish through the sole SQL publish RPC and its blockers (spec §6.5).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {publishReport} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.publish',async({ctx,userId})=>jsonNoStore(await publishReport(brokerDeps(),uuidParam((await ctx.params).reportId),userId)));
