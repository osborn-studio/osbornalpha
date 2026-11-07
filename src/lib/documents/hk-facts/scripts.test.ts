import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {sha256Hex} from '../extract/pages-json';
import {syntheticPagesJson} from '../fixtures/hkex/_synthetic/build';
import {main as evaluate} from '../../../../scripts/documents/eval-hk-facts';
import {main as validate} from '../../../../scripts/documents/validate-extraction';
import {offlineHkCandidates,recordedOfflineDoc} from './eval';
import type {HkGoldFile} from './eval';

const mocks=vi.hoisted(()=>({admin:vi.fn(),pdf:vi.fn()}));
vi.mock('../../supabase/admin',()=>({getAdminSupabase:mocks.admin}));
vi.mock('../extract/pdf',()=>({extractPdf:mocks.pdf}));
vi.mock('../../facts/deps',()=>({resolveCodeVersion:()=> 'test'}));
let dir:string;let args:string[];let out:string;
const bytes=new TextEncoder().encode('recorded fake PDF');const sha=sha256Hex(bytes);
const pages=syntheticPagesJson('interim-zh-bs-years');
function setup(value='1500000000'){
 const fixtures=join(dir,'fixtures');mkdirSync(fixtures);
 writeFileSync(join(fixtures,'interim.pages.json'),JSON.stringify({doc_class:'interim_report',content_sha256:sha,source_url:'https://example.invalid/fixture.pdf',page_count:pages.pages.length,pages_json:{...pages,content_sha256:sha}}));
 const gold:HkGoldFile={version:1,ready:false,required:{HK:true},issuers:[],entries:[
  {issuer:{ticker:'0268.HK'},concept:'total_assets',period_start:null,period_end:'2025-06-30',duration:'INSTANT',unit:'HKD',value,source:{document_sha256:sha,page:1,line_text:'資產總值'},recorded_by:'test',recorded_at:'2026-11-06'},
  {issuer:{ticker:'0268.HK'},concept:'total_assets',period_start:null,period_end:'2024-06-30',duration:'INSTANT',unit:'HKD',value:'missing',source:{document_sha256:sha,page:1,line_text:'2024'},recorded_by:'test',recorded_at:'2026-11-06'},
 ]};
 const goldPath=join(dir,'gold.json');writeFileSync(goldPath,JSON.stringify(gold));out=join(dir,'reports','result.json');args=['--gold',goldPath,'--fixtures',fixtures,'--out',out];
}
function report(){return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)![0]));}
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'hk-script-'));vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(process,'exit').mockImplementation((code)=>{throw new Error(`exit:${code}`);});vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes)));mocks.pdf.mockResolvedValue({pages:pages.pages,hasTextLayer:true});});
afterEach(()=>{rmSync(dir,{recursive:true,force:true});vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('audit script regressions',()=>{
 it('rejects interim year-only comparatives using the recorded classification',async()=>{
  const result=await offlineHkCandidates(pages,recordedOfflineDoc({doc_class:'interim_report',content_sha256:sha},'interim'));
  expect(result.info).toContainEqual(expect.objectContaining({message:'BS:interim_year_only'}));
  expect(result.candidates.some(c=>c.natural_key.includes('2024-06-30'))).toBe(false);
 });
 it.each([false,true])('evaluation writes only with apply=%s and preserves interim classification',async apply=>{
  setup();await evaluate([...args,'--source','fixtures',...(apply?['--apply']:[])]);
  expect(existsSync(join(dir,'reports'))).toBe(apply);
  const r=report();expect(r.mismatches).toEqual([]);expect(r.recall).toBe('1');
  if(apply)expect(JSON.parse(readFileSync(out,'utf8'))).toEqual(r);
 });
 it.each([false,true])('validation writes only with apply=%s and reports gold agreement',async apply=>{
  setup();expect(await validate([...args,...(apply?['--apply']:[])])).toBe(0);
  expect(existsSync(join(dir,'reports'))).toBe(apply);
  expect(report()).toMatchObject({ok:true,bytes_text_ok:true,gold_ok:true,evaluation:{mismatches:[]}});
  if(apply)expect(JSON.parse(readFileSync(out,'utf8'))).toEqual(report());
 });
 it('matching bytes/text with wrong gold fails validation',async()=>{
  setup('999');expect(await validate(args)).toBe(1);
  expect(report()).toMatchObject({ok:false,bytes_text_ok:true,gold_ok:false});expect(report().evaluation.mismatches).not.toEqual([]);
 });
 it('database evaluation preserves the from receiver',async()=>{
  setup();const tables:Record<string,unknown[]>={disclosure_documents:[{current_extraction_id:'e'}],document_extractions:[{extraction_id:'e',extractor_version:pages.extractor_version,table_algo_version:pages.table_algo_version,code_version:'test',created_at:'2026-11-06T00:00:00Z',candidates_lease_until:null}],document_candidates:[]};
  const client={tables,rpc:async()=>({data:{rows:[],next_cursor:null,row_count:0},error:null}),from(table:string){const data=this.tables[table]??[];const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,gt:()=>query,maybeSingle:async()=>({data:data[0],error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return query;}};
  mocks.admin.mockReturnValue(client);await evaluate(args);expect(report().source).toBe('db');
 });
});
