import { describe, expect, it } from 'vitest';
import { TOOLS, TOOLS_BY_NAME } from './tools';

describe('tool registry', () => {
  it('exposes the 8 P1 tools', () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ['dcf', 'financials', 'flows', 'perspectives', 'quote', 'radar', 'search', 'signals'].sort(),
    );
  });
  it('every tool has description + inputSchema + handler', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toHaveProperty('type', 'object');
      expect(typeof t.handler).toBe('function');
    }
  });
  it('TOOLS_BY_NAME indexes every tool', () => {
    for (const t of TOOLS) expect(TOOLS_BY_NAME[t.name]).toBe(t);
  });
});
