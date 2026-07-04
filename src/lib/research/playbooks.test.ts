import { describe, it, expect, beforeAll } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { seedResearchData } from './seed';
import { createThesis, getThesis, listThesisEvents, transitionThesis } from './theses';
import {
  ACTION_POLICY,
  AxiomBlocked,
  PlaybookError,
  approvePlaybook,
  checkPlaybookAxioms,
  createPlaybookRun,
  getPlaybookRun,
  listPlaybookRuns,
  rejectPlaybook,
  suggestPlaybookAction,
  type PlaybookSource,
} from './playbooks';
import { loadAxioms, type LlmFn } from './memos';
import type { Axiom, ProposedAction, Thesis } from './types';

async function mkCtx(): Promise<{ ctx: ResearchCtx; store: MockStore }> {
  const { ctx, store } = makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore };
  await seedResearchData(ctx);
  return { ctx, store };
}

async function mkActiveThesis(ctx: ResearchCtx): Promise<Thesis> {
  const t = await createThesis(ctx, {
    title: 'NVIDIA 推理需求可持续增长',
    body: '推理 token 经济学支撑数据中心 capex。',
    invalidation_conditions: ['token 单价跌破成本线'],
    watch_metrics: ['NVDA DC 营收 QoQ'],
    next_review_at: '2026-07-18',
  });
  return transitionThesis(ctx, t.id, 'ACTIVE', 'activate for test');
}

/** Raw insert — bypasses createThesis's own AX001-spirit guard on purpose. */
function insertThesisWithoutInvalidation(ctx: ResearchCtx, store: MockStore): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  store.seed('research_theses', [{
    id, user_id: ctx.userId, title: '裸奔 thesis', body: 'no invalidation',
    company_ids: [], theme_ids: [], supporting_evidence_ids: [],
    invalidation_conditions: [], watch_metrics: ['m'], status: 'ACTIVE',
    next_review_at: null, last_assessment: {}, created_at: now, updated_at: now,
  }]);
  return id;
}

function insertMemo(ctx: ResearchCtx, store: MockStore, opts: { counterArgs?: boolean; invalidation?: boolean } = {}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  store.seed('research_memos', [{
    id, user_id: ctx.userId, title: 'test memo', company_ids: [], theme_ids: [],
    one_line_conclusion: '', thesis: '',
    supporting_evidence: [],
    counter_arguments: opts.counterArgs === false ? [] : [{ claim: '反方', source_document_ids: [] }],
    key_variables: [],
    invalidation_conditions: opts.invalidation === false ? [] : ['失效条件一'],
    open_questions: [], related_impacts: [], confidence: 'LOW',
    axiom_check_results: [], status: 'REVIEWED', llm_provenance: {},
    created_at: now, updated_at: now,
  }]);
  return id;
}

function thesisSource(overrides: Partial<PlaybookSource> = {}): PlaybookSource {
  return {
    kind: 'thesis',
    id: 't-1',
    title: 't',
    invalidation_conditions: ['条件一'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('ACTION_POLICY', () => {
  it('requires approval exactly for PAPER_TRADE and CLOSE_THESIS (high risk)', () => {
    expect(ACTION_POLICY.PAPER_TRADE.approval).toBe('REQUIRED');
    expect(ACTION_POLICY.CLOSE_THESIS.approval).toBe('REQUIRED');
    expect(ACTION_POLICY.UPDATE_THESIS.approval).toBe('NOT_REQUIRED');
    expect(ACTION_POLICY.WATCHLIST.approval).toBe('NOT_REQUIRED');
    expect(ACTION_POLICY.RESEARCH_MORE.approval).toBe('NOT_REQUIRED');
  });
});

describe('checkPlaybookAxioms (pure)', () => {
  let axioms: Axiom[];
  beforeAll(async () => {
    const { ctx } = await mkCtx();
    axioms = await loadAxioms(ctx);
  });
  const input = (action: ProposedAction, rationale = '合理的研究理由') =>
    ({ proposed_action: action, rationale });

  it('AX001 passes when the source has invalidation conditions', () => {
    const results = checkPlaybookAxioms(input('WATCHLIST'), thesisSource(), axioms);
    const ax1 = results.find((r) => r.axiom_code === 'AX001')!;
    expect(ax1.passed).toBe(true);
    expect(ax1.severity).toBe('BLOCK');
  });

  it('AX001 blocks a source without invalidation conditions (spec acceptance line 1)', () => {
    const results = checkPlaybookAxioms(
      input('WATCHLIST'),
      thesisSource({ invalidation_conditions: [] }),
      axioms,
    );
    const ax1 = results.find((r) => r.axiom_code === 'AX001')!;
    expect(ax1.passed).toBe(false);
    expect(ax1.severity).toBe('BLOCK');
  });

  it('AX003 blocks an approval-required action from a memo without counter-arguments', () => {
    const memoSource: PlaybookSource = {
      kind: 'memo', id: 'm-1', title: 'm',
      invalidation_conditions: ['c'], counter_arguments: [],
    };
    const blocked = checkPlaybookAxioms(input('PAPER_TRADE'), memoSource, axioms);
    expect(blocked.find((r) => r.axiom_code === 'AX003')!.passed).toBe(false);
    // Not approval-required → AX003 does not bite.
    const ok = checkPlaybookAxioms(input('RESEARCH_MORE'), memoSource, axioms);
    expect(ok.find((r) => r.axiom_code === 'AX003')!.passed).toBe(true);
    // Memo WITH counter-arguments → passes even for approval-required actions.
    const withCounter = checkPlaybookAxioms(
      input('PAPER_TRADE'),
      { ...memoSource, counter_arguments: [{ claim: '反方', source_document_ids: [] }] },
      axioms,
    );
    expect(withCounter.find((r) => r.axiom_code === 'AX003')!.passed).toBe(true);
  });

  it('AX003 never applies to thesis sources', () => {
    const results = checkPlaybookAxioms(input('PAPER_TRADE'), thesisSource(), axioms);
    expect(results.find((r) => r.axiom_code === 'AX003')!.passed).toBe(true);
  });

  it('AX005 blocks profit-promise language in the rationale', () => {
    const results = checkPlaybookAxioms(
      input('WATCHLIST', '这笔稳赚不赔'), thesisSource(), axioms,
    );
    expect(results.find((r) => r.axiom_code === 'AX005')!.passed).toBe(false);
    const ok = checkPlaybookAxioms(input('WATCHLIST'), thesisSource(), axioms);
    expect(ok.find((r) => r.axiom_code === 'AX005')!.passed).toBe(true);
  });

  it('skips disabled axioms', () => {
    const disabled = axioms.map((a) => (a.code === 'AX001' ? { ...a, enabled: false } : a));
    const results = checkPlaybookAxioms(
      input('WATCHLIST'),
      thesisSource({ invalidation_conditions: [] }),
      disabled,
    );
    expect(results.find((r) => r.axiom_code === 'AX001')).toBeUndefined();
  });
});

describe('createPlaybookRun', () => {
  const base = { rationale: '基于观察指标的研究判断', risks: ['需求不及预期'] };

  it('persists a NOT_REQUIRED run for low-risk actions with an audit trail', async () => {
    const { ctx, store } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const { run, axiom_results } = await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'WATCHLIST', ...base,
    });
    expect(run.approval_status).toBe('NOT_REQUIRED');
    expect(run.thesis_id).toBe(thesis.id);
    expect(run.risks).toEqual(['需求不及预期']);
    expect(axiom_results.every((r) => r.passed || r.severity !== 'BLOCK')).toBe(true);
    expect(await getPlaybookRun(ctx, run.id)).not.toBeNull();
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'playbook.create');
    expect(audits).toHaveLength(1);
  });

  it('routes high-risk actions to PENDING approval', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const { run } = await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'PAPER_TRADE', ...base,
    });
    expect(run.approval_status).toBe('PENDING');
  });

  it('SPEC ACCEPTANCE 1: a thesis without invalidation conditions cannot enter the playbook (422, not persisted)', async () => {
    const { ctx, store } = await mkCtx();
    const nakedId = insertThesisWithoutInvalidation(ctx, store);
    try {
      await createPlaybookRun(ctx, { thesis_id: nakedId, proposed_action: 'WATCHLIST', ...base });
      expect.unreachable('should have thrown AxiomBlocked');
    } catch (e) {
      expect(e).toBeInstanceOf(AxiomBlocked);
      expect((e as AxiomBlocked).status).toBe(422);
      const ax1 = (e as AxiomBlocked).results.find((r) => r.axiom_code === 'AX001')!;
      expect(ax1.passed).toBe(false);
    }
    // The run must NOT be persisted.
    expect(await listPlaybookRuns(ctx)).toHaveLength(0);
  });

  it('blocks profit-promise rationale via AX005 without persisting', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    await expect(createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'WATCHLIST',
      rationale: '保证翻倍', risks: ['无'],
    })).rejects.toThrow(AxiomBlocked);
    expect(await listPlaybookRuns(ctx)).toHaveLength(0);
  });

  it('blocks an approval-required action from a memo without counter-arguments (AX003)', async () => {
    const { ctx, store } = await mkCtx();
    const memoId = insertMemo(ctx, store, { counterArgs: false });
    await expect(createPlaybookRun(ctx, {
      memo_id: memoId, proposed_action: 'PAPER_TRADE', ...base,
    })).rejects.toThrow(AxiomBlocked);
    // The same memo can still enter with a low-risk action.
    const { run } = await createPlaybookRun(ctx, {
      memo_id: memoId, proposed_action: 'RESEARCH_MORE', ...base,
    });
    expect(run.approval_status).toBe('NOT_REQUIRED');
  });

  it('validates input: source choice, existence, action enum, rationale, risks', async () => {
    const { ctx, store } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const memoId = insertMemo(ctx, store);
    const cases: Array<[Record<string, unknown>, number]> = [
      [{ proposed_action: 'WATCHLIST', ...base }, 422],                       // neither source
      [{ thesis_id: thesis.id, memo_id: memoId, proposed_action: 'WATCHLIST', ...base }, 422], // both
      [{ thesis_id: '00000000-0000-4000-8000-0000000000a1', proposed_action: 'WATCHLIST', ...base }, 404],    // missing thesis
      [{ memo_id: '00000000-0000-4000-8000-0000000000a2', proposed_action: 'WATCHLIST', ...base }, 404],      // missing memo
      [{ thesis_id: thesis.id, proposed_action: 'YOLO', ...base }, 422],      // bad action
      [{ thesis_id: thesis.id, proposed_action: 'WATCHLIST', rationale: ' ', risks: ['r'] }, 422],
      [{ thesis_id: thesis.id, proposed_action: 'WATCHLIST', rationale: 'r', risks: [] }, 422],
      [{ memo_id: memoId, proposed_action: 'CLOSE_THESIS', ...base }, 422],   // CLOSE_THESIS needs thesis_id
    ];
    for (const [input, status] of cases) {
      try {
        await createPlaybookRun(ctx, input as never);
        expect.unreachable(`should have thrown for ${JSON.stringify(input)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(PlaybookError);
        expect((e as PlaybookError).status).toBe(status);
      }
    }
    expect(await listPlaybookRuns(ctx)).toHaveLength(0);
  });
});

describe('approvePlaybook / rejectPlaybook state machine', () => {
  async function mkPending(ctx: ResearchCtx, action: ProposedAction = 'PAPER_TRADE', thesis?: Thesis) {
    const t = thesis ?? await mkActiveThesis(ctx);
    return (await createPlaybookRun(ctx, {
      thesis_id: t.id, proposed_action: action,
      rationale: '研究理由', risks: ['风险一'],
    })).run;
  }

  it('approves a PENDING run with a mandatory decision and audits it', async () => {
    const { ctx, store } = await mkCtx();
    const run = await mkPending(ctx);
    const { run: approved } = await approvePlaybook(ctx, run.id, { decision: '同意纸面记录' });
    expect(approved.approval_status).toBe('APPROVED');
    expect(approved.human_decision).toBe('同意纸面记录');
    expect(approved.review_at).toBeTruthy();
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'playbook.approve');
    expect(audits).toHaveLength(1);
  });

  it('requires a non-empty decision (422)', async () => {
    const { ctx } = await mkCtx();
    const run = await mkPending(ctx);
    await expect(approvePlaybook(ctx, run.id, { decision: '  ' })).rejects.toThrow(PlaybookError);
    await expect(rejectPlaybook(ctx, run.id, { decision: '' })).rejects.toThrow(PlaybookError);
    expect((await getPlaybookRun(ctx, run.id))!.approval_status).toBe('PENDING');
  });

  it('only PENDING can be approved: double-approve, approve-after-reject, NOT_REQUIRED all 422', async () => {
    const { ctx } = await mkCtx();
    const a = await mkPending(ctx);
    await approvePlaybook(ctx, a.id, { decision: 'ok' });
    for (const fn of [
      () => approvePlaybook(ctx, a.id, { decision: 'again' }),
      () => rejectPlaybook(ctx, a.id, { decision: 'flip' }),
    ]) {
      try { await fn(); expect.unreachable('should throw'); }
      catch (e) { expect((e as PlaybookError).status).toBe(422); }
    }
    const b = await mkPending(ctx, 'PAPER_TRADE', (await getThesis(ctx, a.thesis_id!))!);
    await rejectPlaybook(ctx, b.id, { decision: '证据不足' });
    expect((await getPlaybookRun(ctx, b.id))!.approval_status).toBe('REJECTED');
    try { await approvePlaybook(ctx, b.id, { decision: 'late' }); expect.unreachable('should throw'); }
    catch (e) { expect((e as PlaybookError).status).toBe(422); }
    // NOT_REQUIRED runs never enter the approval machine.
    const t = (await getThesis(ctx, a.thesis_id!))!;
    const c = (await createPlaybookRun(ctx, {
      thesis_id: t.id, proposed_action: 'WATCHLIST', rationale: 'r', risks: ['x'],
    })).run;
    try { await approvePlaybook(ctx, c.id, { decision: 'n/a' }); expect.unreachable('should throw'); }
    catch (e) { expect((e as PlaybookError).status).toBe(422); }
    // Missing run → 404.
    try { await approvePlaybook(ctx, '00000000-0000-4000-8000-0000000000b9', { decision: 'x' }); expect.unreachable('should throw'); }
    catch (e) { expect((e as PlaybookError).status).toBe(404); }
  });

  it('reject audits playbook.reject and records the decision', async () => {
    const { ctx, store } = await mkCtx();
    const run = await mkPending(ctx);
    const { run: rejected } = await rejectPlaybook(ctx, run.id, { decision: '风险过高' });
    expect(rejected.approval_status).toBe('REJECTED');
    expect(rejected.human_decision).toBe('风险过高');
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'playbook.reject');
    expect(audits).toHaveLength(1);
  });
});

describe('executeApproved (restricted effects)', () => {
  it('CLOSE_THESIS approval closes the thesis through the transition guard', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const { run } = await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'CLOSE_THESIS',
      rationale: '逻辑已兑现', risks: ['过早关闭'],
    });
    const { run: approved, execution } = await approvePlaybook(ctx, run.id, { decision: '同意关闭' });
    expect(approved.approval_status).toBe('APPROVED');
    expect(execution.executed).toBe(true);
    expect((await getThesis(ctx, thesis.id))!.status).toBe('CLOSED');
    // The guard path wrote its own STATUS_CHANGE event.
    const changes = (await listThesisEvents(ctx, thesis.id)).filter((e) => e.event_type === 'STATUS_CHANGE');
    expect(changes.some((e) => e.detail.to === 'CLOSED')).toBe(true);
  });

  it('a guard rejection leaves the playbook APPROVED and records execution_error in audit_log', async () => {
    const { ctx, store } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const { run } = await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'CLOSE_THESIS',
      rationale: '关闭', risks: ['r'],
    });
    // Force the thesis CLOSED behind the run's back → CLOSED→CLOSED is illegal.
    await transitionThesis(ctx, thesis.id, 'CLOSED', 'raced');
    const { run: approved, execution } = await approvePlaybook(ctx, run.id, { decision: '关闭它' });
    expect(approved.approval_status).toBe('APPROVED'); // approval stands
    expect(execution.executed).toBe(false);
    expect(execution.execution_error).toMatch(/illegal transition/);
    const audits = store.rows('research_audit_log')
      .filter((a) => a.action === 'playbook.execute' && a.object_id === run.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].detail.execution_error).toMatch(/illegal transition/);
  });

  it('PAPER_TRADE approval is a record only — no automated effect, no real trading', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const { run } = await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'PAPER_TRADE',
      rationale: '纸面跟踪', risks: ['r'],
    });
    const { execution } = await approvePlaybook(ctx, run.id, { decision: '纸面记录' });
    expect(execution.executed).toBe(false);
    expect(execution.note).toMatch(/record/i);
    expect((await getThesis(ctx, thesis.id))!.status).toBe('ACTIVE'); // untouched
  });
});

describe('suggestPlaybookAction', () => {
  const fakeLlm = (payload: unknown): LlmFn =>
    async () => ({ content: JSON.stringify(payload), model: 'fake-suggest-model' });

  it('returns an LLM suggestion with provenance and audits it — WITHOUT persisting a run', async () => {
    const { ctx, store } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const r = await suggestPlaybookAction(ctx, { thesis_id: thesis.id }, fakeLlm({
      proposed_action: 'WATCHLIST',
      rationale: '继续观察指标',
      risks: ['需求不及预期', '竞争加剧'],
      confidence_note: '中等置信',
    }));
    expect(r.suggestion).not.toBeNull();
    if (r.suggestion) {
      expect(r.suggestion.proposed_action).toBe('WATCHLIST');
      expect(r.suggestion.risks).toHaveLength(2);
    }
    expect(r.llm).toEqual({ source: 'llm', model: 'fake-suggest-model' });
    if ('provenance' in r) {
      expect(r.provenance.model).toBe('fake-suggest-model');
      expect(r.provenance.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // Suggestion is NOT persisted — creation is a separate gated step.
    expect(await listPlaybookRuns(ctx)).toHaveLength(0);
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'playbook.suggest');
    expect(audits).toHaveLength(1);
  });

  it('downgrades a non-enum action to RESEARCH_MORE and records it in metadata + audit', async () => {
    const { ctx, store } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const r = await suggestPlaybookAction(ctx, { thesis_id: thesis.id }, fakeLlm({
      proposed_action: 'BUY_THE_DIP', rationale: 'r', risks: ['a', 'b'], confidence_note: 'c',
    }));
    expect(r.suggestion!.proposed_action).toBe('RESEARCH_MORE');
    expect(r.suggestion!.metadata.downgraded_from).toBe('BUY_THE_DIP');
    const audit = store.rows('research_audit_log').find((a) => a.action === 'playbook.suggest')!;
    expect(audit.detail.downgraded_from).toBe('BUY_THE_DIP');
  });

  it('maps LLM failure / garbage output to structured results (never throws)', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const failing: LlmFn = async () => { throw new Error('boom'); };
    const r1 = await suggestPlaybookAction(ctx, { thesis_id: thesis.id }, failing);
    expect(r1.suggestion).toBeNull();
    expect(r1.llm.source).toBe('error');
    const noKey: LlmFn = async () => { throw new Error('no LLM provider configured'); };
    const r2 = await suggestPlaybookAction(ctx, { thesis_id: thesis.id }, noKey);
    expect(r2.llm.source).toBe('no-key');
    const garbage: LlmFn = async () => ({ content: 'not json at all', model: 'x' });
    const r3 = await suggestPlaybookAction(ctx, { thesis_id: thesis.id }, garbage);
    expect(r3.suggestion).toBeNull();
    expect(r3.llm.source).toBe('error');
  });

  it('rejects bad source refs: neither/both (422), missing (404)', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    const llm = fakeLlm({ proposed_action: 'RESEARCH_MORE', rationale: 'r', risks: ['a', 'b'], confidence_note: 'c' });
    await expect(suggestPlaybookAction(ctx, {}, llm)).rejects.toMatchObject({ status: 422 });
    await expect(
      suggestPlaybookAction(ctx, { thesis_id: thesis.id, memo_id: 'm' }, llm),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      suggestPlaybookAction(ctx, { thesis_id: '00000000-0000-4000-8000-0000000000c3' }, llm),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('listPlaybookRuns', () => {
  it('lists newest first and filters by approval status', async () => {
    const { ctx } = await mkCtx();
    const thesis = await mkActiveThesis(ctx);
    await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'WATCHLIST', rationale: 'r', risks: ['x'],
    });
    await createPlaybookRun(ctx, {
      thesis_id: thesis.id, proposed_action: 'PAPER_TRADE', rationale: 'r', risks: ['x'],
    });
    expect(await listPlaybookRuns(ctx)).toHaveLength(2);
    const pending = await listPlaybookRuns(ctx, { status: 'PENDING' });
    expect(pending).toHaveLength(1);
    expect(pending[0].proposed_action).toBe('PAPER_TRADE');
  });
});
