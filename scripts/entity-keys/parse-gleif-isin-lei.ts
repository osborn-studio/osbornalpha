/**
 * WP-A2: stream a GLEIF ISIN↔LEI mapping CSV and print the ISINs for given LEIs.
 *   npx tsx scripts/entity-keys/parse-gleif-isin-lei.ts <lei-isin.csv> <LEI…>
 * Download separately from https://mapping.gleif.org/api/v2/isin-lei/latest/download (zip).
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { selectIsinsForLeis } from '../../src/lib/research/entity-keys/parsers';

async function main() {
  const [file, ...leis] = process.argv.slice(2);
  if (!file || leis.length === 0) { console.error('usage: parse-gleif-isin-lei.ts <lei-isin.csv> <LEI…>'); process.exit(2); }
  const lines: string[] = [];
  const wanted = new Set(leis);
  // Keep only the header and matching lines so memory stays flat on the ~300 MB file.
  let first = true;
  for await (const line of createInterface({ input: createReadStream(file) })) {
    if (first) { lines.push(line); first = false; continue; }
    if (wanted.has(line.slice(0, line.indexOf(',')))) lines.push(line);
  }
  const { found, missing } = selectIsinsForLeis(lines, wanted);
  console.log('lei,isin');
  for (const [lei, isins] of Object.entries(found)) for (const isin of isins) console.log(`${lei},${isin}`);
  if (missing.length) { console.error(`no mapping: ${missing.join(' ')}`); process.exit(1); }
}
void main();
