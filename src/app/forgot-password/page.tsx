import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ForgotPasswordPageClient from './ForgotPasswordPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('forgotTitle'),
    description: t('forgotDescription'),
    alternates: { languages: { 'zh-CN': '/forgot-password', en: '/en/forgot-password' } },
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
