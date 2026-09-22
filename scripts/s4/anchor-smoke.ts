import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Pool} from 'pg';
import assert from 'node:assert/strict';
import {digest} from '../../src/lib/research/ingest/pa-v1/json.js';
const state=JSON.parse(readFileSync(process.argv[2],'utf8'));
const actor='99999999-9999-4999-8999-999999999999';
const root=mkdtempSync(join(tmpdir(),'alpha-s4-receipts-'));
const admin=new Pool({connectionString:state.adminUrl});
const env={...process.env,ALPHA_S4_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl,ALPHA_S4_ACTOR_ID:actor,ALPHA_S4_RECEIPT_DIR:root};
function child(){return execFileSync(process.execPath,['--import','tsx','scripts/s4/anchor-worker.ts','--once'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});}
async function main(){
  await admin.query(`create function public.s4_ack_failure() returns trigger language plpgsql as $$ begin raise exception 'simulated_ack_failure'; end $$;
    create trigger s4_ack_failure before update on public.research_s4_outbox for each row execute function public.s4_ack_failure();`);
  try{assert.throws(()=>child());}finally{await admin.query('drop trigger s4_ack_failure on public.research_s4_outbox; drop function public.s4_ack_failure();');}
  const journal=join(root,digest(actor),'receipts.jsonl');
  assert.ok(readFileSync(journal,'utf8').trim().split('\n').length>=1);
  const resumed=JSON.parse(child());assert.ok(resumed.acknowledged>0);
  const before=readFileSync(journal,'utf8'),replay=JSON.parse(child());
  assert.equal(replay.appended,0);assert.equal(replay.acknowledged,0);assert.equal(readFileSync(journal,'utf8'),before);
  const status=(await admin.query('select status,anchor_status from research_s4_observation_state where user_id=$1',[actor])).rows;
  assert.ok(status.every(s=>s.status==='pending_start'&&s.anchor_status==='anchored'));
  writeFileSync(join(state.directory,'receipt-state.json'),JSON.stringify({root,journal}),{mode:0o600});
  console.log(JSON.stringify({status:'passed',crash_boundary:'fsync_before_SQL_ack',new_process_replay:'passed',entries:before.trim().split('\n').length,root,observations:status}));
}
main().finally(()=>admin.end());
