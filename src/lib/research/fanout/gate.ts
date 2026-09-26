/**
 * §6.1 relevance gate: thesis-specific follow-ups (Q2/Q4/Q5) only count when
 * that thesis's Q1 answered "relevant". Otherwise they are written as
 * abstentions with their distribution kept as evidence. Q3 is material-level.
 */
import type { BackendAnswer } from './backends/types';

const GATED = new Set(['Q2','Q4','Q5']);

export function applyRelevanceGate(answers: BackendAnswer[]): BackendAnswer[] {
  const relevant = new Set(answers.filter(a => a.question_id === 'Q1' && !a.abstained && a.selected === 'true').map(a => a.thesis_id));
  return answers.map(a => GATED.has(a.question_id) && !relevant.has(a.thesis_id) ? { ...a, selected: null, abstained: true } : a);
}
