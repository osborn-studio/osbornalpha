import type { PersonaSpec, StockContext } from '@/lib/data/personas';

const DEFAULT_PERSONA_COUNT = 4;

function scorePersona(id: string, context: StockContext): number {
  let score = id === 'munger' ? 30 : id === 'marks' ? 28 : 0;
  const hasFinancials = Boolean(context.financial_summary || context.roe != null
    || context.gross_margin != null || context.net_margin != null);
  if (hasFinancials && ['buffett', 'li_lu', 'zhang_kun', 'duan_yongping'].includes(id)) score += 22;
  if (context.market === 'A' || context.market === 'HK') {
    if (id === 'zhang_kun' || id === 'li_lu' || id === 'duan_yongping') score += 10;
  }
  if (context.pe_ttm != null && context.pe_ttm >= 35 && id === 'burry') score += 24;
  if (context.pe_ttm != null && context.pe_ttm > 0 && context.pe_ttm <= 18 && id === 'buffett') score += 14;
  if (context.change_pct != null && Math.abs(context.change_pct) >= 2.5) {
    if (id === 'druckenmiller') score += 20;
    if (id === 'marks') score += 8;
  }
  const scopes = new Set((context.external_evidence ?? []).map((item) => item.sourceType));
  if ((scopes.has('macro') || scopes.has('industry')) && id === 'druckenmiller') score += 24;
  if ((scopes.has('company') || scopes.has('industry')) && id === 'lynch') score += 18;
  if (context.gross_margin != null && context.net_margin != null && id === 'duan_yongping') score += 16;
  return score;
}

export function selectPerspectivePersonas(
  personas: readonly PersonaSpec[],
  context: StockContext,
  requestedIds?: readonly string[] | null,
): PersonaSpec[] {
  if (requestedIds?.length) {
    const requested = new Set(requestedIds);
    return personas.filter((persona) => requested.has(persona.id));
  }
  return personas
    .map((persona, index) => ({ persona, index, score: scorePersona(persona.id, context) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.min(DEFAULT_PERSONA_COUNT, personas.length))
    .map(({ persona }) => persona);
}
