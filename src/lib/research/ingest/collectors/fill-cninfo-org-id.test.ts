import {describe,expect,it} from 'vitest';
import {applyOrgIds} from './fill-cninfo-org-id';
import type {CohortCompany} from '../../entity-keys/types';

const company=(code:string,orgId:string|null):CohortCompany=>({names_en:['X'],names_zh:['某'],aliases:[],home_market:'A',in_scope:true,cohort:'c',keys:{lei:null,usci:'913300002539329145',cninfo_org_id:orgId,cik:null},provenance:{usci:{source:'gleif-api',retrieved_at:'2026-09-25'}},missing:orgId?['lei','cik']:['lei','cninfo_org_id','cik'],securities:[{exchange_code:code,mic:'XSHG',isin:'CNE000001FN6',market:'A',security_type:'common',is_primary:true,valid_from:'2003-12-16',valid_to:null,provenance:{}}]});

describe('applyOrgIds',()=>{
 it('fills missing A-share orgIds with provenance and leaves everything else untouched',()=>{
  const out=applyOrgIds([company('600570.SH',null),company('300033.SZ','gssz0300033'),{...company('688318.SH',null),home_market:'US'}],{'600570':{orgId:'gssh0600570',name:'恒生电子',category:'A股'},'688318':{orgId:'x',name:'y',category:'A股'}},'2026-09-26');
  expect(out.filled).toEqual(['600570.SH']);
  expect(out.companies[0].keys.cninfo_org_id).toBe('gssh0600570');
  expect(out.companies[0].missing).toEqual(['lei','cik']);
  expect(out.companies[0].provenance.cninfo_org_id).toEqual({source:'web:cninfo.com.cn',retrieved_at:'2026-09-26',ref:'http://www.cninfo.com.cn/new/information/topSearch/query keyWord=600570'});
  expect(out.companies[1].keys.cninfo_org_id).toBe('gssz0300033');
  expect(out.companies[2].keys.cninfo_org_id).toBeNull(); // not an A-share row
  expect(out.unresolved).toEqual([]);
 });
 it('reports codes that could not be resolved',()=>{
  const out=applyOrgIds([company('600570.SH',null)],{},'2026-09-26');
  expect(out.filled).toEqual([]);expect(out.unresolved).toEqual(['600570.SH']);
 });
});
