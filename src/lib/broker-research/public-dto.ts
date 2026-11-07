// src/lib/broker-research/public-dto.ts
// Whitelist serializers for the public read API and pages (spec §8.1, §12.1 "dto"). Every output key
// is written here explicitly — view rows are never spread — so a column added to a §4.11 view, or a
// private column reaching a bundle by mistake, cannot leak. Defence in depth on top of the views:
// target-price values (and citations of target-price fields) are dropped whenever
// target_price_public is not true; snippets longer than the licence N, or with N unknown, are
// dropped; summaries are dropped unless summary_public is true. Numeric columns become decimal
// strings; malformed or exponent forms become null (never a guessed value). upside_pct / upsidePct is
// a FRACTION (upside/1 = round(tp/pr − 1, 6)); only the display layer (components/format.ts) ×100.
import type {FieldName,NormalizedRating,PublicReportBundle,PublicReportDetail,ReportScope,SnippetPurpose,ValueUnit} from './types';

type Row=Record<string,unknown>;
export const PUBLIC_RATINGS:readonly NormalizedRating[]=['buy','overweight','neutral','underweight','sell','not_rated'];
export const PUBLIC_SCOPES:readonly ReportScope[]=['single_issuer','multi_issuer','sector','macro_strategy'];
export const SNIPPET_PURPOSES:readonly SnippetPurpose[]=['rating','target','thesis','risk','method','other'];
const UNITS:readonly ValueUnit[]=['pct','ratio','months','price'];
const FIELDS:readonly FieldName[]=['institution','analyst','published_date','price_as_of_date','ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method','sector','title'];
export const TARGET_PRICE_FIELDS:ReadonlySet<string>=new Set(['target_price','target_currency','target_horizon','upside_stated']);
const DEC=/^-?\d+(?:\.\d+)?$/;
const CITATION_STATUSES=['confirmed','corrected','absent'] as const;
const EXTRACTOR_KINDS=['llm','human'] as const;

const str=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;
const oneOf=<T extends string>(v:unknown,all:readonly T[]):T|null=>typeof v==='string'&&(all as readonly string[]).includes(v)?v as T:null;
const int=(v:unknown):number|null=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'&&/^-?\d{1,9}$/.test(v)?Number(v):null;
const day=(v:unknown):string|null=>{const s=str(v);return s!==null&&/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null;};
const instant=(v:unknown):string|null=>{const s=str(v);return s!==null&&Number.isFinite(Date.parse(s))?s:null;};
export const notNull=<T>(v:T|null|undefined):v is T=>v!==null&&v!==undefined;
/** numeric column → decimal string, or null. */
export function dec(v:unknown):string|null{
 const s=typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):null;
 return s!==null&&DEC.test(s)?s:null;
}

export interface PublicInstitutionDto{id:string;nameEn:string;nameZh:string|null;aliases:string[];kind:string|null;ratingDisclosureUrl:string|null;reportCount:number;lastPublishedDate:string|null;lastAvailableAt:string|null}
export type PublicInstitutionRef=Pick<PublicInstitutionDto,'id'|'nameEn'|'nameZh'>;
export interface PublicInstitutionAnalystDto{analystId:string;displayName:string;reportCount:number}
export interface PublicTargetDto{
 currency:string|null; // effective public currency: public target price, else report price, else null
 targetKey:string;tickerAsStated:string;securityTicker:string|null;issuerId:string|null;publicationId:string|null;
 rating:{raw:string|null;normalized:NormalizedRating|null;scaleId:string|null};
 target:{price:string;currency:string|null;horizonMonths:number|null}|null;
 priceAtReport:{value:string;currency:string|null;asOf:string|null}|null;
 upsidePct:string|null;upsideFormulaVersion:string|null;
}
export interface PublicTitleDto{text:string;isRewritten:boolean;zh:string|null;en:string|null;isTranslation:boolean;modelId:string|null}
export interface PublicReportDto{
 reportId:string;revision:number;scope:ReportScope|null;institution:PublicInstitutionRef|null;targets:PublicTargetDto[];primaryTargetKey:string|null;
 title:PublicTitleDto;publishedDate:string|null;reportType:string|null;sectorAsStated:string|null;availableAt:string|null;codeVersion:string|null;
 hasSummary:{zh:boolean;en:boolean};snippetCount:number;targetPricePublic:boolean;rulesVersion:string|null;
}
export interface PublicCitationDto{fieldId:string|null;targetKey:string|null;field:FieldName;occurrence:number;page:number|null;valueText:string;valueNum:string|null;valueCurrency:string|null;valueUnit:ValueUnit|null;valueDate:string|null;status:typeof CITATION_STATUSES[number];extractorKind:typeof EXTRACTOR_KINDS[number]|null}
export interface PublicSnippetDto{snippetId:string;fieldId:string|null;targetKey:string|null;purpose:SnippetPurpose;page:number|null;text:string}
export interface PublicGroundingDto{sentenceIdx:number;targetKey:string;field:FieldName;value:string;unit:ValueUnit}
export interface PublicSummaryDto{summaryId:string;lang:'zh'|'en';label:'independent_summary';modelId:string|null;promptVersion:string|null;generatedAt:string|null;markdown:string;groundingAssertions:PublicGroundingDto[]}
export interface PublicAnalystDto{analystId:string;displayName:string;role:string|null}
export interface PublicReportDetailDto extends PublicReportDto{
 citations:PublicCitationDto[];snippets:PublicSnippetDto[];summaries:{zh:PublicSummaryDto|null;en:PublicSummaryDto|null};analysts:PublicAnalystDto[];
 licence:{snippetMaxChars:number|null;targetPricePublic:boolean;summaryPublic:boolean};settlement:null;
}
export interface PublicHistoryRowDto{
 reportId:string;prevReportId:string|null;institutionId:string|null;securityTicker:string;issuerId:string|null;publishedDate:string|null;prevPublishedDate:string|null;
 ratingNormalized:NormalizedRating|null;prevRatingNormalized:NormalizedRating|null;scaleId:string|null;prevScaleId:string|null;targetPrice:string|null;prevTargetPrice:string|null;
 targetCurrency:string|null;upsideFormulaVersion:string|null;prevUpsideFormulaVersion:string|null;codeVersion:string|null;prevCodeVersion:string|null;availableAt:string|null;prevAvailableAt:string|null;
}

export function toPublicInstitution(row:Row|null|undefined):PublicInstitutionDto|null{
 if(!row)return null;
 const id=str(row.institution_id),nameEn=str(row.name_en);if(!id||!nameEn)return null;
 const aliases=Array.isArray(row.aliases)?row.aliases.filter((a):a is string=>typeof a==='string'&&a.length>0):[];
 const url=str(row.rating_disclosure_url);
 return {id,nameEn,nameZh:str(row.name_zh),aliases,kind:str(row.kind),ratingDisclosureUrl:url!==null&&/^https?:\/\//i.test(url)?url:null,
  reportCount:int(row.report_count)??0,lastPublishedDate:day(row.last_published_date),lastAvailableAt:instant(row.last_available_at)};
}
export function toPublicInstitutionAnalyst(row:Row):PublicInstitutionAnalystDto|null{
 const analystId=str(row.analyst_id),displayName=str(row.display_name);
 return analystId&&displayName?{analystId,displayName,reportCount:int(row.report_count)??0}:null;
}

export function toPublicTarget(row:Row,targetPricePublic:boolean):PublicTargetDto|null{
 const targetKey=str(row.target_key);if(!targetKey)return null;
 const allowed=targetPricePublic&&row.target_price_public===true;
 const price=allowed?dec(row.target_price):null,par=dec(row.price_at_report);
 return {
  currency:price!==null?str(row.target_currency):par!==null?str(row.price_currency):null,
  targetKey,tickerAsStated:str(row.ticker_as_stated)??targetKey,securityTicker:str(row.security_ticker),issuerId:str(row.issuer_id),publicationId:str(row.publication_id),
  rating:{raw:str(row.rating_raw),normalized:oneOf(row.rating_normalized,PUBLIC_RATINGS),scaleId:str(row.scale_id)},
  target:price===null?null:{price,currency:str(row.target_currency),horizonMonths:int(row.target_horizon_months)},
  priceAtReport:par===null?null:{value:par,currency:str(row.price_currency),asOf:day(row.price_as_of_date)},
  upsidePct:allowed?dec(row.upside_pct):null,upsideFormulaVersion:str(row.upside_formula_version),
 };
}

export function toPublicReport(b:PublicReportBundle):PublicReportDto|null{
 const r=b.report;const reportId=str(r.report_id),text=str(r.title);if(!reportId||!text)return null;
 const tpp=r.target_price_public===true;
 const inst=toPublicInstitution(b.institution);
 const snippetCount=typeof b.snippetCount==='number'&&Number.isSafeInteger(b.snippetCount)&&b.snippetCount>0?b.snippetCount:0;
 return {
  reportId,revision:int(r.revision)??1,scope:oneOf(r.scope,PUBLIC_SCOPES),institution:inst?{id:inst.id,nameEn:inst.nameEn,nameZh:inst.nameZh}:null,
  targets:b.targets.map(t=>toPublicTarget(t,tpp)).filter(notNull),primaryTargetKey:str(r.primary_target_key),
  title:{text,isRewritten:r.title_is_rewritten===true,zh:str(r.title_zh),en:str(r.title_en),isTranslation:r.title_is_translation===true,modelId:r.title_is_translation===true?str(r.title_model_id):null},
  publishedDate:day(r.published_date),reportType:str(r.report_type),sectorAsStated:str(r.sector_as_stated),availableAt:instant(r.available_at),codeVersion:str(r.code_version),
  hasSummary:{zh:b.hasSummary?.zh===true,en:b.hasSummary?.en===true},snippetCount,targetPricePublic:tpp,rulesVersion:str(r.rules_version),
 };
}

function toCitation(row:Row,tpp:boolean):PublicCitationDto|null{
 const field=oneOf(row.field,FIELDS),status=oneOf(row.status,CITATION_STATUSES),valueText=str(row.value_text);
 if(!field||!status||valueText===null)return null;
 if(!tpp&&TARGET_PRICE_FIELDS.has(field))return null;
 return {fieldId:str(row.field_id),targetKey:str(row.target_key),field,occurrence:int(row.occurrence)??1,page:int(row.page),valueText,valueNum:dec(row.value_num),valueCurrency:str(row.value_currency),
  valueUnit:oneOf(row.value_unit,UNITS),valueDate:day(row.value_date),status,extractorKind:oneOf(row.extractor_kind,EXTRACTOR_KINDS)};
}
function toSnippet(row:Row,max:number|null):PublicSnippetDto|null{
 const snippetId=str(row.snippet_id),text=str(row.text),purpose=oneOf(row.purpose,SNIPPET_PURPOSES);
 if(!snippetId||text===null||!purpose||max===null||text.length>max)return null;
 return {snippetId,fieldId:str(row.field_id),targetKey:str(row.target_key),purpose,page:int(row.page),text};
}
function toSummary(row:Row,tpp:boolean):PublicSummaryDto|null{
 const summaryId=str(row.summary_id),lang=oneOf(row.lang,['zh','en'] as const),markdown=str(row.summary_md);
 if(!summaryId||!lang||markdown===null||row.kind!=='independent_summary')return null;
 const groundingAssertions=(Array.isArray(row.grounding_assertions)?row.grounding_assertions:[]).map((a:unknown)=>{
  const x=(a??{}) as Row;const sentenceIdx=int(x.sentence_idx),targetKey=str(x.target_key),field=oneOf(x.field,FIELDS),value=dec(x.value),unit=oneOf(x.unit,UNITS);
  return sentenceIdx!==null&&targetKey&&field&&value!==null&&unit&&(tpp||!TARGET_PRICE_FIELDS.has(field))?{sentenceIdx,targetKey,field,value,unit}:null;}).filter(notNull);
 return {summaryId,lang,label:'independent_summary',modelId:str(row.model_id),promptVersion:str(row.prompt_version),generatedAt:instant(row.generated_at),markdown,groundingAssertions};
}

export function toPublicReportDetail(d:PublicReportDetail):PublicReportDetailDto|null{
 const base=toPublicReport(d);if(!base)return null;
 const r=d.report,tpp=base.targetPricePublic,summaryPublic=r.summary_public===true,max=int(r.snippet_max_chars);
 const summaries:{zh:PublicSummaryDto|null;en:PublicSummaryDto|null}={zh:null,en:null};
 if(summaryPublic)for(const s of d.summaries.map(x=>toSummary(x,tpp)).filter(notNull))if(summaries[s.lang]===null)summaries[s.lang]=s;
 const snippets=d.snippets.map(s=>toSnippet(s,max)).filter(notNull);
 return {
  ...base,   // base is our own whitelisted DTO, not a view row
  hasSummary:{zh:summaries.zh!==null,en:summaries.en!==null},snippetCount:snippets.length,
  citations:d.citations.map(c=>toCitation(c,tpp)).filter(notNull),snippets,summaries,
  analysts:d.analysts.map(a=>{const analystId=str(a.analyst_id),displayName=str(a.display_name);return analystId&&displayName?{analystId,displayName,role:str(a.role)}:null;}).filter(notNull),
  licence:{snippetMaxChars:max,targetPricePublic:tpp,summaryPublic},settlement:null,
 };
}

export function toPublicHistoryRow(row:Row):PublicHistoryRowDto|null{
 const reportId=str(row.report_id),securityTicker=str(row.security_ticker);if(!reportId||!securityTicker)return null;
 return {
  reportId,prevReportId:str(row.prev_report_id),institutionId:str(row.institution_id),securityTicker,issuerId:str(row.issuer_id),
  publishedDate:day(row.published_date),prevPublishedDate:day(row.prev_published_date),
  ratingNormalized:oneOf(row.rating_normalized,PUBLIC_RATINGS),prevRatingNormalized:oneOf(row.prev_rating_normalized,PUBLIC_RATINGS),
  scaleId:str(row.scale_id),prevScaleId:str(row.prev_scale_id),targetPrice:dec(row.target_price),prevTargetPrice:dec(row.prev_target_price),targetCurrency:str(row.target_currency),
  upsideFormulaVersion:str(row.upside_formula_version),prevUpsideFormulaVersion:str(row.prev_upside_formula_version),codeVersion:str(row.code_version),prevCodeVersion:str(row.prev_code_version),
  availableAt:instant(row.available_at),prevAvailableAt:instant(row.prev_available_at),
 };
}
