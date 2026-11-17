import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AllocationTemplateCard } from './AllocationTemplateCard';
import en from '../../../messages/en/macro.json';
import zh from '../../../messages/zh/macro.json';
import { ALLOCATION_LABELS, ALLOCATION_SOURCE, allocationRows } from '@/lib/macro/allocation-template';

const { localeState } = vi.hoisted(() => ({ localeState: { value: 'en' as 'zh' | 'en' } }));
vi.mock('./use-macro-t', () => ({
  useMacroT: () => ({
    locale: localeState.value,
    t: (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], localeState.value === 'zh' ? zh : en) as string,
  }),
}));

describe('allocation template card', () => {
  for (const locale of ['zh', 'en'] as const) {
    const messages = locale === 'zh' ? zh : en;
    it(`${locale}: marks exactly the selected regime, or none for static reference`, () => {
      localeState.value = locale;
      for (const current of ['recovery', 'overheat', 'stagflation', 'recession', null] as const) {
        const html = renderToStaticMarkup(createElement(AllocationTemplateCard, { current }));
        expect((html.match(/aria-current="true"/g) ?? []).length).toBe(current ? 1 : 0);
        expect((html.match(/data-current="true"/g) ?? []).length).toBe(current ? 1 : 0);
        if (current) expect(html).toContain(messages.judgment.allocation.current);
        else expect(html).toContain(messages.judgment.allocation.staticReference);
        for (const label of Object.values(messages.judgment.allocation.labels)) expect(html).toContain(label);
        expect(html).toContain('macro_allocation_template@v1');
        const rowMarkup = html.match(/<li\b[\s\S]*?<\/li>/g) ?? [];
        expect(rowMarkup).toHaveLength(4);
        allocationRows().forEach((row, index) => {
          expect(rowMarkup[index]).toContain(messages.judgment.clock[row.regime]);
          expect(rowMarkup[index].includes('aria-current="true"')).toBe(row.regime === current);
          for (const weight of Object.values(row.weights)) expect(rowMarkup[index]).toContain(`${weight}%`);
          expect(rowMarkup[index]).toContain(messages.judgment.allocation.tilt[row.regime]);
        });
        expect(html).not.toMatch(/概率|置信度|预测|推荐配置|probabilit|confidence|forecast|recommended allocation/i);
      }
    });
    it(`${locale}: keeps localized copy aligned with the static template`, () => {
      expect(messages.judgment.allocation.labels).toEqual(ALLOCATION_LABELS[locale]);
      expect(messages.judgment.allocation.source).toBe(ALLOCATION_SOURCE[locale]);
      for (const row of allocationRows()) expect(messages.judgment.allocation.tilt[row.regime]).toBe(row.tilt[locale]);
    });
  }
});
