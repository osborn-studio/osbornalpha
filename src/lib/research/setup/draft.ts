/**
 * WP-A11 — 向导草稿（浏览器 localStorage，仅续填便利；权威数据在服务端表里）。
 * 版本化：版本不符或无法解析一律视为没有草稿。
 */
import type { OwnerCompanyAnswer } from './companies';
import type { ThesisDraft } from './theses';

export const DRAFT_KEY = 'research-setup-draft:v1';

export interface SetupDraft {
  version: 1;
  thesis: ThesisDraft;
  thesisStep: number;
  /** Answers keyed by entity_id, or by a client-generated `new:<n>` key for owner-added companies. */
  companies: Record<string, OwnerCompanyAnswer>;
  companyStep: number;
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
    return parsed as SetupDraft;
  } catch {
    return null;
  }
}
