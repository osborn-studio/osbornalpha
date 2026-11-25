import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en/admin.json';
import zh from '../../../../../messages/zh/admin.json';
import { AdminForbidden, AdminUnauthenticated } from '@/lib/admin/auth';
import { buildAdminView, readRouting } from '@/lib/sources/admin-view';
import Page from './page';

const mocks = vi.hoisted(() => ({ guard:vi.fn(), load:vi.fn(), locale:'en' as 'en'|'zh' }));
vi.mock('@/lib/admin/auth', async original => ({ ...await original<typeof import('@/lib/admin/auth')>(), requireAdminUser:mocks.guard }));
vi.mock('@/lib/sources/admin-reader', () => ({ loadAdminView:mocks.load }));
vi.mock('next-intl/server', () => ({
  getLocale:async () => mocks.locale,
  getTranslations:async () => createTranslator({ locale:mocks.locale, messages:{ admin:{ en, zh }[mocks.locale] }, namespace:'admin.sources', onError:e => { throw e; } }),
}));
beforeEach(() => { vi.clearAllMocks(); mocks.locale = 'en'; });

it('shows denied before reading data', async () => {
  mocks.guard.mockRejectedValueOnce(new AdminForbidden());
  expect(renderToStaticMarkup(await Page())).toContain('No access');
  expect(mocks.load).not.toHaveBeenCalled();
});
it('redirects unauthenticated requests before reading data', async () => {
  mocks.guard.mockRejectedValueOnce(new AdminUnauthenticated());
  await expect(Page()).rejects.toMatchObject({ digest:expect.stringContaining('/login?next=%2Fadmin%2Fsources') });
  expect(mocks.load).not.toHaveBeenCalled();
});
it.each(['zh','en'] as const)('renders all five sections read-only in %s', async locale => {
  mocks.locale = locale;
  mocks.load.mockResolvedValue(buildAdminView(readRouting(), { freshness:null, industry:null, judgments:null, hasBatches:false }));
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain(locale === 'zh' ? '读取失败' : 'could not be read');
  expect(html.match(/<table\b/g)).toHaveLength(5);
  expect(html).not.toMatch(/<(button|form|input|select|textarea)\b/i);
});
