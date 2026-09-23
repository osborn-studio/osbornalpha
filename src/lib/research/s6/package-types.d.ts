import 'dsh-trade-strategy-evaluator/adapters';
import type {EvaluationOutcome} from 'dsh-trade-strategy-evaluator/engine';
// Runtime export in fixed 0.2.0; its bundled declaration omitted this symbol.
declare module 'dsh-trade-strategy-evaluator/adapters' {
 export function validateCommit(body:unknown):EvaluationOutcome;
}
