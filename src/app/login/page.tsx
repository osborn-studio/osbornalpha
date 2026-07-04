import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LoginPageClient from './LoginPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('loginTitle'),
    description: t('loginDescription'),
    alternates: { languages: { 'zh-CN': '/login', en: '/en/login' } },
  };
}

export default function LoginPage() {
  return <LoginPageClient />;
}
