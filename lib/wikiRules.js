/**
 * Wiki writing discipline + context compass.
 * P1 of the iwtown fusion: let the Agent always know the wiki exists, and
 * give it a compact, hard-to-ignore rulebook for writing good pages.
 *
 * Design notes (honest boundaries):
 * - We use SCALAR frontmatter fields only. iwtown's OKF v0.2 `sources[]`
 *   object arrays are NOT parsed here: engine.js:27-49 parseFrontmatter only
 *   handles scalars / string arrays / `- list` lines. Changing that would
 *   break every existing wiki (review finding H1).
 * - Rules are a soft prompt layer; the engine still enforces what it can
 *   (dedupe via SHA256, path safety, kind whitelist). This is the D3
 *   "double layer" path from PLAN-FUSION.md section 3.
 */
import * as E from './engine.js';

/** 11 Chinese categories from iwtown mapped onto our 6 internal kinds. */
export const CATEGORIES = [
  { zh: '决策', en: 'decision', kind: 'entities' },
  { zh: '发现', en: 'finding', kind: 'sources' },
  { zh: '概念', en: 'concept', kind: 'concepts' },
  { zh: '项目', en: 'project', kind: 'entities' },
  { zh: '流程', en: 'process', kind: 'synthesis' },
  { zh: '命令', en: 'command', kind: 'queries' },
  { zh: '规则', en: 'rule', kind: 'concepts' },
  { zh: '提示', en: 'tip', kind: 'synthesis' },
  { zh: '引用', en: 'reference', kind: 'sources' },
  { zh: '比较', en: 'comparison', kind: 'comparisons' },
  { zh: '人物', en: 'person', kind: 'entities' },
];

const MAX_COMPASS_CHARS = 900; // hard token ceiling for the always-on section

/** Compact rule text injected into the main Agent's system prompt. */
export function rulesText() {
  return [
    'LLM Wiki 使用纪律（本工作区的 llm_wiki 工具）：',
    '1. 写任何 wiki 页面之前，先用 llm_wiki(action:"query") 查重；已有页面用 writePage 更新，不要新建重复页。',
    '2. 每页 frontmatter 必须有 sources（可追溯到原始来源）与至少 2 个 [[双链]]；只有 1 个或 0 个链接的页会被视为孤立页。',
    '3. 优先引用旧知识：新页应当链接到既有页；确实没有关联时在正文说明原因。',
    '4. 页面老化：过时页把 superseded: true 标为已被取代，不再有用的页标 archived: true，质量用 quality_score: 1..5。',
    '5. 检索时先 llm_wiki(action:"query")；若命中不足，再调用 mnemon_recall 做二次召回，合并后按 [n] 引用。',
    '6. 所有 llm_wiki 返回的 text 已经是给人看的话，直接转述；不要向用户暴露 JSON 原文。',
  ].join('\n');
}

/** Lightweight compass: active vault + index outline + pointer to the tool. Uses a 60s cache. */
let cache = { at: 0, value: '' };
export function compassText(force = false) {
  const now = Date.now();
  if (!force && now - cache.at < 60_000 && cache.value) return cache.value;
  let value;
  try {
    const vs = E.vaults();
    if (!vs.length) {
      value = 'LLM Wiki：本工作区还没有知识库。需要沉淀长期知识时，用 llm_wiki(action:"createVault") 新建。';
    } else {
      const active = vs[0];
      let outline = '';
      try {
        const idx = E.readPage(active.id, 'index.md');
        outline = String(idx.body || '')
          .split('\n')
          .filter((l) => /^#{1,3}\s/.test(l))
          .slice(0, 14)
          .map((l) => l.replace(/^#+\s*/, '').trim())
          .join(' / ');
      } catch { /* index may be absent in an imported vault */ }
      value = [
        `LLM Wiki 知识库：${vs.map((v) => v.name).join('、')}。`,
        `当前库「${active.name}」有 ${active.pages} 页。`,
        outline ? `大纲：${outline}。` : '',
        '需要写入、检索、体检或生成图谱时用 llm_wiki 工具（action: vaults/createVault/ingest/pages/readPage/writePage/graph/query/review/maintenancePlan）。',
      ].filter(Boolean).join(' ');
    }
  } catch (e) {
    value = 'LLM Wiki 工具可用；用 llm_wiki(action:"vaults") 查看现有知识库。';
  }
  if (value.length > MAX_COMPASS_CHARS) value = value.slice(0, MAX_COMPASS_CHARS - 1) + '…';
  cache = { at: now, value };
  return value;
}

/**
 * Engine-side write discipline check. Returns human-readable hints, never throws
 * on content issues (a missing hint is not a reason to reject a page).
 */
export function checkWrite(content, pages = []) {
  const hints = [];
  const { data, body } = E.parseFrontmatter(String(content || ''));
  const sources = Array.isArray(data.sources) ? data.sources : data.sources ? [data.sources] : [];
  if (!sources.length) hints.push('这一页没有 sources，日后无法追溯它的原始出处；建议补上来源路径或链接。');
  const links = E.wikilinks(body);
  const unique = new Set(links.map((l) => l.target.toLowerCase()));
  if (unique.size < 2) hints.push(`这一页只有 ${unique.size} 个 [[双链]]，容易被图谱视为孤立节点；建议至少引用 2 个相关页面。`);
  const bodyTokens = new Set(String(body).toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z][a-z0-9_-]{1,}/g) || []);
  const dup = pages.find((p) => {
    const ts = String(p.body).toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z][a-z0-9_-]{1,}/g) || [];
    const overlap = ts.filter((t) => bodyTokens.has(t)).length / Math.max(1, ts.length);
    return overlap > 0.85 && Math.abs(String(p.body).length - String(body).length) < 120;
  });
  if (dup) hints.push(`内容与已有页面「${dup.title}」高度相似（${dup.path}）；建议更新旧页而不是新建。`);
  return { hints, sources: sources.length, links: unique.size, duplicateOf: dup ? dup.path : null };
}
