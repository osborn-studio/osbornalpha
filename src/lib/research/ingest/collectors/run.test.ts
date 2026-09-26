import {beforeEach,describe,expect,it} from 'vitest';
import {makeMockCtx,type MockStore} from '../../test-support';
import type {ResearchCtx} from '../../store';
import {collectAll,companiesFromEntityKeys} from './run';
import type {CollectReceipt,Collector,CollectorCompany} from './types';
import type {EntityKeysRow} from '../../entity-keys/store';

let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});
const receipt=(source:CollectReceipt['source'],n:number):CollectReceipt=>({source,started_at:'',finished_at:'',companies:n,fetched:n,inserted:n,duplicates:0,versioned:0,skipped:0,failures:[],ok:true});
const company=(m:CollectorCompany['home_market'],id:string):CollectorCompany=>({entity_id:id,names_en:[id],names_zh:[],home_market:m,cik:m==='US'?'1':null,cninfo_org_id:null,exchange_codes:[m==='A'?'600570.SH':m==='HK'?'0268.HK':'PLTR']});

describe('collectAll',()=>{
 it('dispatches companies by home market, isolates a throwing collector, and audits one run',async()=>{
  const seen:Record<string,string[]>={};
  const ok=(s:CollectReceipt['source']):Collector=>async o=>{seen[s]=o.companies.map(c=>c.entity_id);return receipt(s,o.companies.length);};
  const boom:Collector=async()=>{throw new Error('cninfo exploded');};
  const out=await collectAll({ctx,since:'2026-09-01T00:00:00Z',companies:[company('US','pltr'),company('A','hs'),company('HK','kd'),company('other','x')]},{edgar:ok('edgar'),cninfo:boom,hkexnews:ok('hkexnews')});
  expect(seen).toEqual({edgar:['pltr'],hkexnews:['kd']});
  expect(out.receipts.map(r=>`${r.source}:${r.ok}`)).toEqual(['edgar:true','cninfo:false','hkexnews:true']);
  expect(out.receipts[1].failures).toEqual([{company:null,stage:'list',message:'cninfo exploded'}]);
  expect(out.ok).toBe(false);
  const audits=store.rows('research_audit_log').filter(r=>r.action==='collect.run');
  expect(audits).toHaveLength(1);
  expect(audits[0].detail.receipts).toHaveLength(3);
 });
 it('runs only the requested sources',async()=>{
  const calls:string[]=[];
  const mk=(s:CollectReceipt['source']):Collector=>async o=>{calls.push(s);return receipt(s,o.companies.length);};
  const out=await collectAll({ctx,since:'2026-09-01T00:00:00Z',companies:[company('US','p')],sources:['edgar']},{edgar:mk('edgar'),cninfo:mk('cninfo'),hkexnews:mk('hkexnews')});
  expect(calls).toEqual(['edgar']);expect(out.receipts).toHaveLength(1);expect(out.ok).toBe(true);
 });
});

describe('companiesFromEntityKeys',()=>{
 it('keeps in-scope companies and maps keys and primary exchange codes',()=>{
  const row=(over:Partial<EntityKeysRow>):EntityKeysRow=>({entity_id:'e',keys:{lei:null,usci:null,cninfo_org_id:'gssh0600570',cik:null},names_zh:['恒生电子'],names_en:['Hundsun'],aliases:[],home_market:'A',in_scope:true,cohort:'c',provenance:{},missing:[],updated_at:'',securities:[{id:'s',exchange_code:'600570.SH',mic:'XSHG',isin:null,market:'A',security_type:'common',is_primary:true,valid_from:'2003-12-16',valid_to:null,provenance:{}}],...over});
  const out=companiesFromEntityKeys([row({}),row({entity_id:'out',in_scope:false}),row({entity_id:'us',home_market:'US',keys:{lei:null,usci:null,cninfo_org_id:null,cik:'1321655'},securities:[{id:'s2',exchange_code:'PLTR',mic:'XNAS',isin:null,market:'US',security_type:'common',is_primary:true,valid_from:'2020-09-30',valid_to:null,provenance:{}}]})]);
  expect(out).toEqual([
   {entity_id:'e',names_en:['Hundsun'],names_zh:['恒生电子'],home_market:'A',cik:null,cninfo_org_id:'gssh0600570',exchange_codes:['600570.SH']},
   {entity_id:'us',names_en:['Hundsun'],names_zh:['恒生电子'],home_market:'US',cik:'1321655',cninfo_org_id:null,exchange_codes:['PLTR']}]);
 });
});
