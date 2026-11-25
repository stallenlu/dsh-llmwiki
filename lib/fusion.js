/**
 * mnemon-assisted retrieval fusion (P3 of the iwtown fusion).
 * Logic inspired by iwtown/dsh-llm-wiki wiki-retrieval.mjs (MIT, iwtown):
 * RRF(K=5, WB=1.0, WM=0.5, TITLE_BOOST=4) + quality/freshness re-rank.
 * No upstream code is copied. See README.md for attribution.
 *
 * Review fix H3: index.js:123 execute(args) has no `agent` parameter and the
 * HTTP route has none either, so we call tools.get(name) WITHOUT an agent
 * scope and degrade to pure lexical retrieval if it is unavailable. The tool
 * description additionally tells the Agent to call mnemon_recall itself.
 *
 * This module never hard-depends on dsh-mnemon: if the tool is missing or
 * throws, `recall()` returns an empty list and `fuse()` returns the lexical
 * results unchanged.
 */
import * as E from './engine.js';
import { rerankScore } from './hygiene.js';

const RRF_K = 5;
const WB = 1.0;  // weight: BM25 / lexical rank
const WM = 0.5;  // weight: mnemon rank
const TITLE_BOOST = 4;

/** Number of CJK/EN tokens shared (a cheap BM25-ish overlap score with IDF). */
function lexicalScore(question, page, df, N) {
  const qTokens = new Set(question.toLowerCase().match(/[a-z][a-z0-9_-]{1,}|[\u4e00-\u9fff]{2}/g) || []);
  const bodyTokens = String(page.body).toLowerCase().match(/[a-z][a-z0-9_-]{1,}|[\u4e00-\u9fff]{2}/g) || [];
  const tf = new Map();
  for (const t of bodyTokens) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  const k1 = 1.2, b = 0.75;
  const len = Math.max(1, bodyTokens.length);
  const avg = 220;
  for (const t of qTokens) {
    const f = tf.get(t) || 0;
    if (!f) continue;
    const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
    score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * len / avg));
    if (String(page.title).toLowerCase().includes(t)) score += TITLE_BOOST;
  }
  return score;
}

/**
 * Locate and execute the host tool named `name` without an agent scope.
 * Mirrors dsh-mnemon/lib/index.js:9421-9440 executeHostTool: if the host
 * exposes setExecutor, use the batch `tools.execute({calls:[...]})` form;
 * otherwise call `tools.execute(input)` directly.
 */
export async function callHostTool(ctx, name, input, timeoutMs = 8000) {
  const tools = ctx && typeof ctx.get === 'function' ? ctx.get('tools') : null;
  if (!tools || typeof tools.get !== 'function' || typeof tools.execute !== 'function') {
    return { ok: false, reason: 'tools service unavailable' };
  }
  const tool = tools.get(name);
  if (!tool) return { ok: false, reason: `tool ${name} not registered` };
  try {
    let result;
    if (typeof tools.setExecutor === 'function') {
      const batch = await tools.execute({
        calls: [{ type: 'tool-call', id: `llw-${Date.now()}`, name, arguments: JSON.stringify(input || {}) }],
      });
      result = Array.isArray(batch?.results) ? batch.results[0]?.result : undefined;
    } else {
      result = await tools.execute({ name, arguments: input || {} });
    }
    return { ok: true, result };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

/** Parse mnemon_recall output (string or object) into [{text, path?, score?}]. */
function parseRecall(result) {
  if (!result) return [];
  let text = typeof result === 'string' ? result : (result.text || result.output || JSON.stringify(result));
  if (Array.isArray(result)) text = result.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n');
  text = String(text).slice(0, 6000);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= 8);
  if (!lines.length) return [];
  return lines.slice(0, 12).map((line) => {
    const m = /（来源[:：]\s*([^）)]+)）/.exec(line);
    return { text: line.replace(/（来源[:：][^）)]+）/, '').trim().slice(0, 400), path: m ? m[1].trim() : null };
  });
}

/**
 * Ask mnemon_recall for supplementary evidence. Always degrades gracefully.
 */
export async function mnemonRecall(ctx, question, limit = 8) {
  const r = await callHostTool(ctx, 'mnemon_recall', { query: question, limit, mode: 'smart' });
  if (!r.ok) return { ok: false, reason: r.reason, items: [] };
  return { ok: true, items: parseRecall(r.result) };
}

/**
 * Fuse lexical wiki hits with mnemon evidence using Reciprocal Rank Fusion.
 * Returns the same shape as engine.query() plus an explicit `fusion` field.
 */
export async function fuseQuery(ctx, id, question, opts = {}) {
  const lexical = E.query(id, question, { ...opts, graph: opts.graph !== false });
  const recall = opts.useMnemon === false ? { ok: false, reason: 'disabled', items: [] } : await mnemonRecall(ctx, question, opts.mnemonLimit || 8);
  if (!recall.ok || !recall.items.length) {
    return {
      ...lexical,
      fusion: { used: false, reason: recall.reason || 'no mnemon evidence', strategy: 'lexical-only' },
    };
  }
  const pages = E.listPages(id);
  const df = new Map();
  for (const p of pages) for (const t of new Set(String(p.body).toLowerCase().match(/[a-z][a-z0-9_-]{1,}|[\u4e00-\u9fff]{2}/g) || [])) df.set(t, (df.get(t) || 0) + 1);
  const lexicalRank = new Map(lexical.hits.map((h, i) => [h.path, i + 1]));
  const memoryRank = new Map();
  recall.items.forEach((it, i) => {
    if (!it.path) return;
    const matched = pages.find((p) => it.path.includes(p.rel.replace(/\.md$/, '')) || p.rel.includes(it.path.replace(/\\/g, '/')));
    if (matched) memoryRank.set(matched.rel, Math.min(memoryRank.get(matched.rel) || 99, i + 1));
  });
  const fused = pages.map((p) => {
    const lr = lexicalRank.get(p.rel), mr = memoryRank.get(p.rel);
    if (!lr && !mr) return null;
    let rrf = 0;
    if (lr) rrf += WB / (RRF_K + lr);
    if (mr) rrf += WM / (RRF_K + mr);
    const bScore = lexicalScore(question, p, df, pages.length);
    const m = E.readPage(id, p.rel).frontmatter || {};
    return { page: p, rrf, bScore, rerank: rerankScore(m) };
  }).filter(Boolean).map((x) => ({ ...x, final: x.rrf * x.rerank })).sort((a, b) => b.final - a.final);
  const topK = Math.min(Math.max(1, opts.topK || 6), 50);
  const hits = fused.slice(0, topK).map((x, i) => ({ n: i + 1, title: x.page.title, path: x.page.rel, type: x.page.type, score: +x.final.toFixed(4), via: memoryRank.has(x.page.rel) && !lexicalRank.has(x.page.rel) ? 'mnemon' : undefined }));
  const used = hits.filter((h) => h.via === 'mnemon').length;
  const parts = hits.slice(0, 6).map((h, i) => {
    const p = pages.find((x) => x.rel === h.path);
    return `[${i + 1}] ${p.title} (${p.type}, ${p.rel})\n${String(p.body).slice(0, 500)}`;
  });
  const context = `## Retrieved wiki pages (lexical + mnemon fusion)\n\n${parts.join('\n\n') || '(no matching pages)'}\n\nAnswer using these sources. Cite as [1], [2].`;
  return {
    question,
    hits,
    context,
    tokenBudget: lexical.tokenBudget,
    allocation: lexical.allocation,
    fusion: {
      used: true,
      strategy: 'rrf+rerank',
      K: RRF_K, WB, WM, TITLE_BOOST,
      mnemonItems: recall.items.length,
      promotedByMnemon: used,
      note: '词法命中与 mnemon 记忆按 RRF 合并，再按质量/新鲜度重排。',
    },
  };
}

/** Human-language summary for the RRF-fused query result. */
export function describeFusion(data) {
  if (!data.fusion || !data.fusion.used) {
    return `${data.hits.length} 条命中（仅词法检索：${data.fusion?.reason || '无 mnemon 证据'}）。上下文已按 [n] 引用整理完毕。`;
  }
  return `融合检索完成：${data.hits.length} 条命中，其中 ${data.fusion.promotedByMnemon} 条由 mnemon 记忆提升；已按质量和新鲜度重排，返回带 [n] 引用的上下文。`;
}
