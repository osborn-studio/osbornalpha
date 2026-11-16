import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {JUDGMENT_TYPES as routeJudgmentTypes,UUID_RE as routeUuidRe} from '@/lib/judgments/route-utils';
import {JUDGMENT_TYPES as wireJudgmentTypes,UUID_RE as wireUuidRe} from '@/lib/judgments/wire';

describe('company judgment client boundary',()=>{
 it('shares the route judgment types through a client-safe module',()=>{
  expect(wireJudgmentTypes).toEqual(routeJudgmentTypes);
  expect(wireUuidRe).toBe(routeUuidRe);
  const company=readFileSync(fileURLToPath(new URL('./judgments.ts',import.meta.url)),'utf8');
  expect(company).toMatch(/import \{JUDGMENT_TYPES,UUID_RE\} from ['"]@\/lib\/judgments\/wire['"]/);
  expect(company).not.toMatch(/from ['"]@\/lib\/judgments\/(?:route-utils|deps)['"]/);
  expect(company).not.toMatch(/from ['"]@\/lib\/judgments\/contract['"]/);
 });
});
