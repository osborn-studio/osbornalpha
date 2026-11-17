// Insert an immutable rating-scale row; changes require close + insert (spec §4.5; D6).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {addScale} from '@/lib/broker-research/institutions';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{institutionId:string}>}
export const POST=adminPost<Ctx>('institutions.scale_insert',async({ctx,body,userId})=>
 jsonNoStore({scaleId:await addScale(coreDeps(),uuidParam((await ctx.params).institutionId,'institutionId'),body,userId)},201));
