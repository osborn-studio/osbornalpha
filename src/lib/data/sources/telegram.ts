/**
 * Telegram Bot API client.
 *
 * Setup:
 *   1. Talk to @BotFather on Telegram, create bot, get token
 *   2. Start chat with your bot, then visit:
 *      https://api.telegram.org/bot<TOKEN>/getUpdates
 *      to find your chat_id
 *   3. Set env vars on Vercel:
 *      vercel env add TELEGRAM_BOT_TOKEN production
 *      vercel env add TELEGRAM_CHAT_ID production
 */

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Escape characters that are special in MarkdownV2. */
export function escapeMarkdownV2(text: string): string {
  // Reserved: _*[]()~`>#+-=|{}.!
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export interface TelegramSendOpts {
  chatId?: string;       // override env
  parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown' | 'none';
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
  /** If text > 4096 chars, split into chunks (Telegram message limit). */
  autoSplit?: boolean;
}

export interface TelegramSendResp {
  ok: boolean;
  message_id?: number;
  error?: string;
  chunks_sent: number;
}

const TG_MAX_LEN = 4096;

export async function sendTelegram(text: string, opts: TelegramSendOpts = {}): Promise<TelegramSendResp> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured', chunks_sent: 0 };
  }

  const chunks = opts.autoSplit !== false ? chunkText(text, TG_MAX_LEN) : [text];
  let lastMessageId: number | undefined;
  let chunksSent = 0;

  for (const chunk of chunks) {
    const body: any = {
      chat_id: chatId,
      text: chunk,
      disable_notification: opts.disableNotification,
      disable_web_page_preview: opts.disableWebPagePreview ?? true,
    };
    if (opts.parseMode && opts.parseMode !== 'none') body.parse_mode = opts.parseMode;

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!json.ok) {
      return { ok: false, error: json.description || `Telegram HTTP ${resp.status}`, chunks_sent: chunksSent };
    }
    lastMessageId = json.result?.message_id;
    chunksSent++;
  }

  return { ok: true, message_id: lastMessageId, chunks_sent: chunksSent };
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    // Try to split at last \n\n within maxLen
    let cut = remaining.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen / 2) cut = remaining.lastIndexOf('\n', maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
