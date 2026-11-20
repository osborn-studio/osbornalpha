// src/lib/topics/licence-mask-migration.test.ts
import {readdirSync,readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const directory='supabase/migrations',migration='20261211090000_topics_excerpt_licence_mask.sql';
const views=['topic_licence_status_public_v','topic_versions_public_v'];
const read=(file:string)=>readFileSync(`${directory}/${file}`,'utf8').replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,' ').toLowerCase();
function events(sql:string){
 // Trigger names are scoped to the table named after ON, rather than schema-qualified themselves.
 const ddl=/\b(create(?:\s+or\s+replace)?|drop)\s+(?:(function|view|table)\s+(?:if\s+(?:not\s+)?exists\s+)?public\.(\w+)|trigger\s+(?:if\s+exists\s+)?(\w+)\b[^;]*?\bon\s+public\.(\w+))/g;
 return [...sql.matchAll(ddl)].map(([statement,action,kind,name,trigger,table])=>
  ({statement,action,kind:kind??'trigger',name:name??`${table}.${trigger}`}));
}
it('replaces exactly two existing views with owner execution and a security barrier',()=>{
 const sql=read(migration),history=new Map<string,string>();
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')&&f<migration).sort())
  for(const e of events(read(file)))history.set(e.kind+' '+e.name,e.action);
 const changes=events(sql);
 expect(changes.map(e=>e.kind+' '+e.name).sort()).toEqual(views.map(v=>'view '+v));
 expect(sql.match(/\bcreate\s+/g)).toHaveLength(2);
 for(const e of changes){
  expect(history.get('view '+e.name),e.name).toMatch(/^create/);
  expect(e.action).toMatch(/^create\s+or\s+replace$/);
  const options=sql.slice(sql.indexOf(e.statement)+e.statement.length).match(/^\s*with\s*\(([^)]*)\)/)?.[1];
  expect(options).toMatch(/\bsecurity_invoker\s*=\s*false\b/);expect(options).toMatch(/\bsecurity_barrier\s*=\s*true\b/);
 }
 expect(sql).not.toMatch(/\b(?:create(?:\s+or\s+replace)?\s+function|drop\s+|alter\s+table|security\s+definer)\b/);
});
it('restates only the two views’ client privileges',()=>{
 const sql=read(migration).replace(/\s+/g,' ');
 const revoked:string[]=[],granted:string[]=[];
 function collect(statement:string,targets:string,dest:string[],index:number){
  if(targets.includes('%i')){
   const loop=sql.slice(0,index).match(/foreach (\w+) in array array\s*\[([^\]]+)\]\s*loop(?:(?!end loop|foreach ).)*$/);
   expect(loop,statement).toBeTruthy();
   expect(targets.trim()).toBe('public.%i');
   expect(sql.slice(index+statement.length)).toMatch(new RegExp("^' *, *"+loop![1]+" *\\)"));
   dest.push(...[...loop![2].matchAll(/'(\w+)'/g)].map(m=>m[1]));
  }else{
   for(const name of targets.split(','))dest.push(name.trim().replace(/^public\./,''));
  }
 }
 const grants=[...sql.matchAll(/\bgrant select on (?:table )?([^;']+?) to authenticated *, *service_role(?=\s*[';])/g)];
 const revokes=[...sql.matchAll(/\brevoke all(?: privileges)? on (?:table )?([^;']+?) from public *, *anon *, *authenticated *, *service_role(?=\s*[';])/g)];
 expect(sql.match(/\bgrant\s/g)?.length).toBe(grants.length);
 expect(sql.match(/\brevoke\s/g)?.length).toBe(revokes.length);
 for(const m of grants)collect(m[0],m[1],granted,m.index!);
 for(const m of revokes)collect(m[0],m[1],revoked,m.index!);
 expect(granted.sort()).toEqual(views);expect(revoked.sort()).toEqual(views);
});
// Lock ordering is enforced by migrationInventory (scripts/ci/research-checks.ts); this file is appended to the lock after it is applied.
