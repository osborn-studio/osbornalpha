// src/lib/entities/cninfo-org-id.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryRawStore} from '../dq/raw-store';
import {CninfoLookupError,cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from './cninfo-org-id';

const USCI='91520000214434146R';
const issuer=(id:string,o:Record<string,unknown>)=>({issuer_id:id,status:'active',merged_into:null,usci:USCI,cninfo_org_id:null,lei:null,cik:null,canonical_name_zh:'测试',canonical_name_en:null,provenance:{usci:{source:'test'}},updated_at:'2026-01-01T00:00:00Z',...o});
const sec=(issuer_id:string,ticker:string,o:Record<string,unknown>={})=>({issuer_id,ticker,isin:null,figi:null,share_class:'A',is_primary:false,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{},...o});
async function seed(){
 const c=memoryTableClient({issuers:['issuer_id'],issuer_identifier_claims:['id']});
 await c.insert('issuers',issuer('a',{}));
 await c.insert('issuers',issuer('b',{cninfo_org_id:'gssh0600000'}));
 await c.insert('issuers',issuer('c',{usci:null}));
 await c.insert('issuers',issuer('d',{}));
 await c.insert('issuers',issuer('e',{}));
 await c.insert('issuers',issuer('m',{status:'merged',merged_into:'a'}));
 await c.insert('issuer_securities',sec('a','02600.HK'));
 await c.insert('issuer_securities',sec('a','600519.SH',{is_primary:true}));
 await c.insert('issuer_securities',sec('d','ZZD'));
 await c.insert('issuer_securities',sec('e','000001.SZ'));
 await c.insert('issuer_securities',sec('e','000002.SZ',{valid_to:'2021-01-01'}));
 return c;
}
const bytes=(s:string)=>new TextEncoder().encode(s);
const lookups=(m:Record<string,CninfoLookup|Error>)=>async(code:string)=>{const v=m[code];if(v instanceof Error)throw v;if(!v)throw new Error(`unexpected ${code}`);return v;};

describe('cninfo org id fill',()=>{
 it('stores every received response before interpreting it: a no-hit body and an error body are kept, the dry run keeps nothing',async()=>{
  const c=await seed();const raw=memoryRawStore();
  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:null,bytes:bytes('[]')},'000001':new CninfoLookupError('cninfo 503',bytes('<html>busy</html>')) })},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
  expect(raw.objects.size).toBe(4);   // two data objects + two sidecars
  expect(res.planned.map(p=>[p.outcome,typeof p.evidence_sha256])).toEqual([['not_found','string'],['failed','string']]);
  expect(res.errors.find(e=>e.code==='cninfo_error')!.message).toContain(res.planned[1].evidence_sha256!);
 });
 it('a provenance key written for another column meanwhile survives the orgId write (merge, not replace)',async()=>{
  const c=await seed();
  const targets=await cninfoTargets(c);
  await c.update('issuers',{issuer_id:'a'},{provenance:{usci:{source:'test'},lei:{source:'later'}}});
  await fillCninfoOrgIds({tables:c,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'x'},bytes:bytes('[]')},'000001':{hit:null,bytes:bytes('[]')}})},targets,{batchId:'33333333-3333-4333-8333-333333333333'});
  expect(Object.keys(c.rows('issuers').find(r=>r.issuer_id==='a')!.provenance as object).sort()).toEqual(['cninfo_org_id','lei','usci']);
 });
 it('targets active issuers with a USCI, no orgId and an open A-share row (primary first)',async()=>{
  const c=await seed();
  expect((await cninfoTargets(c)).map(t=>[t.issuer_id,t.code,t.ticker])).toEqual([['a','600519','600519.SH'],['e','000001','000001.SZ']]);
 });
 it('writes a guarded update with replayable provenance and stores the raw response',async()=>{
  const c=await seed();const raw=memoryRawStore();
  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'贵州茅台'},bytes:bytes('[{"code":"600519","orgId":"gssh0600519"}]')},'000001':{hit:null,bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
  const a=c.rows('issuers').find(r=>r.issuer_id==='a')!;
  expect(a.cninfo_org_id).toBe('gssh0600519');
  const prov=(a.provenance as Record<string,{evidence_sha256:string}>);
  expect(prov.usci).toEqual({source:'test'});
  expect(prov.cninfo_org_id).toMatchObject({source:'cninfo_topsearch',as_of:'2026-11-05'});
  expect([...raw.objects.keys()].some(k=>k.includes(prov.cninfo_org_id.evidence_sha256))).toBe(true);
  expect(res.counts).toMatchObject({fetched:2,inserted:1,failed:0});
  expect(res.skippedSummary).toEqual({org_id_not_found:1});
  expect(res.planned.map(p=>p.outcome)).toEqual(['written','not_found']);
 });
 it('turns a unique-index clash into a set_identifier claim and a lookup failure into failed',async()=>{
  const c=await seed();
  await c.update('issuers',{issuer_id:'b'},{cninfo_org_id:'gssz0000001'});   // another issuer already holds it (issuers_cninfo_idx)
  const res=await fillCninfoOrgIds({tables:c,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':new Error('cninfo 503'),'000001':{hit:{orgId:'gssz0000001',name:'平安银行'},bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
  const claims=c.rows('issuer_identifier_claims');
  expect(claims.map(x=>[x.issuer_id,x.id_type,x.value,x.op,x.source])).toEqual([['e','cninfo_org_id','gssz0000001','set_identifier','cninfo_topsearch']]);
  expect((claims[0].detail as {target:unknown;evidence_kind:string})).toMatchObject({target:{issuer_id:'e'},evidence_kind:'provider_mapping'});
  expect(res.counts).toMatchObject({failed:1,fetched:1});
  expect(res.errors.map(e=>e.code)).toEqual(['claims_summary','cninfo_error']);
 });
 it('dry run (batchId null) looks up but writes nothing and stores nothing',async()=>{
  const c=await seed();const raw=memoryRawStore();
  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'x'},bytes:bytes('[]')},'000001':{hit:null,bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:null});
  expect(c.rows('issuers').find(r=>r.issuer_id==='a')!.cninfo_org_id).toBeNull();
  expect(raw.objects.size).toBe(0);
  expect(res.planned.map(p=>[p.code,p.orgId,p.outcome])).toEqual([['600519','gssh0600519','planned'],['000001',null,'not_found']]);
 });
});
