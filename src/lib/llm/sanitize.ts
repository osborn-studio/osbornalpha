const TOOL_BLOCK_PATTERNS = [
  /^工具\s+\w+.*$/gim,
  /^tool\s*[:：].*$/gim,
  /^```(?:json)?\s*\{[\s\S]*?"(?:source|results|tool|tool_calls)"[\s\S]*?\}\s*```$/gim,
];

export function sanitizeAiText(value: unknown, maxLength = 300): string {
  let text = typeof value === 'string' ? value : value == null ? '' : String(value);
  for (const pattern of TOOL_BLOCK_PATTERNS) {
    text = text.replace(pattern, '');
  }

  text = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^\{.*"(source|results|tool|tool_calls)"/.test(trimmed)) return false;
      if (/^>\s*工具\s+/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.slice(0, maxLength);
}

export function sanitizeAiList(values: unknown, maxItems = 6): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .slice(0, maxItems)
    .map((item) => sanitizeAiText(item, 160))
    .filter(Boolean);
}
