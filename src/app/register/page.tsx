import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import RegisterPageClient from './RegisterPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('registerTitle'),
    description: t('registerDescription'),
    alternates: { languages: { 'zh-CN': '/register', en: '/en/register' } },
  };
}

export default function RegisterPage() {
  return <RegisterPageClient />;
}
