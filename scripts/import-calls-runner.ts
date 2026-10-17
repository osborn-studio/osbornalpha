import {parseImportCallsOptions,type ImportCallsOptions} from './import-calls-options';
export const IMPORT_USAGE = 'usage: import-calls.ts <journal> [--scorecard file] [--dry-run]';
interface CommandDeps {
  prepare: (options: ImportCallsOptions, registerCleanup: (cleanup: () => Promise<void>) => void) => Promise<() => Promise<unknown>>;
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}
/** Pure lifecycle seam. Parse before environment/module/file work; no raw error output.
 * Cleanup must be registered immediately after its module becomes available.
 * It is awaited, not certified against an unresponsive DB/socket. */
export async function runImportCallsCli(args: readonly string[], deps: CommandDeps): Promise<0|1|2> {
  let options: ImportCallsOptions;
  try { options = parseImportCallsOptions(args); }
  catch { deps.stderr(`invalid_import_arguments: ${IMPORT_USAGE}`); return 2; }
  let cleanup: () => Promise<void> = async () => {};
  let result: unknown, failed = false;
  try {
    const work = await deps.prepare(options, close => { cleanup = close; });
    result = await work();
  } catch { failed = true; }
  finally { try { await cleanup(); } catch { failed = true; } }
  if (failed) { deps.stderr(`import_calls_failed: check owner configuration and local input; ${IMPORT_USAGE}`); return 1; }
  // Success data intentionally stays in operator stdout; error details never do.
  try { deps.stdout(JSON.stringify(result, null, 2)); }
  catch { deps.stderr('import_calls_output_failed'); return 1; }
  return 0;
}
