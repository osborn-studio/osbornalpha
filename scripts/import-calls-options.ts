/** Pure CLI boundary. Never reads a journal, environment or credentials. */
export interface ImportCallsOptions { journalPath: string; scorecardPath?: string; dryRun: boolean }
export function parseImportCallsOptions(args: readonly string[]): ImportCallsOptions {
  let journalPath: string | undefined, scorecardPath: string | undefined, dryRun = false, positionalOnly = false;
  const invalid = (): never => { throw new Error('invalid_import_arguments'); };
  const path = (value: string | undefined): string => {
    if (value === undefined || !value.trim() || value.includes('\0')) invalid();
    return value!;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!positionalOnly && arg === '--') { positionalOnly = true; continue; }
    if (!positionalOnly && arg === '--dry-run') {
      if (dryRun) invalid(); dryRun = true; continue;
    }
    if (!positionalOnly && arg === '--scorecard') {
      if (scorecardPath !== undefined || args[i + 1]?.startsWith('--')) invalid();
      scorecardPath = path(args[++i]); continue;
    }
    if (!positionalOnly && arg.startsWith('--')) invalid();
    if (journalPath !== undefined) invalid();
    journalPath = path(arg);
  }
  return { journalPath: path(journalPath), ...(scorecardPath === undefined ? {} : { scorecardPath }), dryRun };
}
