// src/lib/judgments/resolvers/price-capabilities.ts
// Frozen adjustment-capability table (spec §7.4, audit G04): (source, market, adjustment) → status.
// Only 'verified' rows may be used to register (inputs.ts: market_unsupported) or settle (price
// resolver: Unavailable(adjustment_unsupported) → void) price judgments. Every row starts
// 'unverified': an adapter echoing the requested adjustment is not evidence (datagateway.ts back-fills
// the requested value; eastmoney.ts echoes fqt; the DataGateway request body carries no adjustment at
// all). A row changes only by a reviewed edit after scripts/judgments/verify-adjustment.ts recorded
// qfq / hfq / none series around an announced corporate action (evidence = that fixture's path,
// verified_at = its recording date); price-capabilities.test.ts keeps table and fixtures consistent.
// This file is in every price method's import closure (formula_hash), so a status change forces a new
// method version (spec §4.1).
import type {KlineSourceName} from '@/lib/data/kline/types';
import type {Adjustment,PriceMarket} from '../types';

export type CapabilityStatus='verified'|'unverified'|'unsupported';
export interface PriceCapability{source:KlineSourceName;market:PriceMarket;adjustment:Adjustment;status:CapabilityStatus;evidence:string|null;verified_at:string|null}
const cap=(source:KlineSourceName,market:PriceMarket,adjustment:Adjustment,status:CapabilityStatus='unverified',evidence:string|null=null,verified_at:string|null=null):Readonly<PriceCapability>=>Object.freeze({source,market,adjustment,status,evidence,verified_at});
export const PRICE_CAPABILITIES:readonly Readonly<PriceCapability>[]=Object.freeze([
 cap('eastmoney','A','qfq','verified','fixtures/judgments/kline/eastmoney-A-600519_SH-2024-06-19.json','2026-11-07'),
 cap('eastmoney','A','hfq'),
 cap('eastmoney','HK','qfq','verified','fixtures/judgments/kline/eastmoney-HK-00700_HK-2024-05-17.json','2026-11-07'),
 cap('eastmoney','HK','hfq'),
 cap('eastmoney','US','qfq'),
 cap('eastmoney','US','hfq','verified','fixtures/judgments/kline/eastmoney-US-NVDA-2024-06-10.json','2026-11-07'),
 cap('datagateway','A','qfq'),
 cap('datagateway','A','hfq'),
 cap('datagateway','HK','qfq'),
 cap('datagateway','HK','hfq'),
 cap('datagateway','US','qfq'),
 cap('datagateway','US','hfq'),
]);
export function capabilityOf(source:KlineSourceName,market:PriceMarket,adjustment:Adjustment):Readonly<PriceCapability>{
 return PRICE_CAPABILITIES.find(c=>c.source===source&&c.market===market&&c.adjustment===adjustment)??Object.freeze({source,market,adjustment,status:'unsupported' as const,evidence:null,verified_at:null});
}
export const isVerified=(source:KlineSourceName,market:PriceMarket,adjustment:Adjustment)=>capabilityOf(source,market,adjustment).status==='verified';
export function verifiedMarkets(source:KlineSourceName,adjustment:Adjustment,markets:readonly PriceMarket[]):PriceMarket[]{return markets.filter(m=>isVerified(source,m,adjustment));}
