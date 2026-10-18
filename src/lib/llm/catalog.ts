// Settings-page catalog views over the provider table and the models.json snapshot.
// Registry data only: no secrets, no user data.
import { PROVIDERS, PROVIDER_IDS } from './providers';
import { NON_CHAT, referencePrice, registryModels } from './registry/derive';

export interface CatalogProvider {
  id: string;
  legacyId: string | null;
  label: string;
  protocol: 'openai' | 'anthropic';
  region: string;
  suggestedModel: string | null;
  keyUrl: string | null;
  docsUrl: string | null;
}

export interface CatalogModel {
  id: string;
  context: number;
  output: number;
  reasoning: boolean;
  structured_output: boolean;
  /** Micro-CNY per million tokens; `reference` is true when converted from a USD list price. */
  price: { input: number; output: number; reference: boolean } | null;
  hint: string | null;
}

export function catalogProviders(): CatalogProvider[] {
  return PROVIDER_IDS.map((id) => {
    const p = PROVIDERS[id];
    return { id: p.id, legacyId: p.legacyId, label: p.label, protocol: p.protocol, region: p.region, suggestedModel: p.suggestedModel, keyUrl: p.keyUrl, docsUrl: p.docsUrl };
  });
}

export function catalogModels(providerId: string): CatalogModel[] {
  const catalog = registryModels.providers[providerId] ?? {};
  return Object.entries(catalog)
    .filter(([id]) => !NON_CHAT.test(id))
    .map(([id, m]) => {
      const price = referencePrice(m);
      return {
        id,
        context: m.context,
        output: m.output,
        reasoning: m.reasoning,
        structured_output: m.structured_output,
        price: price ? { input: price.input, output: price.output, reference: price.reference } : null,
        hint: m.hint_zh ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

