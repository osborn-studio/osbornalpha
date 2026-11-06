// src/lib/dq/reconcile/record.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../../db/memory-table-client';
import {recordReconciliation} from './record';
import type {ReconcileResultInput} from './types';

const text=(over:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:'320193:0000320193-23-000106',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec.submissions',right_source:'edgar.ixbrl.dei',detail:{left_text:'Large accelerated filer',right_text:'Large Accelerated Filer'},action:'record',...over});

describe('recordReconciliation (out-of-cycle rows, spec §5.1)',()=>{
 it('writes one row with dataset reconcile.<pair>, the four cycle columns null and inputs_hash in detail',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  const id=await recordReconciliation(t,{...text({inputs_hash:'h'}),pair:'sec.filer_category',batch_id:null});
  const [row]=t.rows('dq_reconciliations');
  expect(row).toMatchObject({id,dataset:'reconcile.sec.filer_category',pair:'sec.filer_category',kind:'text',outcome:'compared',passed:true,left_value:null,right_value:null,tolerance:'0',cycle_id:null,issuer_id:null,market:null,attempt:null,batch_id:null});
  expect(row.detail).toEqual({left_text:'Large accelerated filer',right_text:'Large Accelerated Filer',tolerance_exact:'0',inputs_hash:'h'});
  expect(typeof row.created_at).toBe('string');
 });
 it('accepts a numeric compared row and a date row',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',passed:false}),pair:'entities.isin_hkex_vs_gleif',batch_id:'b'});
  await recordReconciliation(t,{...text({kind:'date',passed:false,detail:{left_text:'2024-02-01',right_text:'2024-02-02'}}),pair:'sec.filing_date_vs_submissions',batch_id:'b'});
  expect(t.rows('dq_reconciliations')).toHaveLength(2);
 });
 it('refuses cycle pairs, non-record actions, items, and rows that break the kind constraints',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  const put=(over:Partial<ReconcileResultInput>,pair:Parameters<typeof recordReconciliation>[1]['pair']='sec.filer_category')=>recordReconciliation(t,{...text(over),pair,batch_id:null});
  await expect(put({},'us.companyfacts_vs_ixbrl')).rejects.toThrow('cycle_pair_requires_runner');
  await expect(put({action:'quarantine_left'})).rejects.toThrow('record_action_only');
  await expect(put({item:{natural_key:'k',payload:{}}})).rejects.toThrow('record_has_no_item');
  await expect(put({kind:'numeric',left_value:'1',right_value:null})).rejects.toThrow('numeric_sides_required');
  await expect(put({left_value:'1'})).rejects.toThrow('nonnumeric_sides_must_be_null');
  await expect(put({outcome:'right_missing',passed:true})).rejects.toThrow('passed_requires_compared');
  await expect(put({kind:'numeric',left_value:'1,0',right_value:'1'})).rejects.toThrow('invalid_decimal_field');
  await expect(put({tolerance:'-1'})).rejects.toThrow('invalid_tolerance');
  await expect(put({},'bogus' as never)).rejects.toThrow('invalid_pair');
  await expect(put({kind:'bogus' as never})).rejects.toThrow('invalid_kind');
  await expect(put({outcome:'bogus' as never,passed:false})).rejects.toThrow('invalid_outcome');
  await expect(put({outcome:'legacy' as never,passed:false})).rejects.toThrow('invalid_outcome');
  await expect(put({kind:'numeric',left_value:1 as never,right_value:'1'})).rejects.toThrow('invalid_decimal_field');
  await expect(put({tolerance:0 as never})).rejects.toThrow('invalid_tolerance');
  await expect(put({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'-1'})).rejects.toThrow('negative_abs_diff');
  await expect(put({kind:'numeric',left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'-0.5'})).rejects.toThrow('negative_rel_diff');
  expect(t.rows('dq_reconciliations')).toHaveLength(0);
 });
 it('writes canonical numeric fields, exact tolerance/abs_diff in detail, and uses the injected clock',async()=>{
  const t=memoryTableClient({dq_reconciliations:['id']});
  await recordReconciliation(t,{...text({kind:'numeric',left_value:'1.10',right_value:'1e0',abs_diff:'0.100',rel_diff:'0.0',tolerance:'0.0050'}),pair:'sec.filer_category',batch_id:null},{now:()=>new Date('2026-01-02T03:04:05.000Z')});
  const [row]=t.rows('dq_reconciliations');
  expect(row).toMatchObject({left_value:'1.1',right_value:'1',abs_diff:'0.1',rel_diff:'0',tolerance:'0.005',created_at:'2026-01-02T03:04:05.000Z'});
  expect(row.detail).toMatchObject({tolerance_exact:'0.005',abs_diff_exact:'0.1'});
 });
});
