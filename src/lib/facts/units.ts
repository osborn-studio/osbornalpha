// src/lib/facts/units.ts
// Unit normalisation (spec §3). companyfacts units become 'USD' (or another ISO currency as-is),
// 'shares', '<CCY>/share' and 'pure'; Tushare money is 'CNY', eps 'CNY/share', total_share
// 'shares'. The unit is part of the fact key, so this is the only place where two spellings may
// be merged; anything else is kept distinct or rejected (null) and never silently converted.
import type {UnitKind} from './types';

/** Active ISO 4217 alphabetic currency codes (funds/metals/test codes excluded), sorted; other currencies are kept as-is (spec §3). */
export const CURRENCIES=['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWG'] as const;
const CURRENCY=new Set<string>(CURRENCIES);
export const MAX_UNIT_LENGTH=16;

/** companyfacts unit → stored unit, or null when the shape is not one we store (e.g. 'USD/EUR', 'Year', 'sqft'). */
export function normalizeUnit(raw:string):string|null{
 if(raw==='shares'||raw==='pure')return raw;
 if(CURRENCY.has(raw))return raw;
 const m=/^([A-Z]{3})\/shares$/.exec(raw);
 if(m&&CURRENCY.has(m[1]))return `${m[1]}/share`;
 return null;
}

/** Stored unit of a Tushare column by unit kind; money and per-share values are in CNY. */
export function rawUnitOf(kind:UnitKind,currency:string='CNY'):string{
 if(!CURRENCY.has(currency))throw new Error(`unknown_currency:${currency}`);
 return kind==='money'?currency:kind==='shares'?'shares':`${currency}/share`;
}

/** Units a concept of this kind may carry; feed to unitRule('unit_'+kind, unit, allowedUnits(kind)). */
export function allowedUnits(kind:UnitKind):readonly string[]{
 return kind==='money'?CURRENCIES:kind==='shares'?['shares']:CURRENCIES.map(c=>`${c}/share`);
}

/** Kind of a stored unit, or null for units no concept carries ('pure'). */
export function unitKindOf(unit:string):UnitKind|null{
 if(unit==='shares')return 'shares';
 if(CURRENCY.has(unit))return 'money';
 const m=/^([A-Z]{3})\/share$/.exec(unit);
 return m&&CURRENCY.has(m[1])?'per_share':null;
}
