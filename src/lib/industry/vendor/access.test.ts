import {expect,it,vi} from 'vitest';
import {vendorAccess} from './access';

it.each([
 ['internal','public',true,'preview'],['public','internal',true,'preview'],['public','public',false,'withheld'],
 [null,'internal',true,'withheld'],['blocked','internal',true,'withheld'],['throw','public',true,'withheld'],
 ['public',null,true,'withheld'],['internal','blocked',true,'withheld'],['internal','throw',true,'withheld'],
 ['internal','internal','throw','withheld']
] as const)('checks licences %s, %s before admin %s',async(first,second,admin,expected)=>{
 const check=<T>(v:T)=>{if(v==='throw')throw Error();return v;};
 const isAdmin=vi.fn(async()=>check(admin)===true);
 const licenceStatus=vi.fn(async(key:string)=>check(key==='scheme:sw2021:2021'?first:second));
 expect(await vendorAccess({isAdmin,licenceStatus})).toBe(expected);
 const valid=(s:string|null)=>s==='public'||s==='internal';
 expect(licenceStatus.mock.calls.flat()).toEqual(['scheme:sw2021:2021',...(valid(first)?['vendor:gildata:industry-financials']:[])]);
 expect(isAdmin).toHaveBeenCalledTimes(Number(valid(first)&&valid(second)));
});
