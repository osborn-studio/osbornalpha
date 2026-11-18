// Topic plan PR-5 fix 1: production entry files load fixtures only dynamically.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]).filter(p=>!p.endsWith('.test.ts'));
const entries=[
 'src/lib/topics/admin-deps.ts','src/lib/topics/admin-route.ts','src/lib/topics/admin-fixture-mode.ts',
 ...files('src/app/api/admin/topics'),...files('src/app/(app)/admin/topics'),...files('src/components/topics/admin'),
];
it.each(entries)('%s has no static fixture dependency',path=>{
 const source=readFileSync(path,'utf8');
 const paths=[...source.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
 expect(paths.filter(p=>/admin-fixture(?!-mode)|\/fixtures|memory-db|memory-sources/.test(p))).toEqual([]);
});
it('loads admin fixtures with a dynamic import',()=>{
 expect(readFileSync('src/lib/topics/admin-deps.ts','utf8')).toMatch(/import\(['"]\.\/admin-fixture['"]\)/);
});
