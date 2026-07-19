import { describe, expect, it, vi } from 'vitest';
import { runCopilotLoop, type CopilotEvent } from './loop';

describe('runCopilotLoop (OpenAI tool-calling)', () => {
  it('supports an additive run identity event', () => {
    const event: CopilotEvent = {
      type: 'run',
      run_id: '00000000-0000-0000-0000-000000000001',
    };

    expect(event.type).toBe('run');
  });

  it('executes a tool_call then emits a verdict', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({
        content: '先看雷达。',
        toolCalls: [{ id: 'tc1', name: 'radar', arguments: { ticker: 'NVDA' } }],
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '结论。\n```json\n{"ticker":"NVDA","rating":"增持","positionPct":5}\n```',
        toolCalls: [],
        finishReason: 'stop',
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

    // The assistant tool_calls message must serialize arguments as a JSON string,
    // and a `tool` result message must follow with the matching tool_call_id.
    const secondCallMessages = model.mock.calls[1][0];
    const asst = secondCallMessages.find((m: any) => m.role === 'assistant' && m.tool_calls);
    expect(asst.tool_calls[0].function.arguments).toBe('{"ticker":"NVDA"}');
    const toolMsg = secondCallMessages.find((m: any) => m.role === 'tool');
    expect(toolMsg.tool_call_id).toBe('tc1');
  });

  it('starts independent tool calls from the same model turn concurrently', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'tc-quote', name: 'quote', arguments: { ticker: 'NVDA' } },
          { id: 'tc-radar', name: 'radar', arguments: { ticker: 'NVDA' } },
        ],
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '完成。',
        toolCalls: [],
        finishReason: 'stop',
      });
    const started: string[] = [];
    const release: Array<() => void> = [];
    const runTool = vi.fn((name: string) => new Promise((resolve) => {
      started.push(name);
      release.push(() => resolve({ ok: true }));
    }));

    const pending = runCopilotLoop({
      ticker: 'NVDA',
      model,
      runTool,
      maxHops: 5,
      onEvent: () => {},
    });

    await vi.waitFor(() => expect(started).toEqual(['quote', 'radar']));
    release.forEach((resolve) => resolve());
    await pending;
  });

  it('marks max-hop exhaustion as a failure before emitting done', async () => {
    const model = vi.fn().mockResolvedValue({
      content: '', toolCalls: [{ id: 'x', name: 'radar', arguments: { ticker: 'NVDA' } }], finishReason: 'tool_calls',
    });
    const events: CopilotEvent[] = [];
    await runCopilotLoop({ ticker: 'NVDA', model, runTool: async () => ({}), maxHops: 2, onEvent: (e) => events.push(e) });
    expect(model).toHaveBeenCalledTimes(2);
    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });

  it('treats an empty final response as a provider failure', async () => {
    const events: CopilotEvent[] = [];
    await runCopilotLoop({
      ticker: 'NVDA',
      model: async () => ({ content: '', toolCalls: [], finishReason: 'length' }),
      runTool: async () => ({}),
      maxHops: 2,
      onEvent: (event) => events.push(event),
    });

    const error = events.find((event) => event.type === 'error');
    expect(error).toMatchObject({ type: 'error' });
    expect((error as Extract<CopilotEvent, { type: 'error' }>).message).toContain('empty response');
    expect(events.at(-1)?.type).toBe('done');
  });
});
