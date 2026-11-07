import {defineConfig} from 'vitest/config';
import base from '../../vitest.config';

export default defineConfig({
  ...base,
  test: {...base.test, include: ['tests/company-release-audit/**/*.test.ts'], maxWorkers: 1},
});
