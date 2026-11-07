// src/lib/industry/method-constants.ts
// Browser-safe method constants (no imports at all). method.ts re-exports them; client components reach them
// through display.ts without pulling method.ts → canonical-json.ts → node:crypto into the client bundle
// (Codex plan audit round 1 #1). Values are decimal strings, never JS numbers.
export const METHOD_VERSION='industry-agg/1.0';
export const DISPLAY_MIN_COVERAGE='0.8';
export const DISPLAY_MAX_UNRESOLVED='0.05';
