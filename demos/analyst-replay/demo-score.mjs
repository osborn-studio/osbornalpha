import { callDirection, scoreForward } from '../../src/lib/scoring/forward.ts';

export const FINAL_SCORING_DAY = 10;

export function scoreDemoForward(call, bars) {
  const base = scoreForward(call, bars);
  if (!base) return null;

  const baseIndex = bars.findIndex(bar => bar.time === base.base_date);
  const finalBar = bars[baseIndex + FINAL_SCORING_DAY];
  const return10 = finalBar ? ((finalBar.close - base.base_close) / base.base_close) * 100 : null;
  const direction = callDirection(call.action);
  const score5 = direction === 0 ? null : Math.round(base.forward_5d_pct * direction * 10) / 10;
  const score10 = direction === 0 || return10 === null ? null : Math.round(return10 * direction * 10) / 10;
  return {
    ...base,
    forward_10d_pct: return10,
    hit_10d: direction === 0 || return10 === null ? null : return10 * direction > 0,
    score_5d: score5,
    score_10d: score10,
    score: score10 ?? score5,
  };
}
