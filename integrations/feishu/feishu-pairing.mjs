import { createHash } from 'node:crypto';

export function pairingReference(chatId, senderId) {
  return createHash('sha256').update(JSON.stringify([chatId,senderId])).digest('hex').slice(0,12).toUpperCase();
}

export function validateAnalystAliases(settings) {
  const aliases = settings.analystAliasesByRole;
  if (aliases === undefined) return;
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) throw Error('分析师群名配置须按角色列出。');
  const names = settings.analystNamesByRole ?? {};
  const roles = new Set(['A','B', ...Object.keys(names), ...Object.keys(aliases), ...Object.values(settings.analystBySender ?? {})]);
  const owners = new Map();
  const key = name => name.normalize('NFKC').toLowerCase();
  function reserve(name, role) {
    if (typeof name !== 'string') return;
    const normalized = key(name);
    if (owners.has(normalized) && owners.get(normalized) !== role) owners.set(normalized, null);
    else owners.set(normalized, role);
  }
  for (const role of roles) {
    reserve(role, role);
    reserve(Object.hasOwn(names, role) ? names[role] : ['A','B'].includes(role) ? '分析师 ' + role : null, role);
  }
  for (const [role, list] of Object.entries(aliases)) {
    if (!/^[\w:-]{1,160}$/.test(role) || !Array.isArray(list)) throw Error('每个分析师角色的群名须使用列表。');
    for (const name of list) {
      if (typeof name !== 'string' || !name.length || name.length > 60 || name !== name.trim() ||
          /[|｜\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) throw Error('分析师群名须为 1–60 字符的单行署名。');
      const owner = owners.get(key(name));
      if (owner !== undefined && owner !== role) throw Error('分析师群名与其他角色的署名重复。');
      owners.set(key(name), role);
    }
  }
}
