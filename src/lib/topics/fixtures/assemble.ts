// Topic plan T6.1–T6.3: isolated assembly inputs.
import {memoryResolver} from '@/lib/evidence';
import {allFixtures} from '@/lib/evidence/fixtures';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {FACT} from '@/lib/evidence/fixtures/facts';
import {memorySources} from '@/lib/evidence/memory-sources';
import {createResolver} from '@/lib/evidence/resolve';
import {macroResolver} from '@/lib/evidence/resolvers/macro';
import {factResolver} from '@/lib/evidence/resolvers/fact';
import type {EvidenceKind} from '@/lib/evidence/ref';
import type {AssembleInput} from '../assemble';
export const cutoff='2026-11-14T00:00:00.000Z';
export const deps={resolver:memoryResolver(allFixtures()),now:()=>new Date(cutoff)};
export const input:AssembleInput={topic:{slug:'rates-and-banks',category:'macro'},cutoff,summary:null,draft:{
 title:{zh:'利率与银行',en:'Rates and banks'},dek:{zh:'证据概览',en:'Evidence overview'},
 sections:[{key:'macro',title:{zh:'宏观证据',en:'Macro evidence'},note:{zh:'截至 {{ev:1.period}}，失业率为 {{ev:1}}。',en:'As of {{ev:1.period}}, unemployment was {{ev:1}}.'},items:[{ordinal:1},{ordinal:2},{ordinal:3},{ordinal:4},{expected_slot:'industry'}]}],
 evidence:[{ordinal:1,ref:{v:1,kind:'macro_observation',id:OBS.unrateV1},section_key:'macro'},
 {ordinal:2,ref:{v:1,kind:'financial_fact',id:FACT.usOk},section_key:'macro'},
 {ordinal:3,ref:{v:1,kind:'financial_fact',id:FACT.cnPending},section_key:'macro'},
 {ordinal:4,ref:{v:1,kind:'macro_observation',id:OBS.orphan},section_key:'macro'}],
 expected_slots:[{key:'industry',kind:'industry_metric',label:{zh:'行业指标',en:'Industry metric'},reason_code:'industry_not_published'}],
 entries:[{key:'note',entry_type:'owner_note',body:{zh:'观察证据',en:'Observe evidence'}}],blocks_provenance:{note:'owner'},
}};
export function withAsOf(i:AssembleInput,ordinal:number,as_of:string):AssembleInput{
 const copy=structuredClone(i);copy.draft.evidence.find(e=>e.ordinal===ordinal)!.ref.as_of=as_of;return copy;
}
export function failingFor(kind:EvidenceKind){
 const sources=memorySources(allFixtures()),macro=macroResolver(sources),fact=factResolver(sources);
 return createResolver([macro,fact].map(r=>r.kind===kind?{...r,resolve:async()=>{throw new Error('fixture_failure');}}:r));
}
