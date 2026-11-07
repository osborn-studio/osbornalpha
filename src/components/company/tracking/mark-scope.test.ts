// Plan step S (audit S2/S3): dual-market issuers, and a mark-read reply only touches what it submitted, in the scope that submitted it.
import {describe,expect,it} from 'vitest';
import {applyMarkResult,marketRows,shouldApply,unreadIds} from './mark-scope';

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
