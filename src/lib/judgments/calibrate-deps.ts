// src/lib/judgments/calibrate-deps.ts
// Production wiring of CalibrateDeps (spec §8.3) shared by /api/cron/judgments-calibrate and
// scripts/judgments/calibrate.ts: supabaseJudgmentsDb (anon for public reads, service role for the
// internal cohort, validity, job state and insert RPCs), the service-role TableClient for batches and
// freshness, the judgments-calibration bucket, and the registry order.
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import type {TriggeredBy} from '../dq/batches';
import type {CalibrateDeps} from './calibrate';
import {supabaseCohortStore} from './cohort-store';
import {adminJudgmentsDb} from './deps';
import {REGISTRY} from './registry';

export function productionCalibrateDeps(opts:{deadline:Date|null;codeVersion:string;triggeredBy:TriggeredBy}):CalibrateDeps{
 const admin=getAdminSupabase();
 return {
  db:adminJudgmentsDb(admin),tables:supabaseTableClient(admin),store:supabaseCohortStore(admin),
  methods:REGISTRY.map(m=>({id:m.id,version:m.version})),
  codeVersion:opts.codeVersion,deadline:opts.deadline,triggeredBy:opts.triggeredBy,
 };
}
