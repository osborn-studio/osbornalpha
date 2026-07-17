import { cookies, headers } from 'next/headers';
import { resolveLocale, type AppLocale } from './locale';

/**
 * Resolve the in-app locale from a route handler / server action context.
 * Mirrors src/i18n/request.ts's resolution chain (x-app-locale header set by
 * middleware > NEXT_LOCALE cookie > Accept-Language > DEFAULT_LOCALE) but is
 * usable outside the RSC render path (API routes, server actions).
 *
 * next/headers' cookies()/headers() throw outside a request context (e.g. if
 * ever invoked from a cron/script import path) — fall back to resolveLocale's
 * own default ('zh') rather than let that exception bubble into a 500.
 */
export async function getRequestLocale(): Promise<AppLocale> {
  try {
    const h = await headers();
    const c = await cookies();
    return resolveLocale({
      header: h.get('x-app-locale'),
      cookie: c.get('NEXT_LOCALE')?.value,
      acceptLanguage: h.get('accept-language'),
    });
  } catch {
    return 'zh';
  }
}

// Server-side API message dictionary — for user-visible strings in API JSON
// error responses / SSE error events. Not routed through next-intl (these
// live in route handlers, not RSC), so kept as a small inline dictionary here
// per docs/superpowers/plans/2026-07-03-g1c-dynamic-content.md T1. zh values
// are the pre-existing literal strings (unchanged copy); en values follow
// messages/GLOSSARY.md.
// NOTE: the literal 'not authenticated' thrown by store/route code is an
// internal control-flow token matched with === in catch blocks — it must NOT
// be localized or routed through this dictionary.
export type ApiMessageKey =
  | 'quotaExhausted'
  | 'providerNotConfigured'
  | 'providerFailed'
  | 'providerFallback'
  | 'oversellBlocked';

const API_MESSAGES: Record<ApiMessageKey, Record<AppLocale, string>> = {
  quotaExhausted: {
    zh: '今日平台额度已用完',
    en: "Today's platform quota has been used up",
  },
  providerNotConfigured: {
    zh: '未配置 AI Provider。请在「设置 → AI 模型」中选择提供商并填入 API Key。',
    en: 'No AI provider configured. Please choose a provider and enter an API key under "Settings → AI Model".',
  },
  providerFailed: {
    zh: 'AI 分析暂时失败，请稍后重试。',
    en: 'AI analysis failed temporarily. Please try again.',
  },
  providerFallback: {
    zh: '你的个人 AI 模型暂时不可用，已自动切换到平台模型继续分析。',
    en: 'Your personal AI model is unavailable, so the analysis has continued with the platform model.',
  },
  oversellBlocked: {
    zh: '删除该笔买入会导致后续卖出超过持仓，请先删除相关卖出记录',
    en: 'Deleting this buy would cause a later sell to exceed your holding — please delete the related sell record(s) first',
  },
};

export function apiMessage(locale: AppLocale, key: ApiMessageKey): string {
  return API_MESSAGES[key][locale];
}
