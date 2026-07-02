import { describe, expect, it } from 'vitest';
import { pePortfolioOutline } from './pe-portfolio';
import { outlineToMarkdown } from './ic-memo';

describe('pePortfolioOutline', () => {
  it('produces 3 sections', () => {
    const o = pePortfolioOutline('某某创投基金');
    expect(o.sections).toHaveLength(3);
    expect(o.sections.map((s) => s.idx)).toEqual([1, 2, 3]);
  });

  it('throws when fund is empty', () => {
    expect(() => pePortfolioOutline('')).toThrow('fund required');
    expect(() => pePortfolioOutline('  ')).toThrow('fund required');
  });

  it('throws when fund exceeds 100 chars', () => {
    expect(() => pePortfolioOutline('a'.repeat(101))).toThrow();
  });

  it('title and sections include the fund name', () => {
    const o = pePortfolioOutline('某某创投基金');
    expect(o.title).toContain('某某创投基金');
    expect(o.sections[0].brief).toContain('某某创投基金');
  });

  it('outlineToMarkdown renders all section titles', () => {
    const o = pePortfolioOutline('某某创投基金');
    const md = outlineToMarkdown(o);
    for (const s of o.sections) expect(md).toContain(s.title);
  });
});
