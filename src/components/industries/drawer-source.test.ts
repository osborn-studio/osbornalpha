// src/components/industries/drawer-source.test.ts
// Structural guards for the .tsx components (repo convention: no DOM renderer; these read the source).
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const src=(f:string)=>readFileSync(new URL(`./${f}`,import.meta.url),'utf8');

describe('source drawer accessibility',()=>{
 const drawer=src('SourceDrawer.tsx');
 it('is a native modal dialog that handles cancel (Escape) and restores focus through presentModal',()=>{
  expect(drawer).toContain('<dialog');
  expect(drawer).toContain('presentModal(');
  expect(drawer).toMatch(/onCancel=\{e=>\{e\.preventDefault\(\);onClose\(\);\}\}/);
  expect(drawer).not.toContain('role="dialog"');
 });
 it('chart dots are removed from the tab order and the accessibility tree',()=>{
  expect(drawer).toMatch(/<circle[^>]*tabIndex=\{-1\}[^>]*aria-hidden="true"/);
  expect(drawer).not.toMatch(/<circle[^>]*role="button"/);
 });
});

describe('list table', ()=>{
 it('renders the YoY companion through the coverage-aware CoverageCell, never formatting raw values itself',()=>{
  const table=src('ListTable.tsx');
  expect(table).not.toContain('formatMetricValue');
  expect(table).toMatch(/<CoverageCell cell=\{y\}/);
 });
});
