// npm run feishu:xlsx-report [-- --scheduled] [-- --date YYYY-MM-DD]
// Generates, verifies, stores and posts the Excel simulation report once. launchd runs it with --scheduled.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createXlsxReporter} from './feishu-xlsx-report.mjs';

const args = process.argv.slice(2);
const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : undefined;
if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('--date 需要 YYYY-MM-DD');
  process.exit(1);
}
const directory = resolve(process.env.FEISHU_DATA_DIR || fileURLToPath(new URL('../../build/feishu/', import.meta.url)));
const reporter = createXlsxReporter({directory});
const result = await reporter.run({scheduled: args.includes('--scheduled'), date});
console.log(JSON.stringify(result));
process.exitCode = ['sent', 'skipped', 'nothing'].includes(result.status) ? 0 : 1;
