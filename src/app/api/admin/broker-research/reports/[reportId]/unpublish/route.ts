// Unpublish and record the reason; SQL closes snapshot and enqueues retraction (spec §6.5).
import {adminPost,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {unpublishReport} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.unpublish',async({ctx,body,userId})=>jsonNoStore({report:await unpublishReport(brokerDeps(),uuidParam((await ctx.params).reportId),strField(body,'reason',{max:500}),userId)}));
