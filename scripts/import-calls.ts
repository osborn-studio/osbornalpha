/**
 * WP-A10: one-time mapping of the personal hiphon-pm call journal into the judgment ledger.
 *   RESEARCH_OWNER_USER_ID=<owner uuid> ALPHA_S4_ENABLED=1 ALPHA_S4_DATABASE_URL=… \
 *   npx tsx scripts/import-calls.ts ~/.hiphon-pm/calls.jsonl [--scorecard ~/.hiphon-pm/scorecard.json] [--dry-run]
 * Reads only the operator path; a non-dry run writes configured thesis/ledger stores.
 * No external model is invoked. This legacy import is not prospective human evidence.
 * Each call → DRAFT historical thesis + human_baseline decision frozen at the call time; manual_close → outcome.
 */
import { runImportCallsCli } from './import-calls-runner';
void runImportCallsCli(process.argv.slice(2), {
 stdout: value => console.log(value), stderr: value => console.error(value),
 prepare: async ({journalPath,scorecardPath,dryRun},registerCleanup) => {
  const {loadEnvConfig}=await import('@next/env');
  loadEnvConfig(process.cwd(),undefined,{info:()=>{},error:()=>{}});
  const {closeS4Pool,transaction}=await import('../src/lib/research/s4/db');
  registerCleanup(closeS4Pool);
  const {getServiceResearchCtx}=await import('../src/lib/research/service');
  const {createThesis,listTheses}=await import('../src/lib/research/theses');
  const {recordDecision,recordOutcome}=await import('../src/lib/research/s4/ledger');
  const {importCalls}=await import('../src/lib/research/ledger/calls-import');
  const {readFileSync}=await import('node:fs');
  const owner=process.env.RESEARCH_OWNER_USER_ID;
  if(!owner)throw new Error('import_owner_required');
  return async () => {
  const scorecard = scorecardPath ? JSON.parse(readFileSync(scorecardPath, 'utf8')) as import('../src/lib/research/ledger/calls-import').Scorecard : null;
  const ctx = getServiceResearchCtx(), actor = { userId: owner, kind: 'human' as const };
  return importCalls({
    journal: readFileSync(journalPath, 'utf8'), scorecard, dryRun,
    theses: { find: async title => (await listTheses(ctx)).find(t => t.title === title)?.id ?? null, create: async input => (await createThesis(ctx, input)).id },
    ledger: {
      existingDecisions: async () => new Map<string, string>((await transaction(actor, db => db.query("select card_id,id from public.research_decisions where user_id=$1 and card_id like 'hiphon:%'", [owner]))).rows.map((r: { card_id: string; id: string }) => [r.card_id, r.id])),
      existingOutcomeEvaluationIds: async () => new Set<string>((await transaction(actor, db => db.query("select evaluation_id from public.research_outcomes where user_id=$1 and evaluation_id like 'hiphon-journal:%'", [owner]))).rows.map((r: { evaluation_id: string }) => r.evaluation_id)),
      recordDecision: input => recordDecision(actor, input), recordOutcome: input => recordOutcome(actor, input) },
  });

  };
 },
}).then(code=>{if(code!==0)process.exitCode=code;});
