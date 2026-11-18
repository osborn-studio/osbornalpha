// Phone dossier layout (spec §7.2, M-Topic).
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
it('replaces the table with touch-sized evidence cards on phones',()=>{
 const source=readFileSync('src/components/topics/dossier/EvidenceTable.tsx','utf8');
 expect(source).toContain('md:hidden');expect(source).toContain('hidden md:block');
 expect(source).toContain('min-h-[44px]');
});
it('does not impose a fixed width above the phone canvas',()=>{
 for(const file of readdirSync('src/components/topics/dossier').filter(f=>f.endsWith('.tsx'))){
  const source=readFileSync(`src/components/topics/dossier/${file}`,'utf8');
  for(const match of source.matchAll(/(?:min-|max-)?w-\[(\d+)px\]/g))expect(Number(match[1]),file).toBeLessThanOrEqual(390);
 }
});

it('uses a compact line strip with HTML labels and endpoint ticks',()=>{
 const s=readFileSync('src/components/topics/dossier/SeriesBlock.tsx','utf8');
 expect(s).toContain('h-[120px]');expect(s).toContain('strokeWidth="1.5"');expect(s).toContain('text-[11px] text-text-muted font-mono tabular-nums');
 expect(s).toContain('data-series-point');expect(s).not.toContain('<text');expect(s).toContain('preserveAspectRatio="none"');expect(s).toContain('m.points.at(-1)');
});
it('judgment chips contain only lifecycle, calibration and method',()=>{
 const s=readFileSync('src/components/topics/dossier/JudgmentBlock.tsx','utf8');
 expect(s).not.toContain('<TopicBadge');expect(s).toContain('formatDossierDate(registered)');
});
it('footer uses dossier attribution without extra requests and labels datasets',()=>{
 const s=readFileSync('src/components/topics/dossier/DossierFooter.tsx','utf8');
 expect(s).not.toContain('fetch(');expect(s).toContain('f.label');expect(s).toContain('FreshnessChip');
});
