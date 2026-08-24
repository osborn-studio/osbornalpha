import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ManualDeliveryView,
  type ManualDeliveryViewCopy,
} from './manual-delivery-view';
import { manualDeliveryPayload } from './manual-delivery-request';

const copy: ManualDeliveryViewCopy = {
  heading: 'Push channels',
  managedDestination: 'Server-configured email and Telegram destinations; recipient details are hidden.',
  telegramTest: 'Send Telegram test',
  telegramBrief: 'Generate Telegram brief',
  emailTest: 'Send email test',
  emailBrief: 'Generate email brief',
};

function render(isAdmin: boolean | null) {
  return renderToStaticMarkup(createElement(ManualDeliveryView, {
    isAdmin,
    copy,
    onTelegramTest: vi.fn(),
    onTelegramBrief: vi.fn(),
    onEmailTest: vi.fn(),
    onEmailBrief: vi.fn(),
  }));
}

describe('ManualDeliveryControls', () => {
  it.each([null, false])('renders no delivery controls for loading/non-admin state %s', (isAdmin) => {
    expect(render(isAdmin)).toBe('');
  });

  it('shows managed-destination actions to admins without recipient inputs', () => {
    const html = render(true);

    expect(html).toContain(copy.managedDestination);
    expect(html).toContain(copy.telegramTest);
    expect(html).toContain(copy.telegramBrief);
    expect(html).toContain(copy.emailTest);
    expect(html).toContain(copy.emailBrief);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('Telegram Chat ID');
    expect(html).not.toContain('email recipient');
  });

  it('builds bounded requests without recipient override fields', () => {
    const testPayload = manualDeliveryPayload('email', 'test', {
      text: 'x'.repeat(5_000),
      subject: 'y'.repeat(500),
    });
    const briefPayload = manualDeliveryPayload('telegram', 'brief', {});

    expect(testPayload).toEqual({
      channels: ['email'],
      text: 'x'.repeat(4_000),
      subject: 'y'.repeat(200),
    });
    expect(briefPayload).toEqual({ channels: ['telegram'], topN: 5 });
    expect(testPayload).not.toHaveProperty('to');
    expect(testPayload).not.toHaveProperty('chatId');
    expect(briefPayload).not.toHaveProperty('to');
    expect(briefPayload).not.toHaveProperty('chatId');
    expect(briefPayload).not.toHaveProperty('watchlist');
  });
});
