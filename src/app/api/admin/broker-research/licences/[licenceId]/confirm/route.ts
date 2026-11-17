// POST confirms exactly one licence version (spec §4.1, §8.2).
import {adminPost,intField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {confirmLicence} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{licenceId:string}>}
export const POST=adminPost<Ctx>('licences.confirm',async({ctx,body,userId})=>
 jsonNoStore({licence:await confirmLicence(coreDeps(),uuidParam((await ctx.params).licenceId),intField(body,'version',1,1_000_000),userId)}));
