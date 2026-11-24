export function createAnalystAdmin({api, reload, onAuthExpired, onLocalProfileCreated}) {
  const section = document.getElementById('analyst-admin');
  const form = document.getElementById('analyst-profile-form');
  const list = document.getElementById('analyst-invite-list');
  const inviteField = document.getElementById('analyst-invite-url');
  const feedback = document.getElementById('analyst-admin-feedback');
  const invitesButton = section.querySelector('[data-cmd="analyst-invites"]');
  const createButton = form.querySelector('button[type="submit"]');
  const invites = new Map();
  let pm = false;
  let localPicker = false;
  let busy = false;
  let scope = 0;

  function report(message, error = false) {
    feedback.textContent = message;
    feedback.toggleAttribute('data-error', error);
  }

  function clearInviteField() {
    inviteField.value = '';
    inviteField.hidden = true;
  }

  function renderInvites() {
    const rows = [...invites.values()].map(({profile}) => {
      const row = document.createElement('li');
      row.className = 'analyst-invite';
      row.dataset.analystId = profile.id;
      const name = document.createElement('strong');
      name.textContent = profile.display_name;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn';
      copy.dataset.copyInvite = profile.id;
      copy.textContent = '复制邀请链接';
      copy.setAttribute('aria-label', '复制' + profile.display_name + '的邀请链接');
      row.append(name, copy);
      return row;
    });
    list.replaceChildren(...rows);
    list.hidden = rows.length === 0;
  }

  async function run(action) {
    if (!pm || busy) return;
    busy = true;
    const operationScope = scope;
    invitesButton.disabled = true;
    createButton.disabled = true;
    report('');
    clearInviteField();
    try {
      await action(() => pm && scope === operationScope);
    } catch (error) {
      if (scope !== operationScope) return;
      if (error.status === 401) onAuthExpired('会话失效，请重新进入。');
      else report(error.message || '暂时无法管理分析师，请重试。', true);
    } finally {
      if (scope === operationScope) {
        busy = false;
        invitesButton.disabled = false;
        createButton.disabled = false;
      }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const display_name = form.elements.display_name.value.trim();
    if (!display_name) {
      report('请填写分析师的显示名称。', true);
      return;
    }
    void run(async current => {
      const makeSelectable = localPicker;
      const note = form.elements.note.value.trim();
      const result = await api('/api/analysts', {display_name, kind:form.elements.kind.value, note});
      if (makeSelectable) onLocalProfileCreated(result.profile);
      if (!current()) return;
      if (!makeSelectable) {
        invites.set(result.profile.id, result);
        renderInvites();
      }
      form.reset();
      await reload();
      if (current()) report('已创建 ' + result.profile.display_name + (makeSelectable
        ? '。点击「切换身份」即可选择该分析师。' : '。请复制邀请链接并单独发给该分析师。'));
    });
  });

  invitesButton.addEventListener('click', () => {
    if (localPicker) return;
    void run(async current => {
      const result = await api('/api/analysts/invites');
      if (!current()) return;
      invites.clear();
      for (const invite of result.invites) invites.set(invite.profile.id, invite);
      renderInvites();
    });
  });

  list.addEventListener('click', async event => {
    const id = event.target.closest('[data-copy-invite]')?.dataset.copyInvite;
    const invite = pm && invites.get(id);
    if (busy || !invite) return;
    const operationScope = scope;
    clearInviteField();
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      if (scope === operationScope) report('已复制 ' + invite.profile.display_name + ' 的邀请链接。');
    } catch {
      if (scope !== operationScope) return;
      inviteField.value = invite.inviteUrl;
      inviteField.hidden = false;
      inviteField.select();
      report('已选中 ' + invite.profile.display_name + ' 的邀请链接。按复制快捷键即可复制。');
    }
  });

  function clear() {
    scope++;
    pm = false;
    localPicker = false;
    busy = false;
    invites.clear();
    form.reset();
    invitesButton.disabled = false;
    createButton.disabled = false;
    renderInvites();
    clearInviteField();
    report('');
    section.hidden = true;
  }

  return {
    show(role, isLocal) {
      pm = role === 'PM';
      localPicker = isLocal;
      section.hidden = !pm;
      invitesButton.hidden = localPicker;
    },
    clear,
  };
}
