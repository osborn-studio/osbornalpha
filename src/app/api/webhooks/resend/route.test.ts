import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const originalWebhookSecret = process.env.RESEND_WEBHOOK_SECRET;
const originalHashSecret = process.env.OBSERVABILITY_HASH_SECRET;

afterEach(() => {
  if (originalWebhookSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = originalWebhookSecret;
  if (originalHashSecret === undefined) delete process.env.OBSERVABILITY_HASH_SECRET;
  else process.env.OBSERVABILITY_HASH_SECRET = originalHashSecret;
});

describe('Resend webhook route', () => {
  it('fails closed when webhook secrets are absent', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.OBSERVABILITY_HASH_SECRET;
    expect((await POST(new Request('http://localhost/api/webhooks/resend', { method: 'POST' }))).status).toBe(503);
  });

  it('rejects an invalid signature before database access', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
    process.env.OBSERVABILITY_HASH_SECRET = 'hash-secret';
    const response = await POST(new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      body: '{}',
      headers: {
        'svix-id': 'msg_test',
        'svix-timestamp': '1784592000',
        'svix-signature': 'v1,invalid',
      },
    }));
    expect(response.status).toBe(400);
  });
});
