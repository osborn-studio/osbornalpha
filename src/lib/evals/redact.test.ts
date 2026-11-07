// src/lib/evals/redact.test.ts
import {describe,expect,it} from 'vitest';
import {redactScan,redactTargets} from './redact';

const scan=(text:string,path='docs/evals/x.md')=>redactScan([{path,text}]).map(f=>f.rule);

describe('redactScan: each rule, positive and negative',()=>{
 const cases:[string,string,string|null][]=[
  ['query token=','see https://x.test/a?token=abc','query_token'],
  ['query &key=','https://x.test/a?b=1&key=abc','query_token'],
  ['query sig=','https://x.test/a?sig=abc','query_token'],
  ['prose "key=" without ? or &','the lookup key=value form','' ],
  ['query &api_key=','https://x.test/a?b=1&api_key=abc','query_token'],
  ['query ?access_token=','https://x.test/a?access_token=abc','query_token'],
  ['query ?apikey=','https://x.test/a?apikey=abc','query_token'],
  ['X-Amz-Signature','...&X-Amz-Signature=deadbeef','query_token'],
  ['postgres URL','postgres://u:p@h/db','postgres_url'],
  ['postgresql URL','postgresql://h/db','postgres_url'],
  ['postgres prose','PostgreSQL 17 and pg_dump','' ],
  ['JWT','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl','jwt'],
  ['eyJ alone','eyJhbGciOiJIUzI1NiJ9','' ],
  ['sk_ secret','sk_live_0123456789abcdef','secret_prefix'],
  ['sb_ secret','sb_secret_0123456789abcd','secret_prefix'],
  ['ghp_ token','ghp_0123456789abcdefABCDEF','secret_prefix'],
  ['identifier containing sk_','task_sk_short desk_lamp','' ],
  ['e-mail','contact jane.doe@corp.co.uk','email'],
  ['example-domain e-mail is exempt','f6-test@example.invalid','' ],
  ['npm scope / version pin','postgresql@17/bin and @typescript-eslint','' ],
  ['bucket object path','disclosure-raw/edgar/0000-issuer/abc.json','bucket_path'],
  ['bucket path behind private://','private://eval-restricted/reports/x.json','' ],
  ['bucket path template','disclosure-raw/{source}/{issuer_id}/','' ],
  ['storage API object path','https://x.supabase.co/storage/v1/object/sign/b/c','bucket_path'],
 ];
 for(const [name,text,rule] of cases)it(name,()=>{expect(scan(text)).toEqual(rule?[rule]:[]);});
 it('long text/note/notes fields: JSON only, > 200 characters, at any depth',()=>{
  const long='x'.repeat(201);
  expect(redactScan([{path:'src/lib/evals/fixtures/a.json',text:JSON.stringify({cases:[{notes:long}]})}])).toEqual([{path:'src/lib/evals/fixtures/a.json',rule:'long_field',line:null,field:'notes'}]);
  expect(scan(JSON.stringify({note:long,text:'x'.repeat(200)}),'docs/evals/a.json')).toEqual(['long_field']);
  expect(scan(JSON.stringify({summary:long}),'docs/evals/a.json')).toEqual([]);
  expect(scan(`notes: ${long}`,'docs/audits/a.md')).toEqual([]);
 });
 it('reports the line and never the matched text',()=>{
  const f=redactScan([{path:'docs/audits/a.md',text:'ok\nok\npostgres://user:secret@h/db\n'}]);
  expect(f).toEqual([{path:'docs/audits/a.md',rule:'postgres_url',line:3}]);
  expect(JSON.stringify(f)).not.toContain('secret');
 });
 it('JSON string values are decoded before the credential rules apply',()=>{
  const p='docs/evals/a.json';
  expect(scan(JSON.stringify({u:'postgres://u:p@h/db'}).replace('//','\\/\\/'),p)).toContain('postgres_url');
  expect(scan('{"e":"jane@corp.co.uk"}'.replace('@','\\u0040'),p)).toContain('email');
  expect(scan(JSON.stringify({u:'ok https://x.test/?token=abc'}),p)).toContain('query_token');
  expect(redactScan([{path:p,text:JSON.stringify({u:'postgres://user:secret@h/db'})}]).map(f=>JSON.stringify(f)).join()).not.toContain('secret');
  expect(scan(JSON.stringify({u:'PostgreSQL 17'}),p)).toEqual([]);
 });
 it('flags unparsable JSON',()=>{expect(scan('{','docs/evals/a.json')).toEqual(['invalid_json']);});
});

describe('repository',()=>{
 // Note: untracked local files under docs/audits/2026-11-06-evals-gold-sets (e.g. pasted Codex transcripts) are scanned too and can make this fail locally.
 it('the F6-owned paths (fixtures, docs/evals, the F6 audit directory) are clean',()=>{
  const files=redactTargets();
  expect(files.some(f=>f.path.startsWith('docs/audits/2026-11-06-evals-gold-sets/'))).toBe(true);
  expect(files.filter(f=>f.path.startsWith('docs/audits/')&&!f.path.startsWith('docs/audits/2026-11-06-evals-gold-sets/'))).toEqual([]);
  expect(files.some(f=>f.path==='src/lib/evals/fixtures/gold/lock.json')).toBe(true);
  expect(redactScan(files)).toEqual([]);
 });
});
