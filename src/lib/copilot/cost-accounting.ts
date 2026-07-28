import type { NormalizedUsage } from '@/lib/billing/llm-pricing';

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

function saturatedAdd(left: number, right: number): { value: number; saturated: boolean } {
  if (
    !Number.isSafeInteger(left)
    || left < 0
    || !Number.isSafeInteger(right)
    || right < 0
    || left > Number.MAX_SAFE_INTEGER - right
  ) return { value: Number.MAX_SAFE_INTEGER, saturated: true };
  return { value: left + right, saturated: false };
}

export function aggregateNormalizedUsage(
  left: NormalizedUsage,
  right: NormalizedUsage,
): NormalizedUsage {
  const input = saturatedAdd(left.inputTokens, right.inputTokens);
  const output = saturatedAdd(left.outputTokens, right.outputTokens);
  const hit = saturatedAdd(left.cacheHitInputTokens, right.cacheHitInputTokens);
  const miss = saturatedAdd(left.cacheMissInputTokens, right.cacheMissInputTokens);
  const cacheTotal = saturatedAdd(hit.value, miss.value);
  const inconsistent = cacheTotal.saturated || cacheTotal.value !== input.value;
  const estimated = left.estimated
    || right.estimated
    || input.saturated
    || output.saturated
    || hit.saturated
    || miss.saturated
    || inconsistent;

  return {
    inputTokens: input.value,
    cacheHitInputTokens: estimated && (input.saturated || inconsistent) ? 0 : hit.value,
    cacheMissInputTokens: estimated && (input.saturated || inconsistent) ? input.value : miss.value,
    outputTokens: output.value,
    estimated,
  };
}

/** Informational approximation only; monetary reservations use reviewed model context limits. */
export function estimateSerializedTokens(system: string, messages: readonly unknown[]): number {
  try {
    const serialized = JSON.stringify([{ role: 'system', content: system }, ...messages]);
    if (typeof serialized !== 'string') return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(serialized.length / 3));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
