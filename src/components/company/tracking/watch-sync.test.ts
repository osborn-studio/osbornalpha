import {describe,expect,it,vi} from 'vitest';
import {notifyWatchChanged,subscribeWatchChanged} from './watch-sync';

describe('watch-sync',()=>{
 it('notifies only subscribers of that issuer and stops after unsubscribe',()=>{
  const a=vi.fn(),b=vi.fn();
  const offA=subscribeWatchChanged('i1',a);subscribeWatchChanged('i2',b);
  notifyWatchChanged('i1');
  expect(a).toHaveBeenCalledTimes(1);expect(b).not.toHaveBeenCalled();
  offA();notifyWatchChanged('i1');expect(a).toHaveBeenCalledTimes(1);
 });
});
