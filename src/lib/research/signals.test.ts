import { describe, it, expect } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { upsertEntity } from './entities';
import { ingestSource } from './sources';
import {
  resolveEntityNames,
  listPendingSources,
  listSignals,
  extractSignals,
} from './signals';
import type { Entity } from './types';
import type { LlmFn } from './memos';

function ent(name: string, over: Partial<Entity> = {}): Entity {
  return {
    id: `id-${name}`,
    type: 'COMPANY',
    name,
    aliases: [],
    ticker: null,
    description: null,
    metadata: {},
    created_at: '',
    updated_at: '',
    ...over,
  };
}

describe('resolveEntityNames', () => {
  const entities = [
    ent('NVIDIA', { aliases: ['NVDA', '英伟达'] }),
    ent('AI inference', { id: 'id-theme', type: 'THEME' }),
    ent('Anthropic'),
  ];

  it('matches by name case-insensitively', () => {
    const r = resolveEntityNames(['nvidia', 'ANTHROPIC'], entities);
    expect(r.ids).toEqual(['id-NVIDIA', 'id-Anthropic']);
    expect(r.unmatched).toEqual([]);
  });

  it('matches by alias case-insensitively', () => {
    const r = resolveEntityNames(['nvda', '英伟达'], entities);
    expect(r.ids).toEqual(['id-NVIDIA']); // deduped
    expect(r.unmatched).toEqual([]);
  });

  it('collects unmatched names without inventing ids', () => {
    const r = resolveEntityNames(['NVIDIA', 'TotallyUnknown Corp'], entities);
    expect(r.ids).toEqual(['id-NVIDIA']);
    expect(r.unmatched).toEqual(['TotallyUnknown Corp']);
  });

  it('handles empty input', () => {
    expect(resolveEntityNames([], entities)).toEqual({ ids: [], unmatched: [] });
  });
});

// ---------------------------------------------------------------------------

function newCtx(): { ctx: ResearchCtx; store: MockStore } {
  return makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore };
}

async function seedSource(ctx: ResearchCtx, title: string, text: string): Promise<string> {
  const { id } = await ingestSource(ctx, {
    source_type: 'GITHUB_RADAR',
    title,
    raw_text: text,
    published_at: '2026-07-04',
  });
  return id;
}

function fakeLlm(payload: unknown): LlmFn {
  return async () => ({ content: JSON.stringify(payload), model: 'fake-model' });
}

describe('listPendingSources', () => {
  it('returns sources not yet cited by any signal, capped at the batch limit', async () => {
    const { ctx } = newCtx();
    const s1 = await seedSource(ctx, 'source one', 'text one');
    const s2 = await seedSource(ctx, 'source two', 'text two');
    expect((await listPendingSources(ctx)).map((s) => s.id).sort()).toEqual([s1, s2].sort());

    // Extract a signal citing s1 → s1 no longer pending.
    await extractSignals(ctx, fakeLlm({
      signals: [{
        title: 'sig', summary: 'sum', signal_type: 'DEVELOPER', direction: 'POSITIVE',
        confidence: 'LOW', entity_names: [], affected_company_names: [],
        research_questions: ['q?'], source_ids: [s1],
      }],
    }));
    expect((await listPendingSources(ctx)).map((s) => s.id)).toEqual([s2]);
  });
});

describe('extractSignals', () => {
  it('persists validated signals with resolved entities, metadata and llm_provenance', async () => {
    const { ctx, store } = newCtx();
    const nvidiaId = await upsertEntity(ctx, { type: 'COMPANY', name: 'NVIDIA', aliases: ['NVDA'], ticker: 'NVDA' });
    const themeId = await upsertEntity(ctx, { type: 'THEME', name: 'AI inference' });
    const s1 = await seedSource(ctx, 'radar card', 'NVIDIA inference demand rises');

    const result = await extractSignals(ctx, fakeLlm({
      signals: [{
        title: 'Inference demand accelerating',
        summary: 'Radar shows sustained inference tooling growth.',
        signal_type: 'MODEL_USAGE',
        direction: 'POSITIVE',
        confidence: 'MEDIUM',
        entity_names: ['nvda', 'AI inference', 'Unknown Startup'],
        affected_company_names: ['NVIDIA', 'MysteryCo'],
        research_questions: ['Is token growth durable?'],
        source_ids: [s1],
      }],
    }));

    expect(result.llm).toEqual({ source: 'llm', model: 'fake-model' });
    expect(result.created).toHaveLength(1);
    const sig = result.created[0];
    expect(sig.title).toBe('Inference demand accelerating');
    expect(sig.entity_ids).toEqual([nvidiaId, themeId]);
    expect(sig.affected_company_ids).toEqual([nvidiaId]);
    expect(sig.source_document_ids).toEqual([s1]);
    expect(sig.metadata.unmatched_names).toEqual(['Unknown Startup']);
    expect(sig.metadata.unmatched_company_names).toEqual(['MysteryCo']);
    expect(sig.llm_provenance.model).toBe('fake-model');
    expect(sig.llm_provenance.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sig.llm_provenance.generated_at).toBeTruthy();

    // audit trail
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'signal.extract');
    expect(audits).toHaveLength(1);
    const detail = audits[0].detail;
    expect(detail.created).toBe(1);
    expect(detail.model).toBe('fake-model');

    expect(await listSignals(ctx)).toHaveLength(1);
  });

  it('drops hallucinated-citation signals and records them in the audit detail', async () => {
    const { ctx, store } = newCtx();
    const s1 = await seedSource(ctx, 'radar card', 'some text');
    const result = await extractSignals(ctx, fakeLlm({
      signals: [
        {
          title: 'good', summary: 'ok', signal_type: 'DEVELOPER', direction: 'UNKNOWN',
          confidence: 'LOW', entity_names: [], affected_company_names: [],
          research_questions: ['q?'], source_ids: [s1],
        },
        {
          title: 'hallucinated', summary: 'cites unknown source', signal_type: 'DEVELOPER',
          direction: 'UNKNOWN', confidence: 'LOW', entity_names: [],
          affected_company_names: [], research_questions: ['q?'],
          source_ids: ['not-in-batch'],
        },
      ],
    }));
    expect(result.created).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].title).toBe('hallucinated');
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'signal.extract');
    const detail = audits[0].detail;
    expect(detail.dropped).toHaveLength(1);
    expect(detail.dropped[0].reason).toMatch(/outside prompt batch/);
  });

  it('counts skipped sources (in batch but uncited by any created signal)', async () => {
    const { ctx } = newCtx();
    const s1 = await seedSource(ctx, 'useful', 'text');
    await seedSource(ctx, 'useless', 'no value');
    const result = await extractSignals(ctx, fakeLlm({
      signals: [{
        title: 'sig', summary: 'sum', signal_type: 'PRODUCT', direction: 'MIXED',
        confidence: 'LOW', entity_names: [], affected_company_names: [],
        research_questions: ['q?'], source_ids: [s1],
      }],
    }));
    expect(result.sourcesProcessed).toBe(2);
    expect(result.skippedSources).toBe(1);
  });

  it('returns cleanly when there are no pending sources (no LLM call)', async () => {
    const { ctx } = newCtx();
    let called = 0;
    const llm: LlmFn = async () => { called += 1; return { content: '{"signals":[]}', model: 'x' }; };
    const result = await extractSignals(ctx, llm);
    expect(called).toBe(0);
    expect(result.created).toHaveLength(0);
    expect(result.sourcesProcessed).toBe(0);
    expect(result.llm.source).toBe('none');
  });

  it('maps LLM provider failure to a structured result (never throws)', async () => {
    const { ctx } = newCtx();
    await seedSource(ctx, 'a source', 'text');
    const failing: LlmFn = async () => { throw new Error('No LLM provider configured'); };
    const result = await extractSignals(ctx, failing);
    expect(result.created).toHaveLength(0);
    expect(result.llm.source).toBe('no-key');
  });

  it('maps unparseable LLM output to a structured error result', async () => {
    const { ctx } = newCtx();
    await seedSource(ctx, 'a source', 'text');
    const garbage: LlmFn = async () => ({ content: 'not json at all', model: 'x' });
    const result = await extractSignals(ctx, garbage);
    expect(result.created).toHaveLength(0);
    expect(result.llm.source).toBe('error');
  });
});
