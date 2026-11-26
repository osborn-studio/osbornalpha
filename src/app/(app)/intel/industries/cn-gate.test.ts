import {createElement} from 'react';
import {renderToReadableStream} from 'react-dom/server';
import {NextIntlClientProvider,createTranslator} from 'next-intl';
import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import industries from '../../../../../messages/en/industries.json';
import research from '../../../../../messages/en/research.json';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {memoryVendorIndustryDb} from '@/lib/industry/vendor/db';
import {fixtureDirSource} from '@/lib/industry/vendor/fixtures-dir';
import {runGildataFinancials,runGildataMemberships} from '@/lib/industry/vendor/ingest';
import {SW2021_L1_GILDATA} from '@/lib/industry/vendor/sw2021-gildata-codes';
import {memoryVendorRawStore} from '@/lib/vendor/raw-store';
import List from './page';
import Detail from './[scheme]/[code]/page';
import Members from './[scheme]/[code]/constituents/page';

vi.mock('server-only',()=>({}));
vi.mock('@/lib/industry/page-data',async original=>({...await original<typeof import('@/lib/industry/page-data')>(),
 loadView:()=>{throw Error('SW page used the legacy read model');}}));
vi.mock('next-intl/server',()=>({getLocale:async()=>'en',getTranslations:async(namespace:'industries'|'research')=>
 createTranslator({locale:'en',messages:{industries,research},namespace})}));
vi.mock('@/lib/industry/vendor/page-deps',()=>({vendorPageDeps:()=>deps}));

const code='801080.SI',db=memoryVendorIndustryDb(),tables=memoryTableClient();
const deps={db,tables,isSignedIn:async()=>true,isAdmin:vi.fn(async()=>true),now:new Date('2026-11-24Z')};
const markers=new Set<string>();
beforeAll(async()=>{
 for(const dataset_key of ['scheme:sw2021:2021','vendor:gildata:industry-financials'])
  await tables.insert('industry_dataset_licenses',{dataset_key,status:'internal'});
 const ingest={db,tables,raw:memoryVendorRawStore(),codeVersion:'gate-test',now:()=>deps.now,
  source:fixtureDirSource('src/lib/vendor/gildata/fixtures'),universe:SW2021_L1_GILDATA.filter(i=>i.indexCode===code)};
 const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
 for(const run of [runGildataFinancials,runGildataMemberships])expect((await run(ingest,opts)).status).toBe('success');
 const fin=(await db.activeRun('financials'))!,members=(await db.activeRun('memberships'))!;
 const [item]=await db.membershipsOfRun(members.run_id,code);
 const [revenue]=await db.observationsOfRun(fin.run_id,{code,metric:'revenue_cum',from:'2025-12-31',to:'2025-12-31'});
 const [evidence]=await db.retrievalsByIds([revenue.retrieval_id!]);
 for(const marker of ['Electronics',item.security_name,revenue.value_text!,evidence.sha256,fin.run_id,evidence.fetched_at])markers.add(marker);
});
beforeEach(async()=>{vi.restoreAllMocks();await tables.update('industry_dataset_licenses',{status:'public'},{status:'internal'});deps.isAdmin.mockResolvedValue(true);deps.db=db});
async function renderPages(requestCode=code,search:Record<string,string>={}){
 const params=Promise.resolve({scheme:'sw2021',code:requestCode}),searchParams=Promise.resolve({scheme:'sw2021',...search});
 const trees=await Promise.all([List({searchParams}),Detail({params,searchParams}),Members({params,searchParams})]);
 return Promise.all(trees.map(async tree=>{
  const stream=await renderToReadableStream(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{industries,research},children:tree}));
  await stream.allReady;
  return {html:await new Response(stream).text(),props:JSON.stringify(tree.props)};
 }));
}
it.each(['non-admin','licence missing','scheme:sw2021:2021','vendor:gildata:industry-financials','admin throws','licence throws'])('withholds every route when %s',async failure=>{
 if(failure.includes(':')){
  await tables.update('industry_dataset_licenses',{status:'internal'},{status:'public'});
  await tables.update('industry_dataset_licenses',{dataset_key:failure},{status:'internal'});
  deps.isAdmin.mockResolvedValue(false);
 }
 if(failure==='non-admin')deps.isAdmin.mockResolvedValue(false);
 if(failure==='admin throws')deps.isAdmin.mockRejectedValue(Error('session'));
 if(failure==='licence missing')vi.spyOn(tables,'select').mockResolvedValue([]);
 if(failure==='licence throws')vi.spyOn(tables,'select').mockRejectedValue(Error('licence'));
 const touched=vi.fn(()=>{throw Error('withheld vendor read')});
 deps.db=new Proxy(db,{get:touched});
 for(const requestCode of [code,'unknown!']){
  for(const {html,props} of await renderPages(requestCode)){
   expect(html.toLowerCase()).toContain('withheld');
   expect(html).not.toMatch(/data-source-button|<table|animate-pulse/);
   for(const marker of markers)expect(html+props).not.toContain(marker);
  }
 }
 expect(touched).not.toHaveBeenCalled();
});
it('passes fixture provenance to the admin components',async()=>{
 const pages=await renderPages();
 for(const {html} of pages){expect(html).toContain('Electronics');expect(html).toContain('data-state="adminPreview"');}
 const serialized=pages.map(p=>p.html+p.props).join('');
 for(const marker of markers)expect(serialized).toContain(marker);
});
it('returns a retry notice after an authorized read fails',async()=>{
 vi.spyOn(db,'activeRun').mockRejectedValue(Error('private failure'));
 for(const {html,props} of await renderPages()){
  expect(html.toLowerCase()).toContain('retry');
  expect(html+props).not.toContain('private failure');
 }
});

it('answers notFound on an unknown code only for an authorized viewer',async()=>{
 const params=Promise.resolve({scheme:'sw2021',code:'unknown!'}),searchParams=Promise.resolve({});
 const active=vi.spyOn(db,'activeRun');
 for(const Page of [Detail,Members])await expect(Page({params,searchParams})).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
 expect(active).not.toHaveBeenCalled();
});

it('keeps the cell values and reasons identical in both list displays',async()=>{
 const [grid]=await renderPages();
 const [table]=await renderPages(code,{view:'table'});
 const cellLabels=(html:string)=>[...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*data-source-button/g)].map(match=>match[1]);
 const cells=cellLabels(grid.html);
 expect(cells.length).toBeGreaterThan(1);
 expect(cells.some(label=>label.includes('no prior period'))).toBe(true);
 expect(cellLabels(table.html)).toEqual(cells);
 expect(table.html).toContain('Source ▸');
 for(const page of [table,grid])expect(page.html).not.toMatch(/<th[^>]*>Coverage/);
 const [stages]=await renderPages(code,{view:'stages'});
 expect(stages.html).toContain('No stage method published');
 expect(stages.html).not.toContain('data-cn-grid');
});
it('shows the first-sync notice on an authorized empty run',async()=>{
 vi.spyOn(db,'activeRun').mockResolvedValue(null);
 for(const {html} of await renderPages()){
  expect(html).toContain('data-state="empty"');
  expect(html).toContain('data-state="adminPreview"');
  expect(html).not.toContain('data-source-button');
 }
});

it('shows public provenance and immediately withholds it after a licence reverts',async()=>{
 deps.isAdmin.mockResolvedValue(false);
 await tables.update('industry_dataset_licenses',{status:'internal'},{status:'public'});
 const pages=await renderPages();
 for(const {html} of pages){
  expect(html).toContain('Electronics');expect(html).toContain('data-source-button');
  expect(html).toContain('Gildata · Datamap');expect(html).not.toContain('(internal,');
  expect(html).not.toMatch(/data-state="adminPreview"|internal preview/i);
 }
 for(const marker of markers)expect(pages.map(p=>p.html+p.props).join('')).toContain(marker);
 await tables.update('industry_dataset_licenses',{dataset_key:'scheme:sw2021:2021'},{status:'internal'});
 const touched=vi.fn(()=>{throw Error('vendor read');});
 deps.db=new Proxy(db,{get:touched});
 for(const {html,props} of await renderPages()){
  expect(html.toLowerCase()).toContain('withheld');
  for(const marker of markers)expect(html+props).not.toContain(marker);
 }
 expect(touched).not.toHaveBeenCalled();
});
it('renders public empty pages without the preview notice',async()=>{
 deps.isAdmin.mockResolvedValue(false);
 await tables.update('industry_dataset_licenses',{status:'internal'},{status:'public'});
 vi.spyOn(db,'activeRun').mockResolvedValue(null);
 for(const {html} of await renderPages()){
  expect(html).toContain('data-state="empty"');expect(html).not.toMatch(/data-state="adminPreview"|internal preview/i);
 }
});
