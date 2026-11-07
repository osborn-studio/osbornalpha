// Production text surfaces of P3/P4 never use the forbidden vocabulary (spec §1.1 criterion 2, §10, §12 / N11).
// Scanned: the strategy library (non-test .ts, minus explain-validate.ts whose policy constants hold the list, minus the
// test-only testing/ helpers), its data/** and prompts/**, the strategy components, the macroStrategy messages, the
// strategy API routes and cron, and the four pages. Chinese terms match as substrings; English terms on word
// boundaries, case-insensitive (the validator's rule). Validator counter-examples live only in explain-validate.test.ts.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';
import {FORBIDDEN_TERMS} from './explain-validate';
const ROOT=process.cwd();
const walk=(dir:string):string[]=>{
 const abs=join(ROOT,dir);
 if(!existsSync(abs))return [];
 return (readdirSync(abs,{recursive:true}) as string[]).map(f=>join(abs,f)).filter(f=>/\.(ts|tsx|md|json)$/.test(f));
};
const isTest=(f:string)=>/\.test\.tsx?$/.test(f);
const SURFACES:{name:string;files:string[];min:number}[]=[
 {name:'library',files:walk('src/lib/macro/strategy').filter(f=>/\.(ts|md)$/.test(f)&&!isTest(f)&&!f.endsWith('/explain-validate.ts')&&!f.includes('/testing/')),min:20},
 {name:'components',files:walk('src/components/macro/strategy').filter(f=>/\.tsx?$/.test(f)&&!isTest(f)),min:15},
 {name:'messages',files:['messages/zh/macroStrategy.json','messages/en/macroStrategy.json'].map(f=>join(ROOT,f)),min:2},
 {name:'routes',files:[...walk('src/app/api/macro/strategy'),...walk('src/app/api/cron/macro-review')].filter(f=>f.endsWith('/route.ts')),min:9},
 {name:'pages',files:['transmission','history','review'].flatMap(d=>walk(`src/app/(app)/intel/macro/${d}`)).filter(f=>f.endsWith('/page.tsx')),min:4},
];
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const MATCHERS=FORBIDDEN_TERMS.map(term=>({term,re:/[^\x00-\x7f]/.test(term)?new RegExp(escape(term)):new RegExp(`\\b${escape(term)}\\b`,'i')}));
describe('forbidden vocabulary on production text surfaces',()=>{
 it('the term list is the validator policy constant and is not empty',()=>{expect(FORBIDDEN_TERMS.length).toBeGreaterThan(10);});
 for(const s of SURFACES)it(`${s.name}: no forbidden term`,()=>{
  expect(s.files.length).toBeGreaterThanOrEqual(s.min);
  const hits:string[]=[];
  for(const f of s.files){
   readFileSync(f,'utf8').split('\n').forEach((line,i)=>{for(const m of MATCHERS)if(m.re.test(line))hits.push(`${relative(ROOT,f)}:${i+1} ${m.term}`);});
  }
  expect(hits).toEqual([]);
 });
});
