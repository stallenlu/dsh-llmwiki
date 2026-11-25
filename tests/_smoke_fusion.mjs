/**
 * Fusion smoke: exercises P1-P4 logic against a throwaway vault.
 * Run: node _smoke_fusion.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as E from './lib/engine.js';
import * as rules from './lib/wikiRules.js';
import * as hygiene from './lib/hygiene.js';
import { fuseQuery, describeFusion } from './lib/fusion.js';
import { makeHandler, describe } from './lib/routes.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llw-fusion-smoke-'));
process.env.LLM_WIKI_HOME = tmp;
const ok = (cond, label) => { if (!cond) throw new Error('FAILED: ' + label); console.log('  ok:', label); };
const fail = async (fn, label, re) => {
  try { await fn(); throw new Error('expected throw: ' + label); }
  catch (e) { if (e.message.startsWith('expected throw')) throw e; if (re && !re.test(e.message)) throw new Error(label + ' -> wrong error: ' + e.message); console.log('  ok:', label, '=>', e.message.slice(0, 70)); }
};

console.log('[fusion-smoke] home =', tmp);
try {
  // --- setup: two linked pages ---
  const v = E.createVault('Fusion Smoke', 'Test fusion');
  ok(v.id === 'Fusion-Smoke', 'createVault');
  await E.ingest(v.id, { title: 'Attention Is All You Need', text: 'Self-attention mechanisms let each token attend to all other tokens. Multi-head attention improves translation quality.' });
  E.writePage(v.id, 'concepts/Transformers.md', E.frontmatter({ title: 'Transformers', type: 'concept', sources: ['raw/sources/a.md'], tags: ['ml'] }, 'Transformers rely on [[Attention Is All You Need]] and [[Self-Attention]]. They power modern NLP.'), { allowOverwrite: true });

  // --- P1: writing discipline + compass ---
  const check = rules.checkWrite('---\ntitle: Lone\ntype: concept\n---\nA page with no links.', E.listPages(v.id));
  ok(check.hints.some((h) => h.includes('双链')), 'checkWrite flags missing wikilinks');
  ok(check.hints.some((h) => h.includes('sources')), 'checkWrite flags missing sources');
  ok(rules.rulesText().includes('查重'), 'rulesText contains dedupe rule');
  const compass = rules.compassText(true);
  ok(compass.includes('Fusion Smoke') && compass.length <= 900, 'compass names vault and is bounded');

  // --- H2: listPages carries meta + aging fields ---
  const pages = E.listPages(v.id);
  ok(pages.every((p) => p.meta && typeof p.quality === 'number' && 'archived' in p), 'listPages carries meta/quality/aging');
  const wp = E.writePage(v.id, 'concepts/Rated.md', E.frontmatter({ title: 'Rated', type: 'concept', sources: ['raw/sources/a.md'], quality_score: '5' }, 'Rated page links to [[Transformers]] and [[Attention Is All You Need]].'), { allowOverwrite: true });
  ok(Array.isArray(wp.hints), 'writePage returns hints');
  const ratedPage = E.listPages(v.id).find((p) => p.title === 'Rated');
  ok(ratedPage.quality === 5, 'quality_score parsed from frontmatter');

  // --- P2: rate / aging / staleReview / hygiene / compileHint / profileDigest / maintenancePlan ---
  const r = hygiene.rate(v.id, 'concepts/Rated.md', 2);
  ok(r.quality_score === 2, 'rate writes quality_score');
  const aging = hygiene.setAging(v.id, 'concepts/Rated.md', { superseded: true });
  ok(aging.flags.superseded === 'true', 'setAging writes scalar superseded');
  const stale = hygiene.staleReview(v.id);
  ok(Array.isArray(stale.stale) && stale.stale.length > 0, 'staleReview returns stale pages');
  ok(stale.stale[0].why && stale.stale[0].why.length > 0, 'staleReview supplies human reason');
  const hyg = hygiene.hygiene(v.id, {});
  ok(typeof hyg.hint === 'string' && hyg.hint.length > 0, 'hygiene returns human hint');
  const afterHyg = E.listPages(v.id).find((p) => p.title === 'Rated');
  ok(afterHyg.archived === true, 'hygiene archived the superseded page');
  const hint = hygiene.compileHint(v.id, 'A useful conclusion');
  ok(hint.file.endsWith('compile-hint.json') && hint.note === 'A useful conclusion', 'compileHint explicit action');
  const tick = hygiene.sessionTick();
  ok(!!tick.at, 'sessionTick writes timestamp only');
  // profileDigest: add a user-preference page and confirm it is surfaced but NOT written to USER.md
  E.writePage(v.id, 'entities/User Profile.md', E.frontmatter({ title: 'User Profile', type: 'entity', sources: ['raw/sources/a.md'], quality_score: 5, tags: ['偏好'] }, '用户偏好：服务端算好人话，客户端只渲染。\n另一条用户偏好：方案要多路径比较。'), { allowOverwrite: true });
  const pd = hygiene.profileDigest(v.id);
  ok(pd.candidates.some((c) => c.title === 'User Profile'), 'profileDigest surfaces profile page');
  ok(pd.text.includes('不会自动'), 'profileDigest declares no auto-write');
  const mp = hygiene.maintenancePlan(v.id);
  ok(mp.scheduleSuggestion && mp.scheduleSuggestion.rrule.includes('FREQ=WEEKLY'), 'maintenancePlan gives opt-in schedule');

  // --- P3: fusion degrades gracefully without ctx; RRF works with a real host-like ctx mock ---
  const noCtx = await fuseQuery(null, v.id, 'self-attention translation');
  ok(noCtx.fusion.used === false && noCtx.hits.length > 0, 'fuseQuery degrades to lexical without ctx');
  ok(describeFusion(noCtx).includes('仅词法'), 'describeFusion explains lexical fallback');
  // Build a fake ctx whose tools.get returns a stub; use a path matching a wiki page
  const ctx = { get: (name) => name === 'tools' ? {
    get: (n) => n === 'mnemon_recall' ? {} : null,
    execute: async ({ calls }) => ({ results: [{ result: `（来源: ${tmp}/vaults/Fusion-Smoke/wiki/sources/Attention-Is-All-You-Need.md）Self-attention translation evidence.` }] }),
    setExecutor: () => {},
  } : null };
  const fused = await fuseQuery(ctx, v.id, 'self-attention translation', { useMnemon: true });
  ok(fused.fusion.used === true && fused.fusion.strategy === 'rrf+rerank', 'fuseQuery uses RRF when mnemon tool available');
  ok(describeFusion(fused).includes('mnemon'), 'describeFusion explains fused result');

  // --- route layer: describe() covers all new actions without exposing raw data ---
  for (const a of ['rate', 'setAging', 'staleReview', 'hygiene', 'compileHint', 'profileDigest', 'maintenancePlan', 'compass', 'writeRules', 'fusedQuery']) {
    const d = describe(a, { text: 'human', hint: 'human', stale: [], quality_score: 3, title: 'T', flags: {}, pages: 1, hits: [], fusion: { used: false } });
    ok(typeof d === 'string' && d.length > 0, `describe(${a}) returns human text`);
  }

  console.log('[fusion-smoke] ALL PASSED');
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
