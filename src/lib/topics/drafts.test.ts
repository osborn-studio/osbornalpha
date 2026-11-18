// Topic plan T5.2: draft structure and advisory lint.
import {describe,expect,it} from 'vitest';
import {parseDraftBody,emptyDraft,nextOrdinal,ownerTexts,draftLint,DRAFT_LIMITS} from './drafts';
import {ADVICE_TERMS} from './lexical';
import {SAMPLES} from '@/lib/evidence/fixtures';
import type {DraftBody} from './types';
const title={zh:'利率与银行',en:'Rates and banks'};
function valid():DraftBody{
 return {...emptyDraft({...title}),sections:[{key:'s1',title:{zh:'',en:''},note:{zh:'截至 {{ev:1.period}} 为 {{ev:1}}',en:''},items:[{ordinal:1},{expected_slot:'pending'}]}],
 evidence:[{ordinal:1,ref:structuredClone(SAMPLES.macro_observation[0].ref),section_key:'s1'}],
 expected_slots:[{key:'pending',kind:'industry_metric',label:{zh:'行业',en:'Industry'},reason_code:'industry_not_published'}],
 entries:[{key:'note',entry_type:'owner_note',body:{zh:'说明',en:'Note'}}],blocks_provenance:{s1:'owner'}};
}
describe('parseDraftBody',()=>{
 it('accepts a complete draft and empty draft',()=>{
  expect(parseDraftBody(valid())).toEqual(valid());
  expect(emptyDraft(title)).toEqual({title,dek:{zh:'',en:''},sections:[],evidence:[],expected_slots:[],entries:[],blocks_provenance:{}});
  expect(parseDraftBody(emptyDraft(title))).toEqual(emptyDraft(title));
 });
 const cases:[string,(b:DraftBody)=>unknown][]=[
  ['title.zh',b=>{b.title.zh='';return b;}],['title.en',b=>{b.title.en='x'.repeat(121);return b;}],
  ['dek.zh',b=>{b.dek.zh='x'.repeat(241);return b;}],['dek.en',b=>({...b,dek:{zh:'',en:1}})],
  ['sections.0.key',b=>{b.sections[0].key='Bad';return b;}],
  ['sections.1.key',b=>{b.sections.push(structuredClone(b.sections[0]));return b;}],
  ['sections.0.title.zh',b=>{b.sections[0].title.zh='x'.repeat(121);return b;}],
  ['sections.0.note.en',b=>{b.sections[0].note!.en='x'.repeat(4001);return b;}],
  ['sections.0.note',b=>({...b,sections:[{...b.sections[0],note:'text'}]})],
  ['evidence.0.ordinal',b=>{b.evidence[0].ordinal=0;return b;}],
  ['evidence.0.ordinal',b=>{b.evidence[0].ordinal=1.5;return b;}],
  ['evidence.1.ordinal',b=>{b.evidence.push(structuredClone(b.evidence[0]));return b;}],
  ['evidence.0.ref',b=>{b.evidence[0].ref.id='bad';return b;}],
  ['evidence.0.section_key',b=>{b.evidence[0].section_key='absent';return b;}],
  ['sections.0.items.0',b=>{b.sections[0].items[0]={ordinal:99};return b;}],
  ['sections.0.items.2',b=>{b.sections[0].items.push({ordinal:1});return b;}],
  ['sections.1.items.0',b=>{b.sections.push({key:'s2',title, note:null,items:[{ordinal:1}]});return b;}],
  ['evidence.0.ordinal',b=>{b.sections[0].items.shift();return b;}],
  ['expected_slots.0.reason_code',b=>({...b,expected_slots:[{...b.expected_slots[0],reason_code:'unknown'}]})],
  ['expected_slots.0.kind',b=>({...b,expected_slots:[{...b.expected_slots[0],kind:'unknown'}]})],
  ['expected_slots.0.key',b=>{b.expected_slots[0].key='Bad';return b;}],
  ['expected_slots.1.key',b=>{b.expected_slots.push(structuredClone(b.expected_slots[0]));return b;}],
  ['expected_slots.0.label.zh',b=>{b.expected_slots[0].label.zh='x'.repeat(121);return b;}],
  ['sections.0.items.1',b=>{b.sections[0].items[1]={expected_slot:'absent'};return b;}],
  ['sections.0.items.2',b=>{b.sections[0].items.push({expected_slot:'pending'});return b;}],
  ['expected_slots.0.key',b=>{b.sections[0].items.pop();return b;}],
  ['sections.0.items.0',b=>({...b,sections:[{...b.sections[0],items:[{ordinal:1,expected_slot:'pending'}]}]})],
  ['entries',b=>({...b,entries:[{key:'excerpt',entry_type:'licensed_excerpt'}]})],
  ['entries.0.key',b=>{b.entries[0].key='Bad';return b;}],
  ['entries.1.key',b=>{b.entries.push(structuredClone(b.entries[0]));return b;}],
  ['entries.0.body.zh',b=>({...b,entries:[{key:'note',entry_type:'owner_note',body:{zh:'x'.repeat(4001),en:''}}]})],
  ['blocks_provenance',b=>({...b,blocks_provenance:{s1:'unknown'}})],
  ['blocks_provenance',b=>({...b,blocks_provenance:[]})],
  ['extra',b=>({...b,extra:true})],
  ['sections',b=>({...b,sections:Array(21).fill(b.sections[0])})],
  ['evidence',b=>({...b,evidence:Array(201).fill(b.evidence[0])})],
  ['expected_slots',b=>({...b,expected_slots:Array(51).fill(b.expected_slots[0])})],
  ['entries',b=>({...b,entries:Array(51).fill(b.entries[0])})],
 ];
 it.each(cases)('rejects invalid_body:%s', (path,change)=>{
  expect(()=>parseDraftBody(change(valid()))).toThrow(`invalid_body:${path}`);
 });
 it.each([null,[],1,'text'])('rejects non-object %j',raw=>{expect(()=>parseDraftBody(raw)).toThrow('invalid_body');});
 it('accepts boundary lengths, nullable notes and all provenance states',()=>{
  const b=valid();b.title={zh:'x'.repeat(120),en:'x'};b.dek={zh:'',en:'x'.repeat(240)};
  b.sections[0].title.en='x'.repeat(120);b.sections[0].note={zh:'x'.repeat(4000),en:''};
  b.expected_slots[0].label.en='x'.repeat(120);b.entries=[{key:'note',entry_type:'owner_note',body:{zh:'',en:'x'.repeat(4000)}}];
  b.blocks_provenance={a:'owner',b:'from_thesis',c:'reviewed'};
  expect(parseDraftBody(b)).toEqual(b);b.sections[0].note=null;expect(parseDraftBody(b)).toEqual(b);
  expect(DRAFT_LIMITS).toEqual({title:120,dek:240,sectionTitle:120,note:4000,ownerNote:4000,slotLabel:120,sections:20,evidence:200,expectedSlots:50,entries:50});
 });
 it('preserves absent as_of and normalizes supplied timestamps',()=>{
  const b=valid();delete b.evidence[0].ref.as_of;
  expect(parseDraftBody(b).evidence[0].ref).not.toHaveProperty('as_of');
  b.evidence[0].ref.as_of='2026-11-14T01:00:00+01:00';
  expect(parseDraftBody(b).evidence[0].ref.as_of).toBe('2026-11-14T00:00:00.000Z');
 });
 it('rebuilds nested records using known fields',()=>{
  const b=valid();const result=parseDraftBody({...b,title:{...b.title,extra:'ignored'}});
  expect(result).toEqual(b);expect(result).not.toBe(b);expect(result.title).not.toHaveProperty('extra');
 });
 it('does not renumber gaps',()=>{
  const b=valid();b.evidence[0].ordinal=7;b.sections[0].items[0]={ordinal:7};
  expect(parseDraftBody(b).evidence[0].ordinal).toBe(7);expect(nextOrdinal(b)).toBe(8);expect(nextOrdinal(emptyDraft(title))).toBe(1);
 });
});
it('addresses nonempty owner text by stable keys and orders lexical before dangling findings',()=>{
 const b=valid();b.sections[0].note={zh:`失业率为 4.3% ${ADVICE_TERMS[0]} {{ev:9}} {{ev:9.period}}`,en:''};
 expect(ownerTexts(b).map(x=>x.field)).toEqual(['title.zh','title.en','sections.s1.note.zh','entries.note.body.zh','entries.note.body.en']);
 const lint=draftLint(b);expect(lint).toContainEqual({field:'sections.s1.note.zh',code:'numeral_in_owner_text',match:'4.3%'});
 expect(lint).toContainEqual({field:'sections.s1.note.zh',code:'advice_term',match:ADVICE_TERMS[0]});
 expect(lint.slice(-2)).toEqual([{field:'sections.s1.note.zh',code:'dangling_slot',match:'{{ev:9}}'},{field:'sections.s1.note.zh',code:'dangling_slot',match:'{{ev:9.period}}'}]);
 expect(draftLint(valid())).toEqual([]);
});
