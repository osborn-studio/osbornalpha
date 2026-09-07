'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Scheme = 'cn' | 'us';
type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const t = useTranslations('components.themeToggle');
  const [scheme, setScheme] = useState<Scheme>('cn');
  const [theme, setTheme] = useState<Theme>('dark');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const s = (localStorage.getItem('color-scheme') as Scheme) || 'cn';
    const t = (localStorage.getItem('theme') as Theme) || 'dark';
    setScheme(s);
    setTheme(t);
    applyScheme(s);
    applyTheme(t);
  }, []);

  function applyScheme(s: Scheme) {
    document.documentElement.setAttribute('data-color-scheme', s);
  }
  function applyTheme(t: Theme) {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${t}`);
  }

  function setS(s: Scheme) {
    setScheme(s);
    localStorage.setItem('color-scheme', s);
    applyScheme(s);
    setOpen(false);
  }
  function setT(t: Theme) {
    setTheme(t);
    localStorage.setItem('theme', t);
    applyTheme(t);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-2 text-text-dim hover:bg-bg-card hover:text-text"
        title={t('appearanceSettings')}
        aria-label={t('themeToggleAria')}
      >
        🎨
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-bg-elevated p-2 shadow-lg">
          <div className="mb-2 text-xs text-text-dim">{t('colorScheme')}</div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <button
              onClick={() => setS('cn')}
              className={`rounded px-2 py-1.5 text-xs ${scheme === 'cn' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
            >
              🇨🇳 {t('schemeCn')}
            </button>
            <button
              onClick={() => setS('us')}
              className={`rounded px-2 py-1.5 text-xs ${scheme === 'us' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
            >
              🇺🇸 {t('schemeUs')}
            </button>
          </div>
          <div className="mb-2 text-xs text-text-dim">{t('theme')}</div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setT('dark')}
              className={`rounded px-2 py-1.5 text-xs ${theme === 'dark' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
            >
              🌑 {t('themeDark')}
            </button>
            <button
              onClick={() => setT('light')}
              className={`rounded px-2 py-1.5 text-xs ${theme === 'light' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
            >
              ☀️ {t('themeLight')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
