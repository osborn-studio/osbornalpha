import { describe, expect, it, vi } from 'vitest';
import { readAllPages, type PagedQuery } from './reconcile';

function queryFor<T>(rows: T[], errorAtPage = -1) {
  let page = 0;
  return vi.fn(() => ({
    range(from: number, to: number) {
      const currentPage = page;
      page += 1;
      return Promise.resolve({
        data: rows.slice(from, to + 1),
        error: currentPage === errorAtPage ? { code: 'read_failed' } : null,
      }) as unknown as PagedQuery<T>;
    },
  } as PagedQuery<T>));
}

describe('readAllPages', () => {
  it('reads beyond the PostgREST 1000-row response limit', async () => {
    const rows = Array.from({ length: 2_305 }, (_, id) => ({ id }));
    const buildQuery = queryFor(rows);
    await expect(readAllPages(buildQuery)).resolves.toEqual(rows);
    expect(buildQuery).toHaveBeenCalledTimes(3);
  });

  it('fails closed when any page cannot be read', async () => {
    const rows = Array.from({ length: 1_100 }, (_, id) => ({ id }));
    await expect(readAllPages(queryFor(rows, 1))).rejects.toThrow('Unable to read reconciliation inputs.');
  });
});
