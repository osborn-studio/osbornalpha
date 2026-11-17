// Audited analyst upsert; public_display defaults false (spec §4.9; D6).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {upsertAnalyst} from '@/lib/broker-research/institutions';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{institutionId:string}>}
export const POST=adminPost<Ctx>('institutions.analyst_upsert',async({ctx,body,userId})=>
 jsonNoStore({analystId:await upsertAnalyst(coreDeps(),uuidParam((await ctx.params).institutionId,'institutionId'),body,userId)},201));
