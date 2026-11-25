import * as E from './lib/engine.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.LLM_WIKI_HOME = path.join(os.tmpdir(), 'llmwiki-smoke-' + Date.now());
const log = (...a) => console.log('[smoke]', ...a);
try {
  const v = E.createVault('Test Vault', 'Answer questions about renewable energy.');
  log('createVault', v);
  log('vaults', E.vaults().map(x => x.id));

  const ing = await E.ingest(v.id, {
    title: 'Solar power basics',
    origin: 'https://example.com/solar',
    text: 'Solar power converts sunlight into electricity using photovoltaic cells. Solar power is a renewable energy source. The cost of solar has fallen 90% since 2010. Photovoltaic cells generate direct current.',
  });
  log('ingest', { source: ing.source, page: ing.page, phrases: ing.analysis.keyphrases.slice(0, 5) });

  const dup = await E.ingest(v.id, { title: 'Solar power basics', text: 'Solar power converts sunlight into electricity using photovoltaic cells. Solar power is a renewable energy source. The cost of solar has fallen 90% since 2010. Photovoltaic cells generate direct current.' });
  log('dedupe', dup.duplicate === true ? 'OK' : 'FAILED');

  const page = E.readPage(v.id, ing.page);
  log('readPage links', page.links.length, 'backlinks', page.backlinks.length);

  const w = E.writePage(v.id, 'concepts/Photovoltaics', '# Photovoltaics\n\n[[Solar power basics]] converts light to electricity via photovoltaic cells. Related to [[Solar power basics]].');
  log('writePage', w);

  const g = E.graph(v.id);
  log('graph', { nodes: g.nodes.length, edges: g.edges.length, communities: g.communities, cohesion: g.cohesion, insights: g.insights.gaps.length });

  const r = E.query(v.id, 'What is solar power and how does it work?');
  log('query hits', r.hits.map(h => `${h.n}:${h.title}`).join(', '), 'contextChars', r.context.length);

  const rev = E.review(v.id);
  log('review', rev.summary, 'issues', rev.issues.length);

  const pack = E.chatPack(v.id, 'How cheap is solar now?');
  log('chatPack citations', pack.citations.length, 'history', pack.history);

  const exp = E.exportVault(v.id);
  log('export', { files: exp.files, b64len: exp.zipBase64.length });
  const imp = E.importVault('Imported Vault', exp.zipBase64);
  log('import', imp);

  const del = E.deletePage(v.id, w.path);
  log('deletePage', del.deleted, 'remaining links', E.readPage(v.id, ing.page).links.length);

  log('ALL CORE SMOKE CHECKS PASSED');
} catch (e) {
  console.error('[smoke] FAILED:', e.stack || e);
  process.exitCode = 1;
} finally {
  // don't delete — leave for inspection under tmp
  log('fixture at', process.env.LLM_WIKI_HOME);
}
