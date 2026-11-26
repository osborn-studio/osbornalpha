// src/app/(app)/intel/industries/pages.test.ts
// The industry pages are auth-gated server components: they must be force-dynamic (same production
// regression as src/app/(app)/dynamic-rendering.test.ts) and must not be client components.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=join(process.cwd(),'src/app/(app)/intel/industries');
const PAGES=['page.tsx','[scheme]/[code]/page.tsx','[scheme]/[code]/constituents/page.tsx'];

describe('industry pages are dynamic server components',()=>{
 it.each(PAGES)('%s',rel=>{
  const src=readFileSync(join(ROOT,rel),'utf8');
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toContain('SourceDrawerProvider');
  expect(src).not.toContain('generateMetadata');
 });
});


describe('industry research foundation integration',()=>{
 it.each(PAGES.slice(0,2))('%s selects the reconstruction basis and snapshot date once',rel=>{
  const src=readFileSync(join(ROOT,rel),'utf8');
  expect(src).toContain('bodySic');
  expect(src).toContain('bodySw');
  expect(src).toMatch(/scheme\s*===\s*['"]sic['"]/);
  expect(src).toMatch(/membershipOn\s*\?\?\s*v\.header\.factsAsOf/);
  expect(src.match(/<StateNotice\s+kind="reconstruction"/g)).toHaveLength(1);
  expect(src).not.toContain('kind="snapshotConstituents"');
 });
 it.each(PAGES.slice(0,2))('%s uses the shared header and provenance footer',rel=>{
  const src=readFileSync(join(ROOT,rel),'utf8');
  expect(src).toContain('<PageHeader');
  expect(src).toContain('freshness=');
  expect(src).toContain('factsAsOf');
  expect(src).toContain('<ResearchFooter');
  expect(src).not.toContain('SourcesFooter');
  expect(src).not.toContain('@/components/industries/FreshnessChip');
 });
});

it('keeps level navigation reachable when there is no aggregate header',()=>{
 const src=readFileSync(join(ROOT,'page.tsx'),'utf8');
 expect(src).toContain('!header&&<SchemeLevelSwitch');
});
