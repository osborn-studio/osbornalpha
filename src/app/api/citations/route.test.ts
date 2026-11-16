// src/app/api/citations/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({anon:null as unknown,citationsByIds:vi.fn(),documentById:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>mocks.anon}));
vi.mock('@/lib/documents/db',()=>({supabaseDocumentsDb:()=>({citationsByIds:mocks.citationsByIds,documentById:mocks.documentById})}));

import {GET} from './route';

const FACT='f0000000-0000-4000-8000-000000000001',FILING='90000000-0000-4000-8000-000000000001',DOC='d0000000-0000-4000-8000-000000000001',EXT='e0000000-0000-4000-8000-000000000001';
type Rows=Record<string,Record<string,unknown>[]>;
/** Minimal PostgREST-shaped anon client: from(t).select().eq().order() is thenable; maybeSingle resolves the first row. */
function fakeAnon(data:Rows,failOn?:string,cap=Infinity){
 return {from:(t:string)=>{
  let rows=[...(data[t]??[])];let sortBy:string[]=[];let win:[number,number]|null=null;
  const result=()=>{
   if(failOn===t)return {data:null,error:{message:'boom'}};
   let out=[...rows];
   if(sortBy.length)out.sort((a,b)=>{for(const k of sortBy){const x=String(a[k]),y=String(b[k]);if(x!==y)return x<y?-1:1;}return 0;});
   const [lo,hi]=win??[0,Infinity];out=out.slice(lo,hi+1).slice(0,cap);
   return {data:out,error:null};
  };
  const q:Record<string,unknown>={};
  Object.assign(q,{select:()=>q,eq:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return q;},order:(k:string)=>{sortBy.push(k);return q;},range:(lo:number,hi:number)=>{win=[lo,hi];return q;},
   maybeSingle:async()=>failOn===t?{data:null,error:{message:'boom'}}:{data:rows[0]??null,error:null},
   then:(ok:(v:unknown)=>unknown,ko:(e:unknown)=>unknown)=>Promise.resolve(result()).then(ok,ko)});
  return q;
 }};
}
const BASE:Rows={
 financial_facts:[{fact_id:FACT,concept:'revenue',period_start:'2025-01-01',period_end:'2025-12-31',unit:'CNY',value_text:'6256000000',filing_id:FILING,status:'ok'}],
 filings:[{filing_id:FILING,mapping_gen:1}],
 fact_citations:[{fact_id:FACT,role:'value',citation_id:'c-v'},{fact_id:FACT,role:'label',citation_id:'c-l'},{fact_id:FACT,role:'unit',citation_id:'c-u'},{fact_id:FACT,role:'period',citation_id:'c-t'},{fact_id:FACT,role:'period',citation_id:'c-h'}],
};
const cite=(id:string,page:number)=>({citation_id:id,document_id:DOC,extraction_id:EXT,page_no:page});
const get=(qs:string)=>GET(new Request(`https://alpha.example/api/citations?${qs}`));

describe('GET /api/citations?factId=',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.anon=fakeAnon(BASE);mocks.documentById.mockResolvedValue({document_id:DOC,permission:'public'});mocks.citationsByIds.mockImplementation(async(ids:string[])=>ids.map(id=>cite(id,id==='c-v'?7:6)));});
 it('returns the fact and its evidence, one entry per fact_citations row in (role, citation_id) order (spec §12 example 3)',async()=>{
  const res=await get(`factId=${FACT}`);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=600$/);
  const body=await res.json();
  expect(body).toMatchObject({factId:FACT,concept:'revenue',periodStart:'2025-01-01',periodEnd:'2025-12-31',unit:'CNY',valueText:'6256000000'});
  expect(body.citations).toEqual([
   {role:'label',citationId:'c-l',documentId:DOC,extractionId:EXT,pageNo:6},{role:'period',citationId:'c-h',documentId:DOC,extractionId:EXT,pageNo:6},
   {role:'period',citationId:'c-t',documentId:DOC,extractionId:EXT,pageNo:6},{role:'unit',citationId:'c-u',documentId:DOC,extractionId:EXT,pageNo:6},
   {role:'value',citationId:'c-v',documentId:DOC,extractionId:EXT,pageNo:7}]);
  expect(mocks.citationsByIds).toHaveBeenCalledWith(['c-l','c-h','c-t','c-u','c-v']);
 });
 it('pages the fact_citations links past a server row cap (1,203 links, cap 1,000) in (role, citation_id) order',async()=>{
  const many=Array.from({length:1203},(_,i)=>({fact_id:FACT,role:i%2?'period':'unit',citation_id:`c-${String(i).padStart(4,'0')}`}));
  mocks.anon=fakeAnon({...BASE,fact_citations:many},undefined,1000);
  mocks.citationsByIds.mockImplementation(async(ids:string[])=>ids.map(id=>cite(id,1)));
  const body=await (await get(`factId=${FACT}`)).json();
  expect(body.citations).toHaveLength(1203);
  expect(new Set(body.citations.map((c:{citationId:string})=>c.citationId)).size).toBe(1203);
  const roles=body.citations.map((c:{role:string})=>c.role);
  expect(roles).toEqual([...roles].sort());   // role-major order survives the paging
 });
 it('drops citations RLS does not show (§4.12)',async()=>{
  mocks.citationsByIds.mockImplementation(async(ids:string[])=>ids.filter(i=>i!=='c-l').map(id=>cite(id,6)));
  const body=await (await get(`factId=${FACT}`)).json();
  expect(body.citations.map((c:{role:string})=>c.role)).toEqual(['period','period','unit','value']);
 });
 it('drops citations of a document that is not public, even if the database returned them',async()=>{
  mocks.documentById.mockResolvedValue({document_id:DOC,permission:'licensed'});
  const res=await get(`factId=${FACT}`);
  expect(res.status).toBe(200);expect((await res.json()).citations).toEqual([]);
  mocks.documentById.mockResolvedValue(null);
  expect((await (await get(`factId=${FACT}`)).json()).citations).toEqual([]);
 });
 it('404 for an unknown or non-ok fact and for a fact whose filing was never published (mapping_gen 0)',async()=>{
  mocks.anon=fakeAnon({...BASE,financial_facts:[]});
  const a=await get(`factId=${FACT}`);expect(a.status).toBe(404);expect(a.headers.get('cache-control')).toBe('no-store');
  mocks.anon=fakeAnon({...BASE,filings:[{filing_id:FILING,mapping_gen:0}]});
  expect((await get(`factId=${FACT}`)).status).toBe(404);
 });
 it('400 unless exactly one uuid factId is given',async()=>{
  for(const qs of ['',`factId=x`,`factId=${FACT}&factId=${FACT}`]){
   const res=await get(qs);expect(res.status,qs).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:factId');
  }
 });
 it('400 on an unknown parameter (a cache-buster) before any read',async()=>{
  const res=await get(`factId=${FACT}&x=1`);
  expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:x');
  expect(mocks.citationsByIds).not.toHaveBeenCalled();
 });
 it('500 with a code only when a read fails',async()=>{
  mocks.anon=fakeAnon(BASE,'fact_citations');
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await get(`factId=${FACT}`);
  expect(res.status).toBe(500);expect((await res.json()).error.code).toBe('citations_unavailable');
  spy.mockRestore();
 });
});
