import { describe, expect, it } from 'vitest';
import { canonicalizeEvidenceUrl } from './url';

describe('canonicalizeEvidenceUrl', () => {
  it('keeps public http(s) URLs while removing tracking parameters and fragments', () => {
    expect(canonicalizeEvidenceUrl('https://example.com/article?utm_source=test&id=42#section'))
      .toBe('https://example.com/article?id=42');
  });

  it('rejects non-web protocols, embedded credentials, and private destinations', () => {
    expect(canonicalizeEvidenceUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeEvidenceUrl('file:///etc/passwd')).toBeNull();
    expect(canonicalizeEvidenceUrl('https://user:secret@example.com/article')).toBeNull();
    expect(canonicalizeEvidenceUrl('http://localhost:3000/admin')).toBeNull();
    expect(canonicalizeEvidenceUrl('http://192.168.1.10/admin')).toBeNull();
    expect(canonicalizeEvidenceUrl('http://[fd00::1]/admin')).toBeNull();
    expect(canonicalizeEvidenceUrl('http://[::ffff:127.0.0.1]/admin')).toBeNull();
  });

  it('returns null for malformed or missing values', () => {
    expect(canonicalizeEvidenceUrl('not a URL')).toBeNull();
    expect(canonicalizeEvidenceUrl('')).toBeNull();
  });
});
