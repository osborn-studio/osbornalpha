// src/lib/topics/vocabulary-scan.test.ts
// Advice wording is spelled only in the validator and its tests (spec §8.2, §13.2 "静态扫描").
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const ALLOW=new Set(['src/lib/topics/lexical.ts','src/lib/topics/lexical.test.ts','src/lib/topics/vocabulary-scan.test.ts','src/lib/topics/messages-parity.test.ts']);
const ROOTS=['src/lib/topics','src/lib/evidence','src/components/topics','src/app/(app)/intel/topics','src/app/(app)/admin/topics','src/app/api/topics','src/app/api/admin/topics'];
const walk=(d:string):string[]=>{try{return readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});}catch{return [];}};
const BANNED=/买入|卖出|推荐|增持|减持|目标价|建仓|抄底|\b(buy|sell|recommend|overweight|underweight|target price|accumulate)\b/i;
it('no topic source file spells an advice term outside the validator',()=>{
 const hits=ROOTS.flatMap(walk).filter(f=>/\.(ts|tsx|md)$/.test(f)&&!ALLOW.has(f)&&!f.includes('/fixtures/')).filter(f=>BANNED.test(readFileSync(f,'utf8')));
 expect(hits).toEqual([]);
});
