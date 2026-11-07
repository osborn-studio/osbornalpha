// ★ Issue a 600-second private PDF URL only after a durable access log write (spec §8.2).
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {signedReadUrl} from '@/lib/broker-research/upload';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{documentId:string}>}
export const GET=adminGet<Ctx>('documents.url',async({ctx,userId})=>{
 const deps=coreDeps(),{payload,log}=await signedReadUrl(deps,uuidParam((await ctx.params).documentId),userId);
 return respondLogged(deps.db,log,payload);
});
