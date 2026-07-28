import { describe, it, expect } from 'vitest';
import { stepMarker, currentStepIndex } from './step-tracker';
import { AGENT_METHODS } from './registry';

const deepdive = AGENT_METHODS['hiphon-pm-deepdive'].steps;
const john = AGENT_METHODS['john-cameron-5step'].steps;

describe('stepMarker', () => {
  it('extracts §N from a step title', () => {
    expect(stepMarker('§3 财务质量')).toBe('§3');
    expect(stepMarker('§1 择时总闸（宏观/流动性）')).toBe('§1');
  });
  it('returns null when there is no marker', () => {
    expect(stepMarker('bottleneck analysis')).toBeNull();
  });
});

describe('currentStepIndex', () => {
  it('is 0 before any section header appears', () => {
    expect(currentStepIndex(deepdive, '正在拉取数据…')).toBe(0);
  });
  it('tracks the furthest deep-dive section written so far', () => {
    const text = '§1 解析与数据\n...\n§2 商业模式\n...\n§3 财务质量\nROE 趋势…';
    expect(currentStepIndex(deepdive, text)).toBe(3);
  });
  it('reaches the final step when the last header is present', () => {
    const text = '§1 …§2 …§3 …§4 …§5 …§6 委员会结论';
    expect(currentStepIndex(deepdive, text)).toBe(6);
  });
  it('works for the five-step method too', () => {
    expect(currentStepIndex(john, '§1 …§2 …§3 评级')).toBe(3);
    expect(john).toHaveLength(5);
  });
  it('does not miscount out-of-order markers (tracks max reached)', () => {
    // model writes §1 then §2; even if it references §1 again later, stays at 2
    expect(currentStepIndex(john, '§1 …§2 …回到 §1 的结论')).toBe(2);
  });
});
