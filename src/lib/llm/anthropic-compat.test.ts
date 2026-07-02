import { describe, it, expect } from 'vitest';
import { oaiToAnthropic, toolDefsToAnthropic, responseToTurn } from './anthropic-compat';

describe('oaiToAnthropic', () => {
  it('converts user/assistant text messages', () => {
    const out = oaiToAnthropic([
      { role: 'user', content: '分析300750' },
      { role: 'assistant', content: '好的' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: [{ type: 'text', text: '分析300750' }] },
      { role: 'assistant', content: [{ type: 'text', text: '好的' }] },
    ]);
  });

  it('converts assistant tool_calls to tool_use blocks', () => {
    const out = oaiToAnthropic([
      {
        role: 'assistant', content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_quote', arguments: '{"ticker":"NVDA"}' } }],
      },
    ]);
    expect(out).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'get_quote', input: { ticker: 'NVDA' } }] },
    ]);
  });

  it('converts tool results to user tool_result blocks and keeps assistant text alongside tool_use', () => {
    const out = oaiToAnthropic([
      {
        role: 'assistant', content: '先查行情',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_quote', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"price":480}' },
    ]);
    expect(out[0].content).toEqual([
      { type: 'text', text: '先查行情' },
      { type: 'tool_use', id: 'c1', name: 'get_quote', input: {} },
    ]);
    expect(out[1]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"price":480}' }],
    });
  });

  it('merges consecutive tool results into one user message', () => {
    const out = oaiToAnthropic([
      {
        role: 'assistant', content: '',
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } },
          { id: 'b', type: 'function', function: { name: 'y', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'a', content: '1' },
      { role: 'tool', tool_call_id: 'b', content: '2' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].content).toHaveLength(2);
  });
});

describe('toolDefsToAnthropic', () => {
  it('maps parameters to input_schema', () => {
    expect(toolDefsToAnthropic([{ name: 't', description: 'd', parameters: { type: 'object' } }]))
      .toEqual([{ name: 't', description: 'd', input_schema: { type: 'object' } }]);
  });
});

describe('responseToTurn', () => {
  it('extracts text, tool_use blocks and stop_reason', () => {
    const turn = responseToTurn({
      content: [
        { type: 'text', text: '结论' },
        { type: 'tool_use', id: 'c9', name: 'get_quote', input: { ticker: '0700' } },
      ],
      stop_reason: 'tool_use',
    });
    expect(turn).toEqual({
      content: '结论',
      toolCalls: [{ id: 'c9', name: 'get_quote', arguments: { ticker: '0700' } }],
      finishReason: 'tool_use',
    });
  });
});
