import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../../../ostag/', import.meta.url));
const ostagRoot = () => process.env.OSTAG_PROJECT_DIR || defaultRoot;
let cachedRules;
let nextRecipeRead = 0;

// Match the OStag recipe synchronously before acknowledging the durable inbox.
// Unrelated conversations retain their original workflow and model.
export function isAssistantCommandCandidate(text, hasParent) {
  if (typeof text !== 'string' || text.length > 500) return false;
  if (!cachedRules) {
    if (Date.now() < nextRecipeRead) return false;
    try {
      const recipe = readFileSync(join(ostagRoot(), 'ostag/workflows/osbornalpha.json'), 'utf8');
      cachedRules = JSON.parse(recipe).map(rule => ({
        thread: rule.thread, pattern: new RegExp('^(?:' + rule.pattern + ')$', 'iu'),
      }));
    } catch {
      nextRecipeRead = Date.now() + 60_000;
      console.warn('本机 OStag 指令暂不可用，将重新加载。');
      return false;
    }
  }
  return cachedRules.some(rule => (!rule.thread || hasParent) && rule.pattern.test(text.trim()));
}

export async function classifyAssistantCommand({text, hasParent}) {
  if (!isAssistantCommandCandidate(text, hasParent)) return {intent:'other'};
  const output = await new Promise((resolve,reject) => {
    const child = execFile(process.env.OSTAG_PYTHON || 'python3',
      ['-B','-m','ostag.workflows.osbornalpha'], {
        cwd:ostagRoot(), timeout:5000, maxBuffer:4096, encoding:'utf8',
        env:{PATH:process.env.PATH, PYTHONIOENCODING:'utf-8'},
      }, (err,stdout) => err ? reject(new Error('本机 OStag 暂不可用')) : resolve(stdout));
    child.stdin.on('error',reject);
    child.stdin.end(JSON.stringify({text,hasParent}));
  });
  return JSON.parse(output);
}
