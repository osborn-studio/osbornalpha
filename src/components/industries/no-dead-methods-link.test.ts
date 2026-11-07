// Codex batch7 P2: /intel/methods does not exist (F4 owns it) — the industry pages must not link to it.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('methods registry placeholder',()=>{
 it.each(['src/components/industries/JudgmentArea.tsx','src/app/(app)/intel/industries/page.tsx'])('%s has no /intel/methods href',f=>{
  expect(readFileSync(f,'utf8')).not.toMatch(/href=["'{`]+\/intel\/methods/);
 });
 it.each(['zh','en'])('%s methodsLink is plain text without an arrow',l=>{
  const v=JSON.parse(readFileSync(`messages/${l}/industries.json`,'utf8')).judgments.methodsLink as string;
  expect(v).toBe(l==='zh'?'方法注册表（F4 上线后可用）':'Methods registry (with F4)');
 });
});
