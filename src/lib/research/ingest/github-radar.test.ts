import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openTestDb } from '../db';
import { parseCardMarkdown, ingestRadarDay } from './github-radar';

// ---------------------------------------------------------------------------
// Real radar cards from github-research-agent/reports/2026-07-04/cards/,
// copied verbatim as fixtures (one relevance-0, one relevance-9, one mid-tier).

const CARD_GBRAIN = `---
full_name: "garrytan/gbrain"
one_liner: "Postgres-native personal knowledge brain with autonomous ingestion and hybrid RAG"
relevance: 9
related_directions: ["2. Agent infrastructure & orchestration", "3. Knowledge OS / personal knowledge graph"]
better_than_mine: true
better_why: "Production-grade hybrid RAG + self-wiring knowledge graph benchmarked at P@5 49.1% (+31.4pp vs. BM25-vector), 66 autonomous cron jobs, and a dream-cycle daemon — well ahead of the user's own vault-curator stack in eval rigor and orchestration maturity."
combo_innovation: true
combo_idea: "Wire gbrain's typed entity edges (works_at / invested_in / founded) into stock-monitor's company-research pipeline so investment agents receive pre-synthesized relationship context and gap analysis rather than raw search chunks."
maturity: "mature"
recommend: 8
---

**What it is.** GBrain is a Postgres-native (PGLite) personal knowledge brain written in TypeScript. It ingests meetings, emails, voice calls, and ideas; extracts typed entity graph edges without LLM calls; and runs 66 autonomous cron jobs to enrich, consolidate, and self-heal citations overnight.

**Why it matters to me.** The user's vault-curator cron already feeds into gbrain (Direction 3) — this is the production brain already running.

**Action.** Study \`test/subagent-aggregator.test.ts\` to extract the daemon orchestration primitives.
`;

const CARD_LIBARCHIVE = `---
full_name: "DHowett/libarchive"
one_liner: "Portable C library for reading and writing streaming archives"
relevance: 0
related_directions: []
better_than_mine: false
better_why: ""
combo_innovation: false
combo_idea: ""
maturity: "mature"
recommend: 0
---

**What it is.** A portable C library (and associated CLI tools: bsdtar, bsdcpio, bsdcat, bsdunzip) that reads and writes streaming archives across a wide range of formats.

**Why it matters to me.** It doesn't. libarchive is low-level C systems infrastructure for file compression and archiving.

**Action.** Ignore — zero signal against any active research direction.
`;

const CARD_ORDS = `---
full_name: "grapeot/open_router_data_scraper"
one_liner: "CLI that accumulates OpenRouter model token/request usage into SQLite"
relevance: 6
related_directions: ["4. AI supply-chain / market-structure research", "2. Agent infrastructure & orchestration"]
better_than_mine: false
better_why: ""
combo_innovation: true
combo_idea: "Wire daily ords archive runs into chokepoint-atlas or stock-monitor to use OpenRouter token-share shifts as a real-time LLM market-structure signal alongside equity/factor data."
maturity: "early"
recommend: 5
---

**What it is.** A Python CLI (\`ords\`) that scrapes OpenRouter's undocumented \`/api/frontend/v1/stats/model-activity\` endpoint on a schedule, deduplicates records by \`(permaslug, date, variant)\` into SQLite, and renders matplotlib dashboards.

**Why it matters to me.** OpenRouter's per-model token/request counts are the closest thing to a public "market share ticker" for LLM providers.

**Action.** Fork and add a weekly cron job that archives Top-50 models.
`;

const REPORT_MD = `# GitHub 关注社区研究报告 · 2026-07-04

> 关注 **47** 人，仓库共 **3024** 个 | 深度分析 **49** 个仓库

## 🎯 与我研究方向相关的仓库

- **[garrytan/gbrain](https://github.com/garrytan/gbrain)** · 相关度 9/10 · 推荐 8/10 — Postgres-native personal knowledge brain
`;

describe('parseCardMarkdown', () => {
  it('parses a real high-relevance card (strings, numbers, bools, string arrays)', () => {
    const parsed = parseCardMarkdown(CARD_GBRAIN);
    expect(parsed).not.toBeNull();
    const fm = parsed!.frontmatter;
    expect(fm.full_name).toBe('garrytan/gbrain');
    expect(fm.one_liner).toBe(
      'Postgres-native personal knowledge brain with autonomous ingestion and hybrid RAG',
    );
    expect(fm.relevance).toBe(9);
    expect(fm.recommend).toBe(8);
    expect(fm.better_than_mine).toBe(true);
    expect(fm.combo_innovation).toBe(true);
    expect(fm.maturity).toBe('mature');
    expect(fm.related_directions).toEqual([
      '2. Agent infrastructure & orchestration',
      '3. Knowledge OS / personal knowledge graph',
    ]);
    expect(parsed!.body).toContain('**What it is.** GBrain is a Postgres-native');
    expect(parsed!.body).not.toContain('full_name:');
  });

  it('parses a real relevance-0 card with empty arrays and empty strings', () => {
    const parsed = parseCardMarkdown(CARD_LIBARCHIVE);
    expect(parsed).not.toBeNull();
    const fm = parsed!.frontmatter;
    expect(fm.full_name).toBe('DHowett/libarchive');
    expect(fm.relevance).toBe(0);
    expect(fm.better_than_mine).toBe(false);
    expect(fm.better_why).toBe('');
    expect(fm.related_directions).toEqual([]);
  });

  it('handles quoted strings containing colons, parens, and escaped content', () => {
    const parsed = parseCardMarkdown(CARD_ORDS);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.combo_idea).toContain('chokepoint-atlas or stock-monitor');
    expect(parsed!.frontmatter.related_directions).toEqual([
      '4. AI supply-chain / market-structure research',
      '2. Agent infrastructure & orchestration',
    ]);
  });

  it('returns null when there is no frontmatter block', () => {
    expect(parseCardMarkdown('# just a heading\n\nbody text')).toBeNull();
    expect(parseCardMarkdown('')).toBeNull();
    expect(parseCardMarkdown('---\nunclosed frontmatter')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ingestRadarDay against a synthetic day directory built from real fixtures.

function makeDayDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const dayDir = path.join(root, '2026-07-04');
  fs.mkdirSync(path.join(dayDir, 'cards'), { recursive: true });
  fs.writeFileSync(path.join(dayDir, 'report.md'), REPORT_MD);
  fs.writeFileSync(path.join(dayDir, 'cards', 'garrytan__gbrain.md'), CARD_GBRAIN);
  fs.writeFileSync(path.join(dayDir, 'cards', 'DHowett__libarchive.md'), CARD_LIBARCHIVE);
  fs.writeFileSync(path.join(dayDir, 'cards', 'grapeot__open_router_data_scraper.md'), CARD_ORDS);
  return dayDir;
}

describe('ingestRadarDay', () => {
  it('ingests the report + cards above the relevance threshold', () => {
    const db = openTestDb();
    const result = ingestRadarDay(db, makeDayDir());
    // report.md + gbrain (9) + ords (6, = default minRelevance 6); libarchive (0) skipped.
    expect(result.day).toBe('2026-07-04');
    expect(result.inserted).toBe(3);
    expect(result.duplicates).toBe(0);
    expect(result.skippedLowRelevance).toBe(1);

    const sources = db.prepare(`select * from source_documents order by title`).all();
    expect(sources).toHaveLength(3);
    const report = sources.find((s: any) => s.title === 'GitHub Radar 日报 2026-07-04');
    expect(report).toBeTruthy();
    expect(report.source_type).toBe('GITHUB_RADAR');
    expect(report.published_at).toBe('2026-07-04');
    expect(report.trust_level).toBe('MEDIUM');

    const gbrain = sources.find((s: any) => s.title.startsWith('Radar: garrytan/gbrain'));
    expect(gbrain.title).toBe(
      'Radar: garrytan/gbrain — Postgres-native personal knowledge brain with autonomous ingestion and hybrid RAG',
    );
    expect(gbrain.url).toBe('https://github.com/garrytan/gbrain');
    // Card raw_text keeps the full markdown (frontmatter preserved verbatim).
    expect(gbrain.raw_text).toContain('relevance: 9');
    db.close();
  });

  it('respects a custom minRelevance', () => {
    const db = openTestDb();
    const result = ingestRadarDay(db, makeDayDir(), { minRelevance: 8 });
    // report + gbrain only; ords (6) and libarchive (0) below threshold.
    expect(result.inserted).toBe(2);
    expect(result.skippedLowRelevance).toBe(2);
    db.close();
  });

  it('is idempotent across re-runs via content_hash', () => {
    const db = openTestDb();
    const dayDir = makeDayDir();
    const first = ingestRadarDay(db, dayDir);
    expect(first.inserted).toBe(3);
    const second = ingestRadarDay(db, dayDir);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(3);
    const count = db.prepare(`select count(*) c from source_documents`).get() as { c: number };
    expect(count.c).toBe(3);
    db.close();
  });

  it('writes an audit_log entry with day + counts', () => {
    const db = openTestDb();
    ingestRadarDay(db, makeDayDir());
    const rows = db
      .prepare(`select * from audit_log where action = 'source.ingest_radar'`)
      .all();
    expect(rows).toHaveLength(1);
    const detail = JSON.parse(rows[0].detail);
    expect(detail.day).toBe('2026-07-04');
    expect(detail.inserted).toBe(3);
    expect(detail.duplicates).toBe(0);
    db.close();
  });

  it('throws a validation error for a missing day directory', () => {
    const db = openTestDb();
    expect(() => ingestRadarDay(db, '/nonexistent/2026-01-01')).toThrow(/day directory/i);
    db.close();
  });
});
