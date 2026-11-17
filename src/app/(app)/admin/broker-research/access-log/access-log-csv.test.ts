// src/app/(app)/admin/broker-research/access-log/access-log-csv.test.ts
import {describe,expect,it} from 'vitest';
import {toCsv} from './access-log-csv';
describe('access log CSV',()=>{
 it('quotes fields and neutralises formula injection',()=>{
  const csv=toCsv([{id:'1',created_at:'2026-11-01T00:00:00Z',user_id:'u',action:'text_viewed',document_id:null,detail:{page:2,note:'=cmd "x"'}}]);
  expect(csv.split('\n')[0]).toBe('id,created_at,user_id,action,document_id,detail');
  expect(csv.split('\n')[1]).toBe('"1","2026-11-01T00:00:00Z","u","text_viewed","","{""page"":2,""note"":""=cmd \\""x\\""""}"');
  expect(toCsv([{id:'=1',created_at:'',user_id:'+u',action:'upload',document_id:'-d',detail:{}}]).split('\n')[1]).toBe(`"'=1","","'+u","upload","'-d","{}"`);
 });
});
