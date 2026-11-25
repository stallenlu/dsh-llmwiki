/**
 * Verify the Agent-TOOL path of fusedQuery (ctx present), which the HTTP route
 * cannot exercise. We import the REAL index.js, call apply() with a mock ctx
 * whose `tools` service mimics dsh-mnemon's contract, then drive execute().
 *
 * HONEST SCOPE: this verifies the code path with a faithful mock of the host
 * tools service. It is NOT a real agent dispatch (this session's function
 * schema does not expose llm_wiki directly). The HTTP path was verified live.
 */
const fs = await import('node:fs');
const path = await import('node:path');
const os = await import('node:os');

process.env.LLM_WIKI_HOME = path.join(os.tmpdir(), 'llw-fusion-' + Date.now());

const E = await import('./lib/engine.js');
const mod = await import('./index.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

// Build a vault with a page whose path we can reference from a fake recall hit.
const v = E.createVault('FusionPath', 'verify tool-path fusion');
await E.ingest(v.id, { title: 'Attention', text: 'Self-attention lets every token attend to all tokens in the sequence. Transformers use it.' });
const pages = E.listPages(v.id);
const target = pages[0];

// Fake mnemon_recall tool result: a line carrying a （来源: path） marker that
// resolves to our wiki page, plus an unrelated line with no path.
const fakeRecallText =
  `Self-attention is the core of transformers （来源: ${target.rel}）\n` +
  `A general memory fact with no wiki path.`;

let executeCalled = 0, recalledWith = null;
// Mock host tools service following the dual-form contract in fusion.js:50-71.
const toolsService = {
  get(name) { return name === 'mnemon_recall' ? { name } : null; },
  setExecutor() { return true; }, // forces the batch tools.execute form
  async execute(input) {
    executeCalled++;
    const call = input?.calls?.[0];
    if (call && call.name === 'mnemon_recall') {
      recalledWith = JSON.parse(call.arguments);
      return { results: [{ result: fakeRecallText }] };
    }
    return { results: [] };
  },
};

const sections = [];
const mockCtx = {
  get(key) { return key === 'tools' ? toolsService : null; },
  effect(fn) { try { fn(); } catch {} return () => {}; },
  on() { return () => {}; },
  systemPrompt: { section(s) { sections.push(s); return () => {}; } },
  webServer: { register() { return () => {}; } },
  tools: { register(d) { mockCtx._tool = d; return () => {}; } },
};

console.log('=== fusedQuery Agent-TOOL path (mock host tools service) ===\n');

mod.apply(mockCtx);
ok('apply registered the llm_wiki tool', mockCtx._tool && mockCtx._tool.name === 'llm_wiki');
ok('apply registered compass systemPrompt section', sections.some(s => s.name === 'llmwiki-compass'));

const tool = mockCtx._tool;
const out = await tool.execute({ action: 'fusedQuery', vault: v.id, question: 'self-attention transformer' });

ok('execute() invoked tools.execute (mnemon reached)', executeCalled >= 1, `calls=${executeCalled}`);
ok('mnemon_recall called with query+limit+mode', recalledWith && recalledWith.query === 'self-attention transformer' && recalledWith.mode === 'smart' && recalledWith.limit > 0, `args=${JSON.stringify(recalledWith)}`);
ok('returned text mentions 融合检索 (fusion used)', typeof out === 'string' && /融合检索/.test(out), out?.slice(0, 90));

// Parse the [result] appendix to inspect fusion metadata.
const m = /\[result\]\s*(\{[\s\S]*\})/.exec(out || '');
let data = null;
try { data = m ? JSON.parse(m[1]) : null; } catch {}
ok('fusion.used === true on tool path', data?.fusion?.used === true, `fusion=${JSON.stringify(data?.fusion)}`);
ok('fusion.strategy === rrf+rerank', data?.fusion?.strategy === 'rrf+rerank');
ok('mnemon evidence parsed (mnemonItems>0)', data?.fusion?.mnemonItems > 0, `items=${data?.fusion?.mnemonItems}`);
ok('hits present after fusion', Array.isArray(data?.hits) && data.hits.length > 0, `hits=${data?.hits?.length}`);

// Now prove graceful degradation when tools service is missing.
const out2 = await tool.execute({ action: 'fusedQuery', vault: v.id, question: 'self-attention', useMnemon: false });
ok('useMnemon:false degrades to lexical-only', /仅词法检索/.test(out2), out2?.slice(0, 90));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
