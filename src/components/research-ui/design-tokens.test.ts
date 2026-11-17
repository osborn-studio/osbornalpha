// Static token and public-entry guard for every shared research component.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const root='src/components/research-ui';
function files(dir:string):string[] {
 return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.tsx?$/.test(e.name)&&!e.name.endsWith('.test.ts')?[join(dir,e.name)]:[]);
}
it('exports the public components and types from one entry',()=>{
 const source=readFileSync(join(root,'index.ts'),'utf8');
 for(const name of ['ResearchChain','StateBadge','StateCell','MarkTag','MarkCard','MarkLegend','PageHeader','FreshnessChip','ChartTableSwitch','ResearchFooter','chain','states','marks','chart-gaps','source-drawer/SourceDrawer','source-drawer/types'])expect(source).toContain(`'./${name}'`);
});
it.each(files(root))('%s follows design tokens',path=>{
 const source=readFileSync(path,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
 expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
 expect(source).not.toMatch(/\brgba?\(/);
 expect(source).not.toMatch(/\b(text|bg|border|fill|stroke)-(up|down|bullish|bearish|red|green|emerald|rose)\b/);
 expect(source).not.toMatch(/purple|violet|indigo|gradient|animate-spin|Loading…|Loading\.\.\./);
});
