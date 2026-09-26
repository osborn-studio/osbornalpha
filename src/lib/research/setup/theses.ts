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
const isoOrEmpty = (s: string) => s.trim() === '' || ISO_DATE.test(s.trim());

/** Errors for one step (empty array = the step may be left). */
export function validateThesisStep(step: ThesisQuestionId, d: ThesisDraft): string[] {
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
    case 'companies':
      if (d.company_ids.length === 0) errors.push('至少关联 1 家名单内公司');
      break;
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
      if (!ISO_DATE.test(d.next_review_at.trim())) errors.push('下次复核日期请用 YYYY-MM-DD');
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
