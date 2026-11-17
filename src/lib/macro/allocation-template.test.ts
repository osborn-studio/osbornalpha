import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_LABELS,
  ALLOCATION_SOURCE,
  ALLOCATION_TEMPLATE,
  ALLOCATION_TEMPLATE_VERSION,
  allocationRows,
} from './allocation-template';

const order = ['recovery', 'overheat', 'stagflation', 'recession'] as const;
const strongest = ['equity', 'commodity', 'cash', 'bond'] as const;

describe('macro allocation template', () => {
  it('uses the approved version and exact illustrative ratios', () => {
    expect(ALLOCATION_TEMPLATE_VERSION).toBe('macro_allocation_template@v1');
    expect(ALLOCATION_TEMPLATE).toMatchObject({
      recovery: { equity: 60, bond: 15, commodity: 10, cash: 15 },
      overheat: { equity: 25, bond: 10, commodity: 45, cash: 20 },
      stagflation: { equity: 15, bond: 20, commodity: 20, cash: 45 },
      recession: { equity: 20, bond: 55, commodity: 5, cash: 20 },
    });
  });

  it('sums to 100 and has the cited strongest class in every regime', () => {
    for (const [index, regime] of order.entries()) {
      const { equity, bond, commodity, cash } = ALLOCATION_TEMPLATE[regime];
      const weights = { equity, bond, commodity, cash };
      expect(equity + bond + commodity + cash).toBe(100);
      expect(Object.keys(weights).filter((asset) => weights[asset as keyof typeof weights] === Math.max(...Object.values(weights)))).toEqual([strongest[index]]);
    }
  });

  it('returns the four rows in clock order with bilingual text', () => {
    const rows = allocationRows();
    expect(rows.map((row) => row.regime)).toEqual(order);
    for (const row of rows) {
      expect(row.weights).toEqual({
        equity: ALLOCATION_TEMPLATE[row.regime].equity,
        bond: ALLOCATION_TEMPLATE[row.regime].bond,
        commodity: ALLOCATION_TEMPLATE[row.regime].commodity,
        cash: ALLOCATION_TEMPLATE[row.regime].cash,
      });
      expect(row.tilt.zh.length).toBeGreaterThan(0);
      expect(row.tilt.en.length).toBeGreaterThan(0);
    }
  });

  it('cites the clock, distinguishes product values, and keeps required labels', () => {
    expect(ALLOCATION_SOURCE.zh).toMatch(/Merrill Lynch.*Greetham.*Hartnett.*2004/);
    expect(ALLOCATION_SOURCE.en).toMatch(/Merrill Lynch.*Greetham.*Hartnett.*2004/);
    expect(ALLOCATION_SOURCE.zh).toMatch(/本产品.*示意.*并非.*该文献/);
    expect(ALLOCATION_SOURCE.en).toMatch(/product.*illustrative.*not from that publication/i);
    expect(Object.values(ALLOCATION_LABELS.zh)).toEqual(['假设框架', '未经检验', '不构成投资建议']);
    expect(Object.values(ALLOCATION_LABELS.en)).toEqual(['Assumed framework', 'untested', 'not investment advice']);
  });

  it('uses no forecast or recommendation vocabulary in template copy', () => {
    const text = JSON.stringify({ ALLOCATION_TEMPLATE, ALLOCATION_SOURCE, ALLOCATION_LABELS });
    expect(text).not.toMatch(/概率|置信度|预测|推荐配置|probabilit|confidence|forecast|recommended allocation/i);
  });
});
