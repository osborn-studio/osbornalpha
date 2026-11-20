import {expect,it} from 'vitest';
import {licenceForm,offersExcerpt} from './licence-model';
const input={source_title:'Source',publisher:'Publisher',source_url:'https://example.org',terms_url:'https://example.org/terms',terms_read_at:'2026-11-01',terms_clause:'May quote',status:'approved',permits:{display_excerpt:true,attribution_required:false,max_fragments:100,link_required:true}};
it('fixes attribution and caps and requires HTTPS',()=>{
 expect(licenceForm(input).permits).toMatchObject({attribution_required:true,max_fragments:3,max_words_en:60,max_chars_zh:120});
 expect(()=>licenceForm({...input,source_url:'http://example.org'})).toThrow();
});
it('offers the excerpt type only after source approval',()=>{
 const approved={status:'approved' as const,permits:{display_excerpt:true}};
 expect(offersExcerpt([])).toBe(false);expect(offersExcerpt([{...approved,status:'revoked'}])).toBe(false);
 expect(offersExcerpt([approved])).toBe(true);
 const unticked={...approved,permits:{display_excerpt:false}};expect(offersExcerpt([unticked])).toBe(false);
});
it('lists only the registered permissions in display order',async()=>{
 const {permissionKeys}=await import('./licence-model');
 expect(permissionKeys({display_excerpt:true,link_required:true})).toEqual(['excerpt','credit','link']);
 expect(permissionKeys({display_excerpt:false,link_required:false,attribution_required:false})).toEqual([]);
});
