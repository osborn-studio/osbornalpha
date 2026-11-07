import {describe,it,expect} from 'vitest';
import {memoryTableClient} from './memory-table-client';
import {callRpc,selectAll,supabaseTableClient,TableError,MAX_PAGE} from './table-client';
import type {Row,TableClient} from './table-client';

describe('memory table client',()=>{
 it('inserts, selects by equality, orders, limits, updates and upserts',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a',n:2,k:'x'});
  await c.insert('t',{id:'b',n:1,k:'x'});
  await c.insert('t',{id:'c',n:3,k:'y'});
  expect((await c.select('t',{k:'x'})).map(r=>r.id)).toEqual(['a','b']);
  expect((await c.select('t',{},{orderBy:'n',desc:true,limit:2})).map(r=>r.id)).toEqual(['c','a']);
  expect(await c.update('t',{id:'a'},{n:10})).toBe(1);
  expect(await c.update('t',{k:'x'},{m:1})).toBe(2);
  expect(await c.update('t',{id:'zz'},{n:0})).toBe(0);
  expect((await c.select('t',{id:'a'}))[0].n).toBe(10);
  await c.upsert('t',{id:'a',n:11,k:'x'},'id');
  await c.upsert('t',{id:'d',n:0,k:'z'},'id');
  expect((await c.select('t',{id:'a'}))[0].n).toBe(11);
  expect((await c.select('t',{})).length).toBe(4);
 });
 it('rejects a duplicate primary key on insert when a key is declared',async()=>{
  const c=memoryTableClient({t:['id']});
  await c.insert('t',{id:'a'});
  await expect(c.insert('t',{id:'a'})).rejects.toThrow('duplicate key');
  const err=await c.insert('t',{id:'a'}).catch(e=>e);
  expect(err).toBeInstanceOf(TableError);
  expect(err).toMatchObject({code:'23505',table:'t',op:'insert'});
 });
 // The Supabase adapter maps a null match value to `.is(k,null)` (`.eq(k,null)` never matches).
 it('matches null values in select, count and update',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a',valid_to:null});
  await c.insert('t',{id:'b',valid_to:'2026-01-01'});
  expect((await c.select('t',{valid_to:null})).map(r=>r.id)).toEqual(['a']);
  expect(await c.count('t',{valid_to:null})).toBe(1);
  expect(await c.update('t',{valid_to:null},{n:1})).toBe(1);
 });
 it('does not share nested references with callers',async()=>{
  const c=memoryTableClient();
  const row={id:'a',j:{x:1}};
  const ret=await c.insert('t',row);
  row.j.x=2;(ret.j as {x:number}).x=3;
  const patch={j:{x:4}};await c.update('t',{id:'a'},patch);patch.j.x=5;
  const [sel]=await c.select('t',{id:'a'});(sel.j as {x:number}).x=6;
  (c.rows('t')[0].j as {x:number}).x=7;
  expect((await c.select('t',{id:'a'}))[0].j).toEqual({x:4});
 });
 it('orders nulls last ascending and first descending',async()=>{
  const c=memoryTableClient();
  for(const [id,n] of [['a',2],['b',null],['c',1]] as const)await c.insert('t',{id,n});
  expect((await c.select('t',{},{orderBy:'n'})).map(r=>r.id)).toEqual(['c','a','b']);
  expect((await c.select('t',{},{orderBy:'n',desc:true})).map(r=>r.id)).toEqual(['b','a','c']);
 });
 it('upsert rejects an onConflict that is not the declared key set (42P10) and merges on the key',async()=>{
  const c=memoryTableClient({t:['id']});
  await c.insert('t',{id:'a',k:'x'});
  const err=await c.upsert('t',{id:'a',k:'y'},'k').catch(e=>e);
  expect(err).toBeInstanceOf(TableError);
  expect(err).toMatchObject({code:'42P10',op:'upsert'});
  await expect(c.upsert('t',{id:'a',k:'y'},'id,k')).rejects.toMatchObject({code:'42P10'});
  await c.upsert('t',{id:'a',k:'x',n:1},'id');
  expect(c.rows('t')).toEqual([{id:'a',k:'x',n:1}]);
  const multi=memoryTableClient({t:['a','b']});
  await multi.upsert('t',{a:1,b:2,n:1},' b , a ');
  await multi.upsert('t',{a:1,b:2,n:2},'a,b');
  expect(multi.rows('t')).toEqual([{a:1,b:2,n:2}]);
 });
 it('update that moves a declared key onto another row throws 23505 and changes nothing',async()=>{
  const c=memoryTableClient({t:['id']});
  await c.insert('t',{id:'a',k:'x'});
  await c.insert('t',{id:'b',k:'y'});
  const err=await c.update('t',{id:'b'},{id:'a',k:'z'}).catch(e=>e);
  expect(err).toBeInstanceOf(TableError);
  expect(err).toMatchObject({code:'23505',op:'update'});
  // Two matched rows collapsing onto one key is also a clash; neither row may change.
  await expect(c.update('t',{},{id:'q'})).rejects.toThrow('empty_update_match');
  await c.insert('t',{id:'c',k:'y'});
  await expect(c.update('t',{k:'y'},{id:'q',n:1})).rejects.toMatchObject({code:'23505'});
  expect(c.rows('t')).toEqual([{id:'a',k:'x'},{id:'b',k:'y'},{id:'c',k:'y'}]);
  expect(await c.update('t',{id:'b'},{id:'b2'})).toBe(1);
 });
 it('rejects undefined match values and an empty update match',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a'});
  await expect(c.select('t',{id:undefined})).rejects.toThrow('undefined_match_value');
  await expect(c.count('t',{id:undefined})).rejects.toThrow('undefined_match_value');
  await expect(c.update('t',{id:undefined},{n:1})).rejects.toThrow('undefined_match_value');
  await expect(c.update('t',{},{n:1})).rejects.toThrow('empty_update_match');
  expect(c.rows('t')).toEqual([{id:'a'}]);
 });
 it('rejects limit/offset that are not safe integers in range',async()=>{
  const c=memoryTableClient();
  for(const limit of [0,-1,1.5,NaN,Infinity,MAX_PAGE+1])
   await expect(c.select('t',{},{orderBy:'id',limit})).rejects.toThrow('invalid_select_options');
  for(const offset of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
   await expect(c.select('t',{},{orderBy:'id',offset})).rejects.toThrow('invalid_select_options');
  await expect(c.select('t',{},{orderBy:'id',offset:0,limit:MAX_PAGE})).resolves.toEqual([]);
  await expect(c.select('t',{},{gte:{n:NaN}})).rejects.toThrow('invalid_select_options');
  await expect(c.count('t',{},{lt:{n:undefined as never}})).rejects.toThrow('invalid_select_options');
 });
 it('select applies gte (inclusive) on an ISO timestamp column and excludes nulls',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a',at:'2026-11-01T00:00:00.000Z'});
  await c.insert('t',{id:'b',at:'2026-11-03T00:00:00.000Z'});
  await c.insert('t',{id:'c',at:'2026-11-05T00:00:00.000Z'});
  await c.insert('t',{id:'d',at:null});
  const got=await c.select('t',{},{gte:{at:'2026-11-03T00:00:00.000Z'},orderBy:'at'});
  expect(got.map(r=>r.id)).toEqual(['b','c']);
  const both=await c.select('t',{},{gte:{at:'2026-11-02T00:00:00.000Z'},lt:{at:'2026-11-05T00:00:00.000Z'}});
  expect(both.map(r=>r.id)).toEqual(['b']);
 });
 it('count applies lt (exclusive) with numbers compared numerically',async()=>{
  const c=memoryTableClient();
  for(const [id,n] of [['a',2],['b',10],['c',9],['d',null]] as const)await c.insert('t',{id,n,k:'x'});
  expect(await c.count('t',{k:'x'},{lt:{n:10}})).toBe(2); // 10 > 9 numerically, not as text
  expect(await c.count('t',{},{gte:{n:9},lt:{n:11}})).toBe(2);
  expect(await c.count('t',{})).toBe(4);
 });
 it('applies offset before limit when ordered',async()=>{
  const c=memoryTableClient();
  for(const n of [5,1,4,2,3])await c.insert('t',{id:`r${n}`,n});
  expect((await c.select('t',{},{orderBy:'n',offset:1,limit:2})).map(r=>r.n)).toEqual([2,3]);
  expect((await c.select('t',{},{orderBy:'n',offset:3})).map(r=>r.n)).toEqual([4,5]);
 });
 it('rejects offset without orderBy',async()=>{
  const c=memoryTableClient();
  await expect(c.select('t',{},{offset:1,limit:1})).rejects.toThrow('offset_requires_orderBy');
 });
 it('counts rows with and without a match',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a',k:'x'});
  await c.insert('t',{id:'b',k:'x'});
  await c.insert('t',{id:'c',k:'y'});
  expect(await c.count('t',{})).toBe(3);
  expect(await c.count('t',{k:'x'})).toBe(2);
  expect(await c.count('empty',{})).toBe(0);
 });
 it('selectAll pages past one page and returns every row in order',async()=>{
  const c=memoryTableClient();
  for(let i=2499;i>=0;i--)await c.insert('t',{id:i,k:'x'});
  await c.insert('t',{id:9999,k:'other'});
  const all=await selectAll(c,'t',{k:'x'},'id',1000);
  expect(all.length).toBe(2500);
  expect(all.map(r=>r.id)).toEqual(Array.from({length:2500},(_,i)=>i));
 });
 it('selectAll on an exact multiple of pageSize stops on the extra empty page',async()=>{
  const c=memoryTableClient();
  for(let i=0;i<4;i++)await c.insert('t',{id:i});
  const calls:number[]=[];const base:TableClient=c;
  const spy:TableClient={...c,select:async(t:string,m:Row,o)=>{calls.push(o?.offset??-1);return base.select(t,m,o);}};
  expect((await selectAll(spy,'t',{},'id',2)).map(r=>r.id)).toEqual([0,1,2,3]);
  expect(calls).toEqual([0,2,4]);
 });
 it('selectAll keeps paging when the server returns short pages (max_rows below pageSize)',async()=>{
  const c=memoryTableClient();
  for(let i=0;i<5;i++)await c.insert('t',{id:i});
  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??2,2)})};
  expect((await selectAll(capped,'t',{},'id',4)).map(r=>r.id)).toEqual([0,1,2,3,4]);
 });
 it('selectAll rejects a pageSize outside 1..1000',async()=>{
  const c=memoryTableClient();
  await expect(selectAll(c,'t',{},'id',0)).rejects.toThrow();
  await expect(selectAll(c,'t',{},'id',1001)).rejects.toThrow();
 });
});

// Records the PostgREST builder chain so the adapter's request shape can be asserted without a server.
function fakeSupabase(result:Record<string,unknown>){
 const calls:unknown[][]=[];
 const builder:any=new Proxy({},{get(_t,p){
  if(p==='then')return (res:(v:unknown)=>void)=>res(result);
  return (...args:unknown[])=>{calls.push([p,...args]);return builder;};
 }});
 return {client:{from:(t:string)=>{calls.push(['from',t]);return builder;}} as never,calls};
}

describe('supabase table client',()=>{
 it('update requests an exact count without returning rows and fails closed on a null count',async()=>{
  const ok=fakeSupabase({count:3,error:null});
  expect(await supabaseTableClient(ok.client).update('t',{k:'x',v:null},{n:1})).toBe(3);
  expect(ok.calls).toEqual([['from','t'],['update',{n:1},{count:'exact'}],['eq','k','x'],['is','v',null]]);
  const missing=fakeSupabase({count:null,error:null});
  await expect(supabaseTableClient(missing.client).update('t',{k:'x'},{n:1})).rejects.toThrow('update_count_unavailable');
  await expect(supabaseTableClient(missing.client).update('t',{},{n:1})).rejects.toThrow('empty_update_match');
 });
 it('count chains gte/lt and throws count_unavailable on a null count',async()=>{
  const ok=fakeSupabase({count:0,error:null});
  expect(await supabaseTableClient(ok.client).count('t',{k:'x'},{gte:{at:'2026-11-01'},lt:{n:5}})).toBe(0);
  expect(ok.calls).toEqual([['from','t'],['select','*',{count:'exact',head:true}],['eq','k','x'],['gte','at','2026-11-01'],['lt','n',5]]);
  const missing=fakeSupabase({count:null,error:null});
  await expect(supabaseTableClient(missing.client).count('t',{})).rejects.toThrow('count_unavailable');
 });
 it('select chains range filters before order and range',async()=>{
  const ok=fakeSupabase({data:[],error:null});
  await supabaseTableClient(ok.client).select('t',{},{gte:{at:'2026-11-01'},orderBy:'at',desc:true,limit:10});
  expect(ok.calls).toEqual([['from','t'],['select','*'],['gte','at','2026-11-01'],['order','at',{ascending:false}],['range',0,9]]);
 });
 it('TableError keeps code, details, hint and the PostgREST error as cause',async()=>{
  const pgErr={message:'duplicate key',code:'23505',details:'Key (id)=(a) already exists.',hint:'retry'};
  const f=fakeSupabase({data:null,error:pgErr});
  const err=await supabaseTableClient(f.client).insert('t',{id:'a'}).catch(e=>e);
  expect(err).toBeInstanceOf(TableError);
  expect(err).toMatchObject({code:'23505',details:'Key (id)=(a) already exists.',hint:'retry',table:'t',op:'insert'});
  expect(err.cause).toBe(pgErr);
 });
});

describe('rpc (plan 3 row-locking functions; plan audit P3/P4/R2)',()=>{
 const EV={source:'gleif',as_of:'2026-11-05',evidence_sha256:'b'.repeat(64)};
 const later=(c:string)=>({...EV,evidence_sha256:c.repeat(64)});
 it('memoryTableClient emulates append_claim_evidence: dedupe, append to detail.sources only, not_found once resolved',async()=>{
  const c=memoryTableClient({issuer_identifier_claims:['id']});
  await c.insert('issuer_identifier_claims',{id:'c1',issuer_id:'i',id_type:'lei',value:'v',op:'set_identifier',target_key:'set_identifier:i',status:'pending',detail:{evidence:EV,sources:[],params:{x:1}}});
  const args=(e:unknown)=>({p_issuer:'i',p_id_type:'lei',p_value:'v',p_op:'set_identifier',p_target_key:'set_identifier:i',p_evidence:e});
  expect(await callRpc(c,'append_claim_evidence',args(EV))).toBe('duplicate');
  expect(await Promise.all([callRpc(c,'append_claim_evidence',args(later('c'))),callRpc(c,'append_claim_evidence',args(later('d')))])).toEqual(['appended','appended']);
  expect(await callRpc(c,'append_claim_evidence',args(later('c')))).toBe('duplicate');
  expect(c.rows('issuer_identifier_claims')[0].detail).toEqual({evidence:EV,params:{x:1},sources:[later('c'),later('d')]});
  await expect(callRpc(c,'append_claim_evidence',args({source:'x',as_of:'2026-11-05',evidence_sha256:'nope'}))).rejects.toMatchObject({code:'22023'});
  await c.update('issuer_identifier_claims',{id:'c1'},{status:'rejected'});
  expect(await callRpc(c,'append_claim_evidence',args(later('e')))).toBe('not_found');
 });
 it('memoryTableClient emulates patch_quarantine_detail: only hook / audit_written, every other key untouched',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('dq_quarantine',{id:'q1',status:'resolved_accept',detail:{latest_result:{passed:true},hook:{state:'pending'}}});
  expect(await callRpc(c,'patch_quarantine_detail',{p_id:'q1',p_key:'hook',p_value:{stage:'done',state:'done',at:'t'}})).toBe(true);
  expect(await callRpc(c,'patch_quarantine_detail',{p_id:'q1',p_key:'audit_written',p_value:true})).toBe(true);
  expect(c.rows('dq_quarantine')[0].detail).toEqual({latest_result:{passed:true},hook:{stage:'done',state:'done',at:'t'},audit_written:true});
  await expect(callRpc(c,'patch_quarantine_detail',{p_id:'q1',p_key:'latest_result',p_value:{}})).rejects.toMatchObject({code:'22023'});
  expect(await callRpc(c,'patch_quarantine_detail',{p_id:'nope',p_key:'hook',p_value:{}})).toBe(false);
 });
 it('memoryTableClient emulates set_security_identifier: guarded write, one provenance key merged, concurrent ISIN/FIGI both kept (plan audit R2)',async()=>{
  const c=memoryTableClient();
  await c.insert('issuer_securities',{issuer_id:'i',ticker:'AAPL',valid_from:'2020-01-01',valid_to:null,isin:null,figi:null,provenance:{exchange:'Nasdaq'}});
  const args=(col:string,v:string,pv:unknown)=>({p_issuer:'i',p_ticker:'AAPL',p_valid_from:'2020-01-01',p_column:col,p_value:v,p_provenance:pv});
  const PI={isin:{source:'g'}},PF={figi:{source:'o'}};
  expect(await Promise.all([callRpc(c,'set_security_identifier',args('isin','US0378331005',PI)),callRpc(c,'set_security_identifier',args('figi','BBG000B9XRY4',PF))])).toEqual(['written','written']);
  expect(c.rows('issuer_securities')[0]).toMatchObject({isin:'US0378331005',figi:'BBG000B9XRY4',provenance:{exchange:'Nasdaq',...PI,...PF}});
  expect(await callRpc(c,'set_security_identifier',args('isin','US0378331005',PI))).toBe('duplicate');
  expect(await callRpc(c,'set_security_identifier',args('isin','US0000000000',PI))).toBe('conflict');
  expect(await callRpc(c,'set_security_identifier',{...args('isin','X',PI),p_ticker:'NOPE'})).toBe('not_found');
  await expect(callRpc(c,'set_security_identifier',args('isin','X',PF))).rejects.toMatchObject({code:'22023'});
 });
 it('memoryTableClient emulates set_security_window: from/to written, duplicate, conflict (state, earliest row), not_found, invalid_window_write',async()=>{
  const c=memoryTableClient();
  await c.insert('issuers',{issuer_id:'i'});
  await c.insert('issuer_securities',{issuer_id:'i',ticker:'X',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{exchange:'SSE'}});
  const args=(side:string,from:string,date:string,pv:unknown)=>({p_issuer:'i',p_ticker:'X',p_valid_from:from,p_side:side,p_new_date:date,p_provenance:pv});
  const WF={valid_from:{source:'u'}},WT={valid_to:{source:'u'}};
  expect(await callRpc(c,'set_security_window',args('from','2024-03-01','2025-01-01',WF))).toBe('conflict');
  expect(await callRpc(c,'set_security_window',args('from','2024-03-01','2001-08-27',WF))).toBe('written');
  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','2001-08-27',WF))).toBe('duplicate');
  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','2000-01-01',WF))).toBe('conflict');
  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2001-08-27',WT))).toBe('conflict');
  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-06-30',WT))).toBe('written');
  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-06-30',WT))).toBe('duplicate');
  expect(await callRpc(c,'set_security_window',args('to','2001-08-27','2026-07-01',WT))).toBe('conflict');
  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
  expect(await callRpc(c,'set_security_window',args('from','1999-01-01','1990-01-01',WF))).toBe('not_found');
  expect(await callRpc(c,'set_security_window',{...args('from','2001-08-27','1990-01-01',WF),p_issuer:'ghost'})).toBe('not_found');
  await c.insert('issuer_securities',{issuer_id:'j',ticker:'X',valid_from:'1995-01-01',valid_to:'1996-01-01',valid_from_method:'first_observed',valid_to_method:'unrecorded',provenance:{}});
  await c.update('issuer_securities',{issuer_id:'i',ticker:'X'},{valid_from_method:'first_observed'});
  expect(await callRpc(c,'set_security_window',args('from','2001-08-27','1998-01-01',WF))).toBe('conflict');   // an earlier holding exists
  for(const bad of [args('from','2001-08-27','1998-01-01',WT),args('x','2001-08-27','1998-01-01',WF),args('from','2001-08-27','1998-01-01',{...WF,...WT})])
   await expect(callRpc(c,'set_security_window',bad)).rejects.toThrow(/invalid_window_write/);
 });
 it('callRpc refuses a client without rpc; an unknown function fails like PostgreSQL (42883)',async()=>{
  const c=memoryTableClient();
  const {rpc:_rpc,...noRpc}=c;
  await expect(callRpc(noRpc,'append_claim_evidence',{})).rejects.toThrow('rpc_unavailable:append_claim_evidence');
  await expect(callRpc(c,'nope',{})).rejects.toMatchObject({code:'42883'});
 });
});
