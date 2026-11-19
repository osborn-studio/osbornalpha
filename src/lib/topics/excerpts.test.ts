import {expect,it} from 'vitest';
import {excerptViolations} from './excerpts';
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
 expect(JSON.stringify(ownerTexts({...emptyDraft({zh:'',en:''}),entries:[entry]}))).not.toContain('word');
});
