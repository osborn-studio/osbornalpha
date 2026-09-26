import {beforeEach,describe,expect,it} from 'vitest';
import {makeMockCtx,type MockStore} from '../test-support';
import type {ResearchCtx} from '../store';
import {listEntityKeys,upsertEntityKeys} from './store';
import {getEntity} from '../entities';
import cohort from './first-cohort.json';
import type {CohortCompany} from './types';
import {addOwnerCompany,setScope,ScopeError} from './scope';

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
