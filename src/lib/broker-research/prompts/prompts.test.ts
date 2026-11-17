// Ensures the runtime prompt exactly matches its reviewed source (spec §4.3).
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EXTRACT_PROMPT} from './index';
describe('prompt constants equal reviewed Markdown',()=>{
 it('broker-extract.v1',()=>expect(EXTRACT_PROMPT).toBe(readFileSync(new URL('./broker-extract.v1.md',import.meta.url),'utf8')));
});
it('independent-summary.v1',async()=>expect((await import('./index')).SUMMARY_PROMPT).toBe(readFileSync(new URL('./independent-summary.v1.md',import.meta.url),'utf8')));
it('summary prompt has four sections',async()=>{const {SUMMARY_PROMPT}=await import('./index');for(const h of ['## 报告定位','## 核心结论','## 方法论','## 风险与边界'])expect(SUMMARY_PROMPT).toContain(h);});
