// src/lib/judgments/markets.ts
// The two market domains (spec §3.3 S06): FactsMarket 'US'|'CN' (facts layer) and PriceMarket
// 'A'|'HK'|'US' (K-line / scoring). Conditions, refs and hashes keep their own domain's value; the
// only conversion is here. HK has no facts market (the landed publicMarketOf refuses HK too): null
// makes gather abstain with market_unsupported.
import type {FactsMarket,PriceMarket} from './types';

const PRICE:readonly string[]=['A','HK','US'];
const FACTS:readonly string[]=['US','CN'];
export const isPriceMarket=(v:unknown):v is PriceMarket=>typeof v==='string'&&PRICE.includes(v);
export const isFactsMarket=(v:unknown):v is FactsMarket=>typeof v==='string'&&FACTS.includes(v);
export function factsMarketOf(p:PriceMarket):FactsMarket|null{return p==='A'?'CN':p==='US'?'US':null;}
export function priceMarketOf(f:FactsMarket):PriceMarket{return f==='CN'?'A':'US';}
