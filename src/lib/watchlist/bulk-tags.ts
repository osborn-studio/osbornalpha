export interface BulkTagCommand {
  items: Array<{ id: string; expected_version: number }>;
  tag: string;
  mode: 'add' | 'remove';
}

export function parseBulkTagCommand(value: unknown): BulkTagCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 200) return null;
  const items: BulkTagCommand['items'] = [];
  const ids = new Set<string>();
  for (const row of input.items) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const candidate = row as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !candidate.id.trim()
      || !Number.isInteger(candidate.expectedVersion) || Number(candidate.expectedVersion) < 0) return null;
    if (ids.has(candidate.id)) continue;
    ids.add(candidate.id);
    items.push({ id: candidate.id, expected_version: Number(candidate.expectedVersion) });
  }
  const tag = typeof input.tag === 'string' ? input.tag.trim() : '';
  if (!tag || tag.length > 32) return null;
  if (input.mode !== 'add' && input.mode !== 'remove') return null;
  return { items, tag, mode: input.mode };
}
