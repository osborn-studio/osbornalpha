const PAGE_SIZE = 1000;

export interface PagedQueryResult<T> {
  data: T[] | null;
  error: unknown;
}

export interface PagedQuery<T> extends PromiseLike<PagedQueryResult<T>> {
  range(from: number, to: number): PagedQuery<T>;
}

export async function readAllPages<T>(buildQuery: () => PagedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('Unable to read reconciliation inputs.');
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
