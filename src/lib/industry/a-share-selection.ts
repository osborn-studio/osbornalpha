// Shared CLI/loader validation. Undefined alone means the existing full-universe run.
export const MAX_EXPLICIT_A_SHARE_TICKERS=10;
export function validateAShareTickers(tickers:readonly string[]|undefined):void{
 if(tickers===undefined)return;
 if(!Array.isArray(tickers)||tickers.length<1||tickers.length>MAX_EXPLICIT_A_SHARE_TICKERS)
  throw new Error(`explicit_tickers: select 1..${MAX_EXPLICIT_A_SHARE_TICKERS} distinct tickers`);
 if([...tickers].some(t=>typeof t!=='string'||t.length!==9||!/^\d{6}\.(SH|SZ|BJ)$/.test(t)))
  throw new Error('explicit_tickers: --ticker requires exact canonical CN syntax, e.g. 600519.SH (no aliases or normalization)');
 if(new Set(tickers).size!==tickers.length)throw new Error('explicit_tickers: duplicate --ticker');
}
