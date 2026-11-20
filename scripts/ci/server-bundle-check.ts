import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const route = 'app/api/macro/strategy/explanations/route.js';

export function checkServerBundle(nextDir: string) {
  const server = resolve(nextDir, 'server');
  const routeFile = join(server, route);
  const problems: string[] = [];
  const checked = {route, files: 0};

  try {
    for (const entry of readdirSync(server, {recursive: true, withFileTypes: true})) {
      if (entry.isDirectory()) continue;
      const path = relative(nextDir, join(entry.parentPath, entry.name)).split(sep).join('/');
      if (path.includes('/static/media/')) {
        problems.push(`server asset module ${path}: its URL is not a readable file at runtime`);
      }
    }
  } catch (error) {
    problems.push(`cannot inspect server directory: ${error}`);
  }

  const files = new Set([routeFile]);
  try {
    const trace = JSON.parse(readFileSync(routeFile + '.nft.json', 'utf8'));
    if (!Array.isArray(trace?.files) || !trace.files.every((file: unknown) => typeof file === 'string')) {
      throw new Error('expected a files array of paths');
    }
    for (const entry of trace.files) {
      const file = resolve(dirname(routeFile), entry);
      if (file.startsWith(server + sep) && file.endsWith('.js')) files.add(file);
    }
  } catch (error) {
    problems.push(`cannot read ${route}.nft.json: ${error}`);
  }

  const markers = {
    zh: /macro-explain-prompt\/1 (?:·|\\u00[bB]7|\\x[bB]7) zh/,
    en: /macro-explain-prompt\/1 (?:·|\\u00[bB]7|\\x[bB]7) en/,
  };
  const missing = new Map(Object.entries(markers));
  for (const file of files) {
    try {
      const code = readFileSync(file, 'utf8');
      checked.files++;
      for (const [locale, marker] of missing) {
        if (marker.test(code)) missing.delete(locale);
      }
    } catch (error) {
      problems.push(`cannot read ${relative(server, file)}: ${error}`);
    }
  }
  for (const locale of missing.keys()) {
    problems.push(`explanation prompt ${locale} is not in the route's server bundle`);
  }
  return {ok: problems.length === 0, problems, checked};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkServerBundle(process.argv[2] ?? '.next');
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
