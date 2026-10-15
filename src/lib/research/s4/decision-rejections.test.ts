import { describe, expect, it } from 'vitest';
import { DEFINITIVE_DECISION_REJECTIONS, resetsDecisionDraft } from './decision-rejections';

// A decision the server has definitively rejected must release the draft so the user can correct
// the selection and resubmit; an unresolved submission must keep the frozen draft for an exact retry.
describe('resetsDecisionDraft', () => {
  it('releases the draft after an observation scope conflict (Codex P2, 2026-10-15)', () => {
    expect(resetsDecisionDraft('observation_scope_conflict')).toBe(true);
  });
  it('releases the draft after the other definitive rejections', () => {
    for (const code of ['revision_conflict', 'idempotency_conflict', 'scope_denied', 'policy_blocked', 'revocation_access_denied', 'invalid_schema', 'security_unresolved', 'exposure_required']) {
      expect(resetsDecisionDraft(code), code).toBe(true);
    }
  });
  it('keeps the draft frozen when the outcome is unknown or transient', () => {
    for (const code of ['submission_unresolved', 'network_unavailable', 'revocation_check_unavailable', 'internal_error', 'invalid_response']) {
      expect(resetsDecisionDraft(code), code).toBe(false);
    }
    expect(resetsDecisionDraft(undefined)).toBe(false);
  });
  it('exposes the list for review', () => {
    expect(DEFINITIVE_DECISION_REJECTIONS).toContain('observation_scope_conflict');
    expect(new Set(DEFINITIVE_DECISION_REJECTIONS).size).toBe(DEFINITIVE_DECISION_REJECTIONS.length);
  });
});
