import {beforeEach,describe,expect,it} from 'vitest';
import {makeMockCtx,type MockStore} from '../test-support';
import type {ResearchCtx} from '../store';
import {entityTableVersion,listEntityKeys,upsertEntityKeys,versionInput} from './store';
import {seedEntityKeys} from './seed';
import cohort from './first-cohort.json';
import {seedResearchData,COMPANY_SEEDS,THEME_SEEDS} from '../seed';
import {getEntity,listEntities} from '../entities';
import {randomUUID} from 'node:crypto';
import type {CohortCompany} from './types';

let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});
const hundsun=()=>structuredClone((cohort.companies as CohortCompany[])[0]);

describe('upsertEntityKeys',()=>{
 it('creates the COMPANY entity, one key row and one security row, then updates in place',async()=>{
  const first=await upsertEntityKeys(ctx,hundsun());
  expect(store.count('research_entities')).toBe(1);
  expect(store.count('research_entity_keys')).toBe(1);
  expect(store.count('research_entity_securities')).toBe(1);
  const changed=hundsun();changed.keys.cninfo_org_id='gssh0600570';changed.missing=changed.missing.filter(m=>m!=='cninfo_org_id');changed.provenance.cninfo_org_id={source:'manual',retrieved_at:'2026-09-26',ref:'template'};
  changed.securities.push({...changed.securities[0],exchange_code:'600570.SH',valid_from:'2030-01-01',is_primary:false});
  const second=await upsertEntityKeys(ctx,changed);
  expect(second.entity_id).toBe(first.entity_id);
  expect(store.count('research_entity_keys')).toBe(1);
  expect(store.count('research_entity_securities')).toBe(2);
  const listed=await listEntityKeys(ctx);
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({entity_id:first.entity_id,keys:{cninfo_org_id:'gssh0600570',lei:'3003003LS77D1DRDDE25'},missing:['cik']});
  expect(listed[0].securities.map(s=>s.valid_from).sort()).toEqual(['2003-12-16','2030-01-01']);
 });
 it('rejects invalid identifiers before writing anything',async()=>{
  const bad=hundsun();bad.keys.lei='3003003LS77D1DRDDE26';
  await expect(upsertEntityKeys(ctx,bad)).rejects.toThrow('invalid_schema');
  const badIsin=hundsun();badIsin.securities[0].isin='CNE000001FN7';
  await expect(upsertEntityKeys(ctx,badIsin)).rejects.toThrow('invalid_schema');
  const inconsistent=hundsun();inconsistent.missing=[];
  await expect(upsertEntityKeys(ctx,inconsistent)).rejects.toThrow('invalid_schema');
  expect(store.count('research_entities')).toBe(0);
 });
});

describe('entityTableVersion',()=>{
 it('is a sha256 hex, stable for the same data, independent of provenance and timestamps, and changes with any key',async()=>{
  await seedEntityKeys(ctx);
  const v1=await entityTableVersion(ctx);
  expect(v1).toMatch(/^[0-9a-f]{64}$/);
  expect(await entityTableVersion(ctx)).toBe(v1);
  const rows=await listEntityKeys(ctx);
  const a=versionInput(rows),b=versionInput(rows.map(r=>({...r,updated_at:'1999-01-01T00:00:00Z',provenance:{}})).reverse());
  expect(a).toBe(b);
  const changed=structuredClone(rows);changed[3].keys.cik='999';
  expect(versionInput(changed)).not.toBe(a);
  const sec=structuredClone(rows);sec[0].securities[0].valid_to='2027-01-01';
  expect(versionInput(sec)).not.toBe(a);
 });
});

describe('seedEntityKeys',()=>{
 it('is idempotent over the 21-company cohort',async()=>{
  const r1=await seedEntityKeys(ctx);
  const r2=await seedEntityKeys(ctx);
  expect(r1).toEqual({companies:21,securities:21});
  expect(r2).toEqual(r1);
  expect(store.count('research_entities')).toBe(21);
  expect(store.count('research_entity_keys')).toBe(21);
  expect(store.count('research_entity_securities')).toBe(21);
 });

 it('reuses companies already seeded under short names and never erases their description or metadata',async()=>{
  await seedResearchData(ctx);
  const before=await listEntities(ctx,{type:'COMPANY'});
  const palantir=before.find(e=>e.name==='Palantir')!;
  await ctx.supabase.from('research_entities').update({description:'owner note',metadata:{sector:'software'}}).eq('id',palantir.id);
  await seedEntityKeys(ctx);
  const after=await listEntities(ctx,{type:'COMPANY'});
  // Palantir, ServiceNow and Salesforce already existed: 21 - 3 new companies.
  expect(after).toHaveLength(COMPANY_SEEDS.length+21-3);
  expect(store.count('research_entities')).toBe(COMPANY_SEEDS.length+THEME_SEEDS.length+21-3);
  const kept=(await getEntity(ctx,palantir.id))!;
  expect(kept.description).toBe('owner note');
  expect(kept.metadata).toMatchObject({sector:'software',home_market:'US',in_scope:true});
  expect(kept.aliases).toEqual(expect.arrayContaining(['帕兰提尔','Palantir Technologies Inc.']));
  expect(kept.ticker).toBe('PLTR');
  const keys=await listEntityKeys(ctx);
  expect(keys.find(k=>k.entity_id===palantir.id)?.keys.cik).toBe('1321655');
  expect(keys.filter(k=>k.names_en[0]==='Palantir Technologies Inc.')).toHaveLength(1);
 });
 it('reads every row beyond the PostgREST page size so the table version covers the whole table',async()=>{
  const rows=[] as any[],secs=[] as any[];
  for(let i=0;i<1203;i++){const id=randomUUID();rows.push({user_id:ctx.userId,entity_id:id,lei:null,usci:null,cninfo_org_id:null,cik:String(100000+i),names_zh:[],names_en:[`Co ${i}`],aliases:[],home_market:'US',in_scope:true,cohort:'bulk',provenance:{},missing:['lei','usci','cninfo_org_id'],updated_at:'2026-01-01T00:00:00Z'});
   secs.push({user_id:ctx.userId,id:randomUUID(),entity_id:id,exchange_code:`C${i}`,mic:'XNYS',isin:null,market:'US',security_type:'common',is_primary:true,valid_from:'2020-01-01',valid_to:null,provenance:{}});}
  store.seed('research_entity_keys',rows);store.seed('research_entity_securities',secs);
  const listed=await listEntityKeys(ctx);
  expect(listed).toHaveLength(1203);
  expect(listed.every(r=>r.securities.length===1)).toBe(true);
  const v1=await entityTableVersion(ctx);
  // Change a row that a single 1000-row page would have dropped.
  const last=[...store.rows('research_entity_keys')].sort((a,b)=>a.entity_id.localeCompare(b.entity_id))[1202];
  last.cik='1';
  expect(await entityTableVersion(ctx)).not.toBe(v1);
 });
});
