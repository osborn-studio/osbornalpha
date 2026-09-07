import { analyzeEarnings, validateInput, fromSecCompanyFacts } from './earnings-quality-vendor/earnings-quality.mjs';
import manifest from './earnings-quality-vendor/manifest.json';

export { fromSecCompanyFacts };
/** The same canonical candidate as Model; no network, trades or research writes. */
export function reviewEarningsQuality(inputJson:string){
 if(typeof inputJson!=='string'||new TextEncoder().encode(inputJson).byteLength>131072)throw new Error('Earnings packet exceeds128KiB or is not JSON text');
 const input=validateInput(JSON.parse(inputJson));
 return {input,output:analyzeEarnings(input),sourceCommit:manifest.sourceCommit,releaseDigest:manifest.sha256,retention:'not-saved' as const};
}
