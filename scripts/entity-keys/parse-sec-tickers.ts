/**
 * WP-A2: print CIKs for tickers from a downloaded SEC company_tickers.json.
 *   npx tsx scripts/entity-keys/parse-sec-tickers.ts <company_tickers.json> <TICKER…>
 * Download separately (with a User-Agent) from https://www.sec.gov/files/company_tickers.json
 */
import { readFileSync } from 'node:fs';
import { parseSecCompanyTickers } from '../../src/lib/research/entity-keys/parsers';

const [file, ...tickers] = process.argv.slice(2);
if (!file || tickers.length === 0) { console.error('usage: parse-sec-tickers.ts <company_tickers.json> <TICKER…>'); process.exit(2); }
const { found, missing } = parseSecCompanyTickers(readFileSync(file, 'utf8'), tickers);
console.log('ticker,cik,title');
for (const [t, hit] of Object.entries(found)) console.log(`${t},${hit.cik},${JSON.stringify(hit.title)}`);
if (missing.length) { console.error(`missing: ${missing.join(' ')}`); process.exit(1); }
