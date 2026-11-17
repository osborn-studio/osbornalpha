// src/lib/evidence/resolve.test.ts
import {describe,expect,it} from 'vitest';
import type {SourceDrawerPayload as UiPayload} from '@/components/research-ui/source-drawer/types';
import type {SourceDrawerPayload} from './drawer';
import {createResolver,digestOf,missing,type EvidenceResolver,type Resolved} from './resolve';
import type {EvidenceRef} from './ref';
const ref=(kind:EvidenceRef['kind'],n:number):EvidenceRef=>({v:1,kind,id:`00000000-0000-4000-8000-00000000000${n}`,as_of:'2026-11-14T00:00:00.000Z'});
const ctx={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
const ok=(r:EvidenceRef):Resolved=>({...missing(r,'x'),state:'ok',reason:null});
const fake=(kind:EvidenceRef['kind'],impl:(refs:EvidenceRef[])=>Promise<Resolved[]>):EvidenceResolver=>({kind,code_version:`${kind}/1`,resolve:impl,latestIdentity:async()=>null});
describe('createResolver',()=>{
 it('dispatches by kind and returns results in input order with equal length (rule 1)',async()=>{
  const r=createResolver([fake('macro_observation',async refs=>refs.map(ok)),fake('judgment',async refs=>refs.map(ok))]);
  const input=[ref('judgment',1),ref('macro_observation',2),ref('judgment',3)];
  const out=await r.resolve(input,ctx);
  expect(out.resolved.map(x=>x.ref)).toEqual(input);expect(out.receipt.errors).toEqual([]);
 });
 it('turns a throwing resolver into missing:resolver_error for its refs only and records it',async()=>{
  const r=createResolver([fake('macro_observation',async()=>{throw new Error('boom');}),fake('judgment',async refs=>refs.map(ok))]);
  const out=await r.resolve([ref('macro_observation',1),ref('judgment',2)],ctx);
  expect(out.resolved.map(x=>[x.state,x.reason])).toEqual([['missing','resolver_error'],['ok',null]]);
  expect(out.receipt.errors).toEqual([{index:0,kind:'macro_observation',message:'boom'}]);
 });
 it('treats a wrong-length answer as a resolver error',async()=>{
  const r=createResolver([fake('judgment',async()=>[])]);
  expect((await r.resolve([ref('judgment',1)],ctx)).resolved[0].reason).toBe('resolver_error');
 });
 it('returns unsupported for a kind with no resolver (rule 4)',async()=>{
  const out=await createResolver([]).resolve([ref('broker_report_meta',1)],ctx);
  expect([out.resolved[0].state,out.resolved[0].reason]).toEqual(['unsupported','no_resolver']);
 });
 it('exposes resolver code versions',()=>{
  expect(createResolver([fake('judgment',async r=>r.map(ok))]).versions()).toEqual({judgment:'judgment/1'});
 });
});
describe('digestOf',()=>{
 it('is stable under key order and changes with the value',()=>{
  const id={id:'a',label:'b'};
  const a=digestOf({template:'t',slots:{value:{value_text:'4.3',unit:'pct'},period:'2026-08'}},id);
  expect(a).toBe(digestOf({slots:{period:'2026-08',value:{unit:'pct',value_text:'4.3'}},template:'t'},id));
  expect(a).not.toBe(digestOf({template:'t',slots:{value:{value_text:'4.2',unit:'pct'},period:'2026-08'}},id));
 });
});
it('keeps the lib payload type identical to the drawer component type',()=>{
 const a:UiPayload={} as SourceDrawerPayload;const b:SourceDrawerPayload={} as UiPayload;expect([a,b].length).toBe(2);
});

// Memory sources (topic spec §4.1): mutable seeds for revision and drift checks.
import {memorySources} from './memory-sources';
import type {ObservationRow} from '@/lib/macro/types';
import type {FactRow} from '@/lib/facts/types';
import type {IndustryCell,IndustryCellKey} from './sources';
const observation=(patch:Partial<ObservationRow>={}):ObservationRow=>({
 observation_id:'v1',series_id:'US_UNRATE',period_end:'2026-08-31',value_text:'4.3',version:1,
 available_at:'2026-09-05T12:30:00.000Z',availability_basis:'first_seen',ingested_at:'2026-09-05T12:30:00.000Z',status:'ok',
 retrieval_id:'r1',locator:null,derived_from:null,transform:null,code_version:'macro/1',batch_id:'batch',...patch,
});
const factRow=(patch:Partial<FactRow>={}):FactRow=>({
 fact_id:'usOk',issuer_id:'issuer',market:'US',filing_id:'filing',run_id:'run',concept:'us-gaap:Revenues',source_concept:'Revenues',statement:'IS',
 period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1000',value_text:'1000',unit:'USD',consolidation:'consolidated',
 available_date:'2026-02-01',mapping_gen:1,mapping_version:'facts/1',status:'ok',raw_hash:'hash',created_at:'2026-02-01T00:00:00.000Z',...patch,
});
const info=(row:FactRow)=>({row,issuer:{name:{zh:'公司',en:'Company'},ticker:null},filing:null,publisher:'SEC'});
const cellKey:IndustryCellKey={run_id:'sic',code:'7372',metric:'net_margin',period_start:'2025-01-01',period_end:'2025-12-31'};
const cell:IndustryCell={
 run:{run_id:'sic',scheme:'sic',version:'sec-current',level:1,generation:1,status:'active',history_class:'reconstruction',
  activated_at:'2026-11-10T00:00:00.000Z',method_version:'industry/1',code_version:'code/1'},
 row:{status:'ok',missing_reason:null,value_text:'0.201',unit:'ratio',duration:'12M',n_members:52,n_with_data:41},label:{zh:'行业',en:'Industry'},
};
describe('memorySources',()=>{
 it('defaults to empty sources and unknown freshness',async()=>{
  const s=memorySources();
  expect(await s.macro.rows(['absent'])).toEqual([]);expect(s.macro.series('absent')).toBeNull();
  expect(await s.macro.latestPeriodEnd('absent')).toBeNull();expect(await s.macro.retrievals(['absent'])).toEqual(new Map());
  expect(await s.industry.cell(cellKey)).toBeNull();expect(await s.industry.datasetPublic('sic','sec-current')).toBe(false);
  expect(await s.facts.facts(['absent'])).toEqual([]);expect(await s.facts.current(factRow())).toBeNull();
  expect(await s.documents.citation('absent')).toBeNull();expect(await s.judgments.judgment('absent')).toBeNull();
  expect(await s.freshness('macro.fred',ctx.now)).toEqual({dataset:'macro.fred',status:'unknown',checked_at:'2026-11-15T00:00:00.000Z'});
 });
 it('reads all macro statuses, sorts versions without mutation and sees injected revisions',async()=>{
  const first=observation();const revision=observation({observation_id:'v2',version:2,value_text:'4.2'});
  const held=observation({observation_id:'held',period_end:'2026-10-31',status:'quarantined'});
  const s=memorySources({macro:{rows:[revision,first,held],series:[{id:'US_UNRATE',name:{zh:'失业率',en:'Unemployment'},unit:'pct',
   status:'active',rights:'public_domain',publisher:{zh:'来源',en:'Source'},relay:null,adapter:'fred',dataset:'macro.fred'}],
   retrievals:[{retrieval_id:'r1',fetch_url:null,fetched_at:first.ingested_at,sha256:null}]},freshness:{'macro.fred':'fresh'}});
  expect(await s.macro.rows(['held','v1'])).toEqual([first,held]);
  expect(await s.macro.versions('US_UNRATE','2026-08-31')).toEqual([first,revision]);
  expect(s.seed.macro.rows).toEqual([revision,first,held]);
  expect(await s.macro.latestPeriodEnd('US_UNRATE')).toBe('2026-08-31');
  expect(s.macro.series('US_UNRATE')?.unit).toBe('pct');expect((await s.macro.retrievals(['r1'])).get('r1')?.sha256).toBeNull();
  s.seed.macro.rows.push(observation({observation_id:'later',period_end:'2026-09-30'}));
  expect(await s.macro.latestPeriodEnd('US_UNRATE')).toBe('2026-09-30');
  expect(await s.freshness('macro.fred',ctx.now)).toEqual({dataset:'macro.fred',status:'fresh',checked_at:'2026-11-15T00:00:00.000Z'});
 });
 it('distinguishes an absent industry run from an absent cell and selects active generations',async()=>{
  const s=memorySources({industry:{cells:[{key:cellKey,...cell}],publicDatasets:['scheme:sic:sec-current','scheme:sw2021:2021-pub']}});
  expect(await s.industry.cell(cellKey)).toEqual(cell);
  expect(await s.industry.cell({...cellKey,code:'0000'})).toMatchObject({run:cell.run,row:null});
  expect(await s.industry.datasetPublic('sw2021','2021')).toBe(false);
  expect(await s.industry.datasetPublic('sw2021','2021-pub')).toBe(true);
  expect(await s.industry.activeCell('sic','sec-current',1,cellKey)).toEqual({run_id:'sic',value_text:'0.201',unit:'ratio',activated_at:'2026-11-10T00:00:00.000Z'});
  s.seed.industry.cells.push({key:{...cellKey,run_id:'sic2'},...cell,run:{...cell.run,run_id:'sic2',generation:2},row:{...cell.row!,value_text:'0.333'}});
  expect(await s.industry.activeCell('sic','sec-current',1,cellKey)).toMatchObject({run_id:'sic2',value_text:'0.333'});
  expect(await s.industry.latestPeriodEnd('sic','sec-current',1,'7372','net_margin')).toBe('2025-12-31');
  s.seed.industry.cells=s.seed.industry.cells.filter(c=>c.key.run_id!==cellKey.run_id);
  expect(await s.industry.cell(cellKey)).toBeNull();
 });
 it('finds current disclosures and newer periods without crossing fact identities',async()=>{
  const first=factRow(),restated=factRow({fact_id:'usRestated',value_text:'1010',available_date:'2026-11-20'});
  const cn=factRow({fact_id:'cnPending',market:'CN',value_text:'987654321.12'}),incomplete=factRow({fact_id:'usIncomplete',issuer_id:'other'});
  const s=memorySources({facts:{infos:[first,restated,cn,incomplete].map(info),ineligible:new Map([['cnPending','citation_pending'],['usIncomplete','evidence_incomplete']])}});
  expect(await s.facts.facts(['cnPending'])).toEqual([info(cn)]);
  expect(await s.facts.eligibility([first,cn,incomplete],{admin:false})).toEqual(new Map([
   ['usOk',{ok:true}],['cnPending',{ok:false,reason:'citation_pending'}],['usIncomplete',{ok:false,reason:'evidence_incomplete'}],
  ]));
  expect(await s.facts.eligibility([cn,incomplete],{admin:true})).toEqual(new Map([
   ['cnPending',{ok:true}],['usIncomplete',{ok:false,reason:'evidence_incomplete'}],
  ]));
  expect(await s.facts.current(first)).toEqual(restated);expect(await s.facts.newerPeriodEnd(first)).toBeNull();
  s.seed.facts.infos.push(info(factRow({fact_id:'later',period_start:'2026-01-01',period_end:'2026-12-31'})));
  s.seed.facts.infos.push(info(factRow({fact_id:'other-unit',unit:'CNY',available_date:'2027-01-01'})));
  expect(await s.facts.current(first)).toEqual(restated);expect(await s.facts.newerPeriodEnd(first)).toBe('2026-12-31');
  expect(s.seed.facts.ineligible.get('cnPending')).toBe('citation_pending');
 });
 it('reads document seeds and observes replacement and removal',async()=>{
  const citation={citation_id:'citation',document_id:'document',page_no:1,snippet:'Excerpt',text_hash:'hash',visibility:'public' as const,
   created_at:'2026-11-01T00:00:00.000Z',document:{title:'Report',permission:'public' as const,publisher:'Source',url:null}};
  const s=memorySources({documents:{citations:[citation]}});
  expect(await s.documents.citation('citation')).toEqual(citation);
  s.seed.documents.citations=[];expect(await s.documents.citation('citation')).toBeNull();
 });
});
