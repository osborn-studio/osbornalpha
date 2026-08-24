import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './crypto';

beforeAll(() => {
  process.env.LLM_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('llm/crypto', () => {
  it('round-trips an ascii string', () => {
    const input = 'sk-test-1234567890';
    expect(decrypt(encrypt(input))).toBe(input);
  });

  it('round-trips a unicode string', () => {
    const input = '股票';
    expect(decrypt(encrypt(input))).toBe(input);
  });

  it('round-trips an empty string', () => {
    const input = '';
    expect(decrypt(encrypt(input))).toBe(input);
  });

  it('produces different payloads for the same input (random IV)', () => {
    const input = 'same-input-value';
    const a = encrypt(input);
    const b = encrypt(input);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(input);
    expect(decrypt(b)).toBe(input);
  });

  it('throws when the ciphertext segment is mutated', () => {
    const payload = encrypt('tamper-test-value');
    const [ivB64, authTagB64, ciphertextB64] = payload.split('.');
    // Flip one character in the ciphertext segment.
    const firstChar = ciphertextB64[0];
    const replacement = firstChar === 'A' ? 'B' : 'A';
    const mutatedCiphertext = replacement + ciphertextB64.slice(1);
    const mutatedPayload = `${ivB64}.${authTagB64}.${mutatedCiphertext}`;
    expect(() => decrypt(mutatedPayload)).toThrow();
  });

  it('throws when LLM_ENC_KEY is missing', () => {
    const original = process.env.LLM_ENC_KEY;
    delete process.env.LLM_ENC_KEY;
    try {
      expect(() => encrypt('x')).toThrow('LLM_ENC_KEY not configured');
    } finally {
      process.env.LLM_ENC_KEY = original;
    }
  });
});
