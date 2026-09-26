import {describe,expect,it} from 'vitest';
import {assignClusters,clusterIdFor,type ClusterInputSource} from './cluster';

const U='00000000-0000-4000-8000-00000000000';
const src=(n:number,over:Partial<ClusterInputSource>={}):ClusterInputSource=>({id:U+n,title:`标题${n}`,url:null,raw_text:`正文${n} `.repeat(30),available_at:`2026-09-2${n}T00:00:00Z`,cluster_id:null,cluster_first:null,...over});
const long='恒生电子股份有限公司关于股票期权限制行权期间的提示性公告。公司董事会决定，自2026年9月23日起至2026年10月20日止，为股票期权限制行权期间。期间内激励对象不得行权。本公告所述事项不构成对投资者的任何承诺，敬请注意投资风险。公司将按照相关规定及时履行信息披露义务。';

describe('assignClusters',()=>{
 it('merges by canonical url, then normalized title, then MinHash; the earliest member is cluster_first',()=>{
  const a=src(1,{url:'https://www.example.com/news/1?utm_source=x',title:'恒生电子公告A',raw_text:long});
  const b=src(2,{url:'https://example.com/news/1',title:'完全不同的标题',raw_text:'完全不同的正文'.repeat(20)});        // same canonical url → cluster of a
  const c=src(3,{url:'https://other.example/c',title:'恒生电子公告A_新浪财经',raw_text:'又一篇不同的正文'.repeat(20)}); // same normalized title → cluster of a
  const d=src(4,{url:'https://third.example/d',title:'转载：恒生电子期权行权期间',raw_text:long.replace('公司董事会决定，','')+'（来源）'}); // MinHash near-dup of a's text
  const e=src(5,{url:'https://fourth.example/e',title:'Palantir 8-K',raw_text:'Palantir Technologies filed a Form 8-K reporting results. '.repeat(10)});
  const out=assignClusters('user-1',[a,b,c,d,e],[]);
  const by=Object.fromEntries(out.map(o=>[o.id,o]));
  expect(by[a.id].cluster_id).toBe(by[b.id].cluster_id);
  expect(by[a.id].cluster_id).toBe(by[c.id].cluster_id);
  expect(by[a.id].cluster_id).toBe(by[d.id].cluster_id);
  expect(by[e.id].cluster_id).not.toBe(by[a.id].cluster_id);
  expect(by[a.id].cluster_first).toBe(true);
  for(const x of [b,c,d]) expect(by[x.id].cluster_first).toBe(false);
  expect(by[e.id].cluster_first).toBe(true);
  expect(by[a.id].cluster_id).toBe(clusterIdFor('user-1',a.id));
 });
 it('loads existing clusters without reassigning them and demotes the old first when an earlier source arrives',()=>{
  const cid=clusterIdFor('user-1',U+'9');
  const existing=[src(9,{url:'https://example.com/x',cluster_id:cid,cluster_first:true,available_at:'2026-09-25T00:00:00Z'})];
  const earlier=src(2,{url:'https://example.com/x?utm_medium=mail',available_at:'2026-09-20T00:00:00Z'});
  const out=assignClusters('user-1',[earlier],existing);
  const by=Object.fromEntries(out.map(o=>[o.id,o]));
  expect(by[earlier.id].cluster_id).toBe(cid);
  expect(by[earlier.id].cluster_first).toBe(true);
  expect(by[existing[0].id]).toMatchObject({cluster_id:cid,cluster_first:false}); // write-back for the demoted row
 });
 it('is deterministic and respects the configured Jaccard threshold',()=>{
  const a=src(1,{raw_text:long}),b=src(2,{raw_text:long.replace('公司董事会决定，','')+'（来源）'});
  const strict=assignClusters('user-1',[a,b],[],{jaccard:0.99});
  expect(strict[0].cluster_id).not.toBe(strict[1].cluster_id);
  const loose=assignClusters('user-1',[a,b],[],{jaccard:0.5});
  expect(loose[0].cluster_id).toBe(loose[1].cluster_id);
  expect(JSON.stringify(assignClusters('user-1',[a,b],[]))).toBe(JSON.stringify(assignClusters('user-1',[a,b],[])));
 });
 it('returns only rows whose cluster fields changed',()=>{
  const cid=clusterIdFor('user-1',U+'1');
  const settled=[src(1,{cluster_id:cid,cluster_first:true}),src(2,{url:'https://example.com/y',cluster_id:clusterIdFor('user-1',U+'2'),cluster_first:true})];
  expect(assignClusters('user-1',[],settled)).toEqual([]);
 });
});
