'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface WizardCardProps {
  icon: string;
  title: string;
  desc: string;
  placeholder: string;
  methodId: string;
}

/** Discovery-wizard launcher card: a keyword input that hands off to Copilot via ?method=&q=. */
export function WizardCard({ icon, title, desc, placeholder, methodId }: WizardCardProps) {
  const t = useTranslations('intel');
  const router = useRouter();
  const [value, setValue] = useState('');

  function launch() {
    const q = value.trim();
    if (!q) return;
    router.push(`/copilot?method=${encodeURIComponent(methodId)}&q=${encodeURIComponent(q)}` as any);
  }

  return (
    <div className="card-base flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-lg">{icon}</span>{title}
      </div>
      <div className="text-xs text-text-muted">{desc}</div>
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') launch(); }}
          placeholder={placeholder}
          className="flex-1 rounded-md bg-bg-card px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={launch}
          disabled={!value.trim()}
          className="rounded-md bg-accent px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t('wizards.launch')}
        </button>
      </div>
    </div>
  );
}
