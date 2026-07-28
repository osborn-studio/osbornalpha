import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { Disclaimer } from '@/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.about.meta');
  return {
    title: t('title'),
    description: t('description'),
    alternates: { languages: { 'zh-CN': '/about', en: '/en/about' } },
  };
}

const COMMITTEE_KEYS = [
  'buffett', 'munger', 'druckenmiller', 'marks', 'lynch', 'burry', 'zhangKun', 'liLu', 'duanYongping',
] as const;

// Person names stay untranslated per GLOSSARY.md — displayed literally here in
// zh, the English page shows the equivalent English name via the dictionary.
const COMMITTEE_NAMES_ZH: Record<(typeof COMMITTEE_KEYS)[number], string> = {
  buffett: '巴菲特',
  munger: '芒格',
  druckenmiller: '德鲁肯米勒',
  marks: '霍华德·马克斯',
  lynch: '彼得·林奇',
  burry: '迈克尔·伯里',
  zhangKun: '张坤',
  liLu: '李录',
  duanYongping: '段永平',
};

const COMMITTEE_NAMES_EN: Record<(typeof COMMITTEE_KEYS)[number], string> = {
  buffett: 'Warren Buffett',
  munger: 'Charlie Munger',
  druckenmiller: 'Stanley Druckenmiller',
  marks: 'Howard Marks',
  lynch: 'Peter Lynch',
  burry: 'Michael Burry',
  zhangKun: 'Zhang Kun',
  liLu: 'Li Lu',
  duanYongping: 'Duan Yongping',
};

export default async function AboutPage() {
  const [t, locale] = await Promise.all([
    getTranslations('landing.about'),
    getLocale(),
  ]);
  const names = locale === 'en' ? COMMITTEE_NAMES_EN : COMMITTEE_NAMES_ZH;

  return (
    <>
      <div className="card-base">
        <h1 className="mb-2 text-2xl font-bold">
          Stock<span className="text-accent">Monitor</span>
        </h1>
        <p className="mb-4 text-sm text-text-dim">{t('heading')}</p>
        <p className="leading-relaxed">{t('intro')}</p>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('featuresHeading')}</div>
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed">
          <li>{t('features.schedule')}</li>
          <li>{t('features.signals')}</li>
          <li>{t('features.committee')}</li>
          <li>{t('features.webUi')}</li>
          <li>{t('features.delivery')}</li>
          <li>{t('features.backtest')}</li>
          <li>{t('features.compliance')}</li>
        </ul>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('committeeHeading')}</div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {COMMITTEE_KEYS.map((key) => (
            <div key={key} className="rounded-md bg-bg-card p-3">
              <strong>{names[key]}</strong>
              <br />
              <span className="text-[11px] text-text-dim">{t(`committee.${key}`)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('techStackHeading')}</div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">{t('techStack.webFrontend')}</td><td>Next.js 15 · React 18 · Tailwind · TradingView Lightweight Charts</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">{t('techStack.backendDb')}</td><td>Supabase (Postgres + Auth + RLS)</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">{t('techStack.deployment')}</td><td>Vercel (auto-deploy from GitHub)</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">{t('techStack.llm')}</td><td>Claude (Opus / Sonnet / Haiku)</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">{t('techStack.data')}</td><td>Akshare · Alpha Vantage · EDGAR · FRED · Tushare</td></tr>
            <tr><td className="py-2 text-text-dim">{t('techStack.scheduling')}</td><td>launchd (macOS) + Supabase Cron (future)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('principlesHeading')}</div>
        <table className="w-full border-collapse text-sm">
          <thead className="text-text-dim">
            <tr><th className="py-2 text-left">{t('principlesIs')}</th><th className="py-2 text-left">{t('principlesIsNot')}</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-border"><td className="py-2">{t('principles.decisionAid')}</td><td className="py-2">{t('principles.noExecution')}</td></tr>
            <tr className="border-t border-border"><td className="py-2">{t('principles.multiPerspective')}</td><td className="py-2">{t('principles.notPredictor')}</td></tr>
            <tr className="border-t border-border"><td className="py-2">{t('principles.personalUse')}</td><td className="py-2">{t('principles.notPublic')}</td></tr>
            <tr className="border-t border-border"><td className="py-2">{t('principles.citesSources')}</td><td className="py-2">{t('principles.notAdvice')}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('linksHeading')}</div>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li><a href="https://github.com/gilosbornhello/stock-monitor" target="_blank">{t('githubRepo')}</a></li>
          <li><Link href="/legacy-demo">{t('legacyDemo')}</Link></li>
        </ul>
      </div>

      <Disclaimer />
    </>
  );
}
