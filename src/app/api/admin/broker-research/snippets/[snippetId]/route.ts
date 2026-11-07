// Approve or reject a private snippet after a current disclosure check (spec §4.7).
import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {approveSnippet,rejectSnippet} from '@/lib/broker-research/snippets';
export const dynamic='force-dynamic';interface Ctx{params:Promise<{snippetId:string}>}
export const POST=adminPost<Ctx>('snippets.action',async({ctx,body,userId})=>{const id=uuidParam((await ctx.params).snippetId),action=enumField(body,'action',['approve','reject'] as const);await (action==='approve'?approveSnippet:rejectSnippet)(brokerDeps(),id,userId);return jsonNoStore({snippetId:id,status:action==='approve'?'approved':'rejected'});});
