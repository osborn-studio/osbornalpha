// src/lib/judgments/settlement-digest.ts
// request_digest of judgment_settlements (spec §5.3 S02 / R06): the single implementation. The
// operation payload is every semantic field — judgment_id, kind, outcome, realized, evidence,
// resolver, resolver_version, reason, actor; run metadata (settlement_id, seq, settled_at,
// request_key, request_digest, code_version, batch_id) is excluded. Undefined optional members are
// dropped first (jsonClean) because JSON storage drops them. append_settlement stores this digest
// and, on replay, compares it AND the jsonb payload rebuilt from the stored columns (Task 3).
import {digest,jsonClean} from './canonical';
import type {SettlementInsert} from './types';

export const OPERATION_FIELDS=['judgment_id','kind','outcome','realized','evidence','resolver','resolver_version','reason','actor'] as const;
export function operationPayload(judgmentId:string,row:SettlementInsert):Record<string,unknown>{
 return jsonClean({judgment_id:judgmentId,kind:row.kind,outcome:row.outcome,realized:row.realized,evidence:row.evidence,resolver:row.resolver,resolver_version:row.resolver_version,reason:row.reason,actor:row.actor});
}
export const operationDigest=(judgmentId:string,row:SettlementInsert):string=>digest(operationPayload(judgmentId,row));
