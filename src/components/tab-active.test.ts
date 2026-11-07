import { describe, expect, it } from 'vitest';
import { isTabActive } from './tab-active';

describe('isTabActive', () => {
  it.each([
    ['/macro', '/macro', true],
    ['/macro/transmission', '/macro', true],
    ['/macro/US_UNRATE', '/macro', true],
    ['/macrofoo', '/macro', false],
    ['/intel/methods/x', '/intel', true],
    ['/intel', '/macro', false],
    ['/watchlist', '/macro', false],
  ])('matches %s against %s as %s', (pathname, href, expected) => {
    expect(isTabActive(pathname, href)).toBe(expected);
  });
});
