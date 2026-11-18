// Next.js's vendored next/dist/compiled/picomatch is outside npm audit's view
// and is not covered by this exception.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

type Fix = boolean | {name: string; version: string; isSemVerMajor?: boolean};
type Advisory = {url?: string};
type Vulnerability = {severity: string; fixAvailable?: Fix; nodes?: string[]; via: (string | Advisory)[]};
export type AuditReport = {vulnerabilities: Record<string, Vulnerability>; error?: unknown};
export type AllowlistEntry = {id: string; package: string; path: string; installed: string; reason: string; expires: string};

function validNodePath(value: unknown): value is string {
  return typeof value === 'string' && /^(?:node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9_-][a-z0-9._-]*)(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9_-][a-z0-9._-]*)*$/.test(value);
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function advisoryId(advisory: Advisory): string | undefined {
  return advisory.url?.match(/\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})(?:$|[?#])/i)?.[1];
}

export function evaluateAudit(report: AuditReport, allowlist: AllowlistEntry[], today: string, root = process.cwd()) {
  if (!report || report.error || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error('npm audit did not return a valid vulnerabilities report');
  }
  if (!validDate(today) || !Array.isArray(allowlist)) throw new Error('Invalid audit date or allowlist');
  const messages = new Set<string>();
  for (const entry of allowlist) {
    if (!entry || ['id', 'package', 'path', 'installed', 'reason', 'expires'].some(field =>
        typeof entry[field as keyof AllowlistEntry] !== 'string' || !entry[field as keyof AllowlistEntry].trim()) ||
        !validNodePath(entry.path) || !validNodePath(`node_modules/${entry.package}`) ||
        (!entry.path.endsWith(`/node_modules/${entry.package}`) && entry.path !== `node_modules/${entry.package}`) ||
        !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(entry.id) ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(entry.installed) || !validDate(entry.expires)) {
      throw new Error('Invalid npm audit allowlist entry');
    }
    if (entry.expires <= today) messages.add(`${entry.package} ${entry.id}: allowlist entry expired ${entry.expires}; remove the entry or review it.`);
  }
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    if (!vulnerability || !['info', 'low', 'moderate', 'high', 'critical'].includes(vulnerability.severity) ||
        (vulnerability.nodes !== undefined && (!Array.isArray(vulnerability.nodes) || vulnerability.nodes.some(node => !validNodePath(node)))) ||
        !Array.isArray(vulnerability.via) || vulnerability.via.some(via =>
          typeof via !== 'string' && (!via || typeof via !== 'object' || (via.url !== undefined && typeof via.url !== 'string')))) {
      throw new Error('Malformed npm audit vulnerability');
    }
  }

  const applicability = new Map<AllowlistEntry, boolean>();
  function applies(entry: AllowlistEntry): boolean {
    const cached = applicability.get(entry);
    if (cached !== undefined) return cached;
    const nodes = report.vulnerabilities[entry.package]?.nodes;
    let matches = Array.isArray(nodes) && nodes.includes(entry.path);
    if (!matches) messages.add(`${entry.package} ${entry.id}: cannot determine installed version from audit nodes; re-check the advisory and update or remove the entry.`);
    for (const node of nodes?.filter(node => node === entry.path) ?? []) {
      try {
        const {version} = JSON.parse(readFileSync(resolve(root, node, 'package.json'), 'utf8'));
        if (typeof version !== 'string' || !version) throw new Error('Missing package version');
        if (version !== entry.installed) {
          matches = false;
          messages.add(`${entry.package} ${entry.id}: installed ${version} differs from allowlisted ${entry.installed}; re-check the advisory and update or remove the entry`);
        }
      } catch {
        matches = false;
        messages.add(`${entry.package} ${entry.id}: cannot read installed version at ${node}; re-check the advisory and update or remove the entry.`);
      }
    }
    const allowed = entry.expires > today && matches;
    applicability.set(entry, allowed);
    return allowed;
  }

  // npm represents affected ancestors as package-name strings in via. Resolve
  // those to advisory IDs. A valid entry covers every row whose advisories are
  // all allowlisted by ID, provided every vulnerable leaf node is covered.
  // Installed versions are checked for the entry's package, not the ancestor.
  function inspect(name: string, seen = new Set<string>()): {allowed: boolean; ids: string[]; entries: AllowlistEntry[]} {
    const vulnerability = report.vulnerabilities[name];
    if (!vulnerability || seen.has(name)) return {allowed: false, ids: [], entries: []};
    const path = new Set([...seen, name]);
    const ids: string[] = [];
    const entries: AllowlistEntry[] = [];
    let allowed = vulnerability.via.length > 0;
    for (const via of vulnerability.via) {
      if (typeof via === 'string') {
        const child = inspect(via, path);
        ids.push(...child.ids);
        entries.push(...child.entries);
        allowed = allowed && child.allowed;
        continue;
      }
      const id = advisoryId(via);
      if (id) ids.push(id);
      const candidates = allowlist.filter(candidate => candidate.id === id);
      // Resolve ID-only ancestor rows against the allowlisted vulnerable package.
      const leafName = candidates.some(candidate => candidate.package === name)
        ? name : candidates[0]?.package;
      const nodes = leafName ? report.vulnerabilities[leafName]?.nodes : undefined;
      const matching = candidates.filter(candidate => candidate.package === leafName && applies(candidate));
      let covered = !!nodes?.length;
      for (const node of nodes ?? []) {
        if (!matching.some(entry => entry.path === node)) {
          covered = false;
          messages.add(`${leafName} ${id}: unexpected or unapproved path ${node}`);
        }
      }
      if (leafName && leafName !== name) {
        // An ID-only parent may inherit coverage, but an unrelated package may not.
        const leaf = leafName ? report.vulnerabilities[leafName] : undefined;
        covered = covered && !!leaf?.via.some(via => typeof via !== 'string' && advisoryId(via) === id) && !!vulnerability.nodes?.length;
        for (const node of vulnerability.nodes ?? []) {
          if (!matching.some(entry => entry.path.startsWith(`${node}/node_modules/`))) {
            covered = false;
            messages.add(`${name} ${id}: unexpected or unapproved path ${node}`);
          }
        }
      }
      if (covered && matching.length) entries.push(...matching);
      else allowed = false;
    }
    return {allowed, ids: [...new Set(ids)], entries: [...new Set(entries)]};
  }

  const findings = Object.entries(report.vulnerabilities).map(([name, vulnerability]) => {
    const result = inspect(name);
    const high = vulnerability.severity === 'high' || vulnerability.severity === 'critical';
    return {
      package: name,
      severity: vulnerability.severity,
      advisoryIds: result.ids.join(', ') || 'unknown',
      fixAvailable: JSON.stringify(vulnerability.fixAvailable) ?? 'unknown',
      status: !high ? 'below-threshold' : result.allowed
        ? `allowlisted(${result.entries.map(entry => `${entry.reason}, ${entry.expires}`).join('; ')})`
        : 'blocking',
    };
  });
  return {findings, messages: [...messages], exitCode: messages.size || findings.some(finding => finding.status === 'blocking') ? 1 : 0};
}

export function main() {
  try {
    const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000});
    if (audit.error) throw audit.error;
    if (audit.signal || (audit.status !== 0 && audit.status !== 1)) throw new Error(`npm audit failed (exit ${audit.status}, signal ${audit.signal})`);
    const report = JSON.parse(audit.stdout) as AuditReport;
    if (report.error) throw new Error(`npm audit request failed: ${JSON.stringify(report.error)} ${audit.stderr.trim()}`);
    const allowlist = JSON.parse(readFileSync(new URL('./npm-audit-allowlist.json', import.meta.url), 'utf8')) as AllowlistEntry[];
    const result = evaluateAudit(report, allowlist, new Date().toISOString().slice(0, 10));
    console.table(result.findings);
    for (const message of result.messages) console.error(message);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`Dependency audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
