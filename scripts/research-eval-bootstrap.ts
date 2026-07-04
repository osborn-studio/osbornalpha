/**
 * Research OS eval case bootstrap (Phase 4) — run locally with:
 *   RESEARCH_OS_ENABLED=1 npx tsx scripts/research-eval-bootstrap.ts
 *
 * Creates 2 immediately runnable eval cases from what is already in the
 * library (idempotent — existing case titles are skipped):
 *   ① NVIDIA 2026Q1 财报后判断 — the 5 Phase 1 NVIDIA sources
 *   ② AI infra 开源生态信号解读 — top-5 GitHub Radar cards by relevance
 */

import { getDb, type ResearchDb } from '../src/lib/research/db';
import { createEvalCase } from '../src/lib/research/evals';
import { readJson, type SourceDocument } from '../src/lib/research/types';

interface SourceRow extends Omit<SourceDocument, 'entity_ids'> { entity_ids: string }

function rows(db: ResearchDb, sql: string, ...args: unknown[]): SourceRow[] {
  return db.prepare(sql).all(...args) as SourceRow[];
}

/** Earliest known date of the material set: published_at, else ingested_at. */
function earliestDate(sources: SourceRow[]): string {
  const dates = sources
    .map((s) => s.published_at || s.ingested_at)
    .filter((d): d is string => !!d)
    .sort();
  return (dates[0] ?? new Date().toISOString()).slice(0, 10);
}

function caseExists(db: ResearchDb, title: string): boolean {
  return !!db.prepare(`select 1 from eval_cases where title = ?`).get(title);
}

/** Radar cards carry `relevance: N` in their frontmatter-style raw_text. */
function radarRelevance(rawText: string): number {
  const m = rawText.match(/relevance:\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function main() {
  if (process.env.RESEARCH_OS_ENABLED !== '1') {
    // Convenience: the bootstrap is inherently local-only, so enable inline.
    process.env.RESEARCH_OS_ENABLED = '1';
  }
  const db = getDb();
  let created = 0;

  // ── Case ①: NVIDIA 2026Q1 财报后判断 ────────────────────────────────────
  const title1 = 'NVIDIA 2026Q1 财报后判断';
  if (caseExists(db, title1)) {
    console.log(`[eval-bootstrap] skip（已存在）: ${title1}`);
  } else {
    // The Phase 1 NVIDIA material set: sources linked to the NVIDIA entity,
    // falling back to a title match for libraries seeded before entity links.
    const nvidiaEntity = db
      .prepare(`select id from entities where name = 'NVIDIA' limit 1`)
      .get() as { id: string } | undefined;
    const all = rows(db, `select * from source_documents order by ingested_at asc`);
    let nvidiaSources = nvidiaEntity
      ? all.filter((s) => readJson<string[]>(s.entity_ids, []).includes(nvidiaEntity.id))
      : [];
    if (nvidiaSources.length === 0) {
      const patterns = [/NVIDIA/i, /Blackwell/i, /ASIC/i, /Inference economics/i];
      nvidiaSources = all.filter((s) => patterns.some((p) => p.test(s.title)));
    }
    if (nvidiaSources.length === 0) {
      console.warn(`[eval-bootstrap] ⚠️ 找不到 NVIDIA sources，跳过案例①（先跑 Phase 1 导入）`);
    } else {
      const c = createEvalCase(db, {
        title: title1,
        as_of_date: earliestDate(nvidiaSources),
        source_document_ids: nvidiaSources.map((s) => s.id),
        expected_notes:
          '【请补齐真实后续】记录 2026Q1 财报之后实际发生的事件：下季度 DC 营收/指引、' +
          'Blackwell 出货与供应链进展、中国出口管制影响、股价与一致预期的变化。' +
          '补得越具体，评审的事实对照维度越有效。',
      });
      console.log(`[eval-bootstrap] ✅ 创建案例①: ${c.title} (as_of ${c.as_of}, ${c.visible_material.length} 份材料) id=${c.id}`);
      created += 1;
    }
  }

  // ── Case ②: AI infra 开源生态信号解读 ───────────────────────────────────
  const title2 = 'AI infra 开源生态信号解读';
  if (caseExists(db, title2)) {
    console.log(`[eval-bootstrap] skip（已存在）: ${title2}`);
  } else {
    const radarCards = rows(
      db,
      `select * from source_documents where source_type = 'GITHUB_RADAR' and title like 'Radar:%'`,
    )
      .sort((a, b) => radarRelevance(b.raw_text) - radarRelevance(a.raw_text))
      .slice(0, 5);
    if (radarCards.length === 0) {
      console.warn(`[eval-bootstrap] ⚠️ 找不到 GitHub Radar 卡片 sources，跳过案例②（先跑 scripts/research-ingest-radar.ts）`);
    } else {
      const c = createEvalCase(db, {
        title: title2,
        as_of_date: earliestDate(radarCards),
        source_document_ids: radarCards.map((s) => s.id),
        expected_notes:
          '【请补齐真实后续】记录这些开源项目/方向随后的演化：star 与社区增长是否兑现、' +
          '是否被大厂吸收或商业化、对应上市公司（算力/工具链）是否出现可交易的信号。',
      });
      console.log(`[eval-bootstrap] ✅ 创建案例②: ${c.title} (as_of ${c.as_of}, ${c.visible_material.length} 份材料) id=${c.id}`);
      created += 1;
    }
  }

  const totals = db.prepare(`select count(*) c from eval_cases`).get() as { c: number };
  console.log(`[eval-bootstrap] 完成：本次新建 ${created} 个案例，库中共 ${totals.c} 个。`);
  console.log(
    `[eval-bootstrap] 📌 用户第 4 周任务（spec §7.3）：把评测案例补齐至 20 个——` +
    `每个案例选一个历史时间点 + 当时可见材料，并在 expected notes 里写清真实后续事件。`,
  );
}

main();
