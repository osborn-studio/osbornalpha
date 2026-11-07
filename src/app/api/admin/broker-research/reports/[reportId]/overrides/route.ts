// Human resolution override, followed by rules on materialized targets (spec §4.5).
import {TICKER_RE} from '@/lib/facts/public-route';
import {adminPost,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
import {setOverride} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.override',async({ctx,body,userId})=>{const securityTicker=strField(body,'securityTicker',{max:24});if(!TICKER_RE.test(securityTicker))throw bad('invalid_parameter:securityTicker');return jsonNoStore(await setOverride(brokerDeps(),uuidParam((await ctx.params).reportId),{targetKey:strField(body,'targetKey',{max:64}),securityTicker,note:strField(body,'note',{max:500,optional:true})??null},userId));});
