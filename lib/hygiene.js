/**
 * Self-maintenance / aging for the LLM Wiki (P2 of the iwtown fusion).
 * Ported as LOGIC ONLY from the ideas in iwtown/dsh-llm-wiki (MIT, iwtown):
 * quality scoring, stale review, compile hint, profile digest, maintenance plan.
 * No upstream code is copied. See README.md for full attribution.
 *
 * Review fixes applied here:
 * - H1: aging fields are SCALARS (quality_score / archived / superseded / recall),
 *       because engine.js:27-49 parseFrontmatter cannot read object arrays.
 * - H4: compileHint is an EXPLICIT action; the session/disposed hook only
 *       writes a lightweight timestamp, never reads a session log.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as E from './engine.js';

const DAY = 24 * 60 * 60 * 1000;
const asBool = (v) => v === true || v === 1 || /^(true|yes|1)$/i.test(String(v ?? ''));
const asNum = (v, d = 3) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Find a page by path (safePath-normalized) among listPages results. */
function findPage(pages, rel) {
  const target = String(rel || '').replace(/\\/g, '/').replace(/\.md$/, '');
  return pages.find((p) => p.rel.replace(/\.md$/, '') === target || p.title === target);
}

/** H2: read the full frontmatter of one page via the engine, normalized. */
function metaOf(id, rel) {
  const page = E.readPage(id, rel);
  const m = page.frontmatter || {};
  return {
    ...m,
    quality_score: asNum(m.quality_score, 3),
    archived: asBool(m.archived),
    superseded: asBool(m.superseded),
    recall: m.recall === undefined ? true : asBool(m.recall),
  };
}

/** Patch only the given scalar fields of a page's frontmatter, preserving the body. */
function patchMeta(id, rel, patch) {
  const page = E.readPage(id, rel);
  const meta = { ...(page.frontmatter || {}), ...patch, updated: new Date().toISOString() };
  E.writePage(id, rel, E.frontmatter(meta, page.body), { allowOverwrite: true });
  return { path: rel, patch };
}

/** Rate a page 1..5: writes the scalar quality_score and logs the change. */
export function rate(id, rel, quality) {
  const dir = E.requireVault(id); // validate vault first
  const pages = E.listPages(id);
  const page = findPage(pages, rel);
  if (!page) throw new Error(`page not found: ${rel}`);
  const q = Math.max(1, Math.min(5, Math.round(Number(quality) || 3)));
  patchMeta(id, page.rel, { quality_score: q, rated: new Date().toISOString() });
  E.log(id, `Rated "${page.title}" quality_score=${q}`);
  E.touch(id);
  return { path: page.rel, title: page.title, quality_score: q };
}

/** Mark aging flags on a page: archived, superseded, recall. */
export function setAging(id, rel, flags = {}) {
  E.requireVault(id);
  const page = findPage(E.listPages(id), rel);
  if (!page) throw new Error(`page not found: ${rel}`);
  const patch = {};
  // Only touch flags the caller actually supplied. The HTTP/tool callers pass
  // all three keys, but unspecified ones arrive as `undefined` — treating those
  // as false would silently flip recall:false and hide a page from retrieval.
  if (flags.archived !== undefined) patch.archived = asBool(flags.archived) ? 'true' : 'false';
  if (flags.superseded !== undefined) patch.superseded = asBool(flags.superseded) ? 'true' : 'false';
  if (flags.recall !== undefined) patch.recall = asBool(flags.recall) ? 'true' : 'false';
  if (!Object.keys(patch).length) throw new Error('no aging flags supplied (archived/superseded/recall)');
  patchMeta(id, page.rel, patch);
  E.log(id, `Updated aging flags on "${page.title}": ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  E.touch(id);
  return { path: page.rel, title: page.title, flags: patch };
}

/**
 * Stale review: surface pages worth revisiting. Never deletes; only reports.
 * Sorts by a simple staleness score = age-days/30 + (4-quality) + penalties.
 */
export function staleReview(id, opts = {}) {
  const pages = E.listPages(id);
  const g = E.graph(id);
  const maxAgeDays = Math.max(1, Number(opts.maxAgeDays) || 90);
  const now = Date.now();
  const rows = pages.map((p) => {
    const m = metaOf(id, p.rel);
    const updated = m.updated ? Date.parse(m.updated) : NaN;
    const ageDays = Number.isFinite(updated) ? Math.floor((now - updated) / DAY) : null;
    const degree = g.nodes.find((n) => n.id === p.rel)?.degree ?? 0;
    let score = (ageDays === null ? 1 : Math.min(4, ageDays / 30)) + (4 - m.quality_score) * 0.5;
    if (degree <= 1) score += 1;
    if (m.superseded) score += 1.5;
    if (m.archived) score -= 2;
    if (!m.sources || (Array.isArray(m.sources) ? m.sources.length : m.sources ? 1 : 0) === 0) score += 0.5;
    return { path: p.rel, title: p.title, quality_score: m.quality_score, ageDays, degree, archived: m.archived, superseded: m.superseded, recall: m.recall, score: +score.toFixed(2) };
  }).filter((r) => r.score >= 1.5).sort((a, b) => b.score - a.score);
  const reasons = (r) => {
    const out = [];
    if (r.ageDays !== null && r.ageDays > maxAgeDays) out.push(`${r.ageDays} 天未更新`);
    if (r.quality_score <= 2) out.push(`质量低（${r.quality_score}/5）`);
    if (r.degree <= 1) out.push('图谱孤立');
    if (r.superseded) out.push('已被取代');
    if (r.archived) out.push('已归档');
    if (!out.length) out.push('综合陈旧度偏高');
    return out.join('、');
  };
  return { vault: id, total: pages.length, stale: rows.map((r) => ({ ...r, why: reasons(r) })) };
}

/** One-click hygiene: apply explicit, reversible aging decisions in bulk. */
export function hygiene(id, opts = {}) {
  const stale = staleReview(id, opts).stale;
  const changed = [];
  for (const r of stale) {
    if (r.superseded && !r.archived && opts.archiveSuperseded !== false) {
      setAging(id, r.path, { archived: true });
      changed.push({ path: r.path, action: 'archived', reason: '已被标记为 superseded' });
    } else if (r.quality_score <= 1 && opts.markLowQuality !== false && !r.archived) {
      setAging(id, r.path, { recall: false });
      changed.push({ path: r.path, action: 'recall:false', reason: '质量评分 1/5，暂不参与召回' });
    }
  }
  E.log(id, `Hygiene pass: ${changed.length} page(s) updated`);
  return { scanned: stale.length, changed, hint: changed.length ? `已处理 ${changed.length} 页；所有改动都写进了 frontmatter，随时可手动改回。` : '没有需要自动处理的页面；陈旧页仍列在 staleReview 中供人工判断。' };
}

/** H4: explicit compile hint — agent calls this when a session is worth distilling. */
export function compileHint(id, note = '') {
  E.requireVault(id);
  const root = E.home();
  const file = path.join(root, 'compile-hint.json');
  const payload = { vault: id, at: new Date().toISOString(), note: String(note || '').slice(0, 4000), pages: E.listPages(id).length };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return { file, ...payload };
}

/** H4: lightweight event mark — no session log read, no awaitable work. */
export function sessionTick() {
  const root = E.home();
  const file = path.join(root, 'session-ended.json');
  const payload = { at: new Date().toISOString() };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return payload;
}

/**
 * E2: profile digest with a human confirmation gate.
 * Produces candidate entries for mnemon_runtime_memory, but NEVER writes USER.md.
 */
export function profileDigest(id, opts = {}) {
  const pages = E.listPages(id);
  const candidates = [];
  for (const p of pages) {
    const m = metaOf(id, p.rel);
    const isProfile = /user|profile|偏好|习惯|身份|preference/i.test(p.title) || (Array.isArray(m.tags) && m.tags.some((t) => /偏好|习惯|profile|user/i.test(String(t))));
    if (!isProfile || m.archived || m.recall === false) continue;
    const quotes = String(p.body).split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= 6 && l.length <= 200 && !/^#|^[-*]\s*$/.test(l));
    candidates.push({ page: p.rel, title: p.title, target: /偏好|习惯/.test(p.title) ? 'user' : 'memory', quotes: quotes.slice(0, 5) });
  }
  return {
    vault: id,
    scanned: pages.length,
    candidates,
    text: candidates.length
      ? `找到 ${candidates.length} 个可能属于长期记忆的页面。下面是候选条目——请由你或 Agent 确认后再写入 mnemon，本插件不会自动改 USER.md。`
      : '没有发现适合沉淀为用户画像的页面。把个人信息写进一个标题含「偏好」或「User Profile」的页面后再试。',
  };
}

/** F2: maintenance plan suggestions with an explicit, copy-pasteable schedule call. */
export function maintenancePlan(id) {
  const stale = staleReview(id).stale;
  const g = E.graph(id);
  const parts = [];
  if (stale.length) parts.push(`每周对 ${stale.length} 个陈旧页面做一次 staleReview，确认哪些该归档或降权。`);
  if (g.insights.gaps.length) parts.push(`图谱里有 ${g.insights.gaps.length} 处结构缺口（孤立页/低内聚），适合每月做一次主题补充。`);
  parts.push('会话结束后，把值得长期保留的结论用 compileHint 记录，再由 Agent 决定要不要写进 wiki。');
  return {
    vault: id,
    text: parts.join(' '),
    scheduleSuggestion: {
      title: 'LLM Wiki 每周维护',
      rrule: 'DTSTART;TZID=Asia/Shanghai:20261130T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
      prompt: `用 llm_wiki 对知识库 ${id} 执行 staleReview 和 review，把需要归档或补充的页面列给我确认；不要自动删除或改写内容。`,
      target: 'this_session',
    },
    note: '这是一份建议，不会自动创建计划任务。要启用就把上面的调用交给 DSH 的 schedule_create。',
  };
}

/** Retrieval re-rank helpers shared with fusion.js. */
export function rerankScore(meta, now = Date.now()) {
  let s = 1 + 0.1 * (asNum(meta.quality_score, 3) - 3);
  if (meta.recall === false) return 0;
  const updated = Date.parse(meta.updated || '');
  if (Number.isFinite(updated)) {
    const days = (now - updated) / DAY;
    if (days <= 30) s *= 1.05;
    else if (days > 180) s *= 0.9;
  }
  if (asBool(meta.superseded)) s *= 0.5;
  if (asBool(meta.archived)) s *= 0.7;
  return s;
}
