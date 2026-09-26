/** WP-A5 character 3-gram MinHash (128 hashes) for near-duplicate detection. Pure, deterministic. */
export const MINHASH_SIZE = 128;
const SHINGLE = 3;
const MAX_CHARS = 20_000;

export function shingles(text: string): Set<string> {
  const t = text.normalize('NFKC').toLowerCase().replace(/\s+/g, '').slice(0, MAX_CHARS);
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= t.length; i++) out.add(t.slice(i, i + SHINGLE));
  return out;
}

// FNV-1a 32-bit and a second independent hash (Murmur-style finalizer) → h_i = h1 + i·h2 (mod 2^32).
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mix(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; x ^= x >>> 16;
  return x >>> 0;
}

export function minhash(text: string): Uint32Array {
  const sig = new Uint32Array(MINHASH_SIZE).fill(0xffffffff);
  for (const sh of shingles(text)) {
    const h1 = fnv1a(sh), h2 = mix(h1 ^ 0x9e3779b9) | 1;
    for (let i = 0; i < MINHASH_SIZE; i++) { const h = (h1 + i * h2) >>> 0; if (h < sig[i]) sig[i] = h; }
  }
  return sig;
}

/** Estimated Jaccard similarity from two signatures; 0 when either text had no shingles. */
export function jaccard(a: Uint32Array, b: Uint32Array): number {
  let empty = true, same = 0;
  for (let i = 0; i < MINHASH_SIZE; i++) { if (a[i] !== 0xffffffff || b[i] !== 0xffffffff) empty = false; if (a[i] === b[i] && a[i] !== 0xffffffff) same++; }
  return empty ? 0 : same / MINHASH_SIZE;
}
