import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const read=(path:string)=>readFileSync(path,'utf8');
const files=['src/lib/topics','src/app/api/admin/topics','src/app/api/topics','src/lib/evidence'].flatMap(walk).filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts'));
const allowed=['src/lib/topics/private-ids.ts','src/lib/topics/promote.ts'];
it('limits private research access to the two session readers',()=>{
 expect(files.filter(f=>/\.(?:from|rpc)\s*\(\s*['"`]research_/.test(read(f))).sort()).toEqual(allowed);
});
it('pins every private table operation to a fixed select list',()=>{
 const operations=allowed.flatMap(f=>{
  const src=read(f);
  expect(src).not.toMatch(/\.rpc\s*\(|\.(?:insert|upsert|update|delete)\s*\(/);
  return [...src.matchAll(/\.from\s*\(\s*['"`](research_\w+)['"`]\s*\)\s*(?:\.select\(([^)]*)\))?/g)].map(m=>[m[1],m[2]]);
 });
 expect(operations.sort()).toEqual([['research_theses','PROMOTION_COPY_COLUMNS'],['research_theses','PROMOTION_COUNT_COLUMNS'],
  ...['research_theses','research_memos','research_source_documents','research_thesis_events'].map(t=>[t,"'id'"])].sort());
 const src=read(allowed[1]);
 expect(src).toMatch(/PROMOTION_COPY_COLUMNS\s*=\s*'title,body'/);
 expect(src).toMatch(/PROMOTION_COUNT_COLUMNS\s*=\s*'supporting_evidence_ids,invalidation_conditions,watch_metrics,pillars,catalysts,kill_condition_revisions,company_ids,theme_ids'/);
});
it('merges all pages under the session and fails closed on a private read error',async()=>{
 const {privateIds}=await import('./private-ids');
 let broken=false;
 const supabase={from:(table:string)=>({select:()=>({order:()=>{
  const page=(n:number)=>({limit:async()=>({data:n<2?[{id:table+n}]:[],error:broken&&table==='research_memos'?{message:'sensitive'}:null})});
  return {...page(0),gt:(_key:string,id:string)=>page(Number(id.slice(-1))+1)};
 }})})};
 expect(await privateIds(supabase)).toEqual(new Set(['research_theses','research_memos','research_source_documents','research_thesis_events'].flatMap(t=>[t+'0',t+'1'])));
 broken=true;await expect(privateIds(supabase)).rejects.toThrow(/^private_read_failed$/);
});
