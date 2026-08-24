/**
 * Investment axiom checker (Research OS Phase 1, spec §4.7).
 * Pure function — no DB, no IO — so every rule is trivially unit-testable.
 *
 * Seeded rules (src/lib/research/seed.ts AXIOM_SEEDS):
 *   AX001 BLOCK  memo without invalidation conditions cannot be REVIEWED
 *   AX002 BLOCK  fewer than 3 independent cited sources cannot be HIGH confidence
 *   AX003 BLOCK  memo without counter-arguments cannot enter review
 *   AX004 WARN   evidence backed only by a single LOW-trust source
 *   AX005 BLOCK  conclusions containing profit-promise language (必涨/保证/稳赚/无风险)
 */

import type {
  Axiom,
  AxiomCheckResult,
  EvidenceItem,
  InvestmentMemo,
  SourceDocument,
} from './types';

/** The memo fields the checker needs (works on drafts before they are saved). */
export type MemoForCheck = Pick<
  InvestmentMemo,
  | 'one_line_conclusion'
  | 'thesis'
  | 'supporting_evidence'
  | 'counter_arguments'
  | 'invalidation_conditions'
  | 'confidence'
>;

const PROMISE_PATTERN = /必涨|保证|稳赚|无风险/;

function citedSourceIds(memo: MemoForCheck): Set<string> {
  const ids = new Set<string>();
  for (const ev of [...memo.supporting_evidence, ...memo.counter_arguments]) {
    for (const id of ev.source_document_ids ?? []) ids.add(id);
  }
  return ids;
}

type RuleFn = (
  memo: MemoForCheck,
  sources: Map<string, SourceDocument>,
) => { passed: boolean; message: string };

const RULES: Record<string, RuleFn> = {
  AX001: (memo) => {
    const n = memo.invalidation_conditions.filter((c) => c.trim() !== '').length;
    return {
      passed: n >= 1,
      message: n >= 1
        ? `失效条件 ${n} 条`
        : '缺少失效条件：没有失效条件的 memo 不能进入 REVIEWED',
    };
  },
  AX002: (memo) => {
    if (memo.confidence !== 'HIGH') {
      return { passed: true, message: 'confidence 非 HIGH，不受独立引用数限制' };
    }
    const n = citedSourceIds(memo).size;
    return {
      passed: n >= 3,
      message: n >= 3
        ? `HIGH confidence 有 ${n} 个独立引用支撑`
        : `独立引用仅 ${n} 个（<3），不能标 HIGH confidence`,
    };
  },
  AX003: (memo) => {
    const n = memo.counter_arguments.filter((c) => c.claim?.trim()).length;
    return {
      passed: n >= 1,
      message: n >= 1
        ? `反方观点 ${n} 条`
        : '缺少反方观点：没有反方观点的 memo 不能进入审批',
    };
  },
  AX004: (memo, sources) => {
    const weak: string[] = [];
    const evidence: EvidenceItem[] = [...memo.supporting_evidence, ...memo.counter_arguments];
    for (const ev of evidence) {
      const ids = ev.source_document_ids ?? [];
      if (ids.length !== 1) continue;
      const src = sources.get(ids[0]);
      if (src && src.trust_level === 'LOW') weak.push(ev.claim);
    }
    return {
      passed: weak.length === 0,
      message: weak.length === 0
        ? '无单一 LOW-trust source 支撑的证据'
        : `以下证据仅依赖单一 LOW-trust source，需补充独立来源：${weak.map((c) => `「${c.slice(0, 40)}」`).join('、')}`,
    };
  },
  AX005: (memo) => {
    const text = `${memo.one_line_conclusion}\n${memo.thesis}`;
    const hit = text.match(PROMISE_PATTERN);
    return {
      passed: !hit,
      message: hit
        ? `结论含收益承诺话术「${hit[0]}」，直接阻断`
        : '无收益承诺话术',
    };
  },
};

/**
 * Run every enabled axiom with a known rule implementation against a memo.
 * Unknown/disabled axioms are skipped (forward-compatible with user-added rows).
 */
export function checkMemoAxioms(
  memo: MemoForCheck,
  sources: SourceDocument[],
  axioms: Axiom[],
): AxiomCheckResult[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const results: AxiomCheckResult[] = [];
  for (const axiom of axioms) {
    if (!axiom.enabled) continue;
    const rule = RULES[axiom.code];
    if (!rule) continue;
    const { passed, message } = rule(memo, sourceMap);
    results.push({ axiom_code: axiom.code, severity: axiom.severity, passed, message });
  }
  return results;
}

/** True when any BLOCK-severity axiom failed (gates review/approval). */
export function hasBlockingFailure(results: AxiomCheckResult[]): boolean {
  return results.some((r) => r.severity === 'BLOCK' && !r.passed);
}
