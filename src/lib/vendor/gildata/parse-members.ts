// Current SW constituents. Preserve six-digit security codes and first-seen wire locators.
import {GildataParseError} from './envelope';
import {checkedTables} from './markdown-table';
import {SCHEME_LABEL} from './parse-financials';
export const MEMBERS_API_NAME='行业成分股',MEMBERS_PARSER_VERSION='gildata-sw-l1-members/1';
export const MEMBERS_COLUMNS=['股票名称','股票代码','行业名称','行业级别','行业类别'] as const;
interface Member{securityCode:string;securityName:string;locator:{block:number;row:number}}
export function parseSwL1Members(bytes:Uint8Array,expect:{nameZh:string}){
 const {canonicalSha256,apiNames,tables}=checkedTables(bytes,MEMBERS_API_NAME,MEMBERS_COLUMNS);
 const seen=new Map<string,Member>();
 tables.forEach((rows,block)=>rows.forEach(([securityName,securityCode,name,level,scheme],row)=>{
  if(name!==expect.nameZh||level!=='一级行业'||scheme!==SCHEME_LABEL)throw new GildataParseError('request_mismatch','industry_mismatch');
  if(!/^\d{6}$/.test(securityCode)||!securityName.trim()||securityName==='-')throw new GildataParseError('parse_failed','invalid_security');
  const prev=seen.get(securityCode);
  if(prev&&prev.securityName!==securityName)throw new GildataParseError('parse_failed','conflicting_duplicate');
  if(!prev)seen.set(securityCode,{securityCode,securityName,locator:{block,row}});
 }));
 return {canonicalSha256,apiNames,members:[...seen.values()].sort((a,b)=>a.securityCode.localeCompare(b.securityCode))};
}
