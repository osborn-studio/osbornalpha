import Ajv from 'ajv';
import {fenceEvaluationIntents} from '@/lib/research/s6/intent-fence';
import {resolveEvaluationIntent} from '@/lib/research/s6/intent';
import {digest} from '@/lib/research/ingest/pa-v1/json';
import {registeredObservationTransaction} from '@/lib/research/s6/registered';
import {requireS4Actor} from '@/lib/research/s4/auth';
import {bodyJson} from '@/lib/research/s4/http';
import {s6Http} from '@/lib/research/s6/http';
import {registeredObservationReport,prepareRegisteredEvaluationDisplay} from '@/lib/research/s6/report';
import {prepareRegisteredInput,makeCommit,createRegisteredS6Store} from '@/lib/research/s6/store';
import {fail} from '@/lib/research/ingest/pa-v1/json';
const valid=new Ajv({strict:true}).compile({oneOf:[
 {type:'object',additionalProperties:false,required:['action','key'],properties:{action:{const:'fence-intents'},key:{type:'string',pattern:'^[A-Za-z0-9:_-]{8,100}$'}}},
 {type:'object',additionalProperties:false,required:['action','key'],properties:{action:{const:'resolve-intent'},key:{type:'string',pattern:'^[A-Za-z0-9._:-]{1,128}$'}}},
 {type:'object',additionalProperties:false,required:['action'],properties:{action:{enum:['read','prepare','journal-context']}}},
 {type:'object',additionalProperties:false,required:['action','evaluationId'],properties:{action:{const:'replay'},evaluationId:{type:'string',pattern:'^[0-9a-f-]{36}$'}}},
 {type:'object',additionalProperties:false,required:['action','asOf','key','revision','marketIds'],properties:{action:{const:'evaluate'},asOf:{type:'string',maxLength:40},key:{type:'string',pattern:'^[A-Za-z0-9:_-]{8,128}$'},revision:{type:'integer',minimum:0},marketIds:{type:'array',maxItems:2,items:{type:'string',maxLength:128}}}},
]});
export const runtime='nodejs';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 return s6Http(async()=>{
  const actor=await requireS4Actor(req),body=await bodyJson(req),{id}=await ctx.params;
  if(!valid(body))fail('invalid_schema');
  if(body.action==='journal-context')return registeredObservationTransaction(actor,id,async()=>({journalScope:digest(['alpha-evaluation-intent/v1',actor.userId,id])}));
  if(body.action==='fence-intents')return {...await fenceEvaluationIntents(actor,id,body.key),observationId:id,journalScope:digest(['alpha-evaluation-intent/v1',actor.userId,id])};
  if(body.action==='resolve-intent')return resolveEvaluationIntent(actor,id,body.key);
  if(body.action==='prepare')return prepareRegisteredEvaluationDisplay(actor,id);
  if(body.action==='evaluate'){
   const input=await prepareRegisteredInput(actor,id,body.marketIds,body.asOf);
   return createRegisteredS6Store(actor).commitEvaluationResult(makeCommit(input,body.key,body.revision));
  }
  return registeredObservationReport(actor,id,body.action==='replay'?body.evaluationId:undefined);
 });
}
