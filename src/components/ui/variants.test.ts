import { describe, it, expect } from 'vitest';
import { buttonClasses, tagClasses, metricTrendClass } from './variants';

describe('buttonClasses', () => {
  it('builds primary/md by default', () => {
    const c = buttonClasses();
    expect(c).toContain('bg-[var(--accent)]');
    expect(c).toContain('px-4');
  });
  it('variant + size compose', () => {
    const c = buttonClasses('danger', 'sm');
    expect(c).toContain('text-[var(--down)]');
    expect(c).toContain('px-2.5');
    expect(c).not.toContain('bg-[var(--accent)]');
  });
  it('ghost variant has transparent background', () => {
    expect(buttonClasses('ghost')).toContain('bg-transparent');
  });
});

describe('tagClasses', () => {
  it.each([
    ['up', '--up'],
    ['down', '--down'],
    ['accent', '--accent'],
    ['neutral', '--text-dim'],
  ] as const)('tone %s uses %s', (tone, cssVar) => {
    expect(tagClasses(tone)).toContain(cssVar);
  });
});

describe('metricTrendClass', () => {
  it('maps sign to up/down/neutral', () => {
    expect(metricTrendClass(1.2)).toBe('text-[var(--up)]');
    expect(metricTrendClass(-0.4)).toBe('text-[var(--down)]');
    expect(metricTrendClass(0)).toBe('text-[var(--text-dim)]');
  });
});
