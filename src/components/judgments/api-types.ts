// src/components/judgments/api-types.ts
// Response shapes of the Task 18 read routes as the judgment UI consumes them (spec §10). This is the one file to edit if the
// routes' JSON differs; every page and component reads the routes only through these types. (Integrator: aligned with the
// Task 18 route bodies; every body also carries codeVersion; `display.percent` is ABSENT when null — decision D2.)
import type {CalibrationRow,CalibrationState,CardView,JudgmentCard,JudgmentRow,MethodologyRow,QueueRow,SettlementKind,SettlementRow,Subject,Target} from '@/lib/judgments/types';

/** Over the wire `display.percent` is omitted when null (Task 18 serializeBody); read it as optional. */
export type WireCard=Omit<JudgmentCard,'display'>&{display:Omit<JudgmentCard['display'],'percent'>&{percent?:number|null}};
/** GET /api/judgments list response. */
export interface JudgmentsListResponse{codeVersion:string|null;subject:Subject;view:CardView;asOf:string|null;cards:WireCard[]}
/** GET /api/methodologies[?status=] — registry rows with the latest scope='all' calibration summary (null when none / unpublished). */
export interface MethodologyCalibrationSummary{state:CalibrationState;valid:boolean;n_independent:number;threshold_n:number;computed_at:string;valid_until:string;metrics:Record<string,unknown>}
export interface MethodologyListItem{methodology:MethodologyRow;calibration:MethodologyCalibrationSummary|null}
export interface MethodologiesResponse{codeVersion:string|null;status:string|null;methodologies:MethodologyListItem[]}
/** GET /api/methodologies/[id]/[version]. recent_settlements are flat settlement rows with the judgment's subject. */
export type RecentSettlement=SettlementRow&{subject_type:string;subject_key:string;judgment_type:string};
export interface MethodologyDetailResponse{codeVersion:string|null;row:MethodologyRow;doc_markdown:string|null;doc_sha256_matches:boolean;
 calibrations:Array<{scope:{scope_type:string;scope_key:string};row:CalibrationRow;valid:boolean}>;recent_settlements:RecentSettlement[]}
/** GET /api/methodologies/[id]/[version]/calibration?scope_type=all. */
export interface CalibrationResponse{codeVersion:string|null;scope:{scope_type:string;scope_key:string};calibration:CalibrationRow|null;valid:boolean;state:CalibrationState;
 reliability:CalibrationRow['reliability'];temporal_split:unknown;sample:unknown[]|null;sample_status:string|null}
/** GET /api/judgments/[id]. */
export interface JudgmentDetailResponse{codeVersion:string|null;view:string;asOf:string|null;card:WireCard;judgment:JudgmentRow;settlements:SettlementRow[];calibration:{row:CalibrationRow;valid:boolean}|null}
/** GET /api/admin/judgments/queue?filter=due|backoff|leased|all&limit=&after= — queue rows joined with the judgment and its latest settlement. */
export interface QueueItem extends QueueRow{
 judgment:{subject_type:string;subject_key:string;methodology_id:string;methodology_version:string;target:Target|null}|null;
 latest_settlement:{kind:SettlementKind;outcome:'hit'|'miss'|null;settled_at:string}|null}
export interface QueueResponse{codeVersion:string|null;filter:string;rows:QueueItem[];next_after:string|null;counts:{due:number;backoff:number;leased:number};now:string}
/** POST /api/admin/judgments/[id]/{withdraw,reopen,settle} body {reason, request_id} → {id, outcome, seq}. */
export interface AdminActionResponse{codeVersion:string|null;id:string;outcome:string;seq:number|null}
