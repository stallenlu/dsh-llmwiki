/**
 * LLM Wiki engine — clean-room implementation of the LLM Wiki knowledge model.
 * Inspired by nashsu/llm_wiki (GPL-3.0). No upstream code is copied.
 * MIT-licensed original work.
 *
 * Model: immutable raw sources -> LLM-maintained wiki pages -> schema.
 * Everything is plain UTF-8 markdown, Obsidian-compatible.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KINDS = ['entities', 'concepts', 'sources', 'queries', 'synthesis', 'comparisons'];
const TYPE_AFFINITY = { entities: 'entities', concepts: 'concepts', sources: 'sources' };

export function home() {
  return process.env.LLM_WIKI_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'llm-wiki');
}
const safeName = (s) => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
const vaultDir = (id) => path.join(home(), 'vaults', safeName(id));
const now = () => new Date().toISOString();
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const write = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data, 'utf8'); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Minimal YAML frontmatter: scalars, quoted strings, [arrays], and - list lines. */
export function parseFrontmatter(text) {
  const out = { data: {}, body: text };
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return out;
  out.body = text.slice(m[0].length);
  let currentArray = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('- ') && currentArray) { out.data[currentArray].push(unquote(line.slice(2))); continue; }
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (value === '') { out.data[key] = []; currentArray = key; }
    else {
      currentArray = null;
      if (value.startsWith('[') && value.endsWith(']')) out.data[key] = value.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean);
      else out.data[key] = unquote(value);
    }
  }
  return out;
}
function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
const q = (v) => (/[:#\[\]{}"'&*?|>%\n]/.test(String(v)) || String(v).trim() === '' ? JSON.stringify(String(v)) : String(v));
export function frontmatter(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else if (v.every((x) => !/[:#\n]/.test(String(x)))) lines.push(`${k}: [${v.map(q).join(', ')}]`);
      else { lines.push(`${k}:`); for (const x of v) lines.push(`  - ${q(x)}`); }
    } else lines.push(`${k}: ${q(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body.trim() + '\n';
}
export function wikilinks(text) {
  const links = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
  let m;
  while ((m = re.exec(text))) links.push({ target: m[1].trim(), alias: (m[2] || '').trim() || m[1].trim() });
  return links;
}

/* ------------------------------ vault CRUD ------------------------------ */
export function vaults() {
  const root = path.join(home(), 'vaults');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const id = d.name;
    const cfg = read(path.join(vaultDir(id), 'config.json'));
    let meta = {};
    try { meta = cfg ? JSON.parse(cfg) : {}; } catch { meta = {}; }
    const pages = listPages(id);
    const sources = fs.existsSync(path.join(vaultDir(id), 'raw', 'sources')) ? fs.readdirSync(path.join(vaultDir(id), 'raw', 'sources')).filter((f) => f.endsWith('.md')).length : 0;
    return { id, name: meta.name || id, createdAt: meta.createdAt || null, pages: pages.length, sources, updatedAt: meta.updatedAt || null };
  }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export function createVault(name, purpose = '') {
  const id = safeName(name);
  const dir = vaultDir(id);
  if (fs.existsSync(dir)) throw new Error(`vault already exists: ${id}`);
  for (const k of KINDS) fs.mkdirSync(path.join(dir, 'wiki', k), { recursive: true });
  for (const k of ['sources', 'assets']) fs.mkdirSync(path.join(dir, 'raw', k), { recursive: true });
  fs.mkdirSync(path.join(dir, '.llm-wiki', 'chats'), { recursive: true });
  write(path.join(dir, 'config.json'), JSON.stringify({ id, name: String(name), createdAt: now(), updatedAt: now(), schemaVersion: 1 }, null, 2));
  write(path.join(dir, 'purpose.md'), frontmatter({ type: 'purpose', updated: now() }, `# ${name}\n\n## Goals\n${purpose || 'Describe the goals and questions this wiki should answer.'}\n\n## Scope\n- In scope: \n- Out of scope: \n\n## Thesis\n`));
  write(path.join(dir, 'schema.md'), frontmatter({ type: 'schema' }, '# Wiki schema\n\n- entities: People, organizations, projects\n- concepts: Ideas, methods, theories\n- sources: Immutable input documents\n- queries: Questions already researched\n- synthesis: Cross-source synthesis\n- comparisons: Side-by-side analysis\n'));
  write(path.join(dir, 'wiki', 'index.md'), frontmatter({ type: 'index', updated: now() }, '# Knowledge index\n\n_No pages yet. Ingest a source to begin._\n'));
  write(path.join(dir, 'wiki', 'log.md'), frontmatter({ type: 'log' }, '# Change log\n'));
  write(path.join(dir, 'wiki', 'overview.md'), frontmatter({ type: 'overview', updated: now() }, '# Overview\n\nThis wiki is empty.\n'));
  write(path.join(dir, 'raw', 'sources', 'README.md'), '# Raw sources\n\nFiles here are immutable. The wiki is generated from them.\n');
  return { id, name, createdAt: now() };
}
export function deleteVault(id) {
  const dir = requireVault(id);
  // Remove recursively, but only inside our own vaults root.
  const root = path.join(home(), 'vaults');
  if (!dir.startsWith(root) || path.dirname(dir) !== root) throw new Error('refusing to delete outside vaults root');
  fs.rmSync(dir, { recursive: true, force: true });
  return { id, deleted: true, message: `Deleted wiki ${id} and all its pages.` };
}
export function touch(id) {
  const p = path.join(vaultDir(id), 'config.json');
  if (!fs.existsSync(p)) return;
  let c = {}; try { c = JSON.parse(read(p)); } catch { c = {}; }
  c.updatedAt = now(); write(p, JSON.stringify(c, null, 2));
}
export function requireVault(id) {
  if (!id || !fs.existsSync(path.join(vaultDir(id), 'config.json'))) throw new Error(`vault not found: ${id || '(none)'}. Create one first.`);
  return vaultDir(id);
}
export function listPages(id, kind) {
  const dir = path.join(requireVault(id), 'wiki');
  const files = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith('.md') && !['index.md', 'log.md', 'overview.md'].includes(e.name)) {
        const text = read(p);
        const { data, body } = parseFrontmatter(text);
        // H2 (fusion review): carry the full frontmatter and explicit aging
        // fields so hygiene/query can rank by quality/archived/superseded.
        const asBool = (v) => v === true || v === 1 || /^(true|yes|1)$/i.test(String(v ?? ''));
        files.push({
          path: r, rel: r,
          title: String(data.title || e.name.replace(/\.md$/, '')),
          type: String(data.type || (rel || 'page').replace(/s$/, '')),
          sources: (Array.isArray(data.sources) ? data.sources : data.sources ? [data.sources] : []),
          tags: Array.isArray(data.tags) ? data.tags : [],
          updated: String(data.updated || ''),
          meta: data,
          quality: Number.isFinite(Number(data.quality_score)) ? Number(data.quality_score) : 3,
          archived: asBool(data.archived),
          superseded: asBool(data.superseded),
          recall: data.recall === undefined ? true : asBool(data.recall),
          body, text,
        });
      }
    }
  };
  walk(dir, '');
  return kind ? files.filter((f) => f.rel.startsWith(kind + '/') || f.type === kind) : files;
}
export function readPage(id, rel) {
  requireVault(id);
  const p = path.join(vaultDir(id), 'wiki', safePath(rel));
  if (!p.startsWith(path.join(vaultDir(id), 'wiki'))) throw new Error('path escapes vault');
  if (!fs.existsSync(p)) throw new Error(`page not found: ${rel}`);
  const text = read(p);
  const { data, body } = parseFrontmatter(text);
  const links = wikilinks(body);
  return { path: rel, frontmatter: data, body, links, backlinks: backlinks(id, rel) };
}
function safePath(rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (r.split('/').some((s) => s === '..' || s === '.')) throw new Error('invalid path');
  return r.endsWith('.md') ? r : r + '.md';
}
export function writePage(id, rel, content, opts = {}) {
  const dir = requireVault(id);
  const relPath = safePath(rel);
  const p = path.join(dir, 'wiki', relPath);
  if (!p.startsWith(path.join(dir, 'wiki'))) throw new Error('path escapes vault');
  const kind = relPath.includes('/') ? relPath.split('/')[0] : 'synthesis';
  if (!KINDS.includes(kind) && !['index', 'log', 'overview'].includes(kind)) throw new Error(`page kind must be one of ${KINDS.join(', ')}`);
  if (fs.existsSync(p) && !opts.allowOverwrite) throw new Error(`page exists: ${relPath} (pass allowOverwrite)`);
  const { data, body } = parseFrontmatter(content);
  const meta = { ...data, type: data.type || (kind === 'synthesis' ? 'synthesis' : kind.replace(/s$/, '')), title: data.title || path.basename(relPath, '.md'), updated: now() };
  write(p, frontmatter(meta, body));
  log(id, `${opts.allowOverwrite ? 'Updated' : 'Created'} ${relPath}`);
  touch(id);
  // P1 double-layer write discipline: human-readable hints, never a hard failure.
  const hints = [];
  const sources = Array.isArray(data.sources) ? data.sources : data.sources ? [data.sources] : [];
  if (!sources.length) hints.push('这一页没有 sources，日后无法追溯原始出处；建议补上来源。');
  const uniqueLinks = new Set(wikilinks(body).map((l) => l.target.toLowerCase()));
  if (uniqueLinks.size < 2) hints.push(`这一页只有 ${uniqueLinks.size} 个 [[双链]]，容易被图谱视为孤立节点；建议至少引用 2 个相关页面。`);
  return { path: relPath, title: meta.title, type: meta.type, hints };
}
export function deletePage(id, rel) {
  const dir = requireVault(id);
  const p = path.join(dir, 'wiki', safePath(rel));
  if (!p.startsWith(path.join(dir, 'wiki'))) throw new Error('path escapes vault');
  if (!fs.existsSync(p)) throw new Error('page not found');
  const title = String(parseFrontmatter(read(p)).data.title || path.basename(p, '.md'));
  fs.unlinkSync(p);
  // cascade: remove wikilinks to the deleted title and drop the source from index
  for (const page of listPages(id)) {
    const { data, body } = parseFrontmatter(read(path.join(dir, 'wiki', page.path)));
    const cleaned = body.replace(new RegExp(`\\[\\[${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\|[^\\]]+)?\\]\\]`, 'g'), '');
    if (cleaned !== body) write(path.join(dir, 'wiki', page.path), frontmatter(data, cleaned));
  }
  log(id, `Deleted ${rel} and cleaned inbound links`);
  touch(id);
  return { deleted: rel, title };
}
export function backlinks(id, rel) {
  const target = path.basename(rel, '.md').replace(/[-_]/g, ' ').toLowerCase();
  return listPages(id).filter((p) => p.rel !== rel && new RegExp(`\\[\\[[^\\]]*${target}[^\\]]*\\]\\]`, 'i').test(p.body)).map((p) => p.rel);
}
export function log(id, message) {
  const p = path.join(requireVault(id), 'wiki', 'log.md');
  const { data, body } = parseFrontmatter(read(p));
  write(p, frontmatter(data, `- ${now()} — ${message}\n${body.replace(/^#.*\n?/, '').trimStart()}`));
}

/* ------------------------------- ingest --------------------------------- */
function tokens(text) {
  const en = String(text).toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) || [];
  const cjk = String(text).match(/[\u4e00-\u9fff]+/g) || [];
  const bigrams = [];
  for (const run of cjk) for (let i = 0; i < run.length - 1; i++) bigrams.push(run.slice(i, i + 2));
  return [...en, ...bigrams];
}
function summarize(text, max = 240) {
  const clean = String(text).replace(/\r/g, '').replace(/^#+\s*/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  let out = '';
  for (const s of sentences) { if ((out + s).length > max) break; out += s + ' '; }
  return (out || clean.slice(0, max)).trim() + '…';
}
function extractKeyphrases(text, limit = 8) {
  const counts = new Map();
  for (const t of tokens(text)) if (t.length > 2) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t);
}
export async function ingest(id, input) {
  const dir = requireVault(id);
  const { text, title, origin, kind = 'source', generate = false, llm } = input;
  if (!text || !String(text).trim()) throw new Error('ingest needs non-empty text');
  const hash = sha(String(text));
  const sourceRel = `raw/sources/${safeName(title || origin || hash.slice(0, 8))}-${hash.slice(0, 8)}.md`;
  const sourcePath = path.join(dir, sourceRel);
  if (fs.existsSync(sourcePath)) return { duplicate: true, source: sourceRel, message: 'Already ingested (identical SHA256).' };
  write(sourcePath, frontmatter({ type: 'source', title: title || 'Untitled source', origin: origin || '', sha256: hash, ingested: now() }, String(text)));

  const phrases = extractKeyphrases(text);
  const analysis = { summary: summarize(text), keyphrases: phrases, claims: String(text).split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 30).slice(0, 5) };
  const wikiRel = `${kind === 'note' ? 'synthesis' : 'sources'}/${safeName(title || phrases[0] || 'source')}.md`;
  let body = `## Summary\n\n${analysis.summary}\n\n## Key points\n\n${analysis.claims.map((c) => `- ${summarize(c, 180)}`).join('\n') || '- (none extracted)'}\n\n## Entities & concepts\n\n${phrases.map((p) => `[[${p}]]`).join(' · ') || '(none)'}\n\n## Source\n\n- \`${sourceRel}\`${origin ? ` — ${origin}` : ''}\n`;
  let gen = null;
  if (generate && llm) {
    try {
      gen = await llm.generate(analysis, title || 'Untitled', read(path.join(dir, 'schema.md')));
      if (gen && gen.body) body = gen.body;
    } catch (e) { gen = { error: String(e.message || e) }; }
  }
  write(path.join(dir, 'wiki', wikiRel), frontmatter({ type: 'source', title: title || 'Untitled source', sources: [sourceRel], tags: phrases.slice(0, 5), generated: !!(gen && !gen.error), updated: now() }, body));
  log(id, `Ingested ${title || origin || 'source'} -> ${wikiRel}`);
  rebuildIndex(id);
  updateOverview(id);
  touch(id);
  return { source: sourceRel, page: wikiRel, analysis, generated: !!(gen && !gen.error), generatorError: gen?.error || null };
}
export function rebuildIndex(id) {
  const dir = requireVault(id);
  const pages = listPages(id);
  const lines = ['# Knowledge index', '', `_${pages.length} page(s). Regenerated ${now()}._`, ''];
  for (const kind of KINDS) {
    const group = pages.filter((p) => p.type === kind || p.rel.startsWith(kind + '/'));
    if (!group.length) continue;
    lines.push(`## ${kind}`, '');
    for (const p of group.sort((a, b) => a.title.localeCompare(b.title))) lines.push(`- [[${p.title}]] — \`${p.rel}\``);
    lines.push('');
  }
  write(path.join(dir, 'wiki', 'index.md'), frontmatter({ type: 'index', updated: now(), pages: pages.length }, lines.join('\n')));
  return { pages: pages.length };
}
export function updateOverview(id) {
  const dir = requireVault(id);
  const pages = listPages(id);
  const counts = {};
  for (const p of pages) counts[p.type] = (counts[p.type] || 0) + 1;
  const purpose = parseFrontmatter(read(path.join(dir, 'purpose.md'))).body.trim();
  const body = `# Overview\n\n${summarize(purpose, 300) || 'No purpose stated.'}\n\n**${pages.length} pages** across ${Object.keys(counts).length} types: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.\n\n_Updated ${now()}._\n`;
  write(path.join(dir, 'wiki', 'overview.md'), frontmatter({ type: 'overview', updated: now() }, body));
  return { pages: pages.length, counts };
}

/* -------------------------------- graph --------------------------------- */
export function graph(id) {
  const pages = listPages(id);
  const byTitle = new Map();
  for (const p of pages) {
    byTitle.set(p.title.toLowerCase(), p.rel);
    byTitle.set(path.basename(p.rel, '.md').toLowerCase(), p.rel);
  }
  const edges = new Map();
  const addEdge = (a, b, signal, weight) => {
    if (a === b) return;
    const key = [a, b].sort().join('|');
    const e = edges.get(key) || { a, b, weight: 0, signals: {} };
    e.weight += weight; e.signals[signal] = (e.signals[signal] || 0) + weight;
    edges.set(key, e);
  };
  // Direct wikilinks (x3.0)
  for (const p of pages) for (const l of wikilinks(p.body)) {
    const target = byTitle.get(l.target.toLowerCase()) || byTitle.get(l.target.toLowerCase().replace(/\s+/g, '-'));
    if (target) addEdge(p.rel, target, 'direct', 3.0);
  }
  // Source overlap (x4.0 per shared source) + type affinity (x1.0)
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    const a = pages[i], b = pages[j];
    const shared = a.sources.filter((s) => b.sources.includes(s)).length;
    if (shared) addEdge(a.rel, b.rel, 'source', 4.0 * shared);
    if (a.type === b.type && (a.sources.length || b.sources.length)) addEdge(a.rel, b.rel, 'type', 1.0);
  }
  // Adamic-Adar (x1.5): rarer shared neighbours contribute more.
  const neighbours = new Map(pages.map((p) => [p.rel, new Set()]));
  for (const e of edges.values()) { neighbours.get(e.a)?.add(e.b); neighbours.get(e.b)?.add(e.a); }
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    const a = pages[i].rel, b = pages[j].rel;
    const common = [...(neighbours.get(a) || [])].filter((n) => neighbours.get(b)?.has(n));
    const aa = common.reduce((s, n) => s + 1 / Math.log(Math.max(2, neighbours.get(n).size)), 0);
    if (aa > 0) addEdge(a, b, 'adamic', 1.5 * aa);
  }
  // Label-propagation communities (deterministic approximation of Louvain).
  const labels = new Map(pages.map((p, i) => [p.rel, i]));
  for (let pass = 0; pass < 12; pass++) {
    let changed = 0;
    for (const p of pages) {
      const counts = new Map();
      for (const e of edges.values()) {
        if (e.a === p.rel) counts.set(labels.get(e.b), (counts.get(labels.get(e.b)) || 0) + e.weight);
        if (e.b === p.rel) counts.set(labels.get(e.a), (counts.get(labels.get(e.a)) || 0) + e.weight);
      }
      const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
      if (best && best[0] !== labels.get(p.rel)) { labels.set(p.rel, best[0]); changed++; }
    }
    if (!changed) break;
  }
  const communityOf = new Map(); let ci = 0;
  for (const l of labels.values()) if (!communityOf.has(l)) communityOf.set(l, ci++);
  const nodes = pages.map((p) => ({ id: p.rel, label: p.title, type: p.type, community: communityOf.get(labels.get(p.rel)), degree: [...edges.values()].filter((e) => e.a === p.rel || e.b === p.rel).length, sources: p.sources.length }));
  const edgeList = [...edges.values()].map((e) => ({ ...e, communityCross: communityOf.get(labels.get(e.a)) !== communityOf.get(labels.get(e.b)) }));
  const isolated = nodes.filter((n) => n.degree <= 1).map((n) => n.label);
  const internal = edgeList.filter((e) => !e.communityCross).length;
  const cohesion = edgeList.length ? +(internal / edgeList.length).toFixed(3) : 0;
  const surprising = edgeList.filter((e) => e.communityCross).sort((a, b) => b.weight - a.weight).slice(0, 8).map((e) => ({ from: e.a, to: e.b, weight: +e.weight.toFixed(2), signals: Object.keys(e.signals) }));
  const gaps = [];
  if (isolated.length) gaps.push(`${isolated.length} isolated page(s): ${isolated.slice(0, 8).join(', ')}`);
  if (cohesion < 0.15 && pages.length >= 3) gaps.push(`Low cohesion ${cohesion} — clusters are loosely connected`);
  return { nodes, edges: edgeList, communities: ci, cohesion, insights: { surprising, gaps, isolated } };
}

/* ------------------------------ retrieval -------------------------------- */
export function query(id, question, opts = {}) {
  const pages = listPages(id);
  const g = graph(id);
  const terms = new Set(tokens(question));
  const scored = pages.map((p) => {
    const bodyTerms = tokens(p.body);
    let score = 0;
    for (const t of terms) if (bodyTerms.includes(t)) score += 1;
    for (const t of terms) if (tokens(p.title).includes(t)) score += 10;
    return { page: p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const topK = Math.min(Math.max(1, opts.topK || 6), 50);
  let hits = scored.slice(0, topK);
  // Two-hop graph expansion: pull one related neighbour of each strong hit.
  if (opts.graph !== false) {
    const adj = new Map(pages.map((p) => [p.rel, []]));
    for (const e of g.edges) { adj.get(e.a)?.push({ rel: e.b, w: e.weight }); adj.get(e.b)?.push({ rel: e.a, w: e.weight }); }
    const seen = new Set(hits.map((h) => h.page.rel));
    const expanded = [];
    for (const h of hits.slice(0, 3)) for (const n of (adj.get(h.page.rel) || []).sort((a, b) => b.w - a.w).slice(0, 2)) {
      if (!seen.has(n.rel)) { seen.add(n.rel); const p = pages.find((x) => x.rel === n.rel); if (p) expanded.push({ page: p, score: h.score * 0.4, via: h.page.title }); }
    }
    hits = [...hits, ...expanded].slice(0, topK);
  }
  const budget = Math.min(Math.max(1000, opts.tokenBudget || 16000), 1000000);
  const share = { wiki: 0.6, index: 0.2, system: 0.15, margin: 0.05 };
  const limit = Math.floor(budget * share.wiki * 3.7); // chars ≈ tokens*3.7 for mixed CJK/EN
  const parts = [];
  let used = 0;
  hits.forEach((h, i) => {
    const excerpt = summarize(h.page.body, Math.min(700, Math.max(120, Math.floor(limit / hits.length))));
    if (used + excerpt.length > limit) return;
    used += excerpt.length;
    parts.push(`[${i + 1}] ${h.page.title} (${h.page.type}, ${h.page.rel})\n${excerpt}`);
  });
  const context = `## Retrieved wiki pages\n\n${parts.join('\n\n') || '(no matching pages)'}\n\nAnswer using these sources. Cite as [1], [2] etc. If the pages do not contain the answer, say so plainly.`;
  return { question, hits: hits.map((h, i) => ({ n: i + 1, title: h.page.title, path: h.page.rel, type: h.page.type, score: +h.score.toFixed(2), via: h.via })), context, tokenBudget: budget, allocation: { wiki: Math.floor(budget * share.wiki), index: Math.floor(budget * share.index), system: Math.floor(budget * share.system) } };
}

/* ----------------------------- review / lint ----------------------------- */
export function review(id) {
  const pages = listPages(id);
  const g = graph(id);
  const issues = [];
  for (const p of pages) {
    if (!p.sources.length) issues.push({ severity: 'warning', type: 'unsourced', page: p.rel, message: `${p.title} has no sources[] traceability` });
    const links = wikilinks(p.body);
    const titles = new Set(pages.map((x) => x.title.toLowerCase()));
    for (const l of links) if (!titles.has(l.target.toLowerCase())) issues.push({ severity: 'info', type: 'dangling-link', page: p.rel, message: `${p.rel} links to missing page [[${l.target}]]` });
    if (!p.body || p.body.trim().length < 30) issues.push({ severity: 'warning', type: 'stub', page: p.rel, message: `${p.title} is a stub` });
  }
  for (const n of g.nodes) if (n.degree <= 1) issues.push({ severity: 'info', type: 'orphan', page: n.id, message: `${n.label} has <=1 connection` });
  // crude contradiction detection: same keyphrase with differing numeric claims
  const numeric = new Map();
  for (const p of pages) for (const m of p.body.matchAll(/([^\n。.]{3,40}?)\s*(?:是|为|=|:)\s*(\d+(?:\.\d+)?)\s*(%|倍|万|亿)?/g)) {
    const key = m[1].trim().toLowerCase(); const value = m[2] + (m[3] || '');
    if (!numeric.has(key)) numeric.set(key, new Set()); numeric.get(key).add(`${value} (${p.rel})`);
  }
  for (const [key, vals] of numeric) if (vals.size > 1) issues.push({ severity: 'warning', type: 'possible-contradiction', message: `"${key}" stated differently: ${[...vals].join(' vs ')}` });
  return { pages: pages.length, issues, summary: `${issues.length} issue(s): ${issues.filter((i) => i.severity === 'warning').length} warnings, ${issues.filter((i) => i.severity === 'info').length} informational. ${g.cohesion < 0.15 ? 'Cohesion is low.' : 'Graph cohesion healthy.'}` };
}

/* ------------------------------- export ---------------------------------- */
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8'); const body = Buffer.from(data, 'utf8'); const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(body.length, 24); cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, end]).toString('base64');
}
function unzip(b64) {
  const buf = Buffer.from(b64, 'base64'); const out = [];
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    const size = buf.readUInt32LE(i + 18);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const data = buf.slice(i + 30 + nameLen + extraLen, i + 30 + nameLen + extraLen + size).toString('utf8');
    out.push({ name, data });
    i += 30 + nameLen + extraLen + size;
  }
  if (!out.length) throw new Error('not a valid stored ZIP');
  return out;
}
export function exportVault(id) {
  const dir = requireVault(id); const files = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'config.json' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith('.md')) files.push({ name: r, data: read(p) });
    }
  };
  walk(dir, '');
  return { id, name: path.basename(dir), files: files.length, zipBase64: zip(files), bytes: files.reduce((s, f) => s + Buffer.byteLength(f.data), 0) };
}
export function importVault(name, zipBase64) {
  const id = safeName(name); const dir = vaultDir(id);
  if (fs.existsSync(dir)) throw new Error(`vault already exists: ${id}`);
  for (const k of KINDS) fs.mkdirSync(path.join(dir, 'wiki', k), { recursive: true });
  fs.mkdirSync(path.join(dir, 'raw', 'sources'), { recursive: true });
  const entries = unzip(zipBase64);
  for (const e of entries) {
    const rel = e.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (rel.split('/').includes('..')) throw new Error('ZIP contains path traversal');
    write(path.join(dir, rel), e.data);
  }
  write(path.join(dir, 'config.json'), JSON.stringify({ id, name, createdAt: now(), updatedAt: now(), schemaVersion: 1, imported: true }, null, 2));
  rebuildIndex(id); updateOverview(id);
  return { id, name, files: entries.length };
}

/* ------------------------------ chat pack -------------------------------- */
export function chatPack(id, message, opts = {}) {
  requireVault(id);
  const r = query(id, message, opts);
  const dir = vaultDir(id);
  const session = opts.sessionId || 'default';
  const file = path.join(dir, '.llm-wiki', 'chats', `${safeName(session)}.jsonl`);
  const entry = { at: now(), role: 'user', message, sources: r.hits.map((h) => h.path) };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  return { prompt: r.context, citations: r.hits.map((h) => `[${h.n}] ${h.title} — ${h.path}`), history: fs.readFileSync(file, 'utf8').trim().split('\n').length };
}
