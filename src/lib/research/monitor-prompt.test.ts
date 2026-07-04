import { describe, it, expect } from 'vitest';
import { buildMonitorPrompt, validateMonitorVerdict } from './monitor-prompt';
import type { Signal, SourceDocument, Thesis } from './types';

function thesis(over: Partial<Thesis> = {}): Thesis {
  return {
    id: 'th-1',
    title: 'NVIDIA 推理需求可持续增长',
    body: '推理 token 经济学支撑数据中心 capex。',
    company_ids: [],
    theme_ids: [],
    supporting_evidence_ids: [],
    invalidation_conditions: ['token 单价跌破成本线'],
    watch_metrics: ['NVDA DC 营收 QoQ'],
    status: 'ACTIVE',
    next_review_at: '2026-07-18',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

function signal(id: string, over: Partial<Signal> = {}): Signal {
  return {
    id,
    title: `signal ${id}`,
    summary: `summary of ${id}`,
    signal_type: 'MODEL_USAGE',
    direction: 'POSITIVE',
    confidence: 'MEDIUM',
    entity_ids: [],
    source_document_ids: [],
    affected_company_ids: [],
    research_questions: ['q?'],
    metadata: {},
    llm_provenance: {},
    created_at: '2026-07-04T00:00:00Z',
    ...over,
  };
}

function source(id: string): SourceDocument {
  return {
    id,
    source_type: 'GITHUB_RADAR',
    title: `source ${id}`,
    url: null,
    author: null,
    published_at: '2026-07-04',
    ingested_at: '2026-07-04T08:00:00Z',
    raw_text: `raw text of ${id}`,
    content_hash: `hash-${id}`,
    trust_level: 'MEDIUM',
    entity_ids: [],
  };
}

describe('buildMonitorPrompt', () => {
  it('injects thesis (conditions + metrics), signal manifest, and source excerpts', () => {
    const p = buildMonitorPrompt({
      thesis: thesis(),
      signals: [signal('sig-1'), signal('sig-2')],
      sources: [source('src-1')],
    });
    expect(p.user).toContain('NVIDIA 推理需求可持续增长');
    expect(p.user).toContain('token 单价跌破成本线');
    expect(p.user).toContain('NVDA DC 营收 QoQ');
    expect(p.user).toContain('sig-1');
    expect(p.user).toContain('summary of sig-2');
    expect(p.user).toContain('raw text of src-1');
    expect(p.signal_ids).toEqual(['sig-1', 'sig-2']);
    expect(p.source_document_ids).toEqual(['src-1']);
    expect(p.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    // The system prompt demands the verdict JSON and forbids status changes.
    expect(p.system).toContain('SUPPORT');
    expect(p.system).toContain('cited_signal_ids');
    expect(p.system).toContain('NONE');
  });
});

describe('validateMonitorVerdict', () => {
  const allowed = ['sig-1', 'sig-2'];
  const good = {
    verdict: 'WEAKEN',
    rationale: 'New usage data suggests slower token growth.',
    cited_signal_ids: ['sig-1'],
    suggested_status: 'WATCH',
  };

  it('accepts a valid verdict', () => {
    const v = validateMonitorVerdict(good, allowed);
    expect(v).not.toBeNull();
    expect(v!.verdict).toBe('WEAKEN');
    expect(v!.cited_signal_ids).toEqual(['sig-1']);
    expect(v!.suggested_status).toBe('WATCH');
    expect(v!.dropped_cited_ids).toEqual([]);
  });

  it('returns null for garbage / invalid verdict enum', () => {
    expect(validateMonitorVerdict(null, allowed)).toBeNull();
    expect(validateMonitorVerdict('x', allowed)).toBeNull();
    expect(validateMonitorVerdict({ ...good, verdict: 'MAYBE' }, allowed)).toBeNull();
  });

  it('filters hallucinated cited_signal_ids and records them', () => {
    const v = validateMonitorVerdict(
      { ...good, cited_signal_ids: ['sig-1', 'fake-id'] },
      allowed,
    );
    expect(v!.cited_signal_ids).toEqual(['sig-1']);
    expect(v!.dropped_cited_ids).toEqual(['fake-id']);
  });

  it('forces NONE when a non-NONE verdict has no valid citations but signals were available', () => {
    const v = validateMonitorVerdict(
      { ...good, cited_signal_ids: ['fake-1', 'fake-2'] },
      allowed,
    );
    expect(v!.verdict).toBe('NONE');
    expect(v!.dropped_cited_ids).toEqual(['fake-1', 'fake-2']);
  });

  it('allows a non-NONE verdict with no citations when the batch had no signals (sources only)', () => {
    const v = validateMonitorVerdict({ ...good, cited_signal_ids: [] }, []);
    expect(v!.verdict).toBe('WEAKEN');
  });

  it('normalizes an invalid suggested_status to null', () => {
    const v = validateMonitorVerdict({ ...good, suggested_status: 'PANIC' }, allowed);
    expect(v!.suggested_status).toBeNull();
  });

  it('accepts NONE without rationale requirements', () => {
    const v = validateMonitorVerdict({ verdict: 'NONE' }, allowed);
    expect(v!.verdict).toBe('NONE');
    expect(v!.cited_signal_ids).toEqual([]);
  });
});
