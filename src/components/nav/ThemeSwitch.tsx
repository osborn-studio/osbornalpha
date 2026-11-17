'use client';
import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {readTheme, saveTheme, type Theme} from './theme-preference';
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>('dark');
  const t = useTranslations('common.nav');
  useEffect(() => {
    const sync = () => setTheme(readTheme());
    sync();
    window.addEventListener('theme-change', sync);
    window.addEventListener('storage', sync);
    return () => {window.removeEventListener('theme-change', sync); window.removeEventListener('storage', sync);};
  }, []);
  return <div role="group" aria-label={t('theme')} className="inline-flex rounded-[4px] border border-border overflow-hidden">
    {(['dark', 'light'] as const).map(value => <button key={value} type="button" aria-pressed={theme === value}
      className={`min-h-[44px] min-w-[52px] px-2 text-xs ${theme === value ? 'bg-[var(--accent-wash)] text-accent font-semibold' : 'text-text-dim'}`}
      onClick={() => {setTheme(value); saveTheme(value);}}>{t(value === 'dark' ? 'themeDark' : 'themeLight')}</button>)}
  </div>;
}
