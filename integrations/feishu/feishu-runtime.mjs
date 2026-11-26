import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { localRegister } from '../../demos/analyst-replay/feishu-demo-register.mjs';
import { loadConnectorBindings, onboardLocalMember } from '../../demos/analyst-replay/feishu-onboarding.mjs';
import { openDemoRecaps } from '../../demos/analyst-replay/demo-recap.mjs';
import { classifyAssistantCommand } from './feishu-ostag.mjs';
import { openFrictionMonitor } from './feishu-friction.mjs';
import { openFeishuWorkflow } from './feishu-workflow.mjs';
import { createGroupScopedReader } from './feishu-group-report.mjs';
import { lookupFeishuListings } from './feishu-security-lookup.mjs';

export function readFeishuBindings(directory) {
  try {
    const config = JSON.parse(readFileSync(join(directory,'feishu-bindings.json'),'utf8'));
    if (!config || Array.isArray(config) || typeof config !== 'object') throw Error('飞书身份配置格式无效。');
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

const defaultDemoDirectory = fileURLToPath(new URL('../../build/analyst-replay/',import.meta.url));

function createMemberService(config, port) {
  return async ({action,displayName,eventId,senderId,chatId}) => {
    const current = config();
    if (current.chatId !== chatId) return {text:'当前群未启用分析师申请。'};
    const role = Object.hasOwn(current.analystBySender ?? {},senderId) && current.analystBySender[senderId];
    if (role) {
      const name = current.analystNamesByRole?.[role] || role;
      return {text:current.demoOnlyRoles?.includes(role)
        ? name + '，Demo 已开通；正式模拟账户尚未绑定。'
        : name + '，你已绑定分析师身份，可以向本助手提交建议。'};
    }
    if (action === 'membership') return {text:current.demoMembershipUnavailable
      ? 'Demo 暂时无法核对身份，恢复后可再查开通进度。'
      : '尚未开通分析师身份。可发送「我想成为分析师，署名你的姓名」。'};
    if (!displayName) return {text:'请署上你自己的名字，例如「我想成为分析师，署名陈晨」。'};
    try {
      const result = await onboardLocalMember(port,{eventId});
      return {text:result.demoOnly
        ? result.displayName + '，Demo 已开通，正式模拟账户尚未绑定。你现在可以 @本助手提交 Demo 建议。'
        : result.displayName + '，你已绑定分析师身份。'};
    } catch (error) {
      if ([400,403,409].includes(error.status)) return {text:error.message};
      throw Object.assign(new Error('Demo 建档服务暂不可用。'),{retriable:true});
    }
  };
}

export function openFeishuRuntime(directory, {assistantEnv, ...options}) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const lockFile = join(directory,'feishu-instance.sqlite');
  const lock = new DatabaseSync(lockFile);
  let db,monitor;
  try {
    chmodSync(lockFile,0o600);
    lock.exec('BEGIN EXCLUSIVE');
    const file = join(directory,'feishu-workflow.sqlite');
    db = new DatabaseSync(file);
    chmodSync(file,0o600);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
    const transaction = fn => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    };
    const localAssistant = assistantEnv?.OSBORN_FEISHU_LOCAL_ASSISTANT === 'true';
    let recaps, assistantOptions = {};
    let config = () => readFeishuBindings(directory);
    if (localAssistant) {
      if (assistantEnv.REPLAY_PUBLIC_URL) throw Error('本机群务功能需要本机 Demo。');
      const port = Number(assistantEnv.REPLAY_PORT || 4317);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) throw Error('本机 Demo 端口无效。');
      const demoDirectory = resolve(assistantEnv.REPLAY_DATA_DIR || defaultDemoDirectory);
      config = () => loadConnectorBindings(directory,demoDirectory);
      recaps = openDemoRecaps(db,transaction,{directory:demoDirectory,config,port});
      assistantOptions = {classifyAssistantCommand,provisionAnalyst:createMemberService(config,port),
        registerDemoOnly:payload => localRegister(payload,port),trackDemoRecap:recaps.track};
    }
    if (options.syncFormal && assistantEnv?.OSBORN_FEISHU_AUTO_OPTIMIZE === 'true') {
      const file = assistantEnv.FEISHU_OPTIMIZATION_MONITOR_DB || join(directory,'optimization-monitor.sqlite');
      const redactNames = (assistantEnv.FEISHU_OPTIMIZATION_REDACT_NAMES || '').split(/[,，\n]/).map(name => name.trim());
      monitor = openFrictionMonitor(resolve(file),{redactNames});
    }
    const workflow = openFeishuWorkflow(db,transaction,{searchSecurity:lookupFeishuListings,
      ...options,...assistantOptions,config,monitor,
      queryFormal:options.queryFormal && createGroupScopedReader(options.queryFormal,config)});
    const closeDatabases = () => { monitor?.close(); db.close(); lock.close(); };
    return {...workflow,tickRecaps:() => recaps?.tick(),close() {
      if (recaps) return recaps.close().finally(closeDatabases);
      closeDatabases();
    }};
  } catch (error) {
    monitor?.close();
    db?.close();
    lock.close();
    throw error;
  }
}
