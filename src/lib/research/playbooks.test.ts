import { describe, it, expect } from 'vitest';
import { openTestDb, type ResearchDb } from './db';
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

function mkDb(): ResearchDb {
  const db = openTestDb();
  seedResearchData(db);
  return db;
}

function mkActiveThesis(db: ResearchDb): Thesis {
  const t = createThesis(db, {
    title: 'NVIDIA 推理需求可持续增长',
    body: '推理 token 经济学支撑数据中心 capex。',
    invalidation_conditions: ['token 单价跌破成本线'],
    watch_metrics: ['NVDA DC 营收 QoQ'],
    next_review_at: '2026-07-18',
  });
  return transitionThesis(db, t.id, 'ACTIVE', 'activate for test');
}

/** Raw insert — bypasses createThesis's own AX001-spirit guard on purpose. */
function insertThesisWithoutInvalidation(db: ResearchDb): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into theses (id, title, body, invalidation_conditions, watch_metrics,
       status, created_at, updated_at)
     values (?, '裸奔 thesis', 'no invalidation', '[]', '["m"]', 'ACTIVE', ?, ?)`,
  ).run(id, now, now);
  return id;
}

function insertMemo(db: ResearchDb, opts: { counterArgs?: boolean; invalidation?: boolean } = {}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into memos (id, title, counter_arguments, invalidation_conditions,
       status, created_at, updated_at)
     values (?, 'test memo', ?, ?, 'REVIEWED', ?, ?)`,
  ).run(
    id,
    JSON.stringify(opts.counterArgs === false ? [] : [{ claim: '反方', source_document_ids: [] }]),
    JSON.stringify(opts.invalidation === false ? [] : ['失效条件一']),
    now,
    now,
  );
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
  {
    const db = mkDb();
    axioms = loadAxioms(db);
    db.close();
  }
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

  it('persists a NOT_REQUIRED run for low-risk actions with an audit trail', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const { run, axiom_results } = createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'WATCHLIST', ...base,
    });
    expect(run.approval_status).toBe('NOT_REQUIRED');
    expect(run.thesis_id).toBe(thesis.id);
    expect(run.risks).toEqual(['需求不及预期']);
    expect(axiom_results.every((r) => r.passed || r.severity !== 'BLOCK')).toBe(true);
    expect(getPlaybookRun(db, run.id)).not.toBeNull();
    const audits = db.prepare(`select * from audit_log where action = 'playbook.create'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });

  it('routes high-risk actions to PENDING approval', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const { run } = createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'PAPER_TRADE', ...base,
    });
    expect(run.approval_status).toBe('PENDING');
    db.close();
  });

  it('SPEC ACCEPTANCE 1: a thesis without invalidation conditions cannot enter the playbook (422, not persisted)', () => {
    const db = mkDb();
    const nakedId = insertThesisWithoutInvalidation(db);
    try {
      createPlaybookRun(db, { thesis_id: nakedId, proposed_action: 'WATCHLIST', ...base });
      expect.unreachable('should have thrown AxiomBlocked');
    } catch (e) {
      expect(e).toBeInstanceOf(AxiomBlocked);
      expect((e as AxiomBlocked).status).toBe(422);
      const ax1 = (e as AxiomBlocked).results.find((r) => r.axiom_code === 'AX001')!;
      expect(ax1.passed).toBe(false);
    }
    // The run must NOT be persisted.
    expect(listPlaybookRuns(db)).toHaveLength(0);
    db.close();
  });

  it('blocks profit-promise rationale via AX005 without persisting', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    expect(() => createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'WATCHLIST',
      rationale: '保证翻倍', risks: ['无'],
    })).toThrow(AxiomBlocked);
    expect(listPlaybookRuns(db)).toHaveLength(0);
    db.close();
  });

  it('blocks an approval-required action from a memo without counter-arguments (AX003)', () => {
    const db = mkDb();
    const memoId = insertMemo(db, { counterArgs: false });
    expect(() => createPlaybookRun(db, {
      memo_id: memoId, proposed_action: 'PAPER_TRADE', ...base,
    })).toThrow(AxiomBlocked);
    // The same memo can still enter with a low-risk action.
    const { run } = createPlaybookRun(db, {
      memo_id: memoId, proposed_action: 'RESEARCH_MORE', ...base,
    });
    expect(run.approval_status).toBe('NOT_REQUIRED');
    db.close();
  });

  it('validates input: source choice, existence, action enum, rationale, risks', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const memoId = insertMemo(db);
    const cases: Array<[Record<string, unknown>, number]> = [
      [{ proposed_action: 'WATCHLIST', ...base }, 422],                       // neither source
      [{ thesis_id: thesis.id, memo_id: memoId, proposed_action: 'WATCHLIST', ...base }, 422], // both
      [{ thesis_id: 'nope', proposed_action: 'WATCHLIST', ...base }, 404],    // missing thesis
      [{ memo_id: 'nope', proposed_action: 'WATCHLIST', ...base }, 404],      // missing memo
      [{ thesis_id: thesis.id, proposed_action: 'YOLO', ...base }, 422],      // bad action
      [{ thesis_id: thesis.id, proposed_action: 'WATCHLIST', rationale: ' ', risks: ['r'] }, 422],
      [{ thesis_id: thesis.id, proposed_action: 'WATCHLIST', rationale: 'r', risks: [] }, 422],
      [{ memo_id: memoId, proposed_action: 'CLOSE_THESIS', ...base }, 422],   // CLOSE_THESIS needs thesis_id
    ];
    for (const [input, status] of cases) {
      try {
        createPlaybookRun(db, input as never);
        expect.unreachable(`should have thrown for ${JSON.stringify(input)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(PlaybookError);
        expect((e as PlaybookError).status).toBe(status);
      }
    }
    expect(listPlaybookRuns(db)).toHaveLength(0);
    db.close();
  });
});

describe('approvePlaybook / rejectPlaybook state machine', () => {
  function mkPending(db: ResearchDb, action: ProposedAction = 'PAPER_TRADE', thesis?: Thesis) {
    const t = thesis ?? mkActiveThesis(db);
    return createPlaybookRun(db, {
      thesis_id: t.id, proposed_action: action,
      rationale: '研究理由', risks: ['风险一'],
    }).run;
  }

  it('approves a PENDING run with a mandatory decision and audits it', () => {
    const db = mkDb();
    const run = mkPending(db);
    const { run: approved } = approvePlaybook(db, run.id, { decision: '同意纸面记录' });
    expect(approved.approval_status).toBe('APPROVED');
    expect(approved.human_decision).toBe('同意纸面记录');
    expect(approved.review_at).toBeTruthy();
    const audits = db.prepare(`select * from audit_log where action = 'playbook.approve'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });

  it('requires a non-empty decision (422)', () => {
    const db = mkDb();
    const run = mkPending(db);
    expect(() => approvePlaybook(db, run.id, { decision: '  ' })).toThrow(PlaybookError);
    expect(() => rejectPlaybook(db, run.id, { decision: '' })).toThrow(PlaybookError);
    expect(getPlaybookRun(db, run.id)!.approval_status).toBe('PENDING');
    db.close();
  });

  it('only PENDING can be approved: double-approve, approve-after-reject, NOT_REQUIRED all 422', () => {
    const db = mkDb();
    const a = mkPending(db);
    approvePlaybook(db, a.id, { decision: 'ok' });
    for (const fn of [
      () => approvePlaybook(db, a.id, { decision: 'again' }),
      () => rejectPlaybook(db, a.id, { decision: 'flip' }),
    ]) {
      try { fn(); expect.unreachable('should throw'); }
      catch (e) { expect((e as PlaybookError).status).toBe(422); }
    }
    const b = mkPending(db, 'PAPER_TRADE', getThesis(db, a.thesis_id!)!);
    rejectPlaybook(db, b.id, { decision: '证据不足' });
    expect(getPlaybookRun(db, b.id)!.approval_status).toBe('REJECTED');
    try { approvePlaybook(db, b.id, { decision: 'late' }); expect.unreachable('should throw'); }
    catch (e) { expect((e as PlaybookError).status).toBe(422); }
    // NOT_REQUIRED runs never enter the approval machine.
    const t = getThesis(db, a.thesis_id!)!;
    const c = createPlaybookRun(db, {
      thesis_id: t.id, proposed_action: 'WATCHLIST', rationale: 'r', risks: ['x'],
    }).run;
    try { approvePlaybook(db, c.id, { decision: 'n/a' }); expect.unreachable('should throw'); }
    catch (e) { expect((e as PlaybookError).status).toBe(422); }
    // Missing run → 404.
    try { approvePlaybook(db, 'no-such-run', { decision: 'x' }); expect.unreachable('should throw'); }
    catch (e) { expect((e as PlaybookError).status).toBe(404); }
    db.close();
  });

  it('reject audits playbook.reject and records the decision', () => {
    const db = mkDb();
    const run = mkPending(db);
    const { run: rejected } = rejectPlaybook(db, run.id, { decision: '风险过高' });
    expect(rejected.approval_status).toBe('REJECTED');
    expect(rejected.human_decision).toBe('风险过高');
    const audits = db.prepare(`select * from audit_log where action = 'playbook.reject'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });
});

describe('executeApproved (restricted effects)', () => {
  it('CLOSE_THESIS approval closes the thesis through the transition guard', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const { run } = createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'CLOSE_THESIS',
      rationale: '逻辑已兑现', risks: ['过早关闭'],
    });
    const { run: approved, execution } = approvePlaybook(db, run.id, { decision: '同意关闭' });
    expect(approved.approval_status).toBe('APPROVED');
    expect(execution.executed).toBe(true);
    expect(getThesis(db, thesis.id)!.status).toBe('CLOSED');
    // The guard path wrote its own STATUS_CHANGE event.
    const changes = listThesisEvents(db, thesis.id).filter((e) => e.event_type === 'STATUS_CHANGE');
    expect(changes.some((e) => e.detail.to === 'CLOSED')).toBe(true);
    db.close();
  });

  it('a guard rejection leaves the playbook APPROVED and records execution_error in audit_log', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const { run } = createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'CLOSE_THESIS',
      rationale: '关闭', risks: ['r'],
    });
    // Force the thesis CLOSED behind the run's back → CLOSED→CLOSED is illegal.
    transitionThesis(db, thesis.id, 'CLOSED', 'raced');
    const { run: approved, execution } = approvePlaybook(db, run.id, { decision: '关闭它' });
    expect(approved.approval_status).toBe('APPROVED'); // approval stands
    expect(execution.executed).toBe(false);
    expect(execution.execution_error).toMatch(/illegal transition/);
    const audits: any[] = db
      .prepare(`select * from audit_log where action = 'playbook.execute' and target_id = ?`)
      .all(run.id);
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].detail).execution_error).toMatch(/illegal transition/);
    db.close();
  });

  it('PAPER_TRADE approval is a record only — no automated effect, no real trading', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const { run } = createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'PAPER_TRADE',
      rationale: '纸面跟踪', risks: ['r'],
    });
    const { execution } = approvePlaybook(db, run.id, { decision: '纸面记录' });
    expect(execution.executed).toBe(false);
    expect(execution.note).toMatch(/record/i);
    expect(getThesis(db, thesis.id)!.status).toBe('ACTIVE'); // untouched
    db.close();
  });
});

describe('suggestPlaybookAction', () => {
  const fakeLlm = (payload: unknown): LlmFn =>
    async () => ({ content: JSON.stringify(payload), model: 'fake-suggest-model' });

  it('returns an LLM suggestion with provenance and audits it — WITHOUT persisting a run', async () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const r = await suggestPlaybookAction(db, { thesis_id: thesis.id }, fakeLlm({
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
    expect(listPlaybookRuns(db)).toHaveLength(0);
    const audits = db.prepare(`select * from audit_log where action = 'playbook.suggest'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });

  it('downgrades a non-enum action to RESEARCH_MORE and records it in metadata + audit', async () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const r = await suggestPlaybookAction(db, { thesis_id: thesis.id }, fakeLlm({
      proposed_action: 'BUY_THE_DIP', rationale: 'r', risks: ['a', 'b'], confidence_note: 'c',
    }));
    expect(r.suggestion!.proposed_action).toBe('RESEARCH_MORE');
    expect(r.suggestion!.metadata.downgraded_from).toBe('BUY_THE_DIP');
    const audit: any = db.prepare(`select * from audit_log where action = 'playbook.suggest'`).get();
    expect(JSON.parse(audit.detail).downgraded_from).toBe('BUY_THE_DIP');
    db.close();
  });

  it('maps LLM failure / garbage output to structured results (never throws)', async () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const failing: LlmFn = async () => { throw new Error('boom'); };
    const r1 = await suggestPlaybookAction(db, { thesis_id: thesis.id }, failing);
    expect(r1.suggestion).toBeNull();
    expect(r1.llm.source).toBe('error');
    const noKey: LlmFn = async () => { throw new Error('no LLM provider configured'); };
    const r2 = await suggestPlaybookAction(db, { thesis_id: thesis.id }, noKey);
    expect(r2.llm.source).toBe('no-key');
    const garbage: LlmFn = async () => ({ content: 'not json at all', model: 'x' });
    const r3 = await suggestPlaybookAction(db, { thesis_id: thesis.id }, garbage);
    expect(r3.suggestion).toBeNull();
    expect(r3.llm.source).toBe('error');
    db.close();
  });

  it('rejects bad source refs: neither/both (422), missing (404)', async () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    const llm = fakeLlm({ proposed_action: 'RESEARCH_MORE', rationale: 'r', risks: ['a', 'b'], confidence_note: 'c' });
    await expect(suggestPlaybookAction(db, {}, llm)).rejects.toMatchObject({ status: 422 });
    await expect(
      suggestPlaybookAction(db, { thesis_id: thesis.id, memo_id: 'm' }, llm),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      suggestPlaybookAction(db, { thesis_id: 'missing' }, llm),
    ).rejects.toMatchObject({ status: 404 });
    db.close();
  });
});

describe('listPlaybookRuns', () => {
  it('lists newest first and filters by approval status', () => {
    const db = mkDb();
    const thesis = mkActiveThesis(db);
    createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'WATCHLIST', rationale: 'r', risks: ['x'],
    });
    createPlaybookRun(db, {
      thesis_id: thesis.id, proposed_action: 'PAPER_TRADE', rationale: 'r', risks: ['x'],
    });
    expect(listPlaybookRuns(db)).toHaveLength(2);
    const pending = listPlaybookRuns(db, { status: 'PENDING' });
    expect(pending).toHaveLength(1);
    expect(pending[0].proposed_action).toBe('PAPER_TRADE');
    db.close();
  });
});
