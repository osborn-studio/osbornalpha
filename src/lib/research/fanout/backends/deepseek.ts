/**
 * llm_deepseek backend: the existing chat LLM answers the whole question set
 * for one material × all theses in a single JSON response. Bad or missing
 * pieces become abstentions; a transport failure skips the backend.
 */
import { digest } from '../../ingest/pa-v1/json.js';
import type { LlmFn } from '../../memos';
import { QUESTIONS, QUESTION_SET_VERSION } from '../questions';
import { abstention, decided, estimateTokens, microsForTokens, parseDistribution } from './shared';
import type { BackendAnswer, BackendResult, FanoutBackend, FanoutInput } from './types';

const MATERIAL_CHARS = 12_000;
export const DEEPSEEK_DEFAULT_MICROS_PER_1K = 280;

const SYSTEM = `你是一名严谨的行业研究助理，负责按固定问题集为"一份材料 × 多条投资 thesis"给出概率分布。
硬性规则：
1. 只依据给出的材料正文与 thesis 支柱/失效条件判断，不引入外部知识。
2. 每个问题输出该问题全部选项的概率，概率之和为 1；不确定时把概率分散，不要编造。
3. 你不改变任何 thesis 状态，也不给出任何操作结论。
4. 只输出严格 JSON（不要 markdown code fence）：
{"Q3": {<Q3 各选项: 概率>}, "theses": {"<thesis_id>": {"Q1": {"true": p, "false": p}, "Q2": {<Q2 各选项>}, "Q4": {<Q4 各选项>}${''}}}}
问题集 ${QUESTION_SET_VERSION}：
Q1（noul）${QUESTIONS.Q1.instructions} 选项 ${QUESTIONS.Q1.options.join('/')}
Q2（choice）${QUESTIONS.Q2.instructions} 选项 ${QUESTIONS.Q2.options.map(o => `${o}=${QUESTIONS.Q2.criteria[o]}`).join('；')}
Q3（choice，材料级，只答一次）${QUESTIONS.Q3.instructions} 选项 ${QUESTIONS.Q3.options.map(o => `${o}=${QUESTIONS.Q3.criteria[o]}`).join('；')}
Q4（choice）${QUESTIONS.Q4.instructions} 选项 ${QUESTIONS.Q4.options.map(o => `${o}=${QUESTIONS.Q4.criteria[o]}`).join('；')}
Q5（noul，仅当提供"簇内最早材料"时回答）${QUESTIONS.Q5.instructions}`;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[截断，原文 ${text.length} 字符]`;
}

export function buildFanoutPrompt(input: FanoutInput): { system: string; user: string; prompt_sha256: string } {
  // WP-A7: pillars and opportunity type are listed when the thesis has them (legacy theses keep the old shape).
  const theses = input.theses.map(t => `- thesis_id: ${t.id}\n  标题: ${t.title}${t.opportunity_type && t.opportunity_type !== 'other' ? `\n  机会类型: ${t.opportunity_type}` : ''}${t.pillars && t.pillars.length > 0 ? `\n  支柱: ${t.pillars.map(p => p.text).join('；')}` : ''}\n  失效条件: ${t.invalidation_conditions.join('；')}\n  观察指标: ${t.watch_metrics.join('；')}`).join('\n');
  const user = `材料（source_id ${input.source.id}，类型 ${input.source.source_type}，来源 ${input.source.url ?? '无'}）：\n标题：${input.source.title}\n正文：\n${truncate(input.source.raw_text, MATERIAL_CHARS)}\n\nthesis 列表：\n${theses}\n\n${input.askQ5 && input.baseline ? `本材料属于一个已有簇，簇内最早材料（source_id ${input.baseline.source_id}）如下，请据此回答 Q5：\n标题：${input.baseline.title}\n正文：\n${truncate(input.baseline.text, 6000)}` : '不要回答 Q5。'}\n请按 system 里的 JSON 结构输出，theses 的键必须是上面的 thesis_id。`;
  return { system: SYSTEM, user, prompt_sha256: digest({ system: SYSTEM, user }) };
}

export interface DeepseekBackendOptions { llm: LlmFn; microsPer1kTokens?: number }

export function createDeepseekBackend(opts: DeepseekBackendOptions): FanoutBackend {
  const price = opts.microsPer1kTokens ?? DEEPSEEK_DEFAULT_MICROS_PER_1K;
  return async (input: FanoutInput): Promise<BackendResult> => {
    const started = Date.now();
    const prompt = buildFanoutPrompt(input);
    const base = { backend: 'llm_deepseek' as const, prompt_sha256: prompt.prompt_sha256 };
    let content: string, model: string;
    try {
      const r = await opts.llm({ system: prompt.system, user: prompt.user });
      content = r.content; model = r.model;
    } catch (e) {
      return { ...base, backend_model: 'unknown', input_token_count: null, latency_ms: Date.now() - started, cost_micros: 0, answers: [], skipped: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    const { extractJson } = await import('@/lib/data/sources/llm');
    const parsed = extractJson(content) as { Q3?: unknown; theses?: Record<string, Record<string, unknown>> } | null;
    const q3 = parseDistribution('Q3', parsed?.Q3);
    const answers: BackendAnswer[] = [];
    for (const t of input.theses) {
      const block = parsed?.theses && typeof parsed.theses === 'object' ? parsed.theses[t.id] : undefined;
      for (const q of ['Q1','Q2','Q4', ...(input.askQ5 ? ['Q5'] as const : [])] as const) {
        const dist = parseDistribution(q, block?.[q]);
        answers.push(dist ? decided(t.id, q, dist, null) : abstention(t.id, q));
      }
      answers.push(q3 ? decided(t.id, 'Q3', q3, null) : abstention(t.id, 'Q3'));
    }
    const tokens = estimateTokens(prompt.system + prompt.user) + estimateTokens(content);
    return { ...base, backend_model: model, input_token_count: tokens, latency_ms: Date.now() - started, cost_micros: microsForTokens(tokens, price), answers };
  };
}
