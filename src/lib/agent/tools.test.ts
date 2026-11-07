import { describe, expect, it, vi } from 'vitest';
import { TOOLS, TOOLS_BY_NAME } from './tools';

describe('tool registry', () => {
  it('exposes the expected tools', () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'calendar', 'dcf', 'financials', 'flows', 'holders', 'kline', 'perspectives', 'quote', 'radar', 'search', 'signals',
        'record_decision', 'get_portfolio', 'save_artifact', 'review_earnings_quality',
      ].sort(),
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
  it('invokes the digest-pinned financial candidate without external network', async()=>{
    const {default:fixtures}=await import('../research/earnings-quality-vendor/quality-fixtures.json');
    const tool=TOOLS_BY_NAME.review_earnings_quality;
    expect(tool).toBeDefined();
    const result=await tool.handler({input_json:JSON.stringify(fixtures.cases[0].input)},{origin:'https://unused.invalid'}) as {output:{current:{cashConversion:{value:number}}};sourceCommit:string};
    expect(result.output.current.cashConversion.value).toBe(1.5);
    expect(result.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });
  it('rejects incomplete packets without inventing ticker-derived source facts',async()=>{
    const tool=TOOLS_BY_NAME.review_earnings_quality;
    expect(tool).toBeDefined();
    await expect(tool.handler({input_json:'{"ticker":"AAPL"}'},{origin:'https://unused.invalid'})).rejects.toThrow();
  });
 it('financials covers A/US via the company packet, no aShareOnly flag (spec §9.2)', async () => {
  const tool = TOOLS_BY_NAME.financials;
  expect(tool.aShareOnly).toBeUndefined();
  expect(tool.description).toContain('A/US');
  expect(tool.description).toContain('clipped');
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  await tool.handler({ ticker: 'BRK.A' }, { origin: 'https://alpha.example' });
  expect(spy).toHaveBeenCalledWith('https://alpha.example/api/companies/BRK.A/packet', expect.objectContaining({ cache: 'no-store' }));
  spy.mockRestore();
  for (const name of ['flows', 'holders', 'calendar']) expect(TOOLS_BY_NAME[name].aShareOnly).toBe(true);
 });
});
