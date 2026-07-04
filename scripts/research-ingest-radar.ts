/**
 * Research OS — GitHub Radar ingest script. Run locally with:
 *   RESEARCH_OS_ENABLED=1 npx tsx scripts/research-ingest-radar.ts [dayDir]
 *   RESEARCH_OS_ENABLED=1 npx tsx scripts/research-ingest-radar.ts --all
 *
 * With no args (or --all) it scans every YYYY-MM-DD directory under the
 * radar reports root (env RADAR_REPORTS_DIR, default: the local
 * github-research-agent reports directory) and ingests each day.
 * Idempotent: re-runs count duplicates instead of inserting.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/lib/research/db';
import { ingestRadarDay } from '../src/lib/research/ingest/github-radar';

const DEFAULT_REPORTS_ROOT =
  '/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/github-research-agent/reports';

function main() {
  if (process.env.RESEARCH_OS_ENABLED !== '1') {
    // Convenience: the ingest script is inherently local-only, so enable inline.
    process.env.RESEARCH_OS_ENABLED = '1';
  }
  const arg = process.argv[2];
  const root = process.env.RADAR_REPORTS_DIR ?? DEFAULT_REPORTS_ROOT;

  const dayDirs: string[] = [];
  if (arg && arg !== '--all') {
    dayDirs.push(path.resolve(arg));
  } else {
    if (!fs.existsSync(root)) {
      console.error(`[research-ingest-radar] reports root not found: ${root}`);
      process.exit(1);
    }
    for (const name of fs.readdirSync(root).sort()) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(name) && fs.statSync(path.join(root, name)).isDirectory()) {
        dayDirs.push(path.join(root, name));
      }
    }
  }
  if (dayDirs.length === 0) {
    console.error('[research-ingest-radar] no day directories to ingest');
    process.exit(1);
  }

  const db = getDb();
  let inserted = 0;
  let duplicates = 0;
  for (const dayDir of dayDirs) {
    const r = ingestRadarDay(db, dayDir);
    inserted += r.inserted;
    duplicates += r.duplicates;
    console.log(
      `[research-ingest-radar] ${r.day}: inserted=${r.inserted} duplicates=${r.duplicates} ` +
      `skipped_low_relevance=${r.skippedLowRelevance} cards_seen=${r.cardsSeen}`,
    );
  }
  console.log(
    `[research-ingest-radar] done: days=${dayDirs.length} inserted=${inserted} duplicates=${duplicates}`,
  );
}

main();
