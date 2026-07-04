import { describe, it, expect } from 'vitest';
import { buildSignalPrompt, validateSignalDrafts } from './signal-prompt';
import type { Entity, SourceDocument } from './types';

function src(id: string, over: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    source_type: 'GITHUB_RADAR',
    title: `Radar source ${id}`,
    url: null,
    author: null,
    published_at: '2026-07-04',
    ingested_at: '2026-07-04T08:00:00Z',
    raw_text: `raw text of ${id}`,
    content_hash: `hash-${id}`,
    trust_level: 'MEDIUM',
    entity_ids: [],
    ...over,
  };
}

function ent(id: string, name: string, over: Partial<Entity> = {}): Entity {
  return {
    id,
    type: 'COMPANY',
    name,
    aliases: [],
    ticker: null,
    description: null,
    metadata: {},
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('buildSignalPrompt', () => {
  it('injects the entity manifest (id + name + aliases) and source excerpts', () => {
    const entities = [
      ent('e1', 'NVIDIA', { aliases: ['NVDA', '英伟达'], ticker: 'NVDA' }),
      ent('e2', 'AI inference', { type: 'THEME' }),
    ];
    const sources = [src('s1'), src('s2')];
    const p = buildSignalPrompt(sources, entities);
    expect(p.user).toContain('NVIDIA');
    expect(p.user).toContain('NVDA, 英伟达');
    expect(p.user).toContain('AI inference');
    expect(p.user).toContain('raw text of s1');
    expect(p.user).toContain('raw text of s2');
    expect(p.user).toContain('- s1 |');
    expect(p.source_document_ids).toEqual(['s1', 's2']);
    expect(p.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('truncates each source to the per-source budget', () => {
    const long = src('s1', { raw_text: 'x'.repeat(5000) });
    const p = buildSignalPrompt([long], [], { perSourceChars: 2000 });
    expect(p.user).toContain('截断');
    expect(p.user.length).toBeLessThan(5000);
  });

  it('requires JSON object output with a signals array and 宁缺勿滥 guidance', () => {
    const p = buildSignalPrompt([src('s1')], []);
    expect(p.system).toContain('"signals"');
    expect(p.system).toContain('宁缺勿滥');
    expect(p.system).toContain('research_questions');
  });
});

describe('validateSignalDrafts', () => {
  const allowed = ['s1', 's2'];
  const good = {
    title: 'OpenRouter usage tooling matures',
    summary: 'CLI accumulates OpenRouter model usage into SQLite.',
    signal_type: 'MODEL_USAGE',
    direction: 'POSITIVE',
    confidence: 'MEDIUM',
    entity_names: ['NVIDIA'],
    affected_company_names: ['NVIDIA'],
    research_questions: ['Token share trend sustainable?'],
    source_ids: ['s1'],
  };

  it('accepts a valid draft from either a bare array or {signals: []}', () => {
    expect(validateSignalDrafts([good], allowed).drafts).toHaveLength(1);
    const r = validateSignalDrafts({ signals: [good] }, allowed);
    expect(r.drafts).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
    expect(r.drafts[0].title).toBe(good.title);
  });

  it('drops a signal citing source ids outside the prompt batch (anti-hallucination)', () => {
    const bad = { ...good, source_ids: ['s1', 'made-up-id'] };
    const r = validateSignalDrafts([bad], allowed);
    expect(r.drafts).toHaveLength(0);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].reason).toMatch(/source_ids/);
    expect(r.dropped[0].title).toBe(good.title);
  });

  it('drops signals with no source citations at all', () => {
    const r = validateSignalDrafts([{ ...good, source_ids: [] }], allowed);
    expect(r.drafts).toHaveLength(0);
    expect(r.dropped[0].reason).toMatch(/source_ids/);
  });

  it('drops signals with an invalid signal_type enum', () => {
    const r = validateSignalDrafts([{ ...good, signal_type: 'VIBES' }], allowed);
    expect(r.drafts).toHaveLength(0);
    expect(r.dropped[0].reason).toMatch(/signal_type/);
  });

  it('drops signals missing title/summary or research_questions (≥1 required)', () => {
    expect(validateSignalDrafts([{ ...good, title: ' ' }], allowed).dropped[0].reason)
      .toMatch(/title/);
    expect(validateSignalDrafts([{ ...good, summary: '' }], allowed).dropped[0].reason)
      .toMatch(/summary/);
    expect(validateSignalDrafts([{ ...good, research_questions: [] }], allowed).dropped[0].reason)
      .toMatch(/research_questions/);
  });

  it('normalizes invalid direction/confidence instead of dropping', () => {
    const r = validateSignalDrafts(
      [{ ...good, direction: 'SIDEWAYS', confidence: 'ABSOLUTE' }],
      allowed,
    );
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].direction).toBe('UNKNOWN');
    expect(r.drafts[0].confidence).toBe('LOW');
  });

  it('returns nothing for non-array garbage', () => {
    expect(validateSignalDrafts('not json', allowed).drafts).toHaveLength(0);
    expect(validateSignalDrafts(null, allowed).drafts).toHaveLength(0);
    expect(validateSignalDrafts({ signals: 'nope' }, allowed).drafts).toHaveLength(0);
  });
});
