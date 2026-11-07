// Plan step S (audit S2/S3): dual-market issuers, and a mark-read reply only touches what it submitted, in the scope that submitted it.
import {describe,expect,it} from 'vitest';
import {applyMarkResult,markPageFlow,marketRows,scopeKey,scopeReady,shouldApply,unreadIds} from './mark-scope';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const row=(eventId:string,market:'US'|'CN',read=false)=>({eventId,issuerId:A,market,read});

describe('mark-read scope',()=>{
 it('(1) dual-market issuer: displayed rows and submitted ids belong to the selected market only',()=>{
  const page=[row('us1','US'),row('cn1','CN'),row('us2','US',true),row('cn2','CN')];
  const cn=marketRows(page,'CN');
  expect(cn.map(r=>r.eventId)).toEqual(['cn1','cn2']);
  expect(unreadIds(cn)).toEqual(new Set(['cn1','cn2']));
  expect(unreadIds(marketRows(page,'US'))).toEqual(new Set(['us1']));
 });
 it('(2) a reply from a superseded generation is not applied (filter change / paging while pending)',()=>{
  expect(shouldApply(3,3)).toBe(true);
  expect(shouldApply(3,4)).toBe(false);
  const rows=[row('n1','US'),row('n2','US')];
  const submitted=new Set(['old-1']);
  expect(applyMarkResult(rows,submitted,{unreadOnly:false})).toEqual(rows);   // an unrelated id changes nothing
 });
 it('(3) unreadOnly removes exactly the submitted ids; otherwise they flip to read; later rows stay unread',()=>{
  const rows=[row('a','US'),row('b','US'),row('c','US')];
  const submitted=new Set(['a','b']);
  expect(applyMarkResult(rows,submitted,{unreadOnly:true}).map(r=>r.eventId)).toEqual(['c']);
  const flipped=applyMarkResult(rows,submitted,{unreadOnly:false});
  expect(flipped.map(r=>[r.eventId,r.read])).toEqual([['a',true],['b',true],['c',false]]);
 });
});

describe('scope fingerprint (failed A→B transition)',()=>{
 it('actions stay disabled until the current scope has loaded successfully',()=>{
  const a=scopeKey({issuer:null,kind:'all',unreadOnly:false}),b=scopeKey({issuer:'x',kind:'all',unreadOnly:false});
  let loaded:string|null=a;
  expect(scopeReady(loaded,a)).toBe(true);
  expect(scopeReady(loaded,b)).toBe(false);   // switched to B, B not loaded
  loaded=null;                                // B's load failed: rows cleared, nothing marked loaded
  expect(scopeReady(loaded,b)).toBe(false);
  loaded=b;expect(scopeReady(loaded,b)).toBe(true);
 });
});
describe('markPageFlow',()=>{
 const rows=[{eventId:'a',read:false},{eventId:'b',read:true},{eventId:'c',read:false}];
 it('applies to submitted ids when the generation is unchanged',async()=>{
  let gen=1;const sent:string[][]=[];
  const r=await markPageFlow({rows,unreadOnly:false,generation:()=>gen,submit:async(x)=>{sent.push(x.map(y=>y.eventId));return x.length;}});
  expect(sent).toEqual([['a','c']]);
  expect(r.kind==='applied'&&r.n).toBe(2);
  if(r.kind==='applied')expect(r.apply(rows).map(x=>x.read)).toEqual([true,true,true]);
 });
 it('a reply after a scope change / paging is stale and applies nothing',async()=>{
  let gen=1;
  const r=await markPageFlow({rows,unreadOnly:true,generation:()=>gen,submit:async(x)=>{gen=2;return x.length;}});
  expect(r.kind).toBe('stale');
 });
 it('a rejected submit propagates',async()=>{
  await expect(markPageFlow({rows,unreadOnly:false,generation:()=>1,submit:async()=>{throw new Error('boom');}})).rejects.toThrow('boom');
 });
});
