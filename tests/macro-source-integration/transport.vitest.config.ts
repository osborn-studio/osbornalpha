import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
  cacheDir: '/tmp/osstack/macro-source-integration/session-1/vite-cache',
  test: { environment: 'node', include: ['tests/macro-source-integration/transport.test.ts'], maxWorkers: 1, fileParallelism: false },
});
