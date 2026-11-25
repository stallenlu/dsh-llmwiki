/**
 * Optional LLM generation for the two-step ingest (analysis -> generation).
 * OpenAI-compatible chat completions. Credentials are resolved from the host
 * credential service when available, else from an env var — never from chat,
 * never printed. This whole module is optional: without config, ingest still
 * produces a deterministic draft.
 */
export function configFromEnv() {
  const baseUrl = process.env.LLM_WIKI_LLM_BASE_URL || '';
  const model = process.env.LLM_WIKI_LLM_MODEL || '';
  return baseUrl && model ? { baseUrl, model, hasKey: !!process.env.LLM_WIKI_API_KEY } : null;
}

export function makeLlm(cfg, resolveCredential) {
  if (!cfg || !cfg.baseUrl || !cfg.model) return null;
  const baseUrl = String(cfg.baseUrl).replace(/\/+$/, '');
  const url = /\/v1$/.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  return {
    async generate(analysis, title, schema) {
      const key = resolveCredential ? await resolveCredential() : (process.env.LLM_WIKI_API_KEY || '');
      const headers = { 'content-type': 'application/json' };
      if (key) headers.authorization = `Bearer ${key}`;
      const system = `You maintain a personal knowledge wiki. Write one markdown page that integrates a new source into an existing wiki.
Follow the schema when relevant. Use [[wikilinks]] for references. Start the body with prose (no frontmatter).
Do not invent facts beyond the source. Be concise but complete.\n\nSCHEMA:\n${schema || ''}`;
      const user = `Title: ${title}\n\nAnalysis:\n${JSON.stringify(analysis, null, 2)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.3 }) });
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;
      if (!text) throw new Error('LLM returned no content');
      return { body: String(text).replace(/^---[\s\S]*?---\s*/, ''), model: cfg.model };
    },
  };
}
