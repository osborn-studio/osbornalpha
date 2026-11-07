import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, expect, it, vi} from 'vitest';

const fetchState = vi.hoisted(() => vi.fn(() => ({state: {status: 'idle'}, retry: () => {}})));
vi.mock('@/components/company/useCompanyFetch', () => ({useCompanyFetch: fetchState}));
vi.mock('next-intl', () => ({useTranslations: () => (key: string) => key}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each([undefined, '0'])('judgments flag %s renders the disabled state without an API URL', async value => {
  vi.stubEnv('NEXT_PUBLIC_COMPANY_JUDGMENTS', value);
  vi.resetModules();
  const {JudgmentsView} = await import('@/components/company/JudgmentsView');
  const html = renderToStaticMarkup(createElement(JudgmentsView, {
    issuerId: '11111111-1111-4111-8111-111111111111', asOf: '2024-06-30',
  }));
  expect(fetchState).toHaveBeenCalledWith(null);
  expect(html).toContain('emptyTitle');
  expect(html).not.toContain('aria-busy');
});
