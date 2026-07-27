export const MAX_OUTPUT_TOKENS = 9000;

export function conservativeInputTokenEstimate(system: string, messages: readonly unknown[]): number {
  try {
    const serialized = JSON.stringify([{ role: 'system', content: system }, ...messages]);
    if (typeof serialized !== 'string') return Number.MAX_SAFE_INTEGER;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(serialized.length / 3));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
