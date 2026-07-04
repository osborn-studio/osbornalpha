/**
 * GitHub Radar ingest adapter (Research OS Phase 2, T1).
 *
 * Reads a github-research-agent day directory
 * (reports/<YYYY-MM-DD>/{report.md, cards/<owner>__<repo>.md}) and turns it
 * into GITHUB_RADAR source_documents:
 *   - report.md            → one source (the daily digest)
 *   - cards above the      → one source per card, full markdown kept verbatim
 *     relevance threshold    in raw_text (frontmatter included — schema v1/v2
 *                            has no source metadata column, so provenance
 *                            lives in raw_text + audit_log)
 * Re-runs are idempotent via the Phase 1 content_hash dedupe in ingestSource.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logAudit, type ResearchDb } from '../db';
import { ingestSource, SourceValidationError } from '../sources';

export interface ParsedCard {
  frontmatter: Record<string, string | number | boolean | string[]>;
  body: string;
}

/**
 * Hand-written YAML-subset parser for radar card frontmatter.
 * Supports exactly what the cards use: quoted/bare strings, numbers,
 * booleans, and inline arrays of quoted strings. Returns null when the text
 * has no complete `---` frontmatter block.
 */
export function parseCardMarkdown(text: string): ParsedCard | null {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const fmBlock = text.slice(text.indexOf('\n') + 1, end);
  const body = text.slice(end + '\n---'.length).replace(/^\r?\n/, '');

  const frontmatter: ParsedCard['frontmatter'] = {};
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    frontmatter[m[1]] = parseScalar(m[2].trim());
  }
  return { frontmatter, body };
}

function parseScalar(raw: string): string | number | boolean | string[] {
  if (raw.startsWith('[')) return parseInlineStringArray(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return unquote(raw);
  }
  return raw;
}

function unquote(raw: string): string {
  return raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

/** Parses `["a", "b: c", ...]` — double-quoted items, commas inside quotes safe. */
function parseInlineStringArray(raw: string): string[] {
  const items: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    items.push(m[1].replace(/\\(["\\])/g, '$1'));
  }
  return items;
}

export interface IngestRadarOpts {
  /** Cards below this relevance are skipped (spec default: 6). */
  minRelevance?: number;
}

export interface IngestRadarResult {
  day: string;
  inserted: number;
  duplicates: number;
  /** Cards seen but below minRelevance (or with unparseable frontmatter). */
  skippedLowRelevance: number;
  cardsSeen: number;
}

/**
 * Ingest one radar day directory. Idempotent: content_hash dedupe returns
 * duplicate counts instead of new rows. audit_log('source.ingest_radar').
 */
export function ingestRadarDay(
  db: ResearchDb,
  dayDir: string,
  opts: IngestRadarOpts = {},
): IngestRadarResult {
  const minRelevance = opts.minRelevance ?? 6;
  if (!fs.existsSync(dayDir) || !fs.statSync(dayDir).isDirectory()) {
    throw new SourceValidationError(`radar day directory not found: ${dayDir}`);
  }
  const day = path.basename(dayDir);

  let inserted = 0;
  let duplicates = 0;
  let skippedLowRelevance = 0;
  let cardsSeen = 0;

  const track = (r: { duplicate: boolean }) => {
    if (r.duplicate) duplicates += 1;
    else inserted += 1;
  };

  const reportPath = path.join(dayDir, 'report.md');
  if (fs.existsSync(reportPath)) {
    const rawText = fs.readFileSync(reportPath, 'utf8');
    track(
      ingestSource(db, {
        source_type: 'GITHUB_RADAR',
        title: `GitHub Radar 日报 ${day}`,
        raw_text: rawText,
        published_at: day,
        trust_level: 'MEDIUM',
      }),
    );
  }

  const cardsDir = path.join(dayDir, 'cards');
  if (fs.existsSync(cardsDir)) {
    const files = fs
      .readdirSync(cardsDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const file of files) {
      cardsSeen += 1;
      const rawText = fs.readFileSync(path.join(cardsDir, file), 'utf8');
      const parsed = parseCardMarkdown(rawText);
      const relevance = typeof parsed?.frontmatter.relevance === 'number'
        ? parsed.frontmatter.relevance
        : -1;
      if (!parsed || relevance < minRelevance) {
        skippedLowRelevance += 1;
        continue;
      }
      const fullName = typeof parsed.frontmatter.full_name === 'string'
        ? parsed.frontmatter.full_name
        : file.replace(/\.md$/, '').replace('__', '/');
      const oneLiner = typeof parsed.frontmatter.one_liner === 'string'
        ? parsed.frontmatter.one_liner
        : '';
      track(
        ingestSource(db, {
          source_type: 'GITHUB_RADAR',
          title: `Radar: ${fullName}${oneLiner ? ` — ${oneLiner}` : ''}`,
          url: `https://github.com/${fullName}`,
          raw_text: rawText,
          published_at: day,
          trust_level: 'MEDIUM',
        }),
      );
    }
  }

  logAudit(db, 'source.ingest_radar', null, {
    day,
    inserted,
    duplicates,
    skipped_low_relevance: skippedLowRelevance,
    cards_seen: cardsSeen,
    min_relevance: minRelevance,
  });
  return { day, inserted, duplicates, skippedLowRelevance, cardsSeen };
}
