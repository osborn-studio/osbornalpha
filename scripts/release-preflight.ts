import { maxInputTokensFor, PRICING_VERSION } from '../src/lib/billing/llm-pricing';
import { platformBaseUrl, platformBaseUrlErrorMessage } from '../src/lib/llm/platform-base-url';
import { resolvePlatformLlm } from '../src/lib/llm/resolve';

const serviceRoleConfigured =
  typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string'
  && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0;
if (!serviceRoleConfigured) {
  throw new Error('release preflight failed: SUPABASE_SERVICE_ROLE_KEY is required');
}

const override = platformBaseUrl();
if (override.kind === 'invalid') {
  throw new Error(`release preflight failed: LLM_BASE_URL rejected (${override.reason}): ${platformBaseUrlErrorMessage(override.reason)}`);
}
if (override.kind === 'ignored') {
  throw new Error('release preflight failed: LLM_BASE_URL is set but LLM_PROVIDER is not pinned');
}
if (override.kind === 'ok' && override.insecure) {
  console.warn('Platform key and all prompt content will cross the network unencrypted over HTTP.');
}

const llm = resolvePlatformLlm();
if (!llm) {
  throw new Error('release preflight failed: platform LLM provider/key is not configured');
}

// Throws pricing_unavailable unless this exact production pair was reviewed.
const maxInputTokens = maxInputTokensFor(llm.provider, llm.model);

// Never print credentials or their fingerprints. This output is safe to retain
// in release logs and proves only the selected public configuration identity.
console.log(JSON.stringify({
  ok: true,
  provider: llm.provider,
  model: llm.model,
  baseUrlHost: override.kind === 'ok' ? override.host : null,
  baseUrlInsecure: override.kind === 'ok' && override.insecure,
  pricingVersion: PRICING_VERSION,
  maxInputTokens,
  serviceRoleConfigured: true,
}));
