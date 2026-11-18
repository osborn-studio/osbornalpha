// Evidence row states (topic spec §4.1, §7.2).
import {describe,expect,it} from 'vitest';
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {evidenceRowModel} from './evidence-row-model';
const row=(o:Partial<PublicEvidence>={}):PublicEvidence=>({ordinal:1,section_key:'s',kind:'macro_observation',state:'ok',reason:null,basis:'point_in_time',label:{zh:'失业率',en:'Unemployment'},fact:{template:'topic.macro_level',slots:{value:{value_text:'4.3',unit:'pct'}}},period:'2026-08-31',available_at:'2026-09-05T12:30:00Z',drift:null,masked:false,current:{value_text:'4.4',unit:'pct',period:'2026-09-30',available_at:'2026-10-05T12:30:00Z'},...o});
describe('evidence rows',()=>{
 const cases:[string,Partial<PublicEvidence>,Record<string,unknown>][]=[
  ['ok',{}, {factText:'失业率（2026-08-31）为 4.3%。',valueButton:true,stateBadge:{kind:'ok',reasonKey:null},driftBadge:null,sourceButton:true,dim:false}],
  ['revised',{drift:'revised'},{factText:'失业率（2026-08-31）为 4.3%。',valueButton:true,stateBadge:{kind:'ok'},driftBadge:{kind:'shared',state:'revised'},driftDetail:'现行 4.4%',sourceButton:true,dim:false}],
  ['newer_period',{drift:'newer_period'},{factText:'失业率（2026-08-31）为 4.3%。',valueButton:true,stateBadge:{kind:'ok'},driftBadge:{kind:'local',key:'drift.newer_period'},driftDetail:'2026-09-30 已发布',sourceButton:true,dim:false}],
  ['reconstruction',{basis:'reconstruction',drift:'unverifiable'},{factText:'失业率（2026-08-31）为 4.3%。',valueButton:true,stateBadge:{kind:'ok'},basisBadge:{kind:'shared',state:'reconstructed'},driftBadge:{kind:'local',key:'drift.unverifiable'},sourceButton:true,dim:false}],
  ['withheld',{state:'withheld',reason:'citation_pending'},{factText:'—',valueButton:false,stateBadge:{kind:'shared',state:'withheld',reasonKey:'reasons.citation_pending'},driftBadge:null,sourceButton:true,dim:true}],
  ['missing',{state:'missing',reason:'not_found'},{factText:'—',valueButton:false,stateBadge:{kind:'shared',state:'missing'},driftBadge:null,sourceButton:true,dim:true}],
  ['not_served',{state:'not_served',reason:'hk_not_served'},{factText:'—',valueButton:false,stateBadge:{kind:'shared',state:'notServed'},driftBadge:null,sourceButton:false,dim:true}],
  ['unsupported',{state:'unsupported',reason:'foreign_research_not_wired'},{factText:'—',valueButton:false,stateBadge:{kind:'local',key:'states.unsupported'},driftBadge:null,sourceButton:false,dim:true}],
  ['retracted',{state:'retracted',reason:'quarantined'},{factText:'—',valueButton:false,stateBadge:{kind:'shared',state:'retracted'},driftBadge:null,sourceButton:true,dim:true}],
  ['masked',{masked:true,drift:'now_withheld'},{factText:'发布时为 [已遮蔽]',valueButton:false,stateBadge:{kind:'ok',atPublication:true},driftBadge:{kind:'local',key:'drift.now_withheld'},sourceButton:true,dim:true}],
 ];
 it.each(cases)('%s',(_name,patch,want)=>{
  const e=row(patch),m=evidenceRowModel(e,'zh');expect(m).toMatchObject(want);
  if(e.state!=='ok'||e.masked){expect(m.factText).not.toMatch(/\d/);expect(m.available).toBe('—');expect(m.valueText).toBeNull();expect(m.driftDetail).toBeNull();}
 });
 it('preserves masked retraction and never formats its current identity',()=>{
  expect(evidenceRowModel(row({masked:true,state:'retracted',drift:'retracted'}),'en')).toMatchObject({factText:'At publication: [masked]',stateBadge:{kind:'ok',atPublication:true},driftBadge:{kind:'shared',state:'retracted'},driftDetail:null});
 });
 it('formats English facts and citation slots without inventing a numeric value',()=>{
  expect(evidenceRowModel(row(),'en').factText).toBe('Unemployment (2026-08-31) was 4.3%.');
  expect(evidenceRowModel(row({kind:'document_citation',fact:{template:'topic.citation',slots:{title:'Filing',page:'12'}}}),'en')).toMatchObject({factText:'Filing · page 12',valueButton:false,sourceButton:true});
 });
});
it('keeps the financial concept and duration in the fact sentence',()=>{
 const e=row({kind:'financial_fact',label:{zh:'公司',en:'Company'},fact:{template:'topic.fact_value',slots:{concept:'revenue',duration:'FY',value:{value_text:'1000',unit:'USD'}}}});
 expect(evidenceRowModel(e,'en').factText).toBe('Company · revenue · FY (2026-08-31) was 1,000.');
});

import {vi} from 'vitest';
import {isValidElement} from 'react';
import {EvidenceTable} from './EvidenceTable';
vi.mock('next-intl',()=>({useLocale:()=> 'en',useTranslations:()=> (key:string)=>key}));
it('both value and source buttons forward the original ordinal; unserved rows have neither',()=>{
 const onOpenSource=vi.fn();
 const table=EvidenceTable({rows:[row({ordinal:7}),row({ordinal:8,state:'not_served'}),row({ordinal:9,state:'unsupported'})],onOpenSource});
 const buttons:(()=>void)[]=[];
 const visit=(node:unknown)=>{
  if(Array.isArray(node)){node.forEach(visit);return;}
  if(!isValidElement<{children?:unknown;onClick?:()=>void}>(node))return;
  if(node.type==='button'&&node.props.onClick)buttons.push(node.props.onClick);
  visit(node.props.children);
 };
 visit(table);expect(buttons).toHaveLength(4);buttons.forEach(click=>click());expect(onOpenSource.mock.calls).toEqual([[7],[7],[7],[7]]);
});
