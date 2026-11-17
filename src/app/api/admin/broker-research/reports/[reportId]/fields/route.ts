// Human-added, verbatim evidence row (spec §6.3).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {addField,parseAddInput} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.field_add',async({ctx,body,userId})=>jsonNoStore(await addField(brokerDeps(),uuidParam((await ctx.params).reportId),parseAddInput(body),userId),201));
