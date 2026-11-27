// Structured, complete read of the Feishu simulation account for the Excel workbook: every
// recommendation of the group's bound analysts with its adoption, score and linked trades, plus
// the account positions needed to reconcile the workbook's pooled cost basis. Read-only.
type Db = { from: (table: string) => any };

const pageSize = 1000;
const chunkSize = 100;

export interface ExportRecommendation {
  id: string; analystKey: string; ticker: string; market: string; action: string;
  recommendedAt: string; createdAt: string; withdrawnAt: string | null;
  referencePrice: number | null; targetPrice: number | null; stopLoss: number | null;
  confidence: number | null; horizon: string | null; rationale: string | null;
  adopted: boolean; decidedAt: string | null;
  score: { hit: boolean | null; score: number | null; forward5dPct: number | null; forward20dPct: number | null; forward60dPct: number | null } | null;
}
export interface ExportTrade {
  id: string; recommendationId: string; analystKey: string; ticker: string; direction: string;
  price: number; quantity: number; fee: number; currency: string; executedAt: string;
}
export interface ExportPosition {
  ticker: string; shares: number; avgCost: number; realizedPnl: number; currency: string;
  /** true when every account trade in this ticker is linked to a bound analyst's recommendation */
  attributedOnly: boolean;
}
export interface FormalExport {
  ownerId: string;
  analysts: Array<{ key: string; analystId: string; displayName: string | null }>;
  recommendations: ExportRecommendation[];
  trades: ExportTrade[];
  positions: ExportPosition[];
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const chunks = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) out.push(items.slice(i, i + chunkSize));
  return out;
};

async function rows(query: () => any, label: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error || !Array.isArray(data)) throw new Error(`formal_export_${label}`);
    out.push(...data);
    if (data.length < pageSize) return out;
  }
}
async function rowsIn(db: Db, table: string, select: string, ownerId: string, column: string, values: string[], order: string) {
  const out: any[] = [];
  for (const part of chunks([...new Set(values)])) {
    out.push(...await rows(() => db.from(table).select(select).eq('user_id', ownerId).in(column, part).order(order), table));
  }
  return out;
}

export async function readFormalExport(db: Db, { ownerId, analysts }: { ownerId: string; analysts: Map<string, string> }): Promise<FormalExport> {
  const keyById = new Map([...analysts].map(([key, id]) => [id, key]));
  const ids = [...keyById.keys()];
  if (!ids.length) return { ownerId, analysts: [], recommendations: [], trades: [], positions: [] };

  const profiles = await rowsIn(db, 'analyst_profiles', 'id,display_name', ownerId, 'id', ids, 'id');
  const nameById = new Map(profiles.map((p) => [String(p.id).toLowerCase(), p.display_name ?? null]));
  const recs = await rowsIn(db, 'recommendations',
    'id,analyst_id,ticker,market,action,recommended_at,created_at,withdrawn_at,reference_price,target_price,stop_loss,confidence,horizon,rationale',
    ownerId, 'analyst_id', ids, 'recommended_at');
  const recIds = recs.map((r) => r.id);
  const scores = await rowsIn(db, 'recommendation_scores',
    'recommendation_id,hit,score,forward_5d_pct,forward_20d_pct,forward_60d_pct', ownerId, 'recommendation_id', recIds, 'recommendation_id');
  const decisions = (await rowsIn(db, 'decisions', 'id,recommendation_id,status,decided_at', ownerId, 'recommendation_id', recIds, 'decided_at'))
    .filter((d) => d.status !== 'cancelled'); // a cancelled decision frees the recommendation (analyst store rule)
  const trades = await rowsIn(db, 'trades', 'id,decision_id,ticker,direction,price,quantity,fee,currency,executed_at',
    ownerId, 'decision_id', decisions.map((d) => d.id), 'executed_at');

  const scoreByRec = new Map(scores.map((s) => [s.recommendation_id, s]));
  const decisionsByRec = new Map<string, any[]>();
  for (const d of decisions) decisionsByRec.set(d.recommendation_id, [...(decisionsByRec.get(d.recommendation_id) ?? []), d]);
  const recById = new Map(recs.map((r) => [r.id, r]));
  const recByDecision = new Map(decisions.map((d) => [d.id, d.recommendation_id]));

  const recommendations: ExportRecommendation[] = recs.map((r) => {
    const s = scoreByRec.get(r.id);
    const adoptedBy = decisionsByRec.get(r.id) ?? [];
    return {
      id: r.id, analystKey: keyById.get(String(r.analyst_id).toLowerCase())!, ticker: r.ticker, market: r.market, action: r.action,
      recommendedAt: r.recommended_at, createdAt: r.created_at, withdrawnAt: r.withdrawn_at ?? null,
      referencePrice: num(r.reference_price), targetPrice: num(r.target_price), stopLoss: num(r.stop_loss),
      confidence: num(r.confidence), horizon: r.horizon ?? null, rationale: r.rationale ?? null,
      adopted: adoptedBy.length > 0, decidedAt: adoptedBy[0]?.decided_at ?? null,
      score: s ? { hit: typeof s.hit === 'boolean' ? s.hit : null, score: num(s.score), forward5dPct: num(s.forward_5d_pct),
        forward20dPct: num(s.forward_20d_pct), forward60dPct: num(s.forward_60d_pct) } : null,
    };
  });
  const linked: ExportTrade[] = trades.map((t) => {
    const recommendationId = recByDecision.get(t.decision_id)!;
    return {
      id: t.id, recommendationId, analystKey: keyById.get(String(recById.get(recommendationId).analyst_id).toLowerCase())!,
      ticker: t.ticker, direction: t.direction, price: num(t.price)!, quantity: num(t.quantity)!, fee: num(t.fee) ?? 0,
      currency: t.currency, executedAt: t.executed_at,
    };
  });

  const tickers = [...new Set(linked.map((t) => t.ticker))];
  const accountTrades = await rowsIn(db, 'trades', 'id,ticker', ownerId, 'ticker', tickers, 'id');
  const linkedCount = new Map<string, number>();
  for (const t of linked) linkedCount.set(t.ticker, (linkedCount.get(t.ticker) ?? 0) + 1);
  const accountCount = new Map<string, number>();
  for (const t of accountTrades) accountCount.set(t.ticker, (accountCount.get(t.ticker) ?? 0) + 1);
  const positions = (await rowsIn(db, 'positions', 'ticker,shares,avg_cost,realized_pnl,currency', ownerId, 'ticker', tickers, 'ticker'))
    .map((p): ExportPosition => ({
      ticker: p.ticker, shares: num(p.shares) ?? 0, avgCost: num(p.avg_cost) ?? 0, realizedPnl: num(p.realized_pnl) ?? 0,
      currency: p.currency, attributedOnly: accountCount.get(p.ticker) === linkedCount.get(p.ticker),
    }));

  return {
    ownerId,
    analysts: [...analysts].map(([key, analystId]) => ({ key, analystId, displayName: nameById.get(analystId) ?? null })),
    recommendations, trades: linked, positions,
  };
}
