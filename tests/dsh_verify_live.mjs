/**
 * Live end-to-end verification of the INSTALLED plugin over its real HTTP route.
 * Calls every action, checks response semantics, and asserts real filesystem state.
 * Uses a dedicated test vault; cleans up at the end.
 */
const BASE = 'http://127.0.0.1:27870/api/llm-wiki/';
const fs = await import('node:fs');
const path = await import('node:path');
const os = await import('node:os');

const HOME = process.env.USERPROFILE || os.homedir();
const VAULT_ROOT = path.join(HOME, '.dsh', 'llm-wiki', 'vaults');
const TEST_VAULT_NAME = 'Verify-Live-' + Date.now();
const TEST_ID = TEST_VAULT_NAME.replace(/[^A-Za-z0-9._-]+/g, '-');
const VAULT_DIR = path.join(VAULT_ROOT, TEST_ID);

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(`  PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; results.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

async function call(action, payload = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  let body;
  try { body = await res.json(); } catch { return { http: res.status, ok: false, error: 'non-JSON', _raw: await res.text() }; }
  return { http: res.status, ...body };
}

console.log('=== LIVE VERIFICATION of installed dsh-llmwiki over HTTP ===');
console.log('vault root:', VAULT_ROOT);
console.log('test vault id:', TEST_ID, '\n');

// 1. vaults (baseline)
{
  const r = await call('vaults');
  ok('vaults returns ok + array data', r.ok && Array.isArray(r.data), `http=${r.http} text="${r.text}"`);
}

// 2. createVault
{
  const r = await call('createVault', { name: TEST_VAULT_NAME, purpose: 'Verify every action works end to end.' });
  ok('createVault ok', r.ok, `text="${r.text}"`);
  ok('createVault returns id', !!r.data?.id, `id=${r.data?.id}`);
  ok('createVault wrote config.json to disk', fs.existsSync(path.join(VAULT_DIR, 'config.json')));
  for (const k of ['entities','concepts','sources','queries','synthesis','comparisons']) {
    ok(`createVault made wiki/${k}`, fs.existsSync(path.join(VAULT_DIR, 'wiki', k)));
  }
  ok('createVault made raw/sources', fs.existsSync(path.join(VAULT_DIR, 'raw', 'sources')));
  ok('createVault made .llm-wiki/chats', fs.existsSync(path.join(VAULT_DIR, '.llm-wiki', 'chats')));
}

// 3. ingest
const docText = 'Self-attention lets each token attend to all tokens. Transformer models use multi-head attention for translation and summarization. Attention is all you need was published in 2017 by Vaswani.';
{
  const r = await call('ingest', { vault: TEST_ID, text: docText, title: 'Attention Paper', origin: 'https://example.org/attention' });
  ok('ingest ok', r.ok, `text="${r.text}"`);
  ok('ingest returns page path', !!r.data?.page, `page=${r.data?.page}`);
  ok('ingest extract keyphrases', Array.isArray(r.data?.analysis?.keyphrases) && r.data.analysis.keyphrases.length > 0, `n=${r.data?.analysis?.keyphrases?.length}`);
  const src = path.join(VAULT_DIR, r.data?.source || '');
  ok('ingest wrote immutable raw source to disk', r.data?.source && fs.existsSync(src));
  const page = path.join(VAULT_DIR, 'wiki', r.data?.page || '');
  ok('ingest wrote wiki page to disk', r.data?.page && fs.existsSync(page));
}

// 4. ingest dedupe (same text)
{
  const r = await call('ingest', { vault: TEST_ID, text: docText, title: 'Attention Paper' });
  ok('ingest dedupe detects duplicate', r.ok && r.data?.duplicate === true, `duplicate=${r.data?.duplicate}`);
}

// 5. pages + H2 meta
let firstPage;
{
  const r = await call('pages', { vault: TEST_ID });
  ok('pages ok + non-empty', r.ok && Array.isArray(r.data) && r.data.length > 0, `n=${r.data?.length}`);
  firstPage = r.data?.[0];
  ok('H2: pages carry full meta', firstPage && firstPage.meta && typeof firstPage.meta === 'object');
  ok('H2: pages carry quality field', firstPage && firstPage.quality === 3, `quality=${firstPage?.quality}`);
  ok('H2: pages carry recall field', firstPage && firstPage.recall === true, `recall=${firstPage?.recall}`);
}

// 6. readPage
{
  const r = await call('readPage', { vault: TEST_ID, path: firstPage.rel });
  ok('readPage ok', r.ok && !!r.data?.body, `bodyLen=${r.data?.body?.length}`);
  ok('readPage returns links array', Array.isArray(r.data?.links));
  ok('readPage returns backlinks array', Array.isArray(r.data?.backlinks));
}

// 7. writePage (new page with sources + 2 wikilinks -> no hints)
{
  const content = '---\ntype: concept\ntitle: Softmax\nsources: [raw/sources/attention.md]\n---\nSoftmax converts logits to probabilities. See [[Attention Paper]] and [[Transformer]].';
  const r = await call('writePage', { vault: TEST_ID, path: 'concepts/Softmax.md', content });
  ok('writePage ok', r.ok, `text="${r.text}"`);
  ok('writePage wrote file to disk', fs.existsSync(path.join(VAULT_DIR, 'wiki', 'concepts', 'Softmax.md')));
  ok('writePage with sources+2 links yields no hints', r.data && Array.isArray(r.data.hints) && r.data.hints.length === 0, `hints=${JSON.stringify(r.data?.hints)}`);
}

// 8. writePage duplicate without allowOverwrite should fail
{
  const r = await call('writePage', { vault: TEST_ID, path: 'concepts/Softmax.md', content: '---\ntitle: Softmax\n---\nbody' });
  ok('writePage rejects overwrite without flag', !r.ok && /exists/.test(r.error || ''), `error="${r.error}"`);
}

// 9. writePage with allowOverwrite + missing sources/links -> hints
{
  const content = '---\ntitle: Softmax\n---\nA short page with no links.';
  const r = await call('writePage', { vault: TEST_ID, path: 'concepts/Softmax.md', content, allowOverwrite: true });
  ok('writePage allowOverwrite succeeds', r.ok);
  ok('writePage gives hints for missing sources/links', r.data?.hints?.length >= 2, `hints=${JSON.stringify(r.data?.hints)}`);
}

// 10. writePage invalid kind rejection
{
  const r = await call('writePage', { vault: TEST_ID, path: 'bogus/x.md', content: '---\ntitle: x\n---\nbody' });
  ok('writePage rejects invalid kind', !r.ok && /kind/.test(r.error || ''), `error="${r.error}"`);
}

// 11. graph
{
  const r = await call('graph', { vault: TEST_ID });
  ok('graph ok', r.ok && Array.isArray(r.data?.nodes) && Array.isArray(r.data?.edges), `nodes=${r.data?.nodes?.length} edges=${r.data?.edges?.length}`);
  ok('graph computes communities/cohesion', typeof r.data?.communities === 'number' && typeof r.data?.cohesion === 'number');
  ok('graph has insights.gaps', Array.isArray(r.data?.insights?.gaps));
}

// 12. query
{
  const r = await call('query', { vault: TEST_ID, question: 'How does self-attention work?' });
  ok('query ok + hits', r.ok && Array.isArray(r.data?.hits) && r.data.hits.length > 0, `hits=${r.data?.hits?.length}`);
  ok('query returns context with [n] citations', typeof r.data?.context === 'string' && /\[1\]/.test(r.data.context));
  ok('query returns allocation', r.data?.allocation && typeof r.data.allocation.wiki === 'number');
}

// 13. review
{
  const r = await call('review', { vault: TEST_ID });
  ok('review ok + issues array', r.ok && Array.isArray(r.data?.issues), `issues=${r.data?.issues?.length}`);
  ok('review has numeric summary', typeof r.data?.summary === 'string' && /issue/.test(r.data.summary));
}

// 14. chat (persists jsonl)
{
  const r = await call('chat', { vault: TEST_ID, message: 'Summarize attention', sessionId: 'verify' });
  ok('chat ok + citations', r.ok && Array.isArray(r.data?.citations), `citations=${r.data?.citations?.length}`);
  const chatFile = path.join(VAULT_DIR, '.llm-wiki', 'chats', 'verify.jsonl');
  ok('chat persisted jsonl to disk', fs.existsSync(chatFile) && fs.readFileSync(chatFile, 'utf8').trim().length > 0);
}

// 15. rate + read back from disk
{
  const r = await call('rate', { vault: TEST_ID, path: firstPage.rel, quality: 5 });
  ok('rate ok', r.ok && r.data?.quality_score === 5, `qs=${r.data?.quality_score}`);
  const raw = fs.readFileSync(path.join(VAULT_DIR, 'wiki', firstPage.rel), 'utf8');
  ok('rate persisted quality_score to frontmatter', /quality_score:\s*5/.test(raw));
}

// 16. setAging + read back
{
  const r = await call('setAging', { vault: TEST_ID, path: firstPage.rel, superseded: true });
  ok('setAging ok', r.ok && r.data?.flags?.superseded === 'true', `flags=${JSON.stringify(r.data?.flags)}`);
  const raw = fs.readFileSync(path.join(VAULT_DIR, 'wiki', firstPage.rel), 'utf8');
  ok('setAging persisted superseded to frontmatter', /superseded:\s*["']?true/.test(raw));
}

// 17. staleReview
{
  const r = await call('staleReview', { vault: TEST_ID });
  ok('staleReview ok + stale array', r.ok && Array.isArray(r.data?.stale), `stale=${r.data?.stale?.length}`);
}

// 18. hygiene (should archive superseded page)
{
  const r = await call('hygiene', { vault: TEST_ID });
  ok('hygiene ok + changed array', r.ok && Array.isArray(r.data?.changed), `changed=${r.data?.changed?.length}`);
  const raw = fs.readFileSync(path.join(VAULT_DIR, 'wiki', firstPage.rel), 'utf8');
  ok('hygiene archived the superseded page', /archived:\s*["']?true/.test(raw));
}

// 19. overview + reindex
{
  const r = await call('overview', { vault: TEST_ID });
  ok('overview ok', r.ok && typeof r.data?.pages === 'number');
  const r2 = await call('reindex', { vault: TEST_ID });
  ok('reindex ok', r2.ok && typeof r2.data?.pages === 'number');
  ok('reindex rewrote index.md', fs.existsSync(path.join(VAULT_DIR, 'wiki', 'index.md')));
}

// 20. compass / writeRules
{
  const r = await call('compass');
  ok('compass ok + human text', r.ok && typeof r.text === 'string' && r.text.length > 10, `len=${r.text?.length}`);
  const r2 = await call('writeRules');
  ok('writeRules ok + human text', r2.ok && typeof r2.text === 'string' && r2.text.includes('sources'));
}

// 21. compileHint + sessionTick (global files)
{
  const r = await call('compileHint', { vault: TEST_ID, note: 'live verify' });
  ok('compileHint ok + file', r.ok && !!r.data?.file, `file=${r.data?.file}`);
  ok('compileHint wrote file', r.data?.file && fs.existsSync(r.data.file));
  const r2 = await call('sessionTick');
  ok('sessionTick ok', r2.ok && !!r2.data?.at);
}

// 22. profileDigest
{
  const r = await call('profileDigest', { vault: TEST_ID });
  ok('profileDigest ok + candidates/text', r.ok && Array.isArray(r.data?.candidates) && typeof r.data?.text === 'string');
}

// 23. maintenancePlan
{
  const r = await call('maintenancePlan', { vault: TEST_ID });
  ok('maintenancePlan ok + scheduleSuggestion', r.ok && !!r.data?.scheduleSuggestion?.rrule);
  ok('maintenancePlan note not duplicated', !/这是一份建议.*这是一份建议/.test(r.text || ''), `text tail="${(r.text||'').slice(-60)}"`);
}

// 24. fusedQuery (HTTP path -> lexical-only degrade)
{
  const r = await call('fusedQuery', { vault: TEST_ID, question: 'self-attention' });
  ok('fusedQuery ok', r.ok && Array.isArray(r.data?.hits));
  ok('fusedQuery HTTP path degrades to lexical-only', r.data?.fusion?.used === false && r.data?.fusion?.strategy === 'lexical-only', `fusion=${JSON.stringify(r.data?.fusion)}`);
}

// 25. bridgeStatus / bridgeProjects (graceful when no app)
{
  const r = await call('bridgeStatus');
  ok('bridgeStatus ok + available boolean', r.ok && typeof r.data?.available === 'boolean', `available=${r.data?.available}`);
  const r2 = await call('bridgeProjects');
  ok('bridgeProjects ok + message', r.ok && typeof r2.data?.message === 'string');
}

// 26. exportVault -> check ZIP base64 decodes to real entries
let exportedZip;
{
  const r = await call('exportVault', { vault: TEST_ID });
  ok('exportVault ok + zipBase64', r.ok && typeof r.data?.zipBase64 === 'string' && r.data.zipBase64.length > 0, `files=${r.data?.files}`);
  const buf = Buffer.from(r.data?.zipBase64 || '', 'base64');
  ok('export ZIP has local file header', buf.readUInt32LE(0) === 0x04034b50, `magic=0x${buf.readUInt32LE(0).toString(16)}`);
  exportedZip = r.data?.zipBase64;
}

// 27. importVault roundtrip (new name) -> compare page count
{
  const importName = TEST_VAULT_NAME + '-import';
  const r = await call('importVault', { name: importName, zipBase64: exportedZip });
  ok('importVault ok', r.ok, `text="${r.text}"`);
  const importedDir = path.join(VAULT_ROOT, importName.replace(/[^A-Za-z0-9._-]+/g, '-'));
  ok('importVault created directory', fs.existsSync(importedDir));
  ok('importVault recreated config.json', fs.existsSync(path.join(importedDir, 'config.json')));
  const srcPages = fs.readdirSync(path.join(VAULT_DIR, 'wiki'), { recursive: true }).filter(f => String(f).endsWith('.md')).length;
  const impPages = fs.readdirSync(path.join(importedDir, 'wiki'), { recursive: true }).filter(f => String(f).endsWith('.md')).length;
  ok('import roundtrip preserved wiki pages count', srcPages === impPages, `src=${srcPages} imp=${impPages}`);
  // cleanup imported
  await call('deleteVault', { id: path.basename(importedDir) });
}

// 28. deleteVault param mismatch: test BOTH id and vault
{
  // First try with `vault` (what most actions use) — should FAIL if code truly uses args.id
  const rWrong = await call('deleteVault', { vault: TEST_ID });
  // Then try with `id` — should succeed
  const rRight = await call('deleteVault', { id: TEST_ID });
  ok('deleteVault with `id` succeeds', rRight.ok && rRight.data?.deleted === true, `text="${rRight.text}"`);
  ok('deleteVault removed directory from disk', !fs.existsSync(VAULT_DIR));
  results.push(`  INFO deleteVault with \`vault\` param: ok=${rWrong.ok} error="${rWrong.error || ''}" (code uses args.id)`);
}

// 29. vaults back to baseline
{
  const r = await call('vaults');
  const stillThere = (r.data || []).some(v => v.id === TEST_ID);
  ok('deleted vault no longer listed', !stillThere);
}

console.log(results.join('\n'));
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
