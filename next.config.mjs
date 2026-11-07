import createNextIntlPlugin from 'next-intl/plugin';

const RECONCILE_MANIFESTS = ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts); so do the
  // quarantine restore route and the admin dq dashboard (restoreInputsHashNow recomputes the current inputs hash).
  outputFileTracingIncludes: {
    // F4
    // Registry-selected methodology documents are read at runtime (spec §10).
    '/api/methodologies/*/*': ['./docs/methodologies/**/*.md'],
    // /F4
    '/api/cron/reconcile': RECONCILE_MANIFESTS,
    '/api/admin/dq/quarantine/[id]': RECONCILE_MANIFESTS,
    '/api/admin/dq': RECONCILE_MANIFESTS,
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
