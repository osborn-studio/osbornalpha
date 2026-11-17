import {expect,it} from 'vitest';
import {REGISTRY} from '@/lib/judgments/registry';
import {calibrationAvailability} from './f4-adapter';

it('identifies registered methodology versions and leaves probability unavailable without thresholds',()=>{
 expect(REGISTRY.map(m=>[m.id,m.version,m.kind])).toEqual([['macro_regime','v2','categorical']]);
 expect(REGISTRY.some(m=>m.kind==='probability')).toBe(false);
 expect(REGISTRY.some(m=>m.id==='recommendation_call'&&m.version==='v1')).toBe(false);
 expect(calibrationAvailability(REGISTRY)).toEqual({status:'unavailable',reason:'no_probability_methodology'});
 expect(calibrationAvailability([{kind:'probability'}])).toEqual({status:'unavailable',reason:'probability_export_unavailable'});
});
