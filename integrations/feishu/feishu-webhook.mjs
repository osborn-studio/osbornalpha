import {createHmac} from 'node:crypto';

const hook = /^https:\/\/(?:open\.feishu\.cn|open\.larksuite\.com)\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]{8,150}$/;
export const validFeishuWebhook = value => typeof value === 'string' && hook.test(value);

export function signWebhook(payload,secret) {
  if (!secret) return payload;
  const timestamp = String(Math.floor(Date.now()/1000));
  const sign = createHmac('sha256',timestamp+'\n'+secret).digest('base64');
  return {...payload,timestamp,sign};
}
