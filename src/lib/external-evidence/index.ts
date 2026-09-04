export { searchExternalEvidence, searchExternalEvidenceUncached } from './service';
export { isEvidenceSearchConfigured, resolveEvidenceSearchProvider } from './resolve-provider';
export { normalizeEvidenceSearchRequest, normalizeEvidenceTickerParam, isSafeEvidenceTicker } from './request';
export { classifyHeadlineSentiment } from './sentiment';
export { evidencePromptLines, resolvePerspectiveCitations } from './citations';
export type {
  EvidenceScope,
  EvidenceSearchRequest,
  EvidenceSearchSnapshot,
  ExternalEvidence,
  PerspectiveCitation,
} from './types';
