import {digest, fail} from '../ingest/pa-v1/json.js';
import {isUuid} from '../s4/ledger';
import {exactPlanObject as object} from './arm-plan-object';

export const ARM_JOURNAL_PROTOCOL = 'alpha-arm-journal/1.0';
export const JOURNAL_STATES = Object.freeze(['enrolled', 'baseline_confirmed', 'generation_reserved', 'stance_generated', 'ai_exposed', 'collaboration_confirmed', 'observation_bindings_complete', 'terminated'] as const);
export type JournalState = typeof JOURNAL_STATES[number];
const PAYLOAD_KEYS = Object.freeze({
 'baseline.confirmed': Object.freeze(['plan_ref', 'plan_hash', 'confirmation_ref', 'confirmation_hash'] as const),
 'generation.reserved': Object.freeze(['reservation_ref', 'reservation_hash', 'baseline_event_ref', 'baseline_event_hash'] as const),
 'stance.generated': Object.freeze(['reservation_ref', 'reservation_hash', 'stance_ref', 'stance_hash'] as const),
 'ai.exposed': Object.freeze(['ai_plan_ref', 'ai_plan_hash', 'stance_ref', 'stance_hash', 'disclosure_ref', 'disclosure_hash', 'reveal_confirmation_ref', 'reveal_confirmation_hash'] as const),
 'collaboration.confirmed': Object.freeze(['plan_ref', 'plan_hash', 'confirmation_ref', 'confirmation_hash', 'disclosure_ref', 'disclosure_hash'] as const),
 'bindings.completed': Object.freeze(['baseline_binding_ref', 'baseline_binding_hash', 'ai_binding_ref', 'ai_binding_hash', 'collaboration_binding_ref', 'collaboration_binding_hash'] as const),
 terminated: Object.freeze(['reason', 'previous_state', 'cause_ref', 'cause_hash'] as const),
} as const);
export type JournalEventType = keyof typeof PAYLOAD_KEYS;
export const JOURNAL_EVENTS = Object.freeze(Object.keys(PAYLOAD_KEYS) as JournalEventType[]);
export const JOURNAL_TERMINAL_REASONS = Object.freeze(['refusal', 'revocation', 'contamination', 'missed_deadline'] as const);
const edges = new Map<JournalState, readonly [JournalEventType, JournalState]>([
 ['enrolled', ['baseline.confirmed', 'baseline_confirmed']],
 ['baseline_confirmed', ['generation.reserved', 'generation_reserved']],
 ['generation_reserved', ['stance.generated', 'stance_generated']],
 ['stance_generated', ['ai.exposed', 'ai_exposed']],
 ['ai_exposed', ['collaboration.confirmed', 'collaboration_confirmed']],
 ['collaboration_confirmed', ['bindings.completed', 'observation_bindings_complete']],
]);
export function nextJournalState(state: unknown, event: unknown): JournalState {
 if (typeof state !== 'string' || !JOURNAL_STATES.includes(state as JournalState) || typeof event !== 'string' || !JOURNAL_EVENTS.includes(event as JournalEventType)) fail('invalid_schema');
 if (state === 'terminated') fail('terminal_state');
 if (event === 'terminated') return 'terminated';
 const edge = edges.get(state as JournalState);
 if (!edge || edge[0] !== event) fail('invalid_transition');
 return edge![1];
}
function hash(value: unknown): value is string {
 return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
function eventType(value: unknown): JournalEventType {
 if (typeof value !== 'string' || !Object.hasOwn(PAYLOAD_KEYS, value)) fail('invalid_schema');
 return value as JournalEventType;
}
function timestamp(value: unknown): value is string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
 const ms = Date.parse(value);
 return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}
/** Structural parser only. Reference shape/digest is not actor, source or origin authority. */
export function parseJournalPayload(type: unknown, value: unknown): Readonly<Record<string, string>> {
 const kind = eventType(type);
 const r = object(value, [...PAYLOAD_KEYS[kind]]);
 for (const [key, v] of Object.entries(r)) {
  if (key.endsWith('_ref') && (typeof v !== 'string' || !isUuid(v))) fail('invalid_schema');
  if (key.endsWith('_hash') && !hash(v)) fail('invalid_schema');
 }
 if (kind === 'terminated' && (typeof r.reason !== 'string' || !JOURNAL_TERMINAL_REASONS.includes(r.reason as typeof JOURNAL_TERMINAL_REASONS[number]) || typeof r.previous_state !== 'string' || !JOURNAL_STATES.includes(r.previous_state as JournalState) || r.previous_state === 'terminated')) fail('invalid_schema');
 return Object.freeze(r) as Readonly<Record<string, string>>;
}
export type JournalPayloadMap = {
 readonly [K in JournalEventType]: K extends 'terminated'
  ? Readonly<{reason: typeof JOURNAL_TERMINAL_REASONS[number]; previous_state: Exclude<JournalState, 'terminated'>; cause_ref: string; cause_hash: string}>
  : Readonly<Record<typeof PAYLOAD_KEYS[K][number], string>>;
};
interface JournalEnvelopeCommon {
 readonly protocol: typeof ARM_JOURNAL_PROTOCOL;
 readonly id: string; readonly owner_id: string; readonly enrollment_id: string;
 readonly cohort_hash: string; readonly sequence: number; readonly previous_event_hash: string;
 readonly occurred_at: string; readonly actor_ref: string;
 readonly authorization_ref: string; readonly authorization_hash: string;
 readonly request_ref: string; readonly request_hash: string;
}
export type JournalEnvelope = {
 readonly [K in JournalEventType]: Readonly<JournalEnvelopeCommon & {type: K; payload: JournalPayloadMap[K]}>;
}[JournalEventType];
/** Inactive exact wire schema only, NOT complete replay. Must resolve immutable v2
 * genesis/head, typed origins, actor permissions, source bundle and deadlines under
 * lock before any use. No endpoint or journal writer calls this parser. */
export function parseJournalEnvelope(value: unknown): Readonly<JournalEnvelope> {
 const r = object(value, ['protocol', 'id', 'owner_id', 'enrollment_id', 'cohort_hash', 'sequence', 'previous_event_hash', 'type', 'occurred_at', 'actor_ref', 'authorization_ref', 'authorization_hash', 'request_ref', 'request_hash', 'payload']);
 if (r.protocol !== ARM_JOURNAL_PROTOCOL || ['id', 'owner_id', 'enrollment_id', 'actor_ref', 'authorization_ref', 'request_ref'].some(k => typeof r[k] !== 'string' || !isUuid(r[k])) || ['cohort_hash', 'previous_event_hash', 'authorization_hash', 'request_hash'].some(k => !hash(r[k])) || !Number.isSafeInteger(r.sequence) || (r.sequence as number) < 1 || (r.sequence as number) > 100 || !timestamp(r.occurred_at)) fail('invalid_schema');
 const kind = eventType(r.type), payload = parseJournalPayload(kind, r.payload);
 return Object.freeze({...r, type: kind, payload}) as unknown as Readonly<JournalEnvelope>;
}
/** Integrity digest only; cannot verify consent or self-reported chain completeness. */
export function journalEnvelopeHash(value: unknown): string {
 return digest(parseJournalEnvelope(value));
}
