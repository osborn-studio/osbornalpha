// Pure helpers for the Copilot method step-tracker (client-safe, no deps).
// The analyst writes section headers like "§3 财务质量" into the streamed text;
// we map the furthest header seen to the step the run is currently on.

/** Section marker like "§3" from a step title ("§3 财务质量"); null if none. */
export function stepMarker(title: string): string | null {
  const m = title.match(/§\s*\d+/);
  return m ? m[0].replace(/\s+/g, '') : null;
}

/**
 * Index (1-based) of the furthest step whose "§N" marker has appeared in the
 * streamed text — the section the analyst is currently writing. 0 before any
 * section header shows up. Steps without a §N marker never advance the tracker.
 */
export function currentStepIndex(steps: { title: string }[], text: string): number {
  let reached = 0;
  steps.forEach((s, i) => {
    const mk = stepMarker(s.title);
    if (mk && text.includes(mk)) reached = i + 1;
  });
  return reached;
}
