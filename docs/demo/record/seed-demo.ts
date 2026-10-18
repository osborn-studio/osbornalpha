/**
 * Demo-data seed for the product demo recording (docs/demo/README.md).
 *
 * Run against a LOCAL Supabase stack only:
 *   npx tsx docs/demo/record/seed-demo.ts
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.development.local
 * (via @next/env, same as scripts/research-seed.ts). Refuses to run against a non-local URL.
 * Idempotent: every run wipes and re-creates the demo user's own rows.
 *
 * Demo account: see demo-account.ts (local Supabase only, test credentials).
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), true); // dev=true → also reads .env.development.local

import { createClient } from '@supabase/supabase-js';
import { computePositions } from '../../../src/lib/portfolio/positions';
import { seedResearchData } from '../../../src/lib/research/seed';
import { upsertEntity } from '../../../src/lib/research/entities';
import { createThesis, transitionThesis } from '../../../src/lib/research/theses';
import { ingestSource } from '../../../src/lib/research/sources';
import type { ResearchCtx } from '../../../src/lib/research/store';

import { DEMO_EMAIL, DEMO_PASSWORD } from './demo-account';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error(`refusing to seed a non-local Supabase: ${url || '(unset)'}`);
}
if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing (see docs/demo/README.md)');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sb = admin as any;

function daysAgo(n: number, hour = 2): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
function isoDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function ensureUser(): Promise<string> {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) return existing.id;
  const { data, error: cErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Demo' },
  });
  if (cErr) throw cErr;
  return data.user.id;
}

async function wipe(userId: string) {
  // Order matters for FKs; service role bypasses RLS (recommendations/profiles have no delete policy).
  for (const table of [
    'recommendation_scores', 'decision_reviews', 'trades', 'decisions', 'positions', 'recommendations', 'analyst_profiles',
    'watchlist_items', 'watchlists',
    'research_playbook_runs', 'research_thesis_events', 'research_theses', 'research_signals', 'research_source_documents',
    'research_entity_securities', 'research_audit_log',
  ]) {
    const { error } = await sb.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function seedProfile(userId: string) {
  const { error } = await sb.from('profiles').upsert(
    { id: userId, email: DEMO_EMAIL, display_name: 'Demo', role: 'admin', plan: 'pro' },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`profiles: ${error.message}`);
  const { error: pErr } = await sb.from('user_preferences').upsert(
    { user_id: userId, language: 'zh', timezone: 'Asia/Shanghai' },
    { onConflict: 'user_id' },
  );
  if (pErr) throw new Error(`user_preferences: ${pErr.message}`);
}

async function seedWatchlist(userId: string) {
  const groups: Array<{ name: string; tickers: string[] }> = [
    { name: '长期持有', tickers: ['600519.SH', '00700.HK', 'NVDA'] },
    { name: '机会跟踪', tickers: ['09988.HK', 'AAPL', '000333.SZ'] },
    { name: '仅观察', tickers: ['TSLA', '01810.HK'] },
  ];
  for (const [i, g] of groups.entries()) {
    const { data, error } = await sb.from('watchlists')
      .insert({ user_id: userId, name: g.name, sort_order: i, is_default: i === 0 })
      .select('id').single();
    if (error) throw new Error(`watchlists: ${error.message}`);
    const rows = g.tickers.map((ticker, j) => ({ watchlist_id: data.id, user_id: userId, ticker, sort_order: j }));
    const { error: iErr } = await sb.from('watchlist_items').insert(rows);
    if (iErr) throw new Error(`watchlist_items: ${iErr.message}`);
  }
}

async function seedPortfolio(userId: string) {
  // Fictional trades at round numbers — nothing here is a real holding.
  const trades = [
    { ticker: '600519.SH', direction: 'buy', price: 1420, quantity: 100, fee: 5, currency: 'CNY', executed_at: daysAgo(75), note: '首次建仓' },
    { ticker: '600519.SH', direction: 'buy', price: 1380, quantity: 100, fee: 5, currency: 'CNY', executed_at: daysAgo(48), note: '回调加仓' },
    { ticker: '00700.HK', direction: 'buy', price: 540, quantity: 300, fee: 20, currency: 'HKD', executed_at: daysAgo(58), note: '' },
    { ticker: 'NVDA', direction: 'buy', price: 172, quantity: 40, fee: 1, currency: 'USD', executed_at: daysAgo(36), note: '' },
    { ticker: 'AAPL', direction: 'buy', price: 228, quantity: 30, fee: 1, currency: 'USD', executed_at: daysAgo(90), note: '' },
    { ticker: 'AAPL', direction: 'sell', price: 246, quantity: 30, fee: 1, currency: 'USD', executed_at: daysAgo(20), note: '止盈' },
  ];
  const { error } = await sb.from('trades').insert(trades.map((t) => ({ ...t, user_id: userId })));
  if (error) throw new Error(`trades: ${error.message}`);
  const positions = computePositions(trades as any).map((p) => ({
    user_id: userId, ticker: p.ticker, shares: p.shares, avg_cost: p.avgCost, realized_pnl: p.realizedPnl,
    currency: p.currency, opened_at: p.openedAt, closed_at: p.closedAt,
  }));
  const { error: pErr } = await sb.from('positions').upsert(positions, { onConflict: 'user_id,ticker' });
  if (pErr) throw new Error(`positions: ${pErr.message}`);

  const decisions = [
    { ticker: '00700.HK', market: 'HK', action: 'buy', thesis: '游戏版号常态化，广告恢复', confidence: 75, target_price: 640, stop_loss: 480, horizon: 'mid', decided_at: daysAgo(58) },
    { ticker: 'TSLA', market: 'US', action: 'pass', thesis: '估值透支，等 FSD 数据', confidence: 60, horizon: 'short', decided_at: daysAgo(43) },
    { ticker: 'NVDA', market: 'US', action: 'buy', thesis: '推理需求超预期，Blackwell 放量', confidence: 80, target_price: 220, stop_loss: 150, horizon: 'mid', decided_at: daysAgo(36) },
    { ticker: '000333.SZ', market: 'A', action: 'hold', thesis: '以旧换新政策观察', confidence: 55, horizon: 'mid', decided_at: daysAgo(30) },
  ];
  const { error: dErr } = await sb.from('decisions').insert(decisions.map((d) => ({ ...d, user_id: userId, source_type: 'manual', status: 'open' })));
  if (dErr) throw new Error(`decisions: ${dErr.message}`);
}

async function seedAnalyst(userId: string) {
  const { data: me, error } = await sb.from('analyst_profiles')
    .insert({ user_id: userId, display_name: '我', kind: 'human', is_self: true }).select('id').single();
  if (error) throw new Error(`analyst_profiles(self): ${error.message}`);
  const { data: jc, error: jErr } = await sb.from('analyst_profiles')
    .insert({ user_id: userId, display_name: 'John Cameron', kind: 'agent', note: 'Hiphon PM · Druckenmiller DNA' }).select('id').single();
  if (jErr) throw new Error(`analyst_profiles(agent): ${jErr.message}`);

  const recs = [
    { analyst_id: jc.id, ticker: '600519.SH', market: 'A', action: 'buy', reference_price: 1400, confidence: 70, horizon: 'mid', rationale: '批价企稳，渠道库存去化接近尾声', recommended_at: daysAgo(74) },
    { analyst_id: jc.id, ticker: 'NVDA', market: 'US', action: 'buy', reference_price: 170, confidence: 80, horizon: 'mid', rationale: '数据中心指引上修，推理需求爆发', recommended_at: daysAgo(67) },
    { analyst_id: jc.id, ticker: '09988.HK', market: 'HK', action: 'sell', reference_price: 150, confidence: 60, horizon: 'short', rationale: '云业务增速不及预期，外卖补贴拖累利润', recommended_at: daysAgo(53) },
    { analyst_id: jc.id, ticker: '000333.SZ', market: 'A', action: 'buy', reference_price: 75, confidence: 65, horizon: 'long', rationale: '海外自主品牌放量，分红率提升', recommended_at: daysAgo(45) },
    { analyst_id: jc.id, ticker: 'NVDA', market: 'US', action: 'add', reference_price: 180, confidence: 75, horizon: 'mid', rationale: '财报后回调，加一份', recommended_at: daysAgo(33) },
    { analyst_id: jc.id, ticker: 'TSLA', market: 'US', action: 'pass', reference_price: 420, confidence: 55, horizon: 'short', rationale: '交付不及预期，估值仍贵', recommended_at: daysAgo(30) },
    { analyst_id: jc.id, ticker: '01810.HK', market: 'HK', action: 'buy', reference_price: 50, confidence: 60, horizon: 'mid', rationale: '汽车业务毛利转正', recommended_at: daysAgo(12) },
    { analyst_id: me.id, ticker: '00700.HK', market: 'HK', action: 'buy', reference_price: 540, confidence: 75, horizon: 'mid', rationale: '游戏版号常态化，广告恢复', recommended_at: daysAgo(58) },
    { analyst_id: me.id, ticker: '600519.SH', market: 'A', action: 'hold', reference_price: 1400, confidence: 60, horizon: 'long', rationale: '等中报后再定', recommended_at: daysAgo(40) },
  ];
  const { error: rErr } = await sb.from('recommendations').insert(recs.map((r) => ({ ...r, user_id: userId, source_type: 'manual' })));
  if (rErr) throw new Error(`recommendations: ${rErr.message}`);
}

async function seedResearch(userId: string) {
  const ctx: ResearchCtx = { supabase: admin as unknown as ResearchCtx['supabase'], userId };
  process.env.RESEARCH_OWNER_USER_ID = userId;
  const base = await seedResearchData(ctx); // AI companies, themes, axioms (idempotent)

  const moutai = await upsertEntity(ctx, {
    type: 'COMPANY', name: '贵州茅台', ticker: '600519.SH', aliases: ['茅台', 'Kweichow Moutai'],
    description: '高端白酒龙头，直销渠道与 i 茅台放量，批价是核心观察指标。',
  });
  const nvidia = await upsertEntity(ctx, { type: 'COMPANY', name: 'NVIDIA', ticker: 'NVDA', description: 'AI 芯片与算力平台霸主，数据中心 GPU + CUDA 生态。' });
  const { error: sErr } = await sb.from('research_entity_securities').insert([
    { user_id: userId, id: crypto.randomUUID(), entity_id: moutai, exchange_code: '600519.SH', market: 'A', security_type: 'common', is_primary: true, valid_from: '2001-08-27', provenance: { source: 'demo-seed' } },
    { user_id: userId, id: crypto.randomUUID(), entity_id: nvidia, exchange_code: 'NVDA', mic: 'XNAS', market: 'US', security_type: 'common', is_primary: true, valid_from: '1999-01-22', provenance: { source: 'demo-seed' } },
  ]);
  if (sErr) throw new Error(`research_entity_securities: ${sErr.message}`);

  const src1 = await ingestSource(ctx, {
    source_type: 'FILING', title: '贵州茅台 2026 年半年度报告摘要', trust_level: 'HIGH', entity_ids: [moutai], market: 'A', origin_type: 'filing',
    url: 'https://example.invalid/moutai-2026h1', published_at: daysAgo(80), event_time: daysAgo(80),
    raw_text: '上半年营业总收入同比增长 9.2%，直销收入占比提升至 46%，i 茅台平台收入同比增长 18%。合同负债环比回升。',
  });
  const src2 = await ingestSource(ctx, {
    source_type: 'NEWS', title: '飞天茅台批价连续两周企稳回升', trust_level: 'MEDIUM', entity_ids: [moutai], market: 'A', origin_type: 'analyst_or_media',
    url: 'https://example.invalid/moutai-price', published_at: daysAgo(12), event_time: daysAgo(12),
    raw_text: '渠道调研显示，散瓶飞天批价连续两周企稳，经销商库存降至一个月以内，中秋备货节奏正常。',
  });
  await ingestSource(ctx, {
    source_type: 'EARNINGS_CALL', title: 'NVIDIA FY27 Q2 业绩会纪要', trust_level: 'HIGH', entity_ids: [nvidia], market: 'US', origin_type: 'company_statement',
    url: 'https://example.invalid/nvda-call', published_at: daysAgo(50), event_time: daysAgo(50),
    raw_text: '数据中心收入同比增长 56%，推理工作负载占比过半，管理层上调下季度指引。',
  });

  const thesis = await createThesis(ctx, {
    title: '茅台：批价企稳 + 直销占比提升，估值修复',
    body: '渠道库存去化接近尾声，批价企稳是量价关系改善的先行指标；直销与 i 茅台占比提升带来结构性毛利改善。若批价连续两周企稳且中秋动销正常，估值有修复空间。',
    company_ids: [moutai],
    supporting_evidence_ids: [src1.id, src2.id],
    invalidation_conditions: ['飞天批价跌破 2000 元并持续两周', '直销占比环比下滑', '合同负债连续两个季度下降'],
    watch_metrics: ['飞天散瓶批价（周）', '直销收入占比（季）', '合同负债（季）'],
    next_review_at: isoDate(21),
    opportunity_type: 'B',
    pillars: [
      { text: '批价企稳回升', resolvable_by: '渠道周度批价连续两周不创新低', deadline: isoDate(30) },
      { text: '直销占比提升', resolvable_by: '半年报直销占比 ≥ 45%', deadline: isoDate(60) },
    ],
    catalysts: [{ text: '中秋国庆动销数据', expected_date: isoDate(14) }, { text: '三季报', expected_date: isoDate(40) }],
    horizon_weeks: [4, 13, 26],
  });
  await transitionThesis(ctx, thesis.id, 'ACTIVE', '证据齐备，进入跟踪');

  const t2 = await createThesis(ctx, {
    title: '英伟达：推理需求接棒训练，数据中心指引持续上修',
    body: '推理工作负载占比过半意味着需求来自更广的客户群，Blackwell 放量叠加网络业务增长。',
    company_ids: [nvidia],
    invalidation_conditions: ['数据中心收入环比下滑', '主要云厂商 capex 指引下调'],
    watch_metrics: ['数据中心收入环比', '云厂商 capex 指引'],
    next_review_at: isoDate(30),
    opportunity_type: 'C',
    pillars: [{ text: '推理占比继续提升', resolvable_by: '业绩会披露 > 50%', deadline: isoDate(90) }],
    catalysts: [{ text: 'GTC', expected_date: isoDate(120) }],
    horizon_weeks: [13, 26],
  });
  await transitionThesis(ctx, t2.id, 'ACTIVE', '进入跟踪');
  await transitionThesis(ctx, t2.id, 'WATCH', '等下一季指引');

  return { ...base, moutai, thesis: thesis.id };
}

async function main() {
  const userId = await ensureUser();
  await wipe(userId);
  await seedProfile(userId);
  await seedWatchlist(userId);
  await seedPortfolio(userId);
  await seedAnalyst(userId);
  const r = await seedResearch(userId);
  console.log(`[seed-demo] user=${userId} companies=${r.companies} themes=${r.themes} axioms=${r.axioms} thesis=${r.thesis}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
