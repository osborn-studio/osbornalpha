/** Re-issue docs/handoffs/alpha-s7/manifest.json from the committed inventory (E3b adds the 2.0 policy files). */
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {sha256} from '../../src/lib/research/ingest/pa-v1/json.js';
const current=JSON.parse(readFileSync('docs/handoffs/alpha-s7/manifest.json','utf8')) as {schema_version:string;files:{path:string}[]};
const additions=['docs/handoffs/alpha-s6/market-policy-v2.json','docs/handoffs/alpha-s6/market-policy-v2.json.sha256','docs/handoffs/alpha-s6/alpha-observation-contract-v2.schema.json','docs/handoffs/alpha-s6/identity-attestations.json',
 'docs/handoffs/alpha-s6/fixtures/golden-input-v2.json','docs/handoffs/alpha-s6/fixtures/golden-result-v2.json','docs/handoffs/alpha-e3b/README.md','scripts/s6/freeze-market-handoff.ts','scripts/s6/verify-engine.ts','scripts/s7/build-manifest.ts','src/lib/research/s6/market.ts','src/lib/research/market-policy.ts','vendor/dsh-trade-strategy-evaluator-0.3.0.tgz'];
const paths=[...new Set([...current.files.map(f=>f.path),...additions])].sort();
const files=paths.map(path=>{const stat=lstatSync(path);if(!stat.isFile())throw new Error('not a file: '+path);const raw=readFileSync(path);return {path,size_bytes:raw.length,sha256:sha256(raw)};});
if(files.length>100)throw new Error('manifest limit');
writeFileSync('docs/handoffs/alpha-s7/manifest.json',JSON.stringify({schema_version:current.schema_version,files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,total_bytes:files.reduce((n,f)=>n+f.size_bytes,0)}));
