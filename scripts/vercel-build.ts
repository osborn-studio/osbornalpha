import { spawnSync } from 'node:child_process';
import { assertLatestWatchlistReleaseMarker } from '../src/lib/watchlist/release';

async function main() {
  if (process.env.VERCEL_ENV === 'production'
    && process.env.WATCHLIST_REQUIRE_SCHEMA_GATE !== 'false') {
    await assertLatestWatchlistReleaseMarker();
    console.log('Watchlist production schema gate passed.');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build'], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'vercel_build_failed');
  process.exitCode = 1;
});
