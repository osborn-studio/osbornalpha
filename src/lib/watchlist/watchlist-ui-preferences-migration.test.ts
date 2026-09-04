import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904250000_watchlist_ui_preferences.sql', import.meta.url),
  'utf8',
);

describe('watchlist UI preferences migration', () => {
  it('adds a bounded versioned JSON object and release marker', () => {
    expect(migration).toContain('watchlist_ui_preferences jsonb');
    expect(migration).toContain('watchlist_ui_preferences_version integer');
    expect(migration).toContain("jsonb_typeof(watchlist_ui_preferences) = 'object'");
    expect(migration).toContain("octet_length(convert_to(watchlist_ui_preferences::text, 'UTF8')) <= 65536");
    expect(migration).toContain("values ('watchlist_ui_preferences')");
  });
});
