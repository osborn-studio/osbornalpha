import { describe, it, expect } from 'vitest';
import { buildMemoPrompt, validateMemoDraft } from './memo-prompt';
import type { Entity, SourceDocument } from './types';

const entity: Entity = {
  id: 'nvda-id',
  type: 'COMPANY',
  name: 'NVIDIA',
  ticker: 'NVDA',
  aliases: [],
  description: 'AI 芯片霸主',
  metadata: {},
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

function src(id: string, opts: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    source_type: 'NEWS',
    title: `Source ${id}`,
    ingested_at: '2026-07-01T00:00:00.000Z',
    raw_text: `body of ${id}`,
    content_hash: `hash-${id}`,
    trust_level: 'MEDIUM',
    entity_ids: [entity.id],
    ...opts,
  };
}

describe('buildMemoPrompt', () => {
  it('injects an id+title manifest and orders sources newest-first', () => {
    const older = src('old', { ingested_at: '2026-06-01T00:00:00.000Z' });
    const newer = src('new', { ingested_at: '2026-07-03T00:00:00.000Z' });
    const p = buildMemoPrompt({ entity, sources: [older, newer] });
    expect(p.source_document_ids).toEqual(['new', 'old']);
    expect(p.user).toContain('- new | NEWS | trust=MEDIUM | Source new');
    expect(p.user).toContain('- old |');
    expect(p.user.indexOf('<source id="new"')).toBeLessThan(p.user.indexOf('<source id="old"'));
  });

  it('prefers published_at over ingested_at for recency', () => {
    const a = src('a', { ingested_at: '2026-07-03T00:00:00.000Z', published_at: '2026-01-01T00:00:00.000Z' });
    const b = src('b', { ingested_at: '2026-06-01T00:00:00.000Z', published_at: '2026-07-02T00:00:00.000Z' });
    const p = buildMemoPrompt({ entity, sources: [a, b] });
    expect(p.source_document_ids).toEqual(['b', 'a']);
  });

  it('truncates long sources against the character budget', () => {
    const big = src('big', { raw_text: 'x'.repeat(10_000), ingested_at: '2026-07-03T00:00:00.000Z' });
    const small = src('small', { raw_text: 'small body', ingested_at: '2026-07-02T00:00:00.000Z' });
    const p = buildMemoPrompt({ entity, sources: [big, small], budgetChars: 800, perSourceChars: 800 });
    expect(p.user).toContain('…[截断');
    // Budget exhausted by the newest source; the older one is dropped from the corpus.
    expect(p.source_document_ids).toEqual(['big']);
    // With headroom, the smaller older source still makes it in.
    const roomy = buildMemoPrompt({ entity, sources: [big, small], budgetChars: 2_000, perSourceChars: 800 });
    expect(roomy.source_document_ids).toEqual(['big', 'small']);
  });

  it('embeds the user question and is hash-stable', () => {
    const p1 = buildMemoPrompt({ entity, sources: [src('s1')], question: 'inference margin pressure?' });
    const p2 = buildMemoPrompt({ entity, sources: [src('s1')], question: 'inference margin pressure?' });
    expect(p1.user).toContain('inference margin pressure?');
    expect(p1.prompt_sha256).toBe(p2.prompt_sha256);
    expect(p1.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    const p3 = buildMemoPrompt({ entity, sources: [src('s1')], question: 'different' });
    expect(p3.prompt_sha256).not.toBe(p1.prompt_sha256);
  });
});

describe('validateMemoDraft', () => {
  const allowed = ['s1', 's2'];

  it('keeps valid citations and strips unknown source ids', () => {
    const draft = validateMemoDraft({
      title: 'NVDA memo',
      one_line_conclusion: 'ok',
      thesis: 't',
      supporting_evidence: [
        { claim: 'cited fine', source_document_ids: ['s1'] },
        { claim: 'partially hallucinated', source_document_ids: ['s2', 'made-up-id'] },
      ],
      counter_arguments: [{ claim: 'bear case', source_document_ids: ['s2'] }],
      confidence: 'MEDIUM',
    }, allowed);
    expect(draft.supporting_evidence[0]).toEqual({ claim: 'cited fine', source_document_ids: ['s1'] });
    expect(draft.supporting_evidence[1].source_document_ids).toEqual(['s2']);
    expect(draft.supporting_evidence[1].low_confidence).toBeUndefined();
    expect(draft.confidence).toBe('MEDIUM');
  });

  it('marks uncited claims LOW_CONFIDENCE and mirrors them into open_questions', () => {
    const draft = validateMemoDraft({
      supporting_evidence: [{ claim: 'no source at all', source_document_ids: ['bogus'] }],
      open_questions: ['existing question'],
    }, allowed);
    expect(draft.supporting_evidence[0].low_confidence).toBe(true);
    expect(draft.supporting_evidence[0].source_document_ids).toEqual([]);
    expect(draft.open_questions).toEqual([
      'existing question',
      '需要为无来源结论找证据：no source at all',
    ]);
  });

  it('defaults malformed payloads safely (confidence LOW, empty arrays)', () => {
    const draft = validateMemoDraft({ confidence: 'ULTRA', key_variables: 'not-an-array' }, allowed);
    expect(draft.confidence).toBe('LOW');
    expect(draft.title).toBe('Untitled memo');
    expect(draft.key_variables).toEqual([]);
    expect(draft.supporting_evidence).toEqual([]);
    const fromNull = validateMemoDraft(null, allowed);
    expect(fromNull.confidence).toBe('LOW');
  });

  it('drops evidence items without a claim and trims strings', () => {
    const draft = validateMemoDraft({
      supporting_evidence: [
        { claim: '   ', source_document_ids: ['s1'] },
        'garbage',
        { claim: '  real claim  ', source_document_ids: ['s1'] },
      ],
      invalidation_conditions: ['  cond  ', ''],
    }, allowed);
    expect(draft.supporting_evidence).toHaveLength(1);
    expect(draft.supporting_evidence[0].claim).toBe('real claim');
    expect(draft.invalidation_conditions).toEqual(['cond']);
  });
});
