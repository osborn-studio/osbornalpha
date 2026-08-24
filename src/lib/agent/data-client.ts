export async function callApi(origin: string, path: string, init?: RequestInit): Promise<any> {
  try {
    const res = await fetch(`${origin}${path}`, {
      cache: 'no-store',
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
    if (!res.ok) return { available: false, status: res.status, note: '暂无数据' };
    return await res.json();
  } catch (e) {
    return { available: false, note: '请求失败', error: String(e) };
  }
}
