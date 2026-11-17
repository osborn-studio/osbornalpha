// src/lib/broker-research/extract/schema.ts
// Strict LLM response schema extract-schema/1 (spec §5.2). Currency evidence quotes the source
// mark; retry policy for invalid responses belongs to extract/run.ts.
import Ajv from 'ajv';
import {SCHEMA_VERSION} from '../versions';
export const QUOTE_MAX_CHARS=400;
export type ExtractionScope='single_issuer'|'multi_issuer'|'sector'|'macro_strategy';
export interface Evidence{value:string;page:number;quote:string;confidence:number}
export interface TargetExtraction{ticker:Evidence;exchange_hint?:string;rating?:Evidence;target_price?:Evidence;target_currency?:Evidence;target_horizon_months?:Evidence;price_at_report?:Evidence;price_currency?:Evidence;price_as_of_date?:Evidence;upside_stated?:Evidence}
export interface DocumentExtraction{scope:ExtractionScope;institution:Evidence;analysts:Evidence[];published_date:Evidence;title:Evidence;sector?:Evidence;valuation_method?:Evidence;wacc?:Evidence;terminal_growth?:Evidence;terminal_value_share?:Evidence;targets:TargetExtraction[]}
const evidence={type:'object',additionalProperties:false,required:['value','page','quote','confidence'],properties:{value:{type:'string',minLength:1},page:{type:'integer',minimum:1},quote:{type:'string',minLength:1,maxLength:QUOTE_MAX_CHARS},confidence:{type:'number',minimum:0,maximum:1}}};
const ev={$ref:'#/$defs/evidence'};
export const EXTRACT_SCHEMA={$id:SCHEMA_VERSION,$defs:{evidence},type:'object',additionalProperties:false,required:['scope','institution','analysts','published_date','title','targets'],properties:{scope:{enum:['single_issuer','multi_issuer','sector','macro_strategy']},institution:ev,analysts:{type:'array',items:ev},published_date:ev,title:ev,sector:ev,valuation_method:ev,wacc:ev,terminal_growth:ev,terminal_value_share:ev,targets:{type:'array',items:{type:'object',additionalProperties:false,required:['ticker'],properties:{ticker:ev,exchange_hint:{type:'string',minLength:1,maxLength:40},rating:ev,target_price:ev,target_currency:ev,target_horizon_months:ev,price_at_report:ev,price_currency:ev,price_as_of_date:ev,upside_stated:ev}}}}} as const;
const validate=new Ajv({strict:true,allErrors:true}).compile(EXTRACT_SCHEMA);
export type ValidationResult={ok:true;value:DocumentExtraction}|{ok:false;errors:string[]};
export function validateExtraction(json:unknown):ValidationResult{if(validate(json))return {ok:true,value:json as unknown as DocumentExtraction};return {ok:false,errors:(validate.errors??[]).map(e=>`${e.instancePath||'/'} ${e.message??'invalid'}`)};}
