// Source drawer payload (topic spec 2026-11-16 §4.1); structurally shared without a component dependency.
import type {EvidenceKind} from './ref';
export interface SourceDrawerPayload {
 kind: EvidenceKind;
 identity: {id: string; label: string};
 source: {publisher: string; adapter: string; url: string | null; locator: string | null; evidence_sha256: string | null};
 times: {period: string; available_at: string; ingested_at: string | null};
 transform: {code_version: string | null; mapping_version: string | null; method_version: string | null};
 licence: {status: string; note_key: string};
 attribution_key: string;
 links: {module_href: string};
}
