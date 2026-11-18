// Topic plan T6.3: ten deterministic disclosure checks and safe receipt details.
import {expect,it} from 'vitest';
import {CHECK_KEYS,DISCLOSURE_VERSION,EXCERPT_CAPS,ownerTexts,runDisclosure,type DisclosureInput} from './disclosure';
import {assemble} from './assemble';
import {deps,input} from './fixtures/assemble';
import {ADVICE_TERMS} from './lexical';
const assembled=await assemble(deps,input);
function cleanInput(overrides:Partial<DisclosureInput>={}):DisclosureInput{
 return {draft:structuredClone(input.draft),assembled:structuredClone(assembled),privateIds:new Set(),summary:null,draftHash:'hash',settings:{summary_public_enabled:false,summary_provider_note:null},licences:new Map(),...overrides};
}
function withNote(i:DisclosureInput,text:string){i.draft.sections[0].note={zh:text,en:''};return i;}
function mostlyWithheld(){const i=cleanInput();i.assembled.snapshot.evidence.forEach(e=>{e.resolved.state='withheld';});return i;}
const summary=()=>({status:'approved' as const,draft_hash:'hash',provider:'Example',model:'model'});
const excerpt=()=>({key:'excerpt',entry_type:'licensed_excerpt' as const,licence_id:'licence',fragments:[{text:'短文',attribution:'Source',date:'2026-11-14',url:'https://example.com'}]});
const approved=()=>new Map([['licence',{status:'approved' as const,permits:{display_excerpt:true}}]]);
const failures:{codes:string[];change:(i:DisclosureInput)=>void}[]=[
 {codes:['kind_unsupported'],change:i=>{i.assembled.snapshot.evidence[0].resolved.state='unsupported';}},
 {codes:['mostly_withheld'],change:i=>{i.assembled.snapshot.evidence.forEach(e=>{e.resolved.state='withheld';});}},
 {codes:['private_reference'],change:i=>{withNote(i,'见 /research/private');}},
 {codes:['unreviewed_private_block'],change:i=>{i.draft.blocks_provenance.note='from_thesis';}},
 {codes:['numeral_in_owner_text'],change:i=>{withNote(i,'失业率为 4.3%');}},
 {codes:['excerpt_violation'],change:i=>{i.draft.entries.push(excerpt());}},
 {codes:['dangling_slot'],change:i=>{withNote(i,'{{ev:99}}');}},
 {codes:['summary_provider_unconfirmed','summary_provider_mismatch'],change:i=>{i.summary=summary();}},
 {codes:['resolver_degraded'],change:i=>{i.assembled.degraded=true;}},
 {codes:['empty_dossier'],change:i=>{i.draft.evidence=[];i.draft.expected_slots=[];i.assembled.snapshot.evidence=[];i.assembled.snapshot.expected_slots=[];}},
];
it.each(CHECK_KEYS)('%s passes on clean input and reports its failure codes',key=>{
 const n=CHECK_KEYS.indexOf(key),i=cleanInput();
 expect(runDisclosure(i).checks[n]).toMatchObject({result:'pass',codes:[]});
 failures[n].change(i);expect(runDisclosure(i).checks[n]).toMatchObject({result:n===1?'warn':'block',codes:failures[n].codes});
});
it('returns the ten checks in order and passes only with no block',()=>{
 const r=runDisclosure(cleanInput());
 expect(r.checks.map(c=>[c.id,c.key])).toEqual(CHECK_KEYS.map((k,i)=>[i+1,k]));expect([r.passed,r.blocked,r.warnings]).toEqual([true,[],[]]);
 expect(DISCLOSURE_VERSION).toBe('topic-disclosure/1');expect(EXCERPT_CAPS).toEqual({zhChars:120,enWords:60,fragments:3});
});
it('D10: mostly withheld warns and still passes',()=>{const r=runDisclosure(mostlyWithheld());expect([r.passed,r.warnings]).toEqual([true,['mostly_withheld']]);});
it('A13: an owner source-document id in the text blocks with private_reference',()=>{
 const id='5b3f6c1e-5d0a-4f43-9a55-1d3f0c2b9a10';
 const r=runDisclosure(withNote(cleanInput({privateIds:new Set([id])}),`见 ${id}`));
 expect(r.blocked).toEqual(expect.arrayContaining(['private_reference','identifier_in_text']));
 expect(JSON.stringify(r.checks)).not.toContain(id);
});
it('A8: an unsupported broker ref blocks with kind_unsupported',()=>{
 const i=cleanInput(),e=i.assembled.snapshot.evidence[0];e.ref.kind='broker_report_meta';e.resolved.state='unsupported';
 expect(runDisclosure(i).blocked).toEqual(['kind_unsupported']);
});
it('stores no owner text in the receipt detail, only codes, fields and counts',()=>{
 const r=runDisclosure(withNote(cleanInput(),'失业率为 4.3%'));expect(JSON.stringify(r.checks)).not.toContain('失业率');
 expect(JSON.stringify(r.checks)).not.toContain('4.3');
 expect(r.checks[4].detail).toEqual({findings:expect.arrayContaining([{field:'sections.macro.note.zh',code:'numeral_in_owner_text'}]),counts:{numeral_in_owner_text:expect.any(Number)}});
});
it('records audience counts at the strict half boundary and empty dossier counts',()=>{
 const i=cleanInput();i.assembled.snapshot.evidence.forEach((e,n)=>{e.resolved.state=n<2?'withheld':'ok';});
 expect(runDisclosure(i).checks[1]).toMatchObject({result:'pass',detail:{withheld:2,total:4}});
 expect(runDisclosure(i).checks[9].detail).toEqual({evidence:4,expected_slots:1});
 i.assembled.snapshot.evidence=[];i.draft.evidence=[];
 expect(runDisclosure(i).checks[9].result).toBe('pass');
});
it.each(['ABCDEFAB-ABCD-ABCD-ABCD-ABCDEFABCDEF','A'.repeat(64)])('detects identifier shapes without storing the match',id=>{
 const r=runDisclosure(withNote(cleanInput(),`见 ${id}`));
 expect(r.checks[2]).toMatchObject({result:'block',codes:['identifier_in_text'],detail:{findings:[{field:'sections.macro.note.zh',code:'identifier_in_text'}]}});
 expect(JSON.stringify(r.checks)).not.toContain(id);
});
it('ignores slot digits for fingerprints and records raw dangling tokens',()=>{
 const i=withNote(cleanInput({privateIds:new Set(['1'])}),'{{ev:1}} {{ev:99.period}}');
 const r=runDisclosure(i);expect(r.checks[2].result).toBe('pass');expect(r.checks[4].result).toBe('pass');
 expect(r.checks[6].detail).toEqual({findings:[{field:'sections.macro.note.zh',slot:'{{ev:99.period}}'}]});
});
it('covers both locales and every owner text field, with lexical codes stripped of matches',()=>{
 const i=cleanInput();i.draft.title.en=ADVICE_TERMS[0];i.draft.entries[0]={key:'note',entry_type:'owner_note',body:{zh:'必然',en:'2026'}};
 const fields=ownerTexts(i.draft).map(t=>t.field);
 expect(fields).toEqual(['title.zh','title.en','dek.zh','dek.en','sections.macro.title.zh','sections.macro.title.en','sections.macro.note.zh','sections.macro.note.en','entries.note.body.zh','entries.note.body.en']);
 const r=runDisclosure(i);expect(r.checks[4].codes).toEqual(expect.arrayContaining(['advice_term','forbidden_term','numeral_in_owner_text']));
 expect(JSON.stringify(r.checks)).not.toContain(ADVICE_TERMS[0]);expect(JSON.stringify(r.checks)).not.toContain('必然');
});
it('validates summary approval, draft identity, switch and case-insensitive provider note',()=>{
 const i=cleanInput();expect(runDisclosure(i).checks[7].detail).toEqual({attached:false});
 i.summary=summary();i.settings={summary_public_enabled:true,summary_provider_note:'Terms for EXAMPLE confirmed'};
 expect(runDisclosure(i).checks[7]).toMatchObject({result:'pass',codes:[]});
 for(const status of ['generated','discarded'] as const){i.summary={...summary(),status};expect(runDisclosure(i).checks[7].codes).toEqual(['summary_mismatch']);}
 i.summary={...summary(),draft_hash:'other'};expect(runDisclosure(i).checks[7].codes).toEqual(['summary_mismatch']);
 i.summary=summary();i.settings.summary_provider_note=null;expect(runDisclosure(i).checks[7].codes).toEqual(['summary_provider_mismatch']);
});
it('enforces excerpt approval, caps, attribution, date and https link',()=>{
 const i=cleanInput({licences:approved()});i.draft.entries=[excerpt()];
 expect(runDisclosure(i).checks[5].result).toBe('pass');
 for(const text of ['中'.repeat(121),Array(61).fill('word').join(' ')]){
  i.draft.entries=[{...excerpt(),fragments:[{...excerpt().fragments[0],text}]}];expect(runDisclosure(i).checks[5].codes).toEqual(['excerpt_violation']);
 }
 for(const text of ['中'.repeat(120),Array(60).fill('word').join(' ')]){
  i.draft.entries=[{...excerpt(),fragments:[{...excerpt().fragments[0],text}]}];expect(runDisclosure(i).checks[5].result).toBe('pass');
 }
 for(const field of ['attribution','date','url'] as const){i.draft.entries=[{...excerpt(),fragments:[{...excerpt().fragments[0],[field]:''}]}];expect(runDisclosure(i).checks[5].codes).toEqual(['excerpt_violation']);}
 i.draft.entries=[{...excerpt(),fragments:Array(4).fill(excerpt().fragments[0])}];expect(runDisclosure(i).checks[5].result).toBe('block');
 i.draft.entries=[{...excerpt(),fragments:[{...excerpt().fragments[0],url:'http://example.com'}]}];expect(runDisclosure(i).checks[5].result).toBe('block');
 i.draft.entries=[excerpt()];
 for(const status of ['pending','revoked'] as const){i.licences=new Map([['licence',{status,permits:{display_excerpt:true}}]]);expect(runDisclosure(i).checks[5].result).toBe('block');}
 i.licences=new Map([['licence',{status:'approved',permits:{display_excerpt:false}}]]);expect(runDisclosure(i).checks[5].result).toBe('block');
});
it('deduplicates blocking codes in check order and keeps warnings separate',()=>{
 const i=mostlyWithheld();i.draft.title.zh='见 /research/private';i.draft.dek.zh='见 /research/other';i.assembled.degraded=true;
 const r=runDisclosure(i);expect(r.blocked).toEqual(['private_reference','resolver_degraded']);expect(r.warnings).toEqual(['mostly_withheld']);expect(r.passed).toBe(false);
});
