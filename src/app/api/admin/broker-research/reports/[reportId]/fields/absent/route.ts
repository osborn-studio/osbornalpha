// Record explicit absence for fields that can be absent (spec §6.3).
import {adminPost,enumField,intField,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {markAbsent} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.field_absent',async({ctx,body,userId})=>jsonNoStore(await markAbsent(brokerDeps(),uuidParam((await ctx.params).reportId),{field:enumField(body,'field',['rating','target_price','analyst','target_horizon'] as const),targetKey:strField(body,'targetKey',{max:64,optional:true})??null,page:intField(body,'page',1,99999)},userId),201));
