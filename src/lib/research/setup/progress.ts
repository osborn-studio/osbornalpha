/** WP-A11 — 阶段 0 目标区间与进度（总纲 §8.6：12–15 家公司，8–12 条 thesis）。区间外只提醒。 */

export const TARGETS = { companies: [12, 15], theses: [8, 12] } as const;

export type RangeStatus = 'below' | 'ok' | 'above';

export interface SetupProgress {
  companies: { count: number; min: number; max: number; status: RangeStatus };
  theses: { count: number; active: number; draft: number; min: number; max: number; status: RangeStatus };
}

const status = (count: number, [min, max]: readonly [number, number]): RangeStatus =>
  count < min ? 'below' : count > max ? 'above' : 'ok';

export function setupProgress(input: { inScopeCompanies: number; activeTheses: number; draftTheses: number }): SetupProgress {
  const theses = input.activeTheses + input.draftTheses;
  return {
    companies: { count: input.inScopeCompanies, min: TARGETS.companies[0], max: TARGETS.companies[1], status: status(input.inScopeCompanies, TARGETS.companies) },
    theses: { count: theses, active: input.activeTheses, draft: input.draftTheses, min: TARGETS.theses[0], max: TARGETS.theses[1], status: status(theses, TARGETS.theses) },
  };
}
