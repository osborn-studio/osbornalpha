import { createHash } from 'node:crypto';
export const JSON_PROFILE = 'pa-jcs/1.0';
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export function fail(code, recovery = 'Check the source and retry.') {
  throw Object.assign(new Error(code), { code, recovery });
}
function unicode(s) {
  if (!s.isWellFormed()) fail('invalid_schema');
  return s;
}
// RFC 8785: UTF-16 key ordering, ECMAScript primitive serialization, no Unicode normalization.
export function canonicalize(value, depth = 0) {
  if (depth > 32) fail('input_limit');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(unicode(value));
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) fail('invalid_schema');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(v => canonicalize(v, depth + 1)).join(',') + ']';
  if (typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid_schema');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(unicode(k)) + ':' + canonicalize(value[k], depth + 1)).join(',') + '}';
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const digest = value => sha256(canonicalize(value));
// Parse before ordinary JSON.parse can silently discard duplicate keys. JSON.parse is used ONLY for a single string token.
export function parseStrict(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length > MAX_JSON_BYTES) fail('input_limit');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid_schema'); }
  let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[i] || '\0')) i++; };
  function string() {
    const start = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') {
        try { return unicode(JSON.parse(text.slice(start, i))); } catch { fail('invalid_schema'); }
      }
    }
    fail('invalid_schema');
  }
  function value(depth) {
    if (depth > 32) fail('input_limit');
    ws();
    if (text[i] === '"') return string();
    if (text[i] === '{' || text[i] === '[') {
      const obj = text[i++] === '{', end = obj ? '}' : ']';
      const result = obj ? Object.create(null) : [];
      ws(); if (text[i] === end) { i++; return result; }
      while (i < text.length) {
        ws(); let key;
        if (obj) {
          if (text[i] !== '"') fail('invalid_schema');
          key = string();
          if (Object.hasOwn(result, key)) fail('duplicate_key');
          ws(); if (text[i++] !== ':') fail('invalid_schema');
        }
        const v = value(depth + 1);
        if (obj) result[key] = v; else result.push(v);
        ws(); const separator = text[i++];
        if (separator === end) return result;
        if (separator !== ',') fail('invalid_schema');
      }
      fail('invalid_schema');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!match) fail('invalid_schema');
    i += match[0].length;
    const v = JSON.parse(match[0]); canonicalize(v); return v;
  }
  const result = value(0); ws(); if (i !== text.length) fail('invalid_schema');
  return result;
}
