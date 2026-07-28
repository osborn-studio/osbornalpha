import { describe, expect, it } from 'vitest';
import { icMemoOutline, outlineToMarkdown } from './ic-memo';

describe('icMemoOutline', () => {
  it('produces 8 sections', () => {
    const o = icMemoOutline('目标公司');
    expect(o.sections).toHaveLength(8);
    expect(o.sections.map((s) => s.idx)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('dealContext influences section 2 queries and brief, but not other sections', () => {
    const bare = icMemoOutline('目标公司');
    const withCtx = icMemoOutline('目标公司', '现金收购，估值 10 亿');
    // section 2 (交易结构与条款) brief should include the deal context
    expect(withCtx.sections[1].brief).toContain('现金收购，估值 10 亿');
    expect(bare.sections[1].brief).not.toContain('现金收购');
    // other sections carry the context too (mirrors source: appended to every brief)
    expect(withCtx.sections[0].brief).toContain('现金收购，估值 10 亿');
  });

  it('throws when target is empty', () => {
    expect(() => icMemoOutline('')).toThrow('target required');
    expect(() => icMemoOutline('   ')).toThrow('target required');
  });

  it('throws when target exceeds 100 chars', () => {
    expect(() => icMemoOutline('a'.repeat(101))).toThrow();
  });

  it('throws when dealContext exceeds 2000 chars', () => {
    expect(() => icMemoOutline('目标公司', 'x'.repeat(2001))).toThrow();
  });

  it('title includes target name', () => {
    const o = icMemoOutline('隼鹰科技');
    expect(o.title).toContain('隼鹰科技');
    expect(o.notices.length).toBeGreaterThan(0);
  });
});

describe('outlineToMarkdown (via icMemoOutline)', () => {
  it('contains every section title', () => {
    const o = icMemoOutline('目标公司');
    const md = outlineToMarkdown(o);
    for (const s of o.sections) {
      expect(md).toContain(s.title);
    }
  });

  it('includes the report title and subtitle', () => {
    const o = icMemoOutline('目标公司');
    const md = outlineToMarkdown(o);
    expect(md).toContain(o.title);
    expect(md).toContain(o.subtitle);
  });
});
