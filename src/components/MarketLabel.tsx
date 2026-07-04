'use client';

import { useTranslations } from 'next-intl';

// Localized market-name chip text ("A 股/港股/美股" vs "A-shares/HK/US").
// Replaces the zh-hardcoded marketLabel() util; unknown codes render as-is.
export function MarketLabel({ m }: { m: string }) {
  const t = useTranslations('components.market');
  return <>{m === 'A' || m === 'HK' || m === 'US' ? t(m) : m}</>;
}
