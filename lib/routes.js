/**
 * HTTP route layer for the LLM Wiki panel.
 * Server computes plain-language results ({ok, text, data}); client only renders.
 * Mirrors the { action, ...payload } -> { ok:true, ... } contract of dsh plugins.
 */
import * as E from './engine.js';
import * as bridge from './bridge.js';
import { configFromEnv, makeLlm } from './llm.js';
import * as hygiene from './hygiene.js';
import * as rules from './wikiRules.js';
import { fuseQuery, describeFusion } from './fusion.js';

const MAX_BODY = 2 * 1024 * 1024; // 2 MB — enough for a decent source document

const sendJson = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0, tooLarge = false;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { tooLarge = true; chunks.length = 0; return; }
    if (!tooLarge) chunks.push(c);
  });
  req.on('end', () => {
    if (tooLarge) return reject(new Error('request body too large (2 MB limit)'));
    if (!chunks.length) return resolve({});
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    } catch { reject(new Error('request body is not valid JSON')); }
  });
  req.on('error', reject);
});

/** Human-language formatter: turn a raw result into a sentence the user can read. */
export function describe(action, data) {
  switch (action) {
    case 'vaults':
      return data.length ? `You have ${data.length} wiki${data.length > 1 ? 's' : ''}: ${data.map((v) => `${v.name} (${v.pages} pages, ${v.sources} sources)`).join('; ')}.`
        : 'No wikis yet. Create your first wiki to start turning documents into a linked knowledge base.';
    case 'createVault':
      return `Created the wiki "${data.name}". It is ready — ingest a source or add a page.`;
    case 'deleteVault':
      return data.message;
    case 'ingest':
      if (data.duplicate) return 'This document was already added (identical content), so nothing new was stored.';
      return `Added "${data.title}" to the wiki. It produced page ${data.page} with ${data.analysis.keyphrases.length} key phrases${data.generated ? ', enriched by your AI model' : ''}. The original is preserved in ${data.source}.`;
    case 'pages':
      return data.length ? `${data.length} page(s) in this wiki: ${data.slice(0, 12).map((p) => p.title).join(', ')}${data.length > 12 ? '…' : ''}.`
        : 'This wiki has no pages yet. Ingest a source to create the first one.';
    case 'readPage':
      return `"${data.frontmatter.title || data.path}" — ${data.body.trim().slice(0, 260)}${data.body.length > 260 ? '…' : ''} It links to ${data.links.length} page(s) and is referenced by ${data.backlinks.length}.`;
    case 'graph':
      return `${data.nodes.length} pages connected by ${data.edges.length} links across ${data.communities} cluster(s). ${data.insights.gaps.length ? 'Worth a look: ' + data.insights.gaps.join('; ') + '.' : 'No obvious gaps — the graph is well connected.'}`;
    case 'query':
      return data.hits.length ? `Found ${data.hits.length} relevant page(s): ${data.hits.map((h) => `[${h.n}] ${h.title}`).join(', ')}. The context is ready for your AI to answer with citations.`
        : 'No pages matched that question. Try different words or ingest more sources.';
    case 'review':
      return `${data.pages} pages checked. ${data.summary}`;
    case 'chat':
      return `Prepared an answer pack with ${data.citations.length} cited source(s): ${data.citations.join('; ')}. Hand the prompt to your AI for a grounded answer.`;
    case 'exportVault':
      return `Exported ${data.files} files (${Math.round(data.bytes / 1024)} KB) as a portable ZIP. Save the download to back up or move this wiki.`;
    case 'importVault':
      return `Imported "${data.name}" with ${data.files} files. The wiki is indexed and ready.`;
    case 'bridgeStatus':
      return data.available ? `The desktop LLM Wiki app is connected (${data.base}). You can also use its projects directly.`
        : `No desktop app is running at ${data.base}. That is fine — this plugin's wikis work entirely on their own.`;
    case 'bridgeProjects':
      return data.message;
    case 'bridgeCall':
      return data.message || JSON.stringify(data).slice(0, 300);
    case 'writePage':
      return `页面 "${data.title}" 已保存（${data.path}）。${(data.hints || []).length ? '提醒：' + data.hints.join(' ') : '来源与双链都齐全，写得不错。'}`;
    case 'rate':
      return `已把「${data.title}」的质量评分设为 ${data.quality_score}/5。这个分数会影响检索排序和陈旧体检。`;
    case 'setAging':
      return `已更新「${data.title}」的老化标记：${Object.entries(data.flags).map(([k, v]) => `${k}=${v}`).join('、')}。`;
    case 'staleReview':
      return data.stale.length
        ? `${data.total} 页里有 ${data.stale.length} 页值得复查。最该先看的是「${data.stale[0].title}」：${data.stale[0].why}。`
        : `${data.total} 页都还新鲜，没有需要复查的页面。`;
    case 'hygiene':
      return data.hint;
    case 'compileHint':
      return `已记下这次沉淀线索（${data.pages} 页的知识库，备注已保存）。把值得保留的结论写进 wiki 或交给 mnemon 前，-agent 应先确认内容。`;
    case 'sessionTick':
      return `已记录会话结束时间；没有读取任何会话日志。`;
    case 'profileDigest':
      return data.text;
    case 'maintenancePlan':
      return `${data.text} ${data.note}`;
    case 'compass':
      return data.text;
    case 'writeRules':
      return data.text;
    case 'fusedQuery':
      return describeFusion(data);
    default: return 'Done.';
  }
}

/** Resolve an optional LLM for two-step ingest. Credentials never enter the response. */
function llmFor() {
  const cfg = configFromEnv();
  if (!cfg) return null;
  return makeLlm(cfg, null);
}

export function makeHandler() {
  return async function handle(req, res) {
    let payload = {};
    try { payload = await readBody(req); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message, code: 'bad-body' }); }
    const { action, ...args } = payload;
    try {
      let data;
      switch (action) {
        case 'vaults': data = E.vaults(); break;
        case 'createVault': data = E.createVault(args.name, args.purpose); break;
        case 'deleteVault': data = E.deleteVault(args.id); break;
        case 'ingest':
          data = await E.ingest(args.vault, { title: args.title, origin: args.origin, text: args.text, kind: args.kind, generate: !!args.generate, llm: args.generate ? llmFor() : null });
          data.title = args.title || args.origin || 'source';
          break;
        case 'pages': data = E.listPages(args.vault, args.kind); break;
        case 'readPage': data = E.readPage(args.vault, args.path); break;
        case 'writePage': data = E.writePage(args.vault, args.path, args.content, { allowOverwrite: !!args.allowOverwrite }); break;
        case 'deletePage': data = E.deletePage(args.vault, args.path); break;
        case 'graph': data = E.graph(args.vault); break;
        case 'query': data = E.query(args.vault, args.question, { topK: args.topK, tokenBudget: args.tokenBudget }); break;
        case 'review': data = E.review(args.vault); break;
        case 'chat': data = E.chatPack(args.vault, args.message, { sessionId: args.sessionId, topK: args.topK }); break;
        case 'exportVault': data = E.exportVault(args.vault); break;
        case 'importVault': data = E.importVault(args.name, args.zipBase64); break;
        case 'bridgeStatus': data = await bridge.status(); break;
        case 'bridgeProjects': data = await bridge.projects(); break;
        case 'bridgeCall': data = await bridge.proxy(args.bridgeAction, args.params); break;
        case 'overview': data = E.updateOverview(args.vault); break;
        case 'reindex': data = E.rebuildIndex(args.vault); break;
        // P1 — context compass + writing discipline
        case 'compass': data = { text: rules.compassText(!!args.force) }; break;
        case 'writeRules': data = { text: rules.rulesText() }; break;
        // P2 — self-maintenance / aging
        case 'rate': data = hygiene.rate(args.vault, args.path, args.quality); break;
        case 'setAging': data = hygiene.setAging(args.vault, args.path, { archived: args.archived, superseded: args.superseded, recall: args.recall }); break;
        case 'staleReview': data = hygiene.staleReview(args.vault, { maxAgeDays: args.maxAgeDays }); break;
        case 'hygiene': data = hygiene.hygiene(args.vault, { archiveSuperseded: args.archiveSuperseded, markLowQuality: args.markLowQuality, maxAgeDays: args.maxAgeDays }); break;
        case 'compileHint': data = hygiene.compileHint(args.vault, args.note); break;
        case 'sessionTick': data = hygiene.sessionTick(); break;
        case 'profileDigest': data = hygiene.profileDigest(args.vault); break;
        case 'maintenancePlan': data = hygiene.maintenancePlan(args.vault); break;
        // P3 — mnemon-assisted fusion retrieval
        case 'fusedQuery': data = await fuseQuery(null, args.vault, args.question, { topK: args.topK, tokenBudget: args.tokenBudget, useMnemon: args.useMnemon !== false }); break;
        default: throw new Error(`unknown action: ${String(action)}`);
      }
      const text = describe(action, data);
      sendJson(res, 200, { ok: true, action, text, data });
    } catch (e) {
      sendJson(res, 200, { ok: false, action, error: String(e.message || e) });
    }
  };
}
