// Topic public DTOs (spec §6).
import type {EvidenceKind} from '@/lib/evidence/ref';
import type {Resolved,ResolveState} from '@/lib/evidence/resolve';
import type {Bilingual,Category,DraftEntry,DraftSection,Drift,EvidenceCounts,ExpectedSlot,RenderedSummary,UnpublishReason} from './types';
export interface DirectoryItem{slug:string;category:Category;title:Bilingual;dek:Bilingual;version_no:number;published_at:string;
 evidence_counts:EvidenceCounts;drift_counts:Record<Exclude<Drift,'unchanged'>,number>;stale:boolean}
export interface PublicEvidence{ordinal:number;section_key:string;kind:EvidenceKind;state:ResolveState;reason:string|null;basis:Resolved['basis'];
 label:Bilingual;fact:Resolved['display']['fact'];period:string|null;available_at:string|null;
 drift:Exclude<Drift,'unchanged'>|null;masked:boolean;current:{value_text:string;unit:string;period:string;available_at:string}|null}
export interface VersionMeta{version_no:number;published_at:string;cutoff:string;is_current:boolean;superseded:boolean;unpublished_at:string|null;unpublish_reason:UnpublishReason|null}
export interface DossierDto{attributions:string[];topic:{slug:string;category:Category;title:Bilingual;dek:Bilingual};
 version:VersionMeta;total_versions:number;current_version_no:number|null;view:'current'|'version'|'replay';replay_as_of:string|null;
 sections:DraftSection[];evidence:PublicEvidence[];expected_slots:ExpectedSlot[];entries:DraftEntry[];
 summary:(RenderedSummary&{hidden_points:number})|null;counts:EvidenceCounts;freshness_at_publication:Record<string,'fresh'|'stale'|'unknown'>;
 stale:boolean;age_days:number;drift_checked_at:string|null;drift_unchecked:boolean}
export interface EvidenceDetailDto{evidence:PublicEvidence;drawer:Resolved['drawer'];version_no:number}
