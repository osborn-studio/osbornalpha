// Approve or reject an independent summary (spec §4.7).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {approveSummary,rejectSummary} from '@/lib/broker-research/summary/run';
export const dynamic='force-dynamic';interface Ctx{params:Promise<{summaryId:string}>}
export const POST=adminPost<Ctx>('summaries.action',async({ctx,body,userId})=>{const id=uuidParam((await ctx.params).summaryId);if(enumField(body,'action',['approve','reject'] as const)==='approve')return jsonNoStore({summary:await approveSummary(brokerDeps(),id,userId)});await rejectSummary(brokerDeps(),id,userId);return jsonNoStore({summaryId:id,status:'rejected'});});
