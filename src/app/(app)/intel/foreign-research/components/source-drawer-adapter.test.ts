import {expect,it} from 'vitest';
import {brokerDrawerInput,type BrokerDrawerTarget} from './source-drawer-adapter';
import {drawerSections} from '@/components/research-ui/source-drawer/model';
const input:BrokerDrawerTarget={
 subject:{label:'rating',targetKey:'x',value:'SECRET-RATING-TARGET',citation:null,snippets:[],judgment:true},
 availableAt:null,codeVersion:null,rulesVersion:null,publicationId:'snapshot',
 metadata:{reportId:'report/id',institution:{id:'institution/id',nameEn:'Broker',nameZh:null},title:'Report title',reportDate:'2026-01-01',licence:null},
 text:k=>k,
};
it('adapts metadata only, with a withheld PDF and internal links',()=>{
 const result=brokerDrawerInput(input);expect(result.variant).toBe('ok');if(result.variant!=='ok')throw Error();
 expect(result.payload.kind).toBe('broker_report_meta');
 expect(result.payload.identity).toEqual({id:'snapshot',label:'Broker · Report title'});
 const pdf=result.extras?.rows?.source?.find(r=>r.key==='pdf');
 expect(pdf).toMatchObject({state:'withheld',value:''});expect(pdf).not.toHaveProperty('href');
 const json=JSON.stringify(result);
 expect(json).not.toContain('SECRET-RATING-TARGET');expect(json).not.toMatch(/"rating"|"targetPrice"|"snippets"|"citation"/);
 expect(result.payload.links.module_href).toBe('/intel/foreign-research/report%2Fid');
 expect(result.extras?.links?.[0].href).toBe('/intel/foreign-research/institutions/institution%2Fid');
});
it('retains unavailable standard and module fields as missing rows',()=>{
 const rows=drawerSections(brokerDrawerInput(input),k=>k,k=>k).flatMap(s=>s.rows);
 for(const key of ['availableAt','ingestedAt','codeVersion','mappingVersion','methodVersion','publishedAt','extractionModel','status']){
  expect(rows.find(r=>r.key===key)).toBeDefined();
  expect(rows.find(r=>r.key===key)?.value??null).toBeOneOf([null,'']);
 }
});
it('never forwards field values, citation spans or snippet text even if supplied by an opener',()=>{
 const result=brokerDrawerInput({...input,subject:{...input.subject,citation:{fieldId:'secret-field',targetKey:'x',field:'target_price',occurrence:1,page:42,valueText:'private-value',valueNum:'999999',valueCurrency:'USD',valueUnit:'price',valueDate:null,status:'confirmed',extractorKind:'llm'},snippets:[{snippetId:'private-id',fieldId:'secret-field',targetKey:'x',purpose:'target',page:42,text:'private snippet'}]}});
 const json=JSON.stringify(result);
 for(const value of ['secret-field','private-value','999999','private-id','private snippet'])expect(json).not.toContain(value);
});
