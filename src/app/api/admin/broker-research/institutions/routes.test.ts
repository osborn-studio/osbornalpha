// D6 admin maintenance routes: guards, parsing, ownership, append-only scales and audits (spec §8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {ADMIN_ID,memoryCoreDeps} from '@/lib/broker-research/testing';
import type {MemoryCore} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',()=>({coreDeps:()=>mocks.deps}));
vi.mock('@/lib/broker-research/admin-read',()=>({adminReadDeps:()=>mocks.deps}));
import {GET as LIST,POST as UPSERT} from './route';
import {GET as ONE} from './[institutionId]/route';
import {POST as SCALE} from './[institutionId]/scales/route';
import {POST as CLOSE} from './[institutionId]/scales/[scaleId]/close/route';
import {POST as ANALYST} from './[institutionId]/analysts/route';
const B='/api/admin/broker-research/institutions';
const MISSING='00000000-0000-4000-8000-00000000ffff';
const SCALE_BODY={raw_label:'Overweight',normalized:'overweight',source_url:'https://example.test/ratings',valid_from:'2020-01-01'};
describe('institution maintenance routes',()=>{
 let d:MemoryCore;let inst:string;
 beforeEach(async()=>{vi.clearAllMocks();d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});
  inst=await d.db.upsertInstitution({name_en:'Synthetic Securities',name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});});
 const ctx=<O extends Record<string,string>>(o:O={} as O)=>ctxOf({institutionId:inst,...o});
 adminGuardCases({call:r=>LIST(r,{}),request:()=>getReq(B),requireAdmin:mocks.requireAdmin,post:false});
 adminGuardCases({call:r=>UPSERT(r,{}),request:()=>jsonReq(B,{name_en:'X'}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:r=>ONE(r,ctx()),request:()=>getReq(`${B}/${inst}`),requireAdmin:mocks.requireAdmin,post:false});
 adminGuardCases({call:r=>SCALE(r,ctx()),request:()=>jsonReq(`${B}/${inst}/scales`,SCALE_BODY),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:r=>CLOSE(r,ctx({scaleId:MISSING})),request:()=>jsonReq(`${B}/${inst}/scales/${MISSING}/close`,{valid_to:'2026-01-01'}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:r=>ANALYST(r,ctx()),request:()=>jsonReq(`${B}/${inst}/analysts`,{display_name:'A'}),requireAdmin:mocks.requireAdmin,post:true});
 it('lists and upserts institutions; validates fields and writes audits',async()=>{
  const created=await UPSERT(jsonReq(B,{name_en:'Second Synthetic',aliases:['SS'],rating_disclosure_url:'https://example.test/d'}),{});
  expect(created.status).toBe(201);expect(created.headers.get('cache-control')).toBe('no-store');
  const {institutionId}=await bodyOf<{institutionId:string}>(created);
  expect((await bodyOf<{institutions:{institution_id:string}[]}>(await LIST(getReq(B),{}))).institutions.map(i=>i.institution_id)).toContain(institutionId);
  for(const [body,code] of [[{},'name_en'],[{name_en:' '},'name_en'],[{name_en:'X',aliases:[1]},'aliases'],[{name_en:'X',aliases:null},'aliases'],[{name_en:'X',aliases:[' ']},'aliases'],[{name_en:'X',rating_disclosure_url:'javascript:x'},'rating_disclosure_url'],[{name_en:'X',rating_disclosure_url:'https://'},'rating_disclosure_url'],[{name_en:'X',institution_id:'nope'},'institution_id']] as const){
   const r=await UPSERT(jsonReq(B,body),{});expect(r.status).toBe(400);expect(await errCode(r)).toBe(`invalid_parameter:${code}`);
  }
  expect((d.tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows('research_audit_log').map(x=>x.action)).toContain('broker_research.institution_upsert');
  expect((await UPSERT(jsonReq(B,{institution_id:inst,name_en:'Renamed',name_zh:'合成',kind:'broker'}),{})).status).toBe(201);
 });
 it('detail lists scales and analysts; rejects missing and invalid institutions',async()=>{
  const detail=await ONE(getReq(`${B}/${inst}`),ctx());expect(detail.status).toBe(200);
  expect(await bodyOf(detail)).toMatchObject({institution:{institution_id:inst},scales:[],analysts:[]});
  expect((await ONE(getReq(`${B}/${MISSING}`),ctxOf({institutionId:MISSING}))).status).toBe(404);
  expect((await ONE(getReq(B),ctxOf({institutionId:'bad'}))).status).toBe(400);
  for(const call of [()=>SCALE(jsonReq(B,SCALE_BODY),ctxOf({institutionId:MISSING})),()=>ANALYST(jsonReq(B,{display_name:'A'}),ctxOf({institutionId:MISSING}))])expect((await call()).status).toBe(404);
 });
 it('inserts and closes scale rows; validates normalized, dates, duplicates and ownership',async()=>{
  const r=await SCALE(jsonReq(B,SCALE_BODY),ctx());expect(r.status).toBe(201);
  const {scaleId}=await bodyOf<{scaleId:string}>(r);
  const duplicate=await SCALE(jsonReq(B,{...SCALE_BODY,raw_label:' overweight '}),ctx());expect(duplicate.status).toBe(409);expect(await errCode(duplicate)).toBe('duplicate_key');
  for(const [key,value] of [['normalized','strong_buy'],['valid_from','0000-01-01'],['valid_from','2020-13-01'],['valid_from','2021-02-29'],['source_url','ftp://example.test']] as const){
   const bad=await SCALE(jsonReq(B,{...SCALE_BODY,[key]:value}),ctx());expect(bad.status).toBe(400);expect(await errCode(bad)).toBe(`invalid_parameter:${key}`);
  }
  for(const valid_to of ['0000-01-01','2020-13-01','2021-02-29','2020-01-01','2019-12-31']){
   const bad=await CLOSE(jsonReq(B,{valid_to}),ctx({scaleId}));expect(bad.status).toBe(400);expect(await errCode(bad)).toBe('invalid_parameter:valid_to');
  }
  const other=await d.db.upsertInstitution({name_en:'Other',name_zh:null,aliases:[],kind:null,rating_disclosure_url:null});
  expect((await CLOSE(jsonReq(B,{valid_to:'2026-01-01'}),ctxOf({institutionId:other,scaleId}))).status).toBe(404);
  expect((await CLOSE(jsonReq(B,{valid_to:'2026-01-01'}),ctx({scaleId}))).status).toBe(200);
  expect((await d.db.listRatingScales(inst))[0]).toMatchObject({valid_to:'2026-01-01',closed_by:ADMIN_ID});
  const closed=await CLOSE(jsonReq(B,{valid_to:'2027-01-01'}),ctx({scaleId}));expect(closed.status).toBe(409);
 });
 it('upserts analysts with public_display default false; validates inputs and ownership',async()=>{
  const r=await ANALYST(jsonReq(B,{display_name:'Jane Placeholder',name_variants:['J. Placeholder']}),ctx());expect(r.status).toBe(201);
  const {analystId}=await bodyOf<{analystId:string}>(r);
  expect((await d.db.listAnalysts(inst))[0].public_display).toBe(false);
  expect((await ANALYST(jsonReq(B,{analyst_id:analystId,display_name:'Jane Placeholder',public_display:true}),ctx())).status).toBe(201);
  expect((await d.db.listAnalysts(inst))[0]).toMatchObject({analyst_id:analystId,public_display:true});
  for(const [body,key] of [[{display_name:''},'display_name'],[{display_name:'A',public_display:'yes'},'public_display'],[{display_name:'A',name_variants:[1]},'name_variants'],[{display_name:'A',analyst_id:'bad'},'analyst_id']] as const){
   const bad=await ANALYST(jsonReq(B,body),ctx());expect(bad.status).toBe(400);expect(await errCode(bad)).toBe(`invalid_parameter:${key}`);
  }
  const other=await d.db.upsertInstitution({name_en:'Other',name_zh:null,aliases:[],kind:null,rating_disclosure_url:null});
  expect((await ANALYST(jsonReq(B,{analyst_id:analystId,display_name:'Moved'}),ctxOf({institutionId:other}))).status).toBe(404);
 });
 it('committed writes survive best-effort audit failures; unexpected DB failures remain 500',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   vi.spyOn(d.tables,'insert').mockRejectedValueOnce(new Error('audit unavailable'));
   expect((await UPSERT(jsonReq(B,{name_en:'Audited'}),{})).status).toBe(201);
   vi.spyOn(d.db,'insertRatingScale').mockRejectedValueOnce(new Error('DB unavailable'));
   expect((await SCALE(jsonReq(B,SCALE_BODY),ctx())).status).toBe(500);
  }finally{log.mockRestore();}
 });
});

// Exercise the institution page through the shared admin gate and shell.
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/broker-research/institutions',redirect:(url:string)=>{throw new Error(`redirect:${url}`);},useRouter:()=>({refresh:vi.fn()})}));
vi.mock('next-intl/server',()=>({getTranslations:async()=>((key:string)=>key)}));
vi.mock('next-intl',()=>({useTranslations:()=>((key:string)=>key)}));
describe('institutions admin page',()=>{
 it('redirects signed-out users before reading institution data',async()=>{
  const {AdminUnauthenticated}=await import('@/lib/admin/auth');
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated());
  const {default:Page}=await import('@/app/(app)/admin/broker-research/institutions/page');
  await expect(Page()).rejects.toThrow('redirect:/login?next=%2Fadmin%2Fbroker-research%2Finstitutions');
 });
 it('denies non-admins before reading data',async()=>{
  const {AdminForbidden}=await import('@/lib/admin/auth');
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden());
  const {default:Page}=await import('@/app/(app)/admin/broker-research/institutions/page');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const d=memoryCoreDeps();mocks.deps=d;
  const read=vi.spyOn(d.db,'listInstitutions');
  const {AdminDenied}=await import('@/app/(app)/admin/broker-research/_shared/gate');
  expect((await Page()).type).toBe(AdminDenied);
  expect(renderToStaticMarkup(await AdminDenied())).toContain('title');
  expect(read).not.toHaveBeenCalled();
 });
 it('renders service-role institution details and remains dynamic',async()=>{
  const d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});
  const inst=await d.db.upsertInstitution({name_en:'Synthetic Broker',name_zh:'合成',aliases:['Alias'],kind:null,rating_disclosure_url:null});
  await d.db.insertRatingScale({institution_id:inst,...SCALE_BODY,normalized:'overweight',created_by:ADMIN_ID});
  await d.db.upsertAnalyst({institution_id:inst,display_name:'Synthetic Analyst',name_variants:[],public_display:false});
  const {default:Page,dynamic}=await import('@/app/(app)/admin/broker-research/institutions/page');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const html=renderToStaticMarkup(await Page());expect(dynamic).toBe('force-dynamic');
  for(const text of ['Synthetic Broker','Synthetic Analyst','Overweight','scales.note','analysts.public'])expect(html).toContain(text);
 });
});

// Validate the integrated production locales.
it('keeps shared zh/en messages and ICU parameters in parity',()=>{
 const fragments=['zh','en'].map(locale=>JSON.parse(readFileSync(`messages/${locale}/foreign-research.json`,'utf8')) as Record<string,unknown>);
 expect(fragments).toHaveLength(2);
 const flat=(tree:Record<string,unknown>,prefix=''):[string,string][]=>Object.entries(tree).flatMap(([key,value])=>typeof value==='string'?[[prefix+key,value] as [string,string]]:flat(value as Record<string,unknown>,`${prefix}${key}.`));
 const zh=flat(fragments[0]),en=new Map(flat(fragments[1]));
 expect(zh.map(([key])=>key).sort()).toEqual([...en.keys()].sort());
 for(const [key,value] of zh){
  expect(value.trim(),key).not.toBe('');expect(en.get(key)?.trim(),key).toBeTruthy();
  const params=(v:string)=>[...v.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort();
  expect(params(value),key).toEqual(params(en.get(key)!));
 }
 for(const key of ['admin.shell.nav_institutions','admin.institutions.deniedTitle','admin.institutions.deniedBody','admin.institutions.error','admin.institutions.analysts.confirm'])expect(en.has(key),key).toBe(true);
});

// Exercise the shared boundary policy locally without editing its commander-owned directory registry.
it('keeps server modules out of the institutions client graph',()=>{
 const root=process.cwd(),broker=path.join(root,'src/lib/broker-research');
 const forbidden=new Set(['public-read.ts','db.ts','pg-db.ts'].map(file=>path.join(broker,file)));
 const options:ts.CompilerOptions={moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:root,paths:{'@/*':['src/*']},allowJs:true};
 const seen=new Set<string>(),violations:string[]=[];
 function visit(file:string){
  if(forbidden.has(file)||file.startsWith(path.join(root,'src/lib/entities')+path.sep)){violations.push(file);return;}
  if(seen.has(file))return;seen.add(file);
  function dependency(specifier:string,typeOnly=false){
   if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))return;
   const target=ts.resolveModuleName(specifier,file,options,ts.sys).resolvedModule?.resolvedFileName;
   if(!target||!target.startsWith(path.join(root,'src')+path.sep))return;
   if(typeOnly&&!target.startsWith(broker+path.sep))return;
   visit(target);
  }
  function walk(node:ts.Node){
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text,node.importClause?.isTypeOnly);
   if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text,node.isTypeOnly);
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))){
    const arg=node.arguments[0];if(arg&&ts.isStringLiteral(arg))dependency(arg.text);
   }
   ts.forEachChild(node,walk);
  }
  walk(ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true));
 }
 visit(path.join(root,'src/app/(app)/admin/broker-research/institutions/InstitutionsClient.tsx'));
 expect(violations).toEqual([]);
});
