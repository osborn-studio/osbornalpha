import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en/company.json';
import zh from '../../../../messages/zh/company.json';
import type { DirectoryRow } from '@/lib/company/directory';
import { DirectorySyncCell } from './CompanyDirectory';

type Sync = Pick<DirectoryRow, 'scopeLastSuccessAt' | 'scopeLastStatus'>;
const lastSuccess = '2026-11-02T03:04:05.000Z';

function render(locale: 'en' | 'zh', row: Sync) {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale,
    timeZone: 'UTC',
    messages: { company: locale === 'en' ? en : zh },
    children: createElement(DirectorySyncCell, { row }),
  }));
}

const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

for (const { locale, successLabel, failed, succeeded } of [
  { locale: 'en', successLabel: 'Last successful sync:', failed: 'Last attempt: failed', succeeded: 'Last attempt: success' },
  { locale: 'zh', successLabel: '最近成功同步：', failed: '最近尝试：失败', succeeded: '最近尝试：成功' },
] as const) {
  describe(`directory sync cell (${locale})`, () => {
    it('labels the retained successful timestamp and separately states the latest failure', () => {
      const html = render(locale, { scopeLastSuccessAt: lastSuccess, scopeLastStatus: 'failed' });
      expect(visibleText(html)).toBe(`${successLabel} 2026-11-02 03:04 ${failed}`);
      expect(html).toContain(`dateTime="${lastSuccess}"`);
    });

    it('keeps the missing success timestamp unavailable after a failed attempt', () => {
      const html = render(locale, { scopeLastSuccessAt: null, scopeLastStatus: 'failed' });
      expect(visibleText(html)).toBe(`${successLabel} — ${failed}`);
      expect(html).not.toContain('<time');
    });

    it('states a recorded success without inventing its time', () => {
      expect(visibleText(render(locale, { scopeLastSuccessAt: null, scopeLastStatus: 'success' })))
        .toBe(`${successLabel} — ${succeeded}`);
    });

    it('keeps a success date with unknown attempt status', () => {
      expect(visibleText(render(locale, { scopeLastSuccessAt: lastSuccess, scopeLastStatus: null })))
        .toBe(`${successLabel} 2026-11-02 03:04`);
    });

    it('keeps a fully unknown sync state unavailable', () => {
      expect(visibleText(render(locale, { scopeLastSuccessAt: null, scopeLastStatus: null })))
        .toBe(`${successLabel} —`);
    });
  });
}
