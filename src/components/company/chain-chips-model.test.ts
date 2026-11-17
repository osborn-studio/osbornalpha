import {expect,it} from 'vitest';
import type {IssuerIndustriesView} from '@/lib/industry/read';
import {industryChip,industryUrl} from './chain-chips-model';
const ok=(publicSic=true):IssuerIndustriesView=>({state:'ok',issuerId:'id',on:'2025-01-01',industries:[],schemes:[{scheme:'sic',version:'sec-current',datasetKey:'scheme:sic:sec-current',public:publicSic}]} as IssuerIndustriesView);
it('does not fetch without issuer or outside US; preserves replay',()=>{
 expect(industryUrl(null,'US',null)).toBeNull();
 expect(industryUrl('id','CN',null)).toBeNull();
 expect(industryUrl('id','US','2025-01-01')).toBe('/api/entities/id/industries?on=2025-01-01');
});
it('maps all non-link states',()=>{
 expect(industryChip(null,'US',{status:'idle'},'en')).toEqual({kind:'none'});
 expect(industryChip('id','CN',{status:'idle'},'en')).toEqual({kind:'notServed'});
 for(const status of ['idle','loading'] as const) expect(industryChip('id','US',{status},'en')).toEqual({kind:'loading'});
 expect(industryChip('id','US',{status:'error',httpStatus:500,code:'internal'},'en')).toEqual({kind:'error'});
 expect(industryChip('id','US',{status:'ok',data:{state:'unknown_issuer'}},'en')).toEqual({kind:'error'});
 expect(industryChip('id','US',{status:'ok',data:ok(false)},'en')).toEqual({kind:'withheld'});
 expect(industryChip('id','US',{status:'ok',data:ok()},'en')).toEqual({kind:'missing'});
});
it('links the last SIC node and falls back between languages',()=>{
 const data=ok(); if(data.state!=='ok') throw Error();
 data.industries=[{scheme:'sic',path:[{code:'1',nameZh:'父',nameEn:'Parent'},{code:'1234',nameZh:'行业',nameEn:'Industry'}]}] as typeof data.industries;
 for(const locale of ['zh','en'] as const) expect(industryChip('id','US',{status:'ok',data},locale)).toEqual({kind:'link',href:'/intel/industries/sic/1234',code:'1234',name:locale==='zh'?'行业':'Industry'});
 data.industries[0].path[1].nameZh=null;
 expect(industryChip('id','US',{status:'ok',data},'zh')).toMatchObject({name:'Industry'});
 data.industries[0].path[1].nameZh='行业';data.industries[0].path[1].nameEn=null;
 expect(industryChip('id','US',{status:'ok',data},'en')).toMatchObject({name:'行业'});
});
