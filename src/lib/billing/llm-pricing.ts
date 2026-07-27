export interface NormalizedUsage {
  inputTokens: number;
  cacheHitInputTokens: number;
  cacheMissInputTokens: number;
  outputTokens: number;
  estimated: boolean;
}

export const PRICING_VERSION = 'deepseek-2026-04-24';
export const DEFAULT_USD_CNY_MICROS = 7_200_000;
export const DEFAULT_DAILY_LIMIT_MICRORMB = 8_800_000;
export const MAX_INPUT_TOKENS = 1_000_000;

const MICRO_USD_PER_USD = 1_000_000;
const TOKENS_PER_MILLION = 1_000_000;
const COST_DENOMINATOR = BigInt(MICRO_USD_PER_USD * TOKENS_PER_MILLION);
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

interface ModelPricing {
  version: typeof PRICING_VERSION;
  maxInputTokens: number;
  cacheHitInputMicroUsdPerMillionTokens: number;
  cacheMissInputMicroUsdPerMillionTokens: number;
  outputMicroUsdPerMillionTokens: number;
}

/**
 * All prices are micro-USD per one million tokens, avoiding float rounding in
 * cost calculation. Only entries with an explicitly reviewed price are valid.
 */
export const PRICE_REGISTRY: Record<string, ModelPricing> = {
  'deepseek:deepseek-v4-flash': {
    version: PRICING_VERSION,
    maxInputTokens: MAX_INPUT_TOKENS,
    cacheHitInputMicroUsdPerMillionTokens: 2_800,
    cacheMissInputMicroUsdPerMillionTokens: 140_000,
    outputMicroUsdPerMillionTokens: 280_000,
  },
};

type UnknownRecord = Record<string, unknown>;

const INPUT_TOKEN_KEYS = ['input_tokens', 'prompt_tokens'];
const OUTPUT_TOKEN_KEYS = ['output_tokens', 'completion_tokens'];
const CACHE_HIT_TOKEN_KEYS = [
  'prompt_cache_hit_tokens',
  'cache_hit_input_tokens',
  'cache_hit_tokens',
];
const CACHE_MISS_TOKEN_KEYS = [
  'prompt_cache_miss_tokens',
  'cache_miss_input_tokens',
  'cache_miss_tokens',
];
const DETAIL_CACHE_HIT_TOKEN_KEYS = ['cache_hit_tokens', 'cache_hit_input_tokens', 'cached_tokens'];
const DETAIL_CACHE_MISS_TOKEN_KEYS = ['cache_miss_tokens', 'cache_miss_input_tokens'];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!isRecord(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function safeNonNegativeInteger(value: unknown): number {
  return validNonNegativeInteger(value) ?? 0;
}

function firstValidNonNegativeInteger(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = validNonNegativeInteger(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function hasMalformedTokenValue(record: UnknownRecord, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key)
    && validNonNegativeInteger(record[key]) === undefined);
}

function hasMalformedUsageField(raw: UnknownRecord): boolean {
  if (
    hasMalformedTokenValue(raw, INPUT_TOKEN_KEYS)
    || hasMalformedTokenValue(raw, OUTPUT_TOKEN_KEYS)
    || hasMalformedTokenValue(raw, CACHE_HIT_TOKEN_KEYS)
    || hasMalformedTokenValue(raw, CACHE_MISS_TOKEN_KEYS)
  ) return true;

  if (!Object.prototype.hasOwnProperty.call(raw, 'prompt_tokens_details')) return false;
  if (!isPlainRecord(raw.prompt_tokens_details)) return true;
  return hasMalformedTokenValue(raw.prompt_tokens_details, DETAIL_CACHE_HIT_TOKEN_KEYS)
    || hasMalformedTokenValue(raw.prompt_tokens_details, DETAIL_CACHE_MISS_TOKEN_KEYS);
}

function cacheBreakdown(raw: UnknownRecord): { hit?: number; miss?: number; present: boolean } {
  const details = isPlainRecord(raw.prompt_tokens_details) ? raw.prompt_tokens_details : {};
  const hit = firstValidNonNegativeInteger(raw, CACHE_HIT_TOKEN_KEYS)
    ?? firstValidNonNegativeInteger(details, DETAIL_CACHE_HIT_TOKEN_KEYS);
  const miss = firstValidNonNegativeInteger(raw, CACHE_MISS_TOKEN_KEYS)
    ?? firstValidNonNegativeInteger(details, DETAIL_CACHE_MISS_TOKEN_KEYS);

  return { hit, miss, present: hit !== undefined || miss !== undefined };
}

/** Normalizes OpenAI-compatible usage, defaulting uncertain prompt tokens to cache misses. */
export function normalizeUsage(raw: unknown): NormalizedUsage {
  const usage = isRecord(raw) ? raw : {};
  const reportedInputTokens = firstValidNonNegativeInteger(usage, INPUT_TOKEN_KEYS);
  const reportedOutputTokens = firstValidNonNegativeInteger(usage, OUTPUT_TOKEN_KEYS);
  const hasMalformedField = hasMalformedUsageField(usage);
  const breakdown = cacheBreakdown(usage);
  const inputTokens = reportedInputTokens ?? Math.min(
    (breakdown.hit ?? 0) + (breakdown.miss ?? 0),
    MAX_SAFE_INTEGER,
  );
  const outputTokens = reportedOutputTokens ?? 0;
  const hasCompleteInputTotal = reportedInputTokens !== undefined
    || (breakdown.hit !== undefined && breakdown.miss !== undefined);
  const hasContradictoryBreakdown = reportedInputTokens !== undefined && breakdown.present
    && (
      (breakdown.hit !== undefined && breakdown.hit > reportedInputTokens)
      || (breakdown.miss !== undefined && breakdown.miss > reportedInputTokens)
      || (
        breakdown.hit !== undefined
        && breakdown.miss !== undefined
        && breakdown.hit !== reportedInputTokens - breakdown.miss
      )
    );

  let cacheHitInputTokens = 0;
  let cacheMissInputTokens = inputTokens;

  if (breakdown.present) {
    const hit = breakdown.hit ?? 0;
    const miss = breakdown.miss ?? 0;

    // An overlap is ambiguous. Billing every input token as a miss avoids
    // trusting an inconsistent response to reduce the reserved charge.
    if (hit <= inputTokens && hit + miss <= inputTokens) {
      cacheHitInputTokens = hit;
      cacheMissInputTokens = inputTokens - hit;
    }
  }

  return {
    inputTokens,
    cacheHitInputTokens,
    cacheMissInputTokens,
    outputTokens,
    estimated: usage.estimated === true
      || !hasCompleteInputTotal
      || reportedOutputTokens === undefined
      || hasContradictoryBreakdown
      || hasMalformedField,
  };
}

function pricingFor(provider: string, model: string): ModelPricing {
  const pricing = PRICE_REGISTRY[`${provider}:${model}`];
  if (!pricing) throw new Error('pricing_unavailable');
  return pricing;
}

export function maxInputTokensFor(provider: string, model: string): number {
  return pricingFor(provider, model).maxInputTokens;
}

function validFx(value: unknown): number {
  const normalized = safeNonNegativeInteger(value);
  return normalized > 0 ? normalized : DEFAULT_USD_CNY_MICROS;
}

function costFromTokenCounts(pricing: ModelPricing, cacheHitInputTokens: number, cacheMissInputTokens: number, outputTokens: number, usdCnyMicros: number): number {
  const numerator =
    BigInt(cacheHitInputTokens) * BigInt(pricing.cacheHitInputMicroUsdPerMillionTokens) * BigInt(usdCnyMicros)
    + BigInt(cacheMissInputTokens) * BigInt(pricing.cacheMissInputMicroUsdPerMillionTokens) * BigInt(usdCnyMicros)
    + BigInt(outputTokens) * BigInt(pricing.outputMicroUsdPerMillionTokens) * BigInt(usdCnyMicros);
  const roundedUp = (numerator + COST_DENOMINATOR - 1n) / COST_DENOMINATOR;

  return roundedUp > BigInt(MAX_SAFE_INTEGER) ? MAX_SAFE_INTEGER : Number(roundedUp);
}

export function calculateCostMicrormb(
  provider: string,
  model: string,
  usage: NormalizedUsage,
  usdCnyMicros = DEFAULT_USD_CNY_MICROS,
): number {
  const pricing = pricingFor(provider, model);
  const inputTokens = safeNonNegativeInteger(usage.inputTokens);
  const claimedHitTokens = safeNonNegativeInteger(usage.cacheHitInputTokens);
  const claimedMissTokens = safeNonNegativeInteger(usage.cacheMissInputTokens);
  const outputTokens = safeNonNegativeInteger(usage.outputTokens);

  // Hand-built normalized usage can understate input while still carrying
  // cache components. Account for every reported component and bill any
  // remainder as a cache miss.
  const declaredCacheTokens = claimedHitTokens + claimedMissTokens;
  const effectiveInputTokens = Math.max(inputTokens, declaredCacheTokens);
  const cacheHitInputTokens = declaredCacheTokens > inputTokens
    ? 0
    : Math.min(claimedHitTokens, effectiveInputTokens);
  const cacheMissInputTokens = effectiveInputTokens - cacheHitInputTokens;

  return costFromTokenCounts(
    pricing,
    cacheHitInputTokens,
    cacheMissInputTokens,
    outputTokens,
    validFx(usdCnyMicros),
  );
}

/** Calculates reviewed provider cost in USD without depending on an FX rate. */
export function calculateCostUsd(
  provider: string,
  model: string,
  usage: NormalizedUsage,
): number {
  return calculateCostMicrormb(provider, model, usage, MICRO_USD_PER_USD) / MICRO_USD_PER_USD;
}

export function reservationCostMicrormb(
  provider: string,
  model: string,
  estimatedInputTokens: number,
  maxOutputTokens: number,
  usdCnyMicros = DEFAULT_USD_CNY_MICROS,
): number {
  const pricing = pricingFor(provider, model);
  return costFromTokenCounts(
    pricing,
    0,
    safeNonNegativeInteger(estimatedInputTokens),
    safeNonNegativeInteger(maxOutputTokens),
    validFx(usdCnyMicros),
  );
}
