/**
 * Research OS — daily pipeline. Run locally with:
 *   RESEARCH_OS_ENABLED=1 npx tsx scripts/research-daily.ts
 *
 * ingest latest radar day → extract signals (LLM) → monitor all
 * ACTIVE/WATCH/AT_RISK theses (LLM, pending alerts only — human adjudicates
 * in /research/theses) → console digest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/lib/research/db';
import { ingestRadarDay } from '../src/lib/research/ingest/github-radar';
import { extractSignals } from '../src/lib/research/signals';
import { monitorAllTheses, listPendingAlerts } from '../src/lib/research/monitor';

const DEFAULT_REPORTS_ROOT =
  '/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/github-research-agent/reports';

function latestDayDir(root: string): string | null {
  if (!fs.existsSync(root)) return null;
  const days = fs
    .readdirSync(root)
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && fs.statSync(path.join(root, n)).isDirectory())
    .sort();
  return days.length ? path.join(root, days[days.length - 1]) : null;
}

async function main() {
  if (process.env.RESEARCH_OS_ENABLED !== '1') {
    // Convenience: the daily script is inherently local-only, so enable inline.
    process.env.RESEARCH_OS_ENABLED = '1';
  }
  const db = getDb();

  // 1. Ingest the latest radar day.
  const root = process.env.RADAR_REPORTS_DIR ?? DEFAULT_REPORTS_ROOT;
  const dayDir = latestDayDir(root);
  if (dayDir) {
    const r = ingestRadarDay(db, dayDir);
    console.log(
      `[research-daily] ingest ${r.day}: inserted=${r.inserted} duplicates=${r.duplicates} ` +
      `skipped_low_relevance=${r.skippedLowRelevance}`,
    );
  } else {
    console.log(`[research-daily] no radar day directory found under ${root} — skipping ingest`);
  }

  // 2. Extract signals from pending sources.
  const extraction = await extractSignals(db);
  if (extraction.llm.source === 'llm' || extraction.llm.source === 'none') {
    console.log(
      `[research-daily] signals: created=${extraction.created.length} ` +
      `dropped=${extraction.dropped.length} skippedSources=${extraction.skippedSources}`,
    );
    for (const s of extraction.created) {
      console.log(`  + [${s.signal_type}/${s.direction}] ${s.title}`);
    }
  } else {
    console.log(`[research-daily] signal extraction failed (${extraction.llm.source}): ${extraction.llm.message}`);
  }

  // 3. Monitor all ACTIVE / WATCH / AT_RISK theses (pending alerts only).
  const results = await monitorAllTheses(db);
  const alerts = results.filter((r) => r.event !== null);
  console.log(`[research-daily] monitor: theses=${results.length} new_alerts=${alerts.length}`);
  for (const r of alerts) {
    console.log(`  ⚠ ${r.verdict} on thesis ${r.thesis_id} (event ${r.event!.id})`);
  }

  // 4. Digest.
  const pending = listPendingAlerts(db);
  console.log(
    `[research-daily] done. pending alerts total=${pending.length} — 去 /research 裁决（系统不会自动改 thesis 状态）`,
  );
}

void main();
