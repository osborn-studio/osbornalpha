// GET one licence; PATCH its material terms with DB versioning (spec §4.1, §8.2).
import {adminGet,adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {getLicenceOr404,parseLicenceInput,patchLicence} from '@/lib/broker-research/licences';

export const dynamic='force-dynamic';
interface Ctx{params:Promise<{licenceId:string}>}
export const GET=adminGet<Ctx>('licences.get',async({ctx})=>jsonNoStore({licence:await getLicenceOr404(coreDeps(),uuidParam((await ctx.params).licenceId))}));
export const PATCH=adminPost<Ctx>('licences.patch',async({ctx,body,userId})=>{
 const id=uuidParam((await ctx.params).licenceId);
 return jsonNoStore(await patchLicence(coreDeps(),id,parseLicenceInput(body,'patch'),userId));
});
