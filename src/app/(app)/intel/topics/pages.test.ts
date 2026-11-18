// Topic directory source constraints (spec §7.1).
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const files=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?files(p):[p];});
it('gates the directory before data reads',()=>{
 const s=read('src/app/(app)/intel/topics/page.tsx');
 expect(s).toContain('notFound()');expect(s.indexOf('topicsEnabled()')).toBeGreaterThan(-1);
 expect(s.indexOf('topicsEnabled()')).toBeLessThan(s.indexOf('await publicDeps()'));
});
it('uses shared components, tokens and numeric typography',()=>{
 const s=read('src/components/topics/directory/DirectoryClient.tsx');
 expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);expect(s).toContain('@/components/research-ui');
 const card=read('src/components/topics/directory/TopicCard.tsx');
 expect(card).toContain('font-mono tabular-nums');
 for(const f of files('src/components/topics').filter(f=>f.endsWith('.tsx')))expect(read(f)).not.toMatch(/<ResearchChain\b/);
});
