// src/lib/judgments/rpc-inventory.ts
// The single inventory of F4 SQL functions (spec §5.6; plan audit Q1-06): name → argument signature as
// has_function_privilege spells it. PUBLIC_RPCS are security invoker and executable by anon / authenticated /
// service_role; SERVICE_RPCS are security definer and executable by service_role only; INTERNAL_FUNCTIONS have no
// client EXECUTE. judgments.integration.test.ts asserts the catalog against it, db.test.ts checks the supabase client
// split against it, rpc-inventory.test.ts (Task 22) checks the runbook lists every name. Add a function here first.
export const PUBLIC_RPCS={
 judgments_server_time:'()',
 judgment_envelope_of:'(public.judgments,text,timestamptz)',
 latest_judgment_cards:'(text,text,text[],text,timestamptz)',
 judgment_history:'(text,text,text,text,text,text,timestamptz,uuid,integer)',
 calibration_cohort:'(text,text,date,date,timestamptz,uuid,integer)',
 methodology_state_at:'(text,text,timestamptz)',
 judgment_envelope_by_id:'(uuid,text,timestamptz)',
} as const;
export const SERVICE_RPCS={
 calibration_cohort_internal:'(text,text,date,date,timestamptz,uuid,integer)',
 sync_methodology:'(jsonb,text,text)',
 register_judgment:'(jsonb,jsonb)',
 claim_due_judgments:'(integer,integer)',
 claim_judgment:'(uuid,integer)',
 release_lease:'(uuid,uuid,jsonb)',
 append_settlement:'(uuid,uuid,text,jsonb)',
 quarantine_settlement:'(uuid,uuid,text,jsonb,jsonb,uuid)',
 apply_quarantine_override:'(uuid,jsonb,uuid,jsonb)',
 reject_quarantined_settlement:'(uuid,uuid,jsonb,text,jsonb,jsonb)',
 freeze_calibration_cohort:'(uuid,text,text,date,date)',
 calibration_cohort_members:'(uuid,uuid,integer)',
 clear_calibration_generation:'(uuid)',
 insert_calibration:'(jsonb,bigint)',
 set_job_state:'(text,timestamptz,jsonb)',
 repair_stale_batches:'(text,interval)',
} as const;
export const INTERNAL_FUNCTIONS={
 judgments_settle_after_date:'(jsonb)',
 judgments_grace_days:'(jsonb,jsonb)',
 judgment_operation_payload:'(uuid,jsonb)',
 judgment_settlement_payload:'(public.judgment_settlements)',
 judgment_replay_status:'(public.judgment_settlements,uuid,text,jsonb)',
 judgment_append_settlement_internal:'(uuid,uuid,text,jsonb)',
} as const;
export type PublicRpc=keyof typeof PUBLIC_RPCS;
export type ServiceRpc=keyof typeof SERVICE_RPCS;
export type InternalFunction=keyof typeof INTERNAL_FUNCTIONS;
export const PUBLIC_RPC_NAMES=Object.keys(PUBLIC_RPCS) as PublicRpc[];
export const SERVICE_RPC_NAMES=Object.keys(SERVICE_RPCS) as ServiceRpc[];
export const INTERNAL_FUNCTION_NAMES=Object.keys(INTERNAL_FUNCTIONS) as InternalFunction[];
/** Every F4 non-trigger function with its signature (trigger functions are Task 2's and listed there). */
export const F4_FUNCTIONS:Readonly<Record<string,string>>={...PUBLIC_RPCS,...SERVICE_RPCS,...INTERNAL_FUNCTIONS};
