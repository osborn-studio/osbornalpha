import {expect} from 'vitest';
import {testManifest} from './db-contract';
import {canonicalJson} from './hash';

export const manifestSizes=[99_999,100_000,100_001,999_999,1_000_000,1_000_001];
export function sizedManifest(size:number){
 const body=testManifest('cycle_table');
 body.params.padding='';
 body.params.padding='x'.repeat(size-Buffer.byteLength(canonicalJson(body)));
 expect(Buffer.byteLength(canonicalJson(body))).toBe(size);
 return body;
}
