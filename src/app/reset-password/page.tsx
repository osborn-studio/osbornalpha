import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ResetPasswordPageClient from './ResetPasswordPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('resetTitle'),
    description: t('resetDescription'),
    alternates: { languages: { 'zh-CN': '/reset-password', en: '/en/reset-password' } },
  };
}

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}
