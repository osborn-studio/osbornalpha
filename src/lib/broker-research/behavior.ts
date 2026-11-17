// src/lib/broker-research/behavior.ts
// Extraction behavior identity for evaluation receipts (spec §4.3, §4.10). Hashing only these
// ordered values keeps unrelated deployment code changes from invalidating gold receipts.
import {createHash} from 'node:crypto';
import {CURRENCY_MARKS_VERSION,LOCATE_VERSION,MERGE_VERSION,TICKER_VERSION,TYPED_VERSION} from './versions';
export const BEHAVIOR_DIGEST_INPUTS=['extractor_version','model_id','registry_hash','prompt_version','schema_version','typed_version','merge_version','locate_version','ticker_version','currency_marks_version'] as const;
export interface BehaviorInputs{extractorVersion:string;modelId:string;registryHash:string;promptVersion:string;schemaVersion:string}
export function behaviorDigestValues(i:BehaviorInputs):string[]{const run=[i.extractorVersion,i.modelId,i.registryHash,i.promptVersion,i.schemaVersion];run.forEach((v,k)=>{if(typeof v!=='string'||v.trim()==='')throw new Error(`behavior_input_missing:${BEHAVIOR_DIGEST_INPUTS[k]}`);});return [...run,TYPED_VERSION,MERGE_VERSION,LOCATE_VERSION,TICKER_VERSION,CURRENCY_MARKS_VERSION];}
export function behaviorDigest(i:BehaviorInputs):string{return createHash('sha256').update(JSON.stringify(behaviorDigestValues(i)),'utf8').digest('hex');}
