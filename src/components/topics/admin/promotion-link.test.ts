import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('links once from the thesis page without a topic write',()=>{
 const src=readFileSync('src/app/(app)/research/theses/[id]/page.tsx','utf8');
 expect(src.match(/href=\{\x60\/admin\/topics\/new\?fromThesis=/g)).toHaveLength(1);
 expect(src).not.toMatch(/fetch\(['"]\/api\/admin\/topics['"],\s*\{[^}]*method:\s*['"](POST|PUT)/);
});
