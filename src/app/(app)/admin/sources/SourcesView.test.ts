import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator, type Messages } from 'next-intl';
import { expect, it } from 'vitest';
import { DQ_DATASET_NAMES } from '@/lib/dq/datasets';
import { DATASET_KEYS, DEFAULT_LICENSES } from '@/lib/industry/licenses';
import { buildAdminView, readRouting } from '@/lib/sources/admin-view';
import { SOURCE_CATALOG } from '@/lib/sources/catalog';
import en from '../../../../../messages/en/admin.json';
import zh from '../../../../../messages/zh/admin.json';
import { SourcesView } from './SourcesView';

const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser');
const industry = [
  ...DATASET_KEYS.map(dataset_key => ({ dataset_key, status:DEFAULT_LICENSES[dataset_key] })),
  ...SOURCE_CATALOG.find(s => s.id === 'gildata')!.licence.keys
    .filter(key => !(key in DEFAULT_LICENSES)).map(dataset_key => ({ dataset_key, status:'internal' })),
];
const view = buildAdminView(readRouting(), { industry, judgments:null, freshness:[], hasBatches:false });

for (const [locale, messages] of [['en',en],['zh',zh]] as const) {
  it(`labels every catalogue domain in ${locale}`, () => {
    const labels:Record<string,string> = messages.sources.domains;
    for (const domain of new Set(SOURCE_CATALOG.flatMap(s => s.capabilities.map(c => c.domain)))) {
      expect(labels[domain]?.trim(), domain).toBeTruthy();
      expect(labels[domain]).not.toBe(domain);
    }
  });

  const t = createTranslator<Messages>({ locale, messages:messages.sources });
  function render():HTMLElement {
    return parse(renderToStaticMarkup(createElement(SourcesView, { view, t, locale })));
  }

  it(`renders catalogue pacing and stored industry statuses in ${locale}`, () => {
    const root = render();
    for (const source of SOURCE_CATALOG.filter(s => s.pacing)) {
      const pacing = source.pacing!;
      const row = [...root.querySelectorAll('[aria-labelledby="sources-d"] tr')].find(r => r.querySelector('strong')?.textContent === source.name[locale]);
      const interval = t('ms', { n:pacing.minIntervalMs });
      expect(row?.querySelectorAll('td')[3].textContent).toBe(pacing.scope === 'instance'
        ? interval + (locale === 'zh' ? ' 每实例' : ' per instance') : interval);
    }
    for (const { dataset_key, status } of industry) {
      const row = [...root.querySelectorAll('[aria-labelledby="sources-l"] tr')].find(r => r.querySelectorAll('td')[1]?.textContent === dataset_key);
      expect(row?.querySelectorAll('td')[2].textContent).toBe(status === 'internal'
        ? (locale === 'zh' ? '内部 · 仅管理员' : 'internal · admin only') : (locale === 'zh' ? '公开' : 'public'));
    }
  });

  it(`wraps the longest registry strings in the below-sm lists in ${locale}`, () => {
    const root = render();
    const longest = (values:readonly string[]) => [...values].sort((a,b) => b.length - a.length)[0];
    const capabilityLists = SOURCE_CATALOG.map(s => [...new Set(s.capabilities.map(c => c.domain))]
      .map(domain => t('domains.' + domain)).join(' · '));
    const targets = [
      ['b',longest(DQ_DATASET_NAMES)],
      ['l',longest([...industry.map(r => r.dataset_key), ...view.frozen.map(r => r.key)])],
      ['d',longest(capabilityLists)],
    ];
    expect([...root.querySelectorAll('[aria-labelledby="sources-b"] li')].map(li => li.querySelector('span')?.textContent)).toEqual(DQ_DATASET_NAMES);
    for (const [section,value] of targets) {
      const list = root.querySelector(`[aria-labelledby="sources-${section}"] ul`);
      expect(list?.classList.contains('sm:hidden')).toBe(true);
      const holders = [...list!.querySelectorAll('*')].filter(el =>
        [...el.childNodes].some(node => node.nodeType === 3 && node.textContent === value));
      expect(holders.length, value).toBeGreaterThan(0);
      for (const el of holders) expect(el.getAttribute('class') ?? '', value).toMatch(/(?:^|\s)(break-words|break-all|min-w-0)(?:\s|$)/);
    }
    for (const el of root.querySelectorAll('[class]')) {
      if (/(?:^|[\s:])min-w-\[/.test(el.getAttribute('class') ?? '')) expect((el.parentNode as Element | null)?.closest('.overflow-x-auto')).toBeTruthy();
    }
  });
}
