import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {it,expect} from 'vitest';
it('keeps vendor cron unscheduled',()=>expect(readFileSync('vercel.json','utf8')).not.toContain('industry-vendor-sync'));
it('limits vendor imports in application code to the two authorized routes',()=>{
 const allowed=['src/app/api/admin/industries/vendor/route.ts','src/app/api/cron/industry-vendor-sync/route.ts'];
 function walk(dir:string){
  for(const f of readdirSync(dir,{withFileTypes:true})){
   const path=join(dir,f.name);
   if(f.isDirectory()){walk(path);continue;}
   if(!/\.[cm]?[jt]sx?$/.test(path)||allowed.includes(path))continue;
   for(const [,spec] of readFileSync(path,'utf8').matchAll(/(?:from\s*|import\s*\(?\s*|require\(\s*)['"]([^'"]+)['"]/g)){
    const target=resolve(spec.startsWith('@/')?'src':dirname(path),spec.replace(/^@\//,''));
    expect(target,path).not.toMatch(/\/src\/lib\/(?:industry\/)?vendor(?:\/|$)/);
   }
  }
 }
 walk('src/app');walk('src/components');
});

it('keeps vendor modules out of shared caches',()=>{
 for(const root of ['src/lib/industry/vendor','src/lib/vendor']){
  for(const file of readdirSync(root,{recursive:true,encoding:'utf8'})){
   if(!/\.[cm]?[jt]sx?$/.test(file))continue;
   const path=join(root,file);
   const body=readFileSync(path,'utf8');
   expect(body,path).not.toMatch(/(?:from\s*|import\s*\(?\s*|require\(\s*)['"][^'"]*(?:stale-views|next\/cache)[^'"]*['"]/);
   expect(body,path).not.toMatch(/\bunstable[_]cache\b/);
  }
 }
});
