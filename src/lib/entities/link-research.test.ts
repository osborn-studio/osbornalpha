import {describe,it,expect} from 'vitest';
import {planResearchLink} from './link-research';

describe('planResearchLink',()=>{
 it('promotes only hard-identified entities, maps markets to country and share class, and keeps security ids',()=>{
  const plan=planResearchLink(
   [{user_id:'u',entity_id:'e1',lei:'3003003LS77D1DRDDE25',usci:'913300002539329145',cik:null,cninfo_org_id:'gssh0600570',names_zh:['恒生电子'],names_en:['Hundsun Technologies Inc.'],home_market:'A',issuer_id:null},
    {user_id:'u',entity_id:'e2',lei:null,usci:null,cik:null,cninfo_org_id:null,names_zh:['无标识'],names_en:[],home_market:'A',issuer_id:null},
    {user_id:'u',entity_id:'e3',lei:null,usci:null,cik:'320193',cninfo_org_id:null,names_zh:[],names_en:['Apple Inc.'],home_market:'US',issuer_id:'already'}],
   [{user_id:'u',id:'s1',entity_id:'e1',exchange_code:'600570.SH',isin:'CNE000001GN7',market:'A',security_type:'common',is_primary:true,valid_from:'2003-12-16',valid_to:null},
    {user_id:'u',id:'s2',entity_id:'e3',exchange_code:'AAPL',isin:null,market:'US',security_type:'adr',is_primary:false,valid_from:'2000-01-01',valid_to:null},
    {user_id:'u',id:'s3',entity_id:'e3',exchange_code:'NOPE',isin:null,market:'US',security_type:'common',is_primary:false,valid_from:'2000-01-01',valid_to:null}],
   new Set(['600570.SH','AAPL']),
  );
  expect(plan.issuers).toEqual([
   {entity_key:'u:e1',input:{lei:'3003003LS77D1DRDDE25',usci:'913300002539329145',cik:null,cninfo_org_id:'gssh0600570',canonical_name_zh:'恒生电子',canonical_name_en:'Hundsun Technologies Inc.',country_code:'CN',provenance:{lei:{source:'research_entity_keys',entity_id:'e1',user_id:'u'},usci:{source:'research_entity_keys',entity_id:'e1',user_id:'u'},cninfo_org_id:{source:'research_entity_keys',entity_id:'e1',user_id:'u'},canonical_name_zh:{source:'research_entity_keys',entity_id:'e1',user_id:'u'},canonical_name_en:{source:'research_entity_keys',entity_id:'e1',user_id:'u'}}}},
   {entity_key:'u:e3',input:{lei:null,usci:null,cik:'320193',cninfo_org_id:null,canonical_name_zh:null,canonical_name_en:'Apple Inc.',country_code:'US',provenance:{cik:{source:'research_entity_keys',entity_id:'e3',user_id:'u'},canonical_name_en:{source:'research_entity_keys',entity_id:'e3',user_id:'u'}}}},
  ]);
  expect(plan.securities).toEqual([
   {entity_key:'u:e1',security_id:'s1',ticker:'600570.SH',isin:'CNE000001GN7',share_class:'A',is_primary:true,valid_from:'2003-12-16',valid_to:null,source:'research_entity_securities'},
   {entity_key:'u:e3',security_id:'s2',ticker:'AAPL',isin:null,share_class:'ADR',is_primary:false,valid_from:'2000-01-01',valid_to:null,source:'research_entity_securities'},
  ]);
  expect(plan.skipped).toEqual([{entity_key:'u:e2',reason:'no_hard_identifier'},{entity_key:'u:e3',security_id:'s3',reason:'ticker_not_in_universe:NOPE'}]);
 });
});
