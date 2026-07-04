import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { upsertEntity, getEntity, listEntities } from './entities';
import { seedResearchData, COMPANY_SEEDS, THEME_SEEDS, AXIOM_SEEDS } from './seed';

let ctx: ResearchCtx;
let store: MockStore;
beforeEach(() => {
  ({ ctx, store } = makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore });
});

describe('upsertEntity', () => {
  it('inserts then updates by (type, lower(name)) without duplicating', async () => {
    const id1 = await upsertEntity(ctx, { type: 'COMPANY', name: 'NVIDIA', ticker: 'NVDA' });
    const id2 = await upsertEntity(ctx, { type: 'COMPANY', name: 'nvidia', ticker: 'NVDA', description: 'updated' });
    expect(id2).toBe(id1);
    expect(store.count('research_entities')).toBe(1);
    expect((await getEntity(ctx, id1))!.description).toBe('updated');
  });

  it('same name under different type is a distinct entity', async () => {
    const company = await upsertEntity(ctx, { type: 'COMPANY', name: 'Power' });
    const theme = await upsertEntity(ctx, { type: 'THEME', name: 'Power' });
    expect(company).not.toBe(theme);
    expect(store.count('research_entities')).toBe(2);
  });
});

describe('listEntities', () => {
  it('filters by type and case-insensitive q over name/ticker', async () => {
    await seedResearchData(ctx);
    const companies = await listEntities(ctx, { type: 'COMPANY' });
    expect(companies).toHaveLength(COMPANY_SEEDS.length);
    const nvda = await listEntities(ctx, { type: 'COMPANY', q: 'nvda' });
    expect(nvda).toHaveLength(1);
    expect(nvda[0].name).toBe('NVIDIA');
    const themes = await listEntities(ctx, { type: 'THEME' });
    expect(themes).toHaveLength(THEME_SEEDS.length);
  });
});

describe('seedResearchData', () => {
  it('is idempotent across runs (entities and axioms)', async () => {
    await seedResearchData(ctx);
    await seedResearchData(ctx);
    expect(store.count('research_entities')).toBe(COMPANY_SEEDS.length + THEME_SEEDS.length);
    expect(store.count('research_axioms')).toBe(AXIOM_SEEDS.length);
    // Ticker-bearing companies: 15 listed, 5 private labs without ticker.
    const tickered = store.rows('research_entities').filter((e) => e.type === 'COMPANY' && e.ticker != null);
    expect(tickered).toHaveLength(15);
    const ax004 = store.rows('research_axioms').find((a) => a.code === 'AX004');
    expect(ax004!.severity).toBe('WARN');
  });
});
