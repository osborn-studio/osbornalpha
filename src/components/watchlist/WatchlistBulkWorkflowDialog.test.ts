import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import market from '../../../messages/en/market.json';

const mocks = vi.hoisted(() => ({
  reset: vi.fn(), research: vi.fn(), alert: vi.fn(), review: vi.fn(), retry: vi.fn(), resume: vi.fn(),
}));
vi.mock('@/lib/hooks/useWatchlistBulkWorkflow', () => ({
  useWatchlistBulkWorkflow: () => ({
    saving: false, error: null, result: null, canRetry: false, canResume: false, ...mocks,
  }),
}));

import {
  WatchlistBulkWorkflowDialog,
  type WatchlistBulkWorkflowOperation,
} from './WatchlistBulkWorkflowDialog';

function render(operation: WatchlistBulkWorkflowOperation, withItem = true) {
  return renderToStaticMarkup(createElement(
    NextIntlClientProvider,
    {
      locale: 'en',
      messages: { market },
      children: createElement(WatchlistBulkWorkflowDialog, {
        initialOperation: operation,
        targets: [{ ticker: 'AAPL', itemId: withItem ? 'item-1' : null, expectedVersion: withItem ? 2 : null }],
        onClose: vi.fn(),
      }),
    },
  ));
}

describe('WatchlistBulkWorkflowDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders each workflow through the shared dialog boundary', () => {
    expect(render('research')).toContain('Refresh selected research');
    expect(render('alert')).toContain('Create alerts');
    expect(render('review')).toContain('Schedule reviews');
  });

  it('disables server-item workflows when overview records are unavailable', () => {
    const html = render('alert', false);
    expect(html).toContain('still missing server records');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Create alerts"');
  });
});
