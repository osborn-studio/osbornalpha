import { describe, it, expect } from 'vitest';
import { AGENT_METHODS, METHODS } from './registry';
import { COMPANY_DILIGENCE } from './company-diligence';
import { INDUSTRY_CHAIN } from './industry-chain';
import { currentStepIndex } from './step-tracker';

// Fidelity guards for the two osborn-skill-catalog ports (industry-chain-diligence
// full 15-dimension framework, company-diligence 7-section brief).

describe('catalog method registration', () => {
  it('company-diligence is registered and surfaced in the skill hub', () => {
    expect(AGENT_METHODS['company-diligence']).toBe(COMPANY_DILIGENCE);
    const hub = METHODS.find((m) => m.id === 'company-diligence');
    expect(hub?.href).toBe('/copilot?method=company-diligence');
    expect(hub?.icon).toBe('🏢');
  });
  it('industry-chain keeps its stable id after the full-fidelity upgrade', () => {
    expect(AGENT_METHODS['industry-chain-diligence']).toBe(INDUSTRY_CHAIN);
  });
});

describe('company-diligence doctrine fidelity', () => {
  it('has the seven diligence sections', () => {
    expect(COMPANY_DILIGENCE.steps).toHaveLength(7);
    expect(COMPANY_DILIGENCE.steps.map((s) => s.title)).toEqual([
      '§1 主体与股权', '§2 主营与市场地位', '§3 业务与运营',
      '§4 财务概览', '§5 治理与管理层', '§6 风险与诉讼', '§7 前景与催化',
    ]);
  });
  it('is a rating-less brief — its output schema carries no buy/sell rating', () => {
    // The closing JSON is a diligence summary, not a verdict (no "rating" field),
    // so the copilot UI must not offer adopt-as-decision for it.
    expect(COMPANY_DILIGENCE.systemPrompt).not.toMatch(/"rating"/);
    expect(COMPANY_DILIGENCE.systemPrompt).toMatch(/"canonical_name"/);
    expect(COMPANY_DILIGENCE.systemPrompt).toMatch(/实体消歧优先/);
  });
  it('archives its run like the other deep methods', () => {
    expect(COMPANY_DILIGENCE.archive).toBe(true);
  });
});

describe('industry-chain full 15-dimension framework', () => {
  it('names all 15 dimensions and the 7-region default set', () => {
    expect(INDUSTRY_CHAIN.systemPrompt).toMatch(/15 维标准框架/);
    expect(INDUSTRY_CHAIN.systemPrompt).toMatch(/澳洲、日本、韩国、东南亚、欧洲、中国、北美/);
    expect(INDUSTRY_CHAIN.systemPrompt).toMatch(/关键跟踪高频指标/);
  });
});

describe('step tracker works on the new methods', () => {
  it('tracks company-diligence sections from streamed §N headers', () => {
    const text = '§1 主体…\n§2 主营…\n§3 业务与运营\n拉取 financials…';
    expect(currentStepIndex(COMPANY_DILIGENCE.steps, text)).toBe(3);
  });
  it('tracks the upgraded industry-chain sections', () => {
    expect(currentStepIndex(INDUSTRY_CHAIN.steps, '§1 …§2 …§3 …§4 …§5 全链综合')).toBe(5);
  });
});
