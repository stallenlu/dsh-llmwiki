/**
 * Optional bridge to a running nashsu/llm_wiki desktop app.
 * The upstream app exposes a local HTTP API at http://127.0.0.1:19828/api/v1
 * when its API is enabled. This module is strictly additive: when no app is
 * running, every native engine action still works (see engine.js).
 */
const BASE = process.env.LLM_WIKI_DESKTOP_URL || 'http://127.0.0.1:19828';

export async function status(timeoutMs = 900) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/v1/status`, { signal: controller.signal });
    if (!res.ok) return { available: false, base: BASE, detail: `HTTP ${res.status}` };
    let body = {}; try { body = await res.json(); } catch { body = { raw: (await res.text()).slice(0, 200) }; }
    return { available: true, base: BASE, version: body.version || body.data?.version || null, detail: 'desktop app reachable' };
  } catch (e) {
    return { available: false, base: BASE, detail: String(e.name === 'AbortError' ? 'timeout' : e.message || e) };
  } finally { clearTimeout(t); }
}

export async function call(method, endpoint, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/v1${endpoint}`, {
      method, signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 2000) }; }
    if (!res.ok) throw new Error(`desktop API ${method} ${endpoint} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    return data;
  } finally { clearTimeout(t); }
}

/** Human-readable summary of the desktop app's projects, or a clear "not available" message. */
export async function projects() {
  const s = await status();
  if (!s.available) return { available: false, message: `No desktop LLM Wiki app is reachable at ${BASE}. Native vaults work without it. To connect: launch the desktop app and enable its local API.`, projects: [] };
  try {
    const data = await call('GET', '/projects');
    const list = Array.isArray(data) ? data : (data.projects || data.data || []);
    return { available: true, base: BASE, message: `Connected to the desktop app. ${list.length} project(s) available.`, projects: list };
  } catch (e) { return { available: true, base: BASE, message: `App reachable but /projects failed: ${e.message}`, projects: [] }; }
}

export async function proxy(action, params) {
  const routes = {
    status: () => status(),
    projects: () => projects(),
    files: () => call('GET', '/files', undefined),
    search: () => call('POST', '/search', params),
    chat: () => call('POST', '/chat', params),
    graph: () => call('GET', '/graph'),
    reviews: () => call('GET', '/reviews'),
    write_page: () => call('POST', '/write_page', params),
    rescan: () => call('POST', '/rescan_sources', params),
  };
  if (!routes[action]) throw new Error(`unsupported bridge action: ${action}`);
  return routes[action]();
}
