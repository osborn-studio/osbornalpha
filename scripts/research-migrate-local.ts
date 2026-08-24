/**
 * Research OS — one-shot local SQLite → production Supabase migration.
 *
 * ⚠️ RUN THIS **BEFORE** removing the better-sqlite3 dependency (chore: retire
 * sqlite). It lazily requires('better-sqlite3'), which must still be installed:
 *   RESEARCH_OWNER_USER_ID=<owner> npx tsx scripts/research-migrate-local.ts
 *
 * Reads all 12 tables from research-data/research.db and upserts them into the
 * research_* production tables via the service-role client, preserving ids and
 * writing user_id = RESEARCH_OWNER_USER_ID. jsonb columns are parsed from the
 * SQLite JSON-text into real objects. Idempotent (upsert onConflict 'id').
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import path from 'node:path';
import { getServiceResearchCtx } from '../src/lib/research/service';
import { isUuid } from '../src/lib/research/store';

const DB_PATH = path.resolve('research-data/research.db');

function j<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string') return (text ?? fallback) as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

type Row = Record<string, any>;
type Mapper = (row: Row, userId: string) => Row;

/** SQLite table → { prod table, row mapper }. Order respects FK dependencies. */
const TABLES: Array<{ sqlite: string; prod: string; map: Mapper }> = [
  {
    sqlite: 'entities', prod: 'research_entities',
    map: (r, user_id) => ({
      id: r.id, user_id, type: r.type, name: r.name,
      aliases: j(r.aliases, []), ticker: r.ticker ?? null,
      description: r.description ?? null, metadata: j(r.metadata, {}),
      created_at: r.created_at, updated_at: r.updated_at,
    }),
  },
  {
    sqlite: 'source_documents', prod: 'research_source_documents',
    map: (r, user_id) => ({
      id: r.id, user_id, source_type: r.source_type, title: r.title,
      url: r.url ?? null, author: r.author ?? null,
      published_at: r.published_at ?? null, ingested_at: r.ingested_at,
      raw_text: r.raw_text, content_hash: r.content_hash,
      trust_level: r.trust_level, entity_ids: j(r.entity_ids, []), metadata: {},
    }),
  },
  {
    sqlite: 'entity_relations', prod: 'research_entity_relations',
    map: (r, user_id) => ({
      id: r.id, user_id, from_entity: r.from_id, to_entity: r.to_id,
      relation_type: r.relation,
      metadata: { ...j(r.metadata, {}), ...(r.description ? { description: r.description } : {}) },
      created_at: r.created_at,
    }),
  },
  {
    sqlite: 'signals', prod: 'research_signals',
    map: (r, user_id) => ({
      id: r.id, user_id, title: r.title, summary: r.summary,
      signal_type: r.signal_type, direction: r.direction ?? 'UNKNOWN',
      confidence: r.confidence, entity_ids: j(r.entity_ids, []),
      source_document_ids: j(r.source_document_ids, []),
      affected_company_ids: j(r.affected_company_ids, []),
      research_questions: j(r.research_questions, []),
      metadata: {}, llm_provenance: {}, created_at: r.created_at,
    }),
  },
  {
    sqlite: 'memos', prod: 'research_memos',
    map: (r, user_id) => ({
      id: r.id, user_id, title: r.title,
      company_ids: j(r.company_ids, []), theme_ids: j(r.theme_ids, []),
      one_line_conclusion: r.one_line_conclusion, thesis: r.thesis,
      supporting_evidence: j(r.supporting_evidence, []),
      counter_arguments: j(r.counter_arguments, []),
      key_variables: j(r.key_variables, []),
      invalidation_conditions: j(r.invalidation_conditions, []),
      open_questions: j(r.open_questions, []),
      related_impacts: j(r.related_impacts, []),
      confidence: r.confidence, axiom_check_results: j(r.axiom_check_results, []),
      status: r.status, llm_provenance: j(r.provenance, {}),
      created_at: r.created_at, updated_at: r.updated_at,
    }),
  },
  {
    sqlite: 'theses', prod: 'research_theses',
    map: (r, user_id) => ({
      id: r.id, user_id, title: r.title, body: r.body,
      company_ids: j(r.company_ids, []), theme_ids: j(r.theme_ids, []),
      supporting_evidence_ids: j(r.supporting_evidence_ids, []),
      invalidation_conditions: j(r.invalidation_conditions, []),
      watch_metrics: j(r.watch_metrics, []), status: r.status,
      next_review_at: r.next_review_at ?? null, last_assessment: {},
      created_at: r.created_at, updated_at: r.updated_at,
    }),
  },
  {
    sqlite: 'thesis_events', prod: 'research_thesis_events',
    map: (r, user_id) => {
      // SQLite event_type NOTE has no prod equivalent → USER_ACTION. detail
      // (JSON text) + source_document_ids fold into the single jsonb detail.
      const kind = r.event_type === 'NOTE' ? 'USER_ACTION' : r.event_type;
      const detail = j<Record<string, unknown>>(r.detail, {});
      const sourceIds = j<string[]>(r.source_document_ids, []);
      return {
        id: r.id, user_id, thesis_id: r.thesis_id, kind,
        detail: sourceIds.length ? { ...detail, source_document_ids: sourceIds } : detail,
        created_at: r.created_at,
      };
    },
  },
  {
    sqlite: 'playbook_runs', prod: 'research_playbook_runs',
    map: (r, user_id) => ({
      id: r.id, user_id, memo_id: r.memo_id ?? null, thesis_id: r.thesis_id ?? null,
      proposed_action: r.proposed_action, rationale: r.rationale,
      risks: j(r.risks, []), axiom_results: [],
      approval_status: r.approval_status, human_decision: r.human_decision ?? null,
      review_at: r.review_at ?? null, created_at: r.created_at,
    }),
  },
  {
    sqlite: 'axioms', prod: 'research_axioms',
    map: (r, user_id) => ({
      id: r.id, user_id, code: r.code, title: r.title,
      description: r.description, rule: {}, severity: r.severity,
      active: !!r.enabled, created_at: r.created_at,
    }),
  },
  {
    sqlite: 'eval_cases', prod: 'research_eval_cases',
    map: (r, user_id) => ({
      id: r.id, user_id, title: r.title, as_of_date: r.as_of,
      visible_material: j(r.visible_material, []),
      expected: { output: r.expected_output ?? '', outcome: r.outcome ?? '' },
      rubric: j(r.rubric, {}), created_at: r.created_at,
    }),
  },
  {
    sqlite: 'eval_runs', prod: 'research_eval_runs',
    map: (r, user_id) => {
      const scores = j<Record<string, number>>(r.scores, {});
      const total = typeof scores.total === 'number' ? scores.total : null;
      return {
        id: r.id, user_id, case_id: r.case_id,
        agent_output: j(r.output, {}), scores,
        total_score: total, failure_modes: j(r.failure_modes, []),
        llm_provenance: {}, created_at: r.created_at,
      };
    },
  },
  {
    sqlite: 'audit_log', prod: 'research_audit_log',
    map: (r, user_id) => {
      const objectId = typeof r.target_id === 'string' && isUuid(r.target_id) ? r.target_id : null;
      const baseDetail = j<Record<string, unknown>>(r.detail, {});
      const detail = objectId === null && r.target_id
        ? { ...baseDetail, object_ref: r.target_id }
        : baseDetail;
      return {
        id: r.id, user_id, actor: r.actor === 'local-user' ? 'user' : (r.actor ?? 'user'),
        action: r.action, object_type: String(r.action).split('.')[0] || 'unknown',
        object_id: objectId, detail, created_at: r.created_at,
      };
    },
  },
];

async function main() {
  const ctx = getServiceResearchCtx();
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });

  console.log(`[migrate] source=${DB_PATH}  owner=${ctx.userId}`);
  for (const { sqlite, prod, map } of TABLES) {
    const rows = db.prepare(`select * from ${sqlite}`).all() as Row[];
    if (rows.length === 0) {
      console.log(`[migrate] ${sqlite} → ${prod}: 0 rows (skip)`);
      continue;
    }
    const payload = rows.map((r) => map(r, ctx.userId));
    const { error } = await ctx.supabase.from(prod).upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error(`[migrate] ✗ ${sqlite} → ${prod}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`[migrate] ✓ ${sqlite} → ${prod}: ${payload.length} rows upserted`);
    }
  }
  db.close();
  console.log('[migrate] done.');
}

void main();
