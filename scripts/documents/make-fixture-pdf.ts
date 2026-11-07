/**
 * Writes the hand-built PDF fixtures (spec §11.1) from src/lib/documents/fixtures/pdf/build.ts:
 *   npx tsx scripts/documents/make-fixture-pdf.ts
 * → src/lib/documents/fixtures/pdf/minimal-two-pages.pdf, no-text.pdf, cjk-cid.pdf. Deterministic: re-running
 * produces identical bytes (extract/pdf.test.ts asserts the committed files equal the builder).
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cjkCidPdf,minimalTwoPagePdf,noTextPdf} from '../../src/lib/documents/fixtures/pdf/build';

const dir=fileURLToPath(new URL('../../src/lib/documents/fixtures/pdf/',import.meta.url));
for(const [name,bytes] of [['minimal-two-pages.pdf',minimalTwoPagePdf()],['no-text.pdf',noTextPdf()],['cjk-cid.pdf',cjkCidPdf()]] as const){
 writeFileSync(dir+name,bytes);
 console.log(`wrote ${dir}${name} (${bytes.length} bytes)`);
}
