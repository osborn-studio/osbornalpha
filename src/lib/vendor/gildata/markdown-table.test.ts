// Cell spelling, including padding, is evidence.
import {it,expect} from 'vitest';
import {parseMarkdownTable} from './markdown-table';
it.each(['|---|:---:','|---|:---:|'])('accepts separator %s',sep=>{
 expect(parseMarkdownTable(['|a|b|',sep,'| 1 |-|','',''].join('\n'))).toEqual({header:['a','b'],rows:[[' 1 ','-']]});
});
it.each(['','|a|b|\n|---|---\n|1|','a|\n|---|','|a|\n|---|\n|1','|a|\n|abc|'])('rejects malformed table',md=>{
 expect(()=>parseMarkdownTable(md)).toThrow(expect.objectContaining({reason:'malformed_table'}));
});
