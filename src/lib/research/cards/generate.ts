/**
 * WP-A8 card generation: prompt → JSON draft → citation validation → axiom gate.
 * Every assertion must cite one of the card's evidence sources (source@version);
 * uncited assertions are dropped and counted. A card that fails a BLOCK axiom
 * is kept with status 'blocked' for audit and is never rendered as advice.
 */
import { createHash } from 'node:crypto';
import { checkCardAxioms, hasBlockingFailure } from '../axioms';
import type { LlmFn } from '../memos';
import { CARD_FIELDS, CARD_PENDING, type Axiom, type CardAssertion, type CardField, type ResearchCard, type SourceDocument, type Thesis } from '../types';
import type { EvidenceItem, ThesisEvidence } from './evidence';
import type { SelectedCard } from './select';

const EVIDENCE_CHARS = 1500;
const DIRECTION_LABEL = { support: '支持', counter: '反证' } as const;

export const CARD_SYSTEM_PROMPT = `你是研究助理，为一条投资 thesis 写一张"变化卡"。只依据给出的证据材料，不得引入证据之外的事实。
输出严格 JSON：{"title": string, "fields": {${CARD_FIELDS.map(f => `"${f}": [{"text": string, "source_ids": [string]}]`).join(', ')}}}。
七个字段依次是：变化与时间 / 盈利或竞争力传导 / 受益、受损标的与依据 / 市场可能低估什么 / 支持、反证、独立来源数与不确定性 / 下一步最值得核实的事实 / 数周与半年观察点。
每条断言必须在 source_ids 里引用至少一个给出的 source_id；证据不足的字段给空数组（系统会写"待研究"），不要编造。
不得给出买卖建议、仓位、目标价、止损止盈、做多做空；不得使用"必涨、保证、稳赚、无风险"。只写事实与推断，并区分二者。用中文。`;

export interface CardPromptInput { card: SelectedCard; thesis: Thesis; sources: SourceDocument[]; weekOf: string }
export interface CardPrompt { system: string; user: string; prompt_sha256: string; source_ids: string[] }

export function buildCardPrompt({ card, thesis, sources, weekOf }: CardPromptInput): CardPrompt {
  const byId = new Map(sources.map(s => [s.id, s]));
  const items = [...card.evidence.support, ...card.evidence.counter];
  const lines = items.map(e => {
    const s = byId.get(e.source_id);
    return `- ${e.source_id}@${e.source_version} [${DIRECTION_LABEL[e.direction]} · 来源类别 ${e.origin}${e.unfamiliar ? ' · 陌生来源' : ''}]\n  标题：${s?.title ?? ''}\n  正文：${(s?.raw_text ?? '').slice(0, EVIDENCE_CHARS)}`;
  });
  const pillars = (thesis.pillars ?? []).map(p => `  - ${p.text}${p.resolvable_by ? `（判定：${p.resolvable_by}）` : ''}`).join('\n') || '  （未填写）';
  const user = `本周：${weekOf}；卡片类型：${card.kind === 'counter' ? '反证/陌生来源卡（重点写反证与不确定性）' : '证据卡'}。
thesis：${thesis.title}
正文：${thesis.body}
支柱：
${pillars}
失效条件：${thesis.invalidation_conditions.join('；')}
观察指标：${thesis.watch_metrics.join('；')}
证据统计：支持 ${card.evidence.support.length} 条，反证 ${card.evidence.counter.length} 条，独立来源 ${card.evidence.independent_sources} 个。

证据材料（source_id@version）：
${lines.join('\n')}

请按 system 的 JSON 结构输出，source_ids 只能取上面的 source_id。`;
  const prompt_sha256 = createHash('sha256').update(CARD_SYSTEM_PROMPT + user, 'utf8').digest('hex');
  return { system: CARD_SYSTEM_PROMPT, user, prompt_sha256, source_ids: [...new Set(items.map(e => e.source_id))] };
}

export interface ValidatedDraft { title: string; fields: ResearchCard['fields']; assertions: CardAssertion[]; unsupported_dropped: number }

/** Keep only assertions that cite evidence sources; one assertion record per (assertion, source). */
export function validateCardDraft(draft: unknown, evidence: ThesisEvidence, fallbackTitle: string): ValidatedDraft {
  const byId = new Map<string, EvidenceItem>();
  for (const e of [...evidence.support, ...evidence.counter]) if (!byId.has(e.source_id)) byId.set(e.source_id, e);
  const d = draft && typeof draft === 'object' ? (draft as Record<string, unknown>) : {};
  const rawFields = d.fields && typeof d.fields === 'object' ? (d.fields as Record<string, unknown>) : {};
  const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim().slice(0, 200) : fallbackTitle;
  const fields = {} as ResearchCard['fields'];
  const assertions: CardAssertion[] = [];
  let unsupported_dropped = 0;
  let n = 0;
  for (const field of CARD_FIELDS) {
    const list = Array.isArray(rawFields[field]) ? (rawFields[field] as unknown[]) : [];
    const ids: string[] = [];
    for (const raw of list) {
      const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
      const text = a && typeof a.text === 'string' ? a.text.trim() : '';
      const cited = a && Array.isArray(a.source_ids) ? [...new Set(a.source_ids.filter((x): x is string => typeof x === 'string' && byId.has(x)))] : [];
      if (!text || cited.length === 0) { unsupported_dropped++; continue; }
      for (const source_id of cited) {
        const e = byId.get(source_id)!;
        const id = `a${++n}`;
        ids.push(id);
        assertions.push({ id, field: field as CardField, text, source_id, source_version: e.source_version, judgment_ids: [...e.judgment_ids] });
      }
    }
    fields[field] = ids.length ? ids : CARD_PENDING;
  }
  return { title, fields, assertions, unsupported_dropped };
}

export interface GenerateCardInput extends CardPromptInput { runId: string; llm: LlmFn; axioms: Axiom[]; excludedPrivate: number }

function uncertaintyNote(e: ThesisEvidence): string {
  const parts = [`${e.support.length} 条支持、${e.counter.length} 条反证、${e.independent_sources} 个独立来源`];
  if (e.independent_sources < 2) parts.push('独立来源不足 2 个，结论不确定');
  if (e.counter.length === 0) parts.push('本周未见反证，可能存在未覆盖的反面材料');
  if (e.unfamiliar_hosts.length) parts.push(`含陌生来源：${e.unfamiliar_hosts.join('、')}`);
  return parts.join('；');
}

/** Build one card (not persisted). Model failures degrade to an all-pending card; they never throw. */
export async function generateCard(input: GenerateCardInput): Promise<Omit<ResearchCard, 'id' | 'created_at'>> {
  const prompt = buildCardPrompt(input);
  let content = ''; let model = 'unavailable';
  try { const r = await input.llm({ system: prompt.system, user: prompt.user }); content = r.content; model = r.model; } catch (e) { model = `error:${e instanceof Error ? e.message : String(e)}`.slice(0, 200); }
  const { extractJson } = await import('@/lib/data/sources/llm');
  const draft = content ? extractJson(content) : null;
  const v = validateCardDraft(draft, input.card.evidence, input.thesis.title);
  const axiom_results = checkCardAxioms({ title: v.title, assertions: v.assertions }, input.axioms);
  const e = input.card.evidence;
  return {
    week_of: input.weekOf, thesis_id: input.thesis.id, kind: input.card.kind, title: v.title, fields: v.fields, assertions: v.assertions,
    evidence: { support: e.support.length, counter: e.counter.length, independent_sources: e.independent_sources, uncertainty: uncertaintyNote(e), excluded_private: input.excludedPrivate, unfamiliar_hosts: [...e.unfamiliar_hosts] },
    generation: { model, prompt_sha256: prompt.prompt_sha256, run_id: input.runId, generated_at: new Date().toISOString(), unsupported_dropped: v.unsupported_dropped },
    axiom_results, status: hasBlockingFailure(axiom_results) ? 'blocked' : 'generated',
  };
}
