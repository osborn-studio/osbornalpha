// src/components/industries/design-tokens.test.ts
// Static DESIGN.md guard over every industry component and page (spec §8 conventions, canvas notes):
// tokens only (no hex / rgb literals), brass as the single accent, no market red/green on industry
// metrics, no purple/indigo, no gradients, no spinners or "Loading…" text, numbers in Geist Mono with
// tabular figures, and every chart paired with a table.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOTS=['src/components/industries','src/app/(app)/intel/industries'];
function files(dir:string):string[]{
 let out:string[]=[];
 let entries:string[]=[];
 try{entries=readdirSync(dir);}catch{return out;}
 for(const e of entries){const p=join(dir,e);if(statSync(p).isDirectory())out=out.concat(files(p));else if(p.endsWith('.tsx'))out.push(p);}
 return out;
}
/** Code only: comments may name what is banned. */
const stripComments=(s:string)=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
const SOURCES=ROOTS.flatMap(r=>files(join(process.cwd(),r))).map(p=>({p,src:stripComments(readFileSync(p,'utf8'))}));

describe('industry UI follows DESIGN.md tokens',()=>{
 it('finds the components',()=>expect(SOURCES.length).toBeGreaterThanOrEqual(9));
 it.each(SOURCES.map(s=>[s.p.split('/src/')[1],s.src]))('%s: no hard-coded colours, no signal colours, no purple, no gradients, no spinners',(_,src)=>{
  expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(src).not.toMatch(/\brgba?\(/);
  expect(src).not.toMatch(/\b(text|bg|border|fill|stroke)-(up|down|bullish|bearish|red|green|emerald|rose)\b/);
  expect(src).not.toMatch(/purple|violet|indigo/);
  expect(src).not.toMatch(/gradient/);
  expect(src).not.toMatch(/animate-spin|Loading…|Loading\.\.\./);
 });
 it('numbers are Geist Mono with tabular figures where values render',()=>{
  for(const name of ['CoverageCell.tsx','Heatmap.tsx','SeriesChart.tsx','PercentileBar.tsx','SourceDrawer.tsx']){
   const s=SOURCES.find(x=>x.p.endsWith(`/${name}`));
   expect(s,name).toBeDefined();
   expect(s!.src).toContain('font-mono');
   expect(s!.src).toContain('tabular-nums');
  }
 });
 it('the series chart always renders its table equivalent',()=>{
  const s=SOURCES.find(x=>x.p.endsWith('/SeriesChart.tsx'))!.src;
  expect(s).toContain('<table');
  expect(s).toContain("t('detail.tableEquivalent')");
 });
});
