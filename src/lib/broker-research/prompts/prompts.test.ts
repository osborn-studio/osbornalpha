// Ensures the runtime prompt exactly matches its reviewed source (spec §4.3).
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EXTRACT_PROMPT} from './index';
describe('prompt constants equal reviewed Markdown',()=>{
 it('broker-extract.v1',()=>expect(EXTRACT_PROMPT).toBe(readFileSync(new URL('./broker-extract.v1.md',import.meta.url),'utf8')));
});
