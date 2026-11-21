import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {PROMPT_VERSION,promptText} from '../explain-request';
import {MACRO_EXPLAIN_PROMPTS} from './macro-explain-v1';

it.each([
 ['en',1798,'4493f96aae8484ac9b32f4400deba56dfc2a4dcf0ef6201f60dd4fd3edda8693'],
 ['zh',1781,'2e401a7ef59e905c0769af19d4faf86dcc16557bd9621d060361d5a69bbb8a01'],
] as const)('preserves the versioned %s prompt bytes',(locale,size,hash)=>{
 const bytes=Buffer.from(MACRO_EXPLAIN_PROMPTS[locale],'utf8');
 expect(bytes.byteLength).toBe(size);
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
 expect(PROMPT_VERSION).toBe('macro-explain-prompt/1');
 expect(promptText(locale)).toBe(MACRO_EXPLAIN_PROMPTS[locale]);
});

it('uses bundled prompts without filesystem loading',()=>{
 const dir=join(process.cwd(),'src/lib/macro/strategy');
 expect(readFileSync(join(dir,'explain-request.ts'),'utf8')).not.toMatch(/readFileSync|node:fs|import\.meta\.url/);
 expect(readdirSync(join(dir,'prompts'),{recursive:true,encoding:'utf8'}).filter(f=>f.endsWith('.md'))).toEqual([]);
});
