// src/app/(app)/intel/industries/pages.test.ts
// The industry pages are auth-gated server components: they must be force-dynamic (same production
// regression as src/app/(app)/dynamic-rendering.test.ts) and must not be client components.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=join(process.cwd(),'src/app/(app)/intel/industries');
const PAGES=['page.tsx'];

describe('industry pages are dynamic server components',()=>{
 it.each(PAGES)('%s',rel=>{
  const src=readFileSync(join(ROOT,rel),'utf8');
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toContain('SourceDrawerProvider');
 });
});
