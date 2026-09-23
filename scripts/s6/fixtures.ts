/** Generated synthetic HTTP DTO/evidence only; never a provider accuracy claim. */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {bytesDigest,type MarketSnapshot} from 'dsh-trade-strategy-evaluator/engine';
export function syntheticMapping(security:MarketSnapshot['security']){
 const dto=JSON.parse(readFileSync('docs/handoffs/alpha-s4/kline-none.synthetic.json','utf8'));
 dto.ticker=security.ticker;dto.bars[0].time=Date.parse('2026-01-05T21:00:00Z')/1000;
 Object.assign(dto.meta,{market:'US',timezone:'America/New_York',currencyCode:'USD',currency:'$',coverageStart:'2026-01-05',coverageEnd:'2026-01-05',asOf:'2026-01-05',fetchedAt:'2026-01-06T00:00:00.000Z'});
 const raw=JSON.stringify(dto);
 return {raw,security,id:randomUUID(),request:{from:'2026-01-05',to:'2026-01-05',interval:'1d' as const},providerVersion:'synthetic-http/1',as_of:new Date().toISOString(),
  evidence:{raw_sha256:bytesDigest(raw),algorithm:'raw_close_times_verified_split_factor_no_cash_dividend',available_at:'2026-01-05T21:00:00.000Z',
   bars:[{session_date:'2026-01-05',source_time:dto.bars[0].time,receipt_ref:'synthetic:generated-http-proof',available_at:'2026-01-05T21:00:00.000Z',split_factor:1,verified:true}],session_status:[]}};
}
