// Topic plan T5.3: candidate projections and draft evidence.
import {expect,it,vi} from 'vitest';
import {memoryResolver} from '@/lib/evidence';
import {memorySources} from '@/lib/evidence/memory-sources';
import {allFixtures} from '@/lib/evidence/fixtures';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {FACT} from '@/lib/evidence/fixtures/facts';
import {DOC} from '@/lib/evidence/fixtures/documents';
import {JUDGMENT} from '@/lib/evidence/fixtures/judgments';
import {createResolver} from '@/lib/evidence/resolve';
import {macroResolver} from '@/lib/evidence/resolvers/macro';
import {emptyDraft} from './drafts';
import {draftEvidenceView,memoryCandidateLookup,parseEvidenceQuery,searchEvidence,valueText} from './evidence-search';
const now=()=>new Date('2026-11-17T00:00:00.000Z');
const query={kind:'macro_observation' as const,series_id:'US_UNRATE',period_end:'2026-08-31'};
function deps(){
 const seed=allFixtures();const first=seed.macro!.rows!.find(r=>r.observation_id===OBS.unrateV1)!;
 seed.macro!.rows!.push({...first,observation_id:OBS.unrateV2,version:2,value_text:'4.4'});
 const sources=memorySources(seed);
 return {sources,resolver:memoryResolver(sources.seed),lookup:memoryCandidateLookup(sources),now};
}
it('returns every macro version with bilingual hints and optional cutoff',async()=>{
 const d=deps(),rows=await searchEvidence(d,query,null);
 expect(rows.map(r=>r.ref.id)).toEqual([OBS.unrateV1,OBS.unrateV2]);
 expect(rows.map(r=>r.label)).toEqual([{zh:'US_UNRATE · 失业率 · v1',en:'US_UNRATE · Unemployment · v1'},{zh:'US_UNRATE · 失业率 · v2',en:'US_UNRATE · Unemployment · v2'}]);
 for(const row of rows)expect(row.ref).not.toHaveProperty('as_of');
 const asOf='2026-11-14T23:59:59.999Z';
 for(const row of await searchEvidence(d,query,asOf))expect(row.ref.as_of).toBe(asOf);
});
it('keeps the CN pending value in the admin projection only',async()=>{
 const rows=await searchEvidence(deps(),{kind:'financial_fact',ticker:'test',concept:'us-gaap:Revenues',period_end:'2025-12-31'},null);
 const cn=rows.find(r=>r.ref.id===FACT.cnPending)!;
 expect(cn.public).toEqual({state:'withheld',reason:'citation_pending',text:null});
 expect(cn.admin).toMatchObject({state:'ok',admin_only:true});
 expect(cn.admin.text?.replaceAll(',','')).toContain('987654321.12');
 expect(JSON.stringify(rows.map(r=>r.public))).not.toContain('987654321.12');
 expect(JSON.stringify(rows.map(r=>r.public))).not.toContain('987,654,321.12');
});
it('caps results at twenty in lookup order and batches each audience',async()=>{
 const d=deps(),hits=await d.lookup.find(query),resolve=vi.spyOn(d.resolver,'resolve');
 const rows=await searchEvidence({...d,lookup:{find:async()=>Array.from({length:25},(_,i)=>hits[i%2])}},query,null);
 expect(rows).toHaveLength(20);expect(rows.map(r=>r.ref.id)).toEqual(Array.from({length:20},(_,i)=>hits[i%2].ref.id));
 expect(resolve.mock.calls.map(c=>c[1].audience)).toEqual(['public','admin']);
 expect(resolve.mock.calls[0][0]).toHaveLength(20);
 expect(resolve.mock.calls[0][0][0].as_of).toBe(now().toISOString());
});
it('validates query kinds and calendar dates',()=>{
 for(const kind of ['broker_report_meta','unknown'])expect(()=>parseEvidenceQuery({kind})).toThrow(expect.objectContaining({code:'invalid_parameter:kind',status:400}));
 expect(parseEvidenceQuery(query)).toEqual({query,asOf:null});
 expect(parseEvidenceQuery({...query,as_of:'2026-11-14'}).asOf).toBe('2026-11-14T23:59:59.999Z');
});
it.each([
 [{...query,series_id:'bad'},'series_id'],[{...query,period_end:'2026-02-30'},'period_end'],[{...query,as_of:'bad'},'as_of'],
 [{kind:'financial_fact',ticker:'',concept:'revenue',period_end:'2025-12-31'},'ticker'],
 [{kind:'financial_fact',ticker:'TEST',concept:'us gaap:Revenues',period_end:'2025-12-31'},'concept'],
 [{kind:'industry_metric',scheme:'other'},'scheme'],[{kind:'industry_metric',scheme:'sic',code:'!'},'code'],
 [{kind:'industry_metric',scheme:'sic',code:'3571',metric:'bad1'},'metric'],
 [{kind:'document_citation',document_id:'bad'},'document_id'],[{kind:'document_citation',document_id:DOC.ok,page_no:0},'page_no'],
 [{kind:'judgment',judgment_id:'bad'},'judgment_id'],
])('rejects invalid fields', (body,field)=>{expect(()=>parseEvidenceQuery(body)).toThrow(`invalid_body:${field}`);});
it('finds active industry cells, all citation visibilities and judgments',async()=>{
 const {lookup,sources}=deps();
 const cells=await lookup.find({kind:'industry_metric',scheme:'sic',code:'3571',metric:'roe',period_end:'2025-12-31'});
 expect(cells).toHaveLength(2);expect(cells.every(c=>c.hint?.zh==='L2')).toBe(true);
 const c=sources.seed.documents.citations.find(c=>c.citation_id===DOC.internal)!;
 expect(await lookup.find({kind:'document_citation',document_id:c.document_id,page_no:12})).toEqual([{ref:{v:1,kind:'document_citation',id:DOC.internal},hint:{zh:'p.12',en:'p.12'}}]);
 expect(await lookup.find({kind:'document_citation',document_id:c.document_id,page_no:13})).toEqual([]);
 expect(await lookup.find({kind:'judgment',judgment_id:JUDGMENT.ok})).toEqual([{ref:{v:1,kind:'judgment',id:JUDGMENT.ok}}]);
});
it('renders ordinal order with only public values and preserves explicit cutoffs',async()=>{
 const d=deps(),body=emptyDraft({zh:'专题',en:'Topic'}),resolve=vi.spyOn(d.resolver,'resolve');
 body.evidence=[{ordinal:8,section_key:'s',ref:{v:1,kind:'financial_fact',id:FACT.cnPending}},
  {ordinal:2,section_key:'s',ref:{v:1,kind:'macro_observation',id:OBS.unrateV1}},
  {ordinal:3,section_key:'s',ref:{v:1,kind:'macro_observation',id:OBS.unrateV1,as_of:'2026-01-01T00:00:00.000Z'}}];
 const rows=await draftEvidenceView(d,body);
 expect(rows.map(r=>r.ordinal)).toEqual([2,3,8]);expect(rows[0].text).toBe('4.3%');
 expect(rows.filter(r=>r.state!=='ok').map(r=>r.text)).toEqual([null,null]);
 expect(resolve.mock.calls.map(c=>c[1].audience)).toEqual(['public']);
});
it('renders source errors as missing and formats citation and judgment slots',async()=>{
 const d=deps(),body=emptyDraft({zh:'专题',en:'Topic'});
 body.evidence=[{ordinal:1,section_key:'s',ref:{v:1,kind:'macro_observation',id:OBS.unrateV1}}];
 d.sources.macro.rows=async()=>{throw new Error('offline');};
 expect(await draftEvidenceView({...d,resolver:createResolver([macroResolver(d.sources)])},body)).toMatchObject([{state:'missing',reason:'resolver_error',text:null}]);
 const {resolved}=await d.resolver.resolve([{v:1,kind:'document_citation',id:DOC.ok,as_of:now().toISOString()},{v:1,kind:'judgment',id:JUDGMENT.ok,as_of:now().toISOString()}],{audience:'public',locale:'zh',now:now()});
 expect(valueText(resolved[0],'en')).toBe('Annual report · p.12');
 expect(valueText(resolved[1],'en')).toBe(resolved[1].display.fact!.slots.method);
 expect(valueText({...resolved[0],state:'withheld'},'en')).toBeNull();
});

it('accepts the namespaced concept used by the facts fixture',()=>{
 const concept=allFixtures().facts!.infos!.find(i=>i.row.fact_id===FACT.usOk)!.row.concept;
 expect(concept).toBe('us-gaap:Revenues');
 const body={kind:'financial_fact',ticker:'TEST',concept,period_end:'2025-12-31'};
 expect(parseEvidenceQuery(body)).toEqual({query:body,asOf:null});
});
