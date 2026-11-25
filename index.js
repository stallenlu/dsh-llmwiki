/**
 * dsh-llmwiki — LLM Wiki for DeepSeek Harness.
 * Clean-room implementation of the nashsu/llm_wiki knowledge model, with an
 * optional bridge to the running desktop app. See README.md for attribution.
 *
 * Host bundle: registers the `llm_wiki` tool and the /api/llm-wiki/ routes.
 */
import * as E from './lib/engine.js';
import * as bridge from './lib/bridge.js';
import { configFromEnv, makeLlm } from './lib/llm.js';
import { makeHandler, describe } from './lib/routes.js';
import * as rules from './lib/wikiRules.js';
import * as hygiene from './lib/hygiene.js';
import { fuseQuery, describeFusion } from './lib/fusion.js';

// P1 of the iwtown fusion: systemPrompt for the always-on compass/rules.
export const inject = ['tools', 'webServer', 'systemPrompt'];

const ROUTE_PREFIX = '/api/llm-wiki/';
const handle = makeHandler();

const description =
  'Maintain a persistent, interlinked personal knowledge wiki (LLM Wiki style): turn documents into ' +
  'an organized wiki of markdown pages with [[wikilinks]], source traceability, a page graph and cited retrieval. ' +
  'This is a native implementation — it works without any external app. ' +
  'Actions: "vaults" list wikis; "createVault" (name, purpose) start one; ' +
  '"ingest" (vault, text, title?, origin?, kind?, generate?) add and index a source (SHA256 dedupe, ' +
  'auto summary/keyphrases, optional AI enrichment); "pages" (vault, kind?) list pages; ' +
  '"readPage" (vault, path) read with links and backlinks; "writePage" (vault, path, content, allowOverwrite?) create/edit; ' +
  '"deletePage" (vault, path) delete and clean inbound links; "graph" (vault) show connections, clusters and gaps; ' +
  '"query" (vault, question, topK?, tokenBudget?) retrieve cited context for a grounded answer; ' +
  '"review" (vault) find unsourced pages, dangling links, stubs, orphans and contradictions; ' +
  '"chat" (vault, message, sessionId?) prepare a cited answer pack; ' +
  '"exportVault"/"importVault" (zipBase64) move wikis as a portable ZIP; ' +
  '"overview"/"reindex" regenerate derived pages; "bridgeStatus"/"bridgeProjects" check an optional running ' +
  'desktop LLM Wiki app. Maintenance: "rate" (vault,path,quality 1..5) score a page; "setAging" (vault,path,archived?,superseded?,recall?) mark aging flags; ' +
  '"staleReview" (vault) list pages worth revisiting; "hygiene" (vault) apply reversible aging decisions; ' +
  '"compileHint" (vault,note?) record a session worth distilling; "profileDigest" (vault) surface candidate user-profile pages WITHOUT writing USER.md; ' +
  '"maintenancePlan" (vault) get a human plan plus an opt-in schedule suggestion; "compass" / "writeRules" read the always-on guide. ' +
  '"fusedQuery" (vault,question) retrieve with lexical + mnemon RRF fusion (degrades gracefully to lexical-only). ' +
  'All results are plain human-readable summaries; exact data is returned alongside. ' +
  'If a query misses, also call mnemon_recall yourself and merge the evidence. ' +
  'Always report the text summary to the user in your own words.';

function llmFor() {
  const cfg = configFromEnv();
  return cfg ? makeLlm(cfg, null) : null;
}

/** Map an action + args to a { text, data } result (engine called directly, no HTTP). */
async function dispatch(action, args, ctx) {
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
    case 'overview': data = E.updateOverview(args.vault); break;
    case 'reindex': data = E.rebuildIndex(args.vault); break;
    case 'bridgeStatus': data = await bridge.status(); break;
    case 'bridgeProjects': data = await bridge.projects(); break;
    // P1 — context compass + writing discipline
    case 'compass': data = { text: rules.compassText(!!args.force) }; break;
    case 'writeRules': data = { text: rules.rulesText() }; break;
    // P2 — self-maintenance / aging (H4: explicit compileHint; no log read)
    case 'rate': data = hygiene.rate(args.vault, args.path, args.quality); break;
    case 'setAging': data = hygiene.setAging(args.vault, args.path, { archived: args.archived, superseded: args.superseded, recall: args.recall }); break;
    case 'staleReview': data = hygiene.staleReview(args.vault, { maxAgeDays: args.maxAgeDays }); break;
    case 'hygiene': data = hygiene.hygiene(args.vault, { archiveSuperseded: args.archiveSuperseded, markLowQuality: args.markLowQuality, maxAgeDays: args.maxAgeDays }); break;
    case 'compileHint': data = hygiene.compileHint(args.vault, args.note); break;
    case 'sessionTick': data = hygiene.sessionTick(); break;
    case 'profileDigest': data = hygiene.profileDigest(args.vault); break;
    case 'maintenancePlan': data = hygiene.maintenancePlan(args.vault); break;
    // P3 — mnemon-assisted fusion retrieval (H3: ctx passed for cross-plugin tools)
    case 'fusedQuery': data = await fuseQuery(ctx, args.vault, args.question, { topK: args.topK, tokenBudget: args.tokenBudget, useMnemon: args.useMnemon !== false }); break;
    default: throw new Error(`unknown action: ${String(action)}`);
  }
  // Reuse the exact same human-language formatter as the HTTP layer.
  return { data, text: action === 'fusedQuery' ? describeFusion(data) : describe(action, data) };
}

export function apply(ctx) {
  // P1: always-on context compass + writing rules in the main Agent's prompt.
  // Kept compact (<=900 chars) and 60s-cached inside wikiRules.compassText.
  ctx.effect(() => {
    if (!ctx.systemPrompt || typeof ctx.systemPrompt.section !== 'function') return () => {};
    return ctx.systemPrompt.section({
      name: 'llmwiki-compass',
      order: 138,
      text: () => `${rules.compassText()}\n\n${rules.rulesText()}`,
    });
  }, 'dsh-llmwiki: compass');

  // P2/H4: lightweight "session ended" mark only — no session-log reading.
  ctx.effect(() => {
    if (typeof ctx.on !== 'function') return () => {};
    return ctx.on('session/disposed', () => { try { hygiene.sessionTick(); } catch { /* never break disposal */ } });
  }, 'dsh-llmwiki: session mark');

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle }),
    'dsh-llmwiki: routes',
  );

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'llm_wiki',
        description,
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['vaults', 'createVault', 'deleteVault', 'ingest', 'pages', 'readPage', 'writePage', 'deletePage', 'graph', 'query', 'review', 'chat', 'exportVault', 'importVault', 'overview', 'reindex', 'bridgeStatus', 'bridgeProjects', 'rate', 'setAging', 'staleReview', 'hygiene', 'compileHint', 'profileDigest', 'maintenancePlan', 'compass', 'writeRules', 'fusedQuery', 'sessionTick'],
            },
            vault: { type: 'string', description: 'Vault id (from "vaults"). Required for most actions.' },
            name: { type: 'string', description: 'Vault name for createVault / importVault.' },
            id: { type: 'string', description: 'Vault id for deleteVault.' },
            purpose: { type: 'string', description: 'Goals/scope for createVault.' },
            text: { type: 'string', description: 'Source text to ingest.' },
            title: { type: 'string', description: 'Document title for ingest.' },
            origin: { type: 'string', description: 'Source URL or provenance for ingest.' },
            kind: { type: 'string', description: 'Page kind for ingest (source/note).' },
            generate: { type: 'boolean', description: 'Enrich the page with the configured LLM (optional).' },
            path: { type: 'string', description: 'Page path within the wiki, e.g. concepts/Photovoltaics.md.' },
            content: { type: 'string', description: 'Full markdown body for writePage.' },
            allowOverwrite: { type: 'boolean', description: 'Allow writePage to replace an existing page.' },
            question: { type: 'string', description: 'Question for query.' },
            message: { type: 'string', description: 'Message for chat.' },
            sessionId: { type: 'string', description: 'Chat session id (default "default").' },
            topK: { type: 'number', description: 'Max retrieved pages for query/chat (default 6).' },
            tokenBudget: { type: 'number', description: 'Retrieval token budget for query (default 16000).' },
            zipBase64: { type: 'string', description: 'Base64 ZIP for importVault.' },
            quality: { type: 'number', description: 'Quality score 1..5 for rate.' },
            archived: { type: 'boolean', description: 'Aging flag for setAging.' },
            superseded: { type: 'boolean', description: 'Aging flag for setAging (replaced by newer knowledge).' },
            recall: { type: 'boolean', description: 'Aging flag for setAging (whether page participates in retrieval).' },
            maxAgeDays: { type: 'number', description: 'Age threshold for staleReview/hygiene (default 90).' },
            note: { type: 'string', description: 'Note for compileHint.' },
            force: { type: 'boolean', description: 'Force refresh of the cached compass section.' },
            useMnemon: { type: 'boolean', description: 'Enable mnemon fusion for fusedQuery (default true).' },
          },
          required: ['action'],
          additionalProperties: false,
        },
        output: {
          schema: { type: 'string' },
          render: (args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
        },
        timeoutMs: 120_000,
        isConcurrencySafe: () => false,
        presentCall: (args) => ({
          card: 'generic',
          title: `LLM Wiki: ${typeof args.action === 'string' ? args.action : 'vaults'}`,
          kind: 'llm-wiki',
          rawInput: args,
        }),
        async execute(args) {
          const action = typeof args.action === 'string' ? args.action : 'vaults';
          const { text, data } = await dispatch(action, args, ctx);
          const summary = text || `${action} completed.`;
          // Return a concise, human-readable string with a compact data appendix.
          const appendix = `\n\n[result] ${JSON.stringify(data).slice(0, 4000)}`;
          return summary + appendix;
        },
      }),
    'dsh-llmwiki: tool',
  );
}
