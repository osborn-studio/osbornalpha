// Quarantine hook outcomes and error propagation (spec §7.3).
import {describe,expect,it,vi} from 'vitest';
import {resolveBrokerItem} from './quarantine-hook';
import {memoryBrokerDeps} from './testing';
import {BrokerResearchDbError} from './types';
const ID='00000000-0000-4000-8000-0000000000aa',BY='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
describe('broker quarantine hook',()=>{
 it('passes the verdict to the DB and reports failed rules without undoing resolution',async()=>{
  const d=memoryBrokerDeps();const spy=vi.spyOn(d.db,'quarantineResolve').mockResolvedValue('resolved');
  expect(await resolveBrokerItem(d,{id:ID,natural_key:'x:ticker_resolution:ZZBR'},{status:'resolved_accept',by:BY,payload:{target_key:'ZZBR',security_ticker:'ZZBR'}})).toEqual({outcome:'resolved',rules:'failed'});
  expect(spy).toHaveBeenCalledWith(ID,'resolved_accept',BY,{target_key:'ZZBR',security_ticker:'ZZBR'});
 });
 it('propagates SQL hook errors',async()=>{
  const d=memoryBrokerDeps();vi.spyOn(d.db,'quarantineResolve').mockRejectedValueOnce(new BrokerResearchDbError('hook_params_required','hook_params_required:security_ticker','security_ticker'));
  await expect(resolveBrokerItem(d,{id:ID,natural_key:'x:y:-'},{status:'resolved_accept',by:BY,payload:{}})).rejects.toMatchObject({code:'hook_params_required',detail:'security_ticker'});
 });
 it('skips reruns for missing, already resolved and rejected items',async()=>{
  const d=memoryBrokerDeps();const item={id:ID,natural_key:'x:y:-'};
  expect(await resolveBrokerItem(d,item,{status:'resolved_accept',by:BY,payload:{}})).toEqual({outcome:'not_found',rules:'skipped'});
  vi.spyOn(d.db,'quarantineResolve').mockResolvedValueOnce('already_resolved').mockResolvedValueOnce('resolved');
  expect(await resolveBrokerItem(d,item,{status:'resolved_accept',by:BY,payload:{}})).toEqual({outcome:'already_resolved',rules:'skipped'});
  expect(await resolveBrokerItem(d,item,{status:'resolved_reject',by:BY,payload:{}})).toEqual({outcome:'resolved',rules:'skipped'});
 });
});
