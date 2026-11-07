/**
 * Verification helper (spec §4.1.4, §14-3): prints how parseHkexList reads real HKEX list files.
 *   npx tsx scripts/entity-keys/probe-hkex.ts <file.xlsx> [list_of_securities|isin_hkex|isin_other_agencies]
 * Read-only: no network, no database.
 */
import {readFileSync} from 'node:fs';
import {parseHkexList,type HkexFileId} from '../../src/lib/entities/identifiers/hkex-list';

const [file,id='list_of_securities']=process.argv.slice(2);
if(!file){console.error('usage: probe-hkex.ts <file.xlsx> [file-id]');process.exit(2);}
const p=parseHkexList(new Uint8Array(readFileSync(file)),id as HkexFileId);
const withIsin=p.rows.filter(r=>r.isin).length;
const categories:Record<string,number>={};
for(const r of p.rows)categories[r.category??'(none)']=(categories[r.category??'(none)']??0)+1;
console.log(JSON.stringify({file,sha256:p.sha256,headerRow:p.headerRow,columns:p.columns,rows:p.rows.length,withIsin,rejected:p.rejected.length,categories,first:p.rows.slice(0,3)},null,1));
