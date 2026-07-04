// TODO(P5): replace MOCK_DATA with live macro source
'use client';

import { useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import { MOCK_DATA } from '@/lib/data/mock';
import { formatPct, changeClass } from '@/lib/utils';

function MacroLine({
  label, v, pct, suffix = '', raw, chgClass,
}: { label: string; v: number; pct?: number; suffix?: string; raw?: string; chgClass?: string }) {
  return (
    <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2">
      <span className="text-text-dim">{label}</span>
      <span className="text-right font-mono tabular-nums">{v.toLocaleString()}{suffix}</span>
      <span className={`font-mono tabular-nums ${pct !== undefined ? changeClass(pct) : chgClass || ''}`}>
        {raw !== undefined ? raw : (pct !== undefined ? formatPct(pct) : '')}
      </span>
    </div>
  );
}

export function MacroGlance() {
  const t = useTranslations('today');
  const { macro } = MOCK_DATA;
  return (
    <Panel title={t('macro.title')}>
      <div className="space-y-1 text-[11px]">
        <MacroLine label={t('macro.sse')} v={macro.sse_index.value} pct={macro.sse_index.change_pct} />
        <MacroLine label={t('macro.hsi')} v={macro.hsi_index.value} pct={macro.hsi_index.change_pct} />
        <MacroLine label={t('macro.nasdaq')} v={macro.nasdaq.value} pct={macro.nasdaq.change_pct} />
        <MacroLine
          label={t('macro.us10y')}
          v={macro.us_10y.value}
          suffix="%"
          raw={`${macro.us_10y.change_bp > 0 ? '+' : ''}${macro.us_10y.change_bp}bp`}
          chgClass={changeClass(macro.us_10y.change_bp)}
        />
        <MacroLine label={t('macro.dxy')} v={macro.dxy.value} pct={macro.dxy.change_pct} />
      </div>
    </Panel>
  );
}
