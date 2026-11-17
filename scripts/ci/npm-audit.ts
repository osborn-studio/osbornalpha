// Same high/critical threshold as npm audit --omit=dev --audit-level=high.
// Exceptions require an owner decision, a single production path and an expiry.
// Remove the exception and upgrade when a version above maxVulnerable is published.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

type Fix = boolean | {name: string; version: string; isSemVerMajor?: boolean};
type Advisory = {url?: string};
type Vulnerability = {severity: string; fixAvailable?: Fix; nodes?: string[]; via: (string | Advisory)[]};
export type AuditReport = {vulnerabilities: Record<string, Vulnerability>; error?: unknown};
export type AllowlistEntry = {id: string; package: string; path: string; installed: string; maxVulnerable: string; reason: string; expires: string};

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function versionParts(value: unknown): bigint[] | undefined {
  return typeof value === 'string' && /^\d+(?:\.\d+)*$/.test(value)
    ? value.split('.').map(part => BigInt(part)) : undefined;
}

function newer(version: bigint[], maximum: bigint[]): boolean {
  for (let i = 0; i < Math.max(version.length, maximum.length); i++) {
    const left = version[i] ?? BigInt(0);
    const right = maximum[i] ?? BigInt(0);
    if (left !== right) return left > right;
  }
  return false;
}

function advisoryId(advisory: Advisory): string | undefined {
  return advisory.url?.match(/\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})(?:$|[?#])/i)?.[1];
}

export function evaluateAudit(report: AuditReport, allowlist: AllowlistEntry[], today: string, root = process.cwd(), {latest = {}}: {latest?: Record<string, string | undefined>} = {}) {
  if (!report || report.error || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error('npm audit did not return a valid vulnerabilities report');
  }
  if (!validDate(today) || !Array.isArray(allowlist)) throw new Error('Invalid audit date or allowlist');
  const messages = new Set<string>();
  const published = new Map<AllowlistEntry, boolean>();
  for (const entry of allowlist) {
    if (!entry || !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(entry.id) ||
        typeof entry.package !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(entry.package) ||
        typeof entry.path !== 'string' || !/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(entry.path) ||
        entry.path.split('/').some(part => part === '.' || part === '..' || /[\\\s]/.test(part)) || !versionParts(entry.maxVulnerable) ||
        typeof entry.installed !== 'string' || !entry.installed.trim() || !entry.reason || typeof entry.expires !== 'string' || !validDate(entry.expires)) {
      throw new Error('Invalid npm audit allowlist entry');
    }
    if (entry.expires < today) messages.add(`${entry.package} ${entry.id}: allowlist entry expired ${entry.expires}; remove the entry or review it.`);
    const version = versionParts(latest[entry.package]);
    const fixed = version && newer(version, versionParts(entry.maxVulnerable)!);
    if (!version) messages.add(`could not determine the latest ${entry.package} version`);
    else if (fixed) messages.add(`a newer ${entry.package} ${latest[entry.package]} exists: upgrade and remove the allow-list entry`);
    published.set(entry, !!version && !fixed);
  }
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    if (!vulnerability || !['info', 'low', 'moderate', 'high', 'critical'].includes(vulnerability.severity) ||
        (vulnerability.nodes !== undefined && (!Array.isArray(vulnerability.nodes) || vulnerability.nodes.some(node => typeof node !== 'string'))) ||
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
    let matches = Array.isArray(nodes) && nodes.length === 1 && nodes[0] === entry.path;
    if (Array.isArray(nodes) && nodes.some(node => node !== entry.path)) messages.add(`${entry.package} ${entry.id}: unexpected path(s): ${nodes.filter(node => node !== entry.path).join(', ')}`);
    if (!matches) messages.add(`${entry.package} ${entry.id}: cannot determine installed version from audit nodes; re-check the advisory and update or remove the entry.`);
    for (const node of nodes ?? []) {
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
    const allowed = entry.expires >= today && matches && published.get(entry) === true;
    applicability.set(entry, allowed);
    return allowed;
  }

  // npm represents affected ancestors as package-name strings in via. Resolve
  // those to advisory IDs. A valid entry covers every row whose advisories are
  // all allowlisted by ID, regardless of row package (e.g. @parcel/watcher).
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
      const entry = allowlist.find(candidate => candidate.id === id && applies(candidate));
      if (entry) entries.push(entry);
      else allowed = false;
    }
    return {allowed, ids: [...new Set(ids)], entries: [...new Set(entries)]};
  }

  const used = new Set<AllowlistEntry>();
  const findings = Object.entries(report.vulnerabilities).map(([name, vulnerability]) => {
    const result = inspect(name);
    const high = vulnerability.severity === 'high' || vulnerability.severity === 'critical';
    if (high && result.allowed) for (const entry of result.entries) used.add(entry);
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
  const exceptions = allowlist.length ? allowlist.map(entry => {
    const days = Math.round((Date.parse(entry.expires) - Date.parse(today)) / 86_400_000);
    return `audit exception: ${entry.id} ${entry.package} at ${entry.path}, expires ${entry.expires} (${days < 0 ? 'EXPIRED' : `${days} days left`})${used.has(entry) ? '' : ' unused'}`;
  }) : ['audit exceptions: none'];
  return {findings, exceptions, messages: [...messages], exitCode: messages.size || findings.some(finding => finding.status === 'blocking') ? 1 : 0};
}

function main() {
  try {
    let auditFile: string | undefined;
    let today = new Date().toISOString().slice(0, 10);
    let root = process.cwd();
    const latest: Record<string, string | undefined> = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      const value = args[i + 1];
      if (!['--audit-file', '--today', '--latest', '--root'].includes(flag) || !value || value.startsWith('--')) {
        throw new Error(`Unknown flag or missing value: ${flag}`);
      }
      if (flag === '--audit-file') auditFile = value;
      else if (flag === '--today') today = value;
      else if (flag === '--root') root = resolve(value);
      else {
        const match = value.match(/^([^=]+)=([^=]+)$/);
        if (!match) throw new Error('Expected --latest package=version');
        latest[match[1]] = match[2];
      }
    }
    const allowlist = JSON.parse(readFileSync(new URL('./npm-audit-allowlist.json', import.meta.url), 'utf8')) as AllowlistEntry[];
    let report: AuditReport;
    if (auditFile) report = JSON.parse(readFileSync(resolve(auditFile), 'utf8')) as AuditReport;
    else {
      const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000});
      if (audit.error) throw audit.error;
      if (audit.signal || (audit.status !== 0 && audit.status !== 1)) throw new Error(`npm audit failed (exit ${audit.status}, signal ${audit.signal})`);
      report = JSON.parse(audit.stdout) as AuditReport;
      if (report.error) throw new Error(`npm audit request failed: ${audit.stderr.trim()}`);
      for (const name of new Set(allowlist.map(entry => entry.package))) {
        // Failed lookups remain undefined so evaluation fails closed and logs the exception.
        latest[name] = undefined;
        const lookup = spawnSync('npm', ['view', name, 'version', '--json'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000});
        if (lookup.error || lookup.signal || lookup.status !== 0) continue;
        try {
          const value: unknown = JSON.parse(lookup.stdout);
          if (typeof value === 'string') latest[name] = value;
        } catch { /* Leave latest undefined on malformed registry output. */ }
      }
    }
    const result = evaluateAudit(report, allowlist, today, root, {latest});
    for (const exception of result.exceptions) console.log(exception);
    console.table(result.findings);
    for (const message of result.messages) console.error(message);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`Dependency audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
