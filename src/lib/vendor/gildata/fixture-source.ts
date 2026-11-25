// Offline retrieval from the exact response_text bytes in synthetic fixtures.
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../../facts/providers/shared';
import {VendorError,type VendorSource,type VendorRequest} from '../source';
import {GILDATA_VENDOR as vendor,GILDATA_PRODUCT as product} from './client';

export function loadFixtureBody(path:string):string{
 const body=JSON.parse(readFileSync(path,'utf8')).response_text;
 if(typeof body!=='string')throw new Error('invalid_fixture_body');
 return body;
}
export function fixtureGildataSource(opts:{resolve:(request:VendorRequest)=>string|Uint8Array|undefined;now?:()=>Date}):VendorSource{
 let calls=0;
 return {vendor,product,callsMade:()=>calls,async fetch(request,budget){
  if(budget.signal.aborted)throw new VendorError('budget_aborted');
  if(budget.remainingMs()<=0)throw new VendorError('budget_exhausted');
  calls++;
  const body=opts.resolve(request);
  if(body===undefined)throw new VendorError('fixture_missing');
  const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body);
  return {vendor,product,request,bytes,sha256:sha256Hex(bytes),httpStatus:200,fetchedAt:(opts.now?.()??new Date()).toISOString(),attempt:1};
 }};
}
