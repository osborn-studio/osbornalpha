import {describe,it,expect,vi} from 'vitest';
import {createViewRequests,ObsoleteViewRequest} from './view-requests';
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
describe('protected view request generations',()=>{
 it('drops late successful content after denied status, then permits an explicit fresh request',async()=>{
  const clear=vi.fn(),gate=createViewRequests(clear),late=deferred<string>();
  const result=gate.run(()=>late.promise);const assertion=expect(result).rejects.toBeInstanceOf(ObsoleteViewRequest);
  await expect(gate.run(async()=>{throw Error('revocation_check_unavailable');})).rejects.toThrow('revocation_check_unavailable');
  late.resolve('synthetic protected citation');await assertion;expect(clear).toHaveBeenCalledTimes(1);
  await expect(gate.run(async()=>'fresh server result')).resolves.toBe('fresh server result');
 });
 it('drops stale errors when changing selection and does not clear the new candidate',async()=>{
  const clear=vi.fn(),gate=createViewRequests(clear),late=deferred<string>();
  const result=gate.run(()=>late.promise);const assertion=expect(result).rejects.toBeInstanceOf(ObsoleteViewRequest);
  gate.invalidate();late.reject(Error('revocation_access_denied'));await assertion;expect(clear).not.toHaveBeenCalled();
 });
 it('invalidates pending responses on unmount or selection reset',async()=>{
  const gate=createViewRequests(vi.fn()),late=deferred<string>(),result=gate.run(()=>late.promise);
  const assertion=expect(result).rejects.toBeInstanceOf(ObsoleteViewRequest);gate.invalidate();late.resolve('old');await assertion;
 });
 it.each(['revocation_access_denied','network_unavailable','invalid_response','not_authenticated','export_watermark_ahead','future_unknown_denial'])('hides stale content on %s',async code=>{
  const clear=vi.fn(),gate=createViewRequests(clear);await expect(gate.run(async()=>{throw Error(code);})).rejects.toThrow(code);expect(clear).toHaveBeenCalledOnce();
 });
 it('preserves the view for a business conflict',async()=>{
  const clear=vi.fn(),gate=createViewRequests(clear);await expect(gate.run(async()=>{throw Error('revision_conflict');})).rejects.toThrow('revision_conflict');expect(clear).not.toHaveBeenCalled();
 });
});

it('concurrent denial clears only once and non-Error failures fail closed',async()=>{
 const clear=vi.fn(),gate=createViewRequests(clear),late=deferred<string>();
 const pending=gate.run(()=>late.promise);const assertion=expect(pending).rejects.toBeInstanceOf(ObsoleteViewRequest);
 await expect(gate.run(async()=>{throw null;})).rejects.toBeNull();
 late.reject(Error('scope_denied'));await assertion;expect(clear).toHaveBeenCalledOnce();
});
