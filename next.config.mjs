import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts).
  outputFileTracingIncludes: {
    '/api/cron/reconcile': ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'],
  },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
    return [{ source: '/dashboard', destination: '/today', permanent: true }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
