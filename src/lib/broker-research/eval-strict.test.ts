import {describe,expect,it} from 'vitest';
import {evalStats,runGoldEval} from './eval';
import type {EvalRow,GoldDoc} from './eval';
import {EXTRACT_RESPONSE,PAGES} from './fixtures/pipeline';
import {runParse} from './parse';
import {recordedLlmPort} from './ports/llm';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence,seedParsed,syntheticPdf} from './testing';

const sha='a'.repeat(64),other='b'.repeat(64);
const row:EvalRow={field:'target_price',target_key:'ZZBR',occurrence:1,value_text:'100',value_num:'100',value_currency:'USD',value_unit:'price',value_date:null,page:1,char_start:0,char_end:3};
const gold:GoldDoc={sha256:sha,fields:[row],absent:[]};
const extracted={sha256:sha,rows:[row]};
describe('strict evalStats',()=>{
 for(const [name,docs,extra] of [
  ['missing',[],{missing:[sha],unexpected:[],duplicate:[]}],
  ['unexpected',[extracted,{sha256:other,rows:[]}],{missing:[],unexpected:[other],duplicate:[]}],
  ['duplicate',[extracted,extracted],{missing:[],unexpected:[],duplicate:[sha]}],
 ] as const)it(`rejects a ${name} extracted document`,()=>{
  expect(()=>evalStats([gold],docs.map(d=>({...d,rows:[...d.rows]})))).toThrowError(expect.objectContaining({code:'eval_document_set_mismatch',status:409,extra}));
 });
 for(const side of ['gold','extracted'])for(const occurrence of [undefined,0,1.5,Number.MAX_SAFE_INTEGER+1])it(`rejects ${side} occurrence ${occurrence}`,()=>{
  const invalid={...row,occurrence} as EvalRow;
  expect(()=>evalStats([{...gold,fields:[side==='gold'?invalid:row]}],[{...extracted,rows:[side==='extracted'?invalid:row]}]))
   .toThrowError(expect.objectContaining({code:'invalid_eval_row',status:400,extra:{sha256:sha,field:row.field}}));
 });
 it('matches two occurrences independently',()=>{
  const second={...row,occurrence:2,value_num:'110'},docs=[{...gold,fields:[row,second]}];
  expect(evalStats(docs,[{...extracted,rows:[second,row]}]).per_field.target_price).toMatchObject({tp:2,fp:0,fn:0});
  expect(evalStats(docs,[{...extracted,rows:[{...second,occurrence:1},row]}]).per_field.target_price).toMatchObject({tp:1,fp:1,fn:1});
 });
 it('compares numeric values with zero tolerance',()=>{
  for(const [value_num,expected] of [['100.0',true],['100.01',false]] as const)
   expect(evalStats([gold],[{...extracted,rows:[{...row,value_num}]}]).passed).toBe(expected);
 });
 it('counts true, false and missed absences by target and field',()=>{
  const absent=[{field:'rating',target_key:'ZZBR'},{field:'rating',target_key:'OTHER'}];
  expect(evalStats([{...gold,absent}],[{...extracted,rows:[{...row,field:'rating'}]}]).absence).toEqual({tp:1,fp:1,fn:1});
 });
 it('passes a 29-document set on metrics',()=>{
  const docs=Array.from({length:29},(_,i)=>({...gold,sha256:i.toString(16).padStart(64,'0')}));
  expect(evalStats(docs,docs.map(({sha256,fields:rows})=>({sha256,rows})))).toMatchObject({passed:true,n_docs:29});
 });
});

describe('gold artifact preflight',()=>{
 for(const dryRun of [false,true])for(const [name,fields,absent] of [
  ['out-of-range span',[{...row,char_end:PAGES[0].length+1}],[]],
  ['unknown page',[{...row,page:PAGES.length+1}],[]],
  ['empty span',[{...row,char_end:0}],[]],
  ['reversed span',[{...row,char_start:4}],[]],
  ['negative start',[{...row,char_start:-1}],[]],
  ['invalid absent field',[],[{field:null,target_key:null}]],
  ['missing absent target',[],[{field:row.field}]],
 ] as const)it(`rejects ${name} before any call (dryRun=${dryRun})`,async()=>{
  const llm=recordedLlmPort([EXTRACT_RESPONSE,EXTRACT_RESPONSE]),deps=memoryBrokerDeps({llm});
  const lic=await seedLicence(deps.db),first=await seedParsed(deps,lic.licence_id);
  const second=await seedDocument(deps,lic.licence_id,syntheticPdf('second'));
  await runParse(deps,second.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const docs:GoldDoc[]=[{sha256:first.sha256,fields:[],absent:[]},{sha256:second.sha256,fields:[...fields],absent:[...absent] as unknown as GoldDoc['absent']}];
  await expect(runGoldEval(deps,docs,{by:ADMIN_ID,dryRun})).rejects.toMatchObject({code:'invalid_gold_manifest',status:400,extra:{sha256:second.sha256,field:name==='invalid absent field'?null:row.field,reason:expect.any(String)}});
  expect(llm.calls).toHaveLength(0);
 });
});
