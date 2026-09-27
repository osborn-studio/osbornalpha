/**
 * WP-A11 — 向导草稿（浏览器 localStorage，仅续填便利；权威数据在服务端表里）。
 * 版本化：版本不符或无法解析一律视为没有草稿。
 */
import type { OwnerCompanyAnswer } from './companies';
import type { CreateThesisInput } from '../theses';
import { EMPTY_THESIS_DRAFT, type ThesisDraft } from './theses';

export const DRAFT_KEY = 'research-setup-draft:v1';

export interface SetupDraft {
  version: 1;
  thesis: ThesisDraft;
  thesisStep: number;
  /** Answers keyed by entity_id, or by a client-generated `new:<n>` key for owner-added companies. */
  companies: Record<string, OwnerCompanyAnswer>;
  companyStep: number;
  /** A thesis that was created but whose activation did not complete (reload mid-save): offer to finish it. */
  pendingActivation?: { id: string; title: string } | null;
  /**
   * A create whose outcome is unknown (response lost and reconciliation not yet successful). Written before
   * the POST; no new create is allowed until it is reconciled by its submission id.
   */
  pendingCreate?: { submissionId: string; input: CreateThesisInput; activate: boolean } | null;
}

export function serializeDraft(draft: SetupDraft): string {
  return JSON.stringify(draft);
}

export function parseDraft(raw: string | null | undefined): SetupDraft | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SetupDraft> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;
    if (!parsed.thesis || typeof parsed.thesis !== 'object' || typeof parsed.thesisStep !== 'number') return null;
    if (!parsed.companies || typeof parsed.companies !== 'object' || typeof parsed.companyStep !== 'number') return null;
    const p = parsed.pendingActivation;
    if (p !== undefined && p !== null && (typeof p !== 'object' || typeof p.id !== 'string' || typeof p.title !== 'string')) return null;
    const c = parsed.pendingCreate;
    if (c !== undefined && c !== null && (typeof c !== 'object' || typeof c.submissionId !== 'string' || !c.input || typeof c.input !== 'object' || typeof c.activate !== 'boolean')) return null;
    return parsed as SetupDraft;
  } catch {
    return null;
  }
}

/** After a thesis is saved: clear the answers and the step together (one state write, one persistence). */
export function resetThesisDraft(prev: SetupDraft): SetupDraft {
  return { ...prev, thesis: { ...EMPTY_THESIS_DRAFT, pillars: EMPTY_THESIS_DRAFT.pillars.map((p) => ({ ...p })), invalidation_conditions: [...EMPTY_THESIS_DRAFT.invalidation_conditions], watch_metrics: [...EMPTY_THESIS_DRAFT.watch_metrics], catalysts: [], company_ids: [] }, thesisStep: 0 };
}

/** After the roster is written: clear the company answers and the step together. */
export function resetCompanyDraft(prev: SetupDraft): SetupDraft {
  return { ...prev, companies: {}, companyStep: 0 };
}

/**
 * The thesis exists from this moment: clear the answers immediately (before activation is awaited) so a
 * reload can never resubmit them, and remember the activation still owed.
 */
export function markThesisCreated(prev: SetupDraft, created: { id: string; title: string }): SetupDraft {
  return { ...resetThesisDraft(prev), pendingActivation: { id: created.id, title: created.title } };
}

export function clearPendingActivation(prev: SetupDraft): SetupDraft {
  return { ...prev, pendingActivation: null };
}

/** Before the POST: remember the attempt so a lost response can only be reconciled, never re-created. */
export function markCreatePending(prev: SetupDraft, pending: { submissionId: string; input: CreateThesisInput; activate: boolean }): SetupDraft {
  return { ...prev, pendingCreate: pending };
}

export function clearPendingCreate(prev: SetupDraft): SetupDraft {
  return { ...prev, pendingCreate: null };
}
