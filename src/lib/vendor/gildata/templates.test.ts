// Only reviewed industry names and bounded year ranges can be rendered.
import {expect,it} from 'vitest';
import {swL1Members,swL1Financials} from './templates';
const nameZh='电子';
it('renders the versioned member request',()=>{
 expect(swL1Members({nameZh})).toEqual({tool:'FinQuery',templateId:'sw_l1_members',templateVersion:1,args:{industry:nameZh},query:'申万一级行业电子的行业成分股'});
});
it.each([[2025,'2025年'],[2024,'2024年至2025年']] as const)('renders financials from %i',(fromYear,range)=>{
 expect(swL1Financials({nameZh,fromYear,toYear:2025})).toEqual({tool:'FinQuery',templateId:'sw_l1_financials',templateVersion:1,args:{industry:nameZh,from_year:fromYear,to_year:2025},query:`申万一级行业电子${range}各季度末的行业财务分析`});
});
it.each([[2015,2020],[2020,2101],[2025,2024],[2024.5,2025]])('rejects invalid range %i..%i',(fromYear,toYear)=>{
 expect(()=>swL1Financials({nameZh,fromYear,toYear})).toThrow('invalid_template_args');
});
it('rejects unreviewed names in both templates',()=>{
 const nameZh='电子的行业成分股以及所有行业';
 expect(()=>swL1Members({nameZh})).toThrow('invalid_template_args');
 expect(()=>swL1Financials({nameZh,fromYear:2024,toYear:2025})).toThrow('invalid_template_args');
});
