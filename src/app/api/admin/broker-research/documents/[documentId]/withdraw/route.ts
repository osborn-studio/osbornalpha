// Withdraw a document and optionally start its durable purge (spec §6.5).
import {adminPost,boolField,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {withdrawDocument} from '@/lib/broker-research/withdraw';
export const dynamic='force-dynamic';export const maxDuration=300;interface Ctx{params:Promise<{documentId:string}>}
export const POST=adminPost<Ctx>('documents.withdraw',async({ctx,body,userId})=>jsonNoStore(await withdrawDocument(coreDeps(),uuidParam((await ctx.params).documentId),{reason:strField(body,'reason',{max:500}),purge:boolField(body,'purge',false)},userId)));
