// Quarantine CLI (spec §4.3, §0.2 M10): argument rules, admin check, RPC errors surfaced, listing format.
import {describe,expect,it,vi} from 'vitest';
import {MacroDbError} from './db';
import {formatOpenItems,isRejectOnly,parseQuarantineArgs,runQuarantineCommand,type OpenItem,type QuarantineDeps} from './quarantine-cli';
const Q='3f0c2a1e-1b2c-4d3e-8f4a-5b6c7d8e9f00',A='7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',O='0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const item:OpenItem={id:Q,dataset:'macro.fred',natural_key:'US_UNRATE|2026-08-31',reason_code:'unexpected_revision',detail:{current_value_text:'4.3'},payload:{value_text:'4.2'},batch_id:'b',created_at:'2026-11-03T05:31:00Z',
 members:[{observation_id:O,series_id:'US_UNRATE',period_end:'2026-08-31',value_text:'4.2',version:2,status:'quarantined'}]};
const deps=(o:Partial<QuarantineDeps>={}):QuarantineDeps=>({listOpen:vi.fn(async()=>[item]),isAdmin:vi.fn(async()=>true),resolve:vi.fn(async()=>{}),log:vi.fn(),...o});
describe('parseQuarantineArgs',()=>{
 it('list by default, --json optional',()=>{
  expect(parseQuarantineArgs([])).toEqual({kind:'list',json:false});
  expect(parseQuarantineArgs(['--json'])).toEqual({kind:'list',json:true});
 });
 it('resolve needs one decision, a uuid id, --by admin uuid; accept also needs --observation (the member to promote)',()=>{
  expect(parseQuarantineArgs(['--accept',Q,'--observation',O,'--by',A])).toEqual({kind:'resolve',decision:'accept',id:Q,by:A,observation:O});
  expect(parseQuarantineArgs(['--reject',Q,'--by',A])).toEqual({kind:'resolve',decision:'reject',id:Q,by:A,observation:null});
  expect(()=>parseQuarantineArgs(['--accept',Q,'--reject',Q,'--by',A])).toThrow(/one of/);
  expect(()=>parseQuarantineArgs(['--accept','nope','--observation',O,'--by',A])).toThrow(/uuid/);
  expect(()=>parseQuarantineArgs(['--accept',Q,'--observation',O])).toThrow(/--by/);
  expect(()=>parseQuarantineArgs(['--accept',Q,'--by',A])).toThrow(/--observation/);
  expect(()=>parseQuarantineArgs(['--reject',Q,'--observation',O,'--by',A])).toThrow(/--observation/);
  expect(()=>parseQuarantineArgs(['--by',A])).toThrow(/--accept/);
 });
});
describe('runQuarantineCommand',()=>{
 it('lists open macro items',async()=>{
  const d=deps();
  expect(await runQuarantineCommand({kind:'list',json:false},d)).toBe(0);
  expect(d.log).toHaveBeenCalledWith(formatOpenItems([item]));
  expect(formatOpenItems([item])).toContain('US_UNRATE|2026-08-31');expect(formatOpenItems([item])).toContain(`${O} v2 4.2 quarantined`);
  expect(formatOpenItems([])).toBe('no open macro quarantine items');
 });
 it('refuses a non-admin resolver without calling the RPC',async()=>{
  const d=deps({isAdmin:vi.fn(async()=>false)});
  expect(await runQuarantineCommand({kind:'resolve',decision:'accept',id:Q,by:A,observation:O},d)).toBe(2);
  expect(d.resolve).not.toHaveBeenCalled();
 });
 it('calls resolveConflict with the chosen member and reports SQL refusals (already_resolved / not_found / reject_only / not_member / not_quarantined)',async()=>{
  const d=deps();
  expect(await runQuarantineCommand({kind:'resolve',decision:'reject',id:Q,by:A,observation:null},d)).toBe(0);
  expect(d.resolve).toHaveBeenCalledWith(Q,'reject',A,undefined);
  expect(await runQuarantineCommand({kind:'resolve',decision:'accept',id:Q,by:A,observation:O},d)).toBe(0);
  expect(d.resolve).toHaveBeenCalledWith(Q,'accept',A,O);
  for(const [e,line] of [[new MacroDbError('already_resolved'),'refused: already_resolved'],[new MacroDbError('reject_only'),'refused: reject_only'],
   [new MacroDbError('rpc_failed','not_quarantined'),'refused: not_quarantined'],[new MacroDbError('rpc_failed','not_member'),'refused: not_member']] as const){
   const r=deps({resolve:vi.fn(async()=>{throw e;})});
   expect(await runQuarantineCommand({kind:'resolve',decision:'accept',id:Q,by:A,observation:O},r)).toBe(3);
   expect(r.log).toHaveBeenCalledWith(line);
  }
 });
 it('adapter_mismatch / rule_failed items are reject-only: accept is refused before the RPC, reject goes through',async()=>{
  expect(isRejectOnly('adapter_mismatch')).toBe(true);expect(isRejectOnly('rule_failed:macro.range')).toBe(true);
  expect(isRejectOnly('unexpected_revision')).toBe(false);expect(isRejectOnly('stale_delivery')).toBe(false);expect(isRejectOnly('conflicting_rows')).toBe(false);
  const mm:OpenItem={...item,reason_code:'adapter_mismatch'};
  const d=deps({listOpen:vi.fn(async()=>[mm])});
  expect(await runQuarantineCommand({kind:'resolve',decision:'accept',id:Q,by:A,observation:O},d)).toBe(3);
  expect(d.resolve).not.toHaveBeenCalled();
  expect(d.log).toHaveBeenCalledWith('refused: reject_only (adapter_mismatch has no stored quarantined row to accept)');
  expect(await runQuarantineCommand({kind:'resolve',decision:'reject',id:Q,by:A,observation:null},d)).toBe(0);
  expect(d.resolve).toHaveBeenCalledWith(Q,'reject',A,undefined);
  expect(formatOpenItems([mm])).toContain('[reject-only]');
 });
 it('other errors propagate',async()=>{
  await expect(runQuarantineCommand({kind:'resolve',decision:'accept',id:Q,by:A,observation:O},deps({resolve:vi.fn(async()=>{throw new MacroDbError('rpc_failed','boom');})}))).rejects.toMatchObject({code:'rpc_failed'});
 });
});
