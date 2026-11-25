window.__ModuleLoader__.load({
  id: 'dsh-llmwiki',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;
    const NS = 'dsh-llmwiki';
    const ROUTE = '/api/llm-wiki/';
    const PANEL_ID = 'dsh-llmwiki';

    // Static client factories receive ONLY `require`. Inject our own stylesheet;
    // never rely on `styles`/`host`/`harness`, and guard against boot failures.
    const CSS = `
.llw-root{
  /* Palette mirrors dsh-mnemon's --mn-* semantic map (dsh-mnemon/lib/client.js:8745).
     Every value is a host --dsw-alias-* token + literal fallback: matches DSH light/dark
     automatically, invents no token names, and drops the previous purple scheme. */
  --llw-bg:var(--dsw-alias-bg-base,#ffffff);
  --llw-bg2:var(--dsw-alias-bg-module-platform,#f5f6f8);
  --llw-layer:var(--dsw-alias-bg-layer-1,#ffffff);
  --llw-line:var(--dsw-alias-border-l2,#e3e5e8);
  --llw-line-strong:var(--dsw-alias-border-l3,#d3d6da);
  --llw-text:var(--dsw-alias-label-primary,#0f1115);
  --llw-mut:var(--dsw-alias-label-secondary,#61666b);
  --llw-faint:var(--dsw-alias-label-tertiary,#9aa0a8);
  --llw-accent:var(--dsw-alias-state-business-primary,#2563eb);
  --llw-hover:var(--dsw-alias-interactive-bg-hover,#f0f1f3);
  --llw-ok:var(--dsw-alias-state-success-primary,#16a34a);
  --llw-warn:var(--dsw-alias-state-warn-primary,#d97706);
  --llw-err:var(--dsw-alias-state-error-primary,#e11d48);
  --llw-focus:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#2563eb));
  --llw-code:var(--dsw-font-mono,ui-monospace,Consolas,monospace);
  --llw-sans:var(--dsw-font-family,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif);
  --llw-r:var(--dsw-radius-md,10px);
  color:var(--llw-text);background:var(--llw-bg);font:13px/1.6 var(--llw-sans);padding:18px;overflow:auto;height:100%;box-sizing:border-box}
.llw-root :focus-visible{outline:2px solid var(--llw-focus);outline-offset:2px}
.llw-h{display:flex;align-items:center;gap:10px;margin:0 0 4px;font-size:16px;font-weight:650}
.llw-logo{width:22px;height:22px;flex:0 0 22px}
.llw-sub{color:var(--llw-mut);font-size:12px;margin:0 0 16px;line-height:1.5}
.llw-tabs{display:flex;gap:4px;border-bottom:1px solid var(--llw-line);margin-bottom:16px;flex-wrap:wrap}
.llw-tab{padding:7px 12px;border:0;background:transparent;color:var(--llw-mut);font-size:12.5px;cursor:pointer;border-bottom:2px solid transparent}
.llw-tab[data-on="1"]{color:var(--llw-text);font-weight:600;border-bottom-color:var(--llw-accent)}
.llw-card{border:1px solid var(--llw-line);border-radius:var(--llw-r);padding:14px;margin-bottom:14px;background:var(--llw-bg2)}
.llw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.llw-row:last-child{margin-bottom:0}
.llw-grow{flex:1;min-width:140px}
.llw-lbl{display:block;font-size:11px;color:var(--llw-mut);margin:0 0 4px}
.llw-root input,.llw-root select,.llw-root textarea{font-family:inherit;font-size:12.5px;color:var(--llw-text);background:var(--llw-layer);border:.5px solid var(--llw-line-strong);border-radius:var(--dsw-radius-md,8px);padding:7px 9px;width:100%;box-sizing:border-box}
.llw-root textarea{resize:vertical;min-height:88px;line-height:1.5}
.llw-root button.llw-btn{border:.5px solid var(--llw-line-strong);background:var(--llw-layer);color:var(--llw-text);border-radius:var(--dsw-radius-md,8px);padding:7px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;transition:background-color .12s,border-color .12s}
.llw-root button.llw-btn:hover{background:var(--llw-hover)}
.llw-root button.llw-pri{background:var(--llw-accent);border-color:var(--llw-accent);color:#fff;font-weight:600}
.llw-root button.llw-btn:disabled{opacity:.45;cursor:default}
.llw-list{list-style:none;margin:0;padding:0}
.llw-item{padding:8px 10px;border-bottom:.5px solid var(--llw-line);display:flex;justify-content:space-between;gap:8px;align-items:center}
.llw-item:last-child{border-bottom:0}
.llw-tag{font-size:10px;color:var(--llw-accent);background:color-mix(in srgb,var(--llw-accent) 12%,transparent);border-radius:999px;padding:2px 8px}
.llw-msg{padding:10px 12px;border-radius:var(--dsw-radius-md,8px);background:color-mix(in srgb,var(--llw-accent) 6%,transparent);border:.5px solid var(--llw-line);line-height:1.6;margin-bottom:12px;white-space:pre-wrap}
.llw-msg[data-kind="err"]{border-color:var(--llw-err);color:var(--llw-err)}
.llw-sm{font-size:11px;color:var(--llw-faint)}
.llw-code{font-family:var(--llw-code);font-size:11.5px;background:var(--llw-bg2);border:.5px solid var(--llw-line);border-radius:var(--dsw-radius-md,8px);padding:12px;white-space:pre-wrap;word-break:break-word;line-height:1.55;max-height:360px;overflow:auto}
.llw-empty{padding:26px;text-align:center;color:var(--llw-faint);font-size:12px}
`;

    function injectStyle(doc) {
      try {
        const target = doc || (typeof document === 'undefined' ? null : document);
        if (!target || !target.head) return;
        if (target.querySelector('style[data-llw]')) return;
        const el = target.createElement('style');
        el.setAttribute('data-llw', '1');
        el.textContent = CSS;
        target.head.appendChild(el);
      } catch (_) { /* never let styling break boot */ }
    }

    async function call(action, payload) {
      const res = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(payload || {}) }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error('HTTP ' + res.status); }
      if (!res.ok || !data || data.ok !== true) throw new Error((data && data.error) || ('HTTP ' + res.status));
      return data;
    }

    const zh = {
      vaults: '知识库', ingest: '导入', pages: '页面', graph: '图谱', ask: '检索问答', review: '体检', maintain: '维护',
      create: '新建知识库', name: '名称', purpose: '目标 / 用途', createBtn: '创建',
      staleBtn: '陈旧页复查', hygieneBtn: '一键整理', digestBtn: '画像线索', planBtn: '维护计划', hintBtn: '记录沉淀线索',
      fusedAsk: '融合检索（含 mnemon）',
      vault: '知识库', title: '标题', source: '来源链接', text: '文档内容', addBtn: '导入并建页',
      enrich: '用 AI 丰富页面（需配置 LLM）', pageList: '页面列表', read: '读取', refresh: '刷新',
      question: '你的问题', askBtn: '检索上下文', reviewBtn: '开始体检',
      noVault: '还没有知识库。切到「知识库」新建一个，然后导入文档。',
      tip: '文档按 LLM Wiki 模型组织：原始来源不可变，wiki 页面带 [[双链]] 与来源追溯，可检索、可成图。',
      bridge: '桌面版连接', bridgeBtn: '检查桌面版 LLM Wiki',
    };
    const en = {
      vaults: 'Wikis', ingest: 'Ingest', pages: 'Pages', graph: 'Graph', ask: 'Ask', review: 'Review', maintain: 'Maintain',
      create: 'New wiki', name: 'Name', purpose: 'Goals / scope', createBtn: 'Create',
      staleBtn: 'Stale review', hygieneBtn: 'Tidy up', digestBtn: 'Profile clues', planBtn: 'Maintenance plan', hintBtn: 'Record distillation hint',
      fusedAsk: 'Fusion search (with mnemon)',
      vault: 'Wiki', title: 'Title', source: 'Source URL', text: 'Document text', addBtn: 'Add & build page',
      enrich: 'Enrich page with AI (needs LLM config)', pageList: 'Pages', read: 'Read', refresh: 'Refresh',
      question: 'Your question', askBtn: 'Get context', reviewBtn: 'Run review',
      noVault: 'No wiki yet. Create one under "Wikis", then ingest a document.',
      tip: 'Documents follow the LLM Wiki model: immutable raw sources, wiki pages with [[wikilinks]] and source traceability, searchable and graphable.',
      bridge: 'Desktop app', bridgeBtn: 'Check desktop LLM Wiki',
    };

    function App() {
      const [lang, setLang] = useState('zh');
      const t = lang === 'zh' ? zh : en;
      const [tab, setTab] = useState('vaults');
      const [vaults, setVaults] = useState([]);
      const [vault, setVault] = useState('');
      const [msg, setMsg] = useState('');
      const [busy, setBusy] = useState(false);
      const [result, setResult] = useState('');
      const [pages, setPages] = useState([]);
      const [graph, setGraph] = useState(null);
      // form states
      const [name, setName] = useState('');
      const [purpose, setPurpose] = useState('');
      const [title, setTitle] = useState('');
      const [origin, setOrigin] = useState('');
      const [text, setText] = useState('');
      const [generate, setGenerate] = useState(false);
      const [question, setQuestion] = useState('');
      const [useFusion, setUseFusion] = useState(true);
      const [hintNote, setHintNote] = useState('');

      const loadVaults = useCallback(async () => {
        try {
          const r = await call('vaults');
          setVaults(r.data || []);
          if (!vault && r.data && r.data.length) setVault(r.data[0].id);
        } catch (e) { setMsg(e.message); }
      }, [vault]);

      useEffect(() => { injectStyle(); loadVaults(); }, []);

      const run = async (action, payload, onDone) => {
        setBusy(true); setMsg(''); setResult('');
        try {
          const r = await call(action, payload);
          setMsg(r.text || 'OK');
          if (onDone) onDone(r.data);
          await loadVaults();
        } catch (e) { setMsg(e.message); }
        finally { setBusy(false); }
      };

      const doCreate = () => run('createVault', { name, purpose }, (d) => { setVault(d.id); setName(''); setPurpose(''); });
      const doIngest = () => run('ingest', { vault, text, title, origin, generate }, () => { setText(''); setTitle(''); setOrigin(''); });
      const doPages = () => run('pages', { vault }, (d) => setPages(d || []));
      const doGraph = () => run('graph', { vault }, (d) => setGraph(d));
      const doAsk = () => run(useFusion ? 'fusedQuery' : 'query', { vault, question }, (d) => setResult(d.context || ''));
      const doReview = () => run('review', { vault }, (d) => setResult((d.issues || []).map((i) => `[${i.severity}] ${i.type}: ${i.message}`).join('\n') || d.summary));
      const doRead = (p) => run('readPage', { vault, path: p.rel || p.path }, (d) => setResult((d.frontmatter && d.frontmatter.title ? '# ' + d.frontmatter.title + '\n\n' : '') + d.body));
      // Maintenance actions — the server computes all human wording; we only display r.text / r.data.
      const doStale = () => run('staleReview', { vault }, (d) => setResult((d.stale || []).map((s) => `• ${s.title} — ${s.why}`).join('\n') || '没有需要复查的页面。'));
      const doHygiene = () => run('hygiene', { vault }, () => {});
      const doDigest = () => run('profileDigest', { vault }, (d) => setResult((d.candidates || []).map((c) => `• ${c.title} (${c.page})`).join('\n') || '没有画像候选页。'));
      const doPlan = () => run('maintenancePlan', { vault }, (d) => setResult(d.scheduleSuggestion ? `${d.text}\n\n建议任务：${d.scheduleSuggestion.title}\n${d.scheduleSuggestion.prompt}` : d.text));
      const doHint = () => run('compileHint', { vault, note: hintNote }, () => setHintNote(''));

      return h('div', { className: 'llw-root' },
        h('div', { className: 'llw-h' },
          h('img', { className: 'llw-logo', src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5" fill="%23a855f7"/><circle cx="18" cy="7" r="2" fill="%233b82f6"/><circle cx="12" cy="18" r="2.5" fill="%2322c55e"/><path d="M8 7L16 8M7 8l4 8M17 9l-4 7" stroke="%239aa0a8" stroke-width="1.2"/></svg>' }),
          'LLM Wiki',
          h('button', { className: 'llw-btn', style: { marginLeft: 'auto', padding: '3px 9px', fontSize: 11 }, onClick: () => setLang(lang === 'zh' ? 'en' : 'zh') }, lang === 'zh' ? 'EN' : '中文'),
        ),
        h('p', { className: 'llw-sub' }, t.tip),
        h('div', { className: 'llw-tabs' },
          ['vaults', 'ingest', 'pages', 'graph', 'ask', 'review', 'maintain'].map((k) =>
            h('button', { key: k, className: 'llw-tab', 'data-on': tab === k ? '1' : '0', onClick: () => setTab(k) }, t[k]),
          ),
        ),
        h('div', { className: 'llw-row' },
          h('span', { className: 'llw-lbl' }, t.vault),
          h('select', { className: 'llw-grow', value: vault, onChange: (e) => { setVault(e.target.value); setResult(''); setPages([]); setGraph(null); } },
            h('option', { value: '' }, '—'),
            vaults.map((v) => h('option', { key: v.id, value: v.id }, `${v.name} (${v.pages}p)`)),
          ),
        ),
        msg ? h('div', { className: 'llw-msg', 'data-kind': (msg.startsWith('No ') || msg.startsWith('vault') || msg.startsWith('unknown')) ? 'err' : 'ok' }, msg) : null,

        tab === 'vaults' ? h('div', { className: 'llw-card' },
          h('div', { className: 'llw-row' },
            h('div', { className: 'llw-grow' }, h('label', { className: 'llw-lbl' }, t.name), h('input', { value: name, onChange: (e) => setName(e.target.value), placeholder: 'e.g. Research Notes' })),
            h('div', { className: 'llw-grow' }, h('label', { className: 'llw-lbl' }, t.purpose), h('input', { value: purpose, onChange: (e) => setPurpose(e.target.value), placeholder: 'What questions should it answer?' })),
          ),
          h('div', { className: 'llw-row' },
            h('button', { className: 'llw-btn llw-pri', disabled: busy || !name.trim(), onClick: doCreate }, t.createBtn),
            h('button', { className: 'llw-btn', disabled: busy, onClick: loadVaults }, t.refresh),
          ),
          h('ul', { className: 'llw-list', style: { marginTop: 12 } }, vaults.length === 0
            ? h('li', { className: 'llw-empty' }, t.noVault)
            : vaults.map((v) => h('li', { key: v.id, className: 'llw-item' },
                h('span', null, v.name, h('span', { className: 'llw-sm' }, ` · ${v.pages} pages · ${v.sources} sources`)),
                h('span', { className: 'llw-tag' }, v.id),
              )),
          ),
          h('div', { style: { marginTop: 14, borderTop: '1px solid var(--llw-line)', paddingTop: 12 } },
            h('button', { className: 'llw-btn', disabled: busy, onClick: () => run('bridgeStatus', {}) }, t.bridgeBtn),
          ),
        ) : null,

        tab === 'ingest' ? h('div', { className: 'llw-card' },
          !vault ? h('div', { className: 'llw-empty' }, t.noVault) : h('div', null,
            h('div', { className: 'llw-row' },
              h('div', { className: 'llw-grow' }, h('label', { className: 'llw-lbl' }, t.title), h('input', { value: title, onChange: (e) => setTitle(e.target.value), placeholder: 'Document title' })),
              h('div', { className: 'llw-grow' }, h('label', { className: 'llw-lbl' }, t.source), h('input', { value: origin, onChange: (e) => setOrigin(e.target.value), placeholder: 'https://…' })),
            ),
            h('label', { className: 'llw-lbl' }, t.text),
            h('textarea', { value: text, onChange: (e) => setText(e.target.value), placeholder: 'Paste article, notes, or any text…' }),
            h('div', { className: 'llw-row', style: { marginTop: 10 } },
              h('label', { className: 'llw-sm', style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
                h('input', { type: 'checkbox', style: { width: 'auto' }, checked: generate, onChange: (e) => setGenerate(e.target.checked) }), t.enrich,
              ),
              h('button', { className: 'llw-btn llw-pri', style: { marginLeft: 'auto' }, disabled: busy || !text.trim(), onClick: doIngest }, t.addBtn),
            ),
          ),
        ) : null,

        tab === 'pages' ? h('div', { className: 'llw-card' },
          h('div', { className: 'llw-row' },
            h('button', { className: 'llw-btn llw-pri', disabled: busy || !vault, onClick: doPages }, t.pageList),
            h('span', { className: 'llw-sm' }, `${pages.length} page(s)`),
          ),
          h('ul', { className: 'llw-list' }, pages.length === 0 ? h('li', { className: 'llw-empty' }, '—') : pages.map((p) =>
            h('li', { key: p.rel, className: 'llw-item' },
              h('span', null, p.title, h('span', { className: 'llw-sm' }, ` · ${p.type} · ${p.rel}`)),
              h('button', { className: 'llw-btn', disabled: busy, onClick: () => doRead(p) }, t.read),
            ),
          )),
        ) : null,

        tab === 'graph' ? h('div', { className: 'llw-card' },
          h('div', { className: 'llw-row' },
            h('button', { className: 'llw-btn llw-pri', disabled: busy || !vault, onClick: doGraph }, t.graph),
            graph ? h('span', { className: 'llw-sm' }, `${graph.nodes.length} nodes · ${graph.edges.length} edges · ${graph.communities} clusters · cohesion ${graph.cohesion}`) : null,
          ),
          graph ? h('div', { className: 'llw-code' },
            'Clusters:\n' + graph.nodes.map((n) => `  #${n.community}  ${n.label} [${n.type}] degree ${n.degree}`).join('\n') +
            '\n\nConnections:\n' + graph.edges.map((e) => `  ${e.a}  <->  ${e.b}  (${e.weight.toFixed(1)}, ${Object.keys(e.signals).join('+')})`).join('\n') +
            (graph.insights.gaps.length ? '\n\nGaps:\n  - ' + graph.insights.gaps.join('\n  - ') : ''),
          ) : null,
        ) : null,

        tab === 'ask' ? h('div', { className: 'llw-card' },
          h('label', { className: 'llw-lbl' }, t.question),
          h('textarea', { value: question, onChange: (e) => setQuestion(e.target.value), placeholder: 'What do you want to know from this wiki?', style: { minHeight: 56 } }),
          h('div', { className: 'llw-row', style: { marginTop: 10 } },
            h('label', { className: 'llw-sm', style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              h('input', { type: 'checkbox', style: { width: 'auto' }, checked: useFusion, onChange: (e) => setUseFusion(e.target.checked) }), t.fusedAsk,
            ),
            h('button', { className: 'llw-btn llw-pri', style: { marginLeft: 'auto' }, disabled: busy || !vault || !question.trim(), onClick: doAsk }, t.askBtn),
          ),
          result ? h('div', { className: 'llw-code', style: { marginTop: 12 } }, result) : null,
        ) : null,

        tab === 'review' ? h('div', { className: 'llw-card' },
          h('button', { className: 'llw-btn llw-pri', disabled: busy || !vault, onClick: doReview }, t.reviewBtn),
          result ? h('div', { className: 'llw-code', style: { marginTop: 12 } }, result) : null,
        ) : null,

        tab === 'maintain' ? h('div', { className: 'llw-card' },
          !vault ? h('div', { className: 'llw-empty' }, t.noVault) : h('div', null,
            h('div', { className: 'llw-row' },
              h('button', { className: 'llw-btn llw-pri', disabled: busy, onClick: doStale }, t.staleBtn),
              h('button', { className: 'llw-btn', disabled: busy, onClick: doHygiene }, t.hygieneBtn),
            ),
            h('div', { className: 'llw-row' },
              h('button', { className: 'llw-btn', disabled: busy, onClick: doDigest }, t.digestBtn),
              h('button', { className: 'llw-btn', disabled: busy, onClick: doPlan }, t.planBtn),
            ),
            h('div', { className: 'llw-row', style: { marginTop: 4 } },
              h('input', { className: 'llw-grow', value: hintNote, onChange: (e) => setHintNote(e.target.value), placeholder: lang === 'zh' ? '这次值得沉淀的线索（可选）' : 'Note worth keeping (optional)' }),
              h('button', { className: 'llw-btn', disabled: busy, onClick: doHint }, t.hintBtn),
            ),
            result ? h('div', { className: 'llw-code', style: { marginTop: 12 } }, result) : null,
          ),
        ) : null,
      );
    }

    try {
      return {
        inject: ['slots'],
        apply(ctx) {
          injectStyle();
          ctx.slots.inject('main', () =>
            ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(App)),
          );
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: 60, label: () => 'LLM Wiki' },
              (props) => h('div', { style: { fontSize: 18, lineHeight: 1 } }, '\u{1F4DA}'),
            ),
          );
        },
      };
    } catch (_) {
      return { inject: [], apply() {} };
    }
  },
});
