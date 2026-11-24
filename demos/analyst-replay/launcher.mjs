function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function renderLauncher(base, keys, names) {
  const shared = new URL(base).protocol === 'https:';
  const roles = Object.keys(names);
  const cards = roles.map(role => {
    const isPm = role === 'PM';
    const name = escapeHtml(names[role]);
    const avatar = escapeHtml(['A','B','PM'].includes(role) ? role : Array.from(names[role])[0]);
    const href = new URL('/', base);
    href.hash = shared ? 'key=' + encodeURIComponent(keys[role]) : 'role=' + encodeURIComponent(role);
    return `<div class="role"><a class="role-card" target="_blank" rel="noopener noreferrer"
      href="${escapeHtml(href.href)}" aria-label="${name}，在新标签页打开">
      <div class="role-head"><span class="avatar" aria-hidden="true">${avatar}</span><h2>${name}</h2></div>
      <p>${isPm ? '验收各组建议的行情与评分，按账户核对成交流水与持仓。' : '登记建议并查看评分，也可按成交回报记录买卖、费用和持仓。'}</p>
      <span class="role-action">${isPm ? '进入验收台' : '进入分析台'}<span aria-hidden="true">↗</span></span>
    </a>${shared ? `<button class="copy" type="button" aria-label="复制${name}的邀请链接">复制邀请链接</button>` : ''}</div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="dark">
  <title>${shared ? '共享场次邀请' : '本地角色入口'} · Osborn Alpha</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0a0b; --surface: #141417; --card: #1c1c20; --border: #323238;
      --text: #fafafa; --dim: #a1a1aa; --muted: #8b8b94; --brass: #ca8a04;
      font-family: Geist, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text); background: var(--bg);
    }
    * { box-sizing: border-box; }
    body, h1, h2, p { margin: 0; }
    header { background: var(--surface); border-block-end: 1px solid var(--border); }
    .bar, main { width: min(calc(100% - 48px), 1000px); margin: 0 auto; }
    .bar { display: flex; align-items: center; gap: 16px; min-height: 48px; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: -.04em; }
    .brand span, .role-action { color: var(--brass); }
    .module { border-inline-start: 1px solid var(--border); padding-inline-start: 16px; font-size: 13px; color: var(--dim); }
    main { padding: clamp(44px, 10vh, 104px) 0 36px; }
    h1 { font-size: clamp(26px, 4vw, 34px); font-weight: 600; letter-spacing: -.04em; }
    .intro { margin-top: 10px; color: var(--dim); line-height: 1.7; font-size: 14px; }
    .roles { margin-top: 28px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .role { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .role-card {
      flex: 1; display: flex; flex-direction: column; padding: 21px; border-radius: 8px; color: inherit;
      background: var(--surface); border: 1px solid var(--border); text-decoration: none;
    }
    .role-card:hover { background: var(--card); border-color: var(--brass); }
    .role-card:focus-visible { outline: 2px solid var(--brass); outline-offset: 3px; }
    .role-head { display: flex; align-items: center; gap: 10px; }
    .avatar {
      display: grid; place-items: center; width: 34px; height: 34px; border-radius: 6px; flex: 0 0 34px;
      background: #292214; color: #e9b75a; font: 600 14px/1 ui-monospace, monospace;
    }
    h2 { font-size: 17px; font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
    .role-card p { margin: 17px 0 22px; line-height: 1.7; font-size: 14px; color: var(--dim); }
    .role-action {
      display: flex; justify-content: space-between; align-items: center; margin-top: auto;
      padding-top: 13px; border-top: 1px solid var(--border); font-size: 13px; font-weight: 600;
    }
    .role-action span { font-size: 17px; }
    .copy {
      align-self: flex-start; border: 1px solid var(--border); border-radius: 6px;
      padding: 7px 11px; font: inherit; font-size: 12px; color: var(--text); background: var(--surface); cursor: pointer;
    }
    .copy:hover { border-color: var(--brass); }
    .copy:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
    #invite-link {
      margin-top: 8px; width: min(100%, 620px); padding: 8px; border: 1px solid var(--border);
      border-radius: 6px; background: var(--surface); color: var(--text); font: 12px monospace;
    }
    #copy-status { color: var(--brass); }
    #copy-status:not(:empty) { margin-top: 8px; }
    footer { margin-top: 16px; color: var(--muted); font-size: 12px; line-height: 1.7; }
    @media (max-width: 720px) {
      .roles { grid-template-columns: 1fr; margin-top: 22px; }
      .bar, main { width: calc(100% - 32px); }
      main { padding-top: 34px; }
      .role-card { padding: 16px; }
      .role-card p { margin: 12px 0 14px; }
    }
  </style>
</head>
<body>
  <header><div class="bar"><span class="brand">osborn<span>alpha</span></span><span class="module">分析师评分</span></div></header>
  <main>
    <h1>${shared ? '共享场次邀请' : '选择演示角色'}</h1>
    <p class="intro">各位分析师分别登记建议，即可查看自己的历史回放结果。本组分析师均登记后，PM 可核对成绩。</p>
    <nav class="roles" aria-label="角色入口">${cards}</nav>
    <footer>
      ${shared ? '点击「复制邀请链接」，分别私发给对应成员。' : '点击身份卡片即可进入工作台。'}
      <p id="copy-status" role="status" aria-live="polite"></p>
      ${shared ? '<input id="invite-link" type="text" aria-label="对应角色的邀请链接" readonly hidden>' : ''}
    </footer>
  </main>
  ${shared ? `<script>
    document.querySelectorAll('.copy').forEach(button => {
      button.addEventListener('click', async () => {
        const url = button.previousElementSibling.href;
        const status = document.getElementById('copy-status');
        const field = document.getElementById('invite-link');
        field.hidden = true;
        try {
          await navigator.clipboard.writeText(url);
          status.textContent = '已复制对应角色的邀请链接。';
        } catch {
          field.value = url;
          field.hidden = false;
          field.select();
          status.textContent = '已选中对应角色的邀请链接，按复制快捷键即可。';
        }
      });
    });
  </script>` : ''}
</body>
</html>`;
}
