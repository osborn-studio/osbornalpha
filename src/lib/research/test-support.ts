/**
 * In-memory Supabase mock for Research OS service tests (Phase 5).
 *
 * The production data-integrity guarantees (unique indexes, the source
 * immutability trigger, RLS) are enforced by the live Postgres schema and
 * verified by the T5 live smoke — NOT re-tested here. This mock exists only so
 * the service-logic tests (validation, state machines, axiom gating, prompt
 * assembly, score clamps, entity resolution, audit trails) can run against a
 * chainable query surface that records inserts/updates and resolves
 * seeded/echoed rows the same way supabase-js does.
 *
 * Supported query surface (all the research services use):
 *   from(t).select(cols)?.eq/.in/.or/.contains/.order/.limit … (await → {data,error})
 *   … .maybeSingle()            → {data: row|null, error}
 *   from(t).insert(row|rows)    (await → {error})
 *   from(t).update(patch).eq…   (await → {error})
 *   from(t).upsert(rows, {onConflict}) (await → {error})   [migration only]
 * jsonb columns hold real objects/arrays (no JSON strings), matching supabase-js.
 */

type Row = Record<string, any>;

export class MockStore {
  readonly tables = new Map<string, Row[]>();

  rows(table: string): Row[] {
    let t = this.tables.get(table);
    if (!t) {
      t = [];
      this.tables.set(table, t);
    }
    return t;
  }

  count(table: string): number {
    return this.rows(table).length;
  }

  /** Seed rows directly (deep-cloned so tests and store never alias). */
  seed(table: string, rows: Row[]): void {
    const t = this.rows(table);
    for (const r of rows) t.push(clone(r));
  }

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table);
  }
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

type Filter =
  | { kind: 'eq'; col: string; val: any }
  | { kind: 'in'; col: string; vals: any[] }
  | { kind: 'contains'; col: string; arr: any[] }
  | { kind: 'gte'; col: string; val: any }
  | { kind: 'lte'; col: string; val: any }
  | { kind: 'or'; clauses: Array<{ col: string; needle: string }> };

class QueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  static readonly MAX_ROWS = 1000;
  private orderAsc = true;
  private limitN: number | null = null;
  private pending: { op: 'insert' | 'update' | 'upsert'; payload: any } | null = null;
  private single = false;

  constructor(private store: MockStore, private table: string) {}

  select(_cols?: string): this {
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.pending = { op: 'insert', payload };
    return this;
  }

  update(patch: Row): this {
    this.pending = { op: 'update', payload: patch };
    return this;
  }

  upsert(payload: Row | Row[], _opts?: { onConflict?: string }): this {
    this.pending = { op: 'upsert', payload };
    return this;
  }

  eq(col: string, val: any): this {
    this.filters.push({ kind: 'eq', col, val });
    return this;
  }

  in(col: string, vals: any[]): this {
    this.filters.push({ kind: 'in', col, vals });
    return this;
  }

  contains(col: string, arr: any[]): this {
    this.filters.push({ kind: 'contains', col, arr });
    return this;
  }

  gte(col: string, val: any): this {
    this.filters.push({ kind: 'gte', col, val });
    return this;
  }

  lte(col: string, val: any): this {
    this.filters.push({ kind: 'lte', col, val });
    return this;
  }

  /** Handles the `company_ids.cs.["id"],theme_ids.cs.["id"]` PostgREST form. */
  or(expr: string): this {
    const clauses = expr.split(',').map((part) => {
      const m = part.match(/^([a-z_]+)\.cs\.(.+)$/i);
      if (!m) return { col: '', needle: '' };
      let needle = m[2];
      try {
        const parsed = JSON.parse(needle);
        needle = Array.isArray(parsed) ? String(parsed[0]) : String(parsed);
      } catch {
        needle = needle.replace(/^\[?"?|"?\]?$/g, '');
      }
      return { col: m[1], needle };
    });
    this.filters.push({ kind: 'or', clauses });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  /** PostgREST-style inclusive range; without it reads are capped like `max_rows = 1000`. */
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this.single = true;
    return this.exec();
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.kind === 'eq') return row[f.col] === f.val;
      if (f.kind === 'in') return f.vals.includes(row[f.col]);
      if (f.kind === 'gte') return row[f.col] >= f.val;
      if (f.kind === 'lte') return row[f.col] <= f.val;
      if (f.kind === 'contains') {
        const cell = row[f.col];
        return Array.isArray(cell) && f.arr.every((x) => cell.includes(x));
      }
      // or: at least one clause's jsonb-array column contains the needle
      return f.clauses.some((c) => {
        const cell = row[c.col];
        return Array.isArray(cell) && cell.includes(c.needle);
      });
    });
  }

  private async exec(): Promise<{ data: any; error: any }> {
    const table = this.store.rows(this.table);

    if (this.pending) {
      const { op, payload } = this.pending;
      if (op === 'insert') {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const r of rows) table.push(clone(r));
        return { data: null, error: null };
      }
      if (op === 'upsert') {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const r of rows) {
          const idx = table.findIndex((x) => x.id === r.id);
          if (idx >= 0) table[idx] = clone(r);
          else table.push(clone(r));
        }
        return { data: null, error: null };
      }
      // update: apply patch to every matching row
      for (const row of table) {
        if (this.matches(row)) Object.assign(row, clone(payload));
      }
      return { data: null, error: null };
    }

    // read
    let out = table.filter((r) => this.matches(r));
    if (this.orderCol) {
      const col = this.orderCol;
      out = [...out].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    if (this.rangeFrom !== null && this.rangeTo !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    else if (out.length > QueryBuilder.MAX_ROWS) out = out.slice(0, QueryBuilder.MAX_ROWS);
    out = clone(out);
    if (this.single) {
      return { data: out.length ? out[0] : null, error: null };
    }
    return { data: out, error: null };
  }
}

export interface MockCtx {
  supabase: { from(table: string): QueryBuilder };
  userId: string;
}

/**
 * Build a ResearchCtx backed by an in-memory store. Returns the ctx plus the
 * store so tests can seed fixtures and assert on persisted rows.
 * `seed` maps SQLite-era table names? No — use the production research_* names.
 */
export function makeMockCtx(
  seed: Record<string, Row[]> = {},
  userId = '00000000-0000-4000-8000-000000000001',
): { ctx: MockCtx; store: MockStore } {
  const store = new MockStore();
  for (const [table, rows] of Object.entries(seed)) {
    // Every seeded row is owned by the test user unless it already sets one.
    store.seed(
      table,
      rows.map((r) => ({ user_id: userId, ...r })),
    );
  }
  const ctx: MockCtx = { supabase: { from: (t: string) => store.from(t) }, userId };
  return { ctx, store };
}
