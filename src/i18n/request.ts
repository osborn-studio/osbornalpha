import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { resolveLocale } from '@/lib/i18n/locale';

// "Without i18n routing" mode — no [locale] segment. Locale for RSC is
// resolved from (in priority order): the x-app-locale request header (set by
// middleware when rewriting /en/* to the unprefixed path), the NEXT_LOCALE
// cookie (in-app preference, written by the settings-page language switcher),
// then Accept-Language, then DEFAULT_LOCALE. See src/lib/i18n/locale.ts.
const MESSAGE_DOMAINS = [
  'common', 'landing', 'auth', 'errors', 'settings',
  // G1b domains (pre-registered for the parallel extraction fan-out):
  'portfolio', 'intel', 'tools', 'market', 'components',
  // G1d domains (pre-registered, same fan-out pattern):
  'briefs', 'radar', 'watchlist',
  // Internal operations dashboard:
  'admin',
  // Analyst scoring layer (spec 2026-10-17):
  'analyst',
  // INDUSTRY:BEGIN
  // Industry research module (spec 2026-11-04-industry-research §12):
  'industries',
  // INDUSTRY:END
  // MACRO
  // Macro workbench (spec 2026-11-04-macro-workbench-design §10):
  'macro',
  // /MACRO
  // MACRO-P3
  'macroStrategy',
  // /MACRO-P3
  // F3 document pipeline (source drawer, spec 2026-11-04 §9.1):
  'documents',
  // F3 end
  // COMPANY — company research module (plan 2026-11-06 Task 11)
  'company', 'tracking',
  // /COMPANY
  // F4
  // Judgment framework (spec 2026-11-04 §9.5):
  'judgments',
  // /F4
] as const;

export default getRequestConfig(async () => {
  const h = await headers();
  const c = await cookies();
  const locale = resolveLocale({
    header: h.get('x-app-locale'),
    cookie: c.get('NEXT_LOCALE')?.value,
    acceptLanguage: h.get('accept-language'),
  });

  const messages = Object.assign(
    {},
    ...(await Promise.all(
      MESSAGE_DOMAINS.map(async (domain) => ({
        [domain]: (await import(`../../messages/${locale}/${domain}.json`)).default,
      }))
    ))
  );

  return { locale, messages };
});
