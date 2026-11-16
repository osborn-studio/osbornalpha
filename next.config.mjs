import createNextIntlPlugin from 'next-intl/plugin';

const RECONCILE_MANIFESTS = ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'];
// F3 document pipeline: files the extraction routes read or start at runtime (see outputFileTracingIncludes)
const F3_EXTRACT_FILES = [
  './build/extract-worker/extract-worker.mjs',   // the self-contained worker bundle (npm run prebuild)
  './build/extract-worker/extract-worker.manifest.json',   // its manifest: workerPreflight refuses a bundle without it (worker_stale)
  './node_modules/pdfjs-dist/cmaps/**/*', './node_modules/pdfjs-dist/standard_fonts/**/*', './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
];
// end F3

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts); so do the
  // quarantine restore route and the admin dq dashboard (restoreInputsHashNow recomputes the current inputs hash).
  // F3 document pipeline: pdf.js CMaps (CID-keyed CJK fonts) and standard font data are read from
  // node_modules/pdfjs-dist at runtime (src/lib/documents/extract/pdf.ts::pdfjsAssets); file tracing
  // does not see them, so ship them with the routes that extract. Verified by the Vercel preview smoke
  // in docs/runbooks/document-pipeline.md before DOCUMENTS_EXTRACT_ENABLED is set.
  // The extraction runs in a worker thread (src/lib/documents/extract/isolate.ts) started from the
  // esbuild bundle build/extract-worker/extract-worker.mjs (pdf.js inlined; codex plan round 4), which
  // import tracing cannot see either; pdf.worker.mjs stays traced as an asset next to the CMaps/fonts.
  outputFileTracingIncludes: {
    // F4
    // Registry-selected methodology documents are read at runtime (spec §10).
    '/api/methodologies/*/*': ['./docs/methodologies/**/*.md'],
    // /F4
    '/api/cron/reconcile': RECONCILE_MANIFESTS,
    '/api/admin/dq/quarantine/[id]': RECONCILE_MANIFESTS,
    '/api/admin/dq': RECONCILE_MANIFESTS,
    // F3 document pipeline
    '/api/cron/documents-extract': F3_EXTRACT_FILES,
    '/api/cron/documents-candidates': F3_EXTRACT_FILES,
    '/api/admin/documents/[id]/reprocess': F3_EXTRACT_FILES,
    // end F3
  },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
    return [
      { source: '/dashboard', destination: '/macro', permanent: true },
      { source: '/today', destination: '/macro', permanent: true },
      { source: '/intel/macro', destination: '/macro', permanent: true },
      { source: '/intel/macro/:path*', destination: '/macro/:path*', permanent: true },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
