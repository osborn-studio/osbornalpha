// Review one evidence row (spec §6.3); the service verifies framed spans.
import {adminPost,enumField,jsonNoStore,objField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {fieldAction} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string;fieldId:string}>}
export const POST=adminPost<Ctx>('reports.field_action',async({ctx,body,userId})=>{const p=await ctx.params;return jsonNoStore(await fieldAction(brokerDeps(),uuidParam(p.reportId),uuidParam(p.fieldId,'fieldId'),enumField(body,'action',['confirm','correct','reject','absent'] as const),objField(body,'payload'),userId));});
