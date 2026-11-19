// T11.1: Copilot reads the same published evidence as the public dossier.
import {afterEach,expect,it,vi} from 'vitest';
import {actor,confirmations,hashOf,scenario,settingsBody} from './fixtures/scenario';
import {checkDraft,publishTopic} from './publish';
import {readTopic} from './public-read';
import {requiredAttributions,setPublicEnabled} from './settings';

vi.mock('next/headers',()=>({headers:async()=>new Headers({cookie:'test-session=fixture'})}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

async function dossier(){
 const {deps,pub,topicId,slug}=await scenario();
 await checkDraft(deps,{actor,topicId});
 await publishTopic(deps,{actor,topicId,expectedDraftHash:await hashOf(deps,topicId)});
 const {required}=await requiredAttributions(deps.db);
 await setPublicEnabled(deps,{...settingsBody,licence_confirmations:confirmations(required)},actor);
 const evidenceIds=(await deps.db.draftOf(topicId))!.body.evidence.map(e=>e.ref.id);
 return {dto:await readTopic(pub(),slug,{}),evidenceIds};
}

it('registers exactly once when enabled and stays absent by default',async()=>{
 for(const [flag,count] of [[undefined,0],['1',1]] as const){
  vi.resetModules();vi.stubEnv('TOPICS_ENABLED',flag);vi.stubEnv('TOPICS_E2E_FIXTURES',undefined);
  const {TOOLS}=await import('@/lib/agent/tools');
  if(!flag){
   const {TEMPLATES}=await import('@/lib/macro/strategy/explain-render');
   expect(TEMPLATES).not.toHaveProperty(['topic.macro_level']);
  }
  expect(TOOLS.filter(t=>t.name==='topic_dossier')).toHaveLength(count);
 }
});

it('projects public citations, localized notes, gaps and approved sentences without hidden values',async()=>{
 const {dto,evidenceIds}=await dossier();
 const {toToolOutput}=await import('./copilot');
 const note={zh:'观察 {{ev:1}}',en:'Observed {{ev:1}} / {{ev:2}} / {{ev:3.period}}'};
 dto.entries=[{key:'public',entry_type:'owner_note',body:note},
  {key:'unused',entry_type:'licensed_excerpt',licence_id:'licence',fragments:[{text:'unshown fragment',date:'',url:'',attribution:''}]}];
 dto.sections[0].note=note;
 dto.summary={facts:[{fact_id:'ev:1',text:'Frozen sentence',refs:[1]}],points:[],counterpoints:[],incomparable:[],
  provider:'fixture',model:'fixture',validator_version:'1',prompt_version:'1',hidden_points:0};
 dto.evidence[1].masked=true;dto.evidence[1].drift='now_withheld';
 Object.assign(dto.evidence[3],{drawer:{snippet:'drawer-only text'}});
 for(const state of ['withheld','missing','not_served','unsupported','retracted'] as const){
  dto.evidence[2].state=state;
  for(const e of dto.evidence.slice(1,3)){
   e.fact={template:'topic.macro_level',slots:{series:'test',period:'period',value:{value_text:'817263',unit:'pct'}}};
  }
  const out=await toToolOutput(dto,undefined,'en');
  const json=JSON.stringify(out);
  for(const id of evidenceIds)expect(json,'scenario evidence id in tool output').not.toContain(id);
  expect(json).not.toMatch(/"(?:id|ref|drawer)":/);
  expect(out).toMatchObject({version_no:1,published_at:dto.version.published_at,
   evidence:[{ordinal:1,kind:'macro_observation',text:expect.stringContaining('4.3%')},
    {ordinal:2,masked:true,drift:'now_withheld'},{ordinal:3,state,reason:dto.evidence[2].reason},{ordinal:4,text:expect.stringContaining('page')}],
   sections:[{note:'Observed 4.3% / [masked] / [masked]'}],owner_notes:['Observed 4.3% / [masked] / [masked]'],
   expected_slots:[{reason_code:'industry_not_published'}],summary:{facts:[{text:'Frozen sentence',refs:[1]}]}});
  for(const e of out.evidence.slice(1,3))expect(e).not.toHaveProperty('text');
  expect(JSON.stringify(out)).not.toMatch(/"drawer"|"value_text"|817,?263|unshown fragment|drawer-only text|\{\{ev:/);
 }
 expect(await toToolOutput(dto,['other'],'en')).toMatchObject({sections:[],evidence:[],expected_slots:[],owner_notes:[],summary:{facts:[]}});
 expect((await toToolOutput(dto,undefined,'zh')).owner_notes).toEqual(['观察 4.3%']);
});

it('calls the public current, version and replay routes with the request cookie',async()=>{
 const {dto}=await dossier(),{topicDossierTool}=await import('./copilot');
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json(dto));
 const origin='https://example.test',slug=dto.topic.slug;
 for(const [extra,suffix] of [[{},''],[{version:1},'/versions/1'],[{asOf:'2026-11-15'},'?asOf=2026-11-15']] as const){
  expect(await topicDossierTool.handler({slug,locale:'en',...extra},{origin})).toMatchObject({version_no:1});
  expect(fetch).toHaveBeenLastCalledWith(origin+'/api/topics/'+slug+suffix,expect.objectContaining({
   headers:expect.objectContaining({cookie:'test-session=fixture'}),cache:'no-store',redirect:'error'}));
 }
});

it('reports a closed or unavailable API without sending response details to the model',async()=>{
 const {topicDossierTool}=await import('./copilot');
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:404}));
 expect(await topicDossierTool.handler({slug:'unemployment',locale:'en'},{origin:'https://example.test'}))
  .toEqual({unavailable:true,code:'not_found'});
});
