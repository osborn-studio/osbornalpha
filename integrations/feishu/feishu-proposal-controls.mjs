import { evaluateProposal } from './feishu-workflow-command.mjs';

const stateNames = {
  awaiting_approval:'等待 PM 确认', pending:'等待处理', not_requested:'未请求', awaiting_account:'尚未绑定',
  pending_formal_sync:'等待正式回执', registered:'已登记', uncertain:'回执待核实', blocked:'已暂停',
  failed:'失败', withdrawn:'已撤回', sent:'已送达', superseded:'已替换', demo_only:'仅开通 Demo',
};

export function proposalStatus(proposal, notifications, approverLabel) {
  const label = state => stateNames[state] ?? '尚无记录';
  const status = (value,id) => [label(value),id].filter(Boolean).join(' · ');
  const body = JSON.parse(proposal.body);
  const lines = [
    `提案 ${proposal.id} · 第 ${proposal.revision} 版 · ${body.recommendation.ticker}`,
    '审批：' + (proposal.approval ? '已确认 · ' + approverLabel : label(proposal.demo_status === 'withdrawn' ? 'withdrawn' : 'awaiting_approval')),
    'Demo 建议：' + status(proposal.demo_status,proposal.demo_id),
    '正式建议：' + status(proposal.formal_status,proposal.formal_id),
    '正式模拟成交：' + status(proposal.simulation_status,proposal.trade_id),
  ];
  for (const [name,kind] of [['提案摘要','summary'],['Demo 结果通知','result'],['正式结果通知','formal_result']]) {
    const message = notifications.find(m => m.kind === kind);
    if (message) lines.push(name + '：' + label(message.status));
  }
  return lines.join('\n');
}

const editFields = {
  数量:'quantity',股数:'quantity',模拟成交股数:'quantity',模拟成交价:'price',成交价:'price',
  目标价:'target_price',止损价:'stop_loss',参考价:'reference_price',手续费:'fee',信心:'confidence',
  理由:'rationale',关联研究:'thesis_ref',期限:'horizon',动作:'action',
};

function reject(message) {
  throw Object.assign(new Error(message),{status:400});
}

export function reviseProposal(proposal,text,name,receivedAt) {
  // Reconstruct each replacement only from the actor's exact text. Reuse the same domain
  // parser as submissions to check numeric limits, execution direction, currency and dates.
  const instruction = text.normalize('NFKC').trim().replace(/[。！!]$/,'')
    .replace(/^(?:请)?(?:把|将|修改提案[：:\s]*|修改\s*)/,'').trim();
  const match = /^(模拟成交股数|模拟成交价|成交价|数量|股数|目标价|止损价|参考价|手续费|信心|理由|关联研究|期限|动作)?\s*(?:从\s*([\d.]+)\s*股?\s*)?(?:改成|改为|改到|调整为|修改为|调整到|换成|设为|[:：])\s*(.+)$/.exec(instruction) ??
    /^(?:(数量|股数)\s*)?([\d.]+)\s*股\s*(?:改成|改为|改到|调整为|调整到|换成)\s*(.+)$/.exec(instruction);
  if (!match) reject('请直接回复当前摘要并写明一个修改，例如「数量改成 200 股」或「目标价改成 480 港元」。');
  const label = match[1] ?? '股数';
  const key = editFields[label];
  const value = match[3].trim();
  if (!match[1] && !match[2]) reject('请写明要修改的字段。');
  if (/[｜|\n]/.test(value)) reject('请一次修改一个字段。');
  const previous = JSON.parse(proposal.body);
  const {direction,...fill} = previous.simulation ?? {};
  const prior = {...previous.recommendation,...fill};
  if (match[2] !== undefined && Number(match[2]) !== prior[key]) reject('原值与当前摘要不一致，请核对后重试。');
  if (previous.defaultConfidence) delete prior.confidence;
  const parsed = evaluateProposal(proposal.role,name,'建议｜'+label.replace('模拟成交股数','股数')+'：'+value,receivedAt,[],prior);
  if (!parsed.body) reject('修改后仍缺少' + parsed.missing.join('、') + '。请撤回后提交完整建议。');
  const nextValue = parsed.body.recommendation[key] ?? parsed.body.simulation?.[key];
  const oldValue = previous.recommendation[key] ?? previous.simulation?.[key];
  if (nextValue === undefined || oldValue === nextValue) reject('该字段没有变更，请核对修改值。');
  return {body:parsed.body,change:`${label}：${oldValue ?? '未填'} → ${nextValue}`};
}
