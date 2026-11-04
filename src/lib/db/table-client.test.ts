import {describe,it,expect} from 'vitest';
import {memoryTableClient} from './memory-table-client';
import {selectAll,TableError,MAX_PAGE} from './table-client';
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
 it('upsert never creates a duplicate declared primary key',async()=>{
  const c=memoryTableClient({t:['id']});
  await c.insert('t',{id:'a',k:'x'});
  const err=await c.upsert('t',{id:'a',k:'y'},'k').catch(e=>e);
  expect(err).toMatchObject({code:'23505'});
  await c.upsert('t',{id:'a',k:'x',n:1},'k');
  expect(c.rows('t')).toEqual([{id:'a',k:'x',n:1}]);
 });
 it('rejects a limit above MAX_PAGE',async()=>{
  const c=memoryTableClient();
  await expect(c.select('t',{},{limit:MAX_PAGE+1})).rejects.toThrow('limit_exceeds_max_page');
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
