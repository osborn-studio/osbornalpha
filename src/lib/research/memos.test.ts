import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb, type ResearchDb } from './db';
import { seedResearchData } from './seed';
import { upsertEntity, listEntities } from './entities';
import { ingestSource } from './sources';
import {
  generateMemo,
  patchMemo,
  reviewMemo,
  getMemo,
  memoToMarkdown,
  MemoError,
  type LlmFn,
} from './memos';
import { RESEARCH_DISCLAIMER } from './types';

let db: ResearchDb;
let nvdaId: string;
let srcIds: string[];

beforeEach(() => {
  db = openTestDb();
  seedResearchData(db);
  nvdaId = listEntities(db, { type: 'COMPANY', q: 'nvidia' })[0].id;
  srcIds = [
    ingestSource(db, {
      source_type: 'EARNINGS_CALL', title: 'NVDA FY26 Q1 call',
      raw_text: 'Data center revenue grew 70% yoy.', entity_ids: [nvdaId],
    }).id,
    ingestSource(db, {
      source_type: 'NEWS', title: 'Blackwell supply update',
      raw_text: 'Blackwell shipments ramping at TSMC.', entity_ids: [nvdaId],
    }).id,
    ingestSource(db, {
      source_type: 'NOTE', title: 'ASIC competition note',
      raw_text: 'Hyperscalers accelerating custom ASIC programs.', entity_ids: [nvdaId],
    }).id,
  ];
});

function fakeLlm(payload: unknown): LlmFn {
  return async () => ({ content: JSON.stringify(payload), model: 'fake-model' });
}

function goodPayload() {
  return {
    title: 'NVDA 推理需求 memo',
    one_line_conclusion: '推理需求仍在超预期增长',
    thesis: 'DC GPU 供不应求持续',
    supporting_evidence: [
      { claim: 'DC 营收同比 +70%', source_document_ids: [srcIds[0]] },
      { claim: 'Blackwell 产能爬坡', source_document_ids: [srcIds[1]] },
      { claim: '无来源的断言', source_document_ids: ['hallucinated-id'] },
    ],
    counter_arguments: [
      { claim: 'ASIC 替代加速', source_document_ids: [srcIds[2]] },
      { claim: '资本开支周期见顶风险', source_document_ids: [srcIds[0]] },
    ],
    key_variables: ['token 单价', 'capex 指引'],
    invalidation_conditions: ['推理单价季度环比下滑超 30%'],
    open_questions: ['Rubin 时间表?'],
    related_impacts: ['TSMC 产能受益'],
    confidence: 'MEDIUM',
  };
}

describe('generateMemo', () => {
  it('persists a DRAFT memo with citations, axiom results, provenance and audit log', async () => {
    const res = await generateMemo(db, { entity_id: nvdaId }, fakeLlm(goodPayload()));
    expect(res.llm).toEqual({ source: 'llm', model: 'fake-model' });
    const memo = res.memo!;
    expect(memo.status).toBe('DRAFT');
    expect(memo.company_ids).toEqual([nvdaId]);
    // Hallucinated citation stripped → LOW_CONFIDENCE + mirrored open question.
    const uncited = memo.supporting_evidence.find((e) => e.claim === '无来源的断言')!;
    expect(uncited.low_confidence).toBe(true);
    expect(memo.open_questions.some((q) => q.includes('无来源的断言'))).toBe(true);
    // Provenance is complete.
    expect(memo.provenance.model).toBe('fake-model');
    expect(memo.provenance.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(memo.provenance.source_document_ids).toEqual(expect.arrayContaining(srcIds));
    expect(memo.provenance.generated_at).toBeTruthy();
    expect(memo.provenance.edits).toEqual([]);
    // Axiom results stored; all pass for this payload.
    expect(memo.axiom_check_results).toHaveLength(5);
    expect(memo.axiom_check_results.every((r) => r.passed)).toBe(true);
    // Audit trail.
    const audit = db.prepare(`select * from audit_log where action='memo.generate'`).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].target_id).toBe(memo.id);
  });

  it('returns structured no-key/error results without persisting a memo', async () => {
    const noKey: LlmFn = async () => { throw new Error('No LLM provider configured (set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)'); };
    const r1 = await generateMemo(db, { entity_id: nvdaId }, noKey);
    expect(r1.memo).toBeNull();
    expect(r1.llm.source).toBe('no-key');

    const broken: LlmFn = async () => { throw new Error('upstream 500'); };
    const r2 = await generateMemo(db, { entity_id: nvdaId }, broken);
    expect(r2.llm.source).toBe('error');

    const garbage: LlmFn = async () => ({ content: 'not json at all', model: 'm' });
    const r3 = await generateMemo(db, { entity_id: nvdaId }, garbage);
    expect(r3.memo).toBeNull();
    expect(r3.llm.source).toBe('error');

    expect(db.prepare(`select count(*) c from memos`).get().c).toBe(0);
  });

  it('404s unknown entity and tags THEME memos under theme_ids', async () => {
    await expect(generateMemo(db, { entity_id: 'nope' }, fakeLlm(goodPayload()))).rejects.toThrow(MemoError);
    const theme = upsertEntity(db, { type: 'THEME', name: 'AI inference' });
    const res = await generateMemo(db, { entity_id: theme }, fakeLlm({ ...goodPayload(), supporting_evidence: [], counter_arguments: [] }));
    expect(res.memo!.theme_ids).toEqual([theme]);
    expect(res.memo!.company_ids).toEqual([]);
  });
});

describe('patchMemo', () => {
  it('updates fields, appends provenance edits, re-runs axioms', async () => {
    const { memo } = await generateMemo(db, { entity_id: nvdaId }, fakeLlm(goodPayload())) as { memo: NonNullable<any> };
    const patched = patchMemo(db, memo.id, {
      one_line_conclusion: '这只票必涨',   // triggers AX005
      key_variables: ['hbm 供给'],
    });
    expect(patched.one_line_conclusion).toBe('这只票必涨');
    expect(patched.provenance.edits).toHaveLength(1);
    expect(patched.provenance.edits![0].fields.sort()).toEqual(['key_variables', 'one_line_conclusion']);
    const ax005 = patched.axiom_check_results.find((r: any) => r.axiom_code === 'AX005')!;
    expect(ax005.passed).toBe(false);
  });

  it('rejects empty patches, bad confidence, unknown memo', async () => {
    const { memo } = await generateMemo(db, { entity_id: nvdaId }, fakeLlm(goodPayload())) as { memo: NonNullable<any> };
    expect(() => patchMemo(db, memo.id, {})).toThrow(/no editable fields/);
    expect(() => patchMemo(db, memo.id, { confidence: 'ULTRA' })).toThrow(/confidence/);
    expect(() => patchMemo(db, 'missing', { title: 'x' })).toThrow(/not found/);
  });
});

describe('reviewMemo', () => {
  it('blocks review while a BLOCK axiom fails, passes after fix', async () => {
    const payload = { ...goodPayload(), invalidation_conditions: [] };  // AX001 fails
    const { memo } = await generateMemo(db, { entity_id: nvdaId }, fakeLlm(payload)) as { memo: NonNullable<any> };
    const rejected = reviewMemo(db, memo.id);
    expect(rejected.ok).toBe(false);
    expect(getMemo(db, memo.id)!.status).toBe('DRAFT');

    patchMemo(db, memo.id, { invalidation_conditions: ['推理需求连续两季负增长'] });
    const approved = reviewMemo(db, memo.id);
    expect(approved.ok).toBe(true);
    expect(approved.memo.status).toBe('REVIEWED');
    const audits = db.prepare(`select * from audit_log where action='memo.review' order by created_at`).all();
    expect(audits).toHaveLength(2);
  });

  it('WARN-only failures do not block review', async () => {
    const lowSrc = ingestSource(db, {
      source_type: 'NEWS', title: 'rumor', raw_text: 'unverified rumor text',
      trust_level: 'LOW', entity_ids: [nvdaId],
    }).id;
    const payload = {
      ...goodPayload(),
      supporting_evidence: [{ claim: '传闻大单', source_document_ids: [lowSrc] }],
    };
    const { memo } = await generateMemo(db, { entity_id: nvdaId }, fakeLlm(payload)) as { memo: NonNullable<any> };
    const res = reviewMemo(db, memo.id);
    expect(res.results.find((r) => r.axiom_code === 'AX004')!.passed).toBe(false);
    expect(res.ok).toBe(true);
  });
});

describe('memoToMarkdown', () => {
  it('renders all ten sections with numbered citations and the disclaimer', async () => {
    const { memo } = await generateMemo(db, { entity_id: nvdaId }, fakeLlm(goodPayload())) as { memo: NonNullable<any> };
    const sources = db.prepare(`select * from source_documents`).all()
      .map((r: any) => ({ ...r, entity_ids: JSON.parse(r.entity_ids) }));
    const md = memoToMarkdown(memo, sources);
    for (const heading of [
      '## 1. 一句话结论', '## 2. 核心 Thesis', '## 3. 支持证据', '## 4. 反方观点',
      '## 5. 关键变量', '## 6. 失效条件', '## 7. 需要继续验证的问题',
      '## 8. 相关公司/产业链影响', '## 9. 引用来源', '## 10. Axiom 检查结果',
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toMatch(/DC 营收同比 \+70% \[\d\]/);
    expect(md).toContain('LOW_CONFIDENCE');
    expect(md).toContain(RESEARCH_DISCLAIMER);
  });
});
