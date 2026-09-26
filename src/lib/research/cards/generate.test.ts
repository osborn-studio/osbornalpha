import {describe,expect,it} from 'vitest';
import {buildCardPrompt,generateCard,validateCardDraft,type ThesisForCard} from './generate';
import type {SelectedCard} from './select';
import {AXIOM_SEEDS} from '../seed';
import type {Axiom,SourceDocument} from '../types';

const AXIOMS:Axiom[]=AXIOM_SEEDS.map((a,i)=>({id:`ax-${i}`,code:a.code,title:a.title,description:a.description,severity:a.severity,enabled:true,created_at:'2026-07-04T00:00:00.000Z'}));
const S1='11111111-1111-4111-8111-111111111111',S2='22222222-2222-4222-8222-222222222222';
const thesis:ThesisForCard={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'推理需求转向',body:'正文',company_ids:[],theme_ids:[],supporting_evidence_ids:[],invalidation_conditions:['单价跌破成本'],watch_metrics:['DC 营收'],status:'ACTIVE',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z',pillars:[{id:'p1',text:'推理占比上升',resolvable_by:'季报',deadline:null}]};
const src=(id:string,title:string):SourceDocument=>({id,source_type:'NEWS',title,url:`https://n.example.com/${id.slice(0,1)}`,author:null,published_at:null,ingested_at:'2026-09-22T00:00:00Z',raw_text:'正文 '+title,content_hash:'h'+id,trust_level:'MEDIUM',entity_ids:[],metadata:{},event_time:null,available_at:'2026-09-22T00:00:00Z',source_version:'2',cluster_id:null,cluster_first:null,origin_type:null,market:'US',permission:'public'});
const selected:SelectedCard={kind:'evidence',thesis_id:thesis.id,evidence:{thesis_id:thesis.id,
 support:[{source_id:S1,source_version:'2',judgment_ids:['j1','j2'],origin:'filing_or_regulator',host:'n.example.com',unfamiliar:false,direction:'support'}],
 counter:[{source_id:S2,source_version:'2',judgment_ids:['j3'],origin:'analyst_or_media',host:'n.example.com',unfamiliar:true,direction:'counter'}],
 independent_sources:2,unfamiliar_hosts:['n.example.com']}};
const sources=[src(S1,'8-K：推理收入占比过半'),src(S2,'分析师质疑毛利率')];
const goodDraft={title:'推理收入占比过半',fields:{
 change_and_timing:[{text:'8-K 披露推理收入占比过半',source_ids:[S1]}],
 profit_or_moat_transmission:[{text:'推理更高毛利，传导到 DC 毛利率',source_ids:[S1]}],
 beneficiaries_and_losers:[],
 market_may_underestimate:[{text:'共识仍按训练周期建模',source_ids:[S1,S2]}],
 support_counter_independence:[{text:'1 支持 1 反证，2 个独立来源',source_ids:[S1,S2]}],
 next_fact_to_verify:[{text:'核实推理定义口径',source_ids:[S1]}],
 watch_points_weeks_and_half_year:[{text:'下季 DC 拆分',source_ids:[S1]},{text:'无来源的断言',source_ids:[]},{text:'引用不存在的来源',source_ids:['99999999-9999-4999-8999-999999999999']}],
}};

describe('buildCardPrompt',()=>{
 it('lists thesis, pillars, kill conditions and each evidence item as source@version with direction and origin, and hashes deterministically',()=>{
  const p=buildCardPrompt({card:selected,thesis,sources,weekOf:'2026-09-21'});
  expect(p.user).toContain(`${S1}@2`);expect(p.user).toContain('反证');expect(p.user).toContain('推理占比上升');expect(p.user).toContain('单价跌破成本');
  expect(p.system).toContain('change_and_timing');expect(p.system).toMatch(/不得.*买卖/);
  expect(p.prompt_sha256).toBe(buildCardPrompt({card:selected,thesis,sources,weekOf:'2026-09-21'}).prompt_sha256);
  expect(p.source_ids.sort()).toEqual([S1,S2].sort());
 });
});

describe('validateCardDraft',()=>{
 it('keeps cited assertions, drops uncited or unknown-source ones, fills empty fields with 待研究',()=>{
  const v=validateCardDraft(goodDraft,selected.evidence,thesis.title);
  expect(v.unsupported_dropped).toBe(2);
  expect(v.fields.beneficiaries_and_losers).toBe('待研究');
  expect(v.fields.watch_points_weeks_and_half_year).toHaveLength(1);
  expect(v.assertions.find(a=>a.field==='market_may_underestimate')).toMatchObject({source_id:S1,source_version:'2',judgment_ids:['j1','j2']});
  // an assertion citing two sources becomes one assertion per source
  expect(v.assertions.filter(a=>a.field==='market_may_underestimate')).toHaveLength(2);
  expect(v.title).toBe('推理收入占比过半');
 });
 it('tolerates garbage: non-object → all fields pending, title falls back to the thesis title',()=>{
  const v=validateCardDraft('nope',selected.evidence,thesis.title);
  expect(Object.values(v.fields).every(f=>f==='待研究')).toBe(true);
  expect(v.title).toBe(thesis.title);expect(v.assertions).toEqual([]);
 });
});

describe('generateCard',()=>{
 const llm=(content:unknown)=>async()=>({content:typeof content==='string'?content:JSON.stringify(content),model:'fake-1'});
 it('produces a generated card with provenance and evidence summary',async()=>{
  const c=await generateCard({card:selected,thesis,sources,weekOf:'2026-09-21',runId:'run-1',llm:llm(goodDraft),axioms:AXIOMS,excludedPrivate:1});
  expect(c.status).toBe('generated');expect(c.kind).toBe('evidence');expect(c.week_of).toBe('2026-09-21');
  expect(c.generation).toMatchObject({model:'fake-1',run_id:'run-1',unsupported_dropped:2});
  expect(c.generation.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(c.evidence).toEqual({support:1,counter:1,independent_sources:2,uncertainty:expect.any(String),excluded_private:1,unfamiliar_hosts:['n.example.com']});
  expect(c.axiom_results.every(r=>r.passed)).toBe(true);
 });
 it('blocks a card whose text contains trading advice, keeping it for audit',async()=>{
  const bad={...goodDraft,fields:{...goodDraft.fields,next_fact_to_verify:[{text:'建议买入，目标价 150',source_ids:[S1]}]}};
  const c=await generateCard({card:selected,thesis,sources,weekOf:'2026-09-21',runId:'run-1',llm:llm(bad),axioms:AXIOMS,excludedPrivate:0});
  expect(c.status).toBe('blocked');
  expect(c.axiom_results.find(r=>r.axiom_code==='AX006')?.passed).toBe(false);
 });
 it('treats unparseable model output as an all-pending card, never a throw',async()=>{
  const c=await generateCard({card:selected,thesis,sources,weekOf:'2026-09-21',runId:'run-1',llm:llm('not json at all'),axioms:AXIOMS,excludedPrivate:0});
  expect(c.status).toBe('generated');expect(c.assertions).toEqual([]);
  expect(c.fields.change_and_timing).toBe('待研究');
 });
});
