import {beforeEach,describe,expect,it} from 'vitest';
import {makeMockCtx,type MockStore} from '../test-support';
import type {ResearchCtx} from '../store';
import {listEntityKeys,upsertEntityKeys} from './store';
import {getEntity,upsertEntity} from '../entities';
import cohort from './first-cohort.json';
import type {CohortCompany} from './types';
import {addOwnerCompany,listScopedCompanies,setScope,ScopeError} from './scope';

let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});
const hundsun=()=>structuredClone((cohort.companies as CohortCompany[])[0]);

describe('setScope',()=>{
 it('flips in_scope with a cohort label and stores the rationale on the entity metadata',async()=>{
  const {entity_id}=await upsertEntityKeys(ctx,{...hundsun(),in_scope:false,cohort:'candidate-2026-09'});
  const row=await setScope(ctx,entity_id,{in_scope:true,rationale:'金融 IT 龙头，AI 投顾直接受益',today:'2026-09-27'});
  expect(row).toMatchObject({entity_id,in_scope:true,cohort:'scope-2026-09'});
  const entity=await getEntity(ctx,entity_id);
  expect(entity?.metadata).toMatchObject({in_scope:true,scope_rationale:'金融 IT 龙头，AI 投顾直接受益'});
  // Keys, names and securities are untouched by a scope change.
  const listed=(await listEntityKeys(ctx))[0]!;
  expect(listed.keys.lei).toBe('3003003LS77D1DRDDE25');
  expect(listed.securities).toHaveLength(1);
  // Taking a company out of scope keeps the rationale history readable but clears the flag.
  const out=await setScope(ctx,entity_id,{in_scope:false,rationale:'暂不覆盖',today:'2026-09-27'});
  expect(out.in_scope).toBe(false);
  expect((await getEntity(ctx,entity_id))?.metadata).toMatchObject({in_scope:false,scope_rationale:'暂不覆盖'});
 });
 it('accepts owner-supplied keys and names only when they validate, and records their provenance',async()=>{
  const {entity_id}=await upsertEntityKeys(ctx,{...hundsun(),keys:{...hundsun().keys,cik:null},missing:['cik']});
  const row=await setScope(ctx,entity_id,{in_scope:true,rationale:'r',today:'2026-09-27',keys:{cik:'1321655'},names_zh:['恒生电子','恒生电子股份有限公司']});
  expect(row.keys.cik).toBe('1321655');
  expect(row.missing).toEqual([]);
  expect(row.names_zh).toEqual(['恒生电子','恒生电子股份有限公司']);
  expect((row.provenance as Record<string,{source:string}>).cik).toMatchObject({source:'owner-input',retrieved_at:'2026-09-27'});
  await expect(setScope(ctx,entity_id,{in_scope:true,rationale:'r',today:'2026-09-27',keys:{lei:'bad'}})).rejects.toThrow(ScopeError);
 });
 it('rejects an unknown or malformed entity id and an empty rationale',async()=>{
  await expect(setScope(ctx,'not-a-uuid',{in_scope:true,rationale:'r',today:'2026-09-27'})).rejects.toThrow(ScopeError);
  await expect(setScope(ctx,'3f2b1c40-0000-4000-8000-000000000009',{in_scope:true,rationale:'r',today:'2026-09-27'})).rejects.toMatchObject({status:404});
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  await expect(setScope(ctx,entity_id,{in_scope:true,rationale:'  ',today:'2026-09-27'})).rejects.toMatchObject({status:422});
 });
});

describe('addOwnerCompany',()=>{
 it('creates entity, key row and primary security through the store validation',async()=>{
  const row=await addOwnerCompany(ctx,{entity_id:null,rationale:'券商 IT 第二梯队',names_zh:'金证股份',names_en:'Kingdom Technology',home_market:'A',exchange_code:'600446.SH',listed_on:'2003-12-16',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}},{today:'2026-09-27'});
  expect(store.count('research_entities')).toBe(1);
  expect(row).toMatchObject({in_scope:true,cohort:'scope-2026-09',missing:['lei','usci','cninfo_org_id','cik'],names_en:['Kingdom Technology']});
  expect(row.securities[0]).toMatchObject({exchange_code:'600446.SH',valid_from:'2003-12-16',is_primary:true});
  expect((await getEntity(ctx,row.entity_id))?.metadata).toMatchObject({scope_rationale:'券商 IT 第二梯队'});
 });
 it('refuses an answer that fails the wizard validation before touching the store',async()=>{
  await expect(addOwnerCompany(ctx,{entity_id:null,rationale:'',names_zh:'',names_en:'',home_market:'A',exchange_code:'x',listed_on:'',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}},{today:'2026-09-27'})).rejects.toMatchObject({status:422});
  expect(store.count('research_entities')).toBe(0);
 });
});


describe('Codex round 1 regressions',()=>{
 it('refuses to add a company that already exists instead of replacing its researched keys',async()=>{
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  const before=(await listEntityKeys(ctx))[0]!;
  const dup={entity_id:null,rationale:'重复录入',names_zh:'恒生电子',names_en:'Hundsun Technologies Inc.',home_market:'A' as const,exchange_code:'600570.SH',listed_on:'',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}};
  await expect(addOwnerCompany(ctx,dup,{today:'2026-09-27'})).rejects.toMatchObject({status:409});
  // Same by ticker only, different spelling of the names.
  await expect(addOwnerCompany(ctx,{...dup,names_zh:'恒生',names_en:'HS Tech'},{today:'2026-09-27'})).rejects.toMatchObject({status:409});
  const after=(await listEntityKeys(ctx))[0]!;
  expect(after.keys).toEqual(before.keys);
  expect(after.provenance).toEqual(before.provenance);
  expect(after.entity_id).toBe(entity_id);
  expect(store.count('research_entities')).toBe(1);
 });
 it('lists companies with the stored scope rationale so a fresh browser can prefill it',async()=>{
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  expect((await listScopedCompanies(ctx))[0]).toMatchObject({entity_id,scope_rationale:null});
  await setScope(ctx,entity_id,{in_scope:true,rationale:'金融 IT 龙头',today:'2026-09-27'});
  expect((await listScopedCompanies(ctx))[0]).toMatchObject({entity_id,in_scope:true,scope_rationale:'金融 IT 龙头'});
 });
});


describe('Codex round 5 regression',()=>{
 it('enriches an existing entity that has no key row instead of refusing it, while still protecting researched keys',async()=>{
  // Legacy COMPANY entity (e.g. from research-seed) without any research_entity_keys row.
  const legacy=await upsertEntity(ctx,{type:'COMPANY',name:'Kingdom Technology',aliases:['金证股份'],ticker:'600446.SH'});
  const row=await addOwnerCompany(ctx,{entity_id:null,rationale:'券商 IT 第二梯队',names_zh:'金证股份',names_en:'Kingdom Technology',home_market:'A',exchange_code:'600446.SH',listed_on:'2003-12-16',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}},{today:'2026-09-27'});
  expect(row.entity_id).toBe(legacy);
  expect(store.count('research_entities')).toBe(1);
  expect(store.count('research_entity_keys')).toBe(1);
  // Re-adding the very same owner-input company is an idempotent retry (same entity, no duplicate rows);
  // only rows with researched keys, or a different listing, are refused (round 7 tests).
  const again=await addOwnerCompany(ctx,{entity_id:null,rationale:'again',names_zh:'金证股份',names_en:'Kingdom Technology',home_market:'A',exchange_code:'600446.SH',listed_on:'',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}},{today:'2026-09-27'});
  expect(again.entity_id).toBe(legacy);
  expect(store.count('research_entities')).toBe(1);
  expect(store.count('research_entity_keys')).toBe(1);
 });
});


describe('Codex round 6 regressions',()=>{
 const kingdom=(rationale='券商 IT 第二梯队')=>({entity_id:null,rationale,names_zh:'金证股份',names_en:'Kingdom Technology',home_market:'A' as const,exchange_code:'600446.SH',listed_on:'2003-12-16',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}});
 it('resumes an incomplete owner-input creation (key row without securities) instead of refusing it forever',async()=>{
  // A previous POST persisted the entity and its owner-input key row, then failed before the security row.
  const legacy=await upsertEntity(ctx,{type:'COMPANY',name:'Kingdom Technology',aliases:['金证股份'],ticker:'600446.SH'});
  await ctx.supabase.from('research_entity_keys').insert({user_id:ctx.userId,entity_id:legacy,lei:null,usci:null,cninfo_org_id:null,cik:null,names_zh:['金证股份'],names_en:['Kingdom Technology'],aliases:[],home_market:'A',in_scope:true,cohort:'scope-2026-09',provenance:{},missing:['lei','usci','cninfo_org_id','cik'],updated_at:'2026-09-27T00:00:00Z'});
  const row=await addOwnerCompany(ctx,kingdom(),{today:'2026-09-27'});
  expect(row.entity_id).toBe(legacy);
  expect(row.securities).toHaveLength(1);
  expect(store.count('research_entity_keys')).toBe(1);
  // A row that carries researched keys is still protected.
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  await expect(addOwnerCompany(ctx,{...kingdom(),names_zh:'恒生电子',names_en:'Hundsun Technologies Inc.',exchange_code:'600570.SH'},{today:'2026-09-27'})).rejects.toMatchObject({status:409});
  expect((await listEntityKeys(ctx)).find(r=>r.entity_id===entity_id)!.keys.lei).toBe('3003003LS77D1DRDDE25');
 });
 it('synchronizes the entity name and aliases when the owner corrects names',async()=>{
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  await setScope(ctx,entity_id,{in_scope:true,rationale:'r',today:'2026-09-27',names_en:['Hundsun Technologies'],names_zh:['恒生电子','恒生电子股份有限公司'],aliases:['Hundsun','HS']});
  const entity=(await getEntity(ctx,entity_id))!;
  expect(entity.name).toBe('Hundsun Technologies');
  // Union: corrections add identifiers; the previous canonical name stays as an alias (round 7).
  expect(new Set(entity.aliases)).toEqual(new Set(['恒生电子','恒生电子股份有限公司','Hundsun','HS','Hundsun Technologies Inc.']));
  expect(entity.metadata).toMatchObject({in_scope:true,scope_rationale:'r'});
 });
});


describe('Codex round 7 regressions',()=>{
 it('preserves existing entity identifiers when names are corrected (union, old canonical name kept as alias)',async()=>{
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  // The entity may hold identifiers the key row never had (legacy seed aliases).
  await ctx.supabase.from('research_entities').update({aliases:['恒生电子股份有限公司','恒生电子','Hundsun','HSTECH']}).eq('user_id',ctx.userId).eq('id',entity_id);
  await setScope(ctx,entity_id,{in_scope:true,rationale:'r',today:'2026-09-27',names_en:['Hundsun Technologies'],names_zh:['恒生电子']});
  const entity=(await getEntity(ctx,entity_id))!;
  expect(entity.name).toBe('Hundsun Technologies');
  expect(new Set(entity.aliases)).toEqual(new Set(['恒生电子','恒生电子股份有限公司','Hundsun','HSTECH','Hundsun Technologies Inc.']));
  const row=(await listEntityKeys(ctx)).find(r=>r.entity_id===entity_id)!;
  expect(new Set(row.names_zh)).toEqual(new Set(['恒生电子','恒生电子股份有限公司']));
  expect(row.names_en).toEqual(['Hundsun Technologies','Hundsun Technologies Inc.']);
 });
 it('retries a creation whose scope step failed: the complete owner-input row is finished, not refused',async()=>{
  const answer={entity_id:null,rationale:'券商 IT 第二梯队',names_zh:'金证股份',names_en:'Kingdom Technology',home_market:'A' as const,exchange_code:'600446.SH',listed_on:'2003-12-16',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}};
  const {ownerCompanyToCohort}=await import('../setup/companies');
  // upsertEntityKeys succeeded (entity, key row, security) but setScope never ran.
  await upsertEntityKeys(ctx,ownerCompanyToCohort(answer,{today:'2026-09-27'}));
  expect((await getEntity(ctx,(await listEntityKeys(ctx))[0]!.entity_id))!.metadata.scope_rationale).toBeUndefined();
  const row=await addOwnerCompany(ctx,answer,{today:'2026-09-27'});
  expect(store.count('research_entities')).toBe(1);
  expect(row.securities).toHaveLength(1);
  expect((await getEntity(ctx,row.entity_id))!.metadata).toMatchObject({scope_rationale:'券商 IT 第二梯队'});
  // A different listing code for the same name is not a retry.
  await expect(addOwnerCompany(ctx,{...answer,exchange_code:'600447.SH'},{today:'2026-09-27'})).rejects.toMatchObject({status:409});
 });
});


describe('Codex round 8 regressions',()=>{
 const blankDate={entity_id:null,rationale:'券商 IT 第二梯队',names_zh:'金证股份',names_en:'Kingdom Technology',home_market:'A' as const,exchange_code:'600446.SH',listed_on:'',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}};
 it('reuses the persisted listing date when a blank-date creation is retried on another day',async()=>{
  const first=await addOwnerCompany(ctx,blankDate,{today:'2026-09-27'});
  const again=await addOwnerCompany(ctx,blankDate,{today:'2026-09-28'});
  expect(again.entity_id).toBe(first.entity_id);
  expect(again.securities).toHaveLength(1);
  expect(again.securities[0]!.valid_from).toBe('2026-09-27');
  expect(store.count('research_entity_securities')).toBe(1);
 });
 it('turns malformed request bodies into 422 validation errors instead of TypeErrors',async()=>{
  for (const body of [{}, {rationale:'r'}, {rationale:5,names_zh:['x'],keys:'nope'}, null, 'text']) {
   await expect(addOwnerCompany(ctx,body as never,{today:'2026-09-27'})).rejects.toMatchObject({status:422});
  }
  expect(store.count('research_entities')).toBe(0);
  const {entity_id}=await upsertEntityKeys(ctx,hundsun());
  await expect(setScope(ctx,entity_id,{in_scope:true,rationale:'r',today:'2026-09-27',keys:{lei:7} as never})).rejects.toMatchObject({status:422});
  await expect(setScope(ctx,entity_id,{in_scope:'yes',rationale:'r',today:'2026-09-27'} as never)).rejects.toMatchObject({status:422});
 });
});


describe('Codex round 9 regressions',()=>{
 it('does not treat a company with researched security data as a resumable owner submission',async()=>{
  // All four entity keys unknown, but the security row carries researched MIC/ISIN and provenance.
  const c=hundsun(); c.keys={lei:null,usci:null,cninfo_org_id:null,cik:null}; c.missing=['lei','usci','cninfo_org_id','cik']; c.provenance={};
  const {entity_id}=await upsertEntityKeys(ctx,c);
  const before=(await listEntityKeys(ctx)).find(r=>r.entity_id===entity_id)!;
  expect(before.securities[0]!.isin).toBeTruthy();
  await expect(addOwnerCompany(ctx,{entity_id:null,rationale:'r',names_zh:'恒生电子',names_en:'Hundsun Technologies Inc.',home_market:'A',exchange_code:'600570.SH',listed_on:'',keys:{lei:'',usci:'',cninfo_org_id:'',cik:''}},{today:'2026-09-27'})).rejects.toMatchObject({status:409});
  const after=(await listEntityKeys(ctx)).find(r=>r.entity_id===entity_id)!;
  expect(after.securities).toEqual(before.securities);
 });
});
