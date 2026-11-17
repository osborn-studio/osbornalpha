// Mutable in-memory evidence sources (topic spec 2026-11-16 §4.1; plan T2.3–T2.7).
import type {FactRow} from '@/lib/facts/types';
import type {ObservationRow} from '@/lib/macro/types';
import type {CitationInfo,EvidenceSources,FactEligibility,FactInfo,IndustryCell,IndustryCellKey,JudgmentSource,MacroRetrieval,MacroSeriesInfo} from './sources';

export interface MemorySourcesSeed{
 macro:{rows:ObservationRow[];series:MacroSeriesInfo[];retrievals:MacroRetrieval[]};
 industry:{cells:(IndustryCell&{key:IndustryCellKey})[];publicDatasets:string[]};
 facts:{infos:FactInfo[];ineligible:Map<string,Extract<FactEligibility,{ok:false}>['reason']>};
 documents:{citations:CitationInfo[]};
 judgments:{items:NonNullable<Awaited<ReturnType<JudgmentSource['judgment']>>>[]};
 freshness:Record<string,'fresh'|'stale'|'unknown'>;
}
export type MemorySourcesInput={
 [K in keyof MemorySourcesSeed]?:K extends 'freshness'?MemorySourcesSeed[K]:Partial<MemorySourcesSeed[K]>;
};
const latest=(periods:string[]):string|null=>periods.sort().at(-1)??null;
const sameCell=(a:Omit<IndustryCellKey,'run_id'>,b:Omit<IndustryCellKey,'run_id'>)=>
 a.code===b.code&&a.metric===b.metric&&a.period_start===b.period_start&&a.period_end===b.period_end;
const sameFact=(a:FactRow,b:FactRow)=>a.issuer_id===b.issuer_id&&a.market===b.market&&a.concept===b.concept
 &&a.duration===b.duration&&a.consolidation===b.consolidation&&a.unit===b.unit;

/** Omitted groups are empty. Dataset flags use `scheme:<scheme>:<version>` keys, including fixture-only versions. */
export function memorySources(input:MemorySourcesInput={}):EvidenceSources&{seed:MemorySourcesSeed}{
 const seed:MemorySourcesSeed={
  macro:{rows:[],series:[],retrievals:[],...input.macro},industry:{cells:[],publicDatasets:[],...input.industry},
  facts:{infos:[],ineligible:new Map(),...input.facts},documents:{citations:[],...input.documents},
  judgments:{items:[],...input.judgments},freshness:{...input.freshness},
 };
 const activeRun=(scheme:'sw2021'|'sic',version:string,level:number)=>seed.industry.cells
  .filter(c=>c.run.scheme===scheme&&c.run.version===version&&c.run.level===level&&c.run.status==='active'&&c.run.activated_at!==null)
  .sort((a,b)=>b.run.generation-a.run.generation)[0]?.run;
 return {
  seed,
  macro:{
   async rows(ids){return seed.macro.rows.filter(r=>ids.includes(r.observation_id));},
   async versions(seriesId,periodEnd){return seed.macro.rows.filter(r=>r.series_id===seriesId&&r.period_end===periodEnd).sort((a,b)=>a.version-b.version);},
   async latestPeriodEnd(seriesId){return latest(seed.macro.rows.filter(r=>r.series_id===seriesId&&r.status==='ok').map(r=>r.period_end));},
   series(seriesId){return seed.macro.series.find(s=>s.id===seriesId)??null;},
   async retrievals(ids){return new Map(seed.macro.retrievals.filter(r=>ids.includes(r.retrieval_id)).map(r=>[r.retrieval_id,r]));},
  },
  industry:{
   async cell(key){
    const found=seed.industry.cells.find(c=>c.key.run_id===key.run_id&&sameCell(c.key,key));
    if(found)return {run:found.run,row:found.row,label:found.label};
    const run=seed.industry.cells.find(c=>c.key.run_id===key.run_id)?.run;
    return run?{run,row:null,label:{zh:'',en:''}}:null;
   },
   async datasetPublic(scheme,version){return seed.industry.publicDatasets.includes(`scheme:${scheme}:${version}`);},
   async activeCell(scheme,version,level,key){
    const run=activeRun(scheme,version,level);if(!run||!run.activated_at)return null;
    const row=seed.industry.cells.find(c=>c.key.run_id===run.run_id&&sameCell(c.key,key))?.row;
    return row?{run_id:run.run_id,value_text:row.status==='ok'?row.value_text:null,unit:row.unit,activated_at:run.activated_at}:null;
   },
   async latestPeriodEnd(scheme,version,level,code,metric){
    const run=activeRun(scheme,version,level);if(!run)return null;
    return latest(seed.industry.cells.filter(c=>c.key.run_id===run.run_id&&c.key.code===code&&c.key.metric===metric&&c.row?.status==='ok').map(c=>c.key.period_end));
   },
  },
  facts:{
   async facts(ids){return seed.facts.infos.filter(i=>ids.includes(i.row.fact_id));},
   async eligibility(rows,opts){
    return new Map(rows.map(row=>{
     const reason=seed.facts.ineligible.get(row.fact_id);
     const eligibility:FactEligibility=reason&&!(opts.admin&&reason==='citation_pending')?{ok:false,reason}:{ok:true};
     return [row.fact_id,eligibility];
    }));
   },
   async current(row){
    return seed.facts.infos.map(i=>i.row).filter(r=>r.status==='ok'&&sameFact(r,row)&&r.period_start===row.period_start&&r.period_end===row.period_end)
     .sort((a,b)=>b.available_date.localeCompare(a.available_date)||(b.disclosure_seq??0)-(a.disclosure_seq??0)||b.mapping_gen-a.mapping_gen||b.created_at.localeCompare(a.created_at))[0]??null;
   },
   async newerPeriodEnd(row){return latest(seed.facts.infos.map(i=>i.row).filter(r=>r.status==='ok'&&sameFact(r,row)&&r.period_end>row.period_end).map(r=>r.period_end));},
  },
  documents:{async citation(id){return seed.documents.citations.find(c=>c.citation_id===id)??null;}},
  judgments:{async judgment(id){return seed.judgments.items.find(i=>i.envelope.judgment.judgment_id===id)??null;}},
  async freshness(dataset,now){return {dataset,status:seed.freshness[dataset]??'unknown',checked_at:now.toISOString()};},
 };
}
