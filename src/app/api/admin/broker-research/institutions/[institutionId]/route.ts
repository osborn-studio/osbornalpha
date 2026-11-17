// Admin institution detail, including scales and analysts (spec §8.2; D6).
import {adminGet,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {institutionOr404} from '@/lib/broker-research/institutions';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{institutionId:string}>}
export const GET=adminGet<Ctx>('institutions.get',async({ctx})=>{
 const deps=coreDeps(),id=uuidParam((await ctx.params).institutionId,'institutionId');
 const institution=await institutionOr404(deps,id);
 const [scales,analysts]=await Promise.all([deps.db.listRatingScales(id),deps.db.listAnalysts(id)]);
 return jsonNoStore({institution,scales,analysts});
});
