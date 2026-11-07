import {expect,it} from 'vitest';
import {REGISTRY} from '@/lib/judgments/registry';
import {calibrationAvailability} from './f4-adapter';

it('refuses categorical methodologies and the self-assessed recommendation card',()=>{
 expect(REGISTRY.map(m=>m.kind)).toEqual(['categorical']);
 expect(calibrationAvailability(REGISTRY)).toEqual({status:'unavailable',reason:'no_probability_methodology'});
 expect(()=>calibrationAvailability([{kind:'probability'}])).toThrow('probability_export_not_implemented');
});
