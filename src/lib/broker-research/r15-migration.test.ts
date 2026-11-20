import {readdirSync,readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const dir='supabase/migrations',file='20261212090000_broker_research_r15.sql';
const read=(f:string)=>readFileSync(dir+'/'+f,'utf8').replace(/--[^\n]*/g,'').toLowerCase();

it('adds only the four service-role functions and preserves retired functions',()=>{
 const sql=read(file),outer=sql.replace(/\$\$[\s\S]*?\$\$/g,'$$');
 expect(sql).not.toMatch(/\b(drop|alter|create\s+(table|view|trigger|index|policy))\b/);
 const statements=outer.split(';').map(s=>s.trim()).filter(Boolean);
 expect(statements).toHaveLength(12);
 for(const s of statements)expect(s).toMatch(/^(create or replace function|revoke execute on function|grant execute on function) /);
 expect(outer).not.toMatch(/\b(insert|update|delete)\b/);
 const signatures=['broker_report_unpublish_logged(uuid, uuid, text)','broker_summary_approve(uuid, uuid, jsonb)','broker_report_bind(uuid, jsonb, jsonb)','broker_publication_snapshot_ok(uuid)'];
 for(const sig of signatures){
  const name=sig.split('(')[0];
  expect(outer).toContain('create or replace function public.'+name+'(');
  expect(statements).toContain('revoke execute on function public.'+sig+' from public, anon, authenticated');
  expect(statements).toContain('grant execute on function public.'+sig+' to service_role');
  const retired=new RegExp('\\bdrop\\s+function\\s+(?:if\\s+exists\\s+)?public\\.'+name+'\\s*\\(');
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<file))expect(read(f),f).not.toMatch(retired);
 }
});
