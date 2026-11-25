import {expect,it} from 'vitest';
import {deriveYoy,YOY_FORMULA_ID} from './derive';
const cell=(valueText:string|null)=>({status:valueText===null?'missing' as const:'ok' as const,valueText});
it.each([['12','10','20'],['-4','8','-150'],['1.00005','1','0.01'],['0.99995','1','-0.01'],
 ['1.000049999999999999999','1','0'],['100000000000000000001','100000000000000000000','0']])('derives %s against %s', (a,b,valueText)=>{
 expect(YOY_FORMULA_ID).toBe('yoy/1');
 expect(deriveYoy(cell(a),cell(b))).toEqual({status:'ok',valueText});
});
it.each([['1',null,'no_prior_period'],[null,'1','vendor_not_provided'],['1',null,'vendor_not_provided'],
 ['1','0','invalid_denominator'],['1','-1','invalid_denominator']] as const)('missing %s %s %s',(a,b,reason)=>{
 expect(deriveYoy(cell(a),reason==='no_prior_period'?null:cell(b))).toEqual({status:'missing',reason});
});
it('preserves each missing input’s reason, preferring the current period when both are missing',()=>{
 const absent={...cell(null),missingReason:'not_in_run' as const};
 const missing={...cell(null),missingReason:'vendor_not_provided' as const};
 expect(deriveYoy(absent,cell('1'))).toEqual({status:'missing',reason:'not_in_run'});
 expect(deriveYoy(cell('1'),absent)).toEqual({status:'missing',reason:'not_in_run'});
 expect(deriveYoy(absent,missing)).toEqual({status:'missing',reason:'not_in_run'});
 expect(deriveYoy(missing,absent)).toEqual({status:'missing',reason:'vendor_not_provided'});
});
