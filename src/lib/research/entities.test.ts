import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb, type ResearchDb } from './db';
import { upsertEntity, getEntity, listEntities } from './entities';
import { seedResearchData, COMPANY_SEEDS, THEME_SEEDS, AXIOM_SEEDS } from './seed';

let db: ResearchDb;
beforeEach(() => {
  db = openTestDb();
});

describe('upsertEntity', () => {
  it('inserts then updates by (type, lower(name)) without duplicating', () => {
    const id1 = upsertEntity(db, { type: 'COMPANY', name: 'NVIDIA', ticker: 'NVDA' });
    const id2 = upsertEntity(db, { type: 'COMPANY', name: 'nvidia', ticker: 'NVDA', description: 'updated' });
    expect(id2).toBe(id1);
    expect(db.prepare('select count(*) c from entities').get().c).toBe(1);
    expect(getEntity(db, id1)!.description).toBe('updated');
  });

  it('same name under different type is a distinct entity', () => {
    const company = upsertEntity(db, { type: 'COMPANY', name: 'Power' });
    const theme = upsertEntity(db, { type: 'THEME', name: 'Power' });
    expect(company).not.toBe(theme);
    expect(db.prepare('select count(*) c from entities').get().c).toBe(2);
  });
});

describe('listEntities', () => {
  it('filters by type and case-insensitive q over name/ticker', () => {
    seedResearchData(db);
    const companies = listEntities(db, { type: 'COMPANY' });
    expect(companies).toHaveLength(COMPANY_SEEDS.length);
    const nvda = listEntities(db, { type: 'COMPANY', q: 'nvda' });
    expect(nvda).toHaveLength(1);
    expect(nvda[0].name).toBe('NVIDIA');
    const themes = listEntities(db, { type: 'THEME' });
    expect(themes).toHaveLength(THEME_SEEDS.length);
  });
});

describe('seedResearchData', () => {
  it('is idempotent across runs (entities and axioms)', () => {
    seedResearchData(db);
    seedResearchData(db);
    expect(db.prepare('select count(*) c from entities').get().c)
      .toBe(COMPANY_SEEDS.length + THEME_SEEDS.length);
    expect(db.prepare('select count(*) c from axioms').get().c).toBe(AXIOM_SEEDS.length);
    // Ticker-bearing companies: 15 listed, 5 private labs without ticker.
    expect(db.prepare(`select count(*) c from entities where type='COMPANY' and ticker is not null`).get().c).toBe(15);
    expect(db.prepare(`select severity from axioms where code='AX004'`).get().severity).toBe('WARN');
  });
});
