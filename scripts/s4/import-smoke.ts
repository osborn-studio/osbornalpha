import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
import { importCandidate } from '../../src/lib/research/s4/import';
import { closeS4Pool, transaction } from '../../src/lib/research/s4/db';
const [stateFile,bindingFile,packFile] = process.argv.slice(2);
const state = JSON.parse(readFileSync(stateFile,'utf8')), binding=JSON.parse(readFileSync(bindingFile,'utf8'));
process.env.ALPHA_S4_ENABLED='1'; process.env.ALPHA_S4_DATABASE_URL=state.runtimeUrl;
const actor={userId:binding.localUserId,kind:'agent' as const};
const other={userId:'88888888-8888-4888-8888-888888888888',kind:'agent' as const};
const admin = new Pool({connectionString:state.adminUrl});
async function main() {
  for(const a of [actor,other]) {
    await admin.query('insert into auth.users(id,email) values($1,$2) on conflict do nothing',[a.userId,a.userId+'@example.test']);
    await admin.query("update public.profiles set role='admin' where id=$1",[a.userId]);
  }
  await admin.query('insert into public.research_s4_bindings(user_id,payload_hash,binding) values($1,$2,$3) on conflict do nothing',[actor.userId,binding.approvedPayloadHash,JSON.stringify(binding)]);
  const raw=readFileSync(packFile,'utf8');
  const first=await importCandidate(actor,raw),again=await importCandidate(actor,raw);
  assert.equal(again.id,first.id);assert.equal(again.duplicate,true);
  await assert.rejects(()=>importCandidate(other,raw),/scope_denied/);
  await transaction(other,async db => assert.equal((await db.query('select * from public.research_s4_candidates')).rowCount,0));
  const counts=(await admin.query(`select (select count(*) from research_source_documents) sources,
    (select count(*) from research_source_versions) versions,(select count(*) from research_source_occurrences) occurrences,
    (select count(*) from research_s4_candidates) candidates,(select count(*) from research_s4_outbox) outbox`)).rows[0];
  assert.deepEqual(counts,{sources:'1',versions:'1',occurrences:'1',candidates:'1',outbox:'1'});
  console.log(JSON.stringify({status:'passed',candidateId:first.id,counts,cross_user:'denied',replay:'duplicate'}));
}
main().finally(async()=>{await admin.end();await closeS4Pool();});
