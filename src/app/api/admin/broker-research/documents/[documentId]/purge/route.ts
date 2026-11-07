// Resume incomplete purge steps (spec §6.5).
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {purgeDocument} from '@/lib/broker-research/withdraw';
export const dynamic='force-dynamic';export const maxDuration=300;interface Ctx{params:Promise<{documentId:string}>}
export const POST=adminPost<Ctx>('documents.purge',async({ctx,userId})=>jsonNoStore(await purgeDocument(coreDeps(),uuidParam((await ctx.params).documentId),userId)));
