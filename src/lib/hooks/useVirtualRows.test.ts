import { describe, expect, it } from 'vitest';
import { calculateVirtualRowWindow } from './useVirtualRows';

describe('calculateVirtualRowWindow', () => {
  it('renders the first viewport with overscan and a bottom spacer', () => {
    expect(calculateVirtualRowWindow(1_000, 50, 0, 500, 5)).toEqual({
      start: 0,
      end: 15,
      paddingTop: 0,
      paddingBottom: 49_250,
    });
  });

  it('keeps a bounded window in the middle of a large list', () => {
    expect(calculateVirtualRowWindow(1_000, 50, 25_000, 500, 5)).toEqual({
      start: 495,
      end: 515,
      paddingTop: 24_750,
      paddingBottom: 24_250,
    });
  });

  it('clamps the final viewport and empty input', () => {
    expect(calculateVirtualRowWindow(100, 40, 3_900, 400, 4)).toEqual({
      start: 93,
      end: 100,
      paddingTop: 3_720,
      paddingBottom: 0,
    });
    expect(calculateVirtualRowWindow(0, 40, 0, 400)).toEqual({ start: 0, end: 0, paddingTop: 0, paddingBottom: 0 });
  });
});
