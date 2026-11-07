// Create a draft from a private server-side page slice (spec §4.7).
import {adminPost,enumField,intField,jsonNoStore,strField,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps} from '@/lib/broker-research/deps';
import {PURPOSES,createSnippet} from '@/lib/broker-research/snippets';
export const dynamic='force-dynamic';interface Ctx{params:Promise<{reportId:string}>}
export const POST=adminPost<Ctx>('reports.snippet_create',async({ctx,body,userId})=>jsonNoStore(await createSnippet(brokerDeps(),uuidParam((await ctx.params).reportId),{purpose:enumField(body,'purpose',PURPOSES),targetKey:strField(body,'targetKey',{max:64,optional:true})??null,fieldId:body.fieldId===undefined||body.fieldId===null?null:uuidParam(body.fieldId,'fieldId'),page:intField(body,'page',1,99999),charStart:intField(body,'charStart',0,10_000_000),charEnd:intField(body,'charEnd',1,10_000_000),text:strField(body,'text',{max:500,optional:true})},userId),201));
