/** WP-A2 first cohort seed: idempotent over first-cohort.json. */
import type { ResearchCtx } from '../store';
import cohort from './first-cohort.json';
import { upsertEntityKeys } from './store';
import type { CohortCompany, CohortFile } from './types';

export const FIRST_COHORT = cohort as CohortFile;

export async function seedEntityKeys(ctx: ResearchCtx): Promise<{ companies: number; securities: number }> {
  let securities = 0;
  for (const company of FIRST_COHORT.companies as CohortCompany[]) securities += (await upsertEntityKeys(ctx, company)).securities;
  return { companies: FIRST_COHORT.companies.length, securities };
}
