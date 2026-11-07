// Translate a private research report title (spec §6.4).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {translateTitle} from '@/lib/broker-research/summary/run';
export const dynamic='force-dynamic';export const maxDuration=300;
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.translate',async({ctx,userId})=>jsonNoStore(await translateTitle(brokerDeps(),uuidParam((await ctx.params).reportId),userId,{deadline:deadlineFrom(new Date())})));
