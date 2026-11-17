// Generate a licensed independent summary (spec §6.4).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {runSummary} from '@/lib/broker-research/summary/run';
export const dynamic='force-dynamic';export const maxDuration=300;
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.summary',async({ctx,body,userId})=>jsonNoStore(await runSummary(brokerDeps(),uuidParam((await ctx.params).reportId),enumField(body,'lang',['zh','en'] as const),userId,{deadline:deadlineFrom(new Date())}),201));
