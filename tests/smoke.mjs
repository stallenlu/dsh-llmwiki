// End-to-end smoke test for the dsh-llmwiki bundle.
// Runs apply() with a mock Cordis context, then drives the registered tool.
import os from 'node:os';
import path from 'node:path';
process.env.LLM_WIKI_HOME = path.join(os.tmpdir(), 'llmwiki-bundle-smoke-' + Date.now());

const { apply } = await import('./index.js');

let registeredTool = null, registeredRoute = null;
const ctx = {
  effect(fn) { try { fn(); } catch (e) { console.error('effect failed:', e); throw e; } return () => {}; },
  tools: { register(t) { registeredTool = t; return () => {}; } },
  webServer: { register(r) { registeredRoute = r; return () => {}; } },
};
apply(ctx);

const assert = (cond, label) => {
  if (!cond) throw new Error('ASSERT FAILED: ' + label);
  console.log('  ok -', label);
};

assert(registeredTool && registeredTool.name === 'llm_wiki', 'llm_wiki tool registered');
assert(registeredRoute && registeredRoute.path === '/api/llm-wiki/', 'web route registered');
assert(Array.isArray(registeredTool.parameters.properties.action.enum), 'action enum present');

const call = (args) => registeredTool.execute(args);
let out;

console.log('Driving tool actions:');
out = await call({ action: 'vaults' });
assert(out.includes('No wikis yet') || out.includes('wiki'), 'vaults (empty)');

out = await call({ action: 'createVault', name: 'Bundle Test', purpose: 'Verify the tool path.' });
assert(out.includes('Created the wiki'), 'createVault');

out = await call({ action: 'vaults' });
assert(out.includes('Bundle Test'), 'vaults lists created wiki');
const id = 'Bundle-Test';

out = await call({ action: 'ingest', vault: id, title: 'Graph paper', origin: 'https://example.org/g', text: 'Graph neural networks propagate information across linked nodes. Graph attention weights neighbors differently. This graph paper explains message passing.' });
assert(out.includes('Added') && out.includes('key phrases'), 'ingest');
assert(!out.includes('already added'), 'ingest not a duplicate');

out = await call({ action: 'ingest', vault: id, title: 'Graph paper', text: 'Graph neural networks propagate information across linked nodes. Graph attention weights neighbors differently. This graph paper explains message passing.' });
assert(out.includes('already added'), 'ingest dedupe');

out = await call({ action: 'pages', vault: id });
assert(out.includes('page'), 'pages');

out = await call({ action: 'writePage', vault: id, path: 'concepts/Attention', content: '# Attention\n\n[[Graph paper]] uses attention over graph neighbors.' });
assert(out.includes('Attention') || out.includes('Created'), 'writePage');

out = await call({ action: 'graph', vault: id });
assert(out.includes('pages connected') && out.includes('cluster'), 'graph');

out = await call({ action: 'query', vault: id, question: 'How do graph neural networks work?' });
assert(out.includes('relevant page') || out.includes('No pages matched'), 'query');

out = await call({ action: 'review', vault: id });
assert(out.includes('checked'), 'review');

out = await call({ action: 'chat', vault: id, message: 'Summarize attention.' });
assert(out.includes('answer pack') || out.includes('cited'), 'chat');

out = await call({ action: 'overview', vault: id });
assert(out.includes('page'), 'overview/reindex');

out = await call({ action: 'bridgeStatus' });
assert(out.includes('desktop') && (out.includes('connected') || out.includes('running') || out.includes('No desktop')), 'bridgeStatus');

console.log('\nALL BUNDLE SMOKE CHECKS PASSED');
