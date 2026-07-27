export const MAX_OUTPUT_TOKENS = 9000;
const MAX_MODEL_LABEL_CHARS = 200;

export function copilotUsageLabels(
  turns: ReadonlyArray<{ provider: string; model: string }>,
): { provider: string; model: string } {
  const pairs = new Set(turns.map(({ provider, model }) => `${provider}\u0000${model}`));
  if (pairs.size === 1 && turns[0]) {
    return { provider: turns[0].provider, model: turns[0].model };
  }

  const models = [...new Set(turns.map(({ model }) => model))].sort();
  const model = models.join('+');
  return {
    provider: 'mixed',
    model: model.length > 0 && model.length <= MAX_MODEL_LABEL_CHARS ? model : 'mixed',
  };
}

export function conservativeInputTokenEstimate(system: string, messages: readonly unknown[]): number {
  try {
    const serialized = JSON.stringify([{ role: 'system', content: system }, ...messages]);
    if (typeof serialized !== 'string') return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(serialized.length / 3));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
