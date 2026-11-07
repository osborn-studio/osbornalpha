// Digest inputs must match the extraction evaluation contract (spec §4.3).
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {BEHAVIOR_DIGEST_INPUTS,behaviorDigest,behaviorDigestValues} from './behavior';
import * as V from './versions';
const base={extractorVersion:'f3/1',modelId:'model-a',registryHash:'r'.repeat(64),promptVersion:V.EXTRACT_PROMPT_VERSION,schemaVersion:V.SCHEMA_VERSION};
describe('behavior digest (spec §4.3)',()=>{
 it('lists exactly the spec §4.3 inputs in order',()=>{expect(BEHAVIOR_DIGEST_INPUTS).toEqual(['extractor_version','model_id','registry_hash','prompt_version','schema_version','typed_version','merge_version','locate_version','ticker_version','currency_marks_version']);expect(behaviorDigestValues(base)).toEqual(['f3/1','model-a','r'.repeat(64),'broker-extract/1','extract-schema/1','typed/1','merge/1','locate/1','parseBrokerTicker/1','currency-marks/1']);});
 it('is sha256 of the JSON string array and deterministic',()=>{const want=createHash('sha256').update(JSON.stringify(behaviorDigestValues(base)),'utf8').digest('hex');expect(behaviorDigest(base)).toBe(want);expect(behaviorDigest({...base})).toBe(want);expect(want).toMatch(/^[0-9a-f]{64}$/);});
 it('changes when any run input changes',()=>{const d=behaviorDigest(base);for(const k of Object.keys(base) as (keyof typeof base)[])expect(behaviorDigest({...base,[k]:`${base[k]}x`})).not.toBe(d);});
 it('rejects missing inputs',()=>{expect(()=>behaviorDigest({...base,modelId:''})).toThrow('behavior_input_missing:model_id');expect(()=>behaviorDigest({...base,registryHash:' '})).toThrow('behavior_input_missing:registry_hash');});
 it('pins the version constants the digest and SQL depend on',()=>{expect(V).toMatchObject({TYPED_VERSION:'typed/1',MERGE_VERSION:'merge/1',LOCATE_VERSION:'locate/1',TICKER_VERSION:'parseBrokerTicker/1',CURRENCY_MARKS_VERSION:'currency-marks/1',RULES_VERSION:'broker-rules/1',DISCLOSURE_VERSION:'disclosure/1',GROUNDING_VERSION:'grounding/1',OVERLAP_VERSION:'overlap/1',SCHEMA_VERSION:'extract-schema/1',EXTRACT_PROMPT_VERSION:'broker-extract/1',SUMMARY_PROMPT_VERSION:'independent-summary/1',UPSIDE_FORMULA_VERSION:'upside/1',CLAIM_METHODOLOGY_VERSION:'broker-claim/1'});});
});
