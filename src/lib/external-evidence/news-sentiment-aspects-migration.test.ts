import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904310000_news_sentiment_aspects.sql', import.meta.url),
  'utf8',
);

describe('news sentiment aspects migration', () => {
  it('persists bounded explainability fields', () => {
    expect(migration).toContain('sentiment_confidence numeric not null default 0');
    expect(migration).toContain('sentiment_language text not null');
    expect(migration).toContain("sentiment_aspects jsonb not null default '{}'::jsonb");
    expect(migration).toContain("sentiment_language in ('en', 'zh', 'mixed', 'unknown')");
    expect(migration).toContain("values ('news_sentiment_aspects')");
  });
});
