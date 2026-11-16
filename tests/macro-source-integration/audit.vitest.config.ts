import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  cacheDir: '/tmp/osstack/macro-source-integration/session-5-vite-cache',
  resolve: {alias: {'@': fileURLToPath(new URL('../../src', import.meta.url))}},
  test: {
    environment: 'node',
    include: ['tests/macro-source-integration/audit.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
