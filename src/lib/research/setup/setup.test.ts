import { describe, expect, it } from 'vitest';
import { COMPANY_QUESTIONS, THESIS_QUESTIONS } from './questions';
import { EMPTY_THESIS_DRAFT, thesisFormToInput, validateThesisStep, type ThesisDraft } from './theses';
import { companiesStepErrors, ownerCompanyToCohort, validateCompanyAnswer, type OwnerCompanyAnswer } from './companies';
import { setupProgress, TARGETS } from './progress';
import { parseDraft, resetCompanyDraft, resetThesisDraft, serializeDraft } from './draft';

const filled = (): ThesisDraft => ({
  ...EMPTY_THESIS_DRAFT,
  title: '券商 IT 预算向 AI 投顾迁移，恒生电子 2026H2 新签订单加速',
  body: '监管放开投顾试点后，头部券商把 IT 预算从合规系统转向 AI 投顾前台；恒生电子份额最高，先受益。',
  opportunity_type: 'C',
  company_ids: ['3f2b1c40-0000-4000-8000-000000000001'],
  pillars: [
    { text: '2026H2 新签订单同比 > 20%', resolvable_by: '半年报订单披露', deadline: '2026-09-30' },
    { text: '至少 3 家头部券商上线 AI 投顾', resolvable_by: '券商公告/App 版本', deadline: '' },
  ],
  invalidation_conditions: ['如果 2026 年内监管暂停 AI 投顾试点，本 thesis 失效'],
  watch_metrics: ['新签订单同比', '券商 IT 资本开支指引'],
  catalysts: [{ text: '证监会投顾试点扩容', expected_date: '2026-11-30' }],
  horizon_weeks: '4,13,26',
  next_review_at: '2026-10-25',
});

describe('question definitions', () => {
  it('every step of both flows carries a prompt, a hint and an example', () => {
    for (const q of [...COMPANY_QUESTIONS, ...THESIS_QUESTIONS]) {
      expect(q.id).toMatch(/^[a-z_]+$/);
      expect(q.prompt.length).toBeGreaterThan(3);
      expect(q.hint.length).toBeGreaterThan(3);
      expect(q.example.length).toBeGreaterThan(0);
    }
    expect(THESIS_QUESTIONS.map((q) => q.id)).toEqual([
      'title', 'body', 'opportunity_type', 'companies', 'pillars', 'invalidation', 'metrics_catalysts', 'horizon',
    ]);
  });
});

describe('thesis flow', () => {
  it('validates each step with the guardrails of the spec and A7', () => {
    const d = filled();
    for (const q of THESIS_QUESTIONS) expect(validateThesisStep(q.id, d)).toEqual([]);
    expect(validateThesisStep('title', { ...d, title: '' })).toEqual(['请用一句话写出论点']);
    expect(validateThesisStep('title', { ...d, title: 'x'.repeat(121) })[0]).toMatch(/120/);
    expect(validateThesisStep('companies', { ...d, company_ids: [] })).toEqual(['至少关联 1 家名单内公司']);
    expect(validateThesisStep('pillars', { ...d, pillars: d.pillars.slice(0, 1) })[0]).toMatch(/2/);
    expect(validateThesisStep('pillars', { ...d, pillars: [...d.pillars, ...d.pillars, ...d.pillars] })[0]).toMatch(/4/);
    expect(validateThesisStep('pillars', { ...d, pillars: [{ text: '有增长', resolvable_by: '', deadline: '' }, d.pillars[0]!] })[0]).toMatch(/如何判定/);
    expect(validateThesisStep('pillars', { ...d, pillars: [{ ...d.pillars[0]!, deadline: '2026/9/30' }, d.pillars[1]!] })[0]).toMatch(/YYYY-MM-DD/);
    expect(validateThesisStep('invalidation', { ...d, invalidation_conditions: [] })[0]).toMatch(/失效条件/);
    expect(validateThesisStep('invalidation', { ...d, invalidation_conditions: ['a', 'b', 'c', 'd'] })[0]).toMatch(/3/);
    expect(validateThesisStep('metrics_catalysts', { ...d, watch_metrics: [] })[0]).toMatch(/观察指标/);
    expect(validateThesisStep('metrics_catalysts', { ...d, catalysts: [{ text: '', expected_date: '2026-11-30' }] })[0]).toMatch(/催化剂/);
    expect(validateThesisStep('horizon', { ...d, horizon_weeks: '0,13' })[0]).toMatch(/窗口/);
    expect(validateThesisStep('horizon', { ...d, next_review_at: '' })[0]).toMatch(/复核/);
  });

  it('maps the draft onto CreateThesisInput exactly (empty optional dates become null)', () => {
    const input = thesisFormToInput(filled());
    expect(input).toEqual({
      title: filled().title,
      body: filled().body,
      opportunity_type: 'C',
      company_ids: ['3f2b1c40-0000-4000-8000-000000000001'],
      pillars: [
        { text: '2026H2 新签订单同比 > 20%', resolvable_by: '半年报订单披露', deadline: '2026-09-30' },
        { text: '至少 3 家头部券商上线 AI 投顾', resolvable_by: '券商公告/App 版本', deadline: null },
      ],
      invalidation_conditions: ['如果 2026 年内监管暂停 AI 投顾试点，本 thesis 失效'],
      watch_metrics: ['新签订单同比', '券商 IT 资本开支指引'],
      catalysts: [{ text: '证监会投顾试点扩容', expected_date: '2026-11-30' }],
      horizon_weeks: [4, 13, 26],
      next_review_at: '2026-10-25',
    });
  });
});

describe('company flow', () => {
  const answer: OwnerCompanyAnswer = {
    entity_id: null,
    rationale: '金融 IT 龙头，AI 投顾直接受益',
    names_zh: '恒生电子',
    names_en: 'Hundsun Technologies',
    home_market: 'A',
    exchange_code: '600570.SH',
    listed_on: '2003-12-16',
    keys: { lei: '', usci: '', cninfo_org_id: '', cik: '' },
  };

  it('requires a rationale for every listed company and market/code/date for a new one', () => {
    expect(validateCompanyAnswer({ ...answer, entity_id: 'e1' })).toEqual([]);
    expect(validateCompanyAnswer({ ...answer, entity_id: 'e1', rationale: ' ' })).toEqual(['请写一句为什么这家公司进名单']);
    expect(validateCompanyAnswer({ ...answer, rationale: 'x'.repeat(201) })[0]).toMatch(/200/);
    expect(validateCompanyAnswer({ ...answer, names_en: '' })[0]).toMatch(/英文名/);
    expect(validateCompanyAnswer({ ...answer, exchange_code: 'hs600570' })[0]).toMatch(/代码/);
    expect(validateCompanyAnswer({ ...answer, listed_on: '2003-12' })[0]).toMatch(/YYYY-MM-DD/);
    expect(validateCompanyAnswer({ ...answer, keys: { ...answer.keys, lei: 'bad' } })[0]).toMatch(/LEI/);
  });

  it('turns an owner-entered company into a CohortCompany the entity-keys store accepts', () => {
    const cohort = ownerCompanyToCohort(answer, { today: '2026-09-27' });
    expect(cohort).toMatchObject({
      names_en: ['Hundsun Technologies'], names_zh: ['恒生电子'], aliases: [], home_market: 'A', in_scope: true,
      cohort: 'scope-2026-09', keys: { lei: null, usci: null, cninfo_org_id: null, cik: null },
      missing: ['lei', 'usci', 'cninfo_org_id', 'cik'],
    });
    expect(cohort.securities).toEqual([{
      exchange_code: '600570.SH', mic: null, isin: null, market: 'A', security_type: 'common', is_primary: true,
      valid_from: '2003-12-16', valid_to: null, provenance: { exchange_code: { source: 'owner-input', retrieved_at: '2026-09-27' }, valid_from: { source: 'owner-input', retrieved_at: '2026-09-27' } },
    }]);
    // Known keys are kept and attributed to the owner; unknown listing date falls back to today.
    const withKey = ownerCompanyToCohort({ ...answer, listed_on: '', keys: { ...answer.keys, lei: '3003003LS77D1DRDDE25' } }, { today: '2026-09-27' });
    expect(withKey.keys.lei).toBe('3003003LS77D1DRDDE25');
    expect(withKey.missing).toEqual(['usci', 'cninfo_org_id', 'cik']);
    expect(withKey.provenance.lei).toEqual({ source: 'owner-input', retrieved_at: '2026-09-27' });
    expect(withKey.securities[0]!.valid_from).toBe('2026-09-27');
  });
});

describe('progress', () => {
  it('counts against the stage-0 targets and only warns outside the range', () => {
    expect(TARGETS).toEqual({ companies: [12, 15], theses: [8, 12] });
    const p = setupProgress({ inScopeCompanies: 5, activeTheses: 2, draftTheses: 3 });
    expect(p.companies).toEqual({ count: 5, min: 12, max: 15, status: 'below' });
    expect(p.theses).toEqual({ count: 5, active: 2, draft: 3, min: 8, max: 12, status: 'below' });
    expect(setupProgress({ inScopeCompanies: 13, activeTheses: 9, draftTheses: 0 }).companies.status).toBe('ok');
    expect(setupProgress({ inScopeCompanies: 16, activeTheses: 13, draftTheses: 0 }).theses.status).toBe('above');
  });
});

describe('draft persistence', () => {
  it('round-trips a versioned draft and rejects other versions or malformed input', () => {
    const draft = { version: 1 as const, thesis: filled(), thesisStep: 3, companies: {}, companyStep: 0 };
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
    expect(parseDraft('{"version":2}')).toBeNull();
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
});


describe('Codex round 1 regressions', () => {
  const answer: OwnerCompanyAnswer = { entity_id: 'e1', rationale: 'r', names_zh: '', names_en: '', home_market: 'A', exchange_code: '', listed_on: '', keys: { lei: '', usci: '', cninfo_org_id: '', cik: '' } };

  it('lets the owner leave the selection screen with nothing selected and enforces the roster at review', () => {
    // Nothing selected yet: the next screen is where owner-added companies are entered.
    expect(companiesStepErrors({ step: 0, selected: [], added: [] })).toEqual([]);
    expect(companiesStepErrors({ step: 1, selected: [], added: [] })).toEqual([]); // new-company screen
    expect(companiesStepErrors({ step: 2, selected: [], added: [] })).toEqual(['至少勾选或添加 1 家公司']); // review
    expect(companiesStepErrors({ step: 1, selected: [answer], added: [] })).toEqual([]);
    expect(companiesStepErrors({ step: 1, selected: [{ ...answer, rationale: '' }], added: [] })).toEqual(['请写一句为什么这家公司进名单']);
    const bad = { ...answer, entity_id: null, names_zh: '金证', names_en: '', exchange_code: 'x' };
    expect(companiesStepErrors({ step: 2, selected: [answer], added: [bad] })[0]).toMatch(/^金证：/);
  });

  it('resets the saved flow atomically so a saved thesis or roster cannot be resubmitted from the draft', () => {
    const draft = { version: 1 as const, thesis: filled(), thesisStep: 8, companies: { e1: answer }, companyStep: 3 };
    expect(resetThesisDraft(draft)).toEqual({ ...draft, thesis: EMPTY_THESIS_DRAFT, thesisStep: 0 });
    expect(resetCompanyDraft(draft)).toEqual({ ...draft, companies: {}, companyStep: 0 });
  });
});
