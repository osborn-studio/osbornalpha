// scripts/broker-research/eval-gold.ts
// Gold-set runner (spec §11.3, §12.4; owner action O14 / FR-5). Usage:
//   npx tsx scripts/broker-research/eval-gold.ts --manifest <private gold manifest.json> --by <admin uuid> [--dry-run]
// The manifest (never committed; lives with the owner) is {docs: GoldDoc[]} with the full typed value of every
// annotated row (value_text, value_num, value_currency, value_unit, value_date, page, span, target_key, occurrence).
// eval.ts::runGoldEval refuses the whole run before any LLM call if a document is withdrawn, not parsed, or its licence
// does not authorise processing today; --dry-run stops after those checks (no LLM call, no receipt). Prints the
// authorized licence version of every document, the receipt and whether corpus_hash equals approved_gold_corpus_hash.
import {readFileSync} from 'node:fs';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {brokerDeps} from '../../src/lib/broker-research/deps';
import {runGoldEval} from '../../src/lib/broker-research/eval';
import type {GoldDoc} from '../../src/lib/broker-research/eval';

const arg=(k:string)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:undefined;};
async function main(){
 const manifestPath=arg('--manifest'),by=arg('--by'),dryRun=process.argv.includes('--dry-run');
 if(!manifestPath||!by)throw new Error('usage: --manifest <file> --by <uuid> [--dry-run]');
 const docs=(JSON.parse(readFileSync(manifestPath,'utf8')) as {docs:GoldDoc[]}).docs;
 const deps={...brokerDeps(),codeVersion:resolveCodeVersion({allowGit:true})??'unknown'};
 const r=await runGoldEval(deps,docs,{by,dryRun,log:line=>console.log(line)});
 console.log(JSON.stringify(r,null,1));
}
main().catch(e=>{console.error(e instanceof Error?`${(e as {code?:string}).code??''} ${e.message}`:e);process.exit(1);});
