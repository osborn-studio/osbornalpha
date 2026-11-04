import {describe,it,expect} from 'vitest';
import {memoryTableClient} from './memory-table-client';
import {selectAll} from './table-client';

describe('memory table client',()=>{
 it('inserts, selects by equality, orders, limits, updates and upserts',async()=>{
  const c=memoryTableClient();
  await c.insert('t',{id:'a',n:2,k:'x'});
  await c.insert('t',{id:'b',n:1,k:'x'});
  await c.insert('t',{id:'c',n:3,k:'y'});
  expect((await c.select('t',{k:'x'})).map(r=>r.id)).toEqual(['a','b']);
  expect((await c.select('t',{},{orderBy:'n',desc:true,limit:2})).map(r=>r.id)).toEqual(['c','a']);
  await c.update('t',{id:'a'},{n:10});
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
 it('selectAll rejects a pageSize outside 1..1000',async()=>{
  const c=memoryTableClient();
  await expect(selectAll(c,'t',{},'id',0)).rejects.toThrow();
  await expect(selectAll(c,'t',{},'id',1001)).rejects.toThrow();
 });
});
