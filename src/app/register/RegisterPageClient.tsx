'use client';

import { useTranslations } from 'next-intl';
import { AuthForm } from '@/components/AuthForm';
import { Disclaimer } from '@/components/Disclaimer';

export default function RegisterPageClient() {
  const t = useTranslations('auth');
  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">{t('register.heading')}</h1>
        <p className="mb-4 text-sm text-text-dim">{t('register.subheading')}</p>
        <AuthForm mode="register" />
      </div>
      <Disclaimer />
    </>
  );
}
