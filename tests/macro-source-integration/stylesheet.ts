import path from 'node:path';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config';

export async function fixtureStylesheet(root: string) {
  // Include shared primitives explicitly; unrelated macro classes must not supply drawer layout by accident.
  return await postcss([tailwindcss({ ...tailwindConfig, content: [path.join(root, 'src/components/macro/**/*.{ts,tsx}'), path.join(root, 'src/components/ui/**/*.{ts,tsx}'), path.join(root, 'src/components/research-ui/**/*.{ts,tsx}'), `!${path.join(root, 'src/**/*.test.{ts,tsx}')}`] })]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
}
