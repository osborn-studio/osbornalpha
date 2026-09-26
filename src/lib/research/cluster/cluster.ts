/**
 * WP-A5 near-duplicate clustering (implementation plan §5.1): canonical URL →
 * normalized title → character 3-gram MinHash against each cluster's earliest
 * member. Pure: takes rows in (available_at, id) order plus already-clustered
 * rows, returns only the rows whose cluster fields must be written.
 */
import { createHash } from 'node:crypto';
import { jaccard, minhash } from './minhash';
import { normalizeTitle, normalizeUrl } from './normalize';

export const DEFAULT_JACCARD = 0.8;

export interface ClusterInputSource {
  id: string; title: string | null; url: string | null; raw_text: string;
  available_at: string; cluster_id: string | null; cluster_first: boolean | null;
}
export interface ClusterWrite { id: string; cluster_id: string; cluster_first: boolean }
export interface ClusterOptions { jaccard?: number }

/** Deterministic cluster id: uuid v8 over sha256(owner + first member id). */
export function clusterIdFor(owner: string, firstSourceId: string): string {
  const hex = createHash('sha256').update(`${owner}\u0000${firstSourceId}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface Cluster { id: string; urls: Set<string>; titles: Set<string>; first: ClusterInputSource; representative: Uint32Array; members: ClusterInputSource[] }

const earlier = (a: ClusterInputSource, b: ClusterInputSource) => a.available_at < b.available_at || (a.available_at === b.available_at && a.id < b.id);

export function assignClusters(owner: string, fresh: ClusterInputSource[], existing: ClusterInputSource[], options: ClusterOptions = {}): ClusterWrite[] {
  const threshold = options.jaccard ?? DEFAULT_JACCARD;
  const clusters = new Map<string, Cluster>();
  const add = (c: Cluster, s: ClusterInputSource) => {
    c.members.push(s);
    const u = normalizeUrl(s.url); if (u) c.urls.add(u);
    const t = normalizeTitle(s.title); if (t) c.titles.add(t);
    if (earlier(s, c.first)) { c.first = s; c.representative = minhash(s.raw_text); }
  };
  for (const s of [...existing].sort((a, b) => (earlier(a, b) ? -1 : 1))) {
    if (!s.cluster_id) continue;
    let c = clusters.get(s.cluster_id);
    if (!c) { c = { id: s.cluster_id, urls: new Set(), titles: new Set(), first: s, representative: minhash(s.raw_text), members: [] }; clusters.set(c.id, c); }
    add(c, s);
  }
  const originalFirst = new Map<string, string>();
  for (const s of existing) if (s.cluster_id && s.cluster_first === true) originalFirst.set(s.cluster_id, s.id);

  for (const s of [...fresh].sort((a, b) => (earlier(a, b) ? -1 : 1))) {
    const u = normalizeUrl(s.url), t = normalizeTitle(s.title);
    let target: Cluster | undefined;
    if (u) target = [...clusters.values()].find(c => c.urls.has(u));
    if (!target && t) target = [...clusters.values()].find(c => c.titles.has(t));
    if (!target) {
      const sig = minhash(s.raw_text);
      let best: { c: Cluster; score: number } | undefined;
      for (const c of clusters.values()) { const score = jaccard(sig, c.representative); if (score >= threshold && (!best || score > best.score)) best = { c, score }; }
      target = best?.c;
    }
    if (!target) { target = { id: clusterIdFor(owner, s.id), urls: new Set(), titles: new Set(), first: s, representative: minhash(s.raw_text), members: [] }; clusters.set(target.id, target); }
    add(target, s);
  }

  const writes: ClusterWrite[] = [];
  for (const c of clusters.values()) {
    for (const m of c.members) {
      const first = m.id === c.first.id;
      const unchanged = m.cluster_id === c.id && m.cluster_first === first;
      if (!unchanged) writes.push({ id: m.id, cluster_id: c.id, cluster_first: first });
    }
  }
  return writes.sort((a, b) => a.id.localeCompare(b.id));
}
