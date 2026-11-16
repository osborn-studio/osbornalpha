import { defineConfig } from 'vitest/config';
import {transform} from 'esbuild';
import path from 'node:path';

export default defineConfig({
  plugins: [{name:'test-tsx',enforce:'pre',transform(code,id){if(id.endsWith('.tsx'))return transform(code,{loader:'tsx',jsx:'automatic',jsxImportSource:'react',sourcefile:id}).then(r=>({code:r.code,map:r.map}));}}],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
