// Close a scale belonging to this institution (spec §4.5; D6).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {closeScale} from '@/lib/broker-research/institutions';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{institutionId:string;scaleId:string}>}
export const POST=adminPost<Ctx>('institutions.scale_close',async({ctx,body,userId})=>{
 const p=await ctx.params;
 await closeScale(coreDeps(),uuidParam(p.institutionId,'institutionId'),uuidParam(p.scaleId,'scaleId'),body,userId);
 return jsonNoStore({ok:true});
});
