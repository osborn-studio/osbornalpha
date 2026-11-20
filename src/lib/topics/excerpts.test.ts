import {expect,it} from 'vitest';
import {excerptPermitted,excerptViolations,maskExcerpts} from './excerpts';
import {ownerTexts,emptyDraft} from './drafts';
const fragment={text:'引'.repeat(120)+' word'.repeat(60),url:'https://example.org',date:'2026-11-01',attribution:'Author'};
const entry={key:'quote',entry_type:'licensed_excerpt' as const,licence_id:'source',fragments:Array(3).fill(fragment)};
const approved={status:'approved',permits:{display_excerpt:true}};
it('enforces both fragment limits, permissions and credits',()=>{
 expect(excerptViolations(entry,approved)).toEqual([]);
 for(const edit of [{text:fragment.text+'字'},{text:fragment.text+' word'},{attribution:''},{date:''},{url:'http://example.org'}])
  expect(excerptViolations({...entry,fragments:[{...fragment,...edit}]},approved)).toContain('excerpt_violation');
 expect(excerptViolations({...entry,fragments:Array(4).fill(fragment)},approved)).toContain('excerpt_violation');
 expect(excerptViolations(entry,{...approved,status:'pending'})).toContain('excerpt_violation');
 expect(excerptViolations(entry,{status:'approved',permits:{display_excerpt:false}})).toEqual(['excerpt_violation']);
 expect(JSON.stringify(ownerTexts({...emptyDraft({zh:'',en:''}),entries:[entry]}))).not.toContain('word');
});

it('permits display only for approved licences with a boolean true permission',()=>{
 expect(excerptPermitted(approved)).toBe(true);
 for(const licence of [{...approved,status:'revoked'},{...approved,status:'pending'},
  ...[false,'true'].map(display_excerpt=>({...approved,permits:{display_excerpt}})),{...approved,permits:{}},undefined])
  expect(excerptPermitted(licence)).toBe(false);
});
it('clones allowed and already-masked entries and withholds denied or unknown excerpts',()=>{
 const quote={...entry,fragments:[fragment]},note={key:'note',entry_type:'owner_note' as const,body:{en:'Note',zh:'注'}};
 const masked={key:'quote',entry_type:'licensed_excerpt' as const,masked:true as const,reason:'licence_revoked' as const,
  attributions:[{attribution:'Author',url:'https://example.org'}]};
 const allowed=new Map([[quote.licence_id,true]]);
 const [shown,owner]=maskExcerpts([quote,note],allowed);
 expect(shown).toEqual(quote);expect(shown).not.toBe(quote);expect(owner).toEqual(note);
 for(const permissions of [new Map([[quote.licence_id,false]]),new Map<string,boolean>()])
  expect(maskExcerpts([quote],permissions)).toEqual([masked]);
 const [again]=maskExcerpts([masked],allowed);expect(again).toEqual(masked);expect(again).not.toBe(masked);
});
