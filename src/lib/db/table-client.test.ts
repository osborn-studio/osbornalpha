import {describe,it,expect} from 'vitest';
import {memoryTableClient} from './memory-table-client';

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
});
