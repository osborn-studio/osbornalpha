// Provider and model catalog for the settings page: registry data only, no secrets, no user data.
import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/llm/providers';
import { catalogModels, catalogProviders } from '@/lib/llm/catalog';
import { registryModels } from '@/lib/llm/registry/derive';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');
  if (provider === null) {
    return NextResponse.json({ providers: catalogProviders(), models_meta: registryModels.meta });
  }
  const def = getProvider(provider);
  if (!def) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  return NextResponse.json({ provider: def.id, models: catalogModels(def.id), models_meta: registryModels.meta });
}
