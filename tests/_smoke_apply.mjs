/** Validate the new apply() registers everything without throwing, using a mock ctx. */
import { apply, inject } from './index.js';

const effects = [];
const registered = { tools: null, routes: null, sections: [], events: [] };
const ctx = {
  get(name) { return name === 'tools' ? { get: () => null, execute: async () => ({}), setExecutor: () => {} } : null; },
  effect(fn, label) { effects.push(label); const r = fn(); if (typeof r === 'function') { /* cleanup registered, not called */ } return r; },
  on(event, fn) { registered.events.push({ event, fn }); return () => {}; },
  systemPrompt: { section(s) { registered.sections.push(s); return () => {}; } },
  webServer: { register(r) { registered.routes = r; return () => {}; } },
  tools: { register(t) { registered.tools = t; return () => {}; } },
};

const ok = (c, l) => { if (!c) throw new Error('FAILED: ' + l); console.log('  ok:', l); };

try {
  ok(includes('systemPrompt'), 'inject includes systemPrompt');
  ok(includes('tools') && includes('webServer'), 'inject keeps tools + webServer');
  apply(ctx);
  ok(registered.tools && registered.tools.name === 'llm_wiki', 'tool registered');
  const actions = registered.tools.parameters.properties.action.enum;
  for (const a of ['rate', 'setAging', 'staleReview', 'hygiene', 'compileHint', 'profileDigest', 'maintenancePlan', 'fusedQuery', 'compass']) ok(actions.includes(a), `action enum has ${a}`);
  ok(registered.routes && registered.routes.path === '/api/llm-wiki/', 'route registered');
  ok(registered.sections.length === 1 && registered.sections[0].name === 'llmwiki-compass', 'compass section registered');
  ok(typeof registered.sections[0].text === 'function' && registered.sections[0].text().length <= 1400, 'compass text bounded');
  ok(registered.events.length === 1 && registered.events[0].event === 'session/disposed', 'session event registered');
  // exercise the tool execute for a harmless action
  const r = await registered.tools.execute({ action: 'compass' });
  ok(typeof r === 'string' && r.includes('LLM Wiki'), 'execute(compass) returns human text');
  console.log('[apply-smoke] ALL PASSED');
} catch (e) {
  console.error('[apply-smoke] FAILED:', e.message);
  process.exit(1);
}

function includes(x) { return inject.includes(x); }
