// Versioned allowlist of SW2021 FinQuery sentences.
import {SW2021_L1_GILDATA} from '../../industry/vendor/sw2021-gildata-codes';
import type {VendorRequest} from '../source';
export const GILDATA_TOOL='FinQuery';
function validateName(name:string){
 if(!SW2021_L1_GILDATA.some(r=>r.nameZh===name))throw Error('invalid_template_args');
}
export function swL1Members({nameZh}:{nameZh:string}):VendorRequest{
 validateName(nameZh);
 return {tool:GILDATA_TOOL,templateId:'sw_l1_members',templateVersion:1,args:{industry:nameZh},query:`申万一级行业${nameZh}的行业成分股`};
}
export function swL1Financials({nameZh,fromYear,toYear}:{nameZh:string;fromYear:number;toYear:number}):VendorRequest{
 validateName(nameZh);
 if(!Number.isInteger(fromYear)||!Number.isInteger(toYear)||fromYear<2016||toYear>2100||fromYear>toYear)throw Error('invalid_template_args');
 const years=fromYear===toYear?`${fromYear}年`:`${fromYear}年至${toYear}年`;
 return {tool:GILDATA_TOOL,templateId:'sw_l1_financials',templateVersion:1,args:{industry:nameZh,from_year:fromYear,to_year:toYear},query:`申万一级行业${nameZh}${years}各季度末的行业财务分析`};
}
