// Topic spec §4.1 production readers: service role throughout; public gates live in resolvers.
import type {SupabaseClient} from '@supabase/supabase-js';
import {selectAll,supabaseTableClient} from '@/lib/db/table-client';
import {observationFromRow,supabaseMacroDb} from '@/lib/macro/db';
import {seriesById} from '@/lib/macro/series-registry';
import {datasetOf} from '@/lib/macro/freshness';
import {supabaseIndustryDb} from '@/lib/industry/db';
import {publicCell,runHeader} from '@/lib/industry/read';
import {schemeDatasetKey} from '@/lib/industry/licenses';
import type {AggMetric,SchemeVersion} from '@/lib/industry/types';
import {factRowFromTable,filingFromTable,supabaseFactsDb} from '@/lib/facts/db';
import type {FactRow} from '@/lib/facts/types';
import {gateFacts} from '@/lib/company/evidence-gate';
import {supabaseCompanyDb} from '@/lib/company/db';
import {emptyPdfLocatorSource} from '@/lib/company/pdf-locator';
import {filingSummaryOf} from '@/lib/company/snapshot-read';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import {supabaseJudgmentsDb} from '@/lib/judgments/db';
import {freshnessOf} from '@/lib/dq/freshness';
import type {EvidenceSources,FactEligibility,IndustryCellKey} from './sources';

export function productionSources(clients:{admin:SupabaseClient}):EvidenceSources{
 const {admin}=clients,tables=supabaseTableClient(admin);
 const macro=supabaseMacroDb({admin,anon:admin}),industry=supabaseIndustryDb(admin),facts=supabaseFactsDb(admin);
 const documents=supabaseDocumentsDb(admin),judgments=supabaseJudgmentsDb({admin,anon:admin});
 const gateDeps={db:supabaseCompanyDb(admin),pdf:emptyPdfLocatorSource};
 const filingRows=async(ids:readonly string[])=>(await Promise.all([...new Set(ids)].map(id=>tables.select('filings',{filing_id:id})))).flat().map(filingFromTable);
 const metricRows=(run:string,key:Omit<IndustryCellKey,'run_id'>)=>industry.metricRowsOfRun(run,{codes:[key.code],metrics:[key.metric as AggMetric],periodEnds:[key.period_end]});
 const currentFacts=async(row:FactRow)=>{
  if(String(row.market)==='HK')return [];
  const out=await facts.readFacts(row.issuer_id,row.market,{concepts:[row.concept],asOf:new Date().toISOString().slice(0,10),history:false});
  if(out.truncated)throw new Error('read_truncated');
  return out.rows.filter(r=>r.status==='ok'&&r.duration===row.duration&&r.consolidation===row.consolidation&&r.unit===row.unit);
 };
 return {
  macro:{
   async rows(ids){return (await Promise.all([...new Set(ids)].map(id=>tables.select('macro_observations',{observation_id:id})))).flat().map(observationFromRow);},
   async versions(seriesId,periodEnd){return (await selectAll(tables,'macro_observations',{series_id:seriesId,period_end:periodEnd},'observation_id')).map(observationFromRow).sort((a,b)=>a.version-b.version);},
   async latestPeriodEnd(seriesId){const [r]=await tables.select('macro_observations',{series_id:seriesId,status:'ok'},{orderBy:'period_end',desc:true,limit:1});return r?String(r.period_end):null;},
   series(id){
    const def=seriesById(id);if(!def)return null;
    return {id:def.id,name:def.name,unit:def.unit,status:def.status,rights:def.source?.rights??'public_domain',publisher:def.source?.publisher??{zh:'',en:''},
     relay:def.source?.via?.en??null,adapter:def.source?.adapter??'',dataset:datasetOf(def.region)};
   },
   async retrievals(ids){return new Map((await macro.retrievalsByIds([...ids])).map(r=>[r.retrieval_id,{retrieval_id:r.retrieval_id,fetch_url:r.fetch_url,fetched_at:r.fetched_at,sha256:r.sha256}]));},
  },
  industry:{
   async cell(key){
    const run=await industry.metricRun(key.run_id);if(!run)return null;
    const rows=await metricRows(run.run_id,key),raw=rows.find(r=>r.period_start===key.period_start);
    const row=raw?publicCell(raw,run.scheme):null,header=runHeader(run);
    const node=(await industry.classificationTree(run.scheme,run.version)).find(n=>n.code===key.code&&n.level===run.level);
    return {run:{run_id:run.run_id,scheme:run.scheme,version:run.version,level:run.level,generation:header.generation,status:run.status,
     history_class:header.historyClass,activated_at:header.activatedAt,method_version:header.methodVersion,code_version:header.codeVersion},
     row:row?{status:row.status,missing_reason:row.missingReason,value_text:row.value,unit:row.unit,duration:row.duration,n_members:row.nMembers,n_with_data:row.nWithData}:null,
     label:{zh:node?.name_zh??key.code,en:node?.name_en??node?.name_zh??key.code}};
   },
   datasetPublic:(scheme,version)=>industry.isDatasetPublic(schemeDatasetKey(scheme,version as SchemeVersion)),
   async activeCell(scheme,version,level,key){
    const run=await industry.activeMetricRun(scheme,version as SchemeVersion,level);if(!run?.activated_at)return null;
    const row=(await metricRows(run.run_id,key)).find(r=>r.period_start===key.period_start);
    return row?{run_id:run.run_id,value_text:row.status==='ok'?row.value:null,unit:row.unit,activated_at:run.activated_at}:null;
   },
   async latestPeriodEnd(scheme,version,level,code,metric){
    const run=await industry.activeMetricRun(scheme,version as SchemeVersion,level);if(!run)return null;
    return (await industry.metricRowsOfRun(run.run_id,{codes:[code],metrics:[metric as AggMetric]})).filter(r=>r.status==='ok').map(r=>r.period_end).sort().at(-1)??null;
   },
  },
  facts:{
   async facts(ids){
    const rows=(await Promise.all([...new Set(ids)].map(id=>tables.select('financial_facts',{fact_id:id})))).flat().map(factRowFromTable);
    const filings=new Map((await filingRows(rows.map(r=>r.filing_id))).map(f=>[f.filing_id,f]));
    const issuers=new Map(await Promise.all([...new Set(rows.map(r=>r.issuer_id))].map(async id=>{
     const [issuer]=await tables.select('issuers',{issuer_id:id});
     const today=new Date().toISOString().slice(0,10);
     const securities=(await selectAll(tables,'issuer_securities',{issuer_id:id,valid_to:null},'ticker')).filter(s=>String(s.valid_from)<=today&&(s.valid_to===null||s.valid_to===undefined||String(s.valid_to)>today));
     securities.sort((a,b)=>Number(b.is_primary===true)-Number(a.is_primary===true)||String(a.ticker).localeCompare(String(b.ticker)));
     return [id,{name:{zh:String(issuer?.canonical_name_zh??issuer?.canonical_name_en??id),en:String(issuer?.canonical_name_en??issuer?.canonical_name_zh??id)},ticker:securities[0]?String(securities[0].ticker):null}] as const;
    })));
    return rows.map(row=>{const f=filings.get(row.filing_id);return {row,issuer:issuers.get(row.issuer_id)!,filing:f?{form_type:f.form_type,source_ref:f.source_ref,url:f.url}:null,publisher:row.market==='US'?'SEC':'CNINFO'};});
   },
   async eligibility(rows,opts){
    const groups=new Map<string,FactRow[]>();
    for(const row of rows){if(String(row.market)==='HK')continue;const key=`${row.issuer_id}:${row.market}`;const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
    const result=new Map<string,FactEligibility>();
    for(const group of groups.values()){
     const {issuer_id:issuerId,market}=group[0];
     const filings=(await filingRows(group.map(r=>r.filing_id))).filter(f=>f.issuer_id===issuerId&&f.market===market&&f.mapping_gen>0);
     const filingMap=new Map(filings.map(f=>[f.filing_id,filingSummaryOf(f,0)]));
     const eligibleRows=group.filter(r=>filingMap.has(r.filing_id));
     const gated=await gateFacts(gateDeps,{issuerId,market,admin:opts.admin,factIds:group.map(r=>r.fact_id),facts:new Map(eligibleRows.map(r=>[r.fact_id,r])),filings:filingMap});
     for(const [id,eligibility] of gated.eligibility)result.set(id,eligibility);
    }
    return result;
   },
   async current(row){return (await currentFacts(row)).filter(r=>r.period_start===row.period_start&&r.period_end===row.period_end).sort((a,b)=>b.available_date.localeCompare(a.available_date)||(b.disclosure_seq??0)-(a.disclosure_seq??0)||b.mapping_gen-a.mapping_gen)[0]??null;},
   async newerPeriodEnd(row){return (await currentFacts(row)).filter(r=>r.period_end>row.period_end).map(r=>r.period_end).sort().at(-1)??null;},
  },
  documents:{async citation(id){
   const c=await documents.citationById(id);if(!c)return null;
   const d=await documents.documentById(c.document_id);if(!d)return null;
   return {citation_id:c.citation_id,document_id:c.document_id,page_no:c.page_no,snippet:c.snippet,text_hash:c.text_hash,visibility:c.visibility,created_at:c.created_at,
    document:{title:d.title,permission:d.permission,publisher:d.source==='edgar'?'SEC':d.source==='cninfo'?'CNINFO':d.source,url:d.source_url}};
  }},
  judgments:{async judgment(id){
   const envelope=await judgments.envelopeById(id,{view:'latest'});if(!envelope)return null;
   return {envelope,method:await judgments.methodology(envelope.judgment.methodology_id,envelope.judgment.methodology_version)};
  }},
  async freshness(dataset,now){
   const row=(await freshnessOf(tables,now)).find(r=>r.dataset===dataset);
   return {dataset,status:row?.status==='fresh'?'fresh':row?.status==='stale'||row?.status==='error'?'stale':'unknown',checked_at:now.toISOString()};
  },
 };
}
