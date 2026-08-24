export interface ResearchReport {
  id: string;
  company: string;
  ticker: string;
  period: string;
  sector: string;
  status: 'template-ready' | 'drafting' | 'published';
  updatedAt: string;
  sourceCount: number;
  downloadedSourceCount: number;
  chaptersReady: number;
  chapterCount: number;
  tags: string[];
  summary: string;
  localPath?: string;
}

export const EARNINGS_RESEARCH_SKILL = {
  id: 'research.earnings-research-book',
  name: 'earnings-research-book',
  hubPath:
    '/Users/gilbertchen/Documents/CODE/osborn-studio-skill-hub/skills/research/earnings-research-book',
  scriptPath:
    '/Users/gilbertchen/Documents/CODE/osborn-studio-skill-hub/skills/research/earnings-research-book/scripts/generate_earnings_research_book.py',
  localFallbackScriptPath:
    '/Users/gilbertchen/Documents/CODE/stock-monitor/skills/earnings-research-book/scripts/generate_earnings_research_book.py',
  skillPath: '/Users/gilbertchen/Documents/CODE/stock-monitor/skills/earnings-research-book',
};

export const RESEARCH_REPORTS: ResearchReport[] = [
  {
    id: 'micron-fy2026-q3',
    company: 'Micron Technology',
    ticker: 'MU',
    period: 'FY2026 Q3',
    sector: 'Semiconductors',
    status: 'template-ready',
    updatedAt: '2026-06-25',
    sourceCount: 0,
    downloadedSourceCount: 0,
    chaptersReady: 13,
    chapterCount: 13,
    tags: ['HBM', 'DRAM', 'NAND', 'AI Infrastructure'],
    summary:
      'Institutional earnings research-book workspace for Micron FY2026 Q3 with source PDF capture, bilingual quote ledger, references database, and incremental chapters.',
  },
];

export function buildResearchCommand(company: string, ticker: string, period: string) {
  const safeCompany = company.trim() || 'Micron Technology';
  const safeTicker = ticker.trim().toUpperCase() || 'MU';
  const safePeriod = period.trim() || 'FY2026 Q3';
  return [
    'python3',
    EARNINGS_RESEARCH_SKILL.scriptPath,
    JSON.stringify(safeCompany),
    JSON.stringify(safeTicker),
    JSON.stringify(safePeriod),
    '--output',
    'research-books',
    '--source-url',
    'earnings_release=https://...',
    '--source-url',
    'investor_presentation=https://...',
    '--source-url',
    '10q=https://...',
  ].join(' ');
}

export function searchResearchReports(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return RESEARCH_REPORTS;
  return RESEARCH_REPORTS.filter((report) => {
    const haystack = [
      report.company,
      report.ticker,
      report.period,
      report.sector,
      report.summary,
      ...report.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
