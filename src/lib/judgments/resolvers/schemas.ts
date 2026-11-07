// src/lib/judgments/resolvers/schemas.ts
// Strict ajv 8 JSON Schemas for each public resolver's condition params (spec §3.3: every resolver exports
// validateParams()). Same Ajv usage as src/lib/research/s6/market-handoff.ts (strict, first error only).
// additionalProperties:false everywhere: a registered condition carries exactly the frozen fields the resolver
// reads. Date patterns are shape-only; resolvers add isRealDate() (2026-02-30 is rejected).
import Ajv from 'ajv';
import type {FactMetricParams,MacroRegimeReplayParams,PriceReturnParams} from '../types';

const ajv=new Ajv({strict:true,allErrors:false});
const DATE='^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$';
const PERIOD='^\\d{4}-(0[1-9]|1[0-2])$';
const UUID='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const TEXT={type:'string',minLength:1,maxLength:128};
const TICKER={type:'string',minLength:1,maxLength:24,pattern:'^[A-Za-z0-9.\\-]+$'};
const PRICE_MARKETS=['A','HK','US'];
export const KLINE_SOURCES=['datagateway','eastmoney','sina','tencent','twse','tpex'] as const;

export const isRealDate=(d:string)=>{const t=Date.parse(`${d}T00:00:00Z`);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d;};

export const validatePriceReturnParams=ajv.compile({type:'object',additionalProperties:false,required:['ticker','market','adjustment','source','base_date'],properties:{
 ticker:TICKER,market:{type:'string',enum:PRICE_MARKETS},adjustment:{type:'string',enum:['qfq','hfq']},source:{type:'string',enum:[...KLINE_SOURCES]},
 base_date:{type:'string',pattern:DATE},
 benchmark:{type:'object',additionalProperties:false,required:['ticker','market'],properties:{ticker:TICKER,market:{type:'string',enum:PRICE_MARKETS}}},
}}) as unknown as (v:unknown)=>v is PriceReturnParams;

export const validateFactMetricParams=ajv.compile({type:'object',additionalProperties:false,
 required:['issuer_id','market','metric','period_start','period_end','duration','unit','input_unit','basis','formula_version','compare'],properties:{
 issuer_id:{type:'string',pattern:UUID},market:{type:'string',enum:['US','CN']},metric:{type:'string',pattern:'^[a-z][a-z0-9_]{0,63}$'},
 period_start:{type:'string',pattern:DATE},period_end:{type:'string',pattern:DATE},duration:{type:'string',enum:['3M','6M','9M','12M','INSTANT','TTM']},
 unit:TEXT,input_unit:TEXT,basis:TEXT,formula_version:TEXT,compare:{type:'string',enum:['value','yoy']},
}}) as unknown as (v:unknown)=>v is FactMetricParams;

export const validateMacroRegimeReplayParams=ajv.compile({type:'object',additionalProperties:false,required:['region','reference_period','macro_methodology_version','catalog_version'],properties:{
 region:{type:'string',enum:['US','CN']},reference_period:{type:'string',pattern:PERIOD},macro_methodology_version:TEXT,catalog_version:TEXT,
}}) as unknown as (v:unknown)=>v is MacroRegimeReplayParams;
