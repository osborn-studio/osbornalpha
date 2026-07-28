import { describe, expect, it } from 'vitest';
import { lpTrackingOutline } from './lp-tracking';
import { outlineToMarkdown } from './ic-memo';

describe('lpTrackingOutline', () => {
  it('produces one section per name', () => {
    const o = lpTrackingOutline(['机构A', '机构B', '机构C']);
    expect(o.sections).toHaveLength(3);
    expect(o.sections.map((s) => s.title)).toEqual(['机构A', '机构B', '机构C']);
  });

  it('truncates to 20 names when more are given', () => {
    const names = Array.from({ length: 25 }, (_, i) => `机构${i + 1}`);
    const o = lpTrackingOutline(names);
    expect(o.sections).toHaveLength(20);
    expect(o.sections[19].title).toBe('机构20');
  });

  it('defaults window label to 近一个月 and reflects it in subtitle', () => {
    const o = lpTrackingOutline(['机构A']);
    expect(o.subtitle).toContain('近一个月');
  });

  it('custom window label appears in subtitle', () => {
    const o = lpTrackingOutline(['机构A'], '近一周');
    expect(o.subtitle).toContain('近一周');
    expect(o.subtitle).not.toContain('近一个月');
  });

  it('each section brief covers the five move-types', () => {
    const o = lpTrackingOutline(['机构A']);
    const brief = o.sections[0].brief;
    for (const kw of ['新增投资', '市场拓展', '撤资', '退出', '投资成果', '表态']) {
      expect(brief).toContain(kw);
    }
  });

  it('throws when names is empty', () => {
    expect(() => lpTrackingOutline([])).toThrow('names required');
  });

  it('outlineToMarkdown renders all names as section titles', () => {
    const o = lpTrackingOutline(['机构A', '机构B']);
    const md = outlineToMarkdown(o);
    expect(md).toContain('机构A');
    expect(md).toContain('机构B');
  });
});
