// Research OS 壳层 — /research 子导航（Phase 1 本地专用，直达 URL，不进 TabBar）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import Link from 'next/link';
import { RESEARCH_DISCLAIMER } from '@/lib/research/types';

const NAV = [
  { href: '/research', label: 'Dashboard' },
  { href: '/research/library', label: 'Library' },
  { href: '/research/companies', label: 'Companies' },
  { href: '/research/sources', label: 'Sources' },
  ...(process.env.ALPHA_S4_ENABLED === '1' ? [{ href: '/research/observations', label: '变化与观察' }] : []),
  { href: '/research/signals', label: 'Signals' },
  { href: '/research/theses', label: 'Theses' },
  { href: '/research/cards', label: 'Cards' },
  { href: '/research/weekly', label: 'Weekly' },
  { href: '/research/memos', label: 'Memos' },
  { href: '/research/playbooks', label: 'Playbooks' },
  { href: '/research/evals', label: 'Evals' },
];

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 rounded-lg border p-2 text-sm">
        <span className="mr-2 px-2 font-semibold">Research OS</span>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="rounded px-3 py-1 hover:bg-gray-100">
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
      <footer className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-500">
        免责声明：{RESEARCH_DISCLAIMER}
      </footer>
    </div>
  );
}
