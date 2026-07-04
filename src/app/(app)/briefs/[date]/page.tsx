import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Disclaimer } from '@/components/Disclaimer';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ date: string }> }

export default async function BriefDetailPage({ params }: Props) {
  const { date } = await params;
  const t = await getTranslations('briefs');

  return (
    <>
      <Link href="/briefs" className="text-sm">{t('detail.back')}</Link>
      <h1 className="mt-2 mb-3 text-xl font-bold">{t('detail.heading', { date })}</h1>

      <div className="card-base">
        <div className="prose prose-invert max-w-none text-sm">
          <h2 className="text-lg font-bold">Sentinel · {date} 早间简报</h2>
          <blockquote className="border-l-2 border-accent-dim pl-3 text-text-dim">
            你的注意力优先级：腾讯 &gt; 英伟达 &gt; 比亚迪<br />
            今日发布会议：3 家 | 财报临近：5 家 | 评级变更：2 家<br />
            <strong>AI 委员会信心指数：6.2 / 10（中性偏多）</strong>
          </blockquote>

          <h3 className="mt-5 font-semibold">🎯 注意力优先级 Top 3</h3>

          <div className="my-4 rounded-md bg-bg-card p-3 text-sm">
            <strong>#1 腾讯控股 (00700.HK)</strong> — 信号 ★★★★☆ (8.0/10)<br />
            <em className="text-text-dim">触发：财报前夜（Q1 2026 财报明日盘前）</em>
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li>🟢 张坤视角：游戏稳态 + 视频号广告超预期</li>
              <li>🔴 段永平视角：监管风险未清，AI 投入回报周期长</li>
              <li>🟡 Howard Marks 视角：风险/收益比适中，无急迫性</li>
            </ul>
            <Link href="/stock/00700.HK" className="mt-2 inline-block text-xs">完整投研报告 →</Link>
          </div>

          <div className="my-4 rounded-md bg-bg-card p-3 text-sm">
            <strong>#2 英伟达 (NVDA)</strong> — 信号 ★★★★☆ (7.8/10)<br />
            <Link href="/stock/NVDA" className="mt-1 inline-block text-xs">展开详情 →</Link>
          </div>

          <div className="my-4 rounded-md bg-bg-card p-3 text-sm">
            <strong>#3 比亚迪 (002594.SZ)</strong> — 信号 ★★★☆☆ (7.2/10)<br />
            <Link href="/stock/002594.SZ" className="mt-1 inline-block text-xs">展开详情 →</Link>
          </div>

          <h3 className="mt-5 font-semibold">📰 今日券商研报摘要</h3>
          <ul className="ml-4 list-disc text-sm leading-relaxed">
            <li>中金：腾讯 — 维持&ldquo;跑赢行业&rdquo;，目标价 HK$580</li>
            <li>高盛：英伟达 — 上调评级至&ldquo;Buy&rdquo;，目标价 $1,250</li>
          </ul>

          <h3 className="mt-5 font-semibold">🌍 宏观速递</h3>
          <ul className="ml-4 list-disc text-sm leading-relaxed">
            <li>美 10Y 国债：4.32% (-3bp)</li>
            <li>A 股北向资金：净流入 ¥38 亿</li>
            <li>关键事件：美 CPI 周三公布</li>
          </ul>
        </div>
      </div>

      <Disclaimer />
    </>
  );
}
