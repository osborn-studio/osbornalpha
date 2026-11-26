export async function localRegister({role, fields}, port) {
  const base = 'http://127.0.0.1:' + port;
  const request = async (path, body, token) => {
    const headers = {origin: base, 'content-type': 'application/json'};
    if (token) headers.authorization = 'Bearer ' + token;
    if (path === '/api/registrations') headers['x-demo-registration-source'] = 'feishu-app';
    const r = await fetch(base + path, {method:'POST', headers, body:JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(40000)});
    if (!r.ok) throw Object.assign(Error('Demo 接口返回 HTTP ' + r.status), {status:r.status, retriable:r.status >= 500 || r.status === 429});
    return r.json();
  };
  const session = await request('/api/demo/role', {role});
  if (!session.key) throw Error('未取得 Demo 身份');
  const {entry} = await request('/api/registrations', fields, session.key);
  if (!entry?.id) throw Error('未取得登记回执');
  // The receipt is authoritative even if the optional aggregate cannot be read.
  try {
    const state = await fetch(base + '/api/state', {
      headers:{authorization:'Bearer ' + session.key}, redirect:'error', signal:AbortSignal.timeout(4000),
    });
    if (state.ok) {
      const {registrations} = await state.json();
      const analystStats = registrations?.results?.find(row => row.role === role);
      if (analystStats) return {...entry, analystStats};
    }
  } catch { /* A later refresh can supply the aggregate. */ }
  return entry;
}
