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
