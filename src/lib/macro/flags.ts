/** Shared, environment-only gate; safe for both server and client-side imports. */
export const macroJudgmentsEnabled=(env:Readonly<Record<string,string|undefined>>=process.env):boolean=>env.MACRO_JUDGMENTS_ENABLED==='1';
