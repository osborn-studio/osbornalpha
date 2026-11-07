import {defineConfig} from 'vitest/config';
export default defineConfig({
  cacheDir: '/tmp/osstack/macro-source-integration/lineage-cache',
  test: {include: ['tests/macro-source-integration/lineage.test.ts'], maxWorkers: 1, fileParallelism: false},
});
