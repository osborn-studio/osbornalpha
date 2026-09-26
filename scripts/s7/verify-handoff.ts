/** Verify the committed inventory, never import a user-supplied archive or grants. */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {parseStrict,sha256,digest} from '../../src/lib/research/ingest/pa-v1/json.js';
import {validateMarketHandoff,marketHandoffSchema} from '../../src/lib/research/s6/market-handoff';
import {validateMarketPair} from '../../src/lib/research/s6/market-pair';
import {evaluateObservation,replayObservation} from 'dsh-trade-strategy-evaluator/engine';

const root=realpathSync('.');
function bytes(path:string){
 assert.match(path,/^[A-Za-z0-9_./-]+$/);assert(!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..'));
 const file=resolve(root,path);let current=root;
 for(const part of path.split('/')){current=resolve(current,part);assert(!lstatSync(current).isSymbolicLink(),'symlink refused');}
 assert(!relative(root,realpathSync(file)).startsWith('..'+sep));
 const stat=lstatSync(file);assert(stat.isFile()&&stat.size<=2*1024*1024,'file limit');
 const raw=readFileSync(file);assert(raw.length<=2*1024*1024,'file limit');return raw;
}
try{
 const manifest=parseStrict(bytes('docs/handoffs/alpha-s7/manifest.json')) as {schema_version:string;files:{path:string;size_bytes:number;sha256:string}[]};
 assert.equal(manifest.schema_version,'alpha-shared-handoff/1.0');assert(Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=100);
 const paths=new Set<string>();let total=0;
 for(const entry of manifest.files){assert(!paths.has(entry.path),'duplicate path');paths.add(entry.path);const raw=bytes(entry.path);total+=raw.length;assert(total<=16*1024*1024);assert.equal(raw.length,entry.size_bytes,entry.path);assert.equal(sha256(raw),entry.sha256,entry.path);}
 assert.equal(root,realpathSync(fileURLToPath(new URL('../../',import.meta.url))),'run from this checkout root');
 const frozenBytes=bytes('docs/handoffs/alpha-s4/contract-hashes.json');
 assert.equal(sha256(frozenBytes),'cc3ac058e1633c70b8ac3c3006f193a5d401193f0de96a161e6fd2c1d228808e');
 const frozen=parseStrict(frozenBytes) as {files:Record<string,{file_sha256:string;jcs_sha256:string}>};
 assert(Object.keys(frozen.files).length>0);
 for(const [path,hashes] of Object.entries(frozen.files) as [string,{file_sha256:string;jcs_sha256:string}][]){const raw=bytes('docs/handoffs/alpha-s4/'+path);assert.equal(sha256(raw),hashes.file_sha256,path);assert.equal(digest(parseStrict(raw)),hashes.jcs_sha256,path);}
 assert.equal(sha256(bytes('vendor/dsh-trade-strategy-evaluator-0.2.0.tgz')),'a071a1fcfc2499a54af5a7ced2f18d57ff7cd61d8aa17f8af3def13777fc5869');
 // E3b: the installed engine is 0.3.0 (market-policy/2.0); 0.2.0 stays for replay provenance.
 assert.equal(sha256(bytes('vendor/dsh-trade-strategy-evaluator-0.3.0.tgz')),'c39241a0465da6fe4a8b41da60367b78c7ab37b7e7a69ead1f027cfe635741d4');
 const policyV2=parseStrict(bytes('docs/handoffs/alpha-s6/market-policy-v2.json')) as {schema_version:string};
 assert.equal(policyV2.schema_version,'market-policy/2.0');assert.equal(digest(policyV2),bytes('docs/handoffs/alpha-s6/market-policy-v2.json.sha256').toString('utf8').trim());
 const attestations=parseStrict(bytes('docs/handoffs/alpha-s6/identity-attestations.json')) as {schema_version:string;entries:{synthetic:boolean;attested_by:string}[]};
 assert.equal(attestations.schema_version,'alpha-identity-attestations/1.0');assert(attestations.entries.every(e=>e.synthetic===true&&e.attested_by==='synthetic-fixture'),'no real attestation is shipped in this checkout');
 // Strict parsing precedes conversion to the plain-object format required by the frozen engine.
 const input=JSON.parse(JSON.stringify(parseStrict(bytes('docs/handoffs/alpha-s6/fixtures/golden-input.json'))));
 const result=JSON.parse(JSON.stringify(parseStrict(bytes('docs/handoffs/alpha-s6/fixtures/golden-result.json'))));
 assert.deepEqual(evaluateObservation(input),result);assert.equal(replayObservation(input,result).matches,true);
 const inputV2=JSON.parse(JSON.stringify(parseStrict(bytes('docs/handoffs/alpha-s6/fixtures/golden-input-v2.json'))));
 const resultV2=JSON.parse(JSON.stringify(parseStrict(bytes('docs/handoffs/alpha-s6/fixtures/golden-result-v2.json'))));
 assert.deepEqual(evaluateObservation(inputV2),resultV2);assert.equal(replayObservation(inputV2,resultV2).matches,true);assert.equal(resultV2.result.engine_version,'osanalyst-engine/1.1.0');
 const market='docs/handoffs/alpha-s6/market-interface/';
 assert.deepEqual(parseStrict(bytes(market+'schema.json')),parseStrict(JSON.stringify(marketHandoffSchema)));
 assert.equal(validateMarketHandoff(bytes(market+'split.synthetic.json')).status,'contract_valid');
 assert.equal(validateMarketHandoff(bytes(market+'missing.synthetic.json')).status,'contract_incomplete');
 const pair=validateMarketPair(bytes(market+'split.synthetic.json'),bytes(market+'spy.synthetic.json'));
 assert.equal(pair.status,'contract_valid');assert.equal(pair.proposed_policy_status,'released');assert.equal(pair.accepted_for_evaluation,false);
 console.log(JSON.stringify({status:'passed',files:paths.size,total_bytes:total,frozen_s4:'unchanged',vendor_tarball:'0.2.0 retained; 0.3.0 installed',synthetic_replay:'matched (1.0 and 2.0)',market_policy_v2:'released',real_attestations:'none_shipped',real_market_acceptance:'not_passed',live_jev:'not_run',production_deployment:'not_run',authenticity:'requires_trusted_checkout'}));
}catch(error){console.error(error instanceof Error?error.message:'handoff_invalid');process.exitCode=1;}
