/**
 * Research OS seed data — 20 AI/TMT companies + 6 themes (spec §2) and the
 * Phase 1 investment axioms (spec §4.7). Idempotent: entities upsert by
 * (type, lower(name)); axioms upsert by code.
 */

import { type ResearchCtx } from './store';
import { upsertEntity } from './entities';

interface CompanySeed {
  name: string;
  ticker?: string;
  description: string;
}

export const COMPANY_SEEDS: CompanySeed[] = [
  { name: 'NVIDIA', ticker: 'NVDA', description: 'AI 芯片与算力平台霸主，数据中心 GPU + CUDA 生态。' },
  { name: 'Microsoft', ticker: 'MSFT', description: '云 + Copilot 全家桶，OpenAI 最大股东与分销渠道。' },
  { name: 'Alphabet', ticker: 'GOOGL', description: 'Google 搜索/云/Gemini 模型，TPU 自研算力。' },
  { name: 'Amazon', ticker: 'AMZN', description: 'AWS 云平台 + Bedrock 模型市场 + Anthropic 投资方。' },
  { name: 'Oracle', ticker: 'ORCL', description: '云数据库转型 AI 算力供应商，OCI 大单驱动。' },
  { name: 'Cloudflare', ticker: 'NET', description: '边缘网络 + Workers AI 推理平台。' },
  { name: 'AMD', ticker: 'AMD', description: 'GPU 第二供应商，MI 系列对标 NVIDIA 数据中心。' },
  { name: 'Broadcom', ticker: 'AVGO', description: '定制 AI ASIC（TPU 等）+ 网络芯片 + VMware。' },
  { name: 'TSMC', ticker: 'TSM', description: '先进制程代工独占者，AI 芯片产能咽喉。' },
  { name: 'ASML', ticker: 'ASML', description: 'EUV 光刻机独家供应商，制程升级的最上游。' },
  { name: 'Adobe', ticker: 'ADBE', description: '创意软件 + Firefly 生成式 AI，受 AI 冲击与受益并存。' },
  { name: 'Salesforce', ticker: 'CRM', description: 'CRM SaaS + Agentforce 企业智能体平台。' },
  { name: 'ServiceNow', ticker: 'NOW', description: '企业工作流平台，AI agent 落地企业流程。' },
  { name: 'Palantir', ticker: 'PLTR', description: 'AIP 平台，政企 AI 应用部署。' },
  { name: 'Datadog', ticker: 'DDOG', description: '可观测性平台，LLM observability 新战场。' },
  { name: 'OpenAI', description: 'GPT/o 系模型公司，ChatGPT 消费级入口。' },
  { name: 'Anthropic', description: 'Claude 模型公司，企业/编码市场强势。' },
  { name: 'Mistral', description: '欧洲开源权重模型公司。' },
  { name: 'xAI', description: 'Grok 模型公司，超算自建激进。' },
  { name: 'Google DeepMind', description: 'Gemini 模型研发主体，Alphabet 旗下。' },
];

export const THEME_SEEDS: { name: string; description: string }[] = [
  { name: 'AI inference', description: '推理算力需求、成本曲线与 token 经济学。' },
  { name: 'Model APIs', description: '模型 API 市场份额、价格战与 provider 排名。' },
  { name: 'Data centers', description: 'AI 数据中心建设周期、capex 与供应链。' },
  { name: 'Power', description: '电力供给瓶颈、核电/新能源与 AI 负载。' },
  { name: 'Developer tools', description: 'AI 编码工具、agent 框架与开发者生态。' },
  { name: 'AI chips', description: 'GPU/ASIC/HBM 竞争格局与产能分配。' },
];

export interface AxiomSeed {
  code: string;
  title: string;
  description: string;
  severity: 'BLOCK' | 'WARN';
}

export const AXIOM_SEEDS: AxiomSeed[] = [
  {
    code: 'AX001',
    title: '无失效条件不得 REVIEWED',
    description: 'memo 必须至少写明一条失效条件（invalidation_conditions），否则不能进入 REVIEWED。',
    severity: 'BLOCK',
  },
  {
    code: 'AX002',
    title: '独立引用少于 3 个不得标 HIGH confidence',
    description: 'memo 引用的独立 source document 少于 3 个时，confidence 不能标为 HIGH。',
    severity: 'BLOCK',
  },
  {
    code: 'AX003',
    title: '无反方观点不得进审批',
    description: 'memo 必须至少包含一条反方观点（counter_arguments），否则不能进入审批/REVIEWED。',
    severity: 'BLOCK',
  },
  {
    code: 'AX004',
    title: '仅依赖单一 LOW-trust source 的证据需降权提示',
    description: '任何 evidence 只引用一个 LOW trust source 时给出 WARN 提示，需要补充独立来源。',
    severity: 'WARN',
  },
  {
    code: 'AX005',
    title: '禁止收益承诺话术',
    description: '结论/thesis 含"必涨、保证、稳赚、无风险"等收益承诺字样时直接阻断。',
    severity: 'BLOCK',
  },
  {
    code: 'AX006',
    title: '变化卡不得含买卖建议',
    description: '变化卡任何断言含买入/卖出/建仓/加仓/减仓/清仓/目标价/止损/止盈/仓位/做多/做空/买点/卖点/抄底/逃顶等交易建议字样时直接阻断（总纲 §7.5）。',
    severity: 'BLOCK',
  },
];

export interface SeedResult {
  companies: number;
  themes: number;
  axioms: number;
}

export async function seedResearchData(ctx: ResearchCtx): Promise<SeedResult> {
  for (const c of COMPANY_SEEDS) {
    await upsertEntity(ctx, {
      type: 'COMPANY',
      name: c.name,
      ticker: c.ticker ?? null,
      description: c.description,
    });
  }
  for (const t of THEME_SEEDS) {
    await upsertEntity(ctx, { type: 'THEME', name: t.name, description: t.description });
  }
  // Axiom upsert by (user_id, code): update the mutable columns on existing
  // rows (never their id — same semantics as the old ON CONFLICT DO UPDATE),
  // insert the rest. `active` is the Postgres column for the app's `enabled`.
  const now = new Date().toISOString();
  const { data: existingRows, error: selErr } = await ctx.supabase
    .from('research_axioms')
    .select('id, code')
    .eq('user_id', ctx.userId);
  if (selErr) throw new Error(selErr.message);
  const byCode = new Map(
    ((existingRows ?? []) as Array<{ id: string; code: string }>).map((r) => [r.code, r.id]),
  );
  for (const a of AXIOM_SEEDS) {
    const existingId = byCode.get(a.code);
    if (existingId) {
      const { error } = await ctx.supabase
        .from('research_axioms')
        .update({ title: a.title, description: a.description, severity: a.severity })
        .eq('user_id', ctx.userId)
        .eq('id', existingId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await ctx.supabase.from('research_axioms').insert({
        id: crypto.randomUUID(),
        user_id: ctx.userId,
        code: a.code,
        title: a.title,
        description: a.description,
        severity: a.severity,
        active: true,
        created_at: now,
      });
      if (error) throw new Error(error.message);
    }
  }
  return {
    companies: COMPANY_SEEDS.length,
    themes: THEME_SEEDS.length,
    axioms: AXIOM_SEEDS.length,
  };
}
