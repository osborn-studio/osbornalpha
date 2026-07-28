const TOOL_LINE_PATTERNS = [
  /^\s*(?:✅|❌|⏳)?\s*工具\s+[A-Za-z0-9_-]+\s*[—-]\s*\{.*\}\s*$/gm,
  /^\s*(?:✅|❌|⏳)?\s*tool\s+[A-Za-z0-9_-]+\s*[—-]\s*\{.*\}\s*$/gim,
  /^\s*(?:✅|❌|⏳)?\s*(?:工具|tool)\s+[A-Za-z0-9_-]+\s*\{.*\}\s*$/gim,
];

const SOURCE_JSON_PATTERN = /\{["']source["']\s*:\s*["'][^"']+["'][\s\S]{0,1200}?\}/g;

export function sanitizeAiText(text: string | null | undefined): string {
  if (!text) return '';
  let out = String(text);
  for (const pattern of TOOL_LINE_PATTERNS) out = out.replace(pattern, '');
  out = out.replace(SOURCE_JSON_PATTERN, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeAiList(items: string[] | null | undefined): string[] {
  return (items ?? [])
    .map((item) => sanitizeAiText(item))
    .filter(Boolean);
}
