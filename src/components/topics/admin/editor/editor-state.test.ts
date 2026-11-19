// Topic plan T5.5: pure editing and stable evidence ordinals.
import {expect,it} from 'vitest';
import {emptyDraft,parseDraftBody} from '@/lib/topics/drafts';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {FACT} from '@/lib/evidence/fixtures/facts';
import type {DraftRef,ExpectedSlot} from '@/lib/topics/types';
import {reduce,fieldText,nextSectionKey,type EditorAction} from './editor-state';
const REF_A:DraftRef={v:1,kind:'macro_observation',id:OBS.unrateV1};
const REF_B:DraftRef={v:1,kind:'financial_fact',id:FACT.usOk},REF_C:DraftRef={v:1,kind:'financial_fact',id:FACT.cnPending};
const start=()=>reduce(emptyDraft({zh:'t',en:'t'}),{type:'addSection',key:'s1'});
const slot:ExpectedSlot={key:'gap',kind:'industry_metric',label:{zh:'行业',en:'Industry'},reason_code:'industry_not_published'};
it('assigns ordinals that never repeat after a removal',()=>{
 let b=reduce(emptyDraft({zh:'t',en:'t'}),{type:'addSection',key:'s1'});
 b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_A});b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_B});
 b=reduce(b,{type:'removeEvidence',ordinal:1});b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_C});
 expect(b.evidence.map(e=>e.ordinal)).toEqual([2,3]);expect(b.sections[0].items).toEqual([{ordinal:2},{ordinal:3}]);
});
it('refuses the same ref twice (ref_hash unique per version)',()=>{
 const b=reduce(start(),{type:'addEvidence',section:'s1',ref:REF_A});
 expect(b.evidence[0].ordinal).toBe(1);
 expect(reduce(b,{type:'addEvidence',section:'s1',ref:{...REF_A,locator:{ignored:'hint'}}})).toBe(b);
 expect(reduce(b,{type:'addEvidence',section:'s1',ref:{...REF_A,as_of:'2026-11-01T00:00:00.000Z'}}).evidence).toHaveLength(2);
});
it('replaceWithSlot swaps the first exact match in the named field only',()=>{
 let b=reduce(start(),{type:'setSectionNote',key:'s1',locale:'zh',value:'失业率为 4.3%。'});
 b=reduce(b,{type:'setDek',locale:'zh',value:'4.3%'});
 b=reduce(b,{type:'replaceWithSlot',field:'sections.s1.note.zh',match:'4.3%',ordinal:2});
 expect(b.sections[0].note?.zh).toBe('失业率为 {{ev:2}}。');expect(b.dek.zh).toBe('4.3%');
 b=reduce(b,{type:'setTitle',locale:'en',value:'4.3% 4.3%'});
 expect(reduce(b,{type:'replaceWithSlot',field:'title.en',match:'4.3%',ordinal:2}).title.en).toBe('{{ev:2}} 4.3%');
});
it('every reduced body still passes parseDraftBody',()=>{
 const actions:EditorAction[]=[{type:'addSection',key:'s1'},{type:'addSection',key:'s2'},{type:'setTitle',locale:'en',value:'Rates'},
  {type:'setSectionNote',key:'s1',locale:'zh',value:'说明'},{type:'addEvidence',section:'s1',ref:REF_A},{type:'addSlot',section:'s1',slot},
  {type:'moveItem',section:'s1',index:0,dir:1},{type:'moveSection',key:'s1',dir:1},{type:'addOwnerNote',key:'note'},
  {type:'setOwnerNote',key:'note',locale:'en',value:'Context'},{type:'removeEvidence',ordinal:1},{type:'removeSection',key:'s1'}];
 let b=emptyDraft({zh:'t',en:'t'});for(const action of actions){b=reduce(b,action);expect(parseDraftBody(b)).toEqual(b);}
});
it('rejects invalid and duplicate section keys and limits sections to twenty',()=>{
 let b=start();expect(reduce(b,{type:'addSection',key:'s1'})).toBe(b);expect(reduce(b,{type:'addSection',key:'Bad key'})).toBe(b);
 for(let n=2;n<=21;n++)b=reduce(b,{type:'addSection',key:`s${n}`});expect(b.sections).toHaveLength(20);
 expect(nextSectionKey(reduce(b,{type:'removeSection',key:'s2'}))).toBe('s2');
});
it('removes section evidence and slots without mutating the input',()=>{
 let b=reduce(start(),{type:'addEvidence',section:'s1',ref:REF_A});b=reduce(b,{type:'addSlot',section:'s1',slot});
 const next=reduce(b,{type:'removeSection',key:'s1'});expect(next.sections).toEqual([]);expect(next.evidence).toEqual([]);expect(next.expected_slots).toEqual([]);expect(b.evidence).toHaveLength(1);
});
it('removes evidence from items while keeping dangling slot text',()=>{
 let b=reduce(start(),{type:'addEvidence',section:'s1',ref:REF_A});b=reduce(b,{type:'setDek',locale:'en',value:'{{ev:1}}'});
 b=reduce(b,{type:'removeEvidence',ordinal:1});expect(b.sections[0].items).toEqual([]);expect(b.dek.en).toBe('{{ev:1}}');
});
it('clamps section and item moves at either end',()=>{
 let b=reduce(start(),{type:'addSection',key:'s2'});b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_A});b=reduce(b,{type:'addEvidence',section:'s1',ref:REF_B});
 expect(reduce(b,{type:'moveSection',key:'s1',dir:-1})).toEqual(b);expect(reduce(b,{type:'moveSection',key:'s2',dir:1})).toEqual(b);
 expect(reduce(b,{type:'moveItem',section:'s1',index:0,dir:-1})).toEqual(b);expect(reduce(b,{type:'moveItem',section:'s1',index:1,dir:1})).toEqual(b);
 expect(reduce(b,{type:'moveItem',section:'s1',index:0,dir:1}).sections[0].items).toEqual([{ordinal:2},{ordinal:1}]);
 expect(reduce(b,{type:'moveSection',key:'s1',dir:1}).sections.map(s=>s.key)).toEqual(['s2','s1']);
});
it('ignores duplicate slots and removes slot rows',()=>{
 const b=reduce(start(),{type:'addSlot',section:'s1',slot});expect(reduce(b,{type:'addSlot',section:'s1',slot})).toBe(b);
 const next=reduce(b,{type:'removeSlot',key:'gap'});expect(next.expected_slots).toEqual([]);expect(next.sections[0].items).toEqual([]);
});
it('creates and clears bilingual notes',()=>{
 let b=reduce(start(),{type:'setSectionNote',key:'s1',locale:'zh',value:'注'});expect(b.sections[0].note).toEqual({zh:'注',en:''});
 b=reduce(b,{type:'setSectionNote',key:'s1',locale:'en',value:'Note'});b=reduce(b,{type:'setSectionNote',key:'s1',locale:'zh',value:''});expect(b.sections[0].note?.en).toBe('Note');
 expect(reduce(b,{type:'setSectionNote',key:'s1',locale:'en',value:''}).sections[0].note).toBeNull();
});
it('adds valid unique owner notes and removes entries',()=>{
 const b=reduce(start(),{type:'addOwnerNote',key:'note'});expect(b.entries).toEqual([{key:'note',entry_type:'owner_note',body:{zh:'',en:''}}]);
 expect(reduce(b,{type:'addOwnerNote',key:'note'})).toBe(b);expect(reduce(b,{type:'addOwnerNote',key:'BAD'})).toBe(b);
 expect(reduce(b,{type:'removeEntry',key:'note'}).entries).toEqual([]);
});
it('addresses all owner text paths and inserts at a clamped caret',()=>{
 let b=reduce(start(),{type:'addOwnerNote',key:'note'});
 for(const field of ['title.zh','dek.en','sections.s1.note.zh','sections.s1.title.en','entries.note.body.zh']){
  const old=fieldText(b,field)??'';b=reduce(b,{type:'insertSlotText',field,at:999,ordinal:1,part:'period'});expect(fieldText(b,field)).toBe(`${old}{{ev:1.period}}`);
 }
 expect(fieldText(b,'sections.unknown.note.zh')).toBeNull();expect(reduce(b,{type:'insertSlotText',field:'unknown',at:0,ordinal:1,part:'value'})).toBe(b);
});
it('reviews promoted title on edit and owner note on confirmation',()=>{
 const body=start();body.blocks_provenance={title:'from_thesis','entry.from-thesis':'from_thesis'};
 const edited=reduce(body,{type:'setTitle',locale:'zh',value:'改写'});
 expect(edited.blocks_provenance.title).toBe('reviewed');
 expect(reduce(edited,{type:'confirmBlock',key:'entry.from-thesis'}).blocks_provenance['entry.from-thesis']).toBe('reviewed');
});
it('round trips an existing licensed entry through editing and save validation',()=>{
 const body=start();body.entries=[{entry_type:'licensed_excerpt',key:'quote',licence_id:OBS.unrateV1,fragments:[{text:'42',date:'2026-11-01',attribution:'Publisher',url:'https://example.org'}]}];
 const edited=reduce(body,{type:'setDek',locale:'en',value:'Updated'});
 expect(parseDraftBody(edited,new Set([OBS.unrateV1])).entries).toEqual(body.entries);
 expect(()=>parseDraftBody(edited,new Set())).toThrow('invalid_body:entries');
});
it('maps private blocks to the active editor field and clears disclosure check four',async()=>{
 const {unreviewedBlocks}=await import('./editor-state');
 const {scenario,actor}=await import('@/lib/topics/fixtures/scenario');
 const {checkDraft}=await import('@/lib/topics/publish');
 const {deps,topicId}=await scenario(),draft=(await deps.db.draftOf(topicId))!;
 draft.body.blocks_provenance={title:'from_thesis'};
 expect(unreviewedBlocks(draft.body,'en')).toEqual([{key:'title',field:'title.en',text:draft.body.title.en}]);
 const body=reduce(draft.body,{type:'confirmBlock',key:'title'});
 await deps.db.saveDraft({topicId,actor,expectedRevision:draft.revision,body});
 expect((await checkDraft(deps,{actor,topicId})).checks[3].result).toBe('pass');
});
