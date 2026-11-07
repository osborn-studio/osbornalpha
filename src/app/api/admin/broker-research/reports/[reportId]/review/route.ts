// Review status transition; approval requires readiness (spec §6.3).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {reviewAction} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.review',async({ctx,body,userId})=>jsonNoStore({report:await reviewAction(brokerDeps(),uuidParam((await ctx.params).reportId),enumField(body,'action',['start','approve','reject'] as const),userId)}));
