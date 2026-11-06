// src/lib/dq/reconcile/pair-cn-gold.ts
// cn.tushare_vs_cninfo_pdf_gold (spec §5.4, T14, owner decision D). Members = the gold file's tickers resolved to
// issuers (CN); expected keys = its rows (<ticker>:<fy>:<concept>:<report_type>). Left binding ONLY through the
// verified tushare_source_ref: filings(source tushare, source_ref) — absent → left_unlinked; a document_ref that
// differs from cninfo_announcement_id is recorded as detail.document_ref_mismatch and never rebinds or substitutes
// (the plan-2 linker may point type-1 filings at a correction or the next year's report). Facts: read_filing_facts
// filtered by activeRows and by the concept's period/duration/unit; an open reconcile_mismatch item pins its fact.
// passed ⇔ left ∈ [center − radius, center + radius] (cross-multiplication); tolerance = radius / max(|l|,|center|,1).
// A failure quarantines the ok left row only for exact printing (multiplier 1, two decimals); rounded printing opens a
// reconcile_review item and the fact stays ok — whether a difference is rounding or data is a human call.
// Degraded path (no TUSHARE_TOKEN, no transcriber yet): the gold file does not exist, members() → invalid_gold_file;
// no CN cron (vercel.json) and the route refuses cn.* without FACTS_CN_ENABLED=1.
import {resolveIssuer} from '../../entities/resolve';
import type {FactRow} from '../../facts/types';
import {divDecimal,maxAbsDecimal,withinRadius} from './decimal';
import {CN_GOLD_PARSER,CN_GOLD_PATH,GOLD_CN_SCHEMA,autoQuarantinable,cnGoldKey,cnPeriodOf,printedInterval,validateGoldCn} from './gold-cn';
import type {GoldCnFile} from './gold-cn';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,activeRows,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileResultInput} from './types';

const PAIR='cn.tushare_vs_cninfo_pdf_gold' as const;
const SIDES={left_source:'tushare',right_source:'cninfo.pdf.gold'};

async function loadGold(ctx:PairContext):Promise<{file:GoldCnFile;sha256:string}>{
 const {json,sha256}=await readRepoJson(ctx,CN_GOLD_PATH,'invalid_gold_file');
 const v=validateGoldCn(json);
 if(!v.ok)throw new ReconcileConfigError('invalid_gold_file',v.errors.slice(0,5).join('; '));
 return {file:v.file,sha256};
}

export function cnTushareVsGoldPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:'tushare',right:'cninfo.pdf.gold',
  inputs:{repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA},
  // the current gold manifest row of the key names the PDF evidence (source.pdf_sha256); gone → null (plan audit P2)
  async currentRight(ctx,rec){
   try{const {file}=await loadGold(ctx);return file.rows.find(r=>cnGoldKey(r)===String(rec.natural_key))?.source.pdf_sha256??null;}
   catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
  },
  async members(ctx){
   const {file}=await loadGold(ctx);
   const out:MemberPlan[]=[];
   for(const ticker of [...file.tickers].sort()){
    const r=await resolveIssuer(ctx.tables,{ticker},{today:todayOf(ctx)});
    if(!r)throw new ReconcileConfigError('issuer_unresolved',ticker);
    const rows=file.rows.filter(x=>x.ticker===ticker).sort((a,b)=>a.fiscal_year-b.fiscal_year||a.concept.localeCompare(b.concept));
    out.push({issuerId:r.issuer_id,market:'CN',expectedKeys:rows.map(x=>({naturalKey:cnGoldKey(x),locator:{ticker,fiscal_year:x.fiscal_year,concept:x.concept,tushare_source_ref:x.tushare_source_ref}}))});
   }
   return out;
  },
  async evaluate(ctx,member){
   const {file,sha256:goldSha}=await loadGold(ctx);
   const current=new Map(file.rows.map(r=>[cnGoldKey(r),r]));
   const open=await openMismatches(ctx.tables,PAIR,'CN');
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const row=current.get(k.naturalKey);
    if(!row){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'row_removed'}));continue;}
    const filing=await ctx.db.findFilingBySourceRef('tushare',row.tushare_source_ref);
    if(!filing){out.push(notCompared(k.naturalKey,'numeric','left_unlinked',SIDES,{tushare_source_ref:row.tushare_source_ref}));continue;}
    const docMismatch=filing.document_ref!==row.source.cninfo_announcement_id;
    const p=cnPeriodOf(row.fiscal_year,row.concept);
    const bound=open.get(k.naturalKey);
    const rows:FactRow[]=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1)
     :activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing).filter(f=>f.concept===row.concept&&f.period_end===p.period_end&&f.period_start===p.period_start&&f.duration===p.duration&&f.unit===p.unit);
    const flag=docMismatch?{document_ref_mismatch:true}:{};
    if(rows.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{filing_id:filing.filing_id,...flag}));continue;}
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{fact_ids:rows.map(r=>r.fact_id),...flag}));continue;}
    const left=rows[0];
    const {center,radius}=printedInterval(row);
    const passed=withinRadius(left.value,center,radius);
    const tolerance=divDecimal(radius,maxAbsDecimal(left.value,center,'1'),20);
    const auto=autoQuarantinable(row);
    const action=actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:auto?'quarantine_left':'review_item'});
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:row.source.pdf_sha256,gold_or_sample_sha256:goldSha,parser_version:CN_GOLD_PARSER});
    const locator={document:row.source.document,cninfo_announcement_id:row.source.cninfo_announcement_id,pdf_url:row.source.pdf_url,page:row.source.page,table:row.source.table,column:row.column};
    out.push(comparedNumeric(k.naturalKey,left.value,center,{passed,tolerance,sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}},
      right:{document:row.source.document,sha256:row.source.pdf_sha256,locator,precision:{printed_decimals:row.printed_decimals,multiplier:row.printed_unit_multiplier}},
      unit:p.unit,interval:{center,radius},tolerance_rule:'printed_precision/1',auto_quarantine:auto,inputs_hash,report_type:row.report_type??1,...flag},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,center,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}
