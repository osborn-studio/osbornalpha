// WP-S6 step 8: vercel.json carries both macro crons (P1 sync and P4 monthly review).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

describe('vercel.json crons',()=>{
 const crons:{path:string;schedule:string}[]=JSON.parse(readFileSync(join(process.cwd(),'vercel.json'),'utf8')).crons;
 it('contains /api/cron/macro-sync and /api/cron/macro-review exactly once each',()=>{
  expect(crons.filter(c=>c.path==='/api/cron/macro-sync')).toHaveLength(1);
  expect(crons.filter(c=>c.path==='/api/cron/macro-review')).toHaveLength(1);
 });
 it('the review cron runs at 06:00 UTC on the 3rd (runbook §3)',()=>{
  expect(crons.find(c=>c.path==='/api/cron/macro-review')!.schedule).toBe('0 6 3 * *');
 });
});
