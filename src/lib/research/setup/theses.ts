/**
 * WP-A11 — thesis 流程的草稿形态、逐题校验与到 CreateThesisInput 的映射。
 * 校验是前置提示；权威守卫仍在 createThesis()（无失效条件不允许存在）。
 */
import { OPPORTUNITY_TYPES, type OpportunityType } from '../types';
import type { CreateThesisInput } from '../theses';
import type { ThesisQuestionId } from './questions';

export interface PillarDraft { text: string; resolvable_by: string; deadline: string }
export interface CatalystDraft { text: string; expected_date: string }

export interface ThesisDraft {
  title: string;
  body: string;
  opportunity_type: OpportunityType;
  company_ids: string[];
  pillars: PillarDraft[];
  invalidation_conditions: string[];
  watch_metrics: string[];
  catalysts: CatalystDraft[];
  horizon_weeks: string;
  next_review_at: string;
}

export const EMPTY_THESIS_DRAFT: ThesisDraft = {
  title: '', body: '', opportunity_type: 'other', company_ids: [],
  pillars: [{ text: '', resolvable_by: '', deadline: '' }, { text: '', resolvable_by: '', deadline: '' }],
  invalidation_conditions: [''], watch_metrics: [''], catalysts: [],
  horizon_weeks: '4,13,26', next_review_at: '',
};

export const TITLE_MAX = 120;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const nonEmpty = (s: string) => s.trim() !== '';

/** YYYY-MM-DD that exists on the calendar (2026-02-30 does not): a bad date must fail here, not in PostgreSQL after partial writes. */
export function isCalendarDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const isoOrEmpty = (s: string) => s.trim() === '' || isCalendarDate(s.trim());

export interface ThesisValidationContext {
  /** Entity ids currently in scope; when given, selections outside it are rejected (stale drafts). */
  inScopeIds?: readonly string[];
}

/** Errors for one step (empty array = the step may be left). */
export function validateThesisStep(step: ThesisQuestionId, d: ThesisDraft, ctx: ThesisValidationContext = {}): string[] {
  const errors: string[] = [];
  switch (step) {
    case 'title':
      if (!nonEmpty(d.title)) errors.push('请用一句话写出论点');
      else if (d.title.trim().length > TITLE_MAX) errors.push(`论点请控制在 ${TITLE_MAX} 字以内（当前 ${d.title.trim().length}）`);
      break;
    case 'body':
      if (!nonEmpty(d.body)) errors.push('请写出核心逻辑');
      break;
    case 'opportunity_type':
      if (!OPPORTUNITY_TYPES.includes(d.opportunity_type)) errors.push('请选择机会类型');
      break;
    case 'companies': {
      if (d.company_ids.length === 0) errors.push('至少关联 1 家名单内公司');
      if (ctx.inScopeIds) {
        const stale = d.company_ids.filter((id) => !ctx.inScopeIds!.includes(id)).length;
        if (stale > 0) errors.push(`有 ${stale} 家已选公司不在当前名单里，请重新选择`);
      }
      break;
    }
    case 'pillars': {
      const pillars = d.pillars.filter((p) => nonEmpty(p.text) || nonEmpty(p.resolvable_by) || nonEmpty(p.deadline));
      if (pillars.length < 2) errors.push('至少写 2 条支柱');
      if (pillars.length > 4) errors.push('最多 4 条支柱，多的合并或删掉');
      pillars.forEach((p, i) => {
        if (!nonEmpty(p.text)) errors.push(`第 ${i + 1} 条支柱缺少陈述`);
        if (!nonEmpty(p.resolvable_by)) errors.push(`第 ${i + 1} 条支柱缺少「如何判定」`);
        if (!isoOrEmpty(p.deadline)) errors.push(`第 ${i + 1} 条支柱的日期请用 YYYY-MM-DD`);
      });
      break;
    }
    case 'invalidation': {
      const conds = d.invalidation_conditions.filter(nonEmpty);
      if (conds.length === 0) errors.push('至少写 1 条失效条件：没有失效条件的 thesis 不允许存在');
      if (conds.length > 3) errors.push('最多 3 条失效条件');
      break;
    }
    case 'metrics_catalysts': {
      if (d.watch_metrics.filter(nonEmpty).length === 0) errors.push('至少写 1 个观察指标');
      const catalysts = d.catalysts.filter((c) => nonEmpty(c.text) || nonEmpty(c.expected_date));
      if (catalysts.length > 3) errors.push('最多 3 条催化剂');
      catalysts.forEach((c, i) => {
        if (!nonEmpty(c.text)) errors.push(`第 ${i + 1} 条催化剂缺少事件描述`);
        if (!isoOrEmpty(c.expected_date)) errors.push(`第 ${i + 1} 条催化剂的日期请用 YYYY-MM-DD`);
      });
      break;
    }
    case 'horizon': {
      const weeks = parseWeeks(d.horizon_weeks);
      if (weeks === null) errors.push('观察窗口请填正整数周数，逗号分隔，如 4,13,26');
      if (!isCalendarDate(d.next_review_at.trim())) errors.push('下次复核日期请用 YYYY-MM-DD 的真实日期');
      break;
    }
  }
  return errors;
}

export function parseWeeks(s: string): number[] | null {
  const parts = s.split(/[,，\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const weeks = parts.map(Number);
  return weeks.every((w) => Number.isInteger(w) && w > 0) ? weeks : null;
}

/** Draft → CreateThesisInput. Blank optional dates become null; blank rows are dropped. */
export function thesisFormToInput(d: ThesisDraft): CreateThesisInput {
  const trimOrNull = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    opportunity_type: d.opportunity_type,
    company_ids: [...d.company_ids],
    pillars: d.pillars.filter((p) => nonEmpty(p.text)).map((p) => ({ text: p.text.trim(), resolvable_by: p.resolvable_by.trim(), deadline: trimOrNull(p.deadline) })),
    invalidation_conditions: d.invalidation_conditions.map((s) => s.trim()).filter(Boolean),
    watch_metrics: d.watch_metrics.map((s) => s.trim()).filter(Boolean),
    catalysts: d.catalysts.filter((c) => nonEmpty(c.text)).map((c) => ({ text: c.text.trim(), expected_date: trimOrNull(c.expected_date) })),
    horizon_weeks: parseWeeks(d.horizon_weeks) ?? [4, 13, 26],
    next_review_at: d.next_review_at.trim(),
  };
}

/** Message after saving: a created thesis is final even when activation failed, so the draft must not be resubmitted. */
export function saveOutcomeMessage(input: { title: string; activate: boolean; activated: boolean | null; error?: string }): string {
  if (!input.activate) return `已保存为草稿：${input.title}`;
  if (input.activated) return `已保存并激活：${input.title}`;
  return `已保存为草稿：${input.title}；激活失败（${input.error ?? '未知错误'}），请到 theses 页手动激活，不要重复提交`;
}

/** Selected company ids that are no longer in scope (a persisted draft outliving a roster change). */
export function staleCompanyIds(selected: readonly string[], inScopeIds: readonly string[]): string[] {
  return selected.filter((id) => !inScopeIds.includes(id));
}

/**
 * Reconcile a create whose response was lost: the server may already hold the thesis. It is the one with
 * the same title, body and companies created within the last ten minutes; anything older is a different record.
 */
export function findCreatedThesis(
  theses: ReadonlyArray<{ id: string; title: string; body: string; company_ids: string[]; created_at: string }>,
  input: CreateThesisInput,
  nowIso: string,
): { id: string; title: string } | null {
  const now = Date.parse(nowIso);
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
  const match = theses.find((t) => t.title === input.title && t.body === input.body && same(t.company_ids ?? [], input.company_ids ?? [])
    && Number.isFinite(Date.parse(t.created_at)) && now - Date.parse(t.created_at) <= 10 * 60 * 1000 && Date.parse(t.created_at) <= now + 60 * 1000);
  return match ? { id: match.id, title: match.title } : null;
}

export type CreateOutcome =
  | { kind: 'created'; thesis: { id: string; title: string } }
  | { kind: 'rejected'; message: string }
  | { kind: 'ambiguous'; reason: string };

/**
 * What a create response means for the draft. Only a definitive 4xx is a rejection (the server did not
 * store anything). A 5xx, a transport failure or a success whose body does not carry a valid thesis is
 * ambiguous: the server may hold the thesis, so the caller must reconcile before allowing another create.
 */
export function classifyCreateResponse(status: number | null, body: unknown): CreateOutcome {
  if (status === null) return { kind: 'ambiguous', reason: '网络错误' };
  const b = body && typeof body === 'object' ? (body as { thesis?: unknown; error?: { message?: unknown } }) : {};
  const message = typeof b.error?.message === 'string' ? b.error.message : String(status);
  if (status >= 400 && status < 500) return { kind: 'rejected', message };
  if (status >= 500) return { kind: 'ambiguous', reason: message };
  const t = b.thesis && typeof b.thesis === 'object' ? (b.thesis as { id?: unknown; title?: unknown }) : null;
  if (t && typeof t.id === 'string' && t.id !== '' && typeof t.title === 'string') return { kind: 'created', thesis: { id: t.id, title: t.title } };
  return { kind: 'ambiguous', reason: '响应不完整' };
}
