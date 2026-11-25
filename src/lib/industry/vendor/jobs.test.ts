import {expect,it} from 'vitest';
import {parseVendorSyncArgs,productionVendorDeps,vendorJobGate} from './jobs';
const job='gildata-memberships';
it.each([
 ['plan',{},false,null],['apply',{},false,'job_disabled'],['apply',{INDUSTRY_CN_VENDOR_ENABLED:'1'},false,'gildata_unavailable'],
 ['dry-run',{},false,'gildata_unavailable'],['dry-run',{},true,null],['apply',{},true,'job_disabled'],
 ['apply',{INDUSTRY_CN_VENDOR_ENABLED:'1',GILDATA_API_KEY:'dummy'},false,null]
] as const)('gates %s %o fixtures=%s', (mode,env,fixtures,code)=>expect(vendorJobGate(job,env,{mode,fixtures})?.code??null).toBe(code));
it('defaults to dry-run and supports repeated mapped industries and fixture directories',()=>{
 expect(parseVendorSyncArgs(['--job',job,'--fixtures','fixtures','--l1','801080.SI','--l1','801780.SI']))
 .toMatchObject({mode:'dry-run',job,fixtures:'fixtures',l1Codes:['801080.SI','801780.SI']});
 expect(productionVendorDeps({mode:'dry-run',env:{},codeVersion:null}).db).toBeUndefined();
});
it.each([[],['--job','bad'],['--job',job,'--plan','--apply'],['--job',job,'--from-year','2025'],
 ['--job',job,'--l1','no'],['--job',job,'--fixtures'],['--job','gildata-industry-financials','--from-year','2026','--to-year','2024']])
 ('rejects malformed args %#',(...argv)=>expect(()=>parseVendorSyncArgs(argv)).toThrow());
