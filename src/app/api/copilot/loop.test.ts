import { describe, expect, it, vi } from 'vitest';
import { runCopilotLoop, type CopilotEvent } from './loop';

describe('runCopilotLoop', () => {
  it('executes a tool_use then emits a verdict', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          { type: 'text', text: '先看雷达。' },
          { type: 'tool_use', id: 'tu1', name: 'radar', input: { ticker: 'NVDA' } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: '结论。\n```json\n{"ticker":"NVDA","rating":"增持","positionPct":5}\n```' }],
      });
    const runTool = vi.fn().mockResolvedValue({ price: 1000, bias: 'bull' });
    const events: CopilotEvent[] = [];
    await runCopilotLoop({ ticker: 'NVDA', model, runTool, maxHops: 5, onEvent: (e) => events.push(e) });

    expect(runTool).toHaveBeenCalledWith('radar', { ticker: 'NVDA' });
    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('verdict');
    const verdict = events.find((e) => e.type === 'verdict') as any;
    expect(verdict.data.rating).toBe('增持');
    expect(types[types.length - 1]).toBe('done');
  });

  it('stops at maxHops and still emits done', async () => {
    const model = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'tool_use', id: 'x', name: 'radar', input: { ticker: 'NVDA' } }],
    });
    const events: CopilotEvent[] = [];
    await runCopilotLoop({ ticker: 'NVDA', model, runTool: async () => ({}), maxHops: 2, onEvent: (e) => events.push(e) });
    expect(model).toHaveBeenCalledTimes(2);
    expect(events[events.length - 1].type).toBe('done');
  });
});
