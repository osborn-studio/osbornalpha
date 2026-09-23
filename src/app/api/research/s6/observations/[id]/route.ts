import Ajv from 'ajv';
import {requireS4Actor} from '@/lib/research/s4/auth';
import {bodyJson} from '@/lib/research/s4/http';
import {s6Http} from '@/lib/research/s6/http';
import {observationReport} from '@/lib/research/s6/report';
import {prepareInput,prepareEvaluation,makeCommit,createS6Store} from '@/lib/research/s6/store';
import {fail} from '@/lib/research/ingest/pa-v1/json';
const valid=new Ajv({strict:true}).compile({oneOf:[
 {type:'object',additionalProperties:false,required:['action'],properties:{action:{enum:['read','prepare']}}},
 {type:'object',additionalProperties:false,required:['action','evaluationId'],properties:{action:{const:'replay'},evaluationId:{type:'string',pattern:'^[0-9a-f-]{36}$'}}},
 {type:'object',additionalProperties:false,required:['action','asOf','key','revision','marketIds'],properties:{action:{const:'evaluate'},asOf:{type:'string',maxLength:40},key:{type:'string',pattern:'^[A-Za-z0-9:_-]{8,128}$'},revision:{type:'integer',minimum:0},marketIds:{type:'array',maxItems:2,items:{type:'string',maxLength:128}}}},
]});
export const runtime='nodejs';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 return s6Http(async()=>{
  const actor=await requireS4Actor(req),body=await bodyJson(req),{id}=await ctx.params;
  if(!valid(body))fail('invalid_schema');
  if(body.action==='prepare')return prepareEvaluation(actor,id);
  if(body.action==='evaluate'){
   const input=await prepareInput(actor,id,body.marketIds,body.asOf);
   return createS6Store(actor).commitEvaluationResult(makeCommit(input,body.key,body.revision));
  }
  return observationReport(actor,id,body.action==='replay'?body.evaluationId:undefined);
 });
}
