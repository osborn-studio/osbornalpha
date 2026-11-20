import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {afterEach, beforeEach, expect, it} from 'vitest';
import {checkServerBundle} from './server-bundle-check';

const route = 'app/api/macro/strategy/explanations/route.js';
const zh = 'macro-explain-prompt/1 · zh';
const en = String.raw`macro-explain-prompt/1 \u00b7 en`;
const missing = (locale: string) => `explanation prompt ${locale} is not in the route's server bundle`;
let root: string;
let nextDir: string;
let routeFile: string;
let chunk: string;

function write(path: string, content: string) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'server-bundle-check-'));
  nextDir = join(root, '.next');
  routeFile = join(nextDir, 'server', route);
  chunk = join(nextDir, 'server/chunks/123.js');
  write(routeFile, '');
  write(routeFile + '.nft.json', JSON.stringify({files: [relative(dirname(routeFile), chunk)]}));
  write(chunk, JSON.stringify(zh) + '; "' + en + '"');
});

afterEach(() => rmSync(root, {recursive: true, force: true}));

it('finds literal and escaped markers in a traced server chunk', () => {
  expect(checkServerBundle(nextDir)).toEqual({ok: true, problems: [], checked: {route, files: 2}});
});

it('reports each emitted server media file and ignores client assets', () => {
  const assets = ['server/chunks/static/media/x.hash.md', 'server/static/media/nested/y.txt'];
  for (const path of [...assets, 'static/media/logo.svg']) write(join(nextDir, path), '');
  const result = checkServerBundle(nextDir);
  expect(result.ok).toBe(false);
  expect(result.problems.sort()).toEqual(assets.map(path =>
    `server asset module ${path}: its URL is not a readable file at runtime`).sort());
});

it('reports both missing markers', () => {
  write(chunk, '');
  expect(checkServerBundle(nextDir).problems).toEqual([missing('zh'), missing('en')]);
});

it('counts the route itself and ignores untraced, non-JavaScript and outside files', () => {
  write(routeFile, zh);
  write(chunk, '');
  write(join(dirname(chunk), 'untraced.js'), en);
  const excluded = [join(nextDir, 'server-other/chunk.js'), chunk + '.map'];
  for (const file of excluded) write(file, en);
  write(routeFile + '.nft.json', JSON.stringify({
    files: [chunk, ...excluded].map(file => relative(dirname(routeFile), file)),
  }));
  expect(checkServerBundle(nextDir).problems).toEqual([missing('en')]);
});

it('reports a missing route even when the trace contains both markers', () => {
  rmSync(routeFile);
  expect(checkServerBundle(nextDir).problems).toEqual([expect.stringContaining(route)]);
});

it('requires the trace even when the route contains both markers', () => {
  write(routeFile, zh + '\n' + en);
  rmSync(routeFile + '.nft.json');
  expect(checkServerBundle(nextDir).problems).toEqual([expect.stringContaining(route + '.nft.json')]);
});
