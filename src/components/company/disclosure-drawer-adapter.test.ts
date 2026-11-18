import {expect,it} from 'vitest';
import type {FactSeriesResponse,SeriesEntry} from '@/lib/company/client';
import type {EvidenceDto} from '@/lib/company/types';
import {disclosureDrawerInput} from './disclosure-drawer-adapter';
import {drawerRows} from './drawer-model';
const entry=(id:string,seq:number):SeriesEntry=>({kind:'fact',factId:id,sourceConcept:'Revenues',unit:'USD',availableDate:`2025-02-0${seq}`,filingId:'filing',disclosureSeq:seq,isCurrent:seq===2,isRevision:seq===2,mappingVersion:'map/1',mappingGen:3,value:'123456789',rawHash:'raw',runId:'run',unitRule:null,delta:null,relChange:null});
const evidence:EvidenceDto={factId:'b',rawHash:'raw',snapshot:{source:'edgar',sha256:'hash',path:'x',api:'companyfacts',url:null,params:null,capturedAt:'2025-02-03T12:00:00Z',httpStatus:200,page:null,download:'/api/evidence/hash'},locator:{hashLocator:'loc',jsonPointer:'/facts/0',field:null,pdf:null},run:{runId:'run',codeVersion:'abcdef012345',toolVersions:null},mappingVersion:'map/1',unitRule:'usd',sourceDocument:null};
export const disclosureFixture:FactSeriesResponse={issuerId:'issuer',ticker:'AAPL',market:'US',asOf:'2025-03-01',mappingGen:3,stateRev:1,truncated:false,history:true,concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',unit:'USD',series:[entry('a',1),entry('b',2)],otherUnits:[],otherUnitSeries:[],evidence:{b:evidence},filings:{filing:{filingId:'filing',source:'edgar',fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2024-12-31',linkAttempts:0,factCount:2,mappingGen:3,formType:'10-K',sourceRef:'accession',availableDate:'2025-02-02',citation:'edgar',url:'https://sec.gov/filing',documentUrl:null}},withheld:{citationPending:0,evidenceIncomplete:0}};
const key={concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',unit:'USD'};
const t=(k:string,v?:Record<string,string|number>)=>[k,...Object.values(v??{})].join(' ');
const adapt=(data:FactSeriesResponse|null,selected=data?drawerRows(data,6)[1]:null)=>disclosureDrawerInput({ticker:'AAPL',key,data,selected,scaleExp:6,asOf:'2025-03-01',conceptLabel:'Revenue',text:t});
it('maps selected evidence, replay, scale, full code version and ascending revisions',()=>{
 const input=adapt(disclosureFixture);expect(input.variant).toBe('ok');if(input.variant!=='ok')throw Error();
 expect(input.payload).toMatchObject({kind:'financial_fact',identity:{id:'b',label:'AAPL · Revenue revenue · 2024-01-01 → 2024-12-31'},source:{publisher:'SEC EDGAR',adapter:'edgar · companyfacts',url:'https://sec.gov/filing',evidence_sha256:'hash'},times:{available_at:'2025-02-02',ingested_at:evidence.snapshot.capturedAt},transform:{code_version:'abcdef012345',mapping_version:'map/1 · gen 3',method_version:null},licence:{status:'edgar',note_key:'citationEdgar'},links:{module_href:'/stock/AAPL?view=statements&asOf=2025-03-01'}});
 expect(input.extras).toMatchObject({as_of:'2025-03-01',relay:null,evidence_href:'/api/evidence/hash',states:['revised']});
 expect(input.extras?.value).toContain('123.46');
 expect(input.extras?.revisions?.map(r=>r.current)).toEqual([false,true]);
 expect(input.extras?.revisions?.map(r=>r.version.split(' ')[0])).toEqual(['#1','#2']);
});
it('keeps a natural identity and empty unknowns during loading',()=>{const input=adapt(null);if(input.variant!=='ok')throw Error();expect(input.payload.identity.id).toBe('revenue|2024-01-01|2024-12-31|USD');expect(input.payload.source.publisher).toBe('');expect(input.payload.transform.code_version).toBeNull();expect(input.extras?.value).toBeUndefined();});
it('never serializes a withheld row value, even if an unexpected value arrives',()=>{
 const hidden={...entry('hidden',3),kind:'withheld' as const,reason:'citation_pending' as const,value:'987654321.123'};
 const data={...disclosureFixture,market:'CN' as const,series:[...disclosureFixture.series,hidden]};
 expect(JSON.stringify(adapt(data))).not.toContain(hidden.value);
 const input=adapt(data,drawerRows(data,6)[2]);expect(input.variant).toBe('withheld');expect(JSON.stringify(input)).not.toContain(hidden.value);expect(input).not.toHaveProperty('payload');
});
it('does not guess an unknown CN publisher',()=>{const data={...disclosureFixture,market:'CN' as const,evidence:{b:{...evidence,snapshot:{...evidence.snapshot,source:'unknown' as never}}}};const input=adapt(data);if(input.variant!=='ok')throw Error();expect(input.payload.source.publisher).toBe('');});
it('all-withheld series produce only identity and reason even without a selection',()=>{const data={...disclosureFixture,market:'CN' as const,series:[{...entry('hidden',1),kind:'withheld' as const,reason:'citation_pending' as const,value:'987654321.123'}]};expect(adapt(data,null).variant).toBe('withheld');});

it.each([['999999.SH','SSE'],['999999.SZ','SZSE'],['999999.BJ','BSE'],['UNKNOWN','']])('CN snapshot uses exchange publisher for %s and Tushare relay', (ticker,publisher)=>{
 const data:FactSeriesResponse={...disclosureFixture,ticker,market:'CN',evidence:{b:{...evidence,snapshot:{...evidence.snapshot,source:'tushare'}}}};
 const input=disclosureDrawerInput({ticker,key,data,selected:drawerRows(data,6)[1],scaleExp:6,asOf:null,conceptLabel:'Revenue',text:t});
 if(input.variant!=='ok')throw Error('expected evidence');
 expect(input.payload.source.publisher).toBe(publisher);
 expect(input.extras?.relay).toBe('Tushare');
});
