// Private page text; text_viewed is logged before response (spec §8.2).
import {adminGet,respondLogged,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {bad} from '@/lib/broker-research/errors';
import {pageText} from '@/lib/broker-research/review';
export const dynamic='force-dynamic';
interface Ctx{params:Promise<{documentId:string;n:string}>}
export const GET=adminGet<Ctx>('documents.page',async({ctx,userId})=>{const p=await ctx.params;if(!/^[1-9]\d{0,4}$/.test(p.n))throw bad('invalid_parameter:n');const deps=brokerDeps(),{payload,log}=await pageText(deps,uuidParam(p.documentId),Number(p.n));return respondLogged(deps.db,{...log,user_id:userId},payload);});
