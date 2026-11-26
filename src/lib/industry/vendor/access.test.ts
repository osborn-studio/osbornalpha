import {expect,it,vi} from 'vitest';
import {vendorAccess} from './access';

it.each([
 ['public','public',true,false,'public'],['public','public',false,false,'withheld'],['public','public','throw',true,'withheld'],
 ['internal','public',true,true,'preview'],['public','internal',true,true,'preview'],
 ['internal','public',true,false,'withheld'],['public','internal',true,false,'withheld'],
 ['internal','internal',true,true,'preview'],['internal','internal',true,false,'withheld'],
 [null,'internal',true,true,'withheld'],['blocked','internal',true,true,'withheld'],['throw','public',true,true,'withheld'],
 ['public',null,true,true,'withheld'],['internal','blocked',true,true,'withheld'],['internal','throw',true,true,'withheld'],
 ['internal','internal',true,'throw','withheld']
] as const)('checks licences %s, %s before sign-in %s or admin %s',async(first,second,signedIn,admin,expected)=>{
 const check=<T>(v:T)=>{if(v==='throw')throw Error();return v;};
 const isAdmin=vi.fn(async()=>check(admin)===true);
 const isSignedIn=vi.fn(async()=>check(signedIn)===true);
 const licenceStatus=vi.fn(async(key:string)=>check(key==='scheme:sw2021:2021'?first:second));
 expect(await vendorAccess({isAdmin,isSignedIn,licenceStatus})).toBe(expected);
 const valid=(s:string|null)=>s==='public'||s==='internal';
 expect(licenceStatus.mock.calls.flat()).toEqual(['scheme:sw2021:2021',...(valid(first)?['vendor:gildata:industry-financials']:[])]);
 const allPublic=first==='public'&&second==='public';
 expect(isSignedIn).toHaveBeenCalledTimes(Number(allPublic));
 expect(isAdmin).toHaveBeenCalledTimes(Number(!allPublic&&valid(first)&&valid(second)));
 if(valid(first)&&valid(second))expect(licenceStatus.mock.invocationCallOrder[1]).toBeLessThan((allPublic?isSignedIn:isAdmin).mock.invocationCallOrder[0]);
});
