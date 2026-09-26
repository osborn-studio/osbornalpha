import { describe, expect, it } from 'vitest';
import { COMPANY_QUESTIONS, THESIS_QUESTIONS } from './questions';
import { EMPTY_THESIS_DRAFT, isCalendarDate, saveOutcomeMessage, staleCompanyIds, thesisFormToInput, validateThesisStep, type ThesisDraft } from './theses';
import { companiesStepErrors, companiesSubmitErrors, ownerCompanyToCohort, reconcileAddedCompany, rosterKeys, validateCompanyAnswer, type OwnerCompanyAnswer } from './companies';
import { setupProgress, TARGETS } from './progress';
import { clearPendingActivation, markThesisCreated, parseDraft, resetCompanyDraft, resetThesisDraft, serializeDraft } from './draft';
import { companiesFromResponse } from './roster';

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


describe('Codex round 2 regressions', () => {
  const ok: OwnerCompanyAnswer = { entity_id: 'e1', rationale: 'r', names_zh: '', names_en: '', home_market: 'A', exchange_code: '', listed_on: '', keys: { lei: '', usci: '', cninfo_org_id: '', cik: '' } };
  const added: OwnerCompanyAnswer = { ...ok, entity_id: null, names_zh: '金证股份', names_en: 'Kingdom', exchange_code: '600446.SH' };

  it('validates every selected and added answer before any write and points at the first incomplete screen', () => {
    expect(companiesSubmitErrors({ selected: [ok], added: [added] })).toEqual({ errors: [], firstStep: null });
    // Second selected company skipped its rationale screen (jumped to 添加候选外公司): step 2 is where to go back to.
    const r = companiesSubmitErrors({ selected: [ok, { ...ok, entity_id: 'e2', rationale: '' }], added: [{ ...added, exchange_code: 'x' }] });
    expect(r.firstStep).toBe(2);
    expect(r.errors).toEqual(['第 2 家：请写一句为什么这家公司进名单', '金证股份：主证券代码格式如 600570.SH / 0268.HK / PLTR，并与主市场一致']);
    expect(companiesSubmitErrors({ selected: [], added: [] })).toEqual({ errors: ['至少勾选或添加 1 家公司'], firstStep: 0 });
    // Only an added company is wrong: go to the new-company screen (n + 1).
    expect(companiesSubmitErrors({ selected: [ok], added: [{ ...added, names_en: '' }] }).firstStep).toBe(2);
  });

  it('turns a successfully created company into a selected existing one so a retry patches instead of re-posting', () => {
    const answers = { e1: ok, 'new:1': added, 'new:2': { ...added, names_zh: '另一家' } };
    const next = reconcileAddedCompany(answers, 'new:1', 'e9');
    expect(Object.keys(next).sort()).toEqual(['e1', 'e9', 'new:2']);
    expect(next.e9).toEqual({ ...added, entity_id: 'e9' });
    expect(next['new:2']).toBe(answers['new:2']);
  });
});


describe('Codex round 3 regressions', () => {
  it('rejects nonexistent calendar dates everywhere a date is entered', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-04-31', '2026-00-10', '2026-2-3', '']) expect(isCalendarDate(bad)).toBe(false);
    const d = filled();
    expect(validateThesisStep('pillars', { ...d, pillars: [{ ...d.pillars[0]!, deadline: '2026-02-30' }, d.pillars[1]!] })[0]).toMatch(/日期/);
    expect(validateThesisStep('metrics_catalysts', { ...d, catalysts: [{ text: 'x', expected_date: '2026-04-31' }] })[0]).toMatch(/日期/);
    expect(validateThesisStep('horizon', { ...d, next_review_at: '2026-02-30' })[0]).toMatch(/复核/);
    const answer: OwnerCompanyAnswer = { entity_id: null, rationale: 'r', names_zh: '金证', names_en: 'Kingdom', home_market: 'A', exchange_code: '600446.SH', listed_on: '2026-02-30', keys: { lei: '', usci: '', cninfo_org_id: '', cik: '' } };
    expect(validateCompanyAnswer(answer)[0]).toMatch(/上市日期/);
  });

  it('refuses a thesis whose selected companies are no longer in scope', () => {
    const d = filled();
    const inScope = ['3f2b1c40-0000-4000-8000-000000000001'];
    expect(validateThesisStep('companies', d, { inScopeIds: inScope })).toEqual([]);
    expect(validateThesisStep('companies', { ...d, company_ids: [...d.company_ids, 'gone'] }, { inScopeIds: inScope })).toEqual(['有 1 家已选公司不在当前名单里，请重新选择']);
    // Without a scope list (unit contexts) the check is skipped, never a crash.
    expect(validateThesisStep('companies', { ...d, company_ids: ['gone'] })).toEqual([]);
  });

  it('describes the save outcome so a created thesis is finalized even when activation fails', () => {
    expect(saveOutcomeMessage({ title: 'T', activate: false, activated: null })).toBe('已保存为草稿：T');
    expect(saveOutcomeMessage({ title: 'T', activate: true, activated: true })).toBe('已保存并激活：T');
    expect(saveOutcomeMessage({ title: 'T', activate: true, activated: false, error: 'network' })).toBe('已保存为草稿：T；激活失败（network），请到 theses 页手动激活，不要重复提交');
  });
});


describe('Codex round 4 regressions', () => {
  const a: OwnerCompanyAnswer = { entity_id: 'e1', rationale: 'r', names_zh: '', names_en: '', home_market: 'A', exchange_code: '', listed_on: '', keys: { lei: '', usci: '', cninfo_org_id: '', cik: '' } };

  it('exposes stale thesis selections so they can be removed from the picker', () => {
    expect(staleCompanyIds(['e1', 'gone', 'e2'], ['e1', 'e2'])).toEqual(['gone']);
    expect(staleCompanyIds(['e1'], ['e1'])).toEqual([]);
  });

  it('derives the roster from the draft, so a company created in a partial run counts before the list is refreshed', () => {
    const answers = { e1: a, 'new:1': { ...a, entity_id: null, names_zh: '金证' }, e9: { ...a, entity_id: 'e9' } };
    expect(rosterKeys(answers)).toEqual({ selected: ['e1', 'e9'], added: ['new:1'] });
    expect(companiesSubmitErrors({ selected: [answers.e9], added: [] }).errors).toEqual([]);
  });
});


describe('Codex round 9 regression', () => {
  it('a failed or malformed roster load is an error, never an empty roster that enables the wizard', () => {
    expect(companiesFromResponse(true, { companies: [] })).toEqual({ companies: [] });
    expect(companiesFromResponse(true, { companies: [{ entity_id: 'e1' }] })).toEqual({ companies: [{ entity_id: 'e1' }] });
    expect(companiesFromResponse(false, { companies: [] })).toEqual({ error: '名单加载失败，请重试' });
    expect(companiesFromResponse(true, {})).toEqual({ error: '名单加载失败，请重试' });
    expect(companiesFromResponse(true, { companies: 'x' })).toEqual({ error: '名单加载失败，请重试' });
    expect(companiesFromResponse(true, null)).toEqual({ error: '名单加载失败，请重试' });
  });
});


describe('Codex round 12 regression', () => {
  it('finalizes the stored draft the moment a thesis is created and remembers a pending activation', () => {
    const draft = { version: 1 as const, thesis: filled(), thesisStep: 8, companies: {}, companyStep: 0 };
    const created = markThesisCreated(draft, { id: 't1', title: 'T' });
    expect(created.thesis).toEqual(EMPTY_THESIS_DRAFT);
    expect(created.thesisStep).toBe(0);
    expect(created.pendingActivation).toEqual({ id: 't1', title: 'T' });
    // Survives a reload: the pending activation round-trips through the persisted draft.
    expect(parseDraft(serializeDraft(created))?.pendingActivation).toEqual({ id: 't1', title: 'T' });
    expect(clearPendingActivation(created).pendingActivation).toBeNull();
    expect(parseDraft(JSON.stringify({ ...created, pendingActivation: 'bad' }))).toBeNull();
  });
});
