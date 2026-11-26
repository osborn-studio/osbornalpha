import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateAnalystAliases } from '../../integrations/feishu/feishu-pairing.mjs';

const identifier = value => typeof value === 'string' && /^[\w:-]{1,160}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseOnboardingRequest(text) {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^(?:(?:我(?:也)?(?:想要|希望|想|要|申请|要申请)|申请)(?:加入成为|成为|当|加入|做)|申请(?:开通)?)(?:一名)?分析师(?:身份)?(?:[，,。\s]*(?:我的)?(?:署名|姓名|名字)(?:叫|是|为)?[：:\s]*([^，,。！？?!\r\n|｜]+))?[。！!]?$/u);
  if (!match) return null;
  const displayName = (match[1] || '').trim();
  if (displayName.length > 60 || /[\p{C}\p{Zl}\p{Zp}]/u.test(displayName)) return null;
  return {displayName};
}

export function readConfiguredBindings(directory) {
  let value;
  try { value = JSON.parse(readFileSync(join(directory,'feishu-bindings.json'),'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  if (!record(value) || (value.chatId != null && value.chatId !== '' && !identifier(value.chatId)) ||
      (value.analystBySender != null && !record(value.analystBySender)) ||
      (value.analystNamesByRole != null && !record(value.analystNamesByRole)) ||
      (value.approverIds != null && !Array.isArray(value.approverIds))) throw Error('身份配置格式无效');
  validateAnalystAliases(value);
  return value;
}

export function mergeSelfEnrollments(settings, db) {
  if (!settings.chatId || !db || !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='feishu_demo_members'").get()) return settings;
  const rows = db.prepare(`SELECT m.sender_id, a.id, a.display_name FROM feishu_demo_members m
    JOIN replay_analysts a ON a.id=m.analyst_id WHERE m.chat_id=?`).all(settings.chatId);
  if (!rows.length) return settings;
  const analystBySender = {...settings.analystBySender};
  const analystNamesByRole = {...settings.analystNamesByRole};
  const demoOnlyRoles = [];
  const assignedProfiles = new Set(Object.values(analystBySender));
  for (const row of rows) {
    if (Object.hasOwn(analystBySender,row.sender_id) || settings.approverIds?.includes(row.sender_id) ||
        assignedProfiles.has(row.id)) throw Error('飞书自助成员和手动绑定冲突。');
    assignedProfiles.add(row.id);
    analystBySender[row.sender_id] = row.id;
    analystNamesByRole[row.id] = row.display_name;
    demoOnlyRoles.push(row.id);
  }
  const merged = {...settings,analystBySender,analystNamesByRole,demoOnlyRoles};
  validateAnalystAliases(merged);
  return merged;
}

export function loadConnectorBindings(directory, replayDirectory = directory) {
  const settings = readConfiguredBindings(directory);
  const file = join(replayDirectory,'replay.sqlite');
  if (!settings.chatId) return settings;
  // The separately hosted Demo may be offline. Its database is supplementary to
  // the connector's trusted static bindings, including the existing formal roles.
  if (!existsSync(file)) return {...settings,demoMembershipUnavailable:true};
  let db;
  try {
    db = new DatabaseSync(file,{readOnly:true});
    db.exec('PRAGMA busy_timeout=100');
    return mergeSelfEnrollments(settings,db);
  } catch {
    return {...settings,demoMembershipUnavailable:true};
  } finally { db?.close(); }
}

export async function onboardLocalMember(port, {eventId}) {
  const response = await fetch('http://127.0.0.1:' + port + '/internal/feishu/onboarding', {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventId}),
    redirect:'error',signal:AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error || 'Demo 建档服务暂不可用。'),{status:response.status});
  return data;
}
