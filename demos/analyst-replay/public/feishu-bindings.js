const pairStatus = {pending:'待处理', paired:'已收到', ignored:'已跳过'};
const replyStatus = {pending:'回复待投递', sent:'机器人已回复', blocked:'回复已暂停', failed:'回复投递失败', uncertain:'回复待核实'};
const formatTime = new Intl.DateTimeFormat('zh-CN', {
  dateStyle:'short', timeStyle:'short', timeZone:'Asia/Shanghai',
});

function options(select, entries, placeholder) {
  const current = select.value;
  select.replaceChildren(new Option(placeholder, ''), ...entries.map(([value, label]) => new Option(label, value)));
  if (entries.some(([value]) => value === current)) select.value = current;
}

function analystLabel(item) {
  const signatures = [...new Set([item.signature, ...(item.aliases ?? [])])];
  return signatures.length === 1 && signatures[0] === item.display_name ? item.display_name :
    item.display_name + '（可署名 ' + signatures.join('、') + '）';
}

function memberRow(label, status) {
  const row = document.createElement('li');
  const member = document.createElement('strong');
  member.textContent = label;
  const detail = document.createElement('span');
  detail.className = 'sub';
  detail.textContent = status;
  row.append(member, detail);
  return row;
}

export function createFeishuBindings({api, onAuthExpired}) {
  const panel = document.getElementById('feishu-bindings');
  const form = document.getElementById('feishu-binding-form');
  const refresh = document.getElementById('feishu-binding-refresh');
  const feedback = document.getElementById('feishu-binding-feedback');
  const list = document.getElementById('feishu-binding-members');
  const status = document.getElementById('feishu-binding-status');
  const {chatId, senderId, assignment} = form.elements;
  const submit = form.querySelector('[type="submit"]');
  let snapshot = null;
  let allowed = false;
  let active = false;
  let pending = false;
  let generation = 0;

  function report(text = '', isError = false) {
    feedback.textContent = text;
    feedback.toggleAttribute('data-error', isError);
  }

  function selectedPair() {
    return snapshot?.pairings.find(pair => pair.chatId === chatId.value && pair.senderId === senderId.value);
  }

  function updateControls() {
    chatId.disabled = pending || !snapshot || Boolean(snapshot.chatId) || chatId.options.length <= 1;
    senderId.disabled = pending || !chatId.value || senderId.options.length <= 1;
    const pair = selectedPair();
    assignment.disabled = pending || !pair || Boolean(pair.analyst || pair.approver);
    submit.disabled = assignment.disabled || !assignment.value;
    refresh.disabled = pending;
  }

  function senderLabel(pair) {
    const analyst = snapshot.analysts.find(item => item.id === pair.analyst);
    return [pair.pairingReference ? '配对编号 ' + pair.pairingReference : null, pair.senderId, analyst ? analystLabel(analyst) : pair.analyst,
      pair.approver ? '审批人' : null].filter(Boolean).join(' · ');
  }

  function renderMembers() {
    const pairs = snapshot?.pairings.filter(pair => pair.chatId === chatId.value) ?? [];
    options(senderId, pairs.map(pair => [pair.senderId, senderLabel(pair)]), '选择已收到的成员');
    options(assignment, [['approver', '审批人'], ...(snapshot?.analysts ?? [])
      .filter(item => !item.assigned)
      .map(item => [item.id, analystLabel(item)])], '选择要配对的身份');
    const rows = pairs.map(pair => memberRow(senderLabel(pair), [
      pairStatus[pair.status], replyStatus[pair.replyStatus],
      Number.isFinite(Date.parse(pair.receivedAt)) ? formatTime.format(new Date(pair.receivedAt)) + ' 北京时间' : null,
    ].filter(Boolean).join(' · ')));
    if (snapshot?.chatId && snapshot.chatId === chatId.value) {
      const received = new Set(pairs.map(pair => pair.analyst));
      for (const analyst of snapshot.analysts) {
        if (analyst.assigned && !received.has(analyst.id)) {
          rows.push(memberRow(analystLabel(analyst), '已绑定，当前收件列表中无配对消息'));
        }
      }
    }
    list.replaceChildren(...rows);
    list.hidden = !rows.length;
    updateControls();
  }

  function render() {
    const groups = snapshot?.chatId ? [snapshot.chatId] : [...new Set(snapshot?.pairings.map(pair => pair.chatId) ?? [])];
    options(chatId, groups.map(group => [group, group]), '选择收到配对消息的群');
    if (snapshot?.chatId) chatId.value = snapshot.chatId;
    status.textContent = snapshot?.chatId ? '已设定目标群。' : groups.length ? `已收到 ${groups.length} 个群的配对消息。` :
      '还没有收到配对消息。';
    renderMembers();
  }

  async function request(payload) {
    if (!allowed || pending) return;
    const current = generation;
    pending = true;
    report(payload ? '正在保存配对…' : '正在读取收件记录…');
    updateControls();
    try {
      const next = await api('/api/feishu/bindings', payload, {signal:AbortSignal.timeout(6000)});
      if (current !== generation) return;
      snapshot = next;
      render();
      report(payload ? '已保存配对。' : '');
    } catch (error) {
      if (current !== generation) return;
      if (error.status === 401) onAuthExpired('会话失效，请重新进入。');
      else report(error.message || '暂时无法读取飞书配对，请重试。', true);
    } finally {
      if (current === generation) {
        pending = false;
        updateControls();
      }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (submit.disabled) return;
    void request({chatId:chatId.value, senderId:senderId.value, assignment:assignment.value});
  });
  chatId.addEventListener('change', () => {
    senderId.value = '';
    assignment.value = '';
    report();
    renderMembers();
  });
  senderId.addEventListener('change', () => { assignment.value = ''; report(); updateControls(); });
  assignment.addEventListener('change', updateControls);
  refresh.addEventListener('click', () => void request());

  function clear() {
    generation++;
    allowed = active = pending = false;
    snapshot = null;
    panel.hidden = true;
    report();
    render();
  }

  function show(canManage, isActive) {
    if (!canManage) {
      if (allowed) clear();
      return;
    }
    allowed = true;
    panel.hidden = false;
    const entering = isActive && !active;
    active = isActive;
    if (entering) void request();
  }

  return {clear, show};
}
