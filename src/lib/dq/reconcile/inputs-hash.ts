// src/lib/dq/reconcile/inputs-hash.ts
// inputs_hash of one reconciliation result (spec §5.6): sha256 hex of
// left_raw_hash \n right_sha256 \n gold_or_sample_sha256 \n parser_version, in exactly this order. The
// runner writes it with every result (and apply_reconcile_result copies it into latest_result); the
// restore path recomputes it from the CURRENT inputs, so any input that changed after the last passing
// run makes the two differ and restore_reconciled answers not_passing. A side that does not exist is
// the empty string; a newline inside a field would make two different inputs collide and is refused.
import {createHash} from 'node:crypto';

export interface ReconcileInputs{left_raw_hash:string;right_sha256:string;gold_or_sample_sha256:string;parser_version:string}
const FIELDS=['left_raw_hash','right_sha256','gold_or_sample_sha256','parser_version'] as const;

export function computeInputsHash(inputs:ReconcileInputs):string{
 const parts=FIELDS.map(k=>{const v=inputs[k];if(typeof v!=='string'||v.includes('\n'))throw new Error(`invalid_inputs:${k}`);return v;});
 return createHash('sha256').update(parts.join('\n')).digest('hex');
}
